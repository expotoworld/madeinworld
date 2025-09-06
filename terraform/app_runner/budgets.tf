// AWS Budgets for Amazon CloudWatch (monthly) with email alerts at >80% ACTUAL and FORECASTED
// Note: Budgets API is only available in us-east-1

resource "aws_budgets_budget" "cloudwatch_monthly" {
  provider    = aws.us_east_1
  name        = "cloudwatch-monthly"
  budget_type = "COST"

  limit_amount = 10
  limit_unit   = "USD"

  time_unit = "MONTHLY"

  cost_filter {
    name   = "Service"
    values = ["Amazon CloudWatch"]
  }

  notification {
    comparison_operator = "GREATER_THAN"
    threshold           = 80
    threshold_type      = "PERCENTAGE"
    notification_type   = "FORECASTED"
    subscriber_email_addresses = ["expotobsrl@gmail.com"]
  }

  notification {
    comparison_operator = "GREATER_THAN"
    threshold           = 80
    threshold_type      = "PERCENTAGE"
    notification_type   = "ACTUAL"
    subscriber_email_addresses = ["expotobsrl@gmail.com"]
  }
}

