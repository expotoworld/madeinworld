# terraform/app_runner/iam.tf

# Current account

# Account identity for building ARNs without creating graph cycles

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

# Dedicated instance role for auth-service (to use SNS publish)
resource "aws_iam_role" "apprunner_instance_role_auth" {
  name = "${var.project}-apprunner-instance-role-auth"

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

# Reuse existing secrets policy for auth role
resource "aws_iam_role_policy_attachment" "apprunner_auth_secrets_access" {
  role       = aws_iam_role.apprunner_instance_role_auth.name
  policy_arn = aws_iam_policy.apprunner_secrets_policy.arn
}

# Reuse S3 put policy for auth role (compatibility)
resource "aws_iam_role_policy_attachment" "apprunner_auth_s3_put_attach" {
  role       = aws_iam_role.apprunner_instance_role_auth.name
  policy_arn = aws_iam_policy.apprunner_s3_put_policy.arn
}

# SNS publish policy for auth-service
data "aws_iam_policy_document" "apprunner_auth_sns_doc" {
  statement {
    effect  = "Allow"
    actions = [
      "sns:Publish",
      "sns:GetSMSAttributes"
    ]
    resources = ["*"]
  }
}

resource "aws_iam_policy" "apprunner_auth_sns_policy" {
  name        = "${var.project}-apprunner-auth-sns"
  description = "Allow auth-service to publish SMS via SNS"
  policy      = data.aws_iam_policy_document.apprunner_auth_sns_doc.json
}

resource "aws_iam_role_policy_attachment" "apprunner_auth_sns_attach" {
  role       = aws_iam_role.apprunner_instance_role_auth.name
  policy_arn = aws_iam_policy.apprunner_auth_sns_policy.arn
}

# SES send email policy for auth-service
data "aws_iam_policy_document" "apprunner_auth_ses_doc" {
  statement {
    effect  = "Allow"
    actions = [
      "ses:SendEmail",
      "ses:SendRawEmail"
    ]
    resources = ["*"]
  }
}

resource "aws_iam_policy" "apprunner_auth_ses_policy" {
  name        = "${var.project}-apprunner-auth-ses"
  description = "Allow auth-service to send email via SES"
  policy      = data.aws_iam_policy_document.apprunner_auth_ses_doc.json
}

resource "aws_iam_role_policy_attachment" "apprunner_auth_ses_attach" {
  role       = aws_iam_role.apprunner_instance_role_auth.name
  policy_arn = aws_iam_policy.apprunner_auth_ses_policy.arn
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
      "arn:aws:s3:::madeinworld-product-images-admin/*",
      "arn:aws:s3:::madeinworld-ebook-versions-eu-central-1/*"
    ]
  }
}

resource "aws_iam_policy" "apprunner_s3_put_policy" {
  name        = "${var.project}-apprunner-s3-put"
  description = "Allow App Runner instance role to upload objects to product images bucket"
  policy      = data.aws_iam_policy_document.apprunner_s3_put_doc.json
  depends_on  = [aws_iam_role_policy_attachment.github_actions_policy_version_mgmt_attach]
}

resource "aws_iam_role_policy_attachment" "apprunner_s3_put_attach" {
  role       = aws_iam_role.apprunner_instance_role.name
  policy_arn = aws_iam_policy.apprunner_s3_put_policy.arn
}


# Allow GitHub Actions OIDC role to pass the App Runner ECR access role during updates
# This fixes AccessDenied: iam:PassRole when Terraform updates App Runner services
data "aws_iam_policy_document" "github_actions_passrole_doc" {
  statement {
    effect  = "Allow"
    actions = ["iam:PassRole"]
    resources = [
      aws_iam_role.apprunner_ecr_access_role.arn,
      aws_iam_role.apprunner_instance_role.arn,
      aws_iam_role.apprunner_instance_role_auth.arn,
    ]
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

# Read-only Cost Explorer permission for GitHub Actions to detect existing anomaly monitors
# and subscriptions in us-east-1.
data "aws_iam_policy_document" "github_actions_ce_read_doc" {
  statement {
    effect  = "Allow"
    actions = [
      "ce:GetAnomalyMonitors",
      "ce:GetAnomalySubscriptions",
      "ce:CreateAnomalySubscription",
      "ce:UpdateAnomalySubscription",
      "ce:DeleteAnomalySubscription"
    ]
    resources = ["*"]
  }
}

resource "aws_iam_policy" "github_actions_ce_read" {
  name        = "${var.project}-github-actions-ce-read"
  description = "Allow GitHub Actions to read CE anomaly monitors"
  policy      = data.aws_iam_policy_document.github_actions_ce_read_doc.json
}

resource "aws_iam_role_policy_attachment" "github_actions_ce_read_attach" {
  role       = "GitHubActions-MadeInWorld-Role"
  policy_arn = aws_iam_policy.github_actions_ce_read.arn
}

# Allow GitHub Actions to deploy editor site to S3 bucket
# Grants ListBucket on the bucket and Put/Delete on objects

data "aws_iam_policy_document" "github_actions_editor_deploy_doc" {
  statement {
    effect  = "Allow"
    actions = ["s3:ListBucket"]
    resources = ["arn:aws:s3:::${var.editor_site_bucket}"]
  }
  statement {
    effect  = "Allow"
    actions = [
      "s3:PutObject",
      "s3:DeleteObject",
      "s3:PutObjectAcl"
    ]
    resources = ["arn:aws:s3:::${var.editor_site_bucket}/*"]
  }
}

resource "aws_iam_policy" "github_actions_editor_deploy" {
  name        = "${var.project}-github-actions-editor-deploy"
  description = "Allow GitHub Actions OIDC role to sync editor site to S3"
  policy      = data.aws_iam_policy_document.github_actions_editor_deploy_doc.json
}

resource "aws_iam_role_policy_attachment" "github_actions_editor_deploy_attach" {
  role       = "GitHubActions-MadeInWorld-Role"
  policy_arn = aws_iam_policy.github_actions_editor_deploy.arn
}

# Allow GitHub Actions role to manage versions of the apprunner S3 put policy
# Needed because Terraform updates the customer-managed policy and may need to delete old versions
# to stay within AWS's 5-version limit.
data "aws_iam_policy_document" "github_actions_policy_version_mgmt_doc" {
  statement {
    effect  = "Allow"
    actions = [
      "iam:CreatePolicyVersion",
      "iam:DeletePolicyVersion"
    ]
    resources = [
      "arn:aws:iam::${data.aws_caller_identity.current.account_id}:policy/${var.project}-apprunner-s3-put"
    ]
  }
}

resource "aws_iam_policy" "github_actions_policy_version_mgmt" {
  name        = "${var.project}-github-actions-policy-version-mgmt"
  description = "Allow GitHub Actions to manage versions of apprunner S3 put policy"
  policy      = data.aws_iam_policy_document.github_actions_policy_version_mgmt_doc.json
}

resource "aws_iam_role_policy_attachment" "github_actions_policy_version_mgmt_attach" {
  role       = "GitHubActions-MadeInWorld-Role"
  policy_arn = aws_iam_policy.github_actions_policy_version_mgmt.arn
}

