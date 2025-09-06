// AWS Cost Anomaly Detection for Amazon CloudWatch service
// Note: Cost Explorer/Anomaly Detection API is in us-east-1

resource "aws_ce_anomaly_monitor" "cloudwatch_service" {
  provider          = aws.us_east_1
  name              = "cloudwatch-service-monitor"
  monitor_type      = "DIMENSIONAL"
  monitor_dimension = "SERVICE"
}

resource "aws_ce_anomaly_subscription" "cloudwatch_alerts" {
  provider  = aws.us_east_1
  name      = "cloudwatch-anomaly-alerts"
  frequency = "DAILY"

  monitor_arn_list = [aws_ce_anomaly_monitor.cloudwatch_service.arn]

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

