# State storage for infrastructure/env/Production.
#
# First apply uses local state (the account that will hold it does not exist
# yet). Afterwards, uncomment the backend block below and run
#   terraform init -migrate-state
# so this folder's own state lives in the account it created.
terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.81"
    }
    azapi = {
      source  = "Azure/azapi"
      version = "~> 2.12"
    }
  }
  required_version = ">= 1.16.0"

  # backend "azurerm" {
  #   resource_group_name  = "rg-terraform-state-prod-uks"
  #   storage_account_name = "stkigumitfstateproduks"
  #   container_name       = "tfstateprod"
  #   key                  = "bootstrap-prod.tfstate"
  #   use_azuread_auth     = true
  # }
}

variable "subscription_id" {
  description = "Azure subscription ID"
  type        = string
}

variable "cicd_sp_object_id" {
  description = "Object ID of the CI/CD service principal that needs access to the Terraform state storage account"
  type        = string
}

variable "enable_telemetry" {
  description = "AVM telemetry: anonymous deployment counts sent to Microsoft"
  type        = bool
  default     = false
}

provider "azurerm" {
  subscription_id = var.subscription_id
  features {}
}

locals {
  location       = "UK South"
  container_name = "tfstateprod"
}

module "resource_group" {
  source  = "Azure/avm-res-resources-resourcegroup/azurerm"
  version = "0.5.0"

  name             = "rg-terraform-state-prod-uks"
  location         = local.location
  enable_telemetry = var.enable_telemetry

  # Deleting the state account loses the record of everything Terraform owns.
  lock = {
    kind = "CanNotDelete"
    name = "protect-terraform-state"
  }
}

module "storage_account" {
  source  = "Azure/avm-res-storage-storageaccount/azurerm"
  version = "0.11.0"

  name                     = "stkigumitfstateproduks"
  location                 = local.location
  parent_id                = module.resource_group.resource_id
  account_tier             = "Standard"
  account_replication_type = "LRS"
  min_tls_version          = "TLS1_2"
  enable_telemetry         = var.enable_telemetry

  allow_nested_items_to_be_public = false

  # The backend authenticates with Entra ID (ARM_USE_AZUREAD), so account keys
  # are not needed and stay off.
  shared_access_key_enabled = false

  # CI runs on GitHub-hosted runners with no fixed IPs, so the firewall cannot
  # be locked down; access is Entra ID only.
  public_network_access_enabled = true
  network_rules = {
    bypass         = ["AzureServices"]
    default_action = "Allow"
  }

  # A deleted or overwritten state file is recoverable for 30 days.
  blob_properties = {
    versioning_enabled = true
    delete_retention_policy = {
      days = 30
    }
    container_delete_retention_policy = {
      days = 30
    }
  }

  containers = {
    state = {
      name          = local.container_name
      public_access = "None"
    }
  }

  role_assignments = {
    cicd_sp_state_blob = {
      role_definition_id_or_name = "Storage Blob Data Contributor"
      principal_id               = var.cicd_sp_object_id
      principal_type             = "ServicePrincipal"
    }
  }
}

output "storage_account_name" {
  value = module.storage_account.name
}

output "container_name" {
  value = local.container_name
}
