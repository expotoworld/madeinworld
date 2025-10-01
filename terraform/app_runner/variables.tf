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


variable "ses_from_email" {
  description = "The verified 'From' email address for SES."
  type        = string
}

# Enable-email validation: either all three are empty (email disabled) or all three are set (email enabled)

# Optional: Use an existing Cost Explorer DIMENSIONAL SERVICE anomaly monitor by ARN
# By default, we DO NOT create a new monitor to avoid hitting account limits.
variable "ce_monitor_arn" {
  description = "Existing Cost Explorer anomaly monitor ARN to use (DIMENSIONAL SERVICE)."
  type        = string
  default     = ""
}

# Explicit opt-in to create a DIMENSIONAL SERVICE anomaly monitor if none exists.
# This should remain false in CI; enable only when you intend to create a new monitor.
variable "create_ce_anomaly_monitor" {
  description = "Whether to create a new Cost Explorer DIMENSIONAL SERVICE anomaly monitor if ce_monitor_arn is empty."
  type        = bool
  default     = false
}

# Enable/disable the auth /live CloudWatch Synthetics canary
variable "enable_auth_ready_canary" {
  description = "Whether to create and run the CloudWatch Synthetics canary for auth /live."
  type        = bool
  default     = false
}
