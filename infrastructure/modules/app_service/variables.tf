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
  description = "Docker image configuration"
  type = object({
    name              = string
    registry_url      = string
    registry_username = string
    registry_password = string
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
