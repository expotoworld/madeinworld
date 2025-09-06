// AWS Cost Anomaly Detection for Amazon CloudWatch service
// Note: Cost Explorer/Anomaly Detection API is in us-east-1

# If an existing DIMENSIONAL SERVICE monitor ARN is provided, skip creating a new monitor
resource "aws_ce_anomaly_monitor" "cloudwatch_service" {
  count             = var.ce_monitor_arn == "" ? 1 : 0
  provider          = aws.us_east_1
  name              = "cloudwatch-service-monitor"
  monitor_type      = "DIMENSIONAL"
  monitor_dimension = "SERVICE"
}

# Resolve the monitor ARN (existing via variable or newly created by this stack)
locals {
  resolved_ce_monitor_arn = var.ce_monitor_arn != "" ? var.ce_monitor_arn : (length(aws_ce_anomaly_monitor.cloudwatch_service) > 0 ? aws_ce_anomaly_monitor.cloudwatch_service[0].arn : "")
}

resource "aws_ce_anomaly_subscription" "cloudwatch_alerts" {
  provider  = aws.us_east_1
  name      = "cloudwatch-anomaly-alerts"
  frequency = "DAILY"

  monitor_arn_list = [local.resolved_ce_monitor_arn]

  threshold_expression {
    and {
      dimension {
        key           = "ANOMALY_TOTAL_IMPACT_ABSOLUTE"
        values        = ["5"] // USD absolute daily impact
        match_options = ["GREATER_THAN_OR_EQUAL"]
      }
    }
  }

  subscriber {
    type    = "EMAIL"
    address = "expotobsrl@gmail.com"
  }
}
