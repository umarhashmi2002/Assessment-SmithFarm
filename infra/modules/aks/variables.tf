variable "resource_group_name" {
  type = string
}

variable "location" {
  type = string
}

variable "environment" {
  type = string
}

variable "aks_subnet_id" {
  description = "Subnet ID for AKS nodes"
  type        = string
}

variable "acr_id" {
  description = "Azure Container Registry resource ID"
  type        = string
}

variable "log_analytics_id" {
  description = "Log Analytics workspace ID for OMS agent"
  type        = string
}

variable "aks_node_count" {
  type    = number
  default = 3
}

variable "aks_node_vm_size" {
  type    = string
  default = "Standard_D4s_v5"
}

variable "tags" {
  type = map(string)
}
