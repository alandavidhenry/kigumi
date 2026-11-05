variable "project" {
  description = "Project name"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "resource_group_name" {
  description = "The name of the resource group"
  type        = string
}

variable "location" {
  description = "Azure region"
  type        = string
}

variable "account_tier" {
  description = "The tier of the storage account"
  type        = string
  default     = "Standard"
}

variable "account_replication_type" {
  description = "The replication type of the storage account"
  type        = string
  default     = "LRS"
}

variable "min_tls_version" {
  description = "The minimum TLS version for the storage account"
  type        = string
  default     = "TLS1_2"
}

variable "containers" {
  description = "Map of container names to their access types"
  type = map(object({
    access_type = string
  }))
  default = {}
}

variable "allowed_origins" {
  description = "CORS allowed origins for storage account"
  type        = list(string)
  default     = []
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}
