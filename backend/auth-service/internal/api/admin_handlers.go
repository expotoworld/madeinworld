package api

import (
	"context"
	"crypto/rand"
	"fmt"
	"math/big"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/expomadeinworld/madeinworld/auth-service/internal/models"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"
)

// AdminSendVerification handles sending verification codes for admin login
func (h *Handler) AdminSendVerification(c *gin.Context) {
	var req models.SendVerificationRequest

	// Bind and validate request
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "Invalid request data",
			Message: err.Error(),
		})
		return
	}

	// Validate email belongs to eligible admin-panel user (role + active status)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	userID, role, status, err := h.DB.GetUserRoleStatusByEmail(ctx, req.Email)
	if err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusForbidden, models.ErrorResponse{Error: "Unauthorized email", Message: "This email is not authorized for admin access"})
			return
		}
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "User lookup failed", Message: err.Error()})
		return
	}
	allowed := map[string]bool{"Admin": true, "Manufacturer": true, "3PL": true, "Partner": true}
	if !allowed[role] {
		c.JSON(http.StatusForbidden, models.ErrorResponse{Error: "Access denied", Message: "Role not permitted for admin panel"})
		return
	}
	if strings.ToLower(status) != "active" {
		c.JSON(http.StatusForbidden, models.ErrorResponse{Error: "Account deactivated", Message: "This account is not active"})
		return
	}
	_ = userID // reserved for future use

	// Get client IP
	clientIP := getClientIP(c)
	userAgent := c.GetHeader("User-Agent")

	// Security logging
	fmt.Printf("[ADMIN_AUTH] Verification request from IP: %s, Email: %s, UserAgent: %s\n",
		clientIP, req.Email, userAgent)

	ctx, cancel = context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Check rate limiting
	maxRequests := getEnvInt("RATE_LIMIT_REQUESTS_PER_HOUR", 5)
	rateLimited, err := h.DB.CheckRateLimit(ctx, clientIP, maxRequests, 1)
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
	if cleanErr := h.DB.CleanupExpiredCodes(ctx); cleanErr != nil {
		fmt.Printf("[ADMIN_AUTH] Cleanup before code creation failed: %v\n", cleanErr)
	}

	// Store verification code in database
	verificationCode, err := h.DB.CreateVerificationCode(ctx, req.Email, string(codeHash), clientIP, expiresAt)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "Failed to store verification code",
			Message: err.Error(),
		})
		return
	}

	// Increment rate limit
	if err := h.DB.IncrementRateLimit(ctx, clientIP); err != nil {
		// Log error but don't fail the request
		fmt.Printf("Failed to increment rate limit: %v\n", err)
	}

	// Send email
	if h.Email == nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Email service unavailable", Message: "Email service not configured"})
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

	if err := emailService.SendVerificationCode(req.Email, emailData); err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "Failed to send verification email",
			Message: err.Error(),
		})
		return
	}

	// Security logging - success
	fmt.Printf("[ADMIN_AUTH] Verification code sent successfully to %s from IP: %s\n",
		req.Email, clientIP)

	// Opportunistic cleanup after successful send (best effort)
	if cleanErr := h.DB.CleanupExpiredCodes(ctx); cleanErr != nil {
		fmt.Printf("[ADMIN_AUTH] Cleanup after code send failed: %v\n", cleanErr)
	}

	// Return success response
	c.JSON(http.StatusOK, models.SendVerificationResponse{
		Message:   "Verification code sent successfully",
		ExpiresAt: verificationCode.ExpiresAt,
	})
}

