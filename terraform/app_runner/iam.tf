# terraform/app_runner/iam.tf

# Current account

# App Runner ECR access role (assumed by App Runner to pull from ECR)
resource "aws_iam_role" "apprunner_ecr_access_role" {
  name = "${var.project}-apprunner-ecr-access-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect    = "Allow",
        Principal = { Service = "build.apprunner.amazonaws.com" },
        Action    = "sts:AssumeRole"
      }
    ]
  })
}

# Attach AWS managed policy for ECR access
resource "aws_iam_role_policy_attachment" "apprunner_ecr_access_managed" {
  role       = aws_iam_role.apprunner_ecr_access_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess"
}

# Instance role for running App Runner service (to read Secrets Manager)
resource "aws_iam_role" "apprunner_instance_role" {
  name = "${var.project}-apprunner-instance-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect    = "Allow",
        Principal = { Service = "tasks.apprunner.amazonaws.com" },
        Action    = "sts:AssumeRole"
      }
    ]
  })
}

# Construct policy document granting read access to specified secret ARNs
data "aws_iam_policy_document" "apprunner_secrets_doc" {
  dynamic "statement" {
    for_each = toset(local.secret_arns)
    content {
      effect    = "Allow"
      actions   = ["secretsmanager:GetSecretValue"]
      resources = [statement.value]
    }
  }
}

# Customer managed policy with least-privilege secret access
resource "aws_iam_policy" "apprunner_secrets_policy" {
  name        = "${var.project}-apprunner-secrets-policy"
  description = "App Runner instance role can read necessary secrets"
  policy      = data.aws_iam_policy_document.apprunner_secrets_doc.json
}

# Attach secrets policy to instance role
resource "aws_iam_role_policy_attachment" "apprunner_secrets_access" {
  role       = aws_iam_role.apprunner_instance_role.name
  policy_arn = aws_iam_policy.apprunner_secrets_policy.arn
}


# Allow App Runner instance role to write product images to S3
data "aws_iam_policy_document" "apprunner_s3_put_doc" {
  statement {
    effect = "Allow"
    actions = [
      "s3:PutObject",
      "s3:PutObjectAcl"
    ]
    resources = [
      "arn:aws:s3:::madeinworld-product-images-admin/*"
    ]
  }
}

resource "aws_iam_policy" "apprunner_s3_put_policy" {
  name        = "${var.project}-apprunner-s3-put"
  description = "Allow App Runner instance role to upload objects to product images bucket"
  policy      = data.aws_iam_policy_document.apprunner_s3_put_doc.json
}

resource "aws_iam_role_policy_attachment" "apprunner_s3_put_attach" {
  role       = aws_iam_role.apprunner_instance_role.name
  policy_arn = aws_iam_policy.apprunner_s3_put_policy.arn
}


# Allow GitHub Actions OIDC role to pass the App Runner ECR access role during updates
# This fixes AccessDenied: iam:PassRole when Terraform updates App Runner services
data "aws_iam_policy_document" "github_actions_passrole_doc" {
  statement {
    effect    = "Allow"
    actions   = ["iam:PassRole"]
    resources = [aws_iam_role.apprunner_ecr_access_role.arn]
  }
}

resource "aws_iam_policy" "github_actions_passrole" {
  name        = "${var.project}-github-actions-pass-apprunner-ecr-role"
  description = "Allow GitHub Actions role to pass App Runner ECR access role"
  policy      = data.aws_iam_policy_document.github_actions_passrole_doc.json
}

resource "aws_iam_role_policy_attachment" "github_actions_passrole_attach" {
  role       = "GitHubActions-MadeInWorld-Role"
  policy_arn = aws_iam_policy.github_actions_passrole.arn
}
