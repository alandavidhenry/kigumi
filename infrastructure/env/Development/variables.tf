variable "project" {
  type = string
}

variable "environment" {
  type = string
}

variable "location" {
  type = string
}

variable "app_service_location" {
  type    = string
  default = "UK West"
}

variable "app_service_sku" {
  type = string
}

variable "https_only" {
  type    = bool
  default = true
}

variable "app_url" {
  description = "Public URL when a custom domain is attached; null uses the azurewebsites.net hostname"
  type        = string
  default     = null
}

variable "key_vault" {
  type = object({
    sku_name = string
  })
}

variable "storage" {
  type = object({
    account_tier             = string
    account_replication_type = string
    min_tls_version          = string
  })
}

variable "storage_container" {
  type = object({
    name                  = string
    container_access_type = string
  })
}

variable "enable_backup_storage" {
  type    = bool
  default = false
}

variable "github_username" {
  type = string
}

variable "github_token" {
  type      = string
  sensitive = true
}

variable "subscription_id" {
  type = string
}

variable "database_url" {
  type      = string
  sensitive = true
}

variable "anthropic_api_key" {
  type      = string
  sensitive = true
  default   = ""
}

variable "platform_admin_emails" {
  type    = string
  default = ""
}

variable "extra_app_settings" {
  type    = map(string)
  default = {}
}

variable "kv_deployer_object_id" {
  type = string
}
