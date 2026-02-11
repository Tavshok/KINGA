variable "environment" {
  description = "Environment name (dev, staging, production)"
  type        = string
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "ml_team_email" {
  description = "Email address for ML team notifications"
  type        = string
}

variable "airflow_webhook_url" {
  description = "Airflow webhook URL for triggering retraining DAGs"
  type        = string
}
