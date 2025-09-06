#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../madeinworld_app"
flutter run --flavor prod --dart-define=API_BASE=https://device-api.expomadeinworld.com "$@"

