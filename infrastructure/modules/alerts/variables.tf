variable "project" {
  type = string
}

variable "environment" {
  type = string
}

variable "location" {
  type = string
}

variable "resource_group_name" {
  type = string
}

variable "app_service_id" {
  description = "Web app to alert on"
  type        = string
}

variable "workspace_id" {
  description = "Log Analytics workspace that receives the console logs"
  type        = string
}

variable "email_addresses" {
  description = "Who is notified"
  type        = list(string)
}

variable "tags" {
  type    = map(string)
  default = {}
}
