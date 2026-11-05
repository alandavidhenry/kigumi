module "kigumi" {
  source = "../../modules/kigumi"

  project               = var.project
  environment           = var.environment
  location              = var.location
  app_service_location  = var.app_service_location
  app_service_sku       = var.app_service_sku
  https_only            = var.https_only
  app_url               = var.app_url
  key_vault             = var.key_vault
  storage               = var.storage
  storage_container     = var.storage_container
  enable_backup_storage = var.enable_backup_storage
  github_username       = var.github_username
  github_token          = var.github_token
  database_url          = var.database_url
  anthropic_api_key     = var.anthropic_api_key
  platform_admin_emails = var.platform_admin_emails
  extra_app_settings    = var.extra_app_settings
  kv_deployer_object_id = var.kv_deployer_object_id
}
