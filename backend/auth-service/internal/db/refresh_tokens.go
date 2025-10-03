package db

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"time"
)

// hashRefreshToken computes a URL-safe base64-encoded SHA-256 hash of the refresh token
func hashRefreshToken(plain string) string {
	sum := sha256.Sum256([]byte(plain))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

// CreateRefreshToken stores a hashed refresh token for a user with expiry and optional metadata.
// The plain token must NOT be stored in DB. Pass hash generated via hashRefreshToken().
func (db *Database) CreateRefreshToken(ctx context.Context, userID string, tokenHash string, expiresAt time.Time, ip string, userAgent string) (string, error) {
	query := `
		INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip_address, user_agent)
		VALUES ($1, $2, $3, NULLIF($4,''), NULLIF($5,''))
		RETURNING id
	`
	var id string
	if err := db.Pool.QueryRow(ctx, query, userID, tokenHash, expiresAt, ip, userAgent).Scan(&id); err != nil {
		return "", fmt.Errorf("failed to create refresh token: %w", err)
	}
	return id, nil
}

// GetRefreshToken looks up a refresh token by its hash and returns identifying data.
func (db *Database) GetRefreshToken(ctx context.Context, tokenHash string) (id string, userID string, expiresAt time.Time, revoked bool, err error) {
	query := `
		SELECT id::text, user_id::text, expires_at, revoked
		FROM refresh_tokens
		WHERE token_hash = $1
	`
	err = db.Pool.QueryRow(ctx, query, tokenHash).Scan(&id, &userID, &expiresAt, &revoked)
	return
}

// RevokeRefreshToken marks a token as revoked.
func (db *Database) RevokeRefreshToken(ctx context.Context, id string) error {
	_, err := db.Pool.Exec(ctx, `UPDATE refresh_tokens SET revoked = true WHERE id = $1`, id)
	return err
}

// CleanupExpiredRefreshTokens removes permanently expired tokens (optional maintenance helper)
func (db *Database) CleanupExpiredRefreshTokens(ctx context.Context) error {
	_, err := db.Pool.Exec(ctx, `DELETE FROM refresh_tokens WHERE expires_at < now() - interval '7 days' OR (revoked = true AND expires_at < now())`)
	return err
}

