#!/usr/bin/env bash
set -euo pipefail

# Run ebook-service locally with env from .env and sensible defaults
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)
cd "$SCRIPT_DIR"

if [[ -f .env ]]; then
  # export variables from .env (supports lines like: export KEY=VAL or KEY=VAL)
  set -a
  source .env
  set +a
fi

# Default port aligns with ebook-editor vite proxy
: "${PORT:=8084}"
export PORT

echo "Starting ebook-service on :$PORT (EDITOR_ORIGIN=${EDITOR_ORIGIN:-*})"
exec go run ./cmd/server

