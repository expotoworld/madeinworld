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

	"github.com/expomadeinworld/madeinworld/auth-service/internal/models"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
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
	// Prefer simple protocol (no prepared statements) to be PgBouncer/Neon pooler friendly
	poolConfig.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol

	origHost := poolConfig.ConnConfig.Host

	// Force IPv4 by resolving the host to an A record and dialing that IP directly.
	// Falls back to dual stack if no IPv4 is available. Preserve TLS SNI/ServerName with the original host.
	poolConfig.ConnConfig.DialFunc = func(ctx context.Context, network, address string) (net.Conn, error) {
		// address is typically "host:port". We prefer to resolve the host to an IPv4 address ourselves
		host, port, err := net.SplitHostPort(address)
		if err != nil || host == "" || port == "" {
			// Fallback to original host if split fails
			host = origHost
			port = "5432"
		}

		// Lookup all IPs and prefer IPv4
		ips, err := net.DefaultResolver.LookupIPAddr(ctx, host)
		if err == nil {
			for _, ipa := range ips {
				if ipv4 := ipa.IP.To4(); ipv4 != nil {
					return (&net.Dialer{}).DialContext(ctx, "tcp4", net.JoinHostPort(ipv4.String(), port))
				}
			}
			// No IPv4 found: try first IP (likely IPv6) with tcp
			if len(ips) > 0 {
				return (&net.Dialer{}).DialContext(ctx, "tcp", net.JoinHostPort(ips[0].IP.String(), port))
			}
		}
		// DNS lookup failed: fall back to provided address using dual-stack tcp (handles IPv6-only)
		return (&net.Dialer{}).DialContext(ctx, "tcp", address)
	}
	if poolConfig.ConnConfig.TLSConfig != nil && poolConfig.ConnConfig.TLSConfig.ServerName == "" {
		poolConfig.ConnConfig.TLSConfig.ServerName = origHost
	}

	// Attempt to connect with retry logic for serverless databases (e.g., Neon cold start)
	var pool *pgxpool.Pool
	var lastErr error

	for attempt := 1; attempt <= maxRetries; attempt++ {
		log.Printf("[AUTH-DB] Connection attempt %d/%d to database %s@%s:%d",
			attempt, maxRetries, config.User, config.Host, config.Port)

		// Create connection pool
		pool, err = pgxpool.NewWithConfig(context.Background(), poolConfig)
		if err != nil {
			lastErr = fmt.Errorf("failed to create connection pool: %w", err)
			log.Printf("[AUTH-DB] Failed to create pool (attempt %d): %v", attempt, err)
			if attempt < maxRetries {
				delay := time.Duration(attempt-1) * initialDelay
				log.Printf("[AUTH-DB] Retrying in %v...", delay)
				time.Sleep(delay)
			}
			continue
		}

		// Test the connection with timeout
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		err = pool.Ping(ctx)
		cancel()

		if err == nil {
			log.Printf("[AUTH-DB] Successfully connected to database on attempt %d", attempt)
			break
		}

		// Connection failed, clean up pool and retry
		lastErr = fmt.Errorf("failed to ping database: %w", err)
		log.Printf("[AUTH-DB] Connection failed (attempt %d): %v", attempt, err)
		pool.Close()
		pool = nil

		if attempt < maxRetries {
			// Exponential backoff: 1s, 2s, 4s, 8s, 16s
			delay := initialDelay * time.Duration(1<<(attempt-1))
			log.Printf("[AUTH-DB] Retrying in %v...", delay)
			time.Sleep(delay)
		}
	}

	if pool == nil {
		return nil, fmt.Errorf("failed to connect to database after %d attempts: %w", maxRetries, lastErr)
	}

	// Initialize database schema with retry-aware context
	db := &Database{Pool: pool}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := db.InitSchema(ctx); err != nil {
		log.Printf("[AUTH-DB] Warning: Failed to initialize database schema: %v", err)
		// Don't fail here - schema might be initialized later
	}

	// Initialize admin verification schema
	if err := db.InitAdminSchema(ctx); err != nil {
		log.Printf("[AUTH-DB] Warning: Failed to initialize admin schema: %v", err)
		// Don't fail here - schema might be initialized later
	}

	log.Println("[AUTH-DB] Database connection established successfully")
	return db, nil
}

