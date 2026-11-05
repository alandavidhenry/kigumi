variable "project" {
  description = "Project name"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "location" {
  description = "Azure region"
  type        = string
}

variable "app_service_location" {
  description = "Azure region for the App Service Plan and Web App"
  type        = string
  default     = "UK West"
}

variable "resource_group_name" {
  description = "Resource group name (null = generated)"
  type        = string
  default     = null
}

variable "app_service_sku" {
  description = "App Service plan SKU"
  type        = string
  default     = "B1"
}

variable "https_only" {
  description = "Force HTTPS for all traffic"
  type        = bool
  default     = true
}

variable "app_url" {
  description = "Public URL of the app (BETTER_AUTH_URL). Null = the default azurewebsites.net hostname; set it when a custom domain is attached."
  type        = string
  default     = null
}

variable "key_vault" {
  description = "Key Vault configuration"
  type = object({
    sku_name = string
  })
}

variable "storage" {
  description = "Storage account configuration"
  type = object({
    account_tier             = string
    account_replication_type = string
    min_tls_version          = string
  })
}

variable "storage_container" {
  description = "Storage container configuration"
  type = object({
    name                  = string
    container_access_type = string
  })
}

variable "enable_backup_storage" {
  description = "Create the separate, immutable backup storage account (ADR 0019)"
  type        = bool
  default     = false
}

variable "communication_service" {
  description = "Azure Communication Service configuration"
  type = object({
    data_location = string
  })
  default = {
    data_location = "Europe"
  }
}

variable "github_username" {
  description = "GitHub username for the container registry (also the image owner)"
  type        = string
}

variable "github_token" {
  description = "GitHub personal access token with read:packages"
  type        = string
  sensitive   = true
}

variable "database_url" {
  description = "Neon PostgreSQL connection string"
  type        = string
  sensitive   = true
}

variable "anthropic_api_key" {
  description = "Anthropic API key; empty = AI generation disabled (cached output still shows)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "platform_admin_emails" {
  description = "Comma-separated verified emails allowed into /admin/mics"
  type        = string
  default     = ""
}

variable "extra_app_settings" {
  description = "Static app settings merged with the computed ones (e.g. AI_DAILY_REQUEST_CAP)"
  type        = map(string)
  default     = {}
}

variable "kv_deployer_object_id" {
  description = "Object ID of the CI/CD service principal granted Key Vault Secrets Officer. Set once; do not derive it from whoever runs Terraform."
  type        = string
}
