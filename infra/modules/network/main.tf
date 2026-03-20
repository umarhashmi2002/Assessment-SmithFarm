# =============================================================================
# Network Module — VNet, Subnets, NSGs
# =============================================================================
# Implements the network segmentation from the infrastructure design:
#   - AKS Subnet (10.0.1.0/24): Application workloads
#   - Data Subnet (10.0.2.0/24): Databases (Oracle, DORIS, Azure SQL)
#   - Management Subnet (10.0.3.0/24): VDI session hosts
# =============================================================================

resource "azurerm_virtual_network" "main" {
  name                = "vnet-smith-farms-${var.environment}"
  resource_group_name = var.resource_group_name
  location            = var.location
  address_space       = ["10.0.0.0/16"]

  tags = var.tags
}

# -----------------------------------------------------------------------------
# Subnets
# -----------------------------------------------------------------------------

resource "azurerm_subnet" "aks" {
  name                 = "snet-aks"
  resource_group_name  = var.resource_group_name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = ["10.0.1.0/24"]

  service_endpoints = ["Microsoft.Sql", "Microsoft.KeyVault", "Microsoft.ContainerRegistry"]
}

resource "azurerm_subnet" "data" {
  name                 = "snet-data"
  resource_group_name  = var.resource_group_name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = ["10.0.2.0/24"]

  service_endpoints = ["Microsoft.Sql"]
}

resource "azurerm_subnet" "management" {
  name                 = "snet-management"
  resource_group_name  = var.resource_group_name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = ["10.0.3.0/24"]
}

# -----------------------------------------------------------------------------
# Network Security Groups
# -----------------------------------------------------------------------------

# AKS Subnet NSG: Allow inbound HTTPS from load balancer, internal from VDI
resource "azurerm_network_security_group" "aks" {
  name                = "nsg-aks-${var.environment}"
  resource_group_name = var.resource_group_name
  location            = var.location

  # Allow HTTPS from internet (via load balancer)
  security_rule {
    name                       = "AllowHTTPS"
    priority                   = 100
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "443"
    source_address_prefix      = "*"
    destination_address_prefix = "10.0.1.0/24"
  }

  # Allow internal traffic from Management subnet (VDI operators)
  security_rule {
    name                       = "AllowManagementSubnet"
    priority                   = 200
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "*"
    source_port_range          = "*"
    destination_port_range     = "*"
    source_address_prefix      = "10.0.3.0/24"
    destination_address_prefix = "10.0.1.0/24"
  }

  # Deny all other inbound
  security_rule {
    name                       = "DenyAllInbound"
    priority                   = 4096
    direction                  = "Inbound"
    access                     = "Deny"
    protocol                   = "*"
    source_port_range          = "*"
    destination_port_range     = "*"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }

  tags = var.tags
}

# Data Subnet NSG: Only allow traffic from AKS subnet
resource "azurerm_network_security_group" "data" {
  name                = "nsg-data-${var.environment}"
  resource_group_name = var.resource_group_name
  location            = var.location

  # Allow Oracle (1521), DORIS (9030), SQL (1433) from AKS subnet
  security_rule {
    name                       = "AllowAKSToData"
    priority                   = 100
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_ranges    = ["1521", "9030", "1433"]
    source_address_prefix      = "10.0.1.0/24"
    destination_address_prefix = "10.0.2.0/24"
  }

  # Allow management subnet access (DBA tools via VDI)
  security_rule {
    name                       = "AllowManagementToData"
    priority                   = 200
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_ranges    = ["1521", "9030", "1433"]
    source_address_prefix      = "10.0.3.0/24"
    destination_address_prefix = "10.0.2.0/24"
  }

  # Deny all other inbound
  security_rule {
    name                       = "DenyAllInbound"
    priority                   = 4096
    direction                  = "Inbound"
    access                     = "Deny"
    protocol                   = "*"
    source_port_range          = "*"
    destination_port_range     = "*"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }

  tags = var.tags
}

# Management Subnet NSG: Only allow VPN/RDP access
resource "azurerm_network_security_group" "management" {
  name                = "nsg-management-${var.environment}"
  resource_group_name = var.resource_group_name
  location            = var.location

  # Allow RDP from corporate VPN (Tailscale)
  security_rule {
    name                       = "AllowRDP"
    priority                   = 100
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_ranges    = ["3389", "443"]
    source_address_prefix      = "VirtualNetwork"
    destination_address_prefix = "10.0.3.0/24"
  }

  # Deny all other inbound
  security_rule {
    name                       = "DenyAllInbound"
    priority                   = 4096
    direction                  = "Inbound"
    access                     = "Deny"
    protocol                   = "*"
    source_port_range          = "*"
    destination_port_range     = "*"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }

  tags = var.tags
}

# -----------------------------------------------------------------------------
# NSG Associations
# -----------------------------------------------------------------------------

resource "azurerm_subnet_network_security_group_association" "aks" {
  subnet_id                 = azurerm_subnet.aks.id
  network_security_group_id = azurerm_network_security_group.aks.id
}

resource "azurerm_subnet_network_security_group_association" "data" {
  subnet_id                 = azurerm_subnet.data.id
  network_security_group_id = azurerm_network_security_group.data.id
}

resource "azurerm_subnet_network_security_group_association" "management" {
  subnet_id                 = azurerm_subnet.management.id
  network_security_group_id = azurerm_network_security_group.management.id
}
