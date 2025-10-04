package api

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/expomadeinworld/madeinworld/auth-service/internal/db"
	"github.com/expomadeinworld/madeinworld/auth-service/internal/models"
	"github.com/expomadeinworld/madeinworld/auth-service/internal/services"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"
)

// Handler holds the database connection and handles HTTP requests
type Handler struct {
	DB    *db.Database
	Email *services.EmailService
	SMS   *services.SmsService
}

// NewHandler creates a new handler instance
func NewHandler(database *db.Database, email *services.EmailService, sms *services.SmsService) *Handler {
	return &Handler{
		DB:    database,
		Email: email,
		SMS:   sms,
	}
}

// Health endpoint for health checks (readiness)

// --- Refresh token helpers ---
func generateRefreshTokenString(n int) (string, error) {
	if n <= 0 {
		n = 32
	}
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

func hashRefreshTokenString(s string) string {
	sum := sha256.Sum256([]byte(s))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

func refreshTokenTTL() time.Duration {
	days := getEnvInt("REFRESH_TOKEN_TTL_DAYS", 30)
	return time.Duration(days) * 24 * time.Hour
}

func (h *Handler) Health(c *gin.Context) {

	// If DB is not initialized yet, report not ready without panicking
	if h.DB == nil {
		c.JSON(http.StatusServiceUnavailable, models.ErrorResponse{
			Error:   "Database not initialized",
			Message: "Service starting up; DB unavailable",
		})
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := h.DB.Health(ctx); err != nil {
		c.JSON(http.StatusServiceUnavailable, models.ErrorResponse{
			Error:   "Database connection failed",
			Message: err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"status":    "healthy",
		"service":   "auth-service",
		"timestamp": time.Now().UTC(),
	})
}

// Signup handles user registration (DEPRECATED - use email verification instead)
func (h *Handler) Signup(c *gin.Context) {
	c.Header("X-Deprecated", "true")
	c.Header("X-Deprecation-Message", "Password-based signup is disabled. Use /api/auth/send-user-verification and /api/auth/verify-user-code instead.")
	c.JSON(http.StatusGone, models.ErrorResponse{
		Error:   "Endpoint deprecated",
		Message: "Password-based signup is disabled. Use email verification endpoints instead.",
	})
}

// Login handles user authentication (DEPRECATED - use email verification instead)
func (h *Handler) Login(c *gin.Context) {
	c.Header("X-Deprecated", "true")
	c.Header("X-Deprecation-Message", "Password-based login is disabled. Use /api/auth/send-user-verification and /api/auth/verify-user-code instead.")
	c.JSON(http.StatusGone, models.ErrorResponse{
		Error:   "Endpoint deprecated",
		Message: "Password-based login is disabled. Use email verification endpoints instead.",
	})
}

// generateJWTToken creates a JWT token for the user
func (h *Handler) generateJWTToken(userID string, email string, role string) (string, error) {
	// Get JWT secret from environment
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		return "", fmt.Errorf("JWT secret not configured")
	}

	// Get access token expiration: default 30 minutes.
	// Prefer JWT_EXPIRATION_MINUTES; fallback to JWT_EXPIRATION_HOURS for backward compatibility.
	expirationMinutes := 30
	if expMinStr := os.Getenv("JWT_EXPIRATION_MINUTES"); expMinStr != "" {
		if exp, err := strconv.Atoi(expMinStr); err == nil {
			expirationMinutes = exp
		}
	} else if expHrStr := os.Getenv("JWT_EXPIRATION_HOURS"); expHrStr != "" {
		if exp, err := strconv.Atoi(expHrStr); err == nil {
			expirationMinutes = exp * 60
		}
	}

	// Create claims
	claims := jwt.MapClaims{
		"user_id": userID,
		"email":   email,
		"exp":     time.Now().Add(time.Minute * time.Duration(expirationMinutes)).Unix(),
		"iat":     time.Now().Unix(),
	}
	if role != "" {
		claims["role"] = role
	}

	// Enrich with org memberships
	if h.DB != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if orgs, err := h.DB.GetOrgMembershipsByUserID(ctx, userID); err == nil {
			arr := make([]map[string]string, 0, len(orgs))
			for _, m := range orgs {
				arr = append(arr, map[string]string{
					"org_id":   m.OrgID,
					"org_type": m.OrgType,
					"org_role": m.OrgRole,
					"name":     m.Name,
				})
			}
			claims["org_memberships"] = arr
		}
	}

	// Create token
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)

	// Sign token
	tokenString, err := token.SignedString([]byte(secret))
	if err != nil {
		return "", err
	}

	return tokenString, nil
}

// Refresh issues a new JWT based on a valid existing token
func (h *Handler) Refresh(c *gin.Context) {
	// Extract Authorization header
	authHeader := c.GetHeader("Authorization")
	if authHeader == "" {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{
			Error:   "Authorization header required",
			Message: "Please provide a valid authorization token",
		})
		return
	}

	parts := strings.Split(authHeader, " ")
	if len(parts) != 2 || parts[0] != "Bearer" {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{
			Error:   "Invalid authorization format",
			Message: "Authorization header must be in format 'Bearer <token>'",
		})
		return
	}
	existingToken := parts[1]

	// Parse existing token
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {

		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "Server not configured",
			Message: "JWT secret missing",
		})
		return
	}

	token, err := jwt.Parse(existingToken, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, jwt.ErrSignatureInvalid
		}
		return []byte(secret), nil
	})
	if err != nil || !token.Valid {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{
			Error:   "Invalid token",
			Message: "The provided token is invalid or expired",
		})
		return
	}

	// Extract claims
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{
			Error:   "Invalid token claims",
			Message: "Could not parse token claims",
		})
		return
	}

	userID, _ := claims["user_id"].(string)
	email, _ := claims["email"].(string)
	roleStr, _ := claims["role"].(string)

	// Generate new token
	newToken, err := h.generateJWTToken(userID, email, roleStr)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "Failed to generate token",
			Message: err.Error(),
		})
		return
	}

	// Calculate new expiration timestamp
	expirationHours := 24
	if expStr := os.Getenv("JWT_EXPIRATION_HOURS"); expStr != "" {
		if exp, err := strconv.Atoi(expStr); err == nil {
			expirationHours = exp
		}
	}
	expiresAt := time.Now().Add(time.Duration(expirationHours) * time.Hour)

	c.JSON(http.StatusOK, gin.H{
		"token":      newToken,
		"expires_at": expiresAt,
		"expiresAt":  expiresAt, // camelCase for Admin Panel compatibility
	})

}

