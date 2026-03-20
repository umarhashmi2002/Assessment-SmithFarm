variable "resource_group_name" {
  type = string
}

variable "location" {
  type = string
}

variable "environment" {
  type = string
}

variable "tenant_id" {
  type = string
}

variable "aks_identity_id" {
  description = "AKS kubelet managed identity object ID"
  type        = string
}

variable "sql_connection_string" {
  type      = string
  sensitive = true
}

variable "teams_webhook_url" {
  type      = string
  default   = ""
  sensitive = true
}

variable "tags" {
  type = map(string)
}
