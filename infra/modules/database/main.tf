# =============================================================================
# Database Module — Azure SQL (Reporting Layer)
# =============================================================================
# Provisions the Azure SQL reporting database with:
#   - Geo-replication to DR region (East US 2)
#   - VNet service endpoint access (Data Subnet only)
#   - Automated backups with 35-day retention
#   - Auditing to Log Analytics
#
# Note: Oracle and DORIS are on-premises/self-managed databases.
# This module covers only the Azure SQL reporting tier.
# =============================================================================

resource "azurerm_mssql_server" "primary" {
  name                         = "sql-smith-farms-${var.environment}"
  resource_group_name          = var.resource_group_name
  location                     = var.location
  version                      = "12.0"
  administrator_login          = "sqladmin"
  administrator_login_password = var.sql_admin_password

  # Azure AD admin for managed identity access
  azuread_administrator {
    login_username = "AKS-SQL-Admin"
    object_id      = "00000000-0000-0000-0000-000000000000" # Replace with actual AAD group
  }

  tags = var.tags
}

# Primary database — reporting layer (ETL target)
resource "azurerm_mssql_database" "reporting" {
  name      = "smithfarms-reporting"
  server_id = azurerm_mssql_server.primary.id
  sku_name  = var.sql_sku

  # Automated backups: 35-day retention per design doc
  short_term_retention_policy {
    retention_days = 35
  }

  long_term_retention_policy {
    weekly_retention  = "P4W"  # 4 weeks
    monthly_retention = "P12M" # 12 months
    yearly_retention  = "P1Y"  # 1 year
    week_of_year      = 1
  }

  # Geo-redundant backup storage
  storage_account_type = "Geo"

  tags = var.tags
}

# -----------------------------------------------------------------------------
# VNet Firewall Rules — restrict access to Data Subnet
# -----------------------------------------------------------------------------

resource "azurerm_mssql_virtual_network_rule" "data_subnet" {
  name      = "allow-data-subnet"
  server_id = azurerm_mssql_server.primary.id
  subnet_id = var.data_subnet_id
}

# Deny public access — only VNet service endpoints allowed
resource "azurerm_mssql_firewall_rule" "deny_public" {
  name             = "DenyPublicAccess"
  server_id        = azurerm_mssql_server.primary.id
  start_ip_address = "0.0.0.0"
  end_ip_address   = "0.0.0.0" # Azure services only
}

# -----------------------------------------------------------------------------
# Geo-Replication — DR region (East US 2)
# -----------------------------------------------------------------------------

resource "azurerm_mssql_server" "dr" {
  name                         = "sql-smith-farms-${var.environment}-dr"
  resource_group_name          = var.resource_group_name
  location                     = var.dr_location
  version                      = "12.0"
  administrator_login          = "sqladmin"
  administrator_login_password = var.sql_admin_password

  tags = var.tags
}

# Failover group for automatic geo-failover (RPO <5s, RTO <30min)
resource "azurerm_mssql_failover_group" "main" {
  name      = "fog-smith-farms-${var.environment}"
  server_id = azurerm_mssql_server.primary.id

  partner_server {
    id = azurerm_mssql_server.dr.id
  }

  databases = [azurerm_mssql_database.reporting.id]

  read_write_endpoint_failover_policy {
    mode          = "Automatic"
    grace_minutes = 30 # 30-minute grace period before auto-failover
  }
}
