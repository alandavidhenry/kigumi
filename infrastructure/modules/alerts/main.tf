# Alerts from docs/operations.md. The app logs one JSON object per line to
# stdout (ADR 0020); only exceptions reach Application Insights, so the event
# alerts read the App Service console logs, which the diagnostic setting below
# sends to Log Analytics.

resource "azurerm_monitor_action_group" "main" {
  name                = "ag-${var.project}-${var.environment}"
  resource_group_name = var.resource_group_name
  short_name          = "kigumi"
  tags                = var.tags

  dynamic "email_receiver" {
    for_each = var.email_addresses
    content {
      name                    = "email-${email_receiver.key}"
      email_address           = email_receiver.value
      use_common_alert_schema = true
    }
  }
}

resource "azurerm_monitor_diagnostic_setting" "console_logs" {
  name                       = "console-logs"
  target_resource_id         = var.app_service_id
  log_analytics_workspace_id = var.workspace_id

  enabled_log {
    category = "AppServiceConsoleLogs"
  }
}

resource "azurerm_monitor_metric_alert" "server_errors" {
  name                = "alert-${var.project}-${var.environment}-5xx"
  resource_group_name = var.resource_group_name
  scopes              = [var.app_service_id]
  description         = "Server errors (HTTP 5xx)"
  severity            = 2
  frequency           = "PT5M"
  window_size         = "PT15M"
  tags                = var.tags

  criteria {
    metric_namespace = "Microsoft.Web/sites"
    metric_name      = "Http5xx"
    aggregation      = "Total"
    operator         = "GreaterThan"
    threshold        = 5
  }

  action {
    action_group_id = azurerm_monitor_action_group.main.id
  }
}

resource "azurerm_monitor_metric_alert" "liveness" {
  name                = "alert-${var.project}-${var.environment}-liveness"
  resource_group_name = var.resource_group_name
  scopes              = [var.app_service_id]
  description         = "App Service health check failing"
  severity            = 1
  frequency           = "PT5M"
  window_size         = "PT15M"
  tags                = var.tags

  criteria {
    metric_namespace = "Microsoft.Web/sites"
    metric_name      = "HealthCheckStatus"
    aggregation      = "Average"
    operator         = "LessThan"
    threshold        = 100
  }

  action {
    action_group_id = azurerm_monitor_action_group.main.id
  }
}

locals {
  # Alerts that fire when matching events appear in the window.
  event_alerts = {
    unhandled-error = {
      description = "Unhandled API or request error"
      severity    = 3
      events      = ["api.unhandled_error", "request.error"]
      threshold   = 0
      window      = "PT15M"
    }
    ai-cap-reached = {
      description = "AI paused for everyone (daily cap reached)"
      severity    = 2
      events      = ["ai.daily_cap_reached"]
      threshold   = 0
      window      = "PT1H"
    }
    ai-free-share = {
      description = "AI Free-tier share used up; consider raising the cap"
      severity    = 4
      events      = ["ai.daily_free_share_reached"]
      threshold   = 0
      window      = "PT1H"
    }
    ai-provider = {
      description = "AI provider failing"
      severity    = 3
      events      = ["ai.provider_error"]
      threshold   = 5
      window      = "PT15M"
    }
    reminders-failing = {
      description = "Reminders failing"
      severity    = 3
      events      = ["reminders.organisation_failed", "reminders.email_failed"]
      threshold   = 0
      window      = "PT1H"
    }
    orphan-sweep = {
      description = "Orphan sweep stopped; check the container"
      severity    = 2
      events      = ["housekeeping.orphan_sweep_stopped"]
      threshold   = 0
      window      = "PT1H"
    }
  }

  # Alerts that fire when an expected event is missing.
  missing_alerts = {
    reminders-missing = {
      description = "Reminders cron has not finished in 26 hours"
      event       = "cron.reminders.finished"
    }
    housekeeping-missing = {
      description = "Housekeeping cron has not finished in 26 hours"
      event       = "cron.housekeeping.finished"
    }
  }
}

resource "azurerm_monitor_scheduled_query_rules_alert_v2" "event" {
  for_each = local.event_alerts

  name                 = "alert-${var.project}-${var.environment}-${each.key}"
  resource_group_name  = var.resource_group_name
  location             = var.location
  description          = each.value.description
  severity             = each.value.severity
  scopes               = [var.workspace_id]
  evaluation_frequency = "PT5M"
  window_duration      = each.value.window
  tags                 = var.tags

  criteria {
    query                   = "AppServiceConsoleLogs | where ${join(" or ", [for e in each.value.events : "ResultDescription has '\"event\":\"${e}\"'"])}"
    time_aggregation_method = "Count"
    operator                = "GreaterThan"
    threshold               = each.value.threshold
  }

  action {
    action_groups = [azurerm_monitor_action_group.main.id]
  }
}

resource "azurerm_monitor_scheduled_query_rules_alert_v2" "missing" {
  for_each = local.missing_alerts

  name                 = "alert-${var.project}-${var.environment}-${each.key}"
  resource_group_name  = var.resource_group_name
  location             = var.location
  description          = each.value.description
  severity             = 3
  scopes               = [var.workspace_id]
  evaluation_frequency = "PT1H"
  window_duration      = "P2D"
  tags                 = var.tags

  criteria {
    query                   = "AppServiceConsoleLogs | where ResultDescription has '\"event\":\"${each.value.event}\"'"
    time_aggregation_method = "Count"
    operator                = "LessThan"
    threshold               = 1
  }

  action {
    action_groups = [azurerm_monitor_action_group.main.id]
  }
}