// Close closes the database connection pool
func (db *Database) Close() {
	if db.Pool != nil {
		db.Pool.Close()
		log.Println("Auth service database connection pool closed")
	}
}

// Health checks if the database is healthy
func (db *Database) Health(ctx context.Context) error {
	return db.Pool.Ping(ctx)
}

// InitSchema verifies the users table exists (it should already exist)
func (db *Database) InitSchema(ctx context.Context) error {
	// Check if users table exists with expected schema
	query := `
		SELECT column_name, data_type
		FROM information_schema.columns
		WHERE table_name = 'users' AND table_schema = 'public'
		ORDER BY ordinal_position;
	`

	rows, err := db.Pool.Query(ctx, query)
	if err != nil {
		return fmt.Errorf("failed to check users table schema: %w", err)
	}
	defer rows.Close()

	var columns []string
	for rows.Next() {
		var columnName, dataType string
		if err := rows.Scan(&columnName, &dataType); err != nil {
			return fmt.Errorf("failed to scan column info: %w", err)
		}
		columns = append(columns, columnName)
	}

	if len(columns) == 0 {
		return fmt.Errorf("users table does not exist")
	}

	log.Printf("Found users table with columns: %v", columns)

	// Ensure email can be NULL for phone-based registrations
	if _, err := db.Pool.Exec(ctx, "ALTER TABLE users ALTER COLUMN email DROP NOT NULL"); err != nil {
		log.Printf("[AUTH-DB] Warning: could not relax NOT NULL on users.email: %v", err)
	} else {
		log.Println("[AUTH-DB] users.email set to NULLABLE (OK for phone-based auth)")
	}

	log.Println("Database schema verified successfully")
	return nil
}

// CreateUser (deprecated): password-based signup is disabled; use email verification flow instead
func (db *Database) CreateUser(ctx context.Context, req models.SignupRequest) (*models.User, error) {
	return nil, fmt.Errorf("password-based signup is disabled; use /api/auth/send-user-verification and /api/auth/verify-user-code")
}

// GetUserRoleStatusByEmail retrieves the user's id, role, and status by email for admin checks
func (db *Database) GetUserRoleStatusByEmail(ctx context.Context, email string) (string, string, string, error) {
	var id, role, status string
	query := `
		SELECT id, role, status
		FROM users
		WHERE email = $1
	`
	if err := db.Pool.QueryRow(ctx, query, email).Scan(&id, &role, &status); err != nil {
		return "", "", "", err
	}
	return id, role, status, nil
}

// GetOrgMembershipsByUserID returns org memberships for a given user
func (db *Database) GetOrgMembershipsByUserID(ctx context.Context, userID string) ([]models.OrgMembership, error) {
	var memberships []models.OrgMembership
	query := `
		SELECT ou.org_id::text, o.org_type::text, ou.org_role::text, COALESCE(o.name, '')
		FROM organization_users ou
		JOIN organizations o ON o.org_id = ou.org_id
		WHERE ou.user_id = $1
		ORDER BY ou.org_id
	`
	rows, err := db.Pool.Query(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var m models.OrgMembership
		if err := rows.Scan(&m.OrgID, &m.OrgType, &m.OrgRole, &m.Name); err != nil {
			return nil, err
		}
		memberships = append(memberships, m)
	}
	return memberships, rows.Err()
}

