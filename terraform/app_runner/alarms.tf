# CloudWatch Alarms for App Runner services

# Inputs
variable "alarm_5xx_threshold" {
  type    = number
  default = 5
}

variable "alarm_latency_p95_ms" {
  type    = number
  default = 1000
}

# Optional SNS topic for alarm notifications (email). Created only if email provided.
variable "alarm_notification_email" {
  type    = string
  default = ""
}

resource "aws_sns_topic" "apprunner_alarms" {
  count = length(trimspace(var.alarm_notification_email)) > 0 ? 1 : 0
  name  = "${var.project}-apprunner-alarms"
}

# Avoid reading subscription before it’s confirmed; only create the subscription
# resource when an email is provided and confirmation is expected. The provider
# will still call GetSubscriptionAttributes during create. Ensure the CI role has
# sns:GetSubscriptionAttributes, or skip subscription creation in CI by setting
# email empty.
resource "aws_sns_topic_subscription" "apprunner_alarms_email" {
  count     = length(trimspace(var.alarm_notification_email)) > 0 ? 1 : 0
  topic_arn = aws_sns_topic.apprunner_alarms[0].arn
  protocol  = "email"
  endpoint  = var.alarm_notification_email
}

locals {
  alarm_services  = [for name, _ in local.services : name]
  alarm_topic_arn = length(trimspace(var.alarm_notification_email)) > 0 ? aws_sns_topic.apprunner_alarms[0].arn : null
}


# For each service in local.services, create alarms based on App Runner metrics.
# Namespace and metric names per AWS docs:
# - Namespace: AWS/AppRunner
# - Service-level dimensions: ServiceName
# - Metrics: Requests, 5xxStatusResponses, RequestLatency


# 5xx count over 5 minutes
resource "aws_cloudwatch_metric_alarm" "apprunner_5xx" {
  for_each            = toset(local.alarm_services)
  alarm_name          = "${var.project}-${each.key}-5xx"
  alarm_description   = "${each.key}: 5xx responses in 5 minutes exceeds ${var.alarm_5xx_threshold}"
  namespace           = "AWS/AppRunner"
  metric_name         = "5xxStatusResponses"
  dimensions          = { ServiceName = "${var.project}-${each.key}-dev" }
  statistic           = "Sum"
  period              = 60
  evaluation_periods  = 5
  threshold           = var.alarm_5xx_threshold
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_topic_arn != null ? [local.alarm_topic_arn] : []
  ok_actions          = local.alarm_topic_arn != null ? [local.alarm_topic_arn] : []
}

# p95 latency over 5 minutes
resource "aws_cloudwatch_metric_alarm" "apprunner_latency_p95" {
  for_each            = toset(local.alarm_services)
  alarm_name          = "${var.project}-${each.key}-latency-p95"
  alarm_description   = "${each.key}: p95 latency exceeds ${var.alarm_latency_p95_ms} ms"
  namespace           = "AWS/AppRunner"
  metric_name         = "RequestLatency"
  dimensions          = { ServiceName = "${var.project}-${each.key}-dev" }
  extended_statistic  = "p95"
  period              = 60
  evaluation_periods  = 5
  threshold           = var.alarm_latency_p95_ms
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_topic_arn != null ? [local.alarm_topic_arn] : []
  ok_actions          = local.alarm_topic_arn != null ? [local.alarm_topic_arn] : []
}

