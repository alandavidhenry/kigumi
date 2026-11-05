locals {
  location_short = {
    "UK South" = "uks"
    "uksouth"  = "uks"
    "UK West"  = "ukw"
    "ukwest"   = "ukw"
  }[var.location]
  st_name = "st${replace(var.project, "-", "")}${var.environment}${local.location_short}01"
}

resource "azurerm_storage_account" "main" {
  name                     = local.st_name
  resource_group_name      = var.resource_group_name
  location                 = var.location
  account_tier             = var.account_tier
  account_replication_type = var.account_replication_type
  min_tls_version          = var.min_tls_version

  # All containers are created private (see azurerm_storage_container below) -
  # SAS tokens are the only intended access path. Pinned explicitly since
  # AzureRM v5 changed the provider default from true to false; without this,
  # the next provider bump could silently flip it back.
  allow_nested_items_to_be_public = false

  blob_properties {
    # Recovery from deletes and overwrites (docs/operations.md, "Backups").
    versioning_enabled = true

    delete_retention_policy {
      days = 30
    }

    container_delete_retention_policy {
      days = 30
    }

    dynamic "cors_rule" {
      for_each = length(var.allowed_origins) > 0 ? [1] : []
      content {
        allowed_headers    = ["*"]
        allowed_methods    = ["GET", "HEAD", "OPTIONS"]
        allowed_origins    = var.allowed_origins
        exposed_headers    = ["*"]
        max_age_in_seconds = 86400
      }
    }
  }

  tags = var.tags
}

resource "azurerm_storage_container" "main" {
  for_each = var.containers

  name                  = each.key
  storage_account_id    = azurerm_storage_account.main.id
  container_access_type = each.value.access_type
}
