terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
    time = {
      source  = "hashicorp/time"
      version = "~> 0.14"
    }
  }
  required_version = ">= 1.16.0"

  backend "azurerm" {
    resource_group_name  = "rg-terraform-state-dev-uks"
    storage_account_name = "tfstatekigumidevuks"
    container_name       = "tfstatedev"
    key                  = "kigumi-dev.tfstate"
  }
}

provider "azurerm" {
  subscription_id = var.subscription_id
  features {
    key_vault {
      purge_soft_delete_on_destroy    = true
      recover_soft_deleted_key_vaults = true
    }
  }
}
