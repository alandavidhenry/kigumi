locals {
  kv_name = "kv-${var.project}-${var.environment}-${var.location_short}"
}

data "azurerm_client_config" "current" {}

module "key_vault" {
  source  = "Azure/avm-res-keyvault-vault/azurerm"
  version = "0.13.1"

  name      = local.kv_name
  location  = var.location
  parent_id = var.resource_group_id
  tenant_id = data.azurerm_client_config.current.tenant_id
  sku_name  = var.sku_name
  tags      = var.tags

  enable_telemetry           = var.enable_telemetry
  purge_protection_enabled   = var.purge_protection_enabled
  soft_delete_retention_days = 90

  # The App Service reads Key Vault references over the public endpoint (no
  # VNet) and CI writes secrets from a hosted runner, so the AVM default of
  # Deny would lock both out. Access is still RBAC-only.
  public_network_access_enabled = true
  network_acls = {
    bypass         = "AzureServices"
    default_action = "Allow"
  }

  # The deploying principal writes the secrets below, so it needs the role
  # first; the module waits for RBAC to propagate before the first write.
  role_assignments = {
    deployer = {
      role_definition_id_or_name = "Key Vault Secrets Officer"
      principal_id               = var.deployer_object_id
    }
  }

  secrets       = { for name in var.secret_names : name => { name = name } }
  secrets_value = var.secret_values

  wait_for_rbac_before_secret_operations = {
    create = "120s"
  }
}
