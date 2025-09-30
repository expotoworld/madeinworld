package api

import (
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

// OptionalAuthMiddleware parses JWT if present and sets claims into context.
// It never rejects the request; use AdminMiddleware on protected routes.
func OptionalAuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.Next()
			return
		}

		tokenParts := strings.Split(authHeader, " ")
		if len(tokenParts) != 2 || tokenParts[0] != "Bearer" {
			// ignore malformed header in optional mode
			c.Next()
			return
		}

		tokenString := tokenParts[1]
		secret := os.Getenv("JWT_SECRET")
		if secret == "" {
			c.Next()
			return
		}

		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, jwt.ErrSignatureInvalid
			}
			return []byte(secret), nil
		})
		if err == nil && token != nil && token.Valid {
			if claims, ok := token.Claims.(jwt.MapClaims); ok {
				if v, ok := claims["user_id"]; ok {
					c.Set("user_id", v)
				}
				if v, ok := claims["email"]; ok {
					c.Set("email", v)
				}
				if v, ok := claims["role"].(string); ok {
					c.Set("role", v)
				}
				if v, ok := claims["org_memberships"]; ok {
					c.Set("org_memberships", v)
				}
			}
		}
		c.Next()
	}
}

// AuthMiddleware enforces a valid JWT
func AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			log.Printf("[AuthMiddleware] missing Authorization header")
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Authorization header required"})
			c.Abort()
			return
		}
		tokenParts := strings.Split(authHeader, " ")
		if len(tokenParts) != 2 || tokenParts[0] != "Bearer" {
			log.Printf("[AuthMiddleware] invalid auth format: %s", authHeader)
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid authorization format"})
			c.Abort()
			return
		}
		secret := os.Getenv("JWT_SECRET")
		if secret == "" {
			log.Printf("[AuthMiddleware] JWT_SECRET not set")
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Server not configured"})
			c.Abort()
			return
		}
		token, err := jwt.Parse(tokenParts[1], func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, jwt.ErrSignatureInvalid
			}
			return []byte(secret), nil
		})
		if err != nil || !token.Valid {
			log.Printf("[AuthMiddleware] token invalid: %v", err)
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token"})
			c.Abort()
			return
		}
		if claims, ok := token.Claims.(jwt.MapClaims); ok {
			c.Set("user_id", claims["user_id"])
			c.Set("email", claims["email"])
			if r, ok := claims["role"].(string); ok {
				c.Set("role", r)
			}
		}
		c.Next()
	}
}

// AdminMiddleware requires strict Admin role for write operations
func AdminMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		roleVal, exists := c.Get("role")
		role, _ := roleVal.(string)
		if !exists || role != "Admin" {
			c.JSON(http.StatusForbidden, gin.H{"error": "Admin access required"})
			c.Abort()
			return
		}
		c.Next()
	}
}

// IsAdmin returns true if current context has Admin role
func IsAdmin(c *gin.Context) bool {
	roleVal, exists := c.Get("role")
	if !exists {
		return false
	}
	role, _ := roleVal.(string)
	return role == "Admin"
}