// GetUserByEmail retrieves a user by email
func (db *Database) GetUserByEmail(ctx context.Context, email string) (*models.User, error) {
	var user models.User
	query := `
		SELECT id, username, email, phone, first_name, middle_name, last_name, created_at, updated_at
		FROM users
		WHERE email = $1
	`

	err := db.Pool.QueryRow(ctx, query, email).Scan(
		&user.ID,
		&user.Username,
		&user.Email,
		&user.Phone,
		&user.FirstName,
		&user.MiddleName,
		&user.LastName,
		&user.CreatedAt,
		&user.UpdatedAt,
	)

	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, pgx.ErrNoRows
		}
		return nil, fmt.Errorf("failed to get user by email: %w", err)
	}

	return &user, nil
}

// UpdateLastLogin updates the last_login timestamp for a user
func (db *Database) UpdateLastLogin(ctx context.Context, userID string) error {
	query := `
		UPDATE users
		SET last_login = now()
		WHERE id = $1
	`

	_, err := db.Pool.Exec(ctx, query, userID)
	if err != nil {
		return fmt.Errorf("failed to update last login: %w", err)
	}

	return nil
}

// ValidatePassword checks if the provided password matches the stored hash
func (db *Database) ValidatePassword(hashedPassword, password string) error {
	return bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(password))
}

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

	return config
}

// getEnv gets an environment variable with a default value
func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

// InitAdminSchema ensures unified verification schema exists (idempotent)
func (db *Database) InitAdminSchema(ctx context.Context) error {
	// Ensure unified tables and indexes exist
	createUnified := `
		CREATE TABLE IF NOT EXISTS verification_codes (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			actor_type TEXT NOT NULL CHECK (actor_type IN ('admin','user')),
			channel_type TEXT NOT NULL CHECK (channel_type IN ('email','phone')),
			subject VARCHAR(255) NOT NULL,
			code_hash VARCHAR(255) NOT NULL,
			attempts INTEGER DEFAULT 0,
			expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
			used BOOLEAN DEFAULT FALSE,
			ip_address VARCHAR(45),
			created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
		);

		CREATE TABLE IF NOT EXISTS rate_limits (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			actor_type TEXT NOT NULL CHECK (actor_type IN ('admin','user')),
			channel_type TEXT NOT NULL CHECK (channel_type IN ('email','phone')),
			ip_address VARCHAR(45) NOT NULL,
			request_count INTEGER DEFAULT 1,
			window_start TIMESTAMP WITH TIME ZONE DEFAULT now()
		);

		CREATE INDEX IF NOT EXISTS idx_verification_subject_valid
			ON verification_codes (channel_type, subject, used, expires_at DESC, created_at DESC);
		CREATE INDEX IF NOT EXISTS idx_verification_ip_created
			ON verification_codes (ip_address, created_at);
		CREATE INDEX IF NOT EXISTS idx_verification_expiry
			ON verification_codes (expires_at);
		CREATE INDEX IF NOT EXISTS idx_verification_actor_subject
			ON verification_codes (actor_type, channel_type, subject);

		CREATE INDEX IF NOT EXISTS idx_rate_limits_ip_window
			ON rate_limits (ip_address, window_start);
		CREATE INDEX IF NOT EXISTS idx_rate_limits_actor_ip_window
			ON rate_limits (actor_type, ip_address, window_start);
	`

	if _, err := db.Pool.Exec(ctx, createUnified); err != nil {
		return fmt.Errorf("failed to ensure unified verification schema: %w", err)
	}

	log.Println("Unified verification schema ensured successfully")
	return nil
}

