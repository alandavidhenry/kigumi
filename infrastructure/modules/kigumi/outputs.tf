output "resource_group_name" {
  value = module.resource_group.resource_group_name
}

output "app_service_name" {
  value = module.app_service.app_service_name
}

output "app_service_url" {
  value = module.app_service.app_service_url
}

output "key_vault_name" {
  value = module.key_vault.key_vault_name
}

output "cron_secret" {
  description = "Copy into the CRON_SECRET GitHub Actions secret for this environment"
  value       = random_password.cron_secret.result
  sensitive   = true
}

output "backup_storage_connection_string" {
  description = "Copy into the BACKUP_STORAGE_CONNECTION_STRING GitHub secret (null when backup storage is off)"
  value       = one(module.backup_storage[*].primary_connection_string)
  sensitive   = true
}
