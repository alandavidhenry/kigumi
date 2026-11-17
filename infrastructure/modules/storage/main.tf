locals {
  st_name = "st${replace(var.project, "-", "")}${var.environment}${var.location_short}01"

  public_access = {
    private   = "None"
    blob      = "Blob"
    container = "Container"
  }
}

module "storage_account" {
  source  = "Azure/avm-res-storage-storageaccount/azurerm"
  version = "0.11.0"

  name                     = local.st_name
  location                 = var.location
  parent_id                = var.resource_group_id
  account_tier             = var.account_tier
  account_replication_type = var.account_replication_type
  min_tls_version          = var.min_tls_version
  tags                     = var.tags
  enable_telemetry         = var.enable_telemetry

  # Blobs are never public: SAS tokens are the only intended access path.
  allow_nested_items_to_be_public = false

  # The app authenticates with the account connection string (a Key Vault
  # secret), which needs shared keys; the AVM default is off. The firewall
  # default is Deny, which would lock out the App Service (no VNet).
  shared_access_key_enabled     = true
  public_network_access_enabled = true
  network_rules = {
    bypass         = ["AzureServices"]
    default_action = "Allow"
  }

  blob_properties = {
    # Recovery from deletes and overwrites (docs/operations.md, "Backups").
    versioning_enabled = true
    delete_retention_policy = {
      days = 30
    }
    container_delete_retention_policy = {
      days = 30
    }
    cors_rules = length(var.allowed_origins) > 0 ? [{
      allowed_headers    = ["*"]
      allowed_methods    = ["GET", "HEAD", "OPTIONS"]
      allowed_origins    = var.allowed_origins
      exposed_headers    = ["*"]
      max_age_in_seconds = 86400
    }] : null
  }

  containers = {
    for name, c in var.containers : name => {
      name          = name
      public_access = local.public_access[c.access_type]
    }
  }
}

# The AVM module does not expose account keys, so read the connection string
# once the account exists.
data "azurerm_storage_account" "main" {
  name                = module.storage_account.name
  resource_group_name = var.resource_group_name

  depends_on = [module.storage_account]
}
