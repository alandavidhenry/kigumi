variable "project" {
  description = "Project name"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "resource_group_id" {
  description = "Resource ID of the resource group that holds the vault"
  type        = string
}

variable "location" {
  description = "Azure region"
  type        = string
}

variable "sku_name" {
  description = "The SKU name of the Key Vault"
  type        = string
  default     = "standard"
}

variable "purge_protection_enabled" {
  description = "Block purging of a deleted vault during the soft-delete period"
  type        = bool
  default     = true
}

variable "deployer_object_id" {
  description = "Principal granted Key Vault Secrets Officer so Terraform can write the secrets"
  type        = string
}

variable "secret_names" {
  description = "Names of the secrets to create. Kept apart from the values because the values are sensitive and cannot drive for_each."
  type        = set(string)
  default     = []
}

variable "secret_values" {
  description = "Secret values keyed by name; must have exactly the keys in secret_names"
  type        = map(string)
  sensitive   = true
  default     = {}
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}

variable "enable_telemetry" {
  description = "AVM telemetry (anonymous deployment counts sent to Microsoft)"
  type        = bool
  default     = false
}

variable "location_short" {
  description = "Short region code used in resource names (e.g. uks), from the kigumi module"
  type        = string
}
