resource "azurerm_log_analytics_workspace" "main" {
  name                = "log-${var.project}-${var.environment}"
  resource_group_name = var.resource_group_name
  location            = var.location
  sku                 = "PerGB2018"
  retention_in_days   = var.retention_in_days
  tags                = var.tags
}

resource "azurerm_application_insights" "main" {
  name                = "appi-${var.project}-${var.environment}"
  resource_group_name = var.resource_group_name
  location            = var.location
  workspace_id        = azurerm_log_analytics_workspace.main.id
  application_type    = "Node.JS"
  tags                = var.tags
}

resource "azurerm_key_vault_secret" "connection_string" {
  name         = "applicationinsights-connection-string"
  value        = azurerm_application_insights.main.connection_string
  key_vault_id = var.key_vault_id
}