// CreateVerificationCode creates a new admin email verification code in unified table
func (db *Database) CreateVerificationCode(ctx context.Context, email, codeHash, ipAddress string, expiresAt time.Time) (*models.AdminVerificationCode, error) {
	var code models.AdminVerificationCode
	query := `
		INSERT INTO verification_codes (actor_type, channel_type, subject, code_hash, expires_at, ip_address)
		VALUES ('admin', 'email', $1, $2, $3, $4)
		RETURNING id, subject AS email, code_hash, attempts, expires_at, used, ip_address, created_at
	`

	err := db.Pool.QueryRow(ctx, query, email, codeHash, expiresAt, ipAddress).Scan(
		&code.ID,
		&code.Email,
		&code.CodeHash,
		&code.Attempts,
		&code.ExpiresAt,
		&code.Used,
		&code.IPAddress,
		&code.CreatedAt,
	)

	if err != nil {
		return nil, fmt.Errorf("failed to create verification code: %w", err)
	}

	return &code, nil
}

// GetVerificationCode gets the latest valid admin email verification code
func (db *Database) GetVerificationCode(ctx context.Context, email string) (*models.AdminVerificationCode, error) {
	var code models.AdminVerificationCode
	query := `
		SELECT id, subject AS email, code_hash, attempts, expires_at, used, ip_address, created_at
		FROM verification_codes
		WHERE actor_type = 'admin' AND channel_type = 'email' AND subject = $1 AND expires_at > now() AND used = false
		ORDER BY created_at DESC
		LIMIT 1
	`

	err := db.Pool.QueryRow(ctx, query, email).Scan(
		&code.ID,
		&code.Email,
		&code.CodeHash,
		&code.Attempts,
		&code.ExpiresAt,
		&code.Used,
		&code.IPAddress,
		&code.CreatedAt,
	)

	if err != nil {
		return nil, err
	}

	return &code, nil
}

// UpdateVerificationCodeAttempts increments the attempt count for admin email codes
func (db *Database) UpdateVerificationCodeAttempts(ctx context.Context, id string) error {
	query := `
		UPDATE verification_codes
		SET attempts = attempts + 1
		WHERE id = $1 AND actor_type = 'admin' AND channel_type = 'email'
	`

	_, err := db.Pool.Exec(ctx, query, id)
	return err
}

// MarkVerificationCodeUsed marks an admin email verification code as used
func (db *Database) MarkVerificationCodeUsed(ctx context.Context, id string) error {
	query := `
		UPDATE verification_codes
		SET used = true
		WHERE id = $1 AND actor_type = 'admin' AND channel_type = 'email'
	`

	_, err := db.Pool.Exec(ctx, query, id)
	return err
}

// CheckRateLimit checks if IP address has exceeded rate limit
func (db *Database) CheckRateLimit(ctx context.Context, ipAddress string, maxRequests int, windowHours int) (bool, error) {
	query := `
		SELECT COALESCE(SUM(request_count), 0) as total_requests
		FROM rate_limits
		WHERE ip_address = $1 AND window_start > now() - interval '%d hours' AND actor_type = 'admin' AND channel_type = 'email'
	`

	var totalRequests int
	err := db.Pool.QueryRow(ctx, fmt.Sprintf(query, windowHours), ipAddress).Scan(&totalRequests)
	if err != nil {
		return false, fmt.Errorf("failed to check rate limit: %w", err)
	}

	return totalRequests >= maxRequests, nil
}

// IncrementRateLimit increments the rate limit counter for an IP
func (db *Database) IncrementRateLimit(ctx context.Context, ipAddress string) error {
	// First try to update existing record for current hour
	updateQuery := `
		UPDATE rate_limits
		SET request_count = request_count + 1
		WHERE actor_type = 'admin' AND channel_type = 'email' AND ip_address = $1 AND window_start >= date_trunc('hour', now())
	`

	result, err := db.Pool.Exec(ctx, updateQuery, ipAddress)
	if err != nil {
		return fmt.Errorf("failed to update rate limit: %w", err)
	}

	// If no rows were updated, create new record
	if result.RowsAffected() == 0 {
		insertQuery := `
			INSERT INTO rate_limits (actor_type, channel_type, ip_address, request_count, window_start)
			VALUES ('admin', 'email', $1, 1, date_trunc('hour', now()))
		`

		_, err = db.Pool.Exec(ctx, insertQuery, ipAddress)
		if err != nil {
			return fmt.Errorf("failed to create rate limit record: %w", err)
		}
	}

	return nil
}

