# CloudWatch cost guard: monthly budget and email alerts

resource "aws_budgets_budget" "cloudwatch_monthly" {
  name              = "cloudwatch-monthly-budget"
  budget_type       = "COST"
  time_unit         = "MONTHLY"

  limit_amount      = "5"       # USD
  limit_unit        = "USD"

  cost_filters = {
    Service = ["Amazon CloudWatch"]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = ["expotobsrl@gmail.com"]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = ["expotobsrl@gmail.com"]
  }
}

