locals {
  common_tags = {
    Environment = var.environment
    Project     = var.project
    CreatedBy   = "IaC"
  }
  # The only place region codes are defined (Azure Cloud Adoption Framework
  # abbreviations); every resource name takes its code from here.
  region_codes = {
    "UK South" = "uks"
    "uksouth"  = "uks"
    "UK West"  = "ukw"
    "ukwest"   = "ukw"
  }
  location_short             = local.region_codes[var.location]
  app_service_location_short = local.region_codes[var.app_service_location]

  default_app_url = "https://app-${var.project}-${var.environment}-${local.app_service_location_short}.azurewebsites.net"
  app_url         = coalesce(var.app_url, local.default_app_url)
}
