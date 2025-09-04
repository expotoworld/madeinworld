package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/expomadeinworld/madeinworld/auth-service/internal/api"
	"github.com/expomadeinworld/madeinworld/auth-service/internal/db"
	"github.com/expomadeinworld/madeinworld/auth-service/internal/logging"
	"github.com/expomadeinworld/madeinworld/auth-service/internal/services"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

func main() {
	// Load environment variables from .env file if it exists
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using environment variables")
	}

	// Ensure all log output goes to stdout so App Runner captures it in Application Logs
	log.SetOutput(os.Stdout)

	log.Printf("Auth Service starting (GIT_SHA=%s BUILD_TIME=%s)", os.Getenv("GIT_SHA"), os.Getenv("BUILD_TIME"))

	// Initialize database connection (non-fatal; allow process to start for /live)
	database, err := db.NewDatabase()
	if err != nil {
		log.Printf("[WARN] Database initialization failed at startup: %v", err)
	}
	if database != nil {
		defer database.Close()
	}

	// Initialize user verification schema (best effort)
	if database != nil {
		if err := database.InitUserSchema(context.Background()); err != nil {
			log.Printf("[WARN] Failed to initialize user schema: %v", err)
		}
	}

	// Initialize handlers (DB may be nil; /ready will report accordingly)
	handler := api.NewHandler(database)

	// Initialize cleanup service (runs every 30 minutes) only if DB is available
	if database != nil {
		cleanupService := services.NewCleanupService(database, 30)
		cleanupService.Start()
		defer cleanupService.Stop()
	} else {
		log.Println("[WARN] Skipping cleanup service start; database unavailable at startup")
	}

	// Set up Gin router
	router := setupRouter(handler)

	// Get port from environment or use default
	port := os.Getenv("AUTH_PORT")
	if port == "" {
		port = "8081" // Different port from catalog service
	}

	// Set up graceful shutdown
	go func() {
		log.Printf("Starting auth service on port %s", port)
		if err := router.Run(":" + port); err != nil {
			log.Fatalf("Failed to start server: %v", err)
		}
	}()

	// Wait for interrupt signal to gracefully shutdown the server
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down auth service...")
}

func setupRouter(handler *api.Handler) *gin.Engine {
	// Set Gin mode based on environment
	if os.Getenv("GIN_MODE") == "" {
		gin.SetMode(gin.ReleaseMode)
	}

	router := gin.New()

	// Add middleware
	router.Use(logging.JSONLogger())
	router.Use(gin.Recovery())
	router.Use(corsMiddleware())

	// Liveness and readiness endpoints
	// /live returns 200 if the process is running (no DB checks)
	router.GET("/live", func(c *gin.Context) { c.Status(200) })
	// /ready performs DB checks (what /health used to do)
	router.GET("/ready", handler.Health)
	// Keep /health for App Runner legacy health checks, but make it liveness-only
	router.GET("/health", func(c *gin.Context) { c.Status(200) })

	// API routes
	auth := router.Group("/api/auth")
	{
		// Legacy password-based authentication (will be deprecated)
		auth.POST("/signup", handler.Signup)
		auth.POST("/login", handler.Login)

		// New passwordless authentication for users
		auth.POST("/send-verification", handler.UserSendVerification)
		auth.POST("/verify-code", handler.UserVerifyCode)

		// Token refresh
		auth.POST("/refresh", handler.Refresh)

		// Admin email verification routes (separate endpoints)
		auth.POST("/admin/send-verification", handler.AdminSendVerification)
		auth.POST("/admin/verify-code", handler.AdminVerifyCode)
	}

	// Protected routes for testing JWT validation
	protected := router.Group("/api/protected")
	protected.Use(api.AuthMiddleware())
	{
		protected.GET("/profile", handler.GetProfile)
	}

	// Root endpoint for basic info
	router.GET("/", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"service": "auth-service",
			"version": "1.0.0",
			"status":  "running",
		})
	})

	return router
}

// corsMiddleware adds CORS headers to allow cross-origin requests
func corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Origin, Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	}
}
