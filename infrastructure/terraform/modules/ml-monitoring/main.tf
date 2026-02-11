# CloudWatch Alarms for ML Model Performance Monitoring and Automated Retraining

terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# SNS Topic for Retraining Notifications
resource "aws_sns_topic" "ml_retraining" {
  name = "kinga-ml-retraining-alerts"
  
  tags = {
    Name        = "kinga-ml-retraining-alerts"
    Environment = var.environment
  }
}

resource "aws_sns_topic_subscription" "ml_team_email" {
  topic_arn = aws_sns_topic.ml_retraining.arn
  protocol  = "email"
  endpoint  = var.ml_team_email
}

resource "aws_sns_topic_subscription" "airflow_webhook" {
  topic_arn = aws_sns_topic.ml_retraining.arn
  protocol  = "https"
  endpoint  = var.airflow_webhook_url
}

# Fraud Detection Model Alarms
resource "aws_cloudwatch_metric_alarm" "fraud_model_auc_roc_degradation" {
  alarm_name          = "kinga-fraud-model-auc-roc-degradation"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 2
  metric_name         = "fraud-detection_auc_roc"
  namespace           = "KINGA/ML"
  period              = 86400  # 1 day
  statistic           = "Average"
  threshold           = 0.90
  alarm_description   = "Fraud detection model AUC-ROC dropped below 0.90"
  alarm_actions       = [aws_sns_topic.ml_retraining.arn]
  
  tags = {
    Name        = "fraud-model-auc-degradation"
    ModelFamily = "fraud-detection"
    Severity    = "high"
  }
}

resource "aws_cloudwatch_metric_alarm" "fraud_model_precision_degradation" {
  alarm_name          = "kinga-fraud-model-precision-degradation"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 2
  metric_name         = "fraud-detection_precision_at_90_recall"
  namespace           = "KINGA/ML"
  period              = 86400
  statistic           = "Average"
  threshold           = 0.80
  alarm_description   = "Fraud detection model precision @ 90% recall dropped below 0.80"
  alarm_actions       = [aws_sns_topic.ml_retraining.arn]
  
  tags = {
    Name        = "fraud-model-precision-degradation"
    ModelFamily = "fraud-detection"
    Severity    = "high"
  }
}

resource "aws_cloudwatch_metric_alarm" "fraud_model_false_positive_rate" {
  alarm_name          = "kinga-fraud-model-high-false-positives"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "fraud-detection_false_positive_rate"
  namespace           = "KINGA/ML"
  period              = 86400
  statistic           = "Average"
  threshold           = 0.05  # 5%
  alarm_description   = "Fraud detection model false positive rate exceeded 5%"
  alarm_actions       = [aws_sns_topic.ml_retraining.arn]
  
  tags = {
    Name        = "fraud-model-high-fp"
    ModelFamily = "fraud-detection"
    Severity    = "medium"
  }
}

# Damage Detection Model Alarms
resource "aws_cloudwatch_metric_alarm" "damage_model_mae_degradation" {
  alarm_name          = "kinga-damage-model-mae-degradation"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "damage-detection_mae"
  namespace           = "KINGA/ML"
  period              = 86400
  statistic           = "Average"
  threshold           = 5.5  # 10% above target of 5.0
  alarm_description   = "Damage detection model MAE exceeded 5.5 points"
  alarm_actions       = [aws_sns_topic.ml_retraining.arn]
  
  tags = {
    Name        = "damage-model-mae-degradation"
    ModelFamily = "damage-detection"
    Severity    = "high"
  }
}

resource "aws_cloudwatch_metric_alarm" "damage_model_component_f1_degradation" {
  alarm_name          = "kinga-damage-model-component-f1-degradation"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 2
  metric_name         = "damage-detection_component_f1"
  namespace           = "KINGA/ML"
  period              = 86400
  statistic           = "Average"
  threshold           = 0.85  # Below 0.90 target
  alarm_description   = "Damage detection model component F1 score dropped below 0.85"
  alarm_actions       = [aws_sns_topic.ml_retraining.arn]
  
  tags = {
    Name        = "damage-model-f1-degradation"
    ModelFamily = "damage-detection"
    Severity    = "high"
  }
}

