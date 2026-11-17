output "storage_account_name" {
  description = "Backup storage account name"
  value       = module.storage_account.name
}

output "primary_connection_string" {
  description = "Backup storage connection string (the BACKUP_STORAGE_CONNECTION_STRING GitHub secret)"
  value       = data.azurerm_storage_account.backup.primary_connection_string
  sensitive   = true
}
