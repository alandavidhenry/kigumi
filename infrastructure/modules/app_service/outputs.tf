output "app_service_id" {
  description = "The ID of the App Service"
  value       = module.web_app.resource_id
}

output "app_service_name" {
  description = "The name of the App Service"
  value       = module.web_app.name
}

output "app_service_default_hostname" {
  description = "The default hostname of the App Service"
  value       = module.web_app.resource_uri
}

output "app_service_url" {
  description = "The URL of the App Service"
  value       = "https://${module.web_app.resource_uri}"
}

output "app_service_identity_principal_id" {
  description = "The Principal ID of the App Service's managed identity"
  value       = module.web_app.system_assigned_mi_principal_id
}

output "app_service_plan_id" {
  description = "The ID of the App Service Plan"
  value       = module.service_plan.resource_id
}