# Cost Optimization Model Alarms
resource "aws_cloudwatch_metric_alarm" "cost_model_mape_degradation" {
  alarm_name          = "kinga-cost-model-mape-degradation"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "cost-optimization_mape"
  namespace           = "KINGA/ML"
  period              = 86400
  statistic           = "Average"
  threshold           = 18.0  # 20% above target of 15%
  alarm_description   = "Cost optimization model MAPE exceeded 18%"
  alarm_actions       = [aws_sns_topic.ml_retraining.arn]
  
  tags = {
    Name        = "cost-model-mape-degradation"
    ModelFamily = "cost-optimization"
    Severity    = "high"
  }
}

resource "aws_cloudwatch_metric_alarm" "cost_model_r2_degradation" {
  alarm_name          = "kinga-cost-model-r2-degradation"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 2
  metric_name         = "cost-optimization_r2"
  namespace           = "KINGA/ML"
  period              = 86400
  statistic           = "Average"
  threshold           = 0.80  # Below 0.85 target
  alarm_description   = "Cost optimization model R² dropped below 0.80"
  alarm_actions       = [aws_sns_topic.ml_retraining.arn]
  
  tags = {
    Name        = "cost-model-r2-degradation"
    ModelFamily = "cost-optimization"
    Severity    = "high"
  }
}

# Physics Validation Model Alarms
resource "aws_cloudwatch_metric_alarm" "physics_model_accuracy_degradation" {
  alarm_name          = "kinga-physics-model-accuracy-degradation"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 2
  metric_name         = "physics-validation_accuracy"
  namespace           = "KINGA/ML"
  period              = 86400
  statistic           = "Average"
  threshold           = 0.80  # Below 0.85 target
  alarm_description   = "Physics validation model accuracy dropped below 80%"
  alarm_actions       = [aws_sns_topic.ml_retraining.arn]
  
  tags = {
    Name        = "physics-model-accuracy-degradation"
    ModelFamily = "physics-validation"
    Severity    = "high"
  }
}

# Risk Intelligence Model Alarms
resource "aws_cloudwatch_metric_alarm" "risk_model_accuracy_degradation" {
  alarm_name          = "kinga-risk-model-accuracy-degradation"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 2
  metric_name         = "risk-intelligence_accuracy"
  namespace           = "KINGA/ML"
  period              = 86400
  statistic           = "Average"
  threshold           = 0.75  # Below 0.80 target
  alarm_description   = "Risk intelligence model accuracy dropped below 75%"
  alarm_actions       = [aws_sns_topic.ml_retraining.arn]
  
  tags = {
    Name        = "risk-model-accuracy-degradation"
    ModelFamily = "risk-intelligence"
    Severity    = "high"
  }
}

# Data Drift Alarms
resource "aws_cloudwatch_metric_alarm" "fraud_data_drift" {
  alarm_name          = "kinga-fraud-data-drift-detected"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "fraud-detection_data_drift_score"
  namespace           = "KINGA/ML"
  period              = 86400
  statistic           = "Maximum"
  threshold           = 0.15  # 15% drift threshold
  alarm_description   = "Significant data drift detected in fraud detection features"
  alarm_actions       = [aws_sns_topic.ml_retraining.arn]
  
  tags = {
    Name        = "fraud-data-drift"
    ModelFamily = "fraud-detection"
    Severity    = "medium"
  }
}

resource "aws_cloudwatch_metric_alarm" "damage_data_drift" {
  alarm_name          = "kinga-damage-data-drift-detected"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "damage-detection_data_drift_score"
  namespace           = "KINGA/ML"
  period              = 86400
  statistic           = "Maximum"
  threshold           = 0.15
  alarm_description   = "Significant data drift detected in damage detection features"
  alarm_actions       = [aws_sns_topic.ml_retraining.arn]
  
  tags = {
    Name        = "damage-data-drift"
    ModelFamily = "damage-detection"
    Severity    = "medium"
  }
}

# Model Latency Alarms
resource "aws_cloudwatch_metric_alarm" "fraud_model_high_latency" {
  alarm_name          = "kinga-fraud-model-high-latency"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "ModelLatency"
  namespace           = "AWS/SageMaker"
  period              = 300  # 5 minutes
  statistic           = "Average"
  threshold           = 100  # 100ms
  alarm_description   = "Fraud detection model latency exceeded 100ms"
  
  dimensions = {
    EndpointName = "fraud-detection-production"
    VariantName  = "AllTraffic"
  }
  
  tags = {
    Name        = "fraud-model-high-latency"
    ModelFamily = "fraud-detection"
    Severity    = "medium"
  }
}

