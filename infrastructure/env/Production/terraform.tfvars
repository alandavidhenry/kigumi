project              = "kigumi"
environment          = "prod"
location             = "UK South"
app_service_location = "UK West"
github_username      = "alandavidhenry"

app_service_sku = "B1"
https_only      = true

key_vault = {
  sku_name = "standard"
}

storage = {
  account_tier             = "Standard"
  account_replication_type = "GRS"
  min_tls_version          = "TLS1_2"
}

storage_container = {
  name                  = "kigumi"
  container_access_type = "private"
}

# Separate immutable account for nightly dumps (ADR 0019).
enable_backup_storage = true

platform_admin_emails = "alandavidhenry@gmail.com"

# sp-terraform-minato: deploying principal (local applies + CI/CD). Set once.
kv_deployer_object_id = "7b1732f1-3e33-40b4-b134-0321b61a8444"

extra_app_settings = {
  "AI_DAILY_REQUEST_CAP" = "1000"
}

# Azure Monitor alerts (docs/operations.md). Development stays quiet.
alert_emails = ["alandavidhenry@gmail.com"]
