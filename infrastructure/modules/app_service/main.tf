locals {
  location_short = {
    "UK South" = "uks"
    "uksouth"  = "uks"
    "UK West"  = "ukw"
    "ukwest"   = "ukw"
  }[var.location]
  asp_name = "asp-${var.project}-${var.environment}-${local.location_short}"
  app_name = "app-${var.project}-${var.environment}-${local.location_short}"
}

resource "azurerm_service_plan" "main" {
  name                = local.asp_name
  resource_group_name = var.resource_group_name
  location            = var.location
  os_type             = "Linux"
  sku_name            = var.sku_name
  tags                = var.tags
}

resource "azurerm_linux_web_app" "main" {
  name                = local.app_name
  resource_group_name = var.resource_group_name
  location            = var.location
  service_plan_id     = azurerm_service_plan.main.id
  https_only          = var.https_only

  identity {
    type = "SystemAssigned"
  }

  site_config {
    application_stack {
      docker_image_name        = var.docker_image.name
      docker_registry_url      = var.docker_image.registry_url
      docker_registry_username = var.docker_image.registry_username
      docker_registry_password = var.docker_image.registry_password
    }
    always_on = contains(["F1", "FREE", "D1"], var.sku_name) ? false : true

    health_check_path                 = var.health_check_path
    health_check_eviction_time_in_min = 10
  }

  logs {
    detailed_error_messages = false
    failed_request_tracing  = false

    http_logs {
      file_system {
        retention_in_days = 7
        retention_in_mb   = 35
      }
    }
  }

  app_settings = var.app_settings

  # Image tag is managed by CI/CD (GitHub Actions), not Terraform.
  # Terraform sets the initial image; deployments update it independently.
  lifecycle {
    ignore_changes = [site_config[0].application_stack[0].docker_image_name]
  }

  tags = var.tags
}
