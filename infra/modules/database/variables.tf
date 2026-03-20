variable "resource_group_name" {
  type = string
}

variable "location" {
  type = string
}

variable "dr_location" {
  type = string
}

variable "environment" {
  type = string
}

variable "data_subnet_id" {
  description = "Data subnet ID for VNet service endpoint access"
  type        = string
}

variable "sql_sku" {
  type    = string
  default = "S1"
}

variable "sql_admin_password" {
  type      = string
  sensitive = true
}

variable "tags" {
  type = map(string)
}
