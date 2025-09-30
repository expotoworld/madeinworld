# Compute Strategy

Official compute path for the Made in World project.

## TL;DR

- Primary compute: AWS App Runner (one service per Go microservice)
- Edge ingress: Cloudflare Worker `device-api.expomadeinworld.com`
- Databases: Neon (global). Use separate branches/DBs per env (dev vs prod/staging)
- Secrets: AWS Secrets Manager (App Runner fetches at runtime via IAM)
- Legacy Kubernetes/EKS: deprecated and removed from the plan

## Local vs Cloud

- Local dev: run Go services locally with a `.env` (DB_HOST/USER/PASSWORD/NAME/SSL, PORT)
- Cloud: CI builds images and updates App Runner on push to `main`
- Flutter/Admin target either local or cloud by switching base URLs

## CI/CD

- `.github/workflows/deploy-app-runner.yml`: builds/pushes images and updates App Runner on every push to `main`
- `.github/workflows/terraform-app-runner-apply.yml`: runs only when `terraform/app_runner/**` changes; provisions/updates infra and outputs URLs

## Quick commands

- Flutter (dev):
  - iOS sim: `bash scripts/flutter_dev_ios.sh`
  - Android emu: `bash scripts/flutter_dev_android.sh`
- Flutter (prod cloud):
  - `bash scripts/flutter_prod.sh`
- Admin panel:
  - Dev: copy `.env.development.example` -> `.env.development`, then `npm run start`
  - Prod: copy `.env.production.example` -> `.env.production`, then `npm run build && npx serve -s build`

## Notes

- Do not share databases between local and cloud. Create a dedicated Neon dev branch/DB for local.
- Never commit real secrets. Store cloud secrets in AWS Secrets Manager; keep local secrets in untracked `.env` files.