// RefreshWithRefreshToken exchanges a refresh token for a new access token.
// By default it DOES NOT rotate the refresh token unless rotate=true is provided.
type refreshTokenRequest struct {
	RefreshToken string `json:"refresh_token" binding:"required"`
	Rotate       *bool  `json:"rotate,omitempty"`
}

func (h *Handler) RefreshWithRefreshToken(c *gin.Context) {
	var req refreshTokenRequest
	if err := c.ShouldBindJSON(&req); err != nil || strings.TrimSpace(req.RefreshToken) == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Invalid request", Message: "refresh_token is required"})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Validate refresh token
	hash := hashRefreshTokenString(req.RefreshToken)
	id, userID, expiresAt, revoked, err := h.DB.GetRefreshToken(ctx, hash)
	if err != nil || revoked || time.Now().After(expiresAt) {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{Error: "Invalid refresh token", Message: "Token is invalid, expired, or revoked"})
		return
	}

	// Determine rotation behavior (default false)
	rotate := req.Rotate != nil && *req.Rotate

	if rotate {
		// Revoke the specific old token first
		_ = h.DB.RevokeRefreshToken(ctx, id)
		// Also revoke any other active tokens for same user and IP to prevent accumulation
		clientIP := getClientIP(c)
		if h.DB != nil && h.DB.Pool != nil && clientIP != "" {
			_, _ = h.DB.Pool.Exec(ctx, `UPDATE refresh_tokens SET revoked = true WHERE user_id = $1 AND ip_address = $2 AND revoked = false AND id::text <> $3`, userID, clientIP, id)
		}
	}

	// Fetch user email and role for claims (best effort)
	var emailStr string
	var roleStr string
	if h.DB != nil && h.DB.Pool != nil {
		var emailNS, roleNS sql.NullString
		if err := h.DB.Pool.QueryRow(ctx, "SELECT email, role FROM users WHERE id = $1", userID).Scan(&emailNS, &roleNS); err == nil {
			if emailNS.Valid {
				emailStr = emailNS.String
			}
			if roleNS.Valid {
				roleStr = roleNS.String
			}
		}
	}

	// Issue new access token
	token, err := h.generateJWTToken(userID, emailStr, roleStr)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to generate token", Message: err.Error()})
		return
	}
	// Access token expiry (minutes)
	expirationMinutes := getEnvInt("JWT_EXPIRATION_MINUTES", 30)
	if expirationMinutes <= 0 {
		hours := getEnvInt("JWT_EXPIRATION_HOURS", 24)
		expirationMinutes = hours * 60
	}
	accessExpiresAt := time.Now().Add(time.Duration(expirationMinutes) * time.Minute)

	if rotate {
		// Create new refresh token
		plainRefresh, err := generateRefreshTokenString(32)
		if err != nil {
			c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to generate refresh token", Message: err.Error()})
			return
		}
		newHash := hashRefreshTokenString(plainRefresh)
		refreshExpiresAt := time.Now().Add(refreshTokenTTL())
		clientIP := getClientIP(c)
		userAgent := c.GetHeader("User-Agent")
		if _, err := h.DB.CreateRefreshToken(ctx, userID, newHash, refreshExpiresAt, clientIP, userAgent); err != nil {
			c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to persist refresh token", Message: err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"token":              token,
			"expires_at":         accessExpiresAt,
			"refresh_token":      plainRefresh,
			"refresh_expires_at": refreshExpiresAt,
		})
		return
	}

	// No rotation path: only issue a new access token; do not create or return a new refresh token
	c.JSON(http.StatusOK, gin.H{
		"token":      token,
		"expires_at": accessExpiresAt,
	})
}

