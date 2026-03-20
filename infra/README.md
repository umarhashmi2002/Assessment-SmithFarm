# Infrastructure as Code — Azure Deployment

Terraform configuration for deploying the Smith Farms ETL Monitor platform to Azure. This IaC maps directly to the architecture described in [`docs/part1-infrastructure-design.md`](../docs/part1-infrastructure-design.md).

## Architecture Provisioned

```
Azure (West US 2 — Primary)
├── Resource Group
├── Virtual Network (10.0.0.0/16)
│   ├── AKS Subnet (10.0.1.0/24)
│   ├── Data Subnet (10.0.2.0/24)
│   └── Management Subnet (10.0.3.0/24)
├── AKS Cluster (3-node system pool + app node pool)
├── Azure SQL Database (reporting layer)
├── Azure Key Vault (secrets management)
├── Azure Container Registry
├── Log Analytics Workspace + Azure Monitor
└── Network Security Groups (per-subnet)
```

## Prerequisites

- [Terraform](https://developer.hashicorp.com/terraform/install) >= 1.5
- [Azure CLI](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli) >= 2.50
- An Azure subscription with Contributor access

## Quick Start

```bash
# Authenticate with Azure
az login
az account set --subscription "<your-subscription-id>"

# Initialize and plan
cd infra
terraform init
terraform plan -out=tfplan

# Apply (creates resources — costs will apply)
terraform apply tfplan
```

## Configuration

Copy `terraform.tfvars.example` to `terraform.tfvars` and adjust:

```bash
cp terraform.tfvars.example terraform.tfvars
```

Key variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `location` | `westus2` | Primary Azure region |
| `dr_location` | `eastus2` | DR region for geo-replication |
| `environment` | `production` | Environment tag (`production`, `staging`) |
| `aks_node_count` | `3` | Initial AKS system node pool size |
| `sql_sku` | `S1` | Azure SQL performance tier |
| `teams_webhook_url` | `""` | Microsoft Teams webhook URL for alerts |

## Modules

| Module | Resources | Purpose |
|--------|-----------|---------|
| `network` | VNet, subnets, NSGs | Network segmentation per design doc |
| `aks` | AKS cluster, node pools, managed identity | Container orchestration |
| `database` | Azure SQL Server + DB, firewall rules | Reporting layer with geo-replication |
| `keyvault` | Key Vault, access policies | Centralized secrets management |
| `monitoring` | Log Analytics, diagnostic settings, alert rules | Observability and alerting |
| `acr` | Container Registry | Private image storage |

## Security Notes

- All database endpoints use private networking (VNet service endpoints)
- Key Vault uses RBAC access policies with managed identities
- NSGs enforce subnet-level traffic isolation matching the design doc
- No secrets are stored in Terraform state — use remote backend with encryption

## Cost Estimate

For a minimal production deployment (3-node AKS, S1 SQL, Standard Key Vault):
- Estimated: ~$400–600/month
- See `docs/part1-infrastructure-design.md` for full scaling cost analysis

## State Management

For production use, configure a remote backend:

```hcl
terraform {
  backend "azurerm" {
    resource_group_name  = "smith-farms-tfstate"
    storage_account_name = "smithfarmstfstate"
    container_name       = "tfstate"
    key                  = "production.terraform.tfstate"
  }
}
```

## Destroying Resources

```bash
terraform destroy
```
