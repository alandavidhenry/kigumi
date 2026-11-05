locals {
  common_tags = {
    Environment = var.environment
    Project     = var.project
    CreatedBy   = "IaC"
  }
  app_service_location_short = {
    "UK South" = "uks"
    "uksouth"  = "uks"
    "UK West"  = "ukw"
    "ukwest"   = "ukw"
  }[var.app_service_location]

  default_app_url = "https://app-${var.project}-${var.environment}-${local.app_service_location_short}.azurewebsites.net"
  app_url         = coalesce(var.app_url, local.default_app_url)
}