// isDuplicateEmailError checks if the error is due to duplicate email constraint
func isDuplicateEmailError(err error) bool {
	return strings.Contains(err.Error(), "duplicate key value violates unique constraint") &&
		strings.Contains(err.Error(), "users_email_key")
}

// AuthMiddleware validates JWT tokens
func AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, models.ErrorResponse{
				Error:   "Authorization header required",
				Message: "Please provide a valid authorization token",
			})
			c.Abort()
			return
		}

		// Extract token from "Bearer <token>"
		tokenParts := strings.Split(authHeader, " ")
		if len(tokenParts) != 2 || tokenParts[0] != "Bearer" {
			c.JSON(http.StatusUnauthorized, models.ErrorResponse{
				Error:   "Invalid authorization format",
				Message: "Authorization header must be in format 'Bearer <token>'",
			})
			c.Abort()
			return
		}

		tokenString := tokenParts[1]

		// Parse and validate token
		secret := os.Getenv("JWT_SECRET")
		if secret == "" {
			c.JSON(http.StatusInternalServerError, models.ErrorResponse{
				Error:   "Server not configured",
				Message: "JWT secret missing",
			})
			c.Abort()
			return
		}

		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, jwt.ErrSignatureInvalid
			}
			return []byte(secret), nil
		})

		if err != nil || !token.Valid {
			c.JSON(http.StatusUnauthorized, models.ErrorResponse{
				Error:   "Invalid token",
				Message: "The provided token is invalid or expired",
			})
			c.Abort()
			return
		}

		// Extract claims
		if claims, ok := token.Claims.(jwt.MapClaims); ok {
			c.Set("user_id", claims["user_id"])
			c.Set("email", claims["email"])
		}

		c.Next()
	}
}

