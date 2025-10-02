package api

import (
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

// JWTOptionalMiddleware parses JWT if present but does not enforce it
func JWTOptionalMiddleware() gin.HandlerFunc {
	secret := os.Getenv("JWT_SECRET")
	return func(c *gin.Context) {
		auth := c.GetHeader("Authorization")
		if len(auth) > 7 && auth[:7] == "Bearer " && secret != "" {
			tokStr := auth[7:]
			if token, err := jwt.Parse(tokStr, func(token *jwt.Token) (interface{}, error) {
				return []byte(secret), nil
			}); err == nil && token != nil && token.Valid {
				if claims, ok := token.Claims.(jwt.MapClaims); ok {
					if v, ok := claims["user_id"]; ok { c.Set("user_id", v) }
					if v, ok := claims["email"]; ok { c.Set("email", v) }
					if v, ok := claims["role"].(string); ok { c.Set("role", v) }
				}
			}
		}
		c.Next()
	}
}

// JWTMiddleware requires a valid JWT
func JWTMiddleware() gin.HandlerFunc {
	secret := os.Getenv("JWT_SECRET")
	return func(c *gin.Context) {
		auth := c.GetHeader("Authorization")
		if len(auth) <= 7 || auth[:7] != "Bearer " || secret == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "missing or invalid token"})
			c.Abort(); return
		}
		tokStr := auth[7:]
		token, err := jwt.Parse(tokStr, func(token *jwt.Token) (interface{}, error) {
			return []byte(secret), nil
		})
		if err != nil || token == nil || !token.Valid {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
			c.Abort(); return
		}
		if claims, ok := token.Claims.(jwt.MapClaims); ok {
			if v, ok := claims["user_id"]; ok { c.Set("user_id", v) }
			if v, ok := claims["email"]; ok { c.Set("email", v) }
			if v, ok := claims["role"].(string); ok { c.Set("role", v) }
		}
		c.Next()
	}
}

// RequireJWT ensures a token was parsed by JWTOptionalMiddleware and is present
func RequireJWT() gin.HandlerFunc {
	return func(c *gin.Context) {
		if _, ok := c.Get("user_id"); !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
			c.Abort(); return
		}
		c.Next()
	}
}

// RequireAuthor ensures role=Author
func RequireAuthor() gin.HandlerFunc {
	return func(c *gin.Context) {
		if v, ok := c.Get("role"); !ok || v.(string) != "Author" {
			c.JSON(http.StatusForbidden, gin.H{"error": "author role required"})
			c.Abort(); return
		}
		c.Next()
	}
}

