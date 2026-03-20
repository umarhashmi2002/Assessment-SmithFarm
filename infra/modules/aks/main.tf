# =============================================================================
# AKS Module — Azure Kubernetes Service
# =============================================================================
# Provisions the AKS cluster matching the design doc:
#   - System node pool (3 nodes) for core services
#   - App node pool (auto-scaling 2-10) for ETL Monitor + Airflow workloads
#   - Azure CNI networking in the AKS subnet
#   - Managed identity for Key Vault and ACR access
#   - OMS agent for Azure Monitor integration
# =============================================================================

resource "azurerm_kubernetes_cluster" "main" {
  name                = "aks-smith-farms-${var.environment}"
  resource_group_name = var.resource_group_name
  location            = var.location
  dns_prefix          = "smith-farms-${var.environment}"
  kubernetes_version  = "1.29"

  # System node pool — runs kube-system, CoreDNS, metrics-server
  default_node_pool {
    name                = "system"
    node_count          = var.aks_node_count
    vm_size             = var.aks_node_vm_size
    vnet_subnet_id      = var.aks_subnet_id
    os_disk_size_gb     = 128
    max_pods            = 50
    type                = "VirtualMachineScaleSets"
    enable_auto_scaling = true
    min_count           = 3
    max_count           = 8 # Cluster autoscaler: 3-8 nodes per design doc

    node_labels = {
      "nodepool" = "system"
    }
  }

  # Managed identity (no service principal credentials to rotate)
  identity {
    type = "SystemAssigned"
  }

  # Azure CNI for VNet-native pod networking
  network_profile {
    network_plugin    = "azure"
    network_policy    = "calico" # Calico network policies per design doc
    service_cidr      = "10.1.0.0/16"
    dns_service_ip    = "10.1.0.10"
    load_balancer_sku = "standard"
  }

  # Azure Monitor integration
  oms_agent {
    log_analytics_workspace_id = var.log_analytics_id
  }

  # RBAC with Azure AD integration
  azure_active_directory_role_based_access_control {
    managed            = true
    azure_rbac_enabled = true
  }

  tags = var.tags
}

# -----------------------------------------------------------------------------
# App Node Pool — ETL Monitor API, Dashboard, Airflow workers
# -----------------------------------------------------------------------------

resource "azurerm_kubernetes_cluster_node_pool" "app" {
  name                  = "app"
  kubernetes_cluster_id = azurerm_kubernetes_cluster.main.id
  vm_size               = var.aks_node_vm_size
  vnet_subnet_id        = var.aks_subnet_id
  os_disk_size_gb       = 128
  max_pods              = 50

  # Auto-scaling: HPA + cluster autoscaler per design doc
  enable_auto_scaling = true
  min_count           = 2
  max_count           = 10

  node_labels = {
    "nodepool" = "app"
  }

  node_taints = []

  tags = var.tags
}

# -----------------------------------------------------------------------------
# ACR Pull Permission — AKS can pull images from Container Registry
# -----------------------------------------------------------------------------

resource "azurerm_role_assignment" "aks_acr_pull" {
  principal_id                     = azurerm_kubernetes_cluster.main.kubelet_identity[0].object_id
  role_definition_name             = "AcrPull"
  scope                            = var.acr_id
  skip_service_principal_aad_check = true
}