// GetProfile returns the authenticated user's profile
func (h *Handler) GetProfile(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{
			Error:   "User not authenticated",
			Message: "Unable to retrieve user information from token",
		})
		return
	}

	email, _ := c.Get("email")

	c.JSON(http.StatusOK, gin.H{
		"user_id": userID,
		"email":   email,
		"message": "Profile retrieved successfully",
	})
}

// UserSendVerification handles sending verification codes for user login/registration
func (h *Handler) UserSendVerification(c *gin.Context) {
	var req models.SendUserVerificationRequest

	// Bind and validate request
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "Invalid request data",
			Message: err.Error(),
		})
		return
	}

	// Get client IP
	clientIP := getClientIP(c)
	userAgent := c.GetHeader("User-Agent")

	// Security logging
	fmt.Printf("[USER_AUTH] Verification request from IP: %s, Email: %s, UserAgent: %s\n",
		clientIP, req.Email, userAgent)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Optional stricter mode for clients like ebook-editor
	requireExisting := strings.EqualFold(c.GetHeader("X-Require-Existing"), "true") || c.Query("require_existing") == "true"
	requiredRole := strings.TrimSpace(c.GetHeader("X-Require-Role"))
	if requireExisting || requiredRole != "" {
		// Must be an existing user (and optionally with specific role)
		if id, role, _, err := h.DB.GetUserRoleStatusByEmail(ctx, req.Email); err != nil {
			if err == pgx.ErrNoRows {
				c.JSON(http.StatusForbidden, models.ErrorResponse{Error: "User not allowed", Message: "User does not exist"})
				return
			}
			c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to validate user", Message: err.Error()})
			return
		} else {
			_ = id // not used here, but ensures retrieval succeeded
			if requiredRole != "" && !strings.EqualFold(role, requiredRole) {
				c.JSON(http.StatusForbidden, models.ErrorResponse{Error: "User not allowed", Message: "User role not permitted"})
				return
			}
		}
	}

	// Check rate limiting
	maxRequests := getEnvInt("RATE_LIMIT_REQUESTS_PER_HOUR", 5)
	rateLimited, err := h.DB.CheckUserRateLimit(ctx, clientIP, maxRequests, 1)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "Rate limit check failed",
			Message: err.Error(),
		})
		return
	}

	if rateLimited {
		c.JSON(http.StatusTooManyRequests, models.ErrorResponse{
			Error:   "Rate limit exceeded",
			Message: fmt.Sprintf("Maximum %d requests per hour allowed", maxRequests),
		})
		return
	}

	// Generate 6-digit verification code
	code, err := generateVerificationCode()
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "Failed to generate verification code",
			Message: err.Error(),
		})
		return
	}

	// Hash the code
	codeHash, err := bcrypt.GenerateFromPassword([]byte(code), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "Failed to process verification code",
			Message: err.Error(),
		})
		return
	}

	// Calculate expiration time
	expirationMinutes := getEnvInt("CODE_EXPIRATION_MINUTES", 10)
	expiresAt := time.Now().Add(time.Duration(expirationMinutes) * time.Minute)

	// Opportunistic cleanup before creating a new code (best effort)
	if cleanErr := h.DB.CleanupExpiredUserCodes(ctx); cleanErr != nil {
		fmt.Printf("[USER_AUTH] Cleanup before user code creation failed: %v\n", cleanErr)
	}

	// Store verification code in database
	verificationCode, err := h.DB.CreateUserVerificationCode(ctx, req.Email, string(codeHash), clientIP, expiresAt)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "Failed to store verification code",
			Message: err.Error(),
		})
		return
	}

	// Increment rate limit (best effort)
	if err := h.DB.IncrementUserRateLimit(ctx, clientIP); err != nil {
		// Log error but don't fail the request
		fmt.Printf("Failed to increment user rate limit: %v\n", err)
	}

	// Send email
	if h.Email == nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "Email service unavailable",
			Message: "Email service not configured",
		})
		return
	}
	emailService := h.Email
	emailData := models.EmailVerificationData{
		Code:         code,
		Email:        req.Email,
		ExpiresAt:    expiresAt,
		IPAddress:    clientIP,
		UserAgent:    c.GetHeader("User-Agent"),
		Timestamp:    time.Now(),
		ExpiresInMin: expirationMinutes,
	}

	if err := emailService.SendUserVerificationCode(req.Email, emailData); err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "Failed to send verification email",
			Message: err.Error(),
		})
		return
	}

	// Security logging - success
	fmt.Printf("[USER_AUTH] Verification code sent successfully to %s from IP: %s\n",
		req.Email, clientIP)

	// Opportunistic cleanup after successful send (best effort)
	if cleanErr := h.DB.CleanupExpiredUserCodes(ctx); cleanErr != nil {
		fmt.Printf("[USER_AUTH] Cleanup after user code send failed: %v\n", cleanErr)
	}

	// Return success response
	c.JSON(http.StatusOK, models.SendUserVerificationResponse{
		Message:   "Verification code sent successfully",
		ExpiresAt: verificationCode.ExpiresAt,
	})
}

