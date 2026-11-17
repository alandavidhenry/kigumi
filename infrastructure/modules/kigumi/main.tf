resource "random_password" "auth_secret" {
  length  = 48
  special = false
}

resource "random_password" "cron_secret" {
  length  = 40
  special = false
}

locals {
  # for_each keys must be known at plan time, so whether the optional key is
  # present is decided on a non-sensitive boolean rather than the key itself.
  has_anthropic_key = nonsensitive(var.anthropic_api_key != "")

  # Every secret the app reads, written by the Key Vault module. Optional: with
  # no Anthropic key, cached AI output still shows and generating is refused.
  secret_values = merge(
    {
      "database-url"                          = var.database_url
      "better-auth-secret"                    = random_password.auth_secret.result
      "cron-secret"                           = random_password.cron_secret.result
      "storage-connection-string"             = module.storage.primary_connection_string
      "acs-connection-string"                 = module.communication_service.connection_string
      "applicationinsights-connection-string" = module.monitoring.connection_string
      "ghcr-token"                            = var.github_token
    },
    local.has_anthropic_key ? { "anthropic-api-key" = var.anthropic_api_key } : {}
  )
  secret_names = toset(concat(
    [
      "database-url",
      "better-auth-secret",
      "cron-secret",
      "storage-connection-string",
      "acs-connection-string",
      "applicationinsights-connection-string",
      "ghcr-token"
    ],
    local.has_anthropic_key ? ["anthropic-api-key"] : []
  ))

  # App Service Key Vault reference for a secret, versionless so rotations
  # are picked up.
  kv_ref = { for name in local.secret_names : name => "@Microsoft.KeyVault(SecretUri=${module.key_vault.secret_uris[name]})" }
}

module "resource_group" {
  source         = "../resource_group"
  location_short = local.location_short

  project             = var.project
  environment         = var.environment
  location            = var.location
  resource_group_name = var.resource_group_name
  tags                = local.common_tags
  enable_telemetry    = var.enable_telemetry
}

module "key_vault" {
  source         = "../key_vault"
  location_short = local.location_short

  project                  = var.project
  environment              = var.environment
  location                 = var.location
  resource_group_id        = module.resource_group.resource_group_id
  sku_name                 = var.key_vault.sku_name
  purge_protection_enabled = var.key_vault.purge_protection_enabled
  deployer_object_id       = var.kv_deployer_object_id
  secret_names             = local.secret_names
  secret_values            = local.secret_values
  tags                     = local.common_tags
  enable_telemetry         = var.enable_telemetry
}

module "storage" {
  source         = "../storage"
  location_short = local.location_short

  project                  = var.project
  environment              = var.environment
  location                 = var.location
  resource_group_name      = module.resource_group.resource_group_name
  resource_group_id        = module.resource_group.resource_group_id
  account_tier             = var.storage.account_tier
  account_replication_type = var.storage.account_replication_type
  min_tls_version          = var.storage.min_tls_version
  tags                     = local.common_tags
  enable_telemetry         = var.enable_telemetry

  # Files are served through the app, never straight from the browser, so no
  # CORS origins are needed.
  containers = {
    "${var.storage_container.name}" = {
      access_type = var.storage_container.container_access_type
    }
  }
}

module "backup_storage" {
  source         = "../backup_storage"
  location_short = local.location_short
  count          = var.enable_backup_storage ? 1 : 0

  project             = var.project
  environment         = var.environment
  location            = var.location
  resource_group_name = module.resource_group.resource_group_name
  resource_group_id   = module.resource_group.resource_group_id
  tags                = local.common_tags
  enable_telemetry    = var.enable_telemetry
}

module "communication_service" {
  source         = "../communication_service"
  location_short = local.location_short

  project             = var.project
  environment         = var.environment
  location            = var.location
  resource_group_name = module.resource_group.resource_group_name
  resource_group_id   = module.resource_group.resource_group_id
  data_location       = var.communication_service.data_location
  tags                = local.common_tags
  enable_telemetry    = var.enable_telemetry
}

module "monitoring" {
  source = "../monitoring"

  project             = var.project
  environment         = var.environment
  location            = var.location
  resource_group_name = module.resource_group.resource_group_name
  resource_group_id   = module.resource_group.resource_group_id
  tags                = local.common_tags
  enable_telemetry    = var.enable_telemetry
}

module "app_service" {
  source         = "../app_service"
  location_short = local.app_service_location_short

  project           = var.project
  environment       = var.environment
  location          = var.app_service_location
  resource_group_id = module.resource_group.resource_group_id
  sku_name          = var.app_service_sku
  https_only        = var.https_only
  tags              = local.common_tags
  enable_telemetry  = var.enable_telemetry

  docker_image = {
    name         = "${var.github_username}/${var.project}"
    tag          = var.environment == "prod" ? "latest" : "dev-latest"
    registry_url = "https://ghcr.io"
  }

  app_settings = merge(
    var.extra_app_settings,
    local.has_anthropic_key ? { "ANTHROPIC_API_KEY" = local.kv_ref["anthropic-api-key"] } : {},
    {
      "DATABASE_URL"                          = local.kv_ref["database-url"]
      "BETTER_AUTH_SECRET"                    = local.kv_ref["better-auth-secret"]
      "BETTER_AUTH_URL"                       = local.app_url
      "CRON_SECRET"                           = local.kv_ref["cron-secret"]
      "AZURE_STORAGE_CONNECTION_STRING"       = local.kv_ref["storage-connection-string"]
      "AZURE_STORAGE_CONTAINER_NAME"          = var.storage_container.name
      "AZURE_COMMUNICATION_CONNECTION_STRING" = local.kv_ref["acs-connection-string"]
      "ACS_SENDER_ADDRESS"                    = module.communication_service.sender_address
      "APPLICATIONINSIGHTS_CONNECTION_STRING" = local.kv_ref["applicationinsights-connection-string"]
      "PLATFORM_ADMIN_EMAILS"                 = var.platform_admin_emails
      "WEBSITES_PORT"                         = "8080"
      "WEBSITES_ENABLE_APP_SERVICE_STORAGE"   = "false"
      "DOCKER_REGISTRY_SERVER_URL"            = "https://ghcr.io"
      "DOCKER_REGISTRY_SERVER_USERNAME"       = var.github_username
      "DOCKER_REGISTRY_SERVER_PASSWORD"       = local.kv_ref["ghcr-token"]
    }
  )

  # The references only resolve once the secrets exist.
  depends_on = [module.key_vault]
}

module "alerts" {
  source = "../alerts"
  count  = length(var.alert_emails) > 0 ? 1 : 0

  project             = var.project
  environment         = var.environment
  location            = var.location
  resource_group_name = module.resource_group.resource_group_name
  resource_group_id   = module.resource_group.resource_group_id
  app_service_id      = module.app_service.app_service_id
  workspace_id        = module.monitoring.workspace_id
  email_addresses     = var.alert_emails
  tags                = local.common_tags
  enable_telemetry    = var.enable_telemetry
}

resource "azurerm_role_assignment" "kv_app_service" {
  scope                = module.key_vault.key_vault_id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = module.app_service.app_service_identity_principal_id
  # Required by the ABAC condition on the CI principal's RBAC Administrator
  # role (docs/operations.md, "CI service principal roles").
  principal_type = "ServicePrincipal"
}
