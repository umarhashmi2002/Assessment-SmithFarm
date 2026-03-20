# =============================================================================
# Key Vault Module — Secrets Management
# =============================================================================
# Centralized secrets storage per design doc:
#   - Database connection strings
#   - Teams webhook URL
#   - API keys
# Access via Managed Identity (AKS kubelet) — no embedded credentials.
# Secrets Store CSI Driver mounts secrets as files in pods.
# =============================================================================

resource "azurerm_key_vault" "main" {
  name                = "kv-smithfarms-${var.environment}"
  resource_group_name = var.resource_group_name
  location            = var.location
  tenant_id           = var.tenant_id
  sku_name            = "standard"

  # Security settings per design doc
  soft_delete_retention_days = 90
  purge_protection_enabled   = true # Prevent accidental permanent deletion
  enable_rbac_authorization  = true

  # Network ACLs — restrict to VNet
  network_acls {
    default_action = "Deny"
    bypass         = "AzureServices"
  }

  tags = var.tags
}

# -----------------------------------------------------------------------------
# RBAC: AKS Managed Identity can read secrets
# -----------------------------------------------------------------------------

resource "azurerm_role_assignment" "aks_secrets_reader" {
  scope                = azurerm_key_vault.main.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = var.aks_identity_id
}

# -----------------------------------------------------------------------------
# Secrets — stored in Key Vault, mounted in pods via CSI driver
# -----------------------------------------------------------------------------

resource "azurerm_key_vault_secret" "sql_connection_string" {
  name         = "sql-connection-string"
  value        = var.sql_connection_string
  key_vault_id = azurerm_key_vault.main.id

  depends_on = [azurerm_role_assignment.aks_secrets_reader]
}

resource "azurerm_key_vault_secret" "teams_webhook_url" {
  count        = var.teams_webhook_url != "" ? 1 : 0
  name         = "teams-webhook-url"
  value        = var.teams_webhook_url
  key_vault_id = azurerm_key_vault.main.id

  depends_on = [azurerm_role_assignment.aks_secrets_reader]
}
