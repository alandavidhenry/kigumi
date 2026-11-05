locals {
  location_short = {
    "UK South" = "uks"
    "uksouth"  = "uks"
    "UK West"  = "ukw"
    "ukwest"   = "ukw"
  }[var.location]
  kv_name = "kv-${var.project}-${var.environment}-${local.location_short}"
}

data "azurerm_client_config" "current" {}

resource "azurerm_key_vault" "main" {
  name                       = local.kv_name
  resource_group_name        = var.resource_group_name
  location                   = var.location
  tenant_id                  = data.azurerm_client_config.current.tenant_id
  sku_name                   = var.sku_name
  rbac_authorization_enabled = true
  tags                       = var.tags
}

resource "azurerm_key_vault_secret" "secret" {
  for_each = var.secrets

  name         = each.key
  value        = each.value
  key_vault_id = azurerm_key_vault.main.id
}
