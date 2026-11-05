output "storage_account_id" {
  description = "The ID of the storage account"
  value       = azurerm_storage_account.main.id
}

output "storage_account_name" {
  description = "The name of the storage account"
  value       = azurerm_storage_account.main.name
}

output "primary_connection_string" {
  description = "The primary connection string of the storage account"
  value       = azurerm_storage_account.main.primary_connection_string
  sensitive   = true
}

output "containers" {
  description = "Map of container names to their IDs"
  value       = { for name, container in azurerm_storage_container.main : name => container.id }
}

output "container_names" {
  description = "Map of container names to their names (useful for outputs)"
  value       = { for name, container in azurerm_storage_container.main : name => container.name }
}
