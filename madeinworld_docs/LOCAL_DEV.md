# Local Development Guide

This guide explains how to run the Made in World stack locally using separate Neon dev databases and environment-specific app configs.

## Overview

- Backends (Go): run locally with per-service `.env` files (ignored by git). Use a Neon dev branch/DB for local development.
- Flutter app: run with flavors and prewired --dart-define to point at local or cloud backends.
- Admin panel (React): use `.env.development` or `.env.production` to switch API base.

## Databases (Neon)

Use a dedicated dev branch/DB for local. Extract these fields from your Neon connection string:
- DB_HOST
- DB_PORT (usually 5432)
- DB_USER
- DB_PASSWORD (keep private)
- DB_NAME
- DB_SSLMODE (usually `require`)

Create a `.env` in each backend service with those fields plus service-specific settings. See the `.env.example` in each service.

## Backends (Go services)

Services live under `backend/*-service`.

1) Copy examples:

- `cp backend/auth-service/.env.example backend/auth-service/.env`
- `cp backend/catalog-service/.env.example backend/catalog-service/.env`
- `cp backend/order-service/.env.example backend/order-service/.env`
- `cp backend/user-service/.env.example backend/user-service/.env`

2) Edit each `.env` to include your Neon dev credentials and local ports.

3) Run services (examples):

- `cd backend/catalog-service && go run ./cmd/server` (or your project entry point)
- `cd backend/auth-service && go run ./cmd/server`
- `cd backend/order-service && go run ./cmd/server`
- `cd backend/user-service && go run ./cmd/server`

Ensure ports match what the Flutter app/admin panel expect (8080/8081/8082/8083 by default).

## Flutter app

- Dev (iOS simulator): `bash scripts/flutter_dev_ios.sh`
- Dev (Android emulator): `bash scripts/flutter_dev_android.sh`
- Prod (Cloud): `bash scripts/flutter_prod.sh`

Notes:
- Android emulator uses `http://10.0.2.2:8080` to reach your host.
- iOS simulator can use `http://localhost:8080`.
- Real devices: use your Mac LAN IP, e.g. `http://192.168.x.x:8080`.

## Admin panel

- Dev: `cp admin-panel/.env.development.example admin-panel/.env.development` then `cd admin-panel && npm run start`
- Prod: `cp admin-panel/.env.production.example admin-panel/.env.production` then `npm run build && npx serve -s build`

## Security

- `.env` files are ignored by git (see root `.gitignore`). Never commit secrets.
- Cloud secrets are managed via AWS Secrets Manager and injected into App Runner services.

## Troubleshooting

- CORS: local services already allow all origins (*) for development.
- DB connection: confirm Neon host/user/password/SSL settings and that IP allow-lists or access controls permit connections.
- Android networking: use `10.0.2.2` instead of `localhost` when calling your laptop from the emulator.

