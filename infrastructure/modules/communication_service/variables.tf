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

variable "resource_group_id" {
  description = "Resource ID of the resource group"
  type        = string
}

variable "enable_telemetry" {
  description = "AVM telemetry (anonymous deployment counts sent to Microsoft)"
  type        = bool
  default     = false
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}

variable "location_short" {
  description = "Short region code used in resource names (e.g. uks), from the kigumi module"
  type        = string
}
