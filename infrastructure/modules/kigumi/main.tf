resource "random_password" "auth_secret" {
  length  = 48
  special = false
}

resource "random_password" "cron_secret" {
  length  = 40
  special = false
}

module "resource_group" {
  source = "../resource_group"

  project             = var.project
  environment         = var.environment
  location            = var.location
  resource_group_name = var.resource_group_name
  tags                = local.common_tags
}

module "key_vault" {
  source = "../key_vault"

  project             = var.project
  environment         = var.environment
  location            = var.location
  resource_group_name = module.resource_group.resource_group_name
  sku_name            = var.key_vault.sku_name
  tags                = local.common_tags
}

module "storage" {
  source = "../storage"

  project                  = var.project
  environment              = var.environment
  location                 = var.location
  resource_group_name      = module.resource_group.resource_group_name
  account_tier             = var.storage.account_tier
  account_replication_type = var.storage.account_replication_type
  min_tls_version          = var.storage.min_tls_version
  tags                     = local.common_tags

  # Files are served through the app, never straight from the browser, so no
  # CORS origins are needed.
  containers = {
    "${var.storage_container.name}" = {
      access_type = var.storage_container.container_access_type
    }
  }
}

module "backup_storage" {
  source = "../backup_storage"
  count  = var.enable_backup_storage ? 1 : 0

  project             = var.project
  environment         = var.environment
  location            = var.location
  resource_group_name = module.resource_group.resource_group_name
  tags                = local.common_tags
}

resource "azurerm_role_assignment" "kv_deployer" {
  scope                = module.key_vault.key_vault_id
  role_definition_name = "Key Vault Secrets Officer"
  principal_id         = var.kv_deployer_object_id
}

# RBAC takes a while to propagate; writing secrets straight away would race it.
resource "time_sleep" "kv_deployer_propagation" {
  depends_on      = [azurerm_role_assignment.kv_deployer]
  create_duration = "120s"

  triggers = {
    principal_id = azurerm_role_assignment.kv_deployer.principal_id
  }
}

resource "azurerm_key_vault_secret" "database_url" {
  name         = "database-url"
  value        = var.database_url
  key_vault_id = module.key_vault.key_vault_id

  depends_on = [time_sleep.kv_deployer_propagation]
}

resource "azurerm_key_vault_secret" "auth_secret" {
  name         = "better-auth-secret"
  value        = random_password.auth_secret.result
  key_vault_id = module.key_vault.key_vault_id

  depends_on = [time_sleep.kv_deployer_propagation]
}

resource "azurerm_key_vault_secret" "cron_secret" {
  name         = "cron-secret"
  value        = random_password.cron_secret.result
  key_vault_id = module.key_vault.key_vault_id

  depends_on = [time_sleep.kv_deployer_propagation]
}

resource "azurerm_key_vault_secret" "storage_connection_string" {
  name         = "storage-connection-string"
  value        = module.storage.primary_connection_string
  key_vault_id = module.key_vault.key_vault_id

  depends_on = [time_sleep.kv_deployer_propagation]
}

# Optional: without a key, cached AI output still shows and generating is refused.
resource "azurerm_key_vault_secret" "anthropic_api_key" {
  count        = var.anthropic_api_key == "" ? 0 : 1
  name         = "anthropic-api-key"
  value        = var.anthropic_api_key
  key_vault_id = module.key_vault.key_vault_id

  depends_on = [time_sleep.kv_deployer_propagation]
}

module "communication_service" {
  source = "../communication_service"

  project             = var.project
  environment         = var.environment
  location            = var.location
  resource_group_name = module.resource_group.resource_group_name
  data_location       = var.communication_service.data_location
  key_vault_id        = module.key_vault.key_vault_id
  tags                = local.common_tags

  depends_on = [time_sleep.kv_deployer_propagation]
}

module "monitoring" {
  source = "../monitoring"

  project             = var.project
  environment         = var.environment
  location            = var.location
  resource_group_name = module.resource_group.resource_group_name
  key_vault_id        = module.key_vault.key_vault_id
  tags                = local.common_tags

  depends_on = [time_sleep.kv_deployer_propagation]
}

module "app_service" {
  source = "../app_service"

  project             = var.project
  environment         = var.environment
  location            = var.app_service_location
  resource_group_name = module.resource_group.resource_group_name
  sku_name            = var.app_service_sku
  https_only          = var.https_only
  tags                = local.common_tags

  docker_image = {
    name              = "${var.github_username}/${var.project}:${var.environment == "prod" ? "latest" : "dev-latest"}"
    registry_url      = "https://ghcr.io"
    registry_username = var.github_username
    registry_password = var.github_token
  }

  app_settings = merge(
    var.extra_app_settings,
    var.anthropic_api_key == "" ? {} : {
      "ANTHROPIC_API_KEY" = "@Microsoft.KeyVault(SecretUri=${azurerm_key_vault_secret.anthropic_api_key[0].versionless_id})"
    },
    {
      "DATABASE_URL"                          = "@Microsoft.KeyVault(SecretUri=${azurerm_key_vault_secret.database_url.versionless_id})"
      "BETTER_AUTH_SECRET"                    = "@Microsoft.KeyVault(SecretUri=${azurerm_key_vault_secret.auth_secret.versionless_id})"
      "BETTER_AUTH_URL"                       = local.app_url
      "CRON_SECRET"                           = "@Microsoft.KeyVault(SecretUri=${azurerm_key_vault_secret.cron_secret.versionless_id})"
      "AZURE_STORAGE_CONNECTION_STRING"       = "@Microsoft.KeyVault(SecretUri=${azurerm_key_vault_secret.storage_connection_string.versionless_id})"
      "AZURE_STORAGE_CONTAINER_NAME"          = var.storage_container.name
      "AZURE_COMMUNICATION_CONNECTION_STRING" = "@Microsoft.KeyVault(SecretUri=${module.communication_service.acs_connection_string_secret_versionless_id})"
      "ACS_SENDER_ADDRESS"                    = module.communication_service.sender_address
      "APPLICATIONINSIGHTS_CONNECTION_STRING" = "@Microsoft.KeyVault(SecretUri=${module.monitoring.connection_string_secret_versionless_id})"
      "PLATFORM_ADMIN_EMAILS"                 = var.platform_admin_emails
      "WEBSITES_PORT"                         = "8080"
      "WEBSITES_ENABLE_APP_SERVICE_STORAGE"   = "false"
    }
  )
}

module "alerts" {
  source = "../alerts"
  count  = length(var.alert_emails) > 0 ? 1 : 0

  project             = var.project
  environment         = var.environment
  location            = var.location
  resource_group_name = module.resource_group.resource_group_name
  app_service_id      = module.app_service.app_service_id
  workspace_id        = module.monitoring.workspace_id
  email_addresses     = var.alert_emails
  tags                = local.common_tags
}

resource "azurerm_role_assignment" "kv_app_service" {
  scope                = module.key_vault.key_vault_id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = module.app_service.app_service_identity_principal_id
}
