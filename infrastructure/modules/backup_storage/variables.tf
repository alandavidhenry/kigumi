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

variable "replication_type" {
  description = "Replication type for the backup account"
  type        = string
  default     = "GRS"
}

variable "immutability_days" {
  description = "Days a dump is immutable, and (plus one) how long it is kept"
  type        = number
  default     = 35
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}
