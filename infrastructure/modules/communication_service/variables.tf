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

variable "resource_group_name" {
  description = "The name of the resource group"
  type        = string
}

variable "data_location" {
  description = "The data residency location for the Communication Service (e.g. 'Europe', 'United States', 'UK')"
  type        = string
  default     = "Europe"
}

variable "key_vault_id" {
  description = "The ID of the Key Vault to store secrets"
  type        = string
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}
