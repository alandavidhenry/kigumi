locals {
  location_short = {
    "UK South" = "uks"
    "uksouth"  = "uks"
    "UK West"  = "ukw"
    "ukwest"   = "ukw"
  }[var.location]
}

resource "azurerm_communication_service" "main" {
  name                = "acs-${var.project}-${var.environment}-${local.location_short}"
  resource_group_name = var.resource_group_name
  data_location       = var.data_location
  tags                = var.tags
}

resource "azurerm_email_communication_service" "main" {
  name                = "ecs-${var.project}-${var.environment}-${local.location_short}"
  resource_group_name = var.resource_group_name
  data_location       = var.data_location
  tags                = var.tags
}

resource "azurerm_email_communication_service_domain" "main" {
  name              = "AzureManagedDomain"
  email_service_id  = azurerm_email_communication_service.main.id
  domain_management = "AzureManaged"
}

resource "azurerm_communication_service_email_domain_association" "main" {
  communication_service_id = azurerm_communication_service.main.id
  email_service_domain_id  = azurerm_email_communication_service_domain.main.id
}

resource "azurerm_key_vault_secret" "acs_connection_string" {
  name         = "acs-connection-string"
  value        = azurerm_communication_service.main.primary_connection_string
  key_vault_id = var.key_vault_id
}
