package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/expomadeinworld/madeinworld/backend/ebook-service/internal/storage"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Handlers struct{ DB *pgxpool.Pool }

type versionItem struct {
	ID        string    `json:"id"`
	Kind      string    `json:"kind"`
	S3Key     string    `json:"s3_key"`
	Label     *string   `json:"label,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}

func GetEbookVersionsHandler(db *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		kind := strings.TrimSpace(c.Query("kind"))
		limitStr := c.DefaultQuery("limit", "10")
		offsetStr := c.DefaultQuery("offset", "0")
		limit, _ := strconv.Atoi(limitStr)
		if limit <= 0 || limit > 100 {
			limit = 10
		}
		offset, _ := strconv.Atoi(offsetStr)
		if offset < 0 {
			offset = 0
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
		defer cancel()

		rows, err := db.Query(ctx,
			`SELECT ev.id, ev.kind, ev.s3_key, ev.label, ev.created_at
			 FROM ebook_versions ev
			 JOIN ebooks e ON e.id = ev.ebook_id
			 WHERE e.slug='main' AND ($1='' OR ev.kind=$1)
			 ORDER BY ev.created_at DESC
			 LIMIT $2 OFFSET $3`, kind, limit, offset,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		defer rows.Close()

		items := make([]versionItem, 0, limit)
		for rows.Next() {
			var v versionItem
			if err := rows.Scan(&v.ID, &v.Kind, &v.S3Key, &v.Label, &v.CreatedAt); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}
			items = append(items, v)
		}
		c.JSON(http.StatusOK, gin.H{"items": items, "kind": kind, "limit": limit, "offset": offset})
	}
}

func GetDraftEbookHandler(db *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
		defer cancel()
		var contentRaw []byte
		err := db.QueryRow(ctx, `SELECT COALESCE(content, '{}'::jsonb) FROM ebooks WHERE slug='main'`).Scan(&contentRaw)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		var content any
		_ = json.Unmarshal(contentRaw, &content)
		c.JSON(http.StatusOK, gin.H{"content": content})
	}
}

func PutAutosaveEbookHandler(db *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		var newContent any
		if err := c.BindJSON(&newContent); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON"})
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		uploader, _ := storage.NewS3Uploader(ctx)

		tx, err := db.Begin(ctx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		defer tx.Rollback(ctx)

		var ebookID string
		var oldContent sql.NullString
		if err := tx.QueryRow(ctx, `SELECT id, content::text FROM ebooks WHERE slug='main' FOR UPDATE`).Scan(&ebookID, &oldContent); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		// Archive old content as autosave if present
		if uploader.Enabled() && oldContent.Valid && len(oldContent.String) > 2 { // not empty {}
			var oldJSON any
			_ = json.Unmarshal([]byte(oldContent.String), &oldJSON)
			key := storage.TimestampKey("ebook/versions/autosave/")
			if _, err := uploader.UploadJSON(ctx, key, oldJSON); err == nil {
				if _, err := tx.Exec(ctx, `INSERT INTO ebook_versions (ebook_id, kind, s3_key, label) VALUES ($1,'autosave',$2,NULL)`, ebookID, key); err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
					return
				}
			}
		}

		b, _ := json.Marshal(newContent)
		if _, err := tx.Exec(ctx, `UPDATE ebooks SET content=$1::jsonb, updated_at=now() WHERE id=$2`, string(b), ebookID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		if err := tx.Commit(ctx); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "saved"})
	}
}

type manualReq struct {
	Label string `json:"label"`
}

func PostManualVersionHandler(db *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req manualReq
		_ = c.ShouldBindJSON(&req)

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		uploader, _ := storage.NewS3Uploader(ctx)
		if !uploader.Enabled() {
			c.JSON(http.StatusFailedDependency, gin.H{"error": "s3 not configured"})
			return
		}

		tx, err := db.Begin(ctx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		defer tx.Rollback(ctx)

		var ebookID string
		var contentRaw []byte
		if err := tx.QueryRow(ctx, `SELECT id, COALESCE(content,'{}'::jsonb)::text FROM ebooks WHERE slug='main' FOR UPDATE`).Scan(&ebookID, &contentRaw); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		var content any
		_ = json.Unmarshal(contentRaw, &content)

		key := storage.TimestampKey("ebook/versions/manual/")
		if _, err := uploader.UploadJSON(ctx, key, content); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		var lbl *string
		if s := strings.TrimSpace(req.Label); s != "" {
			lbl = &s
		}
		if _, err := tx.Exec(ctx, `INSERT INTO ebook_versions(ebook_id, kind, s3_key, label) VALUES ($1,'manual',$2,$3)`, ebookID, key, lbl); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if err := tx.Commit(ctx); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "manual_version_created"})
	}
}

func PostPublishHandler(db *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		uploader, _ := storage.NewS3Uploader(ctx)
		if !uploader.Enabled() {
			c.JSON(http.StatusFailedDependency, gin.H{"error": "s3 not configured"})
			return
		}

		tx, err := db.Begin(ctx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		defer tx.Rollback(ctx)

		var ebookID string
		var contentRaw []byte
		if err := tx.QueryRow(ctx, `SELECT id, COALESCE(content,'{}'::jsonb)::text FROM ebooks WHERE slug='main' FOR UPDATE`).Scan(&ebookID, &contentRaw); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		var content any
		_ = json.Unmarshal(contentRaw, &content)

		key := storage.TimestampKey("ebook/versions/published/")
		if _, err := uploader.UploadJSON(ctx, key, content); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if _, err := tx.Exec(ctx, `INSERT INTO ebook_versions(ebook_id, kind, s3_key, label) VALUES ($1,'published',$2,NULL)`, ebookID, key); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if err := tx.Commit(ctx); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "published"})
	}
}
