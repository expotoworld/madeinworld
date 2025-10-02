#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)
cd "$SCRIPT_DIR"

echo "Tidying modules..."
go mod tidy

echo "Running tests (if any)..."
go test ./... || true

echo "Building binary..."
CGO_ENABLED=0 GOOS=linux go build -o ebook-service ./cmd/server

echo "Done."