// UserVerifyCode handles verification code validation and JWT generation for users
func (h *Handler) UserVerifyCode(c *gin.Context) {
	var req models.VerifyUserCodeRequest

	// Bind and validate request
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "Invalid request data",
			Message: err.Error(),
		})
		return
	}

	// Get client IP for security logging
	clientIP := getClientIP(c)
	userAgent := c.GetHeader("User-Agent")

	// Security logging
	fmt.Printf("[USER_AUTH] Code verification attempt from IP: %s, Email: %s, UserAgent: %s\n",
		clientIP, req.Email, userAgent)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Get verification code from database
	verificationCode, err := h.DB.GetUserVerificationCode(ctx, req.Email)
	if err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusUnauthorized, models.ErrorResponse{
				Error:   "Invalid or expired code",
				Message: "No valid verification code found",
			})
			return
		}

		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "Failed to retrieve verification code",
			Message: err.Error(),
		})
		return
	}

	// Check if code has exceeded maximum attempts
	maxAttempts := getEnvInt("MAX_CODE_ATTEMPTS", 3)
	if verificationCode.Attempts >= maxAttempts {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{
			Error:   "Maximum attempts exceeded",
			Message: fmt.Sprintf("Code has exceeded maximum %d attempts", maxAttempts),
		})
		return
	}

	// Verify the code
	if err := bcrypt.CompareHashAndPassword([]byte(verificationCode.CodeHash), []byte(req.Code)); err != nil {
		// Increment attempt count
		if updateErr := h.DB.UpdateUserVerificationCodeAttempts(ctx, verificationCode.ID); updateErr != nil {
			fmt.Printf("Failed to update user attempt count: %v\n", updateErr)
		}

		// Security logging - failed attempt
		fmt.Printf("[USER_AUTH] FAILED verification attempt from IP: %s, Email: %s, Attempts: %d\n",
			clientIP, req.Email, verificationCode.Attempts+1)

		c.JSON(http.StatusUnauthorized, models.ErrorResponse{
			Error:   "Invalid verification code",
			Message: "The provided code is incorrect",
		})
		return
	}

	// Mark code as used
	if err := h.DB.MarkUserVerificationCodeUsed(ctx, verificationCode.ID); err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "Failed to mark code as used",
			Message: err.Error(),
		})
		return
	}

	// Optional stricter mode for clients like ebook-editor
	requireExisting := strings.EqualFold(c.GetHeader("X-Require-Existing"), "true") || c.Query("require_existing") == "true"
	requiredRole := strings.TrimSpace(c.GetHeader("X-Require-Role"))

	// Retrieve user; conditionally allow auto-registration
	user, err := h.DB.GetUserByEmail(ctx, req.Email)
	if err != nil {
		if err == pgx.ErrNoRows {
			if requireExisting {
				c.JSON(http.StatusForbidden, models.ErrorResponse{Error: "User not allowed", Message: "User does not exist"})
				return
			}
			// Auto-register only when not in strict mode
			user, err = h.DB.CreateUserFromEmail(ctx, req.Email)
			if err != nil {
				c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to create user account", Message: err.Error()})
				return
			}
			fmt.Printf("[USER_AUTH] Auto-registered new user: %s\n", req.Email)
		} else {
			c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to retrieve user", Message: err.Error()})
			return
		}
	}

	// If a specific role is required, enforce it (no token if not matching)
	if requiredRole != "" {
		if id, role, _, err := h.DB.GetUserRoleStatusByEmail(ctx, req.Email); err != nil {
			c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to validate user role", Message: err.Error()})
			return
		} else {
			_ = id
			if !strings.EqualFold(role, requiredRole) {
				c.JSON(http.StatusForbidden, models.ErrorResponse{Error: "User not allowed", Message: "User role not permitted"})
				return
			}
		}
	}

	// Update last login timestamp
	if err := h.DB.UpdateLastLogin(ctx, user.ID); err != nil {
		// Log the error but don't fail the login
		fmt.Printf("Failed to update last login for user %s: %v\n", user.ID, err)
	}

	// Generate JWT token with role claim for downstream authorization (e.g., ebook-service)
	emailStr := ""
	if user.Email != nil {
		emailStr = *user.Email
	}
	roleClaim := ""
	if id, role, _, err := h.DB.GetUserRoleStatusByEmail(ctx, req.Email); err == nil {
		_ = id
		roleClaim = role
	}
	token, err := h.generateJWTToken(user.ID, emailStr, roleClaim)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "Failed to generate token",
			Message: err.Error(),
		})
		return
	}

	// Calculate token expiration (minutes preferred)
	expirationMinutes := getEnvInt("JWT_EXPIRATION_MINUTES", 30)
	if expirationMinutes <= 0 {
		hours := getEnvInt("JWT_EXPIRATION_HOURS", 24)
		expirationMinutes = hours * 60
	}
	tokenExpiresAt := time.Now().Add(time.Duration(expirationMinutes) * time.Minute)

	// Generate and persist refresh token
	plainRefresh, err := generateRefreshTokenString(32)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to generate refresh token", Message: err.Error()})
		return
	}
	refreshHash := hashRefreshTokenString(plainRefresh)
	refreshExpiresAt := time.Now().Add(refreshTokenTTL())
	if _, err := h.DB.CreateRefreshToken(ctx, user.ID, refreshHash, refreshExpiresAt, clientIP, userAgent); err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to persist refresh token", Message: err.Error()})
		return
	}

	// Security logging - successful authentication
	fmt.Printf("[USER_AUTH] SUCCESSFUL authentication for %s from IP: %s, Token expires: %s\n",
		req.Email, clientIP, tokenExpiresAt.Format("2006-01-02 15:04:05"))

	// Return success response with role included in user payload
	respUser := gin.H{
		"id":          user.ID,
		"username":    user.Username,
		"email":       user.Email,
		"phone":       user.Phone,
		"first_name":  user.FirstName,
		"middle_name": user.MiddleName,
		"last_name":   user.LastName,
		"created_at":  user.CreatedAt,
		"updated_at":  user.UpdatedAt,
		"role":        roleClaim,
	}
	c.JSON(http.StatusOK, gin.H{
		"token":              token,
		"expires_at":         tokenExpiresAt,
		"expiresAt":          tokenExpiresAt, // keep camelCase for consistency elsewhere
		"refresh_token":      plainRefresh,
		"refresh_expires_at": refreshExpiresAt,
		"user":               respUser,
	})
}

