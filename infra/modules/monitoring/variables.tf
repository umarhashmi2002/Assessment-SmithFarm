variable "resource_group_name" {
  type = string
}

variable "location" {
  type = string
}

variable "environment" {
  type = string
}

variable "aks_cluster_id" {
  description = "AKS cluster resource ID for diagnostic settings"
  type        = string
}

variable "sql_database_id" {
  description = "Azure SQL database resource ID for diagnostic settings"
  type        = string
}

variable "teams_webhook_url" {
  type      = string
  default   = ""
  sensitive = true
}

variable "tags" {
  type = map(string)
}
