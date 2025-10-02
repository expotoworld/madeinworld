# Minimal Dockerfile for ebook-service
<<<<<<< HEAD
FROM golang:1.23 as builder
=======
FROM golang:1.22 as builder
>>>>>>> origin/main
WORKDIR /app
COPY . .
RUN --mount=type=cache,target=/go/pkg/mod \
    go mod tidy && \
    CGO_ENABLED=0 GOOS=linux go build -o /ebook-service ./cmd/server

FROM gcr.io/distroless/base-debian12
WORKDIR /
COPY --from=builder /ebook-service /ebook-service
<<<<<<< HEAD
EXPOSE 8084
=======
EXPOSE 8080
>>>>>>> origin/main
USER nonroot:nonroot
ENTRYPOINT ["/ebook-service"]

