output "acs_connection_string_secret_versionless_id" {
  description = "The versionless ID of the ACS connection string secret in Key Vault"
  value       = azurerm_key_vault_secret.acs_connection_string.versionless_id
}

output "sender_address" {
  description = "The Azure-managed sender address (DoNotReply@<managed-domain>.azurecomm.net)"
  value       = "DoNotReply@${azurerm_email_communication_service_domain.main.mail_from_sender_domain}"
}