// CleanupExpiredCodes removes expired verification codes and old rate limit records
func (db *Database) CleanupExpiredCodes(ctx context.Context) error {
	// Remove expired verification codes
	deleteCodesQuery := `
		DELETE FROM verification_codes
		WHERE actor_type = 'admin' AND channel_type = 'email' AND expires_at < now() - interval '1 hour'
	`

	// Remove old rate limit records (older than 24 hours)
	deleteRateLimitsQuery := `
		DELETE FROM rate_limits
		WHERE actor_type = 'admin' AND channel_type = 'email' AND window_start < now() - interval '24 hours'
	`

	if _, err := db.Pool.Exec(ctx, deleteCodesQuery); err != nil {
		return fmt.Errorf("failed to cleanup expired codes: %w", err)
	}

	if _, err := db.Pool.Exec(ctx, deleteRateLimitsQuery); err != nil {
		return fmt.Errorf("failed to cleanup old rate limits: %w", err)
	}

	return nil
}

// InitUserSchema ensures unified verification schema exists (idempotent)
func (db *Database) InitUserSchema(ctx context.Context) error {
	createUnified := `
		CREATE TABLE IF NOT EXISTS verification_codes (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			actor_type TEXT NOT NULL CHECK (actor_type IN ('admin','user')),
			channel_type TEXT NOT NULL CHECK (channel_type IN ('email','phone')),
			subject VARCHAR(255) NOT NULL,
			code_hash VARCHAR(255) NOT NULL,
			attempts INTEGER DEFAULT 0,
			expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
			used BOOLEAN DEFAULT false,
			ip_address VARCHAR(45),
			created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
		);

		CREATE TABLE IF NOT EXISTS rate_limits (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			actor_type TEXT NOT NULL CHECK (actor_type IN ('admin','user')),
			channel_type TEXT NOT NULL CHECK (channel_type IN ('email','phone')),
			ip_address VARCHAR(45) NOT NULL,
			request_count INTEGER DEFAULT 1,
			window_start TIMESTAMP WITH TIME ZONE DEFAULT now()
		);

		CREATE INDEX IF NOT EXISTS idx_verification_subject_valid
			ON verification_codes (channel_type, subject, used, expires_at DESC, created_at DESC);
		CREATE INDEX IF NOT EXISTS idx_verification_ip_created
			ON verification_codes (ip_address, created_at);
		CREATE INDEX IF NOT EXISTS idx_verification_expiry
			ON verification_codes (expires_at);
		CREATE INDEX IF NOT EXISTS idx_verification_actor_subject
			ON verification_codes (actor_type, channel_type, subject);

		CREATE INDEX IF NOT EXISTS idx_rate_limits_ip_window
			ON rate_limits (ip_address, window_start);
		CREATE INDEX IF NOT EXISTS idx_rate_limits_actor_ip_window
			ON rate_limits (actor_type, ip_address, window_start);
	`

	if _, err := db.Pool.Exec(ctx, createUnified); err != nil {
		return fmt.Errorf("failed to ensure unified verification schema: %w", err)
	}
	return nil
}

// User verification code methods (unified table with actor_type='user' and channel='email')

// CreateUserVerificationCode creates a new user email verification code in unified table
func (db *Database) CreateUserVerificationCode(ctx context.Context, email, codeHash, ipAddress string, expiresAt time.Time) (*models.UserVerificationCode, error) {
	var code models.UserVerificationCode
	query := `
		INSERT INTO verification_codes (actor_type, channel_type, subject, code_hash, expires_at, ip_address)
		VALUES ('user', 'email', $1, $2, $3, $4)
		RETURNING id, subject AS email, code_hash, attempts, expires_at, used, ip_address, created_at
	`

	err := db.Pool.QueryRow(ctx, query, email, codeHash, expiresAt, ipAddress).Scan(
		&code.ID,
		&code.Email,
		&code.CodeHash,
		&code.Attempts,
		&code.ExpiresAt,
		&code.Used,
		&code.IPAddress,
		&code.CreatedAt,
	)

	if err != nil {
		return nil, fmt.Errorf("failed to create user verification code: %w", err)
	}

	return &code, nil
}

