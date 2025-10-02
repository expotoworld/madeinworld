# Minimal Dockerfile for ebook-service
FROM golang:1.23 as builder
WORKDIR /app
COPY . .
RUN --mount=type=cache,target=/go/pkg/mod \
    go mod tidy && \
    CGO_ENABLED=0 GOOS=linux go build -o /ebook-service ./cmd/server

FROM gcr.io/distroless/base-debian12
WORKDIR /
COPY --from=builder /ebook-service /ebook-service
EXPOSE 8084
USER nonroot:nonroot
ENTRYPOINT ["/ebook-service"]