// UserSendPhoneVerification handles sending verification codes via SMS for user login/registration
func (h *Handler) UserSendPhoneVerification(c *gin.Context) {
	var req models.SendPhoneVerificationRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "Invalid request data",
			Message: err.Error(),
		})
		return
	}

	phone := strings.TrimSpace(req.Phone)
	if !isValidE164(phone) {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "Invalid phone format",
			Message: "Phone number must be in E.164 format, e.g., +12065550100",
		})
		return
	}
	if h.SMS == nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "SMS service unavailable",
			Message: "SMS service not configured",
		})
		return
	}

	clientIP := getClientIP(c)
	userAgent := c.GetHeader("User-Agent")
	fmt.Printf("[USER_AUTH][PHONE] Verification request from IP: %s, Phone: %s, UserAgent: %s\n", clientIP, phone, userAgent)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	maxRequests := getEnvInt("RATE_LIMIT_REQUESTS_PER_HOUR", 5)
	rateLimited, err := h.DB.CheckUserRateLimit(ctx, clientIP, maxRequests, 1)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Rate limit check failed", Message: err.Error()})
		return
	}
	if rateLimited {
		c.JSON(http.StatusTooManyRequests, models.ErrorResponse{
			Error:   "Rate limit exceeded",
			Message: fmt.Sprintf("Maximum %d requests per hour allowed", maxRequests),
		})
		return
	}

	code, err := generateVerificationCode()
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to generate verification code", Message: err.Error()})
		return
	}
	codeHash, err := bcrypt.GenerateFromPassword([]byte(code), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to process verification code", Message: err.Error()})
		return
	}

	expirationMinutes := getEnvInt("CODE_EXPIRATION_MINUTES", 10)
	expiresAt := time.Now().Add(time.Duration(expirationMinutes) * time.Minute)

	if cleanErr := h.DB.CleanupExpiredPhoneCodes(ctx); cleanErr != nil {
		fmt.Printf("[USER_AUTH][PHONE] Cleanup before phone code creation failed: %v\n", cleanErr)
	}

	verificationCode, err := h.DB.CreateUserPhoneVerificationCode(ctx, phone, string(codeHash), clientIP, expiresAt)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to store verification code", Message: err.Error()})
		return
	}

	if err := h.DB.IncrementUserRateLimit(ctx, clientIP); err != nil {
		fmt.Printf("Failed to increment user rate limit: %v\n", err)
	}

	message := fmt.Sprintf("Your Made in World verification code is: %s. This code expires in %d minutes. If you didn't request this, please ignore.", code, expirationMinutes)
	if err := h.SMS.SendSMS(ctx, phone, message); err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to send SMS", Message: err.Error()})
		return
	}

	fmt.Printf("[USER_AUTH][PHONE] Verification code sent successfully to %s from IP: %s\n", phone, clientIP)

	if cleanErr := h.DB.CleanupExpiredPhoneCodes(ctx); cleanErr != nil {
		fmt.Printf("[USER_AUTH][PHONE] Cleanup after phone code send failed: %v\n", cleanErr)
	}

	c.JSON(http.StatusOK, models.SendUserVerificationResponse{
		Message:   "Verification code sent successfully",
		ExpiresAt: verificationCode.ExpiresAt,
	})
}

