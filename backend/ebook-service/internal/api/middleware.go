package api

import (
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

// JWTOptionalMiddleware parses JWT if present but does not enforce it
func JWTOptionalMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		secret := os.Getenv("JWT_SECRET")
		auth := c.GetHeader("Authorization")
		if len(auth) > 7 && auth[:7] == "Bearer " && secret != "" {
			tokStr := auth[7:]
			if token, err := jwt.Parse(tokStr, func(token *jwt.Token) (interface{}, error) {
				return []byte(secret), nil
			}); err == nil && token != nil && token.Valid {
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
				}
			}
		}
		c.Next()
	}
}

// JWTMiddleware requires a valid JWT
func JWTMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		secret := os.Getenv("JWT_SECRET")
		auth := c.GetHeader("Authorization")
		if secret == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "missing or invalid token", "detail": "server JWT secret not configured"})
			c.Abort()
			return
		}
		if len(auth) <= 7 || auth[:7] != "Bearer " {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "missing or invalid token", "detail": "authorization header missing or malformed"})
			c.Abort()
			return
		}
		// Debug: log presence and short prefix of token (dev only)
		if len(auth) > 20 {
			log.Printf("[JWT] Authorization header present, token prefix: %s...", auth[7:27])
		}
		tokStr := auth[7:]
		token, err := jwt.Parse(tokStr, func(token *jwt.Token) (interface{}, error) {
			// Accept only HMAC-signed tokens
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, jwt.ErrSignatureInvalid
			}
			return []byte(secret), nil
		})
		if err != nil || token == nil || !token.Valid {
			msg := "invalid token"
			if err != nil {
				msg = err.Error()
			}
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token", "detail": msg})
			c.Abort()
			return
		}
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
		}
		c.Next()
	}
}

// RequireJWT ensures a token was parsed by JWTOptionalMiddleware and is present
func RequireJWT() gin.HandlerFunc {
	return func(c *gin.Context) {
		if _, ok := c.Get("user_id"); !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
			c.Abort()
			return
		}
		c.Next()
	}
}

// RequireAuthor ensures role=Author (case-insensitive)
func RequireAuthor() gin.HandlerFunc {
	return func(c *gin.Context) {
		v, ok := c.Get("role")
		if !ok {
			c.JSON(http.StatusForbidden, gin.H{"error": "author role required"})
			c.Abort()
			return
		}
		roleStr, _ := v.(string)
		if !strings.EqualFold(roleStr, "Author") {
			c.JSON(http.StatusForbidden, gin.H{"error": "author role required"})
			c.Abort()
			return
		}
		c.Next()
	}
}
