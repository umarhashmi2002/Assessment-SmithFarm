# =============================================================================
# Monitoring Module — Log Analytics, Alerts, Diagnostics
# =============================================================================
# Implements the observability architecture from the design doc:
#   - Log Analytics workspace for centralized log aggregation
#   - Diagnostic settings for AKS and Azure SQL
#   - Alert rules with Teams webhook action group
#   - Severity tiers: P1 (Critical), P2 (High), P3 (Warning)
# =============================================================================

resource "azurerm_log_analytics_workspace" "main" {
  name                = "law-smith-farms-${var.environment}"
  resource_group_name = var.resource_group_name
  location            = var.location
  sku                 = "PerGB2018"
  retention_in_days   = 90 # 90-day retention for compliance

  tags = var.tags
}

# -----------------------------------------------------------------------------
# Diagnostic Settings — AKS logs and metrics to Log Analytics
# -----------------------------------------------------------------------------

resource "azurerm_monitor_diagnostic_setting" "aks" {
  name                       = "aks-diagnostics"
  target_resource_id         = var.aks_cluster_id
  log_analytics_workspace_id = azurerm_log_analytics_workspace.main.id

  enabled_log {
    category = "kube-apiserver"
  }

  enabled_log {
    category = "kube-controller-manager"
  }

  enabled_log {
    category = "kube-scheduler"
  }

  enabled_log {
    category = "kube-audit"
  }

  enabled_log {
    category = "guard"
  }

  metric {
    category = "AllMetrics"
    enabled  = true
  }
}

# Diagnostic Settings — Azure SQL
resource "azurerm_monitor_diagnostic_setting" "sql" {
  name                       = "sql-diagnostics"
  target_resource_id         = var.sql_database_id
  log_analytics_workspace_id = azurerm_log_analytics_workspace.main.id

  enabled_log {
    category = "SQLInsights"
  }

  enabled_log {
    category = "QueryStoreRuntimeStatistics"
  }

  enabled_log {
    category = "Errors"
  }

  metric {
    category = "Basic"
    enabled  = true
  }
}

# -----------------------------------------------------------------------------
# Action Group — Teams webhook for alert notifications
# -----------------------------------------------------------------------------

resource "azurerm_monitor_action_group" "teams" {
  name                = "ag-teams-${var.environment}"
  resource_group_name = var.resource_group_name
  short_name          = "teams"

  # Teams webhook integration (if configured)
  dynamic "webhook_receiver" {
    for_each = var.teams_webhook_url != "" ? [1] : []
    content {
      name                    = "teams-webhook"
      service_uri             = var.teams_webhook_url
      use_common_alert_schema = true
    }
  }

  # Email fallback
  email_receiver {
    name          = "platform-team"
    email_address = "platform-alerts@smithfarms.example.com"
  }

  tags = var.tags
}

# -----------------------------------------------------------------------------
# Alert Rules — matching design doc severity tiers
# -----------------------------------------------------------------------------

# P2: AKS pod restart count (crash loop detection)
resource "azurerm_monitor_metric_alert" "pod_restart" {
  name                = "alert-pod-restarts-${var.environment}"
  resource_group_name = var.resource_group_name
  scopes              = [var.aks_cluster_id]
  description         = "P2: Pod restart count exceeds threshold (possible crash loop)"
  severity            = 2
  frequency           = "PT5M"
  window_size         = "PT15M"

  criteria {
    metric_namespace = "Insights.Container/pods"
    metric_name      = "restartingContainerCount"
    aggregation      = "Average"
    operator         = "GreaterThan"
    threshold        = 3
  }

  action {
    action_group_id = azurerm_monitor_action_group.teams.id
  }

  tags = var.tags
}

# P3: Azure SQL DTU utilization >80%
resource "azurerm_monitor_metric_alert" "sql_dtu" {
  name                = "alert-sql-dtu-${var.environment}"
  resource_group_name = var.resource_group_name
  scopes              = [var.sql_database_id]
  description         = "P3: Azure SQL DTU utilization sustained above 80%"
  severity            = 3
  frequency           = "PT5M"
  window_size         = "PT15M"

  criteria {
    metric_namespace = "Microsoft.Sql/servers/databases"
    metric_name      = "dtu_consumption_percent"
    aggregation      = "Average"
    operator         = "GreaterThan"
    threshold        = 80
  }

  action {
    action_group_id = azurerm_monitor_action_group.teams.id
  }

  tags = var.tags
}

# P1: Azure SQL connection failures (database unreachable)
resource "azurerm_monitor_metric_alert" "sql_connection_failed" {
  name                = "alert-sql-connection-failed-${var.environment}"
  resource_group_name = var.resource_group_name
  scopes              = [var.sql_database_id]
  description         = "P1: Azure SQL connection failures detected"
  severity            = 1
  frequency           = "PT1M"
  window_size         = "PT5M"

  criteria {
    metric_namespace = "Microsoft.Sql/servers/databases"
    metric_name      = "connection_failed"
    aggregation      = "Total"
    operator         = "GreaterThan"
    threshold        = 5
  }

  action {
    action_group_id = azurerm_monitor_action_group.teams.id
  }

  tags = var.tags
}
