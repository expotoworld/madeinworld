#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../madeinworld_app"
flutter run --flavor dev --dart-define=API_BASE=http://localhost:8080 "$@"

