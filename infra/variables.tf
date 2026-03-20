# =============================================================================
# Input Variables
# =============================================================================

variable "location" {
  description = "Primary Azure region"
  type        = string
  default     = "westus2"
}

variable "dr_location" {
  description = "Disaster recovery Azure region"
  type        = string
  default     = "eastus2"
}

variable "environment" {
  description = "Environment name (production, staging, dev)"
  type        = string
  default     = "production"

  validation {
    condition     = contains(["production", "staging", "dev"], var.environment)
    error_message = "Environment must be one of: production, staging, dev."
  }
}

variable "aks_node_count" {
  description = "Number of nodes in the AKS system node pool"
  type        = number
  default     = 3
}

variable "aks_node_vm_size" {
  description = "VM size for AKS nodes"
  type        = string
  default     = "Standard_D4s_v5"
}

variable "sql_sku" {
  description = "Azure SQL Database SKU (performance tier)"
  type        = string
  default     = "S1"
}

variable "sql_admin_password" {
  description = "Azure SQL Server administrator password"
  type        = string
  sensitive   = true
}

variable "teams_webhook_url" {
  description = "Microsoft Teams incoming webhook URL for alert notifications"
  type        = string
  default     = ""
  sensitive   = true
}
