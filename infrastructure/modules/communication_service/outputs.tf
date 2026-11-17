output "connection_string" {
  description = "Communication Service connection string (stored in Key Vault by the caller)"
  value       = azurerm_communication_service.main.primary_connection_string
  sensitive   = true
}

output "sender_address" {
  description = "The Azure-managed sender address (DoNotReply@<managed-domain>.azurecomm.net)"
  value       = "DoNotReply@${module.email_service.domain_mail_from_sender_domains["managed"]}"
}
