module "log_analytics" {
  source  = "Azure/avm-res-operationalinsights-workspace/azurerm"
  version = "0.5.1"

  name                                      = "log-${var.project}-${var.environment}"
  location                                  = var.location
  resource_group_name                       = var.resource_group_name
  log_analytics_workspace_sku               = "PerGB2018"
  log_analytics_workspace_retention_in_days = var.retention_in_days
  tags                                      = var.tags
  enable_telemetry                          = var.enable_telemetry
}

module "application_insights" {
  source  = "Azure/avm-res-insights-component/azurerm"
  version = "0.5.0"

  name      = "appi-${var.project}-${var.environment}"
  location  = var.location
  parent_id = var.resource_group_id
  # The ARM API accepts "web" or "other"; the azurerm-only "Node.JS" value is
  # not valid here. The type only affects portal defaults.
  application_type = "web"
  workspace_id     = module.log_analytics.resource_id
  tags             = var.tags
  enable_telemetry = var.enable_telemetry
}
