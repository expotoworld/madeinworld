package db

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"net"
	"os"
	"time"

	"github.com/lib/pq"
)

// Force IPv4 dialing for lib/pq connections via a custom Dialer
// This preserves the DNS hostname in config while ensuring tcp4 is used
type ipv4Dialer struct{}

func (ipv4Dialer) Dial(network, address string) (net.Conn, error) {
	return (&net.Dialer{}).Dial("tcp4", address)
}

func (ipv4Dialer) DialTimeout(network, address string, timeout time.Duration) (net.Conn, error) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	return (&net.Dialer{}).DialContext(ctx, "tcp4", address)
}

// Database represents the database connection
type Database struct {
	DB *sql.DB
}

// NewDatabase creates a new database connection with retry logic for serverless databases
func NewDatabase() (*Database, error) {
	return NewDatabaseWithRetry(5, time.Second)
}

// NewDatabaseWithRetry creates a new database connection with configurable retry logic
func NewDatabaseWithRetry(maxRetries int, initialDelay time.Duration) (*Database, error) {
	// Get database configuration from environment variables
	host := os.Getenv("DB_HOST")
	if host == "" {
		host = "localhost"
	}

	port := os.Getenv("DB_PORT")
	if port == "" {
		port = "5432"
	}

	user := os.Getenv("DB_USER")
	if user == "" {
		user = "madeinworld_admin"
	}

	password := os.Getenv("DB_PASSWORD")
	// Password can be empty for local development

	dbname := os.Getenv("DB_NAME")
	if dbname == "" {
		dbname = "madeinworld_db"
	}

	sslmode := os.Getenv("DB_SSLMODE")
	if sslmode == "" {
		sslmode = "disable"
	}

	// Create connection string
	var connStr string
	if uri := os.Getenv("DATABASE_URL"); uri != "" {
		// Prefer full DSN if provided (Neon/Heroku style)
		connStr = uri
	} else if password == "" {
		connStr = fmt.Sprintf("host=%s port=%s user=%s dbname=%s sslmode=%s",
			host, port, user, dbname, sslmode)
	} else {
		connStr = fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
			host, port, user, password, dbname, sslmode)
	}

	// Attempt to connect with retry logic for serverless databases (e.g., Neon cold start)
	var db *sql.DB
	var lastErr error

	for attempt := 1; attempt <= maxRetries; attempt++ {
		log.Printf("[USER-DB] Connection attempt %d/%d to database %s@%s:%s",
			attempt, maxRetries, user, host, port)

		// Open database connection
		connector, err := pq.NewConnector(connStr)
		if err != nil {
			lastErr = fmt.Errorf("failed to build pq connector: %w", err)
			log.Printf("[USER-DB] Failed to create connector (attempt %d): %v", attempt, err)
			if attempt < maxRetries {
				delay := time.Duration(attempt-1) * initialDelay
				log.Printf("[USER-DB] Retrying in %v...", delay)
				time.Sleep(delay)
			}
			continue
		}

		connector.Dialer(ipv4Dialer{})
		db = sql.OpenDB(connector)

		// Test the connection
		err = db.Ping()
		if err == nil {
			log.Printf("[USER-DB] Successfully connected to database on attempt %d", attempt)
			break
		}

		// Connection failed, clean up and retry
		lastErr = fmt.Errorf("failed to ping database: %w", err)
		log.Printf("[USER-DB] Connection failed (attempt %d): %v", attempt, err)
		db.Close()
		db = nil

		if attempt < maxRetries {
			// Exponential backoff: 1s, 2s, 4s, 8s, 16s
			delay := initialDelay * time.Duration(1<<(attempt-1))
			log.Printf("[USER-DB] Retrying in %v...", delay)
			time.Sleep(delay)
		}
	}

	if db == nil {
		return nil, fmt.Errorf("failed to connect to database after %d attempts: %w", maxRetries, lastErr)
	}

	// Configure connection pool (reduce idle to allow Neon autosuspend)
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(0)
	db.SetConnMaxIdleTime(5 * time.Minute)

	log.Printf("[USER-DB] Database connection established successfully: %s@%s:%s/%s", user, host, port, dbname)
	return &Database{DB: db}, nil
}

// Close closes the database connection
func (d *Database) Close() error {
	if d.DB != nil {
		return d.DB.Close()
	}
	return nil
}

// Health checks if the database connection is healthy
func (d *Database) Health() error {
	return d.DB.Ping()
}