// GetUserVerificationCode gets the latest valid user email verification code
func (db *Database) GetUserVerificationCode(ctx context.Context, email string) (*models.UserVerificationCode, error) {
	var code models.UserVerificationCode
	query := `
		SELECT id, subject AS email, code_hash, attempts, expires_at, used, ip_address, created_at
		FROM verification_codes
		WHERE actor_type = 'user' AND channel_type = 'email' AND subject = $1 AND expires_at > now() AND used = false
		ORDER BY created_at DESC
		LIMIT 1
	`

	err := db.Pool.QueryRow(ctx, query, email).Scan(
		&code.ID,
		&code.Email,
		&code.CodeHash,
		&code.Attempts,
		&code.ExpiresAt,
		&code.Used,
		&code.IPAddress,
		&code.CreatedAt,
	)

	if err != nil {
		return nil, err
	}

	return &code, nil
}

// UpdateUserVerificationCodeAttempts increments the attempt count for user verification
func (db *Database) UpdateUserVerificationCodeAttempts(ctx context.Context, id string) error {
	query := `
		UPDATE verification_codes
		SET attempts = attempts + 1
		WHERE id = $1 AND actor_type = 'user' AND channel_type = 'email'
	`

	_, err := db.Pool.Exec(ctx, query, id)
	return err
}

// MarkUserVerificationCodeUsed marks a user verification code as used
func (db *Database) MarkUserVerificationCodeUsed(ctx context.Context, id string) error {
	query := `
		UPDATE verification_codes
		SET used = true
		WHERE id = $1 AND actor_type = 'user' AND channel_type = 'email'
	`

	_, err := db.Pool.Exec(ctx, query, id)
	return err
}

// User rate limiting methods (unified table using canonical bucket actor_type='user', channel_type='email')

// CheckUserRateLimit checks if IP address has exceeded rate limit for user verification requests
func (db *Database) CheckUserRateLimit(ctx context.Context, ipAddress string, maxRequests int, windowHours int) (bool, error) {
	query := `
		SELECT COALESCE(SUM(request_count), 0) as total_requests
		FROM rate_limits
		WHERE ip_address = $1 AND window_start > now() - interval '%d hours' AND actor_type = 'user' AND channel_type = 'email'
	`

	var totalRequests int
	err := db.Pool.QueryRow(ctx, fmt.Sprintf(query, windowHours), ipAddress).Scan(&totalRequests)
	if err != nil {
		return false, err
	}

	return totalRequests >= maxRequests, nil
}

// IncrementUserRateLimit increments the rate limit counter for an IP for user verification requests
func (db *Database) IncrementUserRateLimit(ctx context.Context, ipAddress string) error {
	// First try to update existing record for current hour
	updateQuery := `
		UPDATE rate_limits
		SET request_count = request_count + 1
		WHERE actor_type = 'user' AND channel_type = 'email' AND ip_address = $1 AND window_start >= date_trunc('hour', now())
	`

	result, err := db.Pool.Exec(ctx, updateQuery, ipAddress)
	if err != nil {
		return err
	}

	// If no rows were updated, create new record
	if result.RowsAffected() == 0 {
		insertQuery := `
			INSERT INTO rate_limits (actor_type, channel_type, ip_address, request_count, window_start)
			VALUES ('user', 'email', $1, 1, date_trunc('hour', now()))
		`

		_, err = db.Pool.Exec(ctx, insertQuery, ipAddress)
		if err != nil {
			return err
		}
	}

	return nil
}

