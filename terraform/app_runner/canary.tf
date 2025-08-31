# CloudWatch Synthetics Canary for auth-service /ready endpoint

locals {
  synthetics_bucket_name = "${var.project}-synthetics-artifacts"
}

data "aws_s3_bucket" "synthetics_artifacts" {
  bucket = local.synthetics_bucket_name
}

data "aws_iam_role" "synthetics_role" {
  name = "${var.project}-synthetics-role"
}

resource "aws_iam_role_policy_attachment" "synthetics_full_access" {
  role       = data.aws_iam_role.synthetics_role.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchSyntheticsFullAccess"
}

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = data.aws_iam_role.synthetics_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "s3_rw" {
  role       = data.aws_iam_role.synthetics_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonS3FullAccess"
}

resource "aws_iam_role_policy" "synthetics_putmetrics" {
  name = "${var.project}-synthetics-putmetrics"
  role = data.aws_iam_role.synthetics_role.name
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Effect   = "Allow",
      Action   = ["cloudwatch:PutMetricData"],
      Resource = "*"
    }]
  })
}

# Canary that polls auth-service /ready every 2 minutes
resource "aws_synthetics_canary" "auth_ready" {
  name                 = "${var.project}-auth-ready"
  artifact_s3_location = "s3://${data.aws_s3_bucket.synthetics_artifacts.bucket}"
  execution_role_arn   = data.aws_iam_role.synthetics_role.arn
  handler              = "index.handler"
  zip_file             = data.archive_file.auth_ready_zip.output_path

  runtime_version = "syn-nodejs-puppeteer-11.0"
  start_canary    = true
  schedule {
    expression = var.canary_schedule_expression
  }

  run_config {
    environment_variables = {
      TARGET_URL = "${aws_apprunner_service.main_services["auth-service"].service_url}/live"
    }
  }

}

variable "canary_schedule_expression" {
  description = "Schedule for the readiness canary"
  type        = string
  default     = "rate(24 hours)"
}

