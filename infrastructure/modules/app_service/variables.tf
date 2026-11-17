variable "project" {
  description = "Project name"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "resource_group_id" {
  description = "Resource ID of the resource group"
  type        = string
}

variable "location" {
  description = "Azure region"
  type        = string
}

variable "sku_name" {
  description = "The SKU name of the App Service Plan"
  type        = string
  default     = "B1"
}

variable "https_only" {
  description = "Force HTTPS for all traffic"
  type        = bool
  default     = true
}

variable "docker_image" {
  description = "Initial container image. Registry credentials go in app_settings (DOCKER_REGISTRY_SERVER_*)."
  type = object({
    name         = string
    tag          = string
    registry_url = string
  })
}

variable "health_check_path" {
  description = "The health check path for the app service"
  type        = string
  default     = "/api/health"
}

variable "app_settings" {
  description = "Map of app settings for the App Service"
  type        = map(string)
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
