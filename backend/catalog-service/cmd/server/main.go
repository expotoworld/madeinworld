package main

import (
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/expomadeinworld/madeinworld/catalog-service/internal/api"
	"github.com/expomadeinworld/madeinworld/catalog-service/internal/db"
	"github.com/expomadeinworld/madeinworld/catalog-service/internal/logging"
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

	log.Printf("Catalog Service starting (GIT_SHA=%s BUILD_TIME=%s)", os.Getenv("GIT_SHA"), os.Getenv("BUILD_TIME"))

	// Initialize database connection (non-fatal; allow process to start for /live)
	database, err := db.NewDatabase()
	if err != nil {
		log.Printf("[WARN] Database initialization failed at startup: %v", err)
	}
	if database != nil {
		defer database.Close()
	}

	// Initialize handlers
	handler := api.NewHandler(database)

	// Set up Gin router
	router := setupRouter(handler)

	// Get port from environment or use default
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	// Set up graceful shutdown
	go func() {
		log.Printf("Starting server on port %s", port)
		if err := router.Run(":" + port); err != nil {
			log.Fatalf("Failed to start server: %v", err)
		}
	}()

	// Wait for interrupt signal to gracefully shutdown the server
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down server...")
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

	// Serve uploaded files for local development
	router.Static("/uploads", "./uploads")

	// Health and readiness endpoints
	router.GET("/live", func(c *gin.Context) { c.Status(200) })
	router.GET("/ready", handler.Health)
	router.GET("/health", handler.Health)

	// API routes
	v1 := router.Group("/api/v1")
	{
		// Parse JWT if present to expose role info for read endpoints
		v1.Use(api.OptionalAuthMiddleware())

		// Product endpoints (public)
		v1.GET("/products", handler.GetProducts)
		v1.GET("/products/:id", handler.GetProduct)

		// Manufacturer scoped (authenticated)
		man := v1.Group("/manufacturer")
		man.Use(api.AuthMiddleware())
		{
			man.GET("/products", handler.GetManufacturerProducts)
		}

		// Validation endpoints (public)
		v1.GET("/products/validate-shelf-code", handler.ValidateShelfCode)

		// Category endpoints (public reads)
		v1.GET("/categories", handler.GetCategories)
		v1.GET("/categories/:id/subcategories", handler.GetSubcategories)

		// Store endpoints (public reads)
		v1.GET("/stores", handler.GetStores)

		// Protected admin endpoints
		admin := v1.Group("")
		admin.Use(api.AuthMiddleware(), api.AdminMiddleware())
		{
			// Products (write + images)
			admin.POST("/products", handler.CreateProduct)
			admin.PUT("/products/:id", handler.UpdateProduct)
			admin.DELETE("/products/:id", handler.DeleteProduct)
			admin.POST("/products/:id/image", handler.UploadProductImage)
			admin.POST("/products/:id/images", handler.UploadProductImages)
			admin.GET("/products/:id/images", handler.GetProductImages)
			admin.PUT("/products/:id/images/reorder", handler.ReorderProductImages)
			admin.DELETE("/products/:id/images/:image_id", handler.DeleteProductImage)
			admin.PUT("/products/:id/images/:image_id/primary", handler.SetPrimaryImage)

			// Categories/Subcategories (write)
			admin.POST("/categories", handler.CreateCategory)
			admin.PUT("/categories/:id", handler.UpdateCategory)
			admin.DELETE("/categories/:id", handler.DeleteCategory)
			admin.POST("/categories/:id/subcategories", handler.CreateSubcategory)
			admin.PUT("/subcategories/:id", handler.UpdateSubcategory)
			admin.DELETE("/subcategories/:id", handler.DeleteSubcategory)
			admin.POST("/subcategories/:id/image", handler.UploadSubcategoryImage)

			// Stores (write)
			admin.POST("/stores", handler.CreateStore)
			admin.PUT("/stores/:id", handler.UpdateStore)
			admin.DELETE("/stores/:id", handler.DeleteStore)
			admin.POST("/stores/:id/image", handler.UploadStoreImage)

			// Organizations & Regions & Relationship mappings
			admin.GET("/organizations", handler.GetOrganizations)
			admin.POST("/organizations", handler.CreateOrganization)
			admin.PUT("/organizations/:id", handler.UpdateOrganization)
			admin.DELETE("/organizations/:id", handler.DeleteOrganization)
			admin.GET("/organizations/:id/users", handler.GetOrganizationUsers)
			admin.POST("/organizations/:id/users", handler.SetOrganizationUsers)

			admin.GET("/regions", handler.ListRegions)
			admin.POST("/regions", handler.CreateRegion)
			admin.PUT("/regions/:id", handler.UpdateRegion)
			admin.DELETE("/regions/:id", handler.DeleteRegion)

			admin.POST("/products/:id/sourcing", handler.SetProductSourcing)
			admin.POST("/products/:id/logistics", handler.SetProductLogistics)
			admin.GET("/products/:id/sourcing", handler.GetProductSourcing)
			admin.GET("/products/:id/logistics", handler.GetProductLogistics)

			admin.GET("/stores/:id/partners", handler.GetStorePartners)
			// Batch partners for multiple stores
			admin.GET("/store-partners", handler.GetStorePartnersBatch)

			admin.POST("/stores/:id/partners", handler.SetStorePartners)

			// Admin maintenance endpoints
			admin.POST("/admin/cleanup-s3", handler.AdminCleanupS3)
		}
	}

	// Root endpoint for basic info
	router.GET("/", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"service": "catalog-service",
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
		c.Header("Access-Control-Allow-Headers", "Origin, Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, X-Admin-Request")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	}
}
