project              = "kigumi"
environment          = "dev"
location             = "UK South"
app_service_location = "UK West"
github_username      = "alandavidhenry"

app_service_sku = "F1"
https_only      = true

key_vault = {
  sku_name = "standard"

  # Dev is torn down and rebuilt under the same name.
  purge_protection_enabled = false
}

storage = {
  account_tier             = "Standard"
  account_replication_type = "LRS"
  min_tls_version          = "TLS1_2"
}

storage_container = {
  name                  = "kigumi"
  container_access_type = "private"
}

# Separate immutable account for nightly dumps (ADR 0019).
enable_backup_storage = false

platform_admin_emails = "alandavidhenry@gmail.com"

# sp-terraform-minato: deploying principal (local applies + CI/CD). Set once.
kv_deployer_object_id = "6cfcc054-fb20-4b7a-a90e-bcc381478191"

extra_app_settings = {
  "AI_DAILY_REQUEST_CAP" = "100"
}

# Azure Monitor alerts (docs/operations.md). Development stays quiet.
alert_emails = []
