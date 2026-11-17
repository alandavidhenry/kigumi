output "connection_string" {
  description = "Application Insights connection string (stored in Key Vault by the caller)"
  value       = module.application_insights.connection_string
  sensitive   = true
}

output "application_insights_name" {
  description = "Application Insights resource name"
  value       = module.application_insights.name
}

output "workspace_id" {
  description = "Log Analytics workspace ID"
  value       = module.log_analytics.resource_id
}
