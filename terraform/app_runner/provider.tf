# terraform/app_runner/provider.tf

terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
  }

  # Remote backend for shared state across CI and local
  # Values provided at init via -backend-config flags
  backend "s3" {}
}

provider "aws" {
  region = var.aws_region
}


# Budgets is a global service (us-east-1)
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}
