# Separate account for nightly database dumps (ADR 0019): its own credentials,
# private, with dumps immutable for the retention period.
locals {
  st_name        = "st${replace(var.project, "-", "")}bak${var.environment}${var.location_short}01"
  container_name = "db-backups"
}

module "storage_account" {
  source  = "Azure/avm-res-storage-storageaccount/azurerm"
  version = "0.11.0"

  name                     = local.st_name
  location                 = var.location
  parent_id                = var.resource_group_id
  account_tier             = "Standard"
  account_replication_type = var.replication_type
  min_tls_version          = "TLS1_2"
  tags                     = var.tags
  enable_telemetry         = var.enable_telemetry

  allow_nested_items_to_be_public = false

  # The backup workflow authenticates with this account's connection string
  # (a GitHub secret), which needs shared keys; the AVM default is off. It
  # runs from GitHub-hosted runners, so the firewall default (Deny) is lifted.
  shared_access_key_enabled     = true
  public_network_access_enabled = true
  network_rules = {
    bypass         = ["AzureServices"]
    default_action = "Allow"
  }

  containers = {
    db_backups = {
      name          = local.container_name
      public_access = "None"
    }
  }

  storage_management_policy_rule = {
    delete_old_dumps = {
      name    = "delete-old-dumps"
      enabled = true
      filters = {
        blob_types   = ["blockBlob"]
        prefix_match = ["${local.container_name}/"]
      }
      actions = {
        base_blob = {
          delete_after_days_since_creation_greater_than = var.immutability_days + 1
        }
      }
    }
  }
}

# Time-based immutability: dumps cannot be altered or deleted for the period.
# The AVM container input only covers version-level immutability, so the
# container-level policy stays a plain resource.
resource "azurerm_storage_container_immutability_policy" "db_backups" {
  storage_container_resource_manager_id = "${module.storage_account.resource_id}/blobServices/default/containers/${local.container_name}"
  immutability_period_in_days           = var.immutability_days

  depends_on = [module.storage_account]
}

data "azurerm_storage_account" "backup" {
  name                = module.storage_account.name
  resource_group_name = var.resource_group_name

  depends_on = [module.storage_account]
}
