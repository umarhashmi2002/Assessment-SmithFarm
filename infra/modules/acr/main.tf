# =============================================================================
# ACR Module — Azure Container Registry
# =============================================================================
# Private container registry co-located with AKS for fast image pulls.
# AKS pulls images via managed identity (AcrPull role assigned in AKS module).
# =============================================================================

resource "azurerm_container_registry" "main" {
  name                = "acrsmithfarms${var.environment}"
  resource_group_name = var.resource_group_name
  location            = var.location
  sku                 = "Standard"
  admin_enabled       = false # Use managed identity, not admin credentials

  tags = var.tags
}
