# terraform/variables.tf

variable "aws_region" {
  description = "The AWS region to deploy resources in."
  type        = string
  default     = "eu-central-1"
}

variable "project" {
  description = "The name of the project."
  type        = string
  default     = "madeinworld"
}

variable "neon_db_host" {
  description = "Hostname for the Neon PostgreSQL database."
  type        = string
  sensitive   = true
  validation {
    condition     = length(trimspace(var.neon_db_host)) > 0
    error_message = "neon_db_host must be provided."
  }
}

variable "neon_db_user" {
  description = "Username for the Neon PostgreSQL database."
  type        = string
  sensitive   = true
  validation {
    condition     = length(trimspace(var.neon_db_user)) > 0
    error_message = "neon_db_user must be provided."
  }
}

variable "neon_db_name" {
  description = "Database name for the Neon PostgreSQL database."
  type        = string
  validation {
    condition     = length(trimspace(var.neon_db_name)) > 0
    error_message = "neon_db_name must be provided."
  }
}

variable "secret_arn_db_password" {
  description = "ARN of the AWS Secrets Manager secret for the DB password."
  type        = string
  sensitive   = true
  validation {
    condition     = length(trimspace(var.secret_arn_db_password)) > 0
    error_message = "secret_arn_db_password is required and must be a non-empty ARN."
  }
}

variable "secret_arn_jwt_secret" {
  description = "ARN of the AWS Secrets Manager secret for the JWT secret."
  type        = string
  sensitive   = true
  validation {
    condition     = length(trimspace(var.secret_arn_jwt_secret)) > 0
    error_message = "secret_arn_jwt_secret is required and must be a non-empty ARN."
  }
}

variable "secret_arn_ses_user" {
  description = "ARN of the AWS Secrets Manager secret for the SES SMTP username."
  type        = string
  sensitive   = true
}

variable "secret_arn_ses_pass" {
  description = "ARN of the AWS Secrets Manager secret for the SES SMTP password."
  type        = string
  sensitive   = true
}

variable "ses_from_email" {
  description = "The verified 'From' email address for SES."
  type        = string
}

# Enable-email validation: either all three are empty (email disabled) or all three are set (email enabled)
locals {
  _ses_any_set = length(trimspace(var.ses_from_email)) > 0 || length(trimspace(var.secret_arn_ses_user)) > 0 || length(trimspace(var.secret_arn_ses_pass)) > 0
}

# Using a null_resource to host a precondition-like validation because variable blocks cannot express cross-variable conditions directly.
resource "null_resource" "validate_email_trio" {
  lifecycle {
    precondition {
      condition     = (local._ses_any_set == false) || (length(trimspace(var.ses_from_email)) > 0 && length(trimspace(var.secret_arn_ses_user)) > 0 && length(trimspace(var.secret_arn_ses_pass)) > 0)
      error_message = "To enable email, set SES_FROM_EMAIL and both SES SMTP secret ARNs (user+pass). Otherwise leave all three empty."
    }
  }
}

# Optional: Use an existing Cost Explorer DIMENSIONAL SERVICE anomaly monitor by ARN
# If empty, Terraform will attempt to create a new monitor (subject to AWS account limits)
variable "ce_monitor_arn" {
  description = "Existing Cost Explorer anomaly monitor ARN to use (DIMENSIONAL SERVICE). Leave empty to create one."
  type        = string
  default     = ""
}
