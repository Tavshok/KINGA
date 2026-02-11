# KINGA MLOps Deployment Guide

**Author:** Tavonga Shoko  
**Version:** 1.0.0  
**Date:** February 11, 2026

---

## Executive Summary

This document provides comprehensive deployment instructions for the KINGA MLOps infrastructure, including MLflow tracking server on Amazon ECS, fraud detection training pipeline on Apache Airflow, and automated retraining monitors using CloudWatch alarms. The deployment establishes a production-ready machine learning operations platform with experiment tracking, model registry, automated training workflows, and intelligent retraining triggers based on performance degradation and data drift.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [MLflow Tracking Server Deployment](#mlflow-tracking-server-deployment)
4. [Airflow DAG Deployment](#airflow-dag-deployment)
5. [CloudWatch Monitoring Setup](#cloudwatch-monitoring-setup)
6. [Testing and Validation](#testing-and-validation)
7. [Operational Procedures](#operational-procedures)
8. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

The KINGA MLOps platform consists of three primary components that work together to provide automated machine learning model lifecycle management.

### Component Architecture

**MLflow Tracking Server** serves as the centralized experiment tracking and model registry system. It runs on Amazon ECS Fargate with an RDS PostgreSQL backend for metadata storage and S3 for artifact storage. The tracking server provides a REST API for logging experiments, parameters, metrics, and models, accessible to data scientists and automated training pipelines.

**Airflow Training Pipelines** orchestrate the complete model training workflow from feature retrieval through model deployment. The fraud detection DAG executes weekly, retrieving features from SageMaker Feature Store, preparing stratified train/val/test datasets, training XGBoost models with hyperparameter tuning, validating performance against production thresholds, registering models in MLflow, and deploying to SageMaker endpoints with blue/green deployment.

**CloudWatch Monitoring** provides real-time performance tracking and automated retraining triggers. Alarms monitor model performance metrics (AUC-ROC, MAE, MAPE, R²), data drift scores, inference latency, and error rates. When thresholds are breached, SNS notifications trigger Airflow DAGs to initiate retraining workflows automatically.

### Data Flow

The system operates in a continuous feedback loop. Production models serve predictions via SageMaker endpoints while logging performance metrics to CloudWatch. When performance degrades below defined thresholds or data drift is detected, CloudWatch alarms trigger SNS notifications that invoke Airflow webhooks. Airflow DAGs retrieve fresh data from Feature Store, train new models, log experiments to MLflow, validate performance, and promote models to production if validation passes. The cycle repeats automatically to maintain optimal model performance.

---

## Prerequisites

Before deploying the MLOps infrastructure, ensure the following prerequisites are met.

### AWS Account Configuration

You must have an AWS account with appropriate IAM permissions to create ECS clusters, RDS databases, S3 buckets, CloudWatch alarms, SNS topics, and SageMaker resources. The deploying user or role requires permissions for `ecs:*`, `rds:*`, `s3:*`, `cloudwatch:*`, `sns:*`, `sagemaker:*`, and `iam:PassRole`.

### Terraform Installation

Install Terraform version 1.0 or higher on your deployment machine. Verify installation by running `terraform version`. Configure AWS credentials using environment variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`) or AWS CLI profiles.

### Existing Infrastructure

The MLOps deployment assumes you have already deployed the core KINGA infrastructure including VPC with private subnets, EKS cluster for microservices, MSK Kafka cluster for event streaming, and S3 data lake with bronze/silver/gold layers. These components are created by the Terraform modules in `infrastructure/terraform/modules/`.

### Docker and ECR

Install Docker to build the MLflow container image. Create an Amazon ECR repository named `kinga/mlflow` to store the image. Authenticate Docker to ECR using `aws ecr get-login-password`.

### Apache Airflow

Deploy Amazon Managed Workflows for Apache Airflow (MWAA) environment with Python 3.11 runtime. Configure the environment with access to S3 buckets for DAG storage and SageMaker Feature Store for data retrieval. Install required Python packages: `mlflow==2.10.2`, `xgboost==2.0.3`, `scikit-learn==1.4.0`, `pandas==2.1.4`, `boto3==1.34.34`.

---

## MLflow Tracking Server Deployment

Deploy the MLflow tracking server on Amazon ECS Fargate with high availability and persistent storage.

### Step 1: Build and Push MLflow Docker Image

Navigate to the MLflow deployment directory and build the Docker image.

```bash
cd /home/ubuntu/kinga-replit/deployment/mlflow
docker build -t kinga/mlflow:latest .
```

Tag the image for ECR and push to the repository.

```bash
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 123456789012.dkr.ecr.us-east-1.amazonaws.com
docker tag kinga/mlflow:latest 123456789012.dkr.ecr.us-east-1.amazonaws.com/kinga/mlflow:latest
docker push 123456789012.dkr.ecr.us-east-1.amazonaws.com/kinga/mlflow:latest
```

Replace `123456789012` with your AWS account ID and `us-east-1` with your deployment region.

### Step 2: Deploy Infrastructure with Terraform

Navigate to the Terraform MLflow module directory.

```bash
cd /home/ubuntu/kinga-replit/infrastructure/terraform/modules/mlflow
```

Create a `terraform.tfvars` file with your configuration.

```hcl
environment          = "production"
aws_region           = "us-east-1"
vpc_id               = "vpc-0123456789abcdef0"
vpc_cidr             = "10.0.0.0/16"
private_subnet_ids   = ["subnet-0123456789abcdef0", "subnet-0123456789abcdef1"]
db_username          = "mlflow"
db_password          = "CHANGE_ME_SECURE_PASSWORD"
ecr_repository_url   = "123456789012.dkr.ecr.us-east-1.amazonaws.com/kinga/mlflow"
```

Initialize Terraform and apply the configuration.

```bash
terraform init
terraform plan
terraform apply
```

Review the plan output carefully. Terraform will create the RDS PostgreSQL database, S3 artifacts bucket, ECS cluster, task definition, service, application load balancer, security groups, IAM roles, and CloudWatch log group. Type `yes` to confirm and apply the changes.

### Step 3: Verify Deployment

After Terraform completes, retrieve the MLflow endpoint URL from the outputs.

```bash
terraform output mlflow_endpoint
```

The output will show the internal ALB DNS name, for example `http://kinga-mlflow-alb-123456789.us-east-1.elb.amazonaws.com`. Access this URL from within the VPC to verify the MLflow UI loads successfully.

Check ECS service health in the AWS Console. Navigate to ECS > Clusters > kinga-mlflow-cluster > Services > kinga-mlflow-service. Verify that the desired count matches the running count (2 tasks) and all tasks are in `RUNNING` state.

### Step 4: Configure DNS (Optional)

For easier access, create a Route 53 private hosted zone record pointing to the ALB.

```bash
aws route53 create-hosted-zone --name kinga.internal --vpc VPCRegion=us-east-1,VPCId=vpc-0123456789abcdef0 --caller-reference $(date +%s)
```

Create an A record alias for `mlflow.kinga.internal` pointing to the ALB DNS name. Update the `MLFLOW_TRACKING_URI` in Airflow DAGs to use this friendly hostname.

---

## Airflow DAG Deployment

Deploy the fraud detection training DAG to Amazon MWAA for automated model training orchestration.

### Step 1: Upload DAG to S3

Amazon MWAA loads DAGs from an S3 bucket. Upload the fraud detection training DAG to your MWAA DAGs bucket.

```bash
aws s3 cp /home/ubuntu/kinga-replit/airflow/dags/fraud_detection_training_dag.py s3://kinga-mwaa-dags-bucket/dags/
```

Replace `kinga-mwaa-dags-bucket` with your actual MWAA DAGs bucket name.

### Step 2: Configure Airflow Variables

Set Airflow variables for the DAG configuration using the MWAA CLI or web UI.

```bash
aws mwaa create-cli-token --name kinga-mwaa-environment --region us-east-1
```

Use the returned web token to access the Airflow web UI. Navigate to Admin > Variables and create the following variables.

| Variable Name | Value | Description |
|---------------|-------|-------------|
| `mlflow_tracking_uri` | `http://mlflow.kinga.internal:5000` | MLflow tracking server endpoint |
| `feature_store_name` | `kinga-fraud-features-v1` | SageMaker Feature Group name |
| `s3_training_bucket` | `kinga-ml-training-data` | S3 bucket for training data |
| `sagemaker_role_arn` | `arn:aws:iam::123456789012:role/SageMakerExecutionRole` | SageMaker execution role |

### Step 3: Configure Airflow Connections

Create AWS connection for SageMaker and S3 access. Navigate to Admin > Connections and create a new connection.

- **Connection ID:** `aws_default`
- **Connection Type:** `Amazon Web Services`
- **Extra:** `{"region_name": "us-east-1", "role_arn": "arn:aws:iam::123456789012:role/AirflowExecutionRole"}`

### Step 4: Test DAG Execution

Trigger the DAG manually to verify it executes successfully. In the Airflow UI, navigate to DAGs, find `fraud_detection_training_pipeline`, and click the play button to trigger a run.

Monitor the DAG execution in the Graph View. Each task should complete successfully in sequence: `retrieve_features` → `prepare_datasets` → `train_model` → `validate_model` → `register_and_promote` → `deploy_to_sagemaker` → `send_success_notification`.

Check MLflow UI to verify the experiment run was logged with parameters, metrics, and model artifacts. Navigate to `http://mlflow.kinga.internal:5000` and find the `fraud-detection-training` experiment.

### Step 5: Enable Scheduled Execution

Once manual testing succeeds, enable the DAG schedule. The DAG is configured to run weekly on Sundays at 2 AM UTC. Toggle the DAG to `ON` in the Airflow UI to enable scheduled execution.

---

## CloudWatch Monitoring Setup

Deploy CloudWatch alarms and dashboards for automated model performance monitoring and retraining triggers.

### Step 1: Deploy Monitoring Infrastructure with Terraform

Navigate to the ML monitoring Terraform module.

```bash
cd /home/ubuntu/kinga-replit/infrastructure/terraform/modules/ml-monitoring
```

Create a `terraform.tfvars` file with your configuration.

```hcl
environment          = "production"
aws_region           = "us-east-1"
ml_team_email        = "ml-team@kinga.com"
airflow_webhook_url  = "https://kinga-mwaa-environment.airflow.us-east-1.amazonaws.com/api/v1/dags/fraud_detection_training_pipeline/dagRuns"
```

Initialize and apply Terraform.

```bash
terraform init
terraform plan
terraform apply
```

Terraform will create SNS topics for retraining notifications, CloudWatch alarms for all five model families (fraud detection, damage detection, cost optimization, physics validation, risk intelligence), data drift alarms, latency alarms, error rate alarms, and a comprehensive CloudWatch dashboard.

### Step 2: Confirm SNS Subscription

After deployment, check the ML team email inbox for SNS subscription confirmation emails. Click the confirmation link in each email to activate the subscription. This ensures alarm notifications are delivered to the team.

### Step 3: Configure Airflow Webhook Authentication

The SNS topic publishes to an Airflow webhook URL to trigger retraining DAGs. Configure Airflow to accept webhook requests from SNS.

In the MWAA environment, create an Airflow variable for SNS authentication.

| Variable Name | Value | Description |
|---------------|-------|-------------|
| `sns_webhook_secret` | `CHANGE_ME_SECURE_SECRET` | Shared secret for SNS webhook authentication |

Update the Airflow DAG to validate the webhook secret in the request headers before executing retraining logic.

### Step 4: Publish Test Metrics

Publish test metrics to CloudWatch to verify alarms trigger correctly.

```bash
aws cloudwatch put-metric-data \
  --namespace KINGA/ML \
  --metric-name fraud-detection_auc_roc \
  --value 0.85 \
  --timestamp $(date -u +%Y-%m-%dT%H:%M:%S)
```

This publishes an AUC-ROC value of 0.85, which is below the threshold of 0.90. Wait 5-10 minutes for the alarm to evaluate and enter `ALARM` state. Check the ML team email for a notification from SNS.

### Step 5: Access CloudWatch Dashboard

Navigate to the CloudWatch dashboard to view model performance metrics. The Terraform output provides the dashboard URL.

```bash
terraform output dashboard_url
```

Open the URL in a browser to access the `kinga-ml-models-performance` dashboard. The dashboard displays fraud detection AUC-ROC and precision, damage detection MAE, cost optimization MAPE and R², model inference latency, and data drift scores with threshold annotations.

---

## Testing and Validation

Perform end-to-end testing to validate the complete MLOps workflow from training to deployment to automated retraining.

### End-to-End Training Workflow Test

Execute the fraud detection training DAG manually and verify all steps complete successfully. Check that features are retrieved from Feature Store, datasets are prepared with correct stratification, XGBoost model trains with logged hyperparameters, validation metrics meet production thresholds, model is registered in MLflow with version number, and model is promoted to Production stage.

### Automated Retraining Test

Simulate performance degradation by publishing a low AUC-ROC metric to CloudWatch. Verify the CloudWatch alarm enters `ALARM` state, SNS notification is sent to ML team email, Airflow webhook is triggered, and fraud detection training DAG executes automatically. Check MLflow to confirm a new model version is registered after retraining completes.

### Model Deployment Test

After a model is promoted to Production in MLflow, verify it is deployed to a SageMaker endpoint. Test the endpoint by sending a sample inference request and validating the response. Monitor CloudWatch for endpoint invocation metrics and latency.

### Rollback Test

Test the ability to rollback to a previous model version. In MLflow UI, transition the current Production model to Archived stage and promote a previous version to Production. Verify the SageMaker endpoint is updated to serve the rolled-back model version.

---

## Operational Procedures

Follow these operational procedures for day-to-day management of the MLOps platform.

### Monitoring Model Performance

Review the CloudWatch dashboard daily to track model performance trends. Pay attention to metrics approaching alarm thresholds. Investigate any sudden drops in AUC-ROC, precision, R², or increases in MAE, MAPE, latency, or error rates. Check the data drift scores weekly to identify feature distribution changes that may require retraining.

### Responding to Retraining Alerts

When a retraining alert is received via email, review the CloudWatch alarm details to understand which metric triggered the alarm. Check the Airflow DAG execution logs to verify retraining started automatically. Monitor the DAG progress and investigate any task failures. Once retraining completes, verify the new model version meets validation criteria and is promoted to Production.

### Manual Model Retraining

To manually trigger model retraining outside the scheduled weekly runs, navigate to the Airflow UI, find the `fraud_detection_training_pipeline` DAG, and click the play button to trigger a manual run. Provide a run configuration if needed to override default parameters such as training date range or hyperparameters.

### Updating Training DAGs

To update the training DAG logic, edit the DAG file locally, test changes in a development environment, and upload the updated DAG to the MWAA S3 bucket. MWAA automatically detects changes and reloads the DAG within 5 minutes. Verify the DAG appears in the Airflow UI with the updated code.

### Scaling MLflow Server

If MLflow server experiences high load, scale the ECS service by increasing the desired task count. Navigate to ECS > Clusters > kinga-mlflow-cluster > Services > kinga-mlflow-service > Update Service. Increase the desired count from 2 to 4 or higher. ECS will launch additional tasks behind the ALB to distribute load.

### Database Maintenance

The RDS PostgreSQL database for MLflow requires periodic maintenance. Automated backups run daily during the configured backup window (3:00-4:00 AM UTC). To restore from a backup, use the AWS RDS console to create a new database instance from a snapshot. Update the ECS task definition environment variable `MLFLOW_BACKEND_STORE_URI` to point to the restored database endpoint.

---

## Troubleshooting

Common issues and their resolutions.

### MLflow Server Not Accessible

**Symptom:** MLflow UI returns connection timeout or 502 Bad Gateway error.

**Diagnosis:** Check ECS service health. Navigate to ECS > Clusters > kinga-mlflow-cluster > Services > kinga-mlflow-service. Verify tasks are in `RUNNING` state. Check task logs in CloudWatch Logs group `/ecs/kinga-mlflow` for errors.

**Resolution:** If tasks are failing health checks, verify the RDS database is accessible from the ECS tasks. Check security group rules allow traffic from ECS security group to RDS security group on port 5432. Verify database credentials in the task definition environment variables are correct.

### Airflow DAG Fails at Feature Retrieval

**Symptom:** `retrieve_features` task fails with `AccessDeniedException` or `FeatureGroupNotFoundException`.

**Diagnosis:** Check Airflow task logs for detailed error messages. Verify the Airflow execution role has permissions to access SageMaker Feature Store and Athena.

**Resolution:** Add the following IAM policy to the Airflow execution role.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "sagemaker:DescribeFeatureGroup",
        "sagemaker:GetRecord",
        "athena:StartQueryExecution",
        "athena:GetQueryExecution",
        "athena:GetQueryResults",
        "s3:GetObject",
        "s3:PutObject",
        "glue:GetTable",
        "glue:GetDatabase"
      ],
      "Resource": "*"
    }
  ]
}
```

### CloudWatch Alarm Not Triggering

**Symptom:** Model performance degrades but CloudWatch alarm does not enter `ALARM` state.

**Diagnosis:** Check if metrics are being published to CloudWatch. Navigate to CloudWatch > Metrics > KINGA/ML namespace. Verify the metric name matches the alarm configuration exactly (case-sensitive).

**Resolution:** Ensure production code publishes metrics to CloudWatch using the correct namespace, metric name, and dimensions. Example Python code to publish metrics.

```python
import boto3
from datetime import datetime

cloudwatch = boto3.client('cloudwatch')

cloudwatch.put_metric_data(
    Namespace='KINGA/ML',
    MetricData=[
        {
            'MetricName': 'fraud-detection_auc_roc',
            'Value': 0.92,
            'Timestamp': datetime.utcnow(),
            'Unit': 'None'
        }
    ]
)
```

### Model Validation Fails

**Symptom:** `validate_model` task fails with "Model failed validation criteria" error.

**Diagnosis:** Check the task logs for test set performance metrics. Compare test AUC-ROC and precision @ 90% recall against the defined thresholds (0.90 and 0.80 respectively).

**Resolution:** If the model genuinely underperforms, investigate potential causes such as insufficient training data, data quality issues, feature drift, or hyperparameter tuning required. Review the MLflow experiment logs to compare with previous successful runs. If validation thresholds are too strict for current data conditions, adjust the thresholds in the DAG configuration after consulting with the ML team.

### SNS Webhook Not Triggering Airflow DAG

**Symptom:** CloudWatch alarm triggers and SNS notification is sent, but Airflow DAG does not execute.

**Diagnosis:** Check SNS topic delivery logs to verify the webhook request was sent. Check Airflow web server logs for incoming webhook requests.

**Resolution:** Verify the Airflow webhook URL in the SNS subscription is correct and accessible from the internet or VPC depending on MWAA configuration. Ensure the Airflow API is enabled in MWAA environment settings. Configure authentication for the webhook endpoint using Airflow variables or secrets.

---

## Conclusion

This deployment guide provides comprehensive instructions for deploying and operating the KINGA MLOps infrastructure. Following these procedures ensures reliable experiment tracking, automated model training, and intelligent retraining based on performance monitoring. For additional support, contact the KINGA ML team at ml-team@kinga.com.

---

**Document Version History**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-02-11 | Tavonga Shoko | Initial deployment guide |
