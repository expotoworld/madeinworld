package api

import (
	"context"
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

	// Get token expiration time (default 24 hours)
	expirationHours := 24
	if expStr := os.Getenv("JWT_EXPIRATION_HOURS"); expStr != "" {
		if exp, err := strconv.Atoi(expStr); err == nil {
			expirationHours = exp
		}
	}

	// Create claims
	claims := jwt.MapClaims{
		"user_id": userID,
		"email":   email,
		"exp":     time.Now().Add(time.Hour * time.Duration(expirationHours)).Unix(),
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

	// Check if user exists, if not auto-register
	user, err := h.DB.GetUserByEmail(ctx, req.Email)
	if err != nil {
		if err == pgx.ErrNoRows {
			// Auto-register new user
			user, err = h.DB.CreateUserFromEmail(ctx, req.Email)
			if err != nil {
				c.JSON(http.StatusInternalServerError, models.ErrorResponse{
					Error:   "Failed to create user account",
					Message: err.Error(),
				})
				return
			}
			fmt.Printf("[USER_AUTH] Auto-registered new user: %s\n", req.Email)
		} else {
			c.JSON(http.StatusInternalServerError, models.ErrorResponse{
				Error:   "Failed to retrieve user",
				Message: err.Error(),
			})
			return
		}
	}

	// Update last login timestamp
	if err := h.DB.UpdateLastLogin(ctx, user.ID); err != nil {
		// Log the error but don't fail the login
		fmt.Printf("Failed to update last login for user %s: %v\n", user.ID, err)
	}

	// Generate JWT token
	emailStr := ""
	if user.Email != nil {
		emailStr = *user.Email
	}
	token, err := h.generateJWTToken(user.ID, emailStr, "")
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "Failed to generate token",
			Message: err.Error(),
		})
		return
	}

	// Calculate token expiration
	expirationHours := getEnvInt("JWT_EXPIRATION_HOURS", 24)
	tokenExpiresAt := time.Now().Add(time.Duration(expirationHours) * time.Hour)

	// Security logging - successful authentication
	fmt.Printf("[USER_AUTH] SUCCESSFUL authentication for %s from IP: %s, Token expires: %s\n",
		req.Email, clientIP, tokenExpiresAt.Format("2006-01-02 15:04:05"))

	// Return success response
	c.JSON(http.StatusOK, models.VerifyUserCodeResponse{
		Token:     token,
		ExpiresAt: tokenExpiresAt,
		User:      *user,
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

	expirationHours := getEnvInt("JWT_EXPIRATION_HOURS", 24)
	tokenExpiresAt := time.Now().Add(time.Duration(expirationHours) * time.Hour)

	fmt.Printf("[USER_AUTH][PHONE] SUCCESSFUL authentication for %s from IP: %s, Token expires: %s\n", phone, clientIP, tokenExpiresAt.Format("2006-01-02 15:04:05"))

	c.JSON(http.StatusOK, models.VerifyUserCodeResponse{
		Token:     token,
		ExpiresAt: tokenExpiresAt,
		User:      *user,
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
