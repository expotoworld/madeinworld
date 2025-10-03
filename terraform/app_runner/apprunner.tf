# terraform/app_runner/apprunner.tf

locals {
  db_secret_base  = replace(var.secret_arn_db_password, "/:[^:]+::$/", "")
  jwt_secret_base = replace(var.secret_arn_jwt_secret, "/:[^:]+::$/", "")

  # Build a clean list of secret ARNs (skip empty values) to avoid malformed IAM policies
  secret_arns = [for v in [
    length(trimspace(var.secret_arn_db_password)) > 0 ? local.db_secret_base : "",
    length(trimspace(var.secret_arn_db_password)) > 0 ? var.secret_arn_db_password : "",
    length(trimspace(var.secret_arn_jwt_secret)) > 0 ? local.jwt_secret_base : "",
    length(trimspace(var.secret_arn_jwt_secret)) > 0 ? var.secret_arn_jwt_secret : "",
  ] : v if v != ""]

  # Ensure we always use Neon connection pooler. If the provided host already contains
  # "-pooler.", keep it as-is. Otherwise, insert "-pooler" before the first dot.
  neon_host_parts        = split(".", var.neon_db_host)
  neon_pooler_host_guess = format("%s-pooler.%s", local.neon_host_parts[0], join(".", slice(local.neon_host_parts, 1, length(local.neon_host_parts))))
  neon_effective_db_host = can(regex("-pooler\\.", var.neon_db_host)) ? var.neon_db_host : local.neon_pooler_host_guess

  # Per-service (ebook) effective host: if override provided, ensure pooler host; otherwise fallback to global
  neon_effective_db_host_ebook = length(trimspace(var.neon_db_host_ebook_override)) > 0 ? (
    can(regex("-pooler\\.", var.neon_db_host_ebook_override)) ? var.neon_db_host_ebook_override :
    format(
      "%s-pooler.%s",
      split(".", var.neon_db_host_ebook_override)[0],
      join(".", slice(split(".", var.neon_db_host_ebook_override), 1, length(split(".", var.neon_db_host_ebook_override))))
    )
  ) : local.neon_effective_db_host

  services = {
    auth-service    = "8081"
    catalog-service = "8080"
    order-service   = "8082"
    user-service    = "8083"
    ebook-service   = "8084"
  }
}

data "aws_caller_identity" "current" {}

# Managed IAM resources are defined in iam.tf
# - aws_iam_role.apprunner_ecr_access_role
# - aws_iam_role.apprunner_instance_role
# - aws_iam_policy.apprunner_secrets_policy
# - aws_iam_role_policy_attachment.apprunner_secrets_access

resource "aws_iam_role_policy_attachment" "apprunner_ecr_access" {
  role       = aws_iam_role.apprunner_ecr_access_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess"
}

resource "aws_ecr_repository" "service_repos" {
  for_each             = local.services
  name                 = "${var.project}/${each.key}"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_apprunner_service" "main_services" {
  for_each     = local.services
  service_name                    = "${var.project}-${each.key}-dev"
  auto_scaling_configuration_arn = aws_apprunner_auto_scaling_configuration_version.default.arn

  lifecycle {
    ignore_changes = [
      # Let CI deploy job control the exact image tag; avoid thrashing with Terraform
      source_configuration[0].image_repository[0].image_identifier,
      # CI may normalize DB_PASSWORD secret ARN (strip :password::); avoid churn
      source_configuration[0].image_repository[0].image_configuration[0].runtime_environment_secrets,
    ]
  }


  source_configuration {
    authentication_configuration {
      access_role_arn = aws_iam_role.apprunner_ecr_access_role.arn
    }
    image_repository {
      image_identifier      = "${data.aws_caller_identity.current.account_id}.dkr.ecr.${var.aws_region}.amazonaws.com/${var.project}/${each.key}:latest"
      image_repository_type = "ECR"
      image_configuration {
        port = each.value
        runtime_environment_variables = merge({
          PORT               = each.value
          GIN_MODE           = "release"
          DB_HOST            = each.key == "ebook-service" ? local.neon_effective_db_host_ebook : local.neon_effective_db_host
          DB_PORT            = "5432"
          DB_USER            = each.key == "ebook-service" && length(trimspace(var.neon_db_user_ebook_override)) > 0 ? var.neon_db_user_ebook_override : var.neon_db_user
          DB_NAME            = each.key == "ebook-service" && length(trimspace(var.neon_db_name_ebook_override)) > 0 ? var.neon_db_name_ebook_override : var.neon_db_name
          DB_SSLMODE         = "require"
          SES_FROM_EMAIL     = var.ses_from_email
          AWS_DEFAULT_REGION = var.aws_region
          }, each.key == "catalog-service" ? {
          SERVICE_BASE_URL = "https://device-api.expomadeinworld.com"
          } : each.key == "auth-service" ? {
          ADMIN_EMAIL = "expotobsrl@gmail.com"
        } : each.key == "ebook-service" ? {
          EBOOK_S3_BUCKET   = "madeinworld-ebook-versions-eu-central-1"
          EDITOR_ORIGIN     = "https://huashangdao.expomadeinworld.com"
        } : {})
        runtime_environment_secrets = merge(
          {},
          (each.key == "ebook-service" && length(trimspace(var.secret_arn_db_password_ebook_override)) > 0)
            ? { DB_PASSWORD = var.secret_arn_db_password_ebook_override }
            : (length(trimspace(var.secret_arn_db_password)) > 0 ? { DB_PASSWORD = var.secret_arn_db_password } : {}),
          length(trimspace(var.secret_arn_jwt_secret)) > 0 ? { JWT_SECRET = var.secret_arn_jwt_secret } : {}
        )
      }
    }
    auto_deployments_enabled = true
  }

  instance_configuration {
    instance_role_arn = each.key == "auth-service" ? aws_iam_role.apprunner_instance_role_auth.arn : aws_iam_role.apprunner_instance_role.arn
    cpu               = "256"   # 0.25 vCPU
    memory            = "512"   # 0.5 GB
  }

  health_check_configuration {
    protocol = "HTTP"
    path     = "/live"
  }

  tags = {
    Project = var.project
    Phase   = "1"
  }
}

resource "aws_apprunner_auto_scaling_configuration_version" "default" {
  auto_scaling_configuration_name = "${var.project}-asc-default"
  max_concurrency                 = 50
  max_size                        = 2
  min_size                        = 1
}


# CloudWatch log groups created by App Runner are under:
# /aws/apprunner/${var.project}-${service}-dev/<service-id>/{service|application}
# We cannot know service-id at plan time reliably; retention is best applied post-create.
# The GitHub workflow will set retention for matching groups after apply.
