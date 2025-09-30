#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../madeinworld_app"
flutter run --flavor dev --dart-define=API_BASE=http://127.0.0.1:8787 "$@"