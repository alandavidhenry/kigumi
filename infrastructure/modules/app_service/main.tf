locals {
  asp_name = "asp-${var.project}-${var.environment}-${var.location_short}"
  app_name = "app-${var.project}-${var.environment}-${var.location_short}"
}

module "service_plan" {
  source  = "Azure/avm-res-web-serverfarm/azurerm"
  version = "2.0.8"

  name      = local.asp_name
  location  = var.location
  parent_id = var.resource_group_id
  os_type   = "Linux"
  sku_name  = var.sku_name
  tags      = var.tags

  # One instance: the AVM default is three, which would triple the cost.
  worker_count     = 1
  enable_telemetry = var.enable_telemetry
}

module "web_app" {
  source  = "Azure/avm-res-web-site/azurerm"
  version = "0.24.1"

  name                     = local.app_name
  location                 = var.location
  parent_id                = var.resource_group_id
  kind                     = "webapp"
  os_type                  = "Linux"
  service_plan_resource_id = module.service_plan.resource_id
  https_only               = var.https_only
  tags                     = var.tags
  enable_telemetry         = var.enable_telemetry

  # The AVM default is private-only; this app is public.
  public_network_access_enabled = true

  managed_identities = {
    system_assigned = true
  }

  site_config = {
    application_stack = {
      docker = {
        docker_image_name   = var.docker_image.name
        docker_image_tag    = var.docker_image.tag
        docker_registry_url = var.docker_image.registry_url
      }
    }
    always_on           = contains(["F1", "FREE", "D1"], var.sku_name) ? false : true
    health_check_path   = var.health_check_path
    minimum_tls_version = "1.2"
  }

  logs = {
    default = {
      http_logs = {
        default = {
          file_system = {
            retention_in_days = 7
            retention_in_mb   = 35
          }
        }
      }
    }
  }

  app_settings = var.app_settings

  # Image tag is managed by CI/CD (GitHub Actions), not Terraform.
  # Terraform sets the initial image; deployments update it independently.
  ignore_body_changes = {
    web_sites = ["properties.siteConfig.linuxFxVersion"]
  }
}
