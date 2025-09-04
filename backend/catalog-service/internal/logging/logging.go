package logging

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
)

// init ensures logs go to stdout (captured by App Runner) and uses UTC timestamps.
func init() {
	log.SetOutput(os.Stdout)
}

// LogKV logs a structured JSON line with a level, message, and arbitrary fields.
func LogKV(level, msg string, fields map[string]interface{}) {
	entry := map[string]interface{}{
		"level": level,
		"ts":    time.Now().UTC().Format(time.RFC3339Nano),
		"msg":   msg,
	}
	for k, v := range fields {
		entry[k] = v
	}
	b, _ := json.Marshal(entry)
	log.Println(string(b))
}

// JSONLogger returns a Gin middleware that logs requests as single-line JSON.
func JSONLogger() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		path := c.Request.URL.Path
		query := c.Request.URL.RawQuery

		c.Next()

		latency := time.Since(start)
		status := c.Writer.Status()
		level := "info"
		if status >= http.StatusInternalServerError || len(c.Errors) > 0 {
			level = "error"
		}

		fields := map[string]interface{}{
			"method":      c.Request.Method,
			"path":        path,
			"query":       query,
			"status":      status,
			"latency_ms":  float64(latency.Microseconds()) / 1000.0,
			"client_ip":   c.ClientIP(),
			"user_agent":  c.Request.UserAgent(),
			"bytes_in":    c.Request.ContentLength,
			"bytes_out":   c.Writer.Size(),
		}
		if len(c.Errors) > 0 {
			fields["error"] = c.Errors.String()
		}

		LogKV(level, "request", fields)
	}
}

