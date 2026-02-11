# KINGA ML Data Architecture & Feature Engineering

**Author:** Tavonga Shoko  
**Version:** 1.0.0  
**Date:** February 11, 2026

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [ML Data Architecture](#ml-data-architecture)
3. [Event-Driven Data Ingestion](#event-driven-data-ingestion)
4. [S3 Data Lake Structure](#s3-data-lake-structure)
5. [Feature Engineering Pipelines](#feature-engineering-pipelines)
6. [Feature Store Integration](#feature-store-integration)
7. [Dataset Versioning & Lineage](#dataset-versioning--lineage)
8. [ML Pipeline Monitoring](#ml-pipeline-monitoring)

---

## Executive Summary

This document outlines the comprehensive ML data architecture for KINGA's insurance claims processing platform. The architecture implements event-driven data ingestion, a three-tier S3 data lake (raw, processed, curated), automated feature engineering pipelines, and integration with AWS SageMaker Feature Store for real-time and batch ML inference. The system supports three primary ML use cases: fraud detection, damage assessment accuracy, and cost prediction.

**Key Components:**

- **Event-Driven Ingestion**: Kafka consumers extract claims lifecycle events into S3
- **Data Lake**: Three-tier medallion architecture (bronze/silver/gold)
- **Feature Engineering**: Automated pipelines for fraud, damage, and cost features
- **Feature Store**: AWS SageMaker Feature Store with online/offline stores
- **Versioning**: DVC for dataset versioning, MLflow for experiment tracking
- **Monitoring**: Data quality checks, drift detection, pipeline observability

**ML Use Cases:**

1. **Fraud Detection**: Graph-based features, behavioral patterns, anomaly scores
2. **Damage Assessment**: Image embeddings, repair history, vehicle metadata
3. **Cost Prediction**: Market rates, labor costs, parts pricing, historical trends

---

## ML Data Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      KINGA ML Data Platform                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐     │
│  │ Kafka Events │───▶│ Data Ingest  │───▶│  S3 Raw Data │     │
│  │  (Claims)    │    │  Consumers   │    │   (Bronze)   │     │
│  └──────────────┘    └──────────────┘    └──────────────┘     │
│                             │                     │             │
│                             ▼                     ▼             │
│                      ┌──────────────┐    ┌──────────────┐     │
│                      │   Feature    │───▶│ S3 Processed │     │
│                      │ Engineering  │    │   (Silver)   │     │
│                      └──────────────┘    └──────────────┘     │
│                             │                     │             │
│                             ▼                     ▼             │
│                      ┌──────────────┐    ┌──────────────┐     │
│                      │   Feature    │───▶│ S3 Curated   │     │
│                      │    Store     │    │   (Gold)     │     │
│                      └──────────────┘    └──────────────┘     │
│                             │                                   │
│                             ▼                                   │
│                      ┌──────────────┐                          │
│                      │  ML Models   │                          │
│                      │  (Training)  │                          │
│                      └──────────────┘                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Event Capture**: Claims lifecycle events published to Kafka topics
2. **Raw Ingestion**: Kafka consumers write events to S3 bronze layer (Parquet)
3. **Data Cleaning**: Spark jobs clean and validate data → silver layer
4. **Feature Engineering**: Transform raw data into ML features → gold layer
5. **Feature Store**: Ingest features into SageMaker Feature Store
6. **ML Training**: Models consume features from feature store
7. **Inference**: Real-time predictions use online feature store

---

## Event-Driven Data Ingestion

### Kafka Topics Consumed

| Topic | Event Type | ML Use Case | Ingestion Frequency |
|-------|------------|-------------|---------------------|
| `kinga.claims.submitted` | Claim submission | Fraud detection, cost prediction | Real-time |
| `kinga.assessments.completed` | AI damage assessment | Damage accuracy, cost prediction | Real-time |
| `kinga.fraud.detected` | Fraud alert | Fraud model training | Real-time |
| `kinga.quotes.submitted` | Panel beater quote | Cost prediction | Real-time |
| `kinga.workflows.updated` | Approval workflow | Process optimization | Batch (hourly) |
| `kinga.claims.settled` | Claim settlement | All use cases | Batch (daily) |

### Event Consumer Architecture

**Technology Stack:**
- **Language**: Python 3.11
- **Kafka Client**: confluent-kafka-python
- **Data Format**: Apache Parquet (columnar storage)
- **Orchestration**: Apache Airflow
- **Compute**: AWS Lambda (real-time) + AWS Glue (batch)

**Consumer Pattern:**

```python
# services/ml-data-ingestion/kafka_consumer.py
from confluent_kafka import Consumer, KafkaError
import pyarrow as pa
import pyarrow.parquet as pq
import boto3
from datetime import datetime

class ClaimsEventConsumer:
    def __init__(self, topic: str, s3_bucket: str):
        self.topic = topic
        self.s3_bucket = s3_bucket
        self.consumer = Consumer({
            'bootstrap.servers': os.getenv('KAFKA_BROKERS'),
            'group.id': f'ml-ingestion-{topic}',
            'auto.offset.reset': 'earliest',
            'enable.auto.commit': False
        })
        self.s3_client = boto3.client('s3')
        self.buffer = []
        self.buffer_size = 1000  # Batch size
    
    def consume_and_store(self):
        self.consumer.subscribe([self.topic])
        
        while True:
            msg = self.consumer.poll(1.0)
            
            if msg is None:
                continue
            if msg.error():
                if msg.error().code() == KafkaError._PARTITION_EOF:
                    continue
                else:
                    print(f"Consumer error: {msg.error()}")
                    break
            
            # Parse event
            event = json.loads(msg.value().decode('utf-8'))
            self.buffer.append(event)
            
            # Flush buffer when full
            if len(self.buffer) >= self.buffer_size:
                self.flush_to_s3()
                self.consumer.commit()
    
    def flush_to_s3(self):
        if not self.buffer:
            return
        
        # Convert to PyArrow Table
        table = pa.Table.from_pylist(self.buffer)
        
        # Partition by date
        date_str = datetime.utcnow().strftime('%Y-%m-%d')
        hour_str = datetime.utcnow().strftime('%H')
        
        # S3 path: s3://bucket/raw/topic/year=2026/month=02/day=11/hour=13/batch.parquet
        s3_key = f"raw/{self.topic}/year={date_str[:4]}/month={date_str[5:7]}/day={date_str[8:10]}/hour={hour_str}/{uuid.uuid4()}.parquet"
        
        # Write Parquet to S3
        buffer = io.BytesIO()
        pq.write_table(table, buffer, compression='snappy')
        buffer.seek(0)
        
        self.s3_client.put_object(
            Bucket=self.s3_bucket,
            Key=s3_key,
            Body=buffer.getvalue()
        )
        
        print(f"Flushed {len(self.buffer)} events to s3://{self.s3_bucket}/{s3_key}")
        self.buffer = []
```

---

## S3 Data Lake Structure

### Medallion Architecture (Bronze → Silver → Gold)

```
s3://kinga-ml-data-lake/
├── raw/                          # Bronze Layer (Raw Events)
│   ├── kinga.claims.submitted/
│   │   └── year=2026/month=02/day=11/hour=13/*.parquet
│   ├── kinga.assessments.completed/
│   ├── kinga.fraud.detected/
│   └── kinga.quotes.submitted/
│
├── processed/                    # Silver Layer (Cleaned Data)
│   ├── claims/
│   │   └── year=2026/month=02/day=11/*.parquet
│   ├── assessments/
│   ├── fraud_alerts/
│   └── quotes/
│
├── curated/                      # Gold Layer (Feature Sets)
│   ├── fraud_features/
│   │   └── version=v1.2.0/year=2026/month=02/*.parquet
│   ├── damage_features/
│   │   └── version=v1.0.0/year=2026/month=02/*.parquet
│   └── cost_features/
│       └── version=v2.1.0/year=2026/month=02/*.parquet
│
├── models/                       # Trained Models
│   ├── fraud_detection/
│   │   └── version=v3.0.0/model.pkl
│   ├── damage_assessment/
│   └── cost_prediction/
│
└── metadata/                     # Dataset Metadata
    ├── schemas/
    ├── lineage/
    └── quality_reports/
```

### Data Retention Policies

| Layer | Retention Period | Lifecycle Policy |
|-------|------------------|------------------|
| Bronze (Raw) | 90 days | Move to Glacier after 30 days |
| Silver (Processed) | 1 year | Move to Glacier after 90 days |
| Gold (Features) | 2 years | Move to Glacier after 180 days |
| Models | Indefinite | Archive old versions after 1 year |

---

## Feature Engineering Pipelines

### 1. Fraud Detection Features

**Feature Groups:**

**A. Claim-Level Features**
- `claim_amount` - Total claim amount
- `claim_amount_zscore` - Z-score vs user's historical claims
- `claim_submission_hour` - Hour of day (0-23)
- `claim_submission_day_of_week` - Day of week (0-6)
- `days_since_policy_start` - Days between policy start and claim
- `days_since_last_claim` - Days since user's previous claim
- `claim_description_length` - Character count in description
- `claim_description_sentiment` - Sentiment score (-1 to 1)

**B. User Behavioral Features**
- `user_total_claims_count` - Lifetime claim count
- `user_claims_last_30d` - Claims in last 30 days
- `user_claims_last_90d` - Claims in last 90 days
- `user_avg_claim_amount` - Average claim amount
- `user_claim_frequency` - Claims per month
- `user_approval_rate` - % of claims approved
- `user_fraud_alerts_count` - Historical fraud alerts

**C. Network/Graph Features**
- `shared_bank_account_count` - Users sharing same bank account
- `shared_address_count` - Users at same address
- `shared_phone_count` - Users with same phone number
- `panel_beater_claim_count` - Claims from same panel beater
- `panel_beater_fraud_rate` - Panel beater's fraud rate
- `assessor_claim_count` - Claims assessed by same assessor

**D. Damage Pattern Features**
- `damage_location_consistency` - Physics-based consistency score
- `damage_severity_score` - AI-assessed severity (0-100)
- `damage_photo_count` - Number of damage photos
- `damage_photo_quality_avg` - Average image quality score
- `damage_components_count` - Number of damaged components

**Pipeline Implementation:**

```python
# services/ml-feature-engineering/fraud_features.py
import pyspark.sql.functions as F
from pyspark.sql import SparkSession
from pyspark.sql.window import Window

class FraudFeatureEngineer:
    def __init__(self, spark: SparkSession):
        self.spark = spark
    
    def engineer_features(self, claims_df, users_df, assessments_df):
        # Claim-level features
        claims_features = claims_df.withColumn(
            'claim_submission_hour',
            F.hour('submitted_at')
        ).withColumn(
            'claim_submission_day_of_week',
            F.dayofweek('submitted_at')
        ).withColumn(
            'days_since_policy_start',
            F.datediff('submitted_at', 'policy_start_date')
        )
        
        # User behavioral features (window functions)
        user_window = Window.partitionBy('user_id').orderBy('submitted_at')
        
        claims_features = claims_features.withColumn(
            'days_since_last_claim',
            F.datediff('submitted_at', F.lag('submitted_at').over(user_window))
        ).withColumn(
            'user_total_claims_count',
            F.count('*').over(Window.partitionBy('user_id'))
        ).withColumn(
            'user_avg_claim_amount',
            F.avg('claim_amount').over(Window.partitionBy('user_id'))
        )
        
        # Z-score for claim amount
        claims_features = claims_features.withColumn(
            'claim_amount_zscore',
            (F.col('claim_amount') - F.col('user_avg_claim_amount')) / 
            F.stddev('claim_amount').over(Window.partitionBy('user_id'))
        )
        
        # Network features (self-joins)
        shared_bank = claims_df.groupBy('bank_account_number').agg(
            F.countDistinct('user_id').alias('shared_bank_account_count')
        )
        
        claims_features = claims_features.join(
            shared_bank,
            on='bank_account_number',
            how='left'
        )
        
        return claims_features
```

### 2. Damage Assessment Features

**Feature Groups:**

**A. Image Features**
- `damage_image_embeddings` - 512-dim vector from ResNet50
- `damage_image_quality_score` - Blur/brightness/contrast score
- `damage_image_resolution` - Pixel dimensions
- `damage_image_aspect_ratio` - Width/height ratio
- `damage_image_file_size` - File size in KB

**B. Vehicle Features**
- `vehicle_make` - Manufacturer (categorical)
- `vehicle_model` - Model (categorical)
- `vehicle_year` - Manufacturing year
- `vehicle_age` - Age in years
- `vehicle_mileage` - Odometer reading
- `vehicle_market_value` - Estimated market value

**C. Damage Metadata**
- `damaged_components_list` - List of damaged parts
- `damage_severity_by_component` - Severity per component
- `repair_vs_replace_ratio` - % of components to replace
- `estimated_labor_hours` - Total labor hours
- `estimated_parts_cost` - Total parts cost

**D. Historical Features**
- `vehicle_previous_claims_count` - Prior claims for this VIN
- `vehicle_avg_repair_cost` - Average historical repair cost
- `make_model_avg_repair_cost` - Average for this make/model
- `panel_beater_avg_accuracy` - Panel beater's quote accuracy

### 3. Cost Prediction Features

**Feature Groups:**

**A. Quote Features**
- `panel_beater_quote_amount` - Quoted total cost
- `parts_cost` - Parts subtotal
- `labor_cost` - Labor subtotal
- `labor_hours` - Estimated hours
- `labor_rate` - Hourly rate
- `parts_count` - Number of parts

**B. Market Features**
- `market_avg_labor_rate` - Regional average labor rate
- `market_avg_parts_cost` - Market price for parts
- `quote_vs_market_ratio` - Quote / market average
- `competitor_quote_count` - Number of competing quotes
- `lowest_competitor_quote` - Minimum quote amount

**C. Temporal Features**
- `quote_submission_month` - Month (1-12)
- `quote_submission_quarter` - Quarter (Q1-Q4)
- `days_to_quote` - Days from claim to quote
- `seasonal_demand_index` - Seasonal demand multiplier

**D. Geographic Features**
- `panel_beater_distance_km` - Distance from claimant
- `regional_labor_cost_index` - Regional cost index
- `urban_rural_indicator` - Urban vs rural location

---

## Feature Store Integration

### AWS SageMaker Feature Store

**Feature Groups:**

```python
# services/ml-feature-store/feature_groups.py
import sagemaker
from sagemaker.feature_store.feature_group import FeatureGroup

# 1. Fraud Detection Feature Group
fraud_feature_group = FeatureGroup(
    name='kinga-fraud-features-v1',
    sagemaker_session=sagemaker_session
)

fraud_feature_group.load_feature_definitions(data_frame=fraud_features_df)

fraud_feature_group.create(
    s3_uri=f's3://kinga-ml-data-lake/feature-store/fraud',
    record_identifier_name='claim_id',
    event_time_feature_name='event_time',
    role_arn=feature_store_role_arn,
    enable_online_store=True,  # For real-time inference
    offline_store_config={
        's3_storage_config': {
            's3_uri': f's3://kinga-ml-data-lake/feature-store/fraud/offline'
        }
    }
)

# 2. Damage Assessment Feature Group
damage_feature_group = FeatureGroup(
    name='kinga-damage-features-v1',
    sagemaker_session=sagemaker_session
)

damage_feature_group.load_feature_definitions(data_frame=damage_features_df)

damage_feature_group.create(
    s3_uri=f's3://kinga-ml-data-lake/feature-store/damage',
    record_identifier_name='assessment_id',
    event_time_feature_name='event_time',
    role_arn=feature_store_role_arn,
    enable_online_store=True
)

# 3. Cost Prediction Feature Group
cost_feature_group = FeatureGroup(
    name='kinga-cost-features-v2',
    sagemaker_session=sagemaker_session
)

cost_feature_group.load_feature_definitions(data_frame=cost_features_df)

cost_feature_group.create(
    s3_uri=f's3://kinga-ml-data-lake/feature-store/cost',
    record_identifier_name='quote_id',
    event_time_feature_name='event_time',
    role_arn=feature_store_role_arn,
    enable_online_store=True
)
```

### Feature Ingestion

```python
# Batch ingestion from S3
fraud_feature_group.ingest(
    data_frame=fraud_features_df,
    max_workers=8,
    wait=True
)

# Real-time ingestion from API
from sagemaker.feature_store.feature_store import FeatureStore

feature_store_runtime = boto3.client('sagemaker-featurestore-runtime')

feature_store_runtime.put_record(
    FeatureGroupName='kinga-fraud-features-v1',
    Record=[
        {'FeatureName': 'claim_id', 'ValueAsString': 'CLM-12345'},
        {'FeatureName': 'claim_amount', 'ValueAsString': '5000.00'},
        {'FeatureName': 'claim_amount_zscore', 'ValueAsString': '2.5'},
        # ... all features
        {'FeatureName': 'event_time', 'ValueAsString': '2026-02-11T13:30:00Z'}
    ]
)
```

### Feature Retrieval

```python
# Online retrieval (real-time inference)
response = feature_store_runtime.get_record(
    FeatureGroupName='kinga-fraud-features-v1',
    RecordIdentifierValueAsString='CLM-12345'
)

# Offline retrieval (batch training)
query = fraud_feature_group.athena_query()
query_string = """
SELECT *
FROM "kinga-fraud-features-v1"
WHERE event_time >= '2026-01-01'
  AND event_time < '2026-02-01'
"""
query.run(query_string=query_string, output_location=f's3://kinga-ml-data-lake/athena-results/')
query.wait()
dataset = query.as_dataframe()
```

---

## Dataset Versioning & Lineage

### DVC (Data Version Control)

**Setup:**

```bash
# Initialize DVC in ML project
cd services/ml-models
dvc init

# Configure S3 remote
dvc remote add -d s3remote s3://kinga-ml-data-lake/dvc-cache
dvc remote modify s3remote region us-east-1

# Track datasets
dvc add data/fraud_training_set_v1.parquet
git add data/fraud_training_set_v1.parquet.dvc .gitignore
git commit -m "Add fraud training dataset v1"
dvc push
```

**Versioning Workflow:**

```bash
# Create new dataset version
python scripts/generate_fraud_features.py --version v1.3.0

# Track with DVC
dvc add data/fraud_training_set_v1.3.0.parquet
git add data/fraud_training_set_v1.3.0.parquet.dvc
git tag -a fraud-dataset-v1.3.0 -m "Fraud dataset v1.3.0 with graph features"
git push origin fraud-dataset-v1.3.0
dvc push
```

### MLflow Experiment Tracking

```python
# services/ml-models/fraud_detection/train.py
import mlflow
import mlflow.sklearn

mlflow.set_tracking_uri('http://mlflow.kinga.internal:5000')
mlflow.set_experiment('fraud-detection')

with mlflow.start_run(run_name='fraud-model-v3.0.0'):
    # Log parameters
    mlflow.log_param('model_type', 'XGBoost')
    mlflow.log_param('max_depth', 10)
    mlflow.log_param('learning_rate', 0.1)
    mlflow.log_param('dataset_version', 'v1.3.0')
    
    # Log dataset lineage
    mlflow.log_param('feature_group', 'kinga-fraud-features-v1')
    mlflow.log_param('training_start_date', '2025-01-01')
    mlflow.log_param('training_end_date', '2026-01-31')
    
    # Train model
    model = train_fraud_model(X_train, y_train)
    
    # Log metrics
    mlflow.log_metric('accuracy', accuracy)
    mlflow.log_metric('precision', precision)
    mlflow.log_metric('recall', recall)
    mlflow.log_metric('f1_score', f1)
    mlflow.log_metric('auc_roc', auc_roc)
    
    # Log model
    mlflow.sklearn.log_model(model, 'fraud-model')
    
    # Log feature importance
    mlflow.log_artifact('feature_importance.png')
```

### Data Lineage Tracking

```python
# services/ml-feature-engineering/lineage.py
from dataclasses import dataclass
from datetime import datetime
import json

@dataclass
class DataLineage:
    dataset_id: str
    dataset_version: str
    created_at: datetime
    source_events: list[str]  # Kafka topics
    source_s3_paths: list[str]
    transformation_pipeline: str
    feature_count: int
    row_count: int
    schema_version: str
    
    def to_json(self):
        return json.dumps({
            'dataset_id': self.dataset_id,
            'dataset_version': self.dataset_version,
            'created_at': self.created_at.isoformat(),
            'source_events': self.source_events,
            'source_s3_paths': self.source_s3_paths,
            'transformation_pipeline': self.transformation_pipeline,
            'feature_count': self.feature_count,
            'row_count': self.row_count,
            'schema_version': self.schema_version
        })

# Save lineage metadata
lineage = DataLineage(
    dataset_id='fraud_features',
    dataset_version='v1.3.0',
    created_at=datetime.utcnow(),
    source_events=['kinga.claims.submitted', 'kinga.fraud.detected'],
    source_s3_paths=['s3://kinga-ml-data-lake/raw/kinga.claims.submitted/year=2026/'],
    transformation_pipeline='fraud_feature_pipeline_v2',
    feature_count=45,
    row_count=125000,
    schema_version='v1'
)

s3_client.put_object(
    Bucket='kinga-ml-data-lake',
    Key=f'metadata/lineage/fraud_features_v1.3.0.json',
    Body=lineage.to_json()
)
```

---

## ML Pipeline Monitoring

### Data Quality Checks

```python
# services/ml-feature-engineering/data_quality.py
from great_expectations.core import ExpectationSuite
from great_expectations.dataset import PandasDataset

class DataQualityValidator:
    def __init__(self):
        self.suite = ExpectationSuite(expectation_suite_name='fraud_features_suite')
    
    def validate_fraud_features(self, df: pd.DataFrame):
        dataset = PandasDataset(df)
        
        # Completeness checks
        dataset.expect_column_values_to_not_be_null('claim_id')
        dataset.expect_column_values_to_not_be_null('claim_amount')
        dataset.expect_column_values_to_not_be_null('user_id')
        
        # Range checks
        dataset.expect_column_values_to_be_between('claim_amount', min_value=0, max_value=1000000)
        dataset.expect_column_values_to_be_between('claim_amount_zscore', min_value=-10, max_value=10)
        dataset.expect_column_values_to_be_between('claim_submission_hour', min_value=0, max_value=23)
        
        # Uniqueness checks
        dataset.expect_column_values_to_be_unique('claim_id')
        
        # Categorical checks
        dataset.expect_column_values_to_be_in_set('claim_status', ['pending', 'approved', 'rejected', 'investigating'])
        
        # Statistical checks
        dataset.expect_column_mean_to_be_between('claim_amount', min_value=1000, max_value=50000)
        dataset.expect_column_stdev_to_be_between('claim_amount', min_value=500, max_value=100000)
        
        results = dataset.validate()
        
        if not results['success']:
            self.send_alert(results)
        
        return results
```

### Drift Detection

```python
# services/ml-monitoring/drift_detection.py
from evidently.dashboard import Dashboard
from evidently.tabs import DataDriftTab, CatTargetDriftTab

class DriftDetector:
    def detect_feature_drift(self, reference_df, current_df):
        dashboard = Dashboard(tabs=[DataDriftTab()])
        dashboard.calculate(reference_df, current_df)
        
        drift_report = dashboard.json()
        
        # Check for drift
        if drift_report['data_drift']['data_drift_detected']:
            drifted_features = [
                feature['feature_name']
                for feature in drift_report['data_drift']['metrics']
                if feature['drift_detected']
            ]
            
            self.send_drift_alert(drifted_features)
        
        return drift_report
```

### Pipeline Observability

**CloudWatch Metrics:**

- `FeatureEngineeringJobDuration` - Time to complete feature engineering
- `FeatureStoreIngestionRate` - Features ingested per second
- `DataQualityCheckFailures` - Failed data quality checks
- `FeatureDriftDetected` - Number of drifted features
- `S3DataLakeSize` - Total data lake size in GB

**CloudWatch Alarms:**

- Feature engineering job duration > 2 hours
- Data quality check failure rate > 5%
- Feature drift detected in > 10 features
- S3 data lake size > 10 TB

---

## Appendices

### Appendix A: Complete Feature List

See `services/ml-feature-engineering/feature_definitions.yaml` for complete feature catalog.

### Appendix B: Pipeline Code

See `services/ml-feature-engineering/` and `services/ml-data-ingestion/` directories.

### Appendix C: Airflow DAGs

See `services/ml-orchestration/dags/` for complete pipeline orchestration.

---

**Document Version:** 1.0.0  
**Last Updated:** February 11, 2026  
**Author:** Tavonga Shoko
