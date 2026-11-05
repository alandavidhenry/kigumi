# Separate account for nightly database dumps (ADR 0019): its own credentials,
# private, with dumps immutable for the retention period.
locals {
  location_short = {
    "UK South" = "uks"
    "uksouth"  = "uks"
    "UK West"  = "ukw"
    "ukwest"   = "ukw"
  }[var.location]
  st_name = "st${replace(var.project, "-", "")}bak${var.environment}${local.location_short}01"
}

resource "azurerm_storage_account" "backup" {
  name                            = local.st_name
  resource_group_name             = var.resource_group_name
  location                        = var.location
  account_tier                    = "Standard"
  account_replication_type        = var.replication_type
  min_tls_version                 = "TLS1_2"
  allow_nested_items_to_be_public = false
  tags                            = var.tags
}

resource "azurerm_storage_container" "db_backups" {
  name                  = "db-backups"
  storage_account_id    = azurerm_storage_account.backup.id
  container_access_type = "private"
}

# Time-based immutability: dumps cannot be altered or deleted for the period.
resource "azurerm_storage_container_immutability_policy" "db_backups" {
  storage_container_resource_manager_id = azurerm_storage_container.db_backups.id
  immutability_period_in_days           = var.immutability_days
}

resource "azurerm_storage_management_policy" "db_backups" {
  storage_account_id = azurerm_storage_account.backup.id

  rule {
    name    = "delete-old-dumps"
    enabled = true
    filters {
      blob_types   = ["blockBlob"]
      prefix_match = ["db-backups/"]
    }
    actions {
      base_blob {
        delete_after_days_since_creation_greater_than = var.immutability_days + 1
      }
    }
  }
}
