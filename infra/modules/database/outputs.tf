output "server_fqdn" {
  value = azurerm_mssql_server.primary.fully_qualified_domain_name
}

output "database_id" {
  value = azurerm_mssql_database.reporting.id
}

output "database_name" {
  value = azurerm_mssql_database.reporting.name
}

output "connection_string" {
  description = "ADO.NET connection string (stored in Key Vault, not used directly)"
  value       = "Server=tcp:${azurerm_mssql_server.primary.fully_qualified_domain_name},1433;Database=${azurerm_mssql_database.reporting.name};Authentication=Active Directory Managed Identity;Encrypt=yes;"
  sensitive   = true
}

output "failover_group_name" {
  value = azurerm_mssql_failover_group.main.name
}
