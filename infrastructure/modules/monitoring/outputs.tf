output "connection_string_secret_versionless_id" {
  description = "Versionless Key Vault ID of the Application Insights connection string"
  value       = azurerm_key_vault_secret.connection_string.versionless_id
}

output "application_insights_name" {
  description = "Application Insights resource name"
  value       = azurerm_application_insights.main.name
}

output "workspace_id" {
  description = "Log Analytics workspace ID"
  value       = azurerm_log_analytics_workspace.main.id
}
