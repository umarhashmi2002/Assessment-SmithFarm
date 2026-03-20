# =============================================================================
# Local Values
# =============================================================================

locals {
  common_tags = {
    Project     = "smith-farms-etl-monitor"
    Environment = var.environment
    ManagedBy   = "terraform"
    Owner       = "platform-engineering"
  }
}
