# KINGA ML Training Pipelines & MLOps Architecture

**Author:** Tavonga Shoko  
**Version:** 1.0.0  
**Date:** February 11, 2026

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [MLOps Architecture](#mlops-architecture)
3. [Model Families](#model-families)
4. [Training Pipeline Framework](#training-pipeline-framework)
5. [Model Registry & Versioning](#model-registry--versioning)
6. [Automated Retraining](#automated-retraining)
7. [Model Deployment](#model-deployment)
8. [Monitoring & Observability](#monitoring--observability)

---

## Executive Summary

This document outlines the comprehensive MLOps architecture for training, validating, and deploying five model families in the KINGA insurance claims processing platform. The architecture implements automated training workflows, model validation, performance tracking, version control, and intelligent retraining triggers to ensure models remain accurate and performant in production.

**Model Families:**

1. **Damage Detection Models** - Computer vision models for vehicle damage assessment
2. **Fraud Detection Models** - Graph-based and behavioral models for fraud identification
3. **Physics Validation Models** - Physics simulation models for damage consistency validation
4. **Cost Optimization Models** - Regression models for repair cost prediction
5. **Risk Intelligence Models** - Fleet risk scoring and driver profiling models

**Key Components:**

- **Training Framework**: SageMaker Training Jobs with distributed training support
- **Model Registry**: MLflow for experiment tracking and model versioning
- **Validation**: Automated holdout validation, A/B testing, shadow deployment
- **Retraining Triggers**: Data drift detection, performance degradation alerts
- **Deployment**: SageMaker endpoints with auto-scaling and blue/green deployment
- **Monitoring**: CloudWatch metrics, model performance dashboards, drift detection

---

## MLOps Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      KINGA MLOps Platform                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐     │
│  │ Feature Store│───▶│   Training   │───▶│    Model     │     │
│  │  (SageMaker) │    │   Pipeline   │    │   Registry   │     │
│  └──────────────┘    └──────────────┘    │  (MLflow)    │     │
│                             │             └──────────────┘     │
│                             ▼                     │             │
│                      ┌──────────────┐            ▼             │
│                      │  Validation  │    ┌──────────────┐     │
│                      │   & Testing  │───▶│ Deployment   │     │
│                      └──────────────┘    │  (SageMaker) │     │
│                             │             └──────────────┘     │
│                             ▼                     │             │
│                      ┌──────────────┐            ▼             │
│                      │  Retraining  │    ┌──────────────┐     │
│                      │   Triggers   │───▶│  Monitoring  │     │
│                      └──────────────┘    │ (CloudWatch) │     │
│                                           └──────────────┘     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Technology Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Training | Amazon SageMaker Training | Distributed model training |
| Orchestration | Apache Airflow (MWAA) | Pipeline scheduling |
| Experiment Tracking | MLflow | Experiment logging, model registry |
| Feature Store | SageMaker Feature Store | Feature serving |
| Model Registry | MLflow + S3 | Model versioning and storage |
| Deployment | SageMaker Endpoints | Real-time inference |
| Batch Inference | SageMaker Batch Transform | Batch predictions |
| Monitoring | CloudWatch + MLflow | Performance tracking |
| Drift Detection | Evidently | Data and model drift |

---

## Model Families

### 1. Damage Detection Models

**Purpose:** Assess vehicle damage from photos using computer vision

**Model Architecture:**
- Base: ResNet50 (pretrained on ImageNet)
- Custom head: 3-layer fully connected network
- Output: Damage severity score (0-100), damaged components list

**Training Data:**
- Input: Damage photos (224×224 RGB)
- Labels: Severity scores, component tags
- Dataset size: 500K labeled images
- Train/val/test split: 70/15/15

**Hyperparameters:**
- Learning rate: 0.001 (with cosine annealing)
- Batch size: 64
- Epochs: 50
- Optimizer: Adam
- Loss: Combined MSE (severity) + BCE (components)

**Performance Metrics:**
- Severity MAE < 5 points
- Component classification F1 > 0.90
- Inference latency < 200ms

**Retraining Triggers:**
- MAE increases by > 10%
- New damage patterns detected
- Monthly scheduled retraining

### 2. Fraud Detection Models

**Purpose:** Identify fraudulent claims using behavioral and network features

**Model Architecture:**
- Primary: XGBoost Classifier
- Secondary: Graph Neural Network (for fraud rings)
- Ensemble: Weighted average of both models

**Training Data:**
- Input: 45 engineered features
- Labels: Fraud flag (binary)
- Dataset size: 1M claims
- Class balance: 5% fraud (use SMOTE for balancing)

**Hyperparameters:**
- XGBoost max_depth: 10
- XGBoost learning_rate: 0.1
- XGBoost n_estimators: 500
- GNN hidden_dim: 128
- GNN num_layers: 3

**Performance Metrics:**
- AUC-ROC > 0.92
- Precision @ 90% recall > 0.85
- False positive rate < 2%

**Retraining Triggers:**
- AUC-ROC drops below 0.90
- New fraud patterns detected
- Weekly scheduled retraining

### 3. Physics Validation Models

**Purpose:** Validate damage patterns using physics simulation

**Model Architecture:**
- Physics engine: PyBullet
- ML component: Neural network for parameter estimation
- Output: Consistency score (0-1)

**Training Data:**
- Input: Collision parameters (speed, angle, vehicle specs)
- Labels: Simulated damage patterns
- Dataset size: 100K simulated collisions

**Hyperparameters:**
- Network: 5-layer MLP
- Hidden units: [256, 128, 64, 32, 16]
- Activation: ReLU
- Dropout: 0.3

**Performance Metrics:**
- Consistency score accuracy > 85%
- False negative rate < 5%
- Simulation time < 5 seconds

**Retraining Triggers:**
- Accuracy drops below 80%
- New vehicle models added
- Quarterly scheduled retraining

### 4. Cost Optimization Models

**Purpose:** Predict optimal repair costs and identify savings opportunities

**Model Architecture:**
- Primary: Gradient Boosting Regressor (LightGBM)
- Secondary: Neural network for complex interactions
- Ensemble: Stacked generalization

**Training Data:**
- Input: 32 cost features
- Labels: Final settlement amount
- Dataset size: 750K settled claims

**Hyperparameters:**
- LightGBM num_leaves: 31
- LightGBM learning_rate: 0.05
- LightGBM n_estimators: 1000
- NN architecture: [128, 64, 32, 1]

**Performance Metrics:**
- R² > 0.85
- MAPE < 15%
- Prediction interval coverage > 90%

**Retraining Triggers:**
- MAPE increases by > 20%
- Market rate changes detected
- Monthly scheduled retraining

### 5. Risk Intelligence Models

**Purpose:** Score fleet risk and profile driver behavior

**Model Architecture:**
- Fleet risk: Random Forest Classifier
- Driver profiling: LSTM for time-series analysis
- Risk scoring: Ensemble of both models

**Training Data:**
- Input: Telematics data, historical claims
- Labels: Risk categories (low/medium/high)
- Dataset size: 200K fleet profiles

**Hyperparameters:**
- RF n_estimators: 300
- RF max_depth: 15
- LSTM hidden_size: 64
- LSTM num_layers: 2

**Performance Metrics:**
- Risk classification accuracy > 80%
- Driver profiling AUC > 0.88
- Prediction stability > 85%

**Retraining Triggers:**
- Accuracy drops below 75%
- New telematics patterns detected
- Bi-weekly scheduled retraining

---

## Training Pipeline Framework

### Generic Training Pipeline

```python
# services/ml-training/training_pipeline.py
from abc import ABC, abstractmethod
import mlflow
import sagemaker
from sagemaker.estimator import Estimator

class BaseTrainingPipeline(ABC):
    """
    Abstract base class for all KINGA training pipelines.
    Provides common functionality for training, validation, and registration.
    """
    
    def __init__(self, model_name: str, version: str):
        self.model_name = model_name
        self.version = version
        self.mlflow_tracking_uri = 'http://mlflow.kinga.internal:5000'
        self.sagemaker_session = sagemaker.Session()
        
    @abstractmethod
    def prepare_data(self):
        """Load and prepare training data from Feature Store"""
        pass
    
    @abstractmethod
    def build_model(self):
        """Define model architecture"""
        pass
    
    @abstractmethod
    def train(self):
        """Execute training loop"""
        pass
    
    @abstractmethod
    def validate(self):
        """Validate model performance"""
        pass
    
    def register_model(self, metrics: dict):
        """Register model in MLflow registry"""
        mlflow.set_tracking_uri(self.mlflow_tracking_uri)
        
        with mlflow.start_run(run_name=f'{self.model_name}-{self.version}'):
            # Log parameters
            mlflow.log_params(self.hyperparameters)
            
            # Log metrics
            mlflow.log_metrics(metrics)
            
            # Log model
            mlflow.sklearn.log_model(
                self.model,
                self.model_name,
                registered_model_name=self.model_name
            )
            
            # Tag with version
            mlflow.set_tag('version', self.version)
            mlflow.set_tag('model_family', self.model_family)
            
        return mlflow.active_run().info.run_id
    
    def run_pipeline(self):
        """Execute complete training pipeline"""
        print(f"Starting training pipeline for {self.model_name} v{self.version}")
        
        # Step 1: Prepare data
        print("Step 1: Preparing data...")
        X_train, y_train, X_val, y_val, X_test, y_test = self.prepare_data()
        
        # Step 2: Build model
        print("Step 2: Building model...")
        self.build_model()
        
        # Step 3: Train
        print("Step 3: Training model...")
        self.train(X_train, y_train, X_val, y_val)
        
        # Step 4: Validate
        print("Step 4: Validating model...")
        metrics = self.validate(X_test, y_test)
        
        # Step 5: Register
        print("Step 5: Registering model...")
        run_id = self.register_model(metrics)
        
        print(f"Training pipeline completed. MLflow run ID: {run_id}")
        return run_id, metrics
```

### Fraud Detection Training Pipeline

```python
# services/ml-training/fraud_detection_pipeline.py
from training_pipeline import BaseTrainingPipeline
import xgboost as xgb
from sklearn.metrics import roc_auc_score, precision_recall_curve
import mlflow.xgboost

class FraudDetectionPipeline(BaseTrainingPipeline):
    def __init__(self, version: str):
        super().__init__(model_name='fraud-detection', version=version)
        self.model_family = 'fraud_detection'
        self.hyperparameters = {
            'max_depth': 10,
            'learning_rate': 0.1,
            'n_estimators': 500,
            'objective': 'binary:logistic',
            'eval_metric': 'auc',
            'scale_pos_weight': 19  # 5% fraud rate
        }
    
    def prepare_data(self):
        # Retrieve features from SageMaker Feature Store
        from sagemaker.feature_store.feature_store import FeatureStore
        
        feature_store = FeatureStore(self.sagemaker_session)
        
        # Query fraud features
        query = f"""
        SELECT *
        FROM "kinga-fraud-features-v1"
        WHERE event_time >= '2025-01-01'
          AND event_time < '2026-02-01'
        """
        
        df = feature_store.query(query).as_dataframe()
        
        # Split features and labels
        X = df.drop(['claim_id', 'is_fraudulent', 'event_time'], axis=1)
        y = df['is_fraudulent']
        
        # Train/val/test split
        from sklearn.model_selection import train_test_split
        
        X_train, X_temp, y_train, y_temp = train_test_split(
            X, y, test_size=0.3, stratify=y, random_state=42
        )
        X_val, X_test, y_val, y_test = train_test_split(
            X_temp, y_temp, test_size=0.5, stratify=y_temp, random_state=42
        )
        
        return X_train, y_train, X_val, y_val, X_test, y_test
    
    def build_model(self):
        self.model = xgb.XGBClassifier(**self.hyperparameters)
    
    def train(self, X_train, y_train, X_val, y_val):
        self.model.fit(
            X_train, y_train,
            eval_set=[(X_val, y_val)],
            early_stopping_rounds=50,
            verbose=True
        )
    
    def validate(self, X_test, y_test):
        # Predictions
        y_pred_proba = self.model.predict_proba(X_test)[:, 1]
        
        # Metrics
        auc_roc = roc_auc_score(y_test, y_pred_proba)
        
        # Precision at 90% recall
        precision, recall, thresholds = precision_recall_curve(y_test, y_pred_proba)
        idx = np.argmin(np.abs(recall - 0.9))
        precision_at_90_recall = precision[idx]
        
        metrics = {
            'auc_roc': auc_roc,
            'precision_at_90_recall': precision_at_90_recall,
            'test_samples': len(y_test),
            'fraud_rate': y_test.mean()
        }
        
        # Validation checks
        assert auc_roc > 0.90, f"AUC-ROC {auc_roc} below threshold 0.90"
        assert precision_at_90_recall > 0.80, f"Precision {precision_at_90_recall} below threshold 0.80"
        
        return metrics
```

### Damage Detection Training Pipeline

```python
# services/ml-training/damage_detection_pipeline.py
from training_pipeline import BaseTrainingPipeline
import torch
import torch.nn as nn
from torchvision import models, transforms
import mlflow.pytorch

class DamageDetectionPipeline(BaseTrainingPipeline):
    def __init__(self, version: str):
        super().__init__(model_name='damage-detection', version=version)
        self.model_family = 'damage_detection'
        self.hyperparameters = {
            'learning_rate': 0.001,
            'batch_size': 64,
            'epochs': 50,
            'optimizer': 'Adam',
            'scheduler': 'CosineAnnealingLR'
        }
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    
    def prepare_data(self):
        # Load damage images from S3
        from torch.utils.data import DataLoader, Dataset
        
        transform = transforms.Compose([
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
        ])
        
        # Custom dataset class
        train_dataset = DamageImageDataset(
            s3_path='s3://kinga-ml-data-lake/curated/damage_images/train/',
            transform=transform
        )
        val_dataset = DamageImageDataset(
            s3_path='s3://kinga-ml-data-lake/curated/damage_images/val/',
            transform=transform
        )
        test_dataset = DamageImageDataset(
            s3_path='s3://kinga-ml-data-lake/curated/damage_images/test/',
            transform=transform
        )
        
        train_loader = DataLoader(train_dataset, batch_size=64, shuffle=True)
        val_loader = DataLoader(val_dataset, batch_size=64, shuffle=False)
        test_loader = DataLoader(test_dataset, batch_size=64, shuffle=False)
        
        return train_loader, val_loader, test_loader
    
    def build_model(self):
        # ResNet50 with custom head
        base_model = models.resnet50(pretrained=True)
        
        # Freeze early layers
        for param in list(base_model.parameters())[:-20]:
            param.requires_grad = False
        
        # Custom head
        num_features = base_model.fc.in_features
        base_model.fc = nn.Sequential(
            nn.Linear(num_features, 512),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(512, 256),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(256, 1)  # Severity score
        )
        
        self.model = base_model.to(self.device)
    
    def train(self, train_loader, val_loader):
        criterion = nn.MSELoss()
        optimizer = torch.optim.Adam(self.model.parameters(), lr=0.001)
        scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=50)
        
        best_val_loss = float('inf')
        
        for epoch in range(50):
            # Training
            self.model.train()
            train_loss = 0.0
            
            for images, labels in train_loader:
                images, labels = images.to(self.device), labels.to(self.device)
                
                optimizer.zero_grad()
                outputs = self.model(images)
                loss = criterion(outputs.squeeze(), labels)
                loss.backward()
                optimizer.step()
                
                train_loss += loss.item()
            
            # Validation
            self.model.eval()
            val_loss = 0.0
            
            with torch.no_grad():
                for images, labels in val_loader:
                    images, labels = images.to(self.device), labels.to(self.device)
                    outputs = self.model(images)
                    loss = criterion(outputs.squeeze(), labels)
                    val_loss += loss.item()
            
            train_loss /= len(train_loader)
            val_loss /= len(val_loader)
            
            # Log to MLflow
            mlflow.log_metrics({
                'train_loss': train_loss,
                'val_loss': val_loss
            }, step=epoch)
            
            # Save best model
            if val_loss < best_val_loss:
                best_val_loss = val_loss
                torch.save(self.model.state_dict(), 'best_model.pth')
            
            scheduler.step()
        
        # Load best model
        self.model.load_state_dict(torch.load('best_model.pth'))
    
    def validate(self, test_loader):
        self.model.eval()
        predictions = []
        actuals = []
        
        with torch.no_grad():
            for images, labels in test_loader:
                images = images.to(self.device)
                outputs = self.model(images)
                predictions.extend(outputs.cpu().numpy())
                actuals.extend(labels.numpy())
        
        # Calculate MAE
        mae = np.mean(np.abs(np.array(predictions) - np.array(actuals)))
        
        metrics = {
            'test_mae': mae,
            'test_samples': len(actuals)
        }
        
        assert mae < 5.0, f"MAE {mae} above threshold 5.0"
        
        return metrics
```

---

## Model Registry & Versioning

### MLflow Model Registry

```python
# services/ml-training/model_registry.py
import mlflow
from mlflow.tracking import MlflowClient

class ModelRegistry:
    def __init__(self):
        self.client = MlflowClient()
        self.tracking_uri = 'http://mlflow.kinga.internal:5000'
        mlflow.set_tracking_uri(self.tracking_uri)
    
    def register_model(self, run_id: str, model_name: str):
        """Register a model from an MLflow run"""
        model_uri = f"runs:/{run_id}/{model_name}"
        
        result = mlflow.register_model(
            model_uri=model_uri,
            name=model_name
        )
        
        return result.version
    
    def promote_to_production(self, model_name: str, version: str):
        """Promote a model version to production"""
        self.client.transition_model_version_stage(
            name=model_name,
            version=version,
            stage="Production",
            archive_existing_versions=True
        )
    
    def get_production_model(self, model_name: str):
        """Get the current production model"""
        versions = self.client.get_latest_versions(
            name=model_name,
            stages=["Production"]
        )
        
        if not versions:
            raise ValueError(f"No production version found for {model_name}")
        
        return versions[0]
    
    def compare_models(self, model_name: str, version1: str, version2: str):
        """Compare metrics between two model versions"""
        v1_metrics = self.client.get_run(
            self.client.get_model_version(model_name, version1).run_id
        ).data.metrics
        
        v2_metrics = self.client.get_run(
            self.client.get_model_version(model_name, version2).run_id
        ).data.metrics
        
        comparison = {}
        for metric in v1_metrics:
            if metric in v2_metrics:
                comparison[metric] = {
                    'version1': v1_metrics[metric],
                    'version2': v2_metrics[metric],
                    'improvement': v2_metrics[metric] - v1_metrics[metric]
                }
        
        return comparison
```

---

## Automated Retraining

### Retraining Trigger Logic

```python
# services/ml-monitoring/retraining_triggers.py
from dataclasses import dataclass
from datetime import datetime, timedelta
import boto3

@dataclass
class RetrainingTrigger:
    model_name: str
    trigger_type: str  # 'performance', 'drift', 'scheduled'
    threshold: float
    current_value: float
    triggered_at: datetime

class RetrainingManager:
    def __init__(self):
        self.cloudwatch = boto3.client('cloudwatch')
        self.sns = boto3.client('sns')
        self.airflow_api = 'http://airflow.kinga.internal:8080/api/v1'
    
    def check_performance_degradation(self, model_name: str, metric_name: str, threshold: float):
        """Check if model performance has degraded"""
        # Get metric from CloudWatch
        response = self.cloudwatch.get_metric_statistics(
            Namespace='KINGA/ML',
            MetricName=f'{model_name}_{metric_name}',
            StartTime=datetime.utcnow() - timedelta(days=7),
            EndTime=datetime.utcnow(),
            Period=86400,  # 1 day
            Statistics=['Average']
        )
        
        if not response['Datapoints']:
            return False
        
        current_value = response['Datapoints'][-1]['Average']
        
        # Check threshold
        if metric_name in ['auc_roc', 'accuracy', 'r2']:
            # Higher is better
            triggered = current_value < threshold
        else:
            # Lower is better (MAE, MAPE)
            triggered = current_value > threshold
        
        if triggered:
            return RetrainingTrigger(
                model_name=model_name,
                trigger_type='performance',
                threshold=threshold,
                current_value=current_value,
                triggered_at=datetime.utcnow()
            )
        
        return None
    
    def check_data_drift(self, model_name: str, drift_threshold: float = 0.1):
        """Check for data drift in features"""
        from evidently.dashboard import Dashboard
        from evidently.tabs import DataDriftTab
        
        # Load reference and current data
        reference_df = load_reference_data(model_name)
        current_df = load_current_data(model_name)
        
        # Calculate drift
        dashboard = Dashboard(tabs=[DataDriftTab()])
        dashboard.calculate(reference_df, current_df)
        
        drift_report = dashboard.json()
        
        if drift_report['data_drift']['data_drift_detected']:
            drift_score = drift_report['data_drift']['dataset_drift_score']
            
            if drift_score > drift_threshold:
                return RetrainingTrigger(
                    model_name=model_name,
                    trigger_type='drift',
                    threshold=drift_threshold,
                    current_value=drift_score,
                    triggered_at=datetime.utcnow()
                )
        
        return None
    
    def trigger_retraining(self, trigger: RetrainingTrigger):
        """Trigger retraining pipeline"""
        # Send SNS notification
        self.sns.publish(
            TopicArn='arn:aws:sns:us-east-1:123456789012:kinga-ml-retraining',
            Subject=f'Retraining triggered for {trigger.model_name}',
            Message=f"""
            Model: {trigger.model_name}
            Trigger Type: {trigger.trigger_type}
            Threshold: {trigger.threshold}
            Current Value: {trigger.current_value}
            Triggered At: {trigger.triggered_at}
            """
        )
        
        # Trigger Airflow DAG
        import requests
        
        dag_id = f'{trigger.model_name}_training_pipeline'
        
        response = requests.post(
            f'{self.airflow_api}/dags/{dag_id}/dagRuns',
            json={
                'conf': {
                    'trigger_type': trigger.trigger_type,
                    'trigger_value': trigger.current_value
                }
            },
            auth=('airflow', 'airflow')
        )
        
        return response.json()
```

---

## Model Deployment

### SageMaker Endpoint Deployment

```python
# services/ml-deployment/sagemaker_deployer.py
import sagemaker
from sagemaker.model import Model
from sagemaker.predictor import Predictor

class SageMakerDeployer:
    def __init__(self):
        self.sagemaker_session = sagemaker.Session()
        self.role = 'arn:aws:iam::123456789012:role/SageMakerExecutionRole'
    
    def deploy_model(self, model_name: str, model_version: str, instance_type: str = 'ml.m5.xlarge'):
        """Deploy model to SageMaker endpoint"""
        # Get model artifact from MLflow
        model_uri = f's3://kinga-ml-models/{model_name}/{model_version}/model.tar.gz'
        
        # Create SageMaker model
        model = Model(
            model_data=model_uri,
            role=self.role,
            framework_version='1.0',
            sagemaker_session=self.sagemaker_session
        )
        
        # Deploy with auto-scaling
        predictor = model.deploy(
            initial_instance_count=2,
            instance_type=instance_type,
            endpoint_name=f'{model_name}-{model_version}',
            wait=True
        )
        
        # Configure auto-scaling
        self.configure_autoscaling(
            endpoint_name=f'{model_name}-{model_version}',
            min_capacity=2,
            max_capacity=10
        )
        
        return predictor
    
    def configure_autoscaling(self, endpoint_name: str, min_capacity: int, max_capacity: int):
        """Configure auto-scaling for endpoint"""
        autoscaling = boto3.client('application-autoscaling')
        
        # Register scalable target
        autoscaling.register_scalable_target(
            ServiceNamespace='sagemaker',
            ResourceId=f'endpoint/{endpoint_name}/variant/AllTraffic',
            ScalableDimension='sagemaker:variant:DesiredInstanceCount',
            MinCapacity=min_capacity,
            MaxCapacity=max_capacity
        )
        
        # Define scaling policy
        autoscaling.put_scaling_policy(
            PolicyName=f'{endpoint_name}-scaling-policy',
            ServiceNamespace='sagemaker',
            ResourceId=f'endpoint/{endpoint_name}/variant/AllTraffic',
            ScalableDimension='sagemaker:variant:DesiredInstanceCount',
            PolicyType='TargetTrackingScaling',
            TargetTrackingScalingPolicyConfiguration={
                'TargetValue': 70.0,  # Target 70% CPU utilization
                'PredefinedMetricSpecification': {
                    'PredefinedMetricType': 'SageMakerVariantInvocationsPerInstance'
                },
                'ScaleInCooldown': 300,
                'ScaleOutCooldown': 60
            }
        )
    
    def blue_green_deployment(self, model_name: str, new_version: str):
        """Perform blue/green deployment"""
        endpoint_name = f'{model_name}-production'
        
        # Deploy new version to staging endpoint
        staging_predictor = self.deploy_model(
            model_name=model_name,
            model_version=new_version,
            instance_type='ml.m5.xlarge'
        )
        
        # Run validation tests
        validation_passed = self.validate_endpoint(staging_predictor)
        
        if not validation_passed:
            staging_predictor.delete_endpoint()
            raise ValueError("Validation failed for new model version")
        
        # Update production endpoint
        sagemaker_client = boto3.client('sagemaker')
        
        sagemaker_client.update_endpoint(
            EndpointName=endpoint_name,
            EndpointConfigName=f'{model_name}-{new_version}-config'
        )
        
        return endpoint_name
```

---

## Monitoring & Observability

### Model Performance Monitoring

```python
# services/ml-monitoring/performance_monitor.py
import boto3
from datetime import datetime

class PerformanceMonitor:
    def __init__(self):
        self.cloudwatch = boto3.client('cloudwatch')
    
    def log_prediction_metrics(self, model_name: str, metrics: dict):
        """Log prediction metrics to CloudWatch"""
        metric_data = []
        
        for metric_name, value in metrics.items():
            metric_data.append({
                'MetricName': f'{model_name}_{metric_name}',
                'Value': value,
                'Timestamp': datetime.utcnow(),
                'Unit': 'None'
            })
        
        self.cloudwatch.put_metric_data(
            Namespace='KINGA/ML',
            MetricData=metric_data
        )
    
    def create_dashboard(self, model_name: str):
        """Create CloudWatch dashboard for model"""
        dashboard_body = {
            'widgets': [
                {
                    'type': 'metric',
                    'properties': {
                        'metrics': [
                            ['KINGA/ML', f'{model_name}_auc_roc'],
                            ['KINGA/ML', f'{model_name}_precision'],
                            ['KINGA/ML', f'{model_name}_recall']
                        ],
                        'period': 300,
                        'stat': 'Average',
                        'region': 'us-east-1',
                        'title': f'{model_name} Performance Metrics'
                    }
                },
                {
                    'type': 'metric',
                    'properties': {
                        'metrics': [
                            ['AWS/SageMaker', 'ModelLatency', {'stat': 'Average'}],
                            ['AWS/SageMaker', 'ModelInvocations', {'stat': 'Sum'}]
                        ],
                        'period': 300,
                        'region': 'us-east-1',
                        'title': f'{model_name} Latency & Invocations'
                    }
                }
            ]
        }
        
        self.cloudwatch.put_dashboard(
            DashboardName=f'{model_name}-performance',
            DashboardBody=json.dumps(dashboard_body)
        )
```

---

**Document Version:** 1.0.0  
**Last Updated:** February 11, 2026  
**Author:** Tavonga Shoko