// CleanupExpiredUserCodes removes expired user verification codes and old rate limit records
func (db *Database) CleanupExpiredUserCodes(ctx context.Context) error {
	// Remove expired verification codes
	deleteCodesQuery := `
		DELETE FROM verification_codes
		WHERE actor_type = 'user' AND channel_type = 'email' AND expires_at < now() - interval '1 hour'
	`

	// Remove old rate limit records (older than 24 hours)
	deleteRateLimitsQuery := `
		DELETE FROM rate_limits
		WHERE actor_type = 'user' AND channel_type = 'email' AND window_start < now() - interval '24 hours'
	`

	if _, err := db.Pool.Exec(ctx, deleteCodesQuery); err != nil {
		return fmt.Errorf("failed to cleanup expired user codes: %w", err)
	}

	if _, err := db.Pool.Exec(ctx, deleteRateLimitsQuery); err != nil {
		return fmt.Errorf("failed to cleanup old user rate limits: %w", err)
	}

	return nil
}

// Phone verification code methods (unified table with actor_type='user' and channel='phone')

// CreateUserPhoneVerificationCode creates a new user phone verification code in unified table
func (db *Database) CreateUserPhoneVerificationCode(ctx context.Context, phoneNumber, codeHash, ipAddress string, expiresAt time.Time) (*models.UserPhoneVerificationCode, error) {
	var code models.UserPhoneVerificationCode
	query := `
		INSERT INTO verification_codes (actor_type, channel_type, subject, code_hash, expires_at, ip_address)
		VALUES ('user', 'phone', $1, $2, $3, $4)
		RETURNING id, subject AS phone_number, code_hash, attempts, expires_at, used, ip_address, created_at
	`

	err := db.Pool.QueryRow(ctx, query, phoneNumber, codeHash, expiresAt, ipAddress).Scan(
		&code.ID,
		&code.PhoneNumber,
		&code.CodeHash,
		&code.Attempts,
		&code.ExpiresAt,
		&code.Used,
		&code.IPAddress,
		&code.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create user phone verification code: %w", err)
	}
	return &code, nil
}

// GetUserPhoneVerificationCode gets the latest valid user phone verification code
func (db *Database) GetUserPhoneVerificationCode(ctx context.Context, phoneNumber string) (*models.UserPhoneVerificationCode, error) {
	var code models.UserPhoneVerificationCode
	query := `
		SELECT id, subject AS phone_number, code_hash, attempts, expires_at, used, ip_address, created_at
		FROM verification_codes
		WHERE actor_type = 'user' AND channel_type = 'phone' AND subject = $1 AND expires_at > now() AND used = false
		ORDER BY created_at DESC
		LIMIT 1
	`

	err := db.Pool.QueryRow(ctx, query, phoneNumber).Scan(
		&code.ID,
		&code.PhoneNumber,
		&code.CodeHash,
		&code.Attempts,
		&code.ExpiresAt,
		&code.Used,
		&code.IPAddress,
		&code.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &code, nil
}

// UpdateUserPhoneVerificationCodeAttempts increments the attempt count for phone verification
func (db *Database) UpdateUserPhoneVerificationCodeAttempts(ctx context.Context, id string) error {
	query := `
		UPDATE verification_codes
		SET attempts = attempts + 1
		WHERE id = $1 AND actor_type = 'user' AND channel_type = 'phone'
	`
	_, err := db.Pool.Exec(ctx, query, id)
	return err
}

// MarkUserPhoneVerificationCodeUsed marks a phone verification code as used
func (db *Database) MarkUserPhoneVerificationCodeUsed(ctx context.Context, id string) error {
	query := `
		UPDATE verification_codes
		SET used = true
		WHERE id = $1 AND actor_type = 'user' AND channel_type = 'phone'
	`
	_, err := db.Pool.Exec(ctx, query, id)
	return err
}

// CleanupExpiredPhoneCodes removes expired phone verification codes
func (db *Database) CleanupExpiredPhoneCodes(ctx context.Context) error {
	deleteCodesQuery := `
		DELETE FROM verification_codes
		WHERE actor_type = 'user' AND channel_type = 'phone' AND expires_at < now() - interval '1 hour'
	`
	if _, err := db.Pool.Exec(ctx, deleteCodesQuery); err != nil {
		return fmt.Errorf("failed to cleanup expired user phone codes: %w", err)
	}
	return nil
}

// GetUserByPhone retrieves a user by phone number
func (db *Database) GetUserByPhone(ctx context.Context, phone string) (*models.User, error) {
	var user models.User
	query := `
		SELECT id, username, email, phone, first_name, middle_name, last_name, created_at, updated_at
		FROM users
		WHERE phone = $1
	`
	err := db.Pool.QueryRow(ctx, query, phone).Scan(
		&user.ID,
		&user.Username,
		&user.Email,
		&user.Phone,
		&user.FirstName,
		&user.MiddleName,
		&user.LastName,
		&user.CreatedAt,
		&user.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, pgx.ErrNoRows
		}
		return nil, fmt.Errorf("failed to get user by phone: %w", err)
	}
	return &user, nil
}

