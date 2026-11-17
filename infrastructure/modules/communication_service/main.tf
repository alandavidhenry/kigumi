# No AVM module exists for the Communication Service resource itself, so it
# stays a plain azurerm resource; the email service and domain use AVM.
resource "azurerm_communication_service" "main" {
  name                = "acs-${var.project}-${var.environment}-${var.location_short}"
  resource_group_name = var.resource_group_name
  data_location       = var.data_location
  tags                = var.tags
}

module "email_service" {
  source  = "Azure/avm-res-communication-emailservice/azurerm"
  version = "0.3.0"

  name          = "ecs-${var.project}-${var.environment}-${var.location_short}"
  location      = "global"
  parent_id     = var.resource_group_id
  data_location = var.data_location
  tags          = var.tags

  enable_telemetry = var.enable_telemetry

  email_communication_service_domains = {
    managed = {
      name              = "AzureManagedDomain"
      domain_management = "AzureManaged"
    }
  }
}

resource "azurerm_communication_service_email_domain_association" "main" {
  communication_service_id = azurerm_communication_service.main.id
  email_service_domain_id  = module.email_service.domain_resource_ids["managed"]
}
