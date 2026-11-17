output "storage_account_id" {
  description = "The ID of the storage account"
  value       = module.storage_account.resource_id
}

output "storage_account_name" {
  description = "The name of the storage account"
  value       = module.storage_account.name
}

output "primary_connection_string" {
  description = "The primary connection string of the storage account"
  value       = data.azurerm_storage_account.main.primary_connection_string
  sensitive   = true
}

output "container_names" {
  description = "Names of the created containers"
  value       = { for name, _ in var.containers : name => name }
}