// CreateUserFromPhone creates a new user with phone only (for auto-registration during phone verification)
func (db *Database) CreateUserFromPhone(ctx context.Context, phone string) (*models.User, error) {
	// Build username as 'user' + phone digits without '+'
	digits := strings.ReplaceAll(phone, "+", "")
	username := "user" + digits
	user := &models.User{
		Username:   username,
		Email:      nil,
		Phone:      stringPtr(phone),
		FirstName:  nil,
		MiddleName: nil,
		LastName:   nil,
	}

	query := `
		INSERT INTO users (username, email, phone, first_name, middle_name, last_name, created_at, updated_at)
		VALUES ($1, NULL, $2, $3, $4, $5, now(), now())
		RETURNING id, username, email, phone, first_name, middle_name, last_name, created_at, updated_at
	`

	err := db.Pool.QueryRow(ctx, query, user.Username, phone, user.FirstName, user.MiddleName, user.LastName).Scan(
		&user.ID,
		&user.Username,
		&user.Email,
		&user.Phone,
		&user.FirstName,
		&user.MiddleName,
		&user.LastName,
		&user.CreatedAt,
		&user.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create user from phone: %w", err)
	}
	return user, nil
}

// CreateUserFromEmail creates a new user with email only (for auto-registration during verification)
func (db *Database) CreateUserFromEmail(ctx context.Context, email string) (*models.User, error) {
	// Extract username from email (part before @)
	username := email
	if atIndex := strings.Index(email, "@"); atIndex > 0 {
		username = email[:atIndex]
	}

	// Create user with minimal required fields
	user := &models.User{
		Username:   username,
		Email:      &email,
		Phone:      nil,
		FirstName:  nil,
		MiddleName: nil,
		LastName:   nil,
	}

	query := `
		INSERT INTO users (username, email, first_name, middle_name, last_name, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, now(), now())
		RETURNING id, username, email, phone, first_name, middle_name, last_name, created_at, updated_at
	`

	err := db.Pool.QueryRow(ctx, query, user.Username, user.Email, user.FirstName, user.MiddleName, user.LastName).Scan(
		&user.ID,
		&user.Username,
		&user.Email,
		&user.Phone,
		&user.FirstName,
		&user.MiddleName,
		&user.LastName,
		&user.CreatedAt,
		&user.UpdatedAt,
	)

	if err != nil {
		return nil, fmt.Errorf("failed to create user from email: %w", err)
	}

	return user, nil
}

// Helper function to create string pointer
func stringPtr(s string) *string {
	return &s
}
