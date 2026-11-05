locals {
  location_short = {
    "UK South" = "uks"
    "uksouth"  = "uks"
    "UK West"  = "ukw"
    "ukwest"   = "ukw"
  }[var.location]
  generated_name = "rg-${var.project}-${var.environment}-${local.location_short}"
}

resource "azurerm_resource_group" "main" {
  name     = coalesce(var.resource_group_name, local.generated_name)
  location = var.location
  tags     = var.tags
}
