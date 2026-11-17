output "key_vault_id" {
  description = "The ID of the Key Vault"
  value       = module.key_vault.resource_id
}

output "key_vault_name" {
  description = "The name of the Key Vault"
  value       = module.key_vault.name
}

output "key_vault_uri" {
  description = "The URI of the Key Vault"
  value       = module.key_vault.uri
}

output "secret_uris" {
  description = "Map of secret name to its versionless URI, for Key Vault references"
  value       = { for name in var.secret_names : name => "${trimsuffix(module.key_vault.uri, "/")}/secrets/${name}" }
}