// AdminVerifyCode handles verification code validation and JWT generation
func (h *Handler) AdminVerifyCode(c *gin.Context) {
	var req models.VerifyCodeRequest

	// Bind and validate request
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "Invalid request data",
			Message: err.Error(),
		})
		return
	}

	// Validate email belongs to eligible admin-panel user (role + active status)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	userID, role, status, err := h.DB.GetUserRoleStatusByEmail(ctx, req.Email)
	if err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusForbidden, models.ErrorResponse{Error: "Unauthorized email", Message: "This email is not authorized for admin access"})
			return
		}
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "User lookup failed", Message: err.Error()})
		return
	}
	allowed := map[string]bool{"Admin": true, "Manufacturer": true, "3PL": true, "Partner": true}
	if !allowed[role] {
		c.JSON(http.StatusForbidden, models.ErrorResponse{Error: "Access denied", Message: "Role not permitted for admin panel"})
		return
	}
	if strings.ToLower(status) != "active" {
		c.JSON(http.StatusForbidden, models.ErrorResponse{Error: "Account deactivated", Message: "This account is not active"})
		return
	}

	// Get client IP for security logging
	clientIP := getClientIP(c)
	userAgent := c.GetHeader("User-Agent")

	// Security logging
	fmt.Printf("[ADMIN_AUTH] Code verification attempt from IP: %s, Email: %s, UserAgent: %s\n",
		clientIP, req.Email, userAgent)

	ctx, cancel = context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Get verification code from database
	verificationCode, err := h.DB.GetVerificationCode(ctx, req.Email)
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
		if updateErr := h.DB.UpdateVerificationCodeAttempts(ctx, verificationCode.ID); updateErr != nil {
			fmt.Printf("Failed to update attempt count: %v\n", updateErr)
		}

		// Security logging - failed attempt
		fmt.Printf("[ADMIN_AUTH] FAILED verification attempt from IP: %s, Email: %s, Attempts: %d\n",
			clientIP, req.Email, verificationCode.Attempts+1)

		c.JSON(http.StatusUnauthorized, models.ErrorResponse{
			Error:   "Invalid verification code",
			Message: "The provided code is incorrect",
		})
		return
	}

	// Mark code as used
	if err := h.DB.MarkVerificationCodeUsed(ctx, verificationCode.ID); err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "Failed to mark code as used",
			Message: err.Error(),
		})
		return
	}

	// Update last login timestamp for the user
	if err := h.DB.UpdateLastLogin(ctx, userID); err != nil {
		fmt.Printf("Failed to update last login for user %s: %v\n", userID, err)
	}

	// Generate JWT token for admin with role claim
	token, err := h.generateJWTToken(userID, req.Email, role)
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

	// Generate and persist refresh token (role-agnostic)
	plainRefresh, err := generateRefreshTokenString(32)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to generate refresh token", Message: err.Error()})
		return
	}
	refreshHash := hashRefreshTokenString(plainRefresh)
	refreshExpiresAt := time.Now().Add(refreshTokenTTL())
	if _, err := h.DB.CreateRefreshToken(ctx, userID, refreshHash, refreshExpiresAt, clientIP, userAgent); err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to persist refresh token", Message: err.Error()})
		return
	}

	// Create admin user response
	adminUser := models.AdminUser{
		Email:     req.Email,
		Role:      role,
		CreatedAt: time.Now(),
	}

	// Security logging - successful authentication
	fmt.Printf("[ADMIN_AUTH] SUCCESSFUL authentication for %s from IP: %s, Token expires: %s\n",
		req.Email, clientIP, tokenExpiresAt.Format("2006-01-02 15:04:05"))

	// Return success response (include refresh token fields)
	c.JSON(http.StatusOK, gin.H{
		"token":              token,
		"expires_at":         tokenExpiresAt,
		"expiresAt":          tokenExpiresAt,
		"refresh_token":      plainRefresh,
		"refresh_expires_at": refreshExpiresAt,
		"user":               adminUser,
	})
}

// Helper functions

// generateVerificationCode generates a 6-digit verification code
func generateVerificationCode() (string, error) {
	code := ""
	for i := 0; i < 6; i++ {
		digit, err := rand.Int(rand.Reader, big.NewInt(10))
		if err != nil {
			return "", err
		}
		code += digit.String()
	}
	return code, nil
}

// getClientIP extracts the client IP address from the request
func getClientIP(c *gin.Context) string {
	// Check X-Forwarded-For header first
	if xff := c.GetHeader("X-Forwarded-For"); xff != "" {
		ips := strings.Split(xff, ",")
		return strings.TrimSpace(ips[0])
	}

	// Check X-Real-IP header
	if xri := c.GetHeader("X-Real-IP"); xri != "" {
		return xri
	}

	// Fall back to RemoteAddr
	return c.ClientIP()
}

// getEnvInt gets an environment variable as integer with default value
func getEnvInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if intValue, err := strconv.Atoi(value); err == nil {
			return intValue
		}
	}
	return defaultValue
}