// UserVerifyPhoneCode handles phone verification code validation and JWT generation for users
func (h *Handler) UserVerifyPhoneCode(c *gin.Context) {
	var req models.VerifyPhoneCodeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Invalid request data", Message: err.Error()})
		return
	}

	phone := strings.TrimSpace(req.Phone)
	if !isValidE164(phone) {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Invalid phone format", Message: "Phone number must be in E.164 format"})
		return
	}

	clientIP := getClientIP(c)
	userAgent := c.GetHeader("User-Agent")
	fmt.Printf("[USER_AUTH][PHONE] Code verification attempt from IP: %s, Phone: %s, UserAgent: %s\n", clientIP, phone, userAgent)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	verificationCode, err := h.DB.GetUserPhoneVerificationCode(ctx, phone)
	if err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusUnauthorized, models.ErrorResponse{Error: "Invalid or expired code", Message: "No valid verification code found"})
			return
		}
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to retrieve verification code", Message: err.Error()})
		return
	}

	maxAttempts := getEnvInt("MAX_CODE_ATTEMPTS", 3)
	if verificationCode.Attempts >= maxAttempts {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{Error: "Maximum attempts exceeded", Message: fmt.Sprintf("Code has exceeded maximum %d attempts", maxAttempts)})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(verificationCode.CodeHash), []byte(req.Code)); err != nil {
		if updateErr := h.DB.UpdateUserPhoneVerificationCodeAttempts(ctx, verificationCode.ID); updateErr != nil {
			fmt.Printf("Failed to update user phone attempt count: %v\n", updateErr)
		}
		fmt.Printf("[USER_AUTH][PHONE] FAILED verification attempt from IP: %s, Phone: %s, Attempts: %d\n", clientIP, phone, verificationCode.Attempts+1)
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{Error: "Invalid verification code", Message: "The provided code is incorrect"})
		return
	}

	if err := h.DB.MarkUserPhoneVerificationCodeUsed(ctx, verificationCode.ID); err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to mark code as used", Message: err.Error()})
		return
	}

	user, err := h.DB.GetUserByPhone(ctx, phone)
	if err != nil {
		if err == pgx.ErrNoRows {
			user, err = h.DB.CreateUserFromPhone(ctx, phone)
			if err != nil {
				c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to create user account", Message: err.Error()})
				return
			}
			fmt.Printf("[USER_AUTH][PHONE] Auto-registered new user: %s\n", phone)
		} else {
			c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to retrieve user", Message: err.Error()})
			return
		}
	}

	if err := h.DB.UpdateLastLogin(ctx, user.ID); err != nil {
		fmt.Printf("Failed to update last login for user %s: %v\n", user.ID, err)
	}

	emailStr := ""
	if user.Email != nil {
		emailStr = *user.Email
	}
	token, err := h.generateJWTToken(user.ID, emailStr, "")
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to generate token", Message: err.Error()})
		return
	}

	// Calculate token expiration (minutes preferred)
	expirationMinutes := getEnvInt("JWT_EXPIRATION_MINUTES", 30)
	if expirationMinutes <= 0 {
		hours := getEnvInt("JWT_EXPIRATION_HOURS", 24)
		expirationMinutes = hours * 60
	}
	tokenExpiresAt := time.Now().Add(time.Duration(expirationMinutes) * time.Minute)

	// Generate and persist refresh token
	plainRefresh, err := generateRefreshTokenString(32)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to generate refresh token", Message: err.Error()})
		return
	}
	refreshHash := hashRefreshTokenString(plainRefresh)
	refreshExpiresAt := time.Now().Add(refreshTokenTTL())
	if _, err := h.DB.CreateRefreshToken(ctx, user.ID, refreshHash, refreshExpiresAt, clientIP, userAgent); err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to persist refresh token", Message: err.Error()})
		return
	}

	fmt.Printf("[USER_AUTH][PHONE] SUCCESSFUL authentication for %s from IP: %s, Token expires: %s\n", phone, clientIP, tokenExpiresAt.Format("2006-01-02 15:04:05"))

	c.JSON(http.StatusOK, models.VerifyUserCodeResponse{
		Token:            token,
		ExpiresAt:        tokenExpiresAt,
		RefreshToken:     plainRefresh,
		RefreshExpiresAt: refreshExpiresAt,
		User:             *user,
	})
}

// isValidE164 validates E.164 phone numbers like +12065550100
func isValidE164(phone string) bool {
	if len(phone) < 2 || len(phone) > 16 {
		return false
	}
	if phone[0] != '+' {
		return false
	}
	for i := 1; i < len(phone); i++ {
		if phone[i] < '0' || phone[i] > '9' {
			return false
		}
	}
	return true
}
