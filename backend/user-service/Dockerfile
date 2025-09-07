# Multi-stage build for Go application
# Stage 1: Build the application
FROM golang:1.23-alpine AS builder

# Accept build metadata
ARG GIT_SHA
ARG BUILD_TIME

# Set working directory
WORKDIR /app

# Install git and ca-certificates (needed for go mod download)
RUN apk add --no-cache git ca-certificates

# Copy go mod files
COPY go.mod go.sum ./

# Download dependencies
RUN go mod download

# Copy source code
COPY . .

# Build the application
# CGO_ENABLED=0 creates a static binary
# GOOS=linux ensures Linux compatibility
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o user-service ./cmd/server

# Stage 2: Create the final image
FROM alpine:latest

# Accept build metadata
ARG GIT_SHA
ARG BUILD_TIME

# Install ca-certificates for HTTPS requests
RUN apk --no-cache add ca-certificates

# Embed build metadata as labels and env
LABEL org.opencontainers.image.revision="$GIT_SHA" \
      org.opencontainers.image.created="$BUILD_TIME"
ENV GIT_SHA="$GIT_SHA" \
    BUILD_TIME="$BUILD_TIME"

# Create a non-root user
RUN addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup

# Set working directory
WORKDIR /app

# Copy the binary from builder stage
COPY --from=builder /app/user-service .

# Change ownership to non-root user
RUN chown appuser:appgroup /app/user-service

# Switch to non-root user
USER appuser

# Expose port 8083 (user-service default when USER_PORT is unset)
EXPOSE 8083

# Health check (liveness-only, avoid DB ping)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8083/live || exit 1

# Run the application
CMD ["./user-service"]
