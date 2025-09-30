package db

import (
	"context"
	"fmt"
	"log"
	"net"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/expomadeinworld/madeinworld/catalog-service/internal/models"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Database holds the database connection pool
type Database struct {
	Pool *pgxpool.Pool
}

// Config holds database configuration
type Config struct {
	Host     string
	Port     int
	User     string
	Password string
	DBName   string
	SSLMode  string
}

// NewDatabase creates a new database connection with retry logic for serverless databases
func NewDatabase() (*Database, error) {
	return NewDatabaseWithRetry(5, time.Second)
}

// NewDatabaseWithRetry creates a new database connection with configurable retry logic
func NewDatabaseWithRetry(maxRetries int, initialDelay time.Duration) (*Database, error) {
	config := getConfigFromEnv()

	// Build connection string
	var connStr string
	if config.Password == "" {
		connStr = fmt.Sprintf(
			"host=%s port=%d user=%s dbname=%s sslmode=%s",
			config.Host,
			config.Port,
			config.User,
			config.DBName,
			config.SSLMode,
		)
	} else {
		connStr = fmt.Sprintf(
			"host=%s port=%d user=%s password=%s dbname=%s sslmode=%s",
			config.Host,
			config.Port,
			config.User,
			config.Password,
			config.DBName,
			config.SSLMode,
		)
	}

	// Configure connection pool
	poolConfig, err := pgxpool.ParseConfig(connStr)
	if err != nil {
		return nil, fmt.Errorf("failed to parse database config: %w", err)
	}

	// Set pool settings
	poolConfig.MaxConns = 30
	poolConfig.MinConns = 0
	poolConfig.MaxConnLifetime = time.Hour
	poolConfig.MaxConnIdleTime = 5 * time.Minute

	origHost := poolConfig.ConnConfig.Host

	// Prefer simple protocol (no prepared statements) to be Neon pooler friendly
	poolConfig.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol

	poolConfig.ConnConfig.DialFunc = func(ctx context.Context, network, address string) (net.Conn, error) {
		// Prefer IPv4 when available, fall back to dual-stack
		host, port, err := net.SplitHostPort(address)
		if err != nil || host == "" || port == "" {
			host = origHost
			port = "5432"
		}
		ips, err := net.DefaultResolver.LookupIPAddr(ctx, host)
		if err == nil {
			for _, ipa := range ips {
				if ipv4 := ipa.IP.To4(); ipv4 != nil {
					return (&net.Dialer{}).DialContext(ctx, "tcp4", net.JoinHostPort(ipv4.String(), port))
				}
			}
			if len(ips) > 0 {
				return (&net.Dialer{}).DialContext(ctx, "tcp", net.JoinHostPort(ips[0].IP.String(), port))
			}
		}
		return (&net.Dialer{}).DialContext(ctx, "tcp", address)
	}
	if poolConfig.ConnConfig.TLSConfig != nil && poolConfig.ConnConfig.TLSConfig.ServerName == "" {
		poolConfig.ConnConfig.TLSConfig.ServerName = origHost
	}

	// Attempt to connect with retry logic for serverless databases (e.g., Neon cold start)
	var pool *pgxpool.Pool
	var lastErr error

	for attempt := 1; attempt <= maxRetries; attempt++ {
		log.Printf("[CATALOG-DB] Connection attempt %d/%d to database %s@%s:%d",
			attempt, maxRetries, config.User, config.Host, config.Port)

		// Create connection pool
		pool, err = pgxpool.NewWithConfig(context.Background(), poolConfig)
		if err != nil {
			lastErr = fmt.Errorf("failed to create connection pool: %w", err)
			log.Printf("[CATALOG-DB] Failed to create pool (attempt %d): %v", attempt, err)
			if attempt < maxRetries {
				delay := time.Duration(attempt-1) * initialDelay
				log.Printf("[CATALOG-DB] Retrying in %v...", delay)
				time.Sleep(delay)
			}
			continue
		}

		// Test the connection with timeout
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		err = pool.Ping(ctx)
		cancel()

		if err == nil {
			log.Printf("[CATALOG-DB] Successfully connected to database on attempt %d", attempt)
			break
		}

		// Connection failed, clean up pool and retry
		lastErr = fmt.Errorf("failed to ping database: %w", err)
		log.Printf("[CATALOG-DB] Connection failed (attempt %d): %v", attempt, err)
		pool.Close()
		pool = nil

		if attempt < maxRetries {
			// Exponential backoff: 1s, 2s, 4s, 8s, 16s
			delay := initialDelay * time.Duration(1<<(attempt-1))
			log.Printf("[CATALOG-DB] Retrying in %v...", delay)
			time.Sleep(delay)
		}
	}

	if pool == nil {
		return nil, fmt.Errorf("failed to connect to database after %d attempts: %w", maxRetries, lastErr)
	}

	log.Println("[CATALOG-DB] Database connection established successfully")
	return &Database{Pool: pool}, nil
}

// Close closes the database connection pool
func (db *Database) Close() {
	if db.Pool != nil {
		db.Pool.Close()
		log.Println("Database connection pool closed")
	}
}

// Health checks if the database is healthy
func (db *Database) Health(ctx context.Context) error {
	return db.Pool.Ping(ctx)
}

// =================================================================================
// NEW FUNCTIONS FOR WRITING DATA
// =================================================================================

// CreateProduct inserts a new product into the database and returns its ID.
// This function assumes your `products` table has an auto-incrementing `product_id`.
func (db *Database) CreateProduct(ctx context.Context, product models.Product) (int, error) {
	// Start a transaction to ensure atomicity
	tx, err := db.Pool.Begin(ctx)
	if err != nil {
		return 0, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)
	// Determine store_type param: NULL for RetailStore and GroupBuying
	var storeTypeParam interface{}
	if product.MiniAppType == models.MiniAppTypeRetailStore || product.MiniAppType == models.MiniAppTypeGroupBuying {
		storeTypeParam = nil
	} else {
		storeTypeParam = product.StoreType
	}

	// Determine shelf_code param: only for location-based mini-apps with a selected store
	var shelfCodeParam interface{}
	if product.StoreID == nil || product.MiniAppType == models.MiniAppTypeRetailStore || product.MiniAppType == models.MiniAppTypeGroupBuying {
		shelfCodeParam = nil
	} else if product.ShelfCode != nil && strings.TrimSpace(*product.ShelfCode) != "" {
		shelfCodeParam = product.ShelfCode
	} else {
		shelfCodeParam = nil
	}

	// Determine stock_left param: only Unmanned store types track inventory
	var stockLeftParam interface{}
	switch product.StoreType {
	case models.StoreTypeUnmannedStore, models.StoreTypeUnmannedWarehouse:
		stockLeftParam = product.StockLeft
	default:
		stockLeftParam = nil
	}

	var productID int
	query := `
        INSERT INTO products
            (sku, title, description, store_type, mini_app_type, store_id, shelf_code, main_price, strikethrough_price, cost_price, weight, stock_left, minimum_order_quantity, is_active, is_featured, is_mini_app_recommendation)
        VALUES
            ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        RETURNING product_id
    `
	err = tx.QueryRow(ctx, query,
		product.SKU,
		product.Title,
		product.DescriptionLong,
		storeTypeParam,
		product.MiniAppType,
		product.StoreID,
		shelfCodeParam,
		product.MainPrice,
		product.StrikethroughPrice,
		product.CostPrice,
		product.Weight,
		stockLeftParam,
		product.MinimumOrderQuantity,
		product.IsActive,
		product.IsFeatured,
		product.IsMiniAppRecommendation,
	).Scan(&productID)

	if err != nil {
		return 0, fmt.Errorf("failed to insert product: %w", err)
	}

	// Insert category mappings if provided
	if len(product.CategoryIds) > 0 {
		for _, categoryIDStr := range product.CategoryIds {
			categoryID, err := strconv.Atoi(categoryIDStr)
			if err != nil {
				return 0, fmt.Errorf("invalid category ID '%s': %w", categoryIDStr, err)
			}

			_, err = tx.Exec(ctx,
				"INSERT INTO product_category_mapping (product_id, category_id) VALUES ($1, $2)",
				productID, categoryID)
			if err != nil {
				return 0, fmt.Errorf("failed to insert category mapping: %w", err)
			}
		}
	}

	// Insert subcategory mappings if provided
	if len(product.SubcategoryIds) > 0 {
		log.Printf("🔍 DEBUG: Processing %d subcategory IDs: %v", len(product.SubcategoryIds), product.SubcategoryIds)
		for _, subcategoryIDStr := range product.SubcategoryIds {
			subcategoryID, err := strconv.Atoi(subcategoryIDStr)
			if err != nil {
				log.Printf("❌ DEBUG: Invalid subcategory ID '%s': %v", subcategoryIDStr, err)
				return 0, fmt.Errorf("invalid subcategory ID '%s': %w", subcategoryIDStr, err)
			}

			log.Printf("🔍 DEBUG: Inserting subcategory mapping: product_id=%d, subcategory_id=%d", productID, subcategoryID)
			_, err = tx.Exec(ctx,
				"INSERT INTO product_subcategory_mapping (product_id, subcategory_id) VALUES ($1, $2)",
				productID, subcategoryID)
			if err != nil {
				log.Printf("❌ DEBUG: Failed to insert subcategory mapping: %v", err)
				return 0, fmt.Errorf("failed to insert subcategory mapping: %w", err)
			}
			log.Printf("✅ DEBUG: Successfully inserted subcategory mapping: product_id=%d, subcategory_id=%d", productID, subcategoryID)
		}
	} else {
		log.Printf("🔍 DEBUG: No subcategory IDs provided")
	}

	// Commit the transaction
	if err = tx.Commit(ctx); err != nil {
		return 0, fmt.Errorf("failed to commit transaction: %w", err)
	}

	return productID, nil
}

// AddImageURLToProduct links an S3 image URL to a product in the product_images table.
func (db *Database) AddImageURLToProduct(ctx context.Context, productID int, imageURL string) error {
	query := `
        INSERT INTO product_images (product_id, image_url, display_order)
        VALUES ($1, $2, (
            SELECT COALESCE(MAX(display_order), 0) + 1
            FROM product_images
            WHERE product_id = $1
        ))
    `
	_, err := db.Pool.Exec(ctx, query, productID, imageURL)

	if err != nil {
		return fmt.Errorf("failed to insert product image: %w", err)
	}
	return nil
}

// ReplaceProductImage replaces the primary image for a product (deletes existing, adds new)
func (db *Database) ReplaceProductImage(ctx context.Context, productID int, imageURL string) error {
	// Start a transaction to ensure atomicity
	tx, err := db.Pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("failed to start transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	// Delete existing images for this product
	_, err = tx.Exec(ctx, "DELETE FROM product_images WHERE product_id = $1", productID)
	if err != nil {
		return fmt.Errorf("failed to delete existing images: %w", err)
	}

	// Insert the new image as the primary image (display_order = 1)
	_, err = tx.Exec(ctx,
		"INSERT INTO product_images (product_id, image_url, display_order) VALUES ($1, $2, 1)",
		productID, imageURL)
	if err != nil {
		return fmt.Errorf("failed to insert new image: %w", err)
	}

	// Commit the transaction
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	return nil
}

// UpdateProduct updates an existing product in the database
func (db *Database) UpdateProduct(ctx context.Context, productID int, product models.Product) error {
	// Start a transaction to ensure atomicity
	// Determine store_type param: NULL for RetailStore and GroupBuying
	var storeTypeParam interface{}
	if product.MiniAppType == models.MiniAppTypeRetailStore || product.MiniAppType == models.MiniAppTypeGroupBuying {
		storeTypeParam = nil
	} else {
		storeTypeParam = product.StoreType
	}

	tx, err := db.Pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	// Determine shelf_code param: only for location-based mini-apps with a selected store
	var shelfCodeParam interface{}
	if product.StoreID == nil || product.MiniAppType == models.MiniAppTypeRetailStore || product.MiniAppType == models.MiniAppTypeGroupBuying {
		shelfCodeParam = nil
	} else if product.ShelfCode != nil && strings.TrimSpace(*product.ShelfCode) != "" {
		shelfCodeParam = product.ShelfCode
	} else {
		shelfCodeParam = nil
	}

	// Determine stock_left param: only Unmanned store types track inventory
	var stockLeftParam interface{}
	switch product.StoreType {
	case models.StoreTypeUnmannedStore, models.StoreTypeUnmannedWarehouse:
		stockLeftParam = product.StockLeft
	default:
		stockLeftParam = nil
	}

	// Update the basic product fields
	log.Printf("[DB.UpdateProduct] id=%d sku=%s mini_app_type=%s store_type_param=%v store_id=%v shelf_code=%v stock_left_param=%v",
		productID, product.SKU, product.MiniAppType, storeTypeParam, product.StoreID, shelfCodeParam, stockLeftParam,
	)
	query := `
        UPDATE products
        SET
            sku = $2,
            title = $3,
            description = $4,
            store_type = $5,
            mini_app_type = $6,
            store_id = $7,
            shelf_code = $8,
            main_price = $9,
            strikethrough_price = $10,
            cost_price = $11,
            weight = $12,
            stock_left = $13,
            minimum_order_quantity = $14,
            is_active = $15,
            is_featured = $16,
            is_mini_app_recommendation = $17,
            updated_at = CURRENT_TIMESTAMP
        WHERE product_id = $1
    `
	result, err := tx.Exec(ctx, query,
		productID,
		product.SKU,
		product.Title,
		product.DescriptionLong,
		storeTypeParam,
		product.MiniAppType,
		product.StoreID,
		shelfCodeParam,
		product.MainPrice,
		product.StrikethroughPrice,
		product.CostPrice,
		product.Weight,
		stockLeftParam,
		product.MinimumOrderQuantity,
		product.IsActive,
		product.IsFeatured,
		product.IsMiniAppRecommendation,
	)

	if err != nil {
		log.Printf("[DB.UpdateProduct] update error: %v", err)
		return fmt.Errorf("failed to update product: %w", err)
	}

	rowsAffected := result.RowsAffected()
	if rowsAffected == 0 {
		return fmt.Errorf("product with ID %d not found", productID)
	}

	// Update category mappings
	// Delete existing category mappings
	_, err = tx.Exec(ctx, "DELETE FROM product_category_mapping WHERE product_id = $1", productID)
	if err != nil {
		return fmt.Errorf("failed to delete existing category mappings: %w", err)
	}

	// Insert new category mappings if provided
	if len(product.CategoryIds) > 0 {
		for _, categoryIDStr := range product.CategoryIds {
			categoryID, err := strconv.Atoi(categoryIDStr)
			if err != nil {
				return fmt.Errorf("invalid category ID '%s': %w", categoryIDStr, err)
			}

			_, err = tx.Exec(ctx,
				"INSERT INTO product_category_mapping (product_id, category_id) VALUES ($1, $2)",
				productID, categoryID)
			if err != nil {
				return fmt.Errorf("failed to insert category mapping: %w", err)
			}
		}
	}

	// Update subcategory mappings
	// Delete existing subcategory mappings
	_, err = tx.Exec(ctx, "DELETE FROM product_subcategory_mapping WHERE product_id = $1", productID)
	if err != nil {
		return fmt.Errorf("failed to delete existing subcategory mappings: %w", err)
	}

	// Insert new subcategory mappings if provided
	if len(product.SubcategoryIds) > 0 {
		for _, subcategoryIDStr := range product.SubcategoryIds {
			subcategoryID, err := strconv.Atoi(subcategoryIDStr)
			if err != nil {
				return fmt.Errorf("invalid subcategory ID '%s': %w", subcategoryIDStr, err)
			}

			_, err = tx.Exec(ctx,
				"INSERT INTO product_subcategory_mapping (product_id, subcategory_id) VALUES ($1, $2)",
				productID, subcategoryID)
			if err != nil {
				return fmt.Errorf("failed to insert subcategory mapping: %w", err)
			}
		}
	}

	// Commit the transaction
	if err = tx.Commit(ctx); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	return nil
}

// DeleteProduct soft deletes a product by setting is_active to false
func (db *Database) DeleteProduct(ctx context.Context, productID int) error {
	query := `
        UPDATE products
        SET
            is_active = false,
            updated_at = CURRENT_TIMESTAMP
        WHERE product_id = $1 AND is_active = true
    `
	result, err := db.Pool.Exec(ctx, query, productID)

	if err != nil {
		return fmt.Errorf("failed to delete product: %w", err)
	}

	rowsAffected := result.RowsAffected()
	if rowsAffected == 0 {
		return fmt.Errorf("product with ID %d not found or already deleted", productID)
	}

	return nil
}

// HardDeleteProduct permanently removes a product from the database
// Use with caution - this is irreversible
func (db *Database) HardDeleteProduct(ctx context.Context, productID int) error {
	// Start a transaction to ensure data consistency
	tx, err := db.Pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("failed to start transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	// Delete product images first (foreign key constraint)
	_, err = tx.Exec(ctx, "DELETE FROM product_images WHERE product_id = $1", productID)
	if err != nil {
		return fmt.Errorf("failed to delete product images: %w", err)
	}

	// Delete product category mappings
	_, err = tx.Exec(ctx, "DELETE FROM product_category_mapping WHERE product_id = $1", productID)
	if err != nil {
		return fmt.Errorf("failed to delete product category mappings: %w", err)
	}

	// Finally delete the product
	result, err := tx.Exec(ctx, "DELETE FROM products WHERE product_id = $1", productID)
	if err != nil {
		return fmt.Errorf("failed to delete product: %w", err)
	}

	rowsAffected := result.RowsAffected()
	if rowsAffected == 0 {
		return fmt.Errorf("product with ID %d not found", productID)
	}

	// Commit the transaction
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	return nil
}

// AddProductImage adds a new image to a product
func (db *Database) AddProductImage(ctx context.Context, productID int, imageURL string, displayOrder int, isPrimary bool) (int, error) {
	var imageID int
	query := `
        INSERT INTO product_images (product_id, image_url, display_order, is_primary)
        VALUES ($1, $2, $3, $4)
        RETURNING image_id
    `
	err := db.Pool.QueryRow(ctx, query, productID, imageURL, displayOrder, isPrimary).Scan(&imageID)
	if err != nil {
		return 0, fmt.Errorf("failed to insert product image: %w", err)
	}
	return imageID, nil
}

// GetProductImages retrieves all images for a product
func (db *Database) GetProductImages(ctx context.Context, productID int) ([]models.ProductImage, error) {
	query := `
        SELECT image_id, product_id, image_url, display_order, is_primary, created_at
        FROM product_images
        WHERE product_id = $1
        ORDER BY display_order, image_id
    `

	rows, err := db.Pool.Query(ctx, query, productID)
	if err != nil {
		return nil, fmt.Errorf("failed to query product images: %w", err)
	}
	defer rows.Close()

	var images []models.ProductImage
	for rows.Next() {
		var image models.ProductImage
		err := rows.Scan(
			&image.ID,
			&image.ProductID,
			&image.ImageURL,
			&image.DisplayOrder,
			&image.IsPrimary,
			&image.CreatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan product image: %w", err)
		}
		images = append(images, image)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating product images: %w", err)
	}

	return images, nil
}

// UpdateImageDisplayOrder updates the display order of a product image
func (db *Database) UpdateImageDisplayOrder(ctx context.Context, productID, imageID, displayOrder int) error {
	query := `
        UPDATE product_images
        SET display_order = $3
        WHERE product_id = $1 AND image_id = $2
    `
	result, err := db.Pool.Exec(ctx, query, productID, imageID, displayOrder)
	if err != nil {
		return fmt.Errorf("failed to update image display order: %w", err)
	}

	rowsAffected := result.RowsAffected()
	if rowsAffected == 0 {
		return fmt.Errorf("image not found")
	}

	return nil
}

// DeleteProductImage deletes a product image
func (db *Database) DeleteProductImage(ctx context.Context, productID, imageID int) error {
	query := `
        DELETE FROM product_images
        WHERE product_id = $1 AND image_id = $2
    `
	result, err := db.Pool.Exec(ctx, query, productID, imageID)
	if err != nil {
		return fmt.Errorf("failed to delete product image: %w", err)
	}

	rowsAffected := result.RowsAffected()
	if rowsAffected == 0 {
		return fmt.Errorf("image not found")
	}

	return nil
}

// SetPrimaryImage sets an image as primary and unsets others
func (db *Database) SetPrimaryImage(ctx context.Context, productID, imageID int) error {
	// Start transaction
	tx, err := db.Pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("failed to start transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	// Unset all primary flags for this product
	_, err = tx.Exec(ctx, `
        UPDATE product_images
        SET is_primary = FALSE
        WHERE product_id = $1
    `, productID)
	if err != nil {
		return fmt.Errorf("failed to unset primary flags: %w", err)
	}

	// Set the specified image as primary
	result, err := tx.Exec(ctx, `
        UPDATE product_images
        SET is_primary = TRUE
        WHERE product_id = $1 AND image_id = $2
    `, productID, imageID)
	if err != nil {
		return fmt.Errorf("failed to set primary image: %w", err)
	}

	rowsAffected := result.RowsAffected()
	if rowsAffected == 0 {
		return fmt.Errorf("image not found")
	}

	// Commit transaction
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	return nil
}

// =================================================================================
// HELPER FUNCTIONS FOR CONFIG
// =================================================================================

// getConfigFromEnv reads database configuration from environment variables
func getConfigFromEnv() Config {
	config := Config{
		Host:     getEnv("DB_HOST", "localhost"),
		User:     getEnv("DB_USER", "madeinworld_admin"),
		Password: getEnv("DB_PASSWORD", ""),
		DBName:   getEnv("DB_NAME", "madeinworld_db"),
		SSLMode:  getEnv("DB_SSLMODE", "prefer"),
	}

	// Parse port
	portStr := getEnv("DB_PORT", "5432")
	port, err := strconv.Atoi(portStr)
	if err != nil {
		log.Printf("Invalid DB_PORT value: %s, using default 5432", portStr)
		port = 5432
	}
	config.Port = port

	// Validate required fields
	// Temporarily disabled for local development
	// if config.Password == "" {
	//	log.Fatal("DB_PASSWORD environment variable is required")
	// }

	return config
}

// getEnv gets an environment variable with a default value
func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
