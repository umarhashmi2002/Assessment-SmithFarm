# =============================================================================
# Outputs
# =============================================================================

output "resource_group_name" {
  description = "Name of the Azure resource group"
  value       = azurerm_resource_group.main.name
}

output "aks_cluster_name" {
  description = "Name of the AKS cluster"
  value       = module.aks.cluster_name
}

output "aks_kube_config_command" {
  description = "Command to configure kubectl"
  value       = "az aks get-credentials --resource-group ${azurerm_resource_group.main.name} --name ${module.aks.cluster_name}"
}

output "acr_login_server" {
  description = "ACR login server URL for docker push"
  value       = module.acr.login_server
}

output "sql_server_fqdn" {
  description = "Azure SQL Server fully qualified domain name"
  value       = module.database.server_fqdn
}

output "keyvault_uri" {
  description = "Azure Key Vault URI"
  value       = module.keyvault.vault_uri
}

output "log_analytics_workspace_id" {
  description = "Log Analytics workspace ID for querying logs"
  value       = module.monitoring.log_analytics_workspace_id
}
