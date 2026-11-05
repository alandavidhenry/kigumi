output "key_vault_id" {
  description = "The ID of the Key Vault"
  value       = azurerm_key_vault.main.id
}

output "key_vault_name" {
  description = "The name of the Key Vault"
  value       = azurerm_key_vault.main.name
}

output "key_vault_uri" {
  description = "The URI of the Key Vault"
  value       = azurerm_key_vault.main.vault_uri
}

output "secret_ids" {
  description = "Map of secret names to their versioned IDs"
  value       = { for name, secret in azurerm_key_vault_secret.secret : name => secret.id }
}

output "secret_versionless_ids" {
  description = "Map of secret names to their versionless IDs"
  value       = { for name, secret in azurerm_key_vault_secret.secret : name => secret.versionless_id }
}
