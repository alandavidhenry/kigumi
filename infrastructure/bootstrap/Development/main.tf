terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 5.0"
    }
  }
  required_version = ">= 1.16.0"
}

variable "subscription_id" {
  description = "Azure subscription ID"
  type        = string
}

variable "cicd_sp_object_id" {
  description = "Object ID of the CI/CD service principal that needs access to the Terraform state storage account"
  type        = string
}

provider "azurerm" {
  subscription_id = var.subscription_id
  features {}
}

resource "azurerm_resource_group" "terraform_state" {
  name     = "rg-terraform-state-dev-uks"
  location = "UK South"
}

resource "azurerm_storage_account" "terraform_state" {
  name                     = "tfstatekigumidevuks"
  resource_group_name      = azurerm_resource_group.terraform_state.name
  location                 = azurerm_resource_group.terraform_state.location
  account_tier             = "Standard"
  account_replication_type = "LRS"
  min_tls_version          = "TLS1_2"
}

resource "azurerm_storage_container" "terraform_state" {
  name                  = "tfstatedev"
  storage_account_id    = azurerm_storage_account.terraform_state.id
  container_access_type = "private"
}

resource "azurerm_role_assignment" "cicd_sp_state_blob" {
  scope                = azurerm_storage_account.terraform_state.id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = var.cicd_sp_object_id
}

output "storage_account_name" {
  value = azurerm_storage_account.terraform_state.name
}

output "container_name" {
  value = azurerm_storage_container.terraform_state.name
}
