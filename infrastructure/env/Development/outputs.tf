output "resource_group_name" {
  value = module.kigumi.resource_group_name
}

output "app_service_name" {
  value = module.kigumi.app_service_name
}

output "app_service_url" {
  value = module.kigumi.app_service_url
}

output "key_vault_name" {
  value = module.kigumi.key_vault_name
}

output "cron_secret" {
  description = "Copy into the CRON_SECRET GitHub Actions secret for this environment"
  value       = module.kigumi.cron_secret
  sensitive   = true
}

output "backup_storage_connection_string" {
  description = "Copy into the BACKUP_STORAGE_CONNECTION_STRING GitHub secret"
  value       = module.kigumi.backup_storage_connection_string
  sensitive   = true
}