resource "aws_cloudwatch_metric_alarm" "damage_model_high_latency" {
  alarm_name          = "kinga-damage-model-high-latency"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "ModelLatency"
  namespace           = "AWS/SageMaker"
  period              = 300
  statistic           = "Average"
  threshold           = 200  # 200ms
  alarm_description   = "Damage detection model latency exceeded 200ms"
  
  dimensions = {
    EndpointName = "damage-detection-production"
    VariantName  = "AllTraffic"
  }
  
  tags = {
    Name        = "damage-model-high-latency"
    ModelFamily = "damage-detection"
    Severity    = "medium"
  }
}

# Model Invocation Error Rate Alarms
resource "aws_cloudwatch_metric_alarm" "fraud_model_error_rate" {
  alarm_name          = "kinga-fraud-model-high-error-rate"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "ModelInvocation4XXErrors"
  namespace           = "AWS/SageMaker"
  period              = 300
  statistic           = "Sum"
  threshold           = 10
  alarm_description   = "Fraud detection model 4XX error count exceeded 10 in 5 minutes"
  
  dimensions = {
    EndpointName = "fraud-detection-production"
    VariantName  = "AllTraffic"
  }
  
  tags = {
    Name        = "fraud-model-error-rate"
    ModelFamily = "fraud-detection"
    Severity    = "high"
  }
}

# CloudWatch Dashboard
resource "aws_cloudwatch_dashboard" "ml_models_performance" {
  dashboard_name = "kinga-ml-models-performance"
  
  dashboard_body = jsonencode({
    widgets = [
      {
        type = "metric"
        properties = {
          metrics = [
            ["KINGA/ML", "fraud-detection_auc_roc", { stat = "Average", label = "Fraud AUC-ROC" }],
            [".", "fraud-detection_precision_at_90_recall", { stat = "Average", label = "Fraud Precision @ 90% Recall" }]
          ]
          period = 86400
          stat   = "Average"
          region = var.aws_region
          title  = "Fraud Detection Model Performance"
          yAxis = {
            left = {
              min = 0
              max = 1
            }
          }
        }
      },
      {
        type = "metric"
        properties = {
          metrics = [
            ["KINGA/ML", "damage-detection_mae", { stat = "Average", label = "Damage MAE" }]
          ]
          period = 86400
          stat   = "Average"
          region = var.aws_region
          title  = "Damage Detection Model Performance"
        }
      },
      {
        type = "metric"
        properties = {
          metrics = [
            ["KINGA/ML", "cost-optimization_mape", { stat = "Average", label = "Cost MAPE" }],
            [".", "cost-optimization_r2", { stat = "Average", label = "Cost R²", yAxis = "right" }]
          ]
          period = 86400
          stat   = "Average"
          region = var.aws_region
          title  = "Cost Optimization Model Performance"
        }
      },
      {
        type = "metric"
        properties = {
          metrics = [
            ["AWS/SageMaker", "ModelLatency", { stat = "Average", dimensions = { EndpointName = "fraud-detection-production" }, label = "Fraud Latency" }],
            ["...", { dimensions = { EndpointName = "damage-detection-production" }, label = "Damage Latency" }]
          ]
          period = 300
          stat   = "Average"
          region = var.aws_region
          title  = "Model Inference Latency"
        }
      },
      {
        type = "metric"
        properties = {
          metrics = [
            ["KINGA/ML", "fraud-detection_data_drift_score", { stat = "Maximum", label = "Fraud Drift" }],
            [".", "damage-detection_data_drift_score", { stat = "Maximum", label = "Damage Drift" }]
          ]
          period = 86400
          stat   = "Maximum"
          region = var.aws_region
          title  = "Data Drift Scores"
          annotations = {
            horizontal = [
              {
                value = 0.15
                label = "Drift Threshold"
                fill  = "above"
                color = "#ff0000"
              }
            ]
          }
        }
      }
    ]
  })
}

# Outputs
output "retraining_sns_topic_arn" {
  description = "SNS topic ARN for retraining notifications"
  value       = aws_sns_topic.ml_retraining.arn
}

output "dashboard_url" {
  description = "CloudWatch dashboard URL"
  value       = "https://console.aws.amazon.com/cloudwatch/home?region=${var.aws_region}#dashboards:name=${aws_cloudwatch_dashboard.ml_models_performance.dashboard_name}"
}
