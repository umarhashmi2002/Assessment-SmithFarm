# =============================================================================
# Smith Farms ETL Monitor — Azure Infrastructure
# =============================================================================
# This Terraform configuration provisions the Azure resources described in
# docs/part1-infrastructure-design.md. It creates a production-ready environment
# with network segmentation, AKS, Azure SQL, Key Vault, and monitoring.
# =============================================================================

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.80"
    }
    azuread = {
      source  = "hashicorp/azuread"
      version = "~> 2.45"
    }
  }
}

provider "azurerm" {
  features {
    key_vault {
      purge_soft_delete_on_destroy = false # Safety: don't purge Key Vault on destroy
    }
  }
}

# -----------------------------------------------------------------------------
# Data Sources
# -----------------------------------------------------------------------------

data "azurerm_client_config" "current" {}

# -----------------------------------------------------------------------------
# Resource Group
# -----------------------------------------------------------------------------

resource "azurerm_resource_group" "main" {
  name     = "rg-smith-farms-${var.environment}"
  location = var.location

  tags = local.common_tags
}

# -----------------------------------------------------------------------------
# Module: Networking (VNet, Subnets, NSGs)
# -----------------------------------------------------------------------------

module "network" {
  source = "./modules/network"

  resource_group_name = azurerm_resource_group.main.name
  location            = var.location
  environment         = var.environment
  tags                = local.common_tags
}

# -----------------------------------------------------------------------------
# Module: Azure Container Registry
# -----------------------------------------------------------------------------

module "acr" {
  source = "./modules/acr"

  resource_group_name = azurerm_resource_group.main.name
  location            = var.location
  environment         = var.environment
  tags                = local.common_tags
}

# -----------------------------------------------------------------------------
# Module: Azure Kubernetes Service
# -----------------------------------------------------------------------------

module "aks" {
  source = "./modules/aks"

  resource_group_name = azurerm_resource_group.main.name
  location            = var.location
  environment         = var.environment
  aks_subnet_id       = module.network.aks_subnet_id
  acr_id              = module.acr.acr_id
  log_analytics_id    = module.monitoring.log_analytics_workspace_id
  aks_node_count      = var.aks_node_count
  aks_node_vm_size    = var.aks_node_vm_size
  tags                = local.common_tags
}

# -----------------------------------------------------------------------------
# Module: Azure SQL Database (Reporting Layer)
# -----------------------------------------------------------------------------

module "database" {
  source = "./modules/database"

  resource_group_name = azurerm_resource_group.main.name
  location            = var.location
  dr_location         = var.dr_location
  environment         = var.environment
  data_subnet_id      = module.network.data_subnet_id
  sql_sku             = var.sql_sku
  sql_admin_password  = var.sql_admin_password
  tags                = local.common_tags
}

# -----------------------------------------------------------------------------
# Module: Azure Key Vault
# -----------------------------------------------------------------------------

module "keyvault" {
  source = "./modules/keyvault"

  resource_group_name  = azurerm_resource_group.main.name
  location             = var.location
  environment          = var.environment
  tenant_id            = data.azurerm_client_config.current.tenant_id
  aks_identity_id      = module.aks.kubelet_identity_object_id
  sql_connection_string = module.database.connection_string
  teams_webhook_url    = var.teams_webhook_url
  tags                 = local.common_tags
}

# -----------------------------------------------------------------------------
# Module: Monitoring & Alerting
# -----------------------------------------------------------------------------

module "monitoring" {
  source = "./modules/monitoring"

  resource_group_name = azurerm_resource_group.main.name
  location            = var.location
  environment         = var.environment
  aks_cluster_id      = module.aks.cluster_id
  sql_database_id     = module.database.database_id
  teams_webhook_url   = var.teams_webhook_url
  tags                = local.common_tags
}
