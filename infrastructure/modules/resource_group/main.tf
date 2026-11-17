locals {
  generated_name = "rg-${var.project}-${var.environment}-${var.location_short}"
}

module "resource_group" {
  source  = "Azure/avm-res-resources-resourcegroup/azurerm"
  version = "0.5.0"

  name             = coalesce(var.resource_group_name, local.generated_name)
  location         = var.location
  tags             = var.tags
  enable_telemetry = var.enable_telemetry
}
