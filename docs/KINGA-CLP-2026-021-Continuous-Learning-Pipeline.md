# KINGA Continuous Learning Feedback Pipeline

**Document ID:** KINGA-CLP-2026-021  
**Version:** 1.0  
**Date:** February 12, 2026  
**Author:** Tavonga Shoko  
**Status:** Final  
**Classification:** Internal Technical Specification  
**Related Documents:** [KINGA-AEA-2026-018](KINGA-AEA-2026-018-Assessor-Ecosystem-Architecture.md) (Assessor Ecosystem Architecture), [KINGA-AWL-2026-019](KINGA-AWL-2026-019-Assessor-Workflow-Lifecycle.md) (Assessor Workflow Lifecycle), [KINGA-PMA-2026-020](KINGA-PMA-2026-020-Premium-Monetization-Architecture.md) (Premium Monetization Architecture)

---

## Executive Summary

This document specifies the complete **Continuous Learning Feedback Pipeline** that transforms approved assessor reports into ground truth training data for continuous AI model improvement. The pipeline implements a closed-loop learning system where human assessor expertise systematically enhances AI accuracy across damage assessment, cost estimation, and fraud detection.

The architecture addresses the fundamental challenge of AI model drift in production environments by establishing an automated pipeline that ingests approved assessor reports, validates labels for quality and consistency, triggers model retraining when performance degradation is detected, evaluates new model versions against holdout datasets, and deploys improved models to production with zero downtime.

The system is designed around **three core learning objectives**: improving damage scope detection accuracy (F1 score target: 0.92+), refining cost estimation precision (mean absolute percentage error target: <8%), and enhancing fraud pattern recognition (AUC-ROC target: 0.88+). Each learning objective has dedicated data extraction pipelines, model architectures, and evaluation metrics.

The pipeline implements **privacy-preserving machine learning** through comprehensive data anonymization (PII removal, differential privacy, k-anonymity), ensuring compliance with POPIA, GDPR, and insurance industry regulations while maintaining model performance. All training data is stored in anonymized form with irreversible transformations applied to personally identifiable information.

The architecture integrates **MLOps best practices** including model version tracking with MLflow, automated A/B testing for model evaluation, performance monitoring dashboards with real-time drift detection, and automated rollback mechanisms when new models underperform. Model deployment follows a canary release pattern where new versions are gradually rolled out to 5% → 25% → 50% → 100% of traffic with automated rollback if error rates exceed thresholds.

The system is designed to process **10,000+ approved reports per month** at scale, with batch ingestion pipelines running daily and model retraining triggered weekly or when drift detection thresholds are exceeded. The architecture supports multi-tenant isolation, ensuring that tenant-specific models can be trained when sufficient data volume is available (minimum 5,000 labeled examples per tenant).

---

## 1. Ground Truth Data Extraction Pipeline

### 1.1 Data Sources and Eligibility Criteria

Assessor reports become eligible for ground truth extraction when they meet **all** of the following criteria:

| **Criterion** | **Requirement** | **Rationale** |
|--------------|----------------|---------------|
| **Approval Status** | Report approved by insurer without revision requests | Ensures data quality and label accuracy |
| **Reconciliation Tier** | Tier 0-2 escalation (confidence >60%, variance <50%) | Filters out disputed or low-confidence cases |
| **Assessor Performance** | Assessor performance tier: Proficient or higher (composite score ≥60%) | Ensures labels come from reliable assessors |
| **Data Completeness** | All required fields populated (damage scope, cost estimate, photos, fraud assessment) | Ensures training examples are complete |
| **Photo Quality** | Minimum 5 photos with resolution ≥1024x768 | Ensures sufficient visual data for computer vision models |
| **Claim Type Coverage** | Claim type matches model training needs (collision, hail, theft, etc.) | Ensures balanced dataset across claim types |

**Exclusion Criteria:**

Reports are **excluded** from ground truth extraction if:
- Claim was disputed or escalated to Tier 3+ (fraud investigation, total loss disagreement)
- Assessor has performance tier "Developing" (<60% composite score)
- Report contains incomplete or missing data fields
- Photos are low quality, blurry, or insufficient (<5 photos)
- Claim involves sensitive cases (fatalities, legal disputes, ongoing investigations)

### 1.2 Dataset Ingestion Pipeline Architecture

**Pipeline Stages:**

```
┌─────────────────────────────────────────────────────────────────────┐
│                  Ground Truth Extraction Pipeline                   │
└─────────────────────────────────────────────────────────────────────┘

Stage 1: Eligibility Filtering
    ↓
    SELECT claims WHERE
      status = 'CLOSED' AND
      revision_requested = FALSE AND
      reconciliation_tier IN (0, 1, 2) AND
      assessor_performance_tier IN ('Master', 'Expert', 'Proficient') AND
      data_completeness_score >= 95% AND
      photo_count >= 5
    ↓
Stage 2: Data Extraction
    ↓
    Extract:
      - Claim metadata (claim_id, claim_type, vehicle_make_model, incident_date)
      - Damage scope (component list, severity ratings, repair vs replace decisions)
      - Cost estimate (parts costs, labor hours, total estimate)
      - Fraud indicators (assessor fraud score, fraud flags, suspicious patterns)
      - Photos (original images + metadata)
      - AI predictions (for comparison and drift detection)
    ↓
Stage 3: Data Anonymization
    ↓
    Apply:
      - PII removal (claimant name, phone, email, VIN, license plate)
      - Geolocation fuzzing (round GPS coordinates to 1km grid)
      - Timestamp generalization (round to day, remove exact time)
      - Differential privacy (add calibrated noise to numeric fields)
    ↓
Stage 4: Label Validation
    ↓
    Validate:
      - Damage scope consistency (cross-check with photos)
      - Cost estimate reasonableness (outlier detection)
      - Fraud label quality (check for contradictions)
      - Photo-label alignment (verify damage matches photos)
    ↓
Stage 5: Dataset Storage
    ↓
    Store:
      - Training dataset (80% of data)
      - Validation dataset (10% of data)
      - Test dataset (10% of data)
      - Metadata (extraction date, model version, data lineage)
    ↓
Stage 6: Kafka Event Emission
    ↓
    Emit:
      - training.dataset.ingested event
      - training.drift.detected event (if drift threshold exceeded)
      - training.retraining.triggered event (if retraining criteria met)
```

**Implementation:**

```python
# server/ml/ground_truth_extraction.py
import hashlib
from datetime import datetime, timedelta
from typing import List, Dict, Any
import numpy as np
from PIL import Image

class GroundTruthExtractor:
    def __init__(self, db_connection, s3_client, kafka_producer):
        self.db = db_connection
        self.s3 = s3_client
        self.kafka = kafka_producer
        self.anonymizer = DataAnonymizer()
        self.validator = LabelValidator()
    
    async def extract_eligible_reports(self, lookback_days: int = 7) -> List[Dict[str, Any]]:
        """Extract approved reports from last N days that meet eligibility criteria."""
        cutoff_date = datetime.now() - timedelta(days=lookback_days)
        
        query = """
        SELECT
          c.id AS claim_id,
          c.claim_type,
          c.vehicle_make,
          c.vehicle_model,
          c.incident_date,
          ae.damage_scope,
          ae.estimated_repair_cost,
          ae.fraud_assessment,
          ae.fraud_score,
          ai.ai_damage_scope,
          ai.ai_cost_estimate,
          ai.ai_fraud_score,
          r.damage_scope_f1,
          r.cost_variance_percentage,
          r.reconciliation_tier,
          a.performance_tier,
          COUNT(cp.id) AS photo_count
        FROM claims c
        JOIN assessor_evaluations ae ON c.id = ae.claim_id
        JOIN ai_assessments ai ON c.id = ai.claim_id
        JOIN ai_human_reconciliation r ON c.id = r.claim_id
        JOIN assessors a ON ae.assessor_id = a.id
        LEFT JOIN claim_photos cp ON c.id = cp.claim_id
        WHERE
          c.status = 'CLOSED'
          AND c.closed_at >= %s
          AND c.revision_requested = FALSE
          AND r.reconciliation_tier IN (0, 1, 2)
          AND a.performance_tier IN ('Master', 'Expert', 'Proficient')
          AND ae.data_completeness_score >= 95
        GROUP BY c.id
        HAVING photo_count >= 5
        """
        
        eligible_claims = await self.db.execute(query, (cutoff_date,))
        return eligible_claims
    
    async def extract_ground_truth_dataset(self, claim_id: int) -> Dict[str, Any]:
        """Extract complete ground truth dataset for a single claim."""
        
        # Extract claim data
        claim_data = await self._extract_claim_data(claim_id)
        
        # Extract damage scope labels
        damage_labels = await self._extract_damage_labels(claim_id)
        
        # Extract cost estimation labels
        cost_labels = await self._extract_cost_labels(claim_id)
        
        # Extract fraud labels
        fraud_labels = await self._extract_fraud_labels(claim_id)
        
        # Extract photos
        photos = await self._extract_photos(claim_id)
        
        # Extract AI predictions (for comparison)
        ai_predictions = await self._extract_ai_predictions(claim_id)
        
        # Anonymize data
        anonymized_data = self.anonymizer.anonymize({
            'claim_data': claim_data,
            'damage_labels': damage_labels,
            'cost_labels': cost_labels,
            'fraud_labels': fraud_labels,
            'photos': photos,
            'ai_predictions': ai_predictions
        })
        
        # Validate labels
        validation_result = self.validator.validate(anonymized_data)
        
        if not validation_result.is_valid:
            raise ValueError(f"Label validation failed: {validation_result.errors}")
        
        return anonymized_data
    
    async def _extract_damage_labels(self, claim_id: int) -> Dict[str, Any]:
        """Extract damage scope labels from assessor report."""
        query = """
        SELECT
          component_name,
          damage_severity,
          repair_or_replace,
          estimated_labor_hours,
          notes
        FROM assessor_damage_components
        WHERE claim_id = %s
        """
        components = await self.db.execute(query, (claim_id,))
        
        return {
            'components': components,
            'total_components': len(components),
            'replace_count': sum(1 for c in components if c['repair_or_replace'] == 'replace'),
            'total_labor_hours': sum(c['estimated_labor_hours'] for c in components)
        }
    
    async def _extract_cost_labels(self, claim_id: int) -> Dict[str, Any]:
        """Extract cost estimation labels from assessor report."""
        query = """
        SELECT
          total_parts_cost,
          total_labor_cost,
          paint_materials_cost,
          total_estimate,
          currency
        FROM assessor_evaluations
        WHERE claim_id = %s
        """
        cost_data = await self.db.execute_one(query, (claim_id,))
        
        return cost_data
    
    async def _extract_fraud_labels(self, claim_id: int) -> Dict[str, Any]:
        """Extract fraud assessment labels from assessor report."""
        query = """
        SELECT
          fraud_score,
          fraud_indicators,
          fraud_explanation,
          recommended_action
        FROM assessor_evaluations
        WHERE claim_id = %s
        """
        fraud_data = await self.db.execute_one(query, (claim_id,))
        
        return fraud_data
```

### 1.3 Batch Ingestion Schedule

**Daily Batch Job:**

- **Schedule:** Every day at 02:00 UTC (low-traffic period)
- **Lookback Window:** 7 days (to catch any late approvals)
- **Expected Volume:** 300-500 reports per day (10,000-15,000 per month)
- **Processing Time:** 2-4 hours for full batch
- **Storage:** Parquet format in S3 (`s3://kinga-ml-training-data/ground-truth/YYYY-MM-DD/`)

**Real-Time Ingestion (Optional):**

For high-priority retraining scenarios, the system can ingest reports in real-time via Kafka event listener:

```python
# Listen for claim.closed events
@kafka_consumer.subscribe('claim.lifecycle')
async def on_claim_closed(event: Dict[str, Any]):
    if event['new_status'] == 'CLOSED' and event['revision_requested'] == False:
        # Extract ground truth data immediately
        await ground_truth_extractor.extract_ground_truth_dataset(event['claim_id'])
```

---

## 2. Label Validation Process

### 2.1 Quality Checks

**Damage Scope Validation:**

| **Check** | **Validation Logic** | **Action on Failure** |
|----------|---------------------|----------------------|
| **Component Consistency** | All damaged components have corresponding photos showing damage | Flag for manual review |
| **Severity Alignment** | Damage severity matches visual evidence in photos (using CV model) | Flag for manual review |
| **Repair vs Replace Logic** | Replace decisions align with industry standards (e.g., >50% panel damage → replace) | Flag for manual review |
| **Labor Hour Reasonableness** | Labor hours fall within industry benchmarks for component type | Flag as outlier |

**Cost Estimation Validation:**

| **Check** | **Validation Logic** | **Action on Failure** |
|----------|---------------------|----------------------|
| **Parts Cost Reasonableness** | Parts costs within 20% of market pricing database | Flag as outlier |
| **Labor Rate Consistency** | Labor rate matches regional averages ($40-80/hour) | Flag as outlier |
| **Total Estimate Sanity** | Total estimate within expected range for claim type and damage severity | Flag as outlier |
| **Currency Consistency** | All cost fields use same currency code | Reject (data integrity error) |

**Fraud Label Validation:**

| **Check** | **Validation Logic** | **Action on Failure** |
|----------|---------------------|----------------------|
| **Score-Indicator Alignment** | Fraud score aligns with number/severity of fraud indicators | Flag for manual review |
| **Explanation Completeness** | If fraud score >0.5, explanation must be provided | Reject (incomplete label) |
| **Contradiction Detection** | Fraud indicators don't contradict each other (e.g., "pre-existing damage" + "staged accident") | Flag for manual review |

### 2.2 Outlier Detection

**Statistical Outlier Detection:**

```python
class OutlierDetector:
    def __init__(self, training_data: pd.DataFrame):
        self.training_data = training_data
    
    def detect_cost_outliers(self, new_sample: Dict[str, Any]) -> bool:
        """Detect if cost estimate is a statistical outlier using IQR method."""
        claim_type = new_sample['claim_type']
        total_estimate = new_sample['total_estimate']
        
        # Filter training data by claim type
        similar_claims = self.training_data[
            self.training_data['claim_type'] == claim_type
        ]
        
        # Calculate IQR
        Q1 = similar_claims['total_estimate'].quantile(0.25)
        Q3 = similar_claims['total_estimate'].quantile(0.75)
        IQR = Q3 - Q1
        
        # Define outlier bounds
        lower_bound = Q1 - 1.5 * IQR
        upper_bound = Q3 + 1.5 * IQR
        
        # Check if new sample is outlier
        is_outlier = (total_estimate < lower_bound) or (total_estimate > upper_bound)
        
        return is_outlier
    
    def detect_fraud_score_outliers(self, new_sample: Dict[str, Any]) -> bool:
        """Detect if fraud score is inconsistent with historical patterns."""
        fraud_score = new_sample['fraud_score']
        fraud_indicators_count = len(new_sample['fraud_indicators'])
        
        # Expected fraud score range based on indicator count
        expected_score_ranges = {
            0: (0.0, 0.2),
            1: (0.2, 0.4),
            2: (0.4, 0.6),
            3: (0.6, 0.8),
            4: (0.8, 1.0)
        }
        
        expected_range = expected_score_ranges.get(fraud_indicators_count, (0.0, 1.0))
        
        is_outlier = not (expected_range[0] <= fraud_score <= expected_range[1])
        
        return is_outlier
```

### 2.3 Manual Review Queue

Reports flagged by validation checks are routed to a **manual review queue** for data quality team review:

**Review Queue Dashboard (`/ml/data-quality/review-queue`):**

- **Pending Reviews:** List of flagged reports with validation failure reasons
- **Review Actions:** Approve (include in training data), Reject (exclude), Request Clarification (contact assessor)
- **Reviewer Assignment:** Round-robin assignment to data quality team members
- **SLA:** 48-hour review turnaround time

**Review Metrics:**

- **Approval Rate:** % of flagged reports approved after review (target: 70-80%)
- **Rejection Rate:** % of flagged reports rejected (target: 10-20%)
- **Clarification Rate:** % requiring assessor follow-up (target: 10-20%)

---

## 3. AI Retraining Triggers

### 3.1 Drift Detection

**Model Drift Types:**

| **Drift Type** | **Detection Method** | **Threshold** | **Action** |
|---------------|---------------------|--------------|-----------|
| **Data Drift** | KL divergence between training data distribution and production data distribution | KL divergence > 0.15 | Trigger retraining |
| **Concept Drift** | F1 score degradation on validation set over time | F1 score drops >5% from baseline | Trigger retraining |
| **Prediction Drift** | Distribution shift in model predictions (e.g., fraud score distribution changes) | KS test p-value < 0.05 | Investigate + trigger retraining |
| **Label Drift** | Distribution shift in ground truth labels (e.g., more fraud cases than historical average) | Chi-square test p-value < 0.05 | Update training data + retrain |

**Drift Detection Implementation:**

```python
from scipy.stats import ks_2samp, chi2_contingency
from scipy.spatial.distance import jensenshannon
import numpy as np

class DriftDetector:
    def __init__(self, baseline_data: pd.DataFrame):
        self.baseline_data = baseline_data
    
    def detect_data_drift(self, production_data: pd.DataFrame) -> Dict[str, Any]:
        """Detect data drift using KL divergence on feature distributions."""
        drift_scores = {}
        
        for column in self.baseline_data.columns:
            if self.baseline_data[column].dtype in ['int64', 'float64']:
                # Numeric feature: use KS test
                baseline_values = self.baseline_data[column].dropna()
                production_values = production_data[column].dropna()
                
                ks_statistic, p_value = ks_2samp(baseline_values, production_values)
                
                drift_scores[column] = {
                    'ks_statistic': ks_statistic,
                    'p_value': p_value,
                    'drift_detected': p_value < 0.05
                }
            else:
                # Categorical feature: use chi-square test
                baseline_counts = self.baseline_data[column].value_counts()
                production_counts = production_data[column].value_counts()
                
                # Align categories
                all_categories = set(baseline_counts.index) | set(production_counts.index)
                baseline_aligned = [baseline_counts.get(cat, 0) for cat in all_categories]
                production_aligned = [production_counts.get(cat, 0) for cat in all_categories]
                
                chi2, p_value, _, _ = chi2_contingency([baseline_aligned, production_aligned])
                
                drift_scores[column] = {
                    'chi2_statistic': chi2,
                    'p_value': p_value,
                    'drift_detected': p_value < 0.05
                }
        
        # Overall drift score: % of features with drift detected
        overall_drift_score = sum(1 for score in drift_scores.values() if score['drift_detected']) / len(drift_scores)
        
        return {
            'drift_scores': drift_scores,
            'overall_drift_score': overall_drift_score,
            'drift_detected': overall_drift_score > 0.15  # 15% of features showing drift
        }
    
    def detect_concept_drift(self, model, validation_data: pd.DataFrame) -> Dict[str, Any]:
        """Detect concept drift by evaluating model performance on recent validation data."""
        from sklearn.metrics import f1_score, precision_score, recall_score
        
        # Get predictions
        y_true = validation_data['label']
        y_pred = model.predict(validation_data.drop('label', axis=1))
        
        # Calculate metrics
        current_f1 = f1_score(y_true, y_pred, average='weighted')
        current_precision = precision_score(y_true, y_pred, average='weighted')
        current_recall = recall_score(y_true, y_pred, average='weighted')
        
        # Compare to baseline
        baseline_f1 = model.metadata['baseline_f1']
        f1_degradation = (baseline_f1 - current_f1) / baseline_f1
        
        return {
            'current_f1': current_f1,
            'baseline_f1': baseline_f1,
            'f1_degradation': f1_degradation,
            'concept_drift_detected': f1_degradation > 0.05  # 5% degradation threshold
        }
```

### 3.2 Retraining Triggers

**Trigger Conditions:**

| **Trigger** | **Condition** | **Priority** | **Retraining Frequency** |
|------------|--------------|-------------|------------------------|
| **Scheduled Retraining** | Every 4 weeks | Low | Monthly |
| **Data Volume Threshold** | 5,000+ new labeled examples accumulated | Medium | When threshold reached |
| **Drift Detection** | Data drift or concept drift detected | High | Within 48 hours |
| **Performance Degradation** | F1 score drops >5% on validation set | Critical | Immediate |
| **Manual Trigger** | ML team manually initiates retraining | Variable | On-demand |

**Retraining Decision Logic:**

```python
class RetrainingOrchestrator:
    def __init__(self, drift_detector, model_evaluator):
        self.drift_detector = drift_detector
        self.evaluator = model_evaluator
    
    async def should_trigger_retraining(self) -> Dict[str, Any]:
        """Determine if model retraining should be triggered."""
        
        # Check 1: Scheduled retraining (monthly)
        last_training_date = await self.get_last_training_date()
        days_since_training = (datetime.now() - last_training_date).days
        
        if days_since_training >= 28:
            return {
                'should_retrain': True,
                'reason': 'scheduled_retraining',
                'priority': 'low'
            }
        
        # Check 2: Data volume threshold
        new_samples_count = await self.count_new_training_samples()
        
        if new_samples_count >= 5000:
            return {
                'should_retrain': True,
                'reason': 'data_volume_threshold',
                'priority': 'medium',
                'new_samples_count': new_samples_count
            }
        
        # Check 3: Drift detection
        production_data = await self.get_recent_production_data(days=7)
        drift_result = self.drift_detector.detect_data_drift(production_data)
        
        if drift_result['drift_detected']:
            return {
                'should_retrain': True,
                'reason': 'data_drift_detected',
                'priority': 'high',
                'drift_score': drift_result['overall_drift_score']
            }
        
        # Check 4: Performance degradation
        validation_data = await self.get_validation_data()
        current_model = await self.load_current_model()
        concept_drift_result = self.drift_detector.detect_concept_drift(current_model, validation_data)
        
        if concept_drift_result['concept_drift_detected']:
            return {
                'should_retrain': True,
                'reason': 'performance_degradation',
                'priority': 'critical',
                'f1_degradation': concept_drift_result['f1_degradation']
            }
        
        # No retraining needed
        return {
            'should_retrain': False,
            'reason': 'no_trigger_conditions_met'
        }
```

---

## 4. Model Evaluation Metrics

### 4.1 Damage Scope Detection Metrics

**Primary Metric: F1 Score**

The damage scope detection model is evaluated using **component-level F1 score**, which balances precision (% of predicted damaged components that are actually damaged) and recall (% of actually damaged components that are detected).

**Evaluation Formula:**

```
Precision = True Positives / (True Positives + False Positives)
Recall = True Positives / (True Positives + False Negatives)
F1 Score = 2 × (Precision × Recall) / (Precision + Recall)
```

**Target Metrics:**

| **Metric** | **Current Baseline** | **Target (Post-Retraining)** | **Threshold for Production Deployment** |
|-----------|---------------------|----------------------------|----------------------------------------|
| **F1 Score** | 0.87 | 0.92 | ≥0.90 |
| **Precision** | 0.89 | 0.93 | ≥0.88 |
| **Recall** | 0.85 | 0.91 | ≥0.85 |

**Secondary Metrics:**

- **Component-Level Accuracy:** % of components correctly classified (damaged vs not damaged)
- **Severity Prediction MAE:** Mean absolute error in damage severity prediction (1-5 scale)
- **Repair vs Replace Accuracy:** % of repair/replace decisions matching assessor labels

### 4.2 Cost Estimation Metrics

**Primary Metric: Mean Absolute Percentage Error (MAPE)**

Cost estimation accuracy is measured using MAPE, which expresses prediction error as a percentage of the true value:

**Evaluation Formula:**

```
MAPE = (1/n) × Σ |Actual Cost - Predicted Cost| / Actual Cost × 100%
```

**Target Metrics:**

| **Metric** | **Current Baseline** | **Target (Post-Retraining)** | **Threshold for Production Deployment** |
|-----------|---------------------|----------------------------|----------------------------------------|
| **MAPE** | 12.3% | <8% | <10% |
| **MAE** | $485 | <$350 | <$400 |
| **R² Score** | 0.82 | >0.88 | >0.85 |

**Secondary Metrics:**

- **Parts Cost MAPE:** Accuracy of parts cost estimation
- **Labor Cost MAPE:** Accuracy of labor cost estimation
- **Underestimation Rate:** % of claims where AI estimate is <80% of actual cost (target: <5%)
- **Overestimation Rate:** % of claims where AI estimate is >120% of actual cost (target: <10%)

### 4.3 Fraud Detection Metrics

**Primary Metric: AUC-ROC (Area Under Receiver Operating Characteristic Curve)**

Fraud detection is a binary classification problem (fraud vs legitimate), evaluated using AUC-ROC which measures the model's ability to distinguish between classes across all classification thresholds.

**Target Metrics:**

| **Metric** | **Current Baseline** | **Target (Post-Retraining)** | **Threshold for Production Deployment** |
|-----------|---------------------|----------------------------|----------------------------------------|
| **AUC-ROC** | 0.84 | 0.88 | ≥0.85 |
| **Precision @ 90% Recall** | 0.72 | 0.80 | ≥0.75 |
| **False Positive Rate** | 8.5% | <5% | <7% |

**Secondary Metrics:**

- **Precision-Recall AUC:** Alternative metric for imbalanced datasets
- **F1 Score @ Optimal Threshold:** F1 score at threshold that maximizes F1
- **True Positive Rate @ 1% FPR:** Recall when false positive rate is constrained to 1%

### 4.4 Model Evaluation Pipeline

```python
from sklearn.metrics import f1_score, mean_absolute_percentage_error, roc_auc_score, precision_recall_curve
import mlflow

class ModelEvaluator:
    def __init__(self, test_data: pd.DataFrame):
        self.test_data = test_data
    
    def evaluate_damage_scope_model(self, model) -> Dict[str, float]:
        """Evaluate damage scope detection model."""
        X_test = self.test_data.drop('damage_labels', axis=1)
        y_test = self.test_data['damage_labels']
        
        y_pred = model.predict(X_test)
        
        f1 = f1_score(y_test, y_pred, average='weighted')
        precision = precision_score(y_test, y_pred, average='weighted')
        recall = recall_score(y_test, y_pred, average='weighted')
        
        # Log to MLflow
        mlflow.log_metric('damage_scope_f1', f1)
        mlflow.log_metric('damage_scope_precision', precision)
        mlflow.log_metric('damage_scope_recall', recall)
        
        return {
            'f1_score': f1,
            'precision': precision,
            'recall': recall,
            'meets_threshold': f1 >= 0.90
        }
    
    def evaluate_cost_estimation_model(self, model) -> Dict[str, float]:
        """Evaluate cost estimation model."""
        X_test = self.test_data.drop('total_cost', axis=1)
        y_test = self.test_data['total_cost']
        
        y_pred = model.predict(X_test)
        
        mape = mean_absolute_percentage_error(y_test, y_pred) * 100
        mae = mean_absolute_error(y_test, y_pred)
        r2 = r2_score(y_test, y_pred)
        
        # Log to MLflow
        mlflow.log_metric('cost_mape', mape)
        mlflow.log_metric('cost_mae', mae)
        mlflow.log_metric('cost_r2', r2)
        
        return {
            'mape': mape,
            'mae': mae,
            'r2_score': r2,
            'meets_threshold': mape < 10.0
        }
    
    def evaluate_fraud_detection_model(self, model) -> Dict[str, float]:
        """Evaluate fraud detection model."""
        X_test = self.test_data.drop('is_fraud', axis=1)
        y_test = self.test_data['is_fraud']
        
        y_pred_proba = model.predict_proba(X_test)[:, 1]
        
        auc_roc = roc_auc_score(y_test, y_pred_proba)
        
        # Calculate precision @ 90% recall
        precision, recall, thresholds = precision_recall_curve(y_test, y_pred_proba)
        idx = np.argmin(np.abs(recall - 0.90))
        precision_at_90_recall = precision[idx]
        
        # Log to MLflow
        mlflow.log_metric('fraud_auc_roc', auc_roc)
        mlflow.log_metric('fraud_precision_at_90_recall', precision_at_90_recall)
        
        return {
            'auc_roc': auc_roc,
            'precision_at_90_recall': precision_at_90_recall,
            'meets_threshold': auc_roc >= 0.85
        }
```

---

## 5. Fraud Pattern Learning Integration

### 5.1 Fraud Pattern Extraction

**Fraud Indicator Categories:**

| **Category** | **Indicators** | **Learning Objective** |
|-------------|---------------|----------------------|
| **Pre-Existing Damage** | Rust, wear patterns, mismatched paint, old damage visible in photos | Learn to detect pre-existing damage from photos |
| **Staged Accidents** | Inconsistent damage patterns, damage doesn't match accident description, suspicious timing | Learn suspicious accident patterns |
| **Inflated Claims** | Cost estimate significantly higher than market rates, unnecessary repairs, premium parts for economy vehicles | Learn cost inflation patterns |
| **Document Fraud** | Altered invoices, fake receipts, inconsistent documentation | Learn document authenticity patterns (OCR + NLP) |
| **Claimant Behavior** | Multiple claims in short period, claims always near policy limits, suspicious injury patterns | Learn behavioral fraud patterns |

**Fraud Pattern Learning Pipeline:**

```python
class FraudPatternLearner:
    def __init__(self, training_data: pd.DataFrame):
        self.training_data = training_data
    
    def extract_fraud_patterns(self) -> Dict[str, Any]:
        """Extract fraud patterns from approved assessor reports."""
        
        # Filter to fraud cases
        fraud_cases = self.training_data[self.training_data['is_fraud'] == True]
        
        # Extract patterns by category
        patterns = {}
        
        # Pre-existing damage patterns
        patterns['pre_existing_damage'] = self._extract_pre_existing_damage_patterns(fraud_cases)
        
        # Staged accident patterns
        patterns['staged_accidents'] = self._extract_staged_accident_patterns(fraud_cases)
        
        # Inflated claim patterns
        patterns['inflated_claims'] = self._extract_inflated_claim_patterns(fraud_cases)
        
        # Document fraud patterns
        patterns['document_fraud'] = self._extract_document_fraud_patterns(fraud_cases)
        
        # Behavioral patterns
        patterns['claimant_behavior'] = self._extract_behavioral_patterns(fraud_cases)
        
        return patterns
    
    def _extract_pre_existing_damage_patterns(self, fraud_cases: pd.DataFrame) -> List[Dict[str, Any]]:
        """Extract visual patterns indicating pre-existing damage."""
        patterns = []
        
        for _, case in fraud_cases.iterrows():
            if 'pre_existing_damage' in case['fraud_indicators']:
                # Extract visual features from photos
                photo_features = self._extract_photo_features(case['photos'])
                
                patterns.append({
                    'claim_id': case['claim_id'],
                    'visual_features': photo_features,
                    'assessor_notes': case['fraud_explanation'],
                    'damage_components': case['damage_scope']
                })
        
        return patterns
    
    def _extract_inflated_claim_patterns(self, fraud_cases: pd.DataFrame) -> List[Dict[str, Any]]:
        """Extract cost inflation patterns."""
        patterns = []
        
        for _, case in fraud_cases.iterrows():
            if 'inflated_estimate' in case['fraud_indicators']:
                # Calculate cost inflation metrics
                market_price = self._get_market_price(case['parts_list'])
                actual_price = case['total_parts_cost']
                inflation_ratio = actual_price / market_price
                
                patterns.append({
                    'claim_id': case['claim_id'],
                    'inflation_ratio': inflation_ratio,
                    'parts_list': case['parts_list'],
                    'vehicle_type': case['vehicle_make_model'],
                    'assessor_notes': case['fraud_explanation']
                })
        
        return patterns
```

### 5.2 Fraud Model Retraining

**Fraud Detection Model Architecture:**

The fraud detection model uses a **two-stage ensemble approach**:

**Stage 1: Feature Extraction**
- **Computer Vision Model:** Analyzes photos for pre-existing damage, suspicious patterns
- **NLP Model:** Analyzes claim description, assessor notes for suspicious language
- **Tabular Model:** Analyzes structured data (cost estimates, claimant history, timing patterns)

**Stage 2: Ensemble Classifier**
- **Gradient Boosting (XGBoost):** Combines features from all three Stage 1 models
- **Output:** Fraud probability score (0.0-1.0)

**Retraining Process:**

```python
import xgboost as xgb
from sklearn.model_selection import train_test_split
import mlflow

class FraudModelRetrainer:
    def __init__(self, training_data: pd.DataFrame):
        self.training_data = training_data
    
    async def retrain_fraud_model(self) -> Dict[str, Any]:
        """Retrain fraud detection model with new ground truth data."""
        
        # Split data
        X = self.training_data.drop('is_fraud', axis=1)
        y = self.training_data['is_fraud']
        
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, stratify=y, random_state=42
        )
        
        # Handle class imbalance (fraud is rare)
        scale_pos_weight = (y_train == 0).sum() / (y_train == 1).sum()
        
        # Train XGBoost model
        with mlflow.start_run(run_name='fraud_detection_retraining'):
            model = xgb.XGBClassifier(
                max_depth=6,
                learning_rate=0.1,
                n_estimators=200,
                scale_pos_weight=scale_pos_weight,
                eval_metric='auc'
            )
            
            model.fit(
                X_train, y_train,
                eval_set=[(X_test, y_test)],
                early_stopping_rounds=10,
                verbose=False
            )
            
            # Evaluate model
            evaluator = ModelEvaluator(X_test, y_test)
            metrics = evaluator.evaluate_fraud_detection_model(model)
            
            # Log model
            mlflow.sklearn.log_model(model, 'fraud_detection_model')
            
            # Log metrics
            mlflow.log_metrics(metrics)
            
            return {
                'model': model,
                'metrics': metrics,
                'training_samples': len(X_train),
                'test_samples': len(X_test)
            }
```

---

## 6. Cost Optimization Learning Integration

### 6.1 Cost Optimization Pattern Extraction

**Cost Optimization Opportunities:**

| **Opportunity Type** | **Pattern** | **Learning Objective** |
|---------------------|-----------|----------------------|
| **Aftermarket Parts** | OEM parts replaced with aftermarket equivalents (30-50% cost savings) | Learn when aftermarket parts are acceptable |
| **Repair vs Replace** | Components repaired instead of replaced (40-60% cost savings) | Learn optimal repair/replace decision boundaries |
| **Labor Efficiency** | Reduced labor hours through efficient repair techniques | Learn labor hour optimization patterns |
| **Paint Materials** | Optimized paint materials usage (blending vs full panel repaint) | Learn paint strategy optimization |

**Cost Optimization Learning Pipeline:**

```python
class CostOptimizationLearner:
    def __init__(self, training_data: pd.DataFrame):
        self.training_data = training_data
    
    def extract_cost_optimization_patterns(self) -> Dict[str, Any]:
        """Extract cost optimization patterns from assessor reports."""
        
        patterns = {}
        
        # Aftermarket parts patterns
        patterns['aftermarket_parts'] = self._extract_aftermarket_patterns()
        
        # Repair vs replace patterns
        patterns['repair_vs_replace'] = self._extract_repair_replace_patterns()
        
        # Labor efficiency patterns
        patterns['labor_efficiency'] = self._extract_labor_efficiency_patterns()
        
        # Paint optimization patterns
        patterns['paint_optimization'] = self._extract_paint_optimization_patterns()
        
        return patterns
    
    def _extract_aftermarket_patterns(self) -> List[Dict[str, Any]]:
        """Extract patterns where aftermarket parts were successfully used."""
        patterns = []
        
        # Find cases where aftermarket parts were used and claim was approved
        aftermarket_cases = self.training_data[
            (self.training_data['aftermarket_parts_used'] == True) &
            (self.training_data['claim_approved'] == True)
        ]
        
        for _, case in aftermarket_cases.iterrows():
            oem_cost = self._get_oem_cost(case['parts_list'])
            aftermarket_cost = case['total_parts_cost']
            savings = oem_cost - aftermarket_cost
            savings_percentage = (savings / oem_cost) * 100
            
            patterns.append({
                'claim_id': case['claim_id'],
                'vehicle_type': case['vehicle_make_model'],
                'parts_list': case['parts_list'],
                'oem_cost': oem_cost,
                'aftermarket_cost': aftermarket_cost,
                'savings': savings,
                'savings_percentage': savings_percentage,
                'insurer_approved': True
            })
        
        return patterns
    
    def _extract_repair_replace_patterns(self) -> List[Dict[str, Any]]:
        """Extract patterns for optimal repair vs replace decisions."""
        patterns = []
        
        for _, case in self.training_data.iterrows():
            for component in case['damage_components']:
                patterns.append({
                    'claim_id': case['claim_id'],
                    'component_name': component['name'],
                    'damage_severity': component['severity'],
                    'decision': component['repair_or_replace'],
                    'repair_cost': component.get('repair_cost'),
                    'replace_cost': component.get('replace_cost'),
                    'cost_ratio': component.get('repair_cost') / component.get('replace_cost') if component.get('replace_cost') else None,
                    'insurer_approved': case['claim_approved']
                })
        
        return patterns
```

### 6.2 Cost Estimation Model Retraining

**Cost Estimation Model Architecture:**

The cost estimation model uses a **multi-task learning approach** with three prediction heads:

1. **Parts Cost Prediction:** Regression model predicting total parts cost
2. **Labor Hours Prediction:** Regression model predicting total labor hours
3. **Total Cost Prediction:** Ensemble combining parts cost + labor hours predictions

**Retraining Process:**

```python
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.multioutput import MultiOutputRegressor

class CostEstimationModelRetrainer:
    def __init__(self, training_data: pd.DataFrame):
        self.training_data = training_data
    
    async def retrain_cost_model(self) -> Dict[str, Any]:
        """Retrain cost estimation model with new ground truth data."""
        
        # Prepare features
        X = self._prepare_features(self.training_data)
        
        # Prepare targets (multi-output: parts_cost, labor_hours, total_cost)
        y = self.training_data[['total_parts_cost', 'total_labor_hours', 'total_cost']]
        
        # Split data
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42
        )
        
        # Train multi-output model
        with mlflow.start_run(run_name='cost_estimation_retraining'):
            base_model = GradientBoostingRegressor(
                n_estimators=200,
                learning_rate=0.1,
                max_depth=5,
                loss='huber'  # Robust to outliers
            )
            
            model = MultiOutputRegressor(base_model)
            model.fit(X_train, y_train)
            
            # Evaluate model
            evaluator = ModelEvaluator(X_test, y_test)
            metrics = evaluator.evaluate_cost_estimation_model(model)
            
            # Log model
            mlflow.sklearn.log_model(model, 'cost_estimation_model')
            
            # Log metrics
            mlflow.log_metrics(metrics)
            
            return {
                'model': model,
                'metrics': metrics,
                'training_samples': len(X_train),
                'test_samples': len(X_test)
            }
    
    def _prepare_features(self, data: pd.DataFrame) -> pd.DataFrame:
        """Prepare features for cost estimation model."""
        features = pd.DataFrame()
        
        # Vehicle features
        features['vehicle_age'] = data['vehicle_age']
        features['vehicle_value'] = data['vehicle_value']
        features['vehicle_make_encoded'] = self._encode_categorical(data['vehicle_make'])
        features['vehicle_model_encoded'] = self._encode_categorical(data['vehicle_model'])
        
        # Damage features
        features['damage_severity_avg'] = data['damage_components'].apply(
            lambda comps: np.mean([c['severity'] for c in comps])
        )
        features['damaged_components_count'] = data['damage_components'].apply(len)
        features['replace_count'] = data['damage_components'].apply(
            lambda comps: sum(1 for c in comps if c['repair_or_replace'] == 'replace')
        )
        
        # Claim features
        features['claim_type_encoded'] = self._encode_categorical(data['claim_type'])
        
        return features
```

---

## 7. Data Anonymization Strategy

### 7.1 PII Removal

**Personally Identifiable Information (PII) Fields:**

| **Field** | **Anonymization Method** | **Example** |
|----------|-------------------------|------------|
| **Claimant Name** | Remove entirely | "John Smith" → [REMOVED] |
| **Phone Number** | Remove entirely | "+263 77 123 4567" → [REMOVED] |
| **Email Address** | Remove entirely | "john@example.com" → [REMOVED] |
| **VIN (Vehicle Identification Number)** | Hash with salt | "1HGBH41JXMN109186" → "a3f5b8c2..." |
| **License Plate** | Remove entirely | "ABC-1234" → [REMOVED] |
| **Street Address** | Remove, keep city/region only | "123 Main St, Harare" → "Harare" |
| **GPS Coordinates** | Fuzzing (round to 1km grid) | "-17.824858, 31.053028" → "-17.825, 31.053" |
| **Claim ID** | Hash with salt | "CLM-2024-00123" → "b7e9f2a1..." |

**Implementation:**

```python
import hashlib
import re
from typing import Dict, Any

class DataAnonymizer:
    def __init__(self, salt: str):
        self.salt = salt
    
    def anonymize(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Anonymize PII fields in ground truth data."""
        anonymized = data.copy()
        
        # Remove PII fields
        pii_fields = ['claimant_name', 'phone_number', 'email_address', 'license_plate', 'street_address']
        for field in pii_fields:
            if field in anonymized:
                anonymized[field] = '[REMOVED]'
        
        # Hash VIN
        if 'vin' in anonymized:
            anonymized['vin'] = self._hash_with_salt(anonymized['vin'])
        
        # Hash claim ID
        if 'claim_id' in anonymized:
            anonymized['claim_id'] = self._hash_with_salt(str(anonymized['claim_id']))
        
        # Fuzz GPS coordinates
        if 'gps_latitude' in anonymized and 'gps_longitude' in anonymized:
            anonymized['gps_latitude'] = round(anonymized['gps_latitude'], 3)  # ~111m precision
            anonymized['gps_longitude'] = round(anonymized['gps_longitude'], 3)
        
        # Keep only city/region from address
        if 'full_address' in anonymized:
            anonymized['city'] = self._extract_city(anonymized['full_address'])
            del anonymized['full_address']
        
        # Generalize timestamp (remove exact time, keep date only)
        if 'incident_timestamp' in anonymized:
            anonymized['incident_date'] = anonymized['incident_timestamp'].date()
            del anonymized['incident_timestamp']
        
        return anonymized
    
    def _hash_with_salt(self, value: str) -> str:
        """Hash value with salt using SHA-256."""
        salted_value = f"{value}{self.salt}"
        return hashlib.sha256(salted_value.encode()).hexdigest()[:16]
    
    def _extract_city(self, full_address: str) -> str:
        """Extract city from full address."""
        # Simple heuristic: assume city is last component before country
        parts = full_address.split(',')
        if len(parts) >= 2:
            return parts[-2].strip()
        return '[UNKNOWN]'
```

### 7.2 Differential Privacy

**Differential Privacy for Numeric Fields:**

To prevent re-identification through numeric field combinations, the system applies **differential privacy** by adding calibrated Laplace noise to sensitive numeric fields:

**Implementation:**

```python
import numpy as np

class DifferentialPrivacy:
    def __init__(self, epsilon: float = 1.0):
        """
        Initialize differential privacy with privacy budget epsilon.
        Lower epsilon = more privacy, more noise.
        Typical values: 0.1 (high privacy) to 10.0 (low privacy).
        """
        self.epsilon = epsilon
    
    def add_laplace_noise(self, value: float, sensitivity: float) -> float:
        """Add Laplace noise to numeric value."""
        scale = sensitivity / self.epsilon
        noise = np.random.laplace(0, scale)
        return value + noise
    
    def anonymize_cost_estimate(self, cost: float) -> float:
        """Add noise to cost estimate (sensitivity = $500)."""
        return self.add_laplace_noise(cost, sensitivity=500.0)
    
    def anonymize_vehicle_age(self, age: int) -> int:
        """Add noise to vehicle age (sensitivity = 1 year)."""
        noisy_age = self.add_laplace_noise(float(age), sensitivity=1.0)
        return max(0, int(round(noisy_age)))  # Ensure non-negative integer
```

### 7.3 K-Anonymity

**K-Anonymity Enforcement:**

The system ensures that each training example is **k-anonymous** (indistinguishable from at least k-1 other examples) by generalizing quasi-identifiers:

**Quasi-Identifiers:**
- Vehicle make/model
- Incident date
- City/region
- Claimant age bracket

**Generalization Strategy:**

| **Field** | **Original** | **Generalized (k=5)** |
|----------|-------------|----------------------|
| **Vehicle Make/Model** | "Toyota Corolla 2020" | "Toyota Sedan 2018-2022" |
| **Incident Date** | "2024-03-15" | "March 2024" |
| **City** | "Harare" | "Harare Province" |
| **Claimant Age** | 34 | "30-39" |

**Implementation:**

```python
class KAnonymityEnforcer:
    def __init__(self, k: int = 5):
        self.k = k
    
    def enforce_k_anonymity(self, dataset: pd.DataFrame) -> pd.DataFrame:
        """Generalize quasi-identifiers to ensure k-anonymity."""
        anonymized = dataset.copy()
        
        # Generalize vehicle make/model
        anonymized['vehicle_category'] = anonymized.apply(
            lambda row: self._generalize_vehicle(row['vehicle_make'], row['vehicle_model'], row['vehicle_year']),
            axis=1
        )
        
        # Generalize incident date to month
        anonymized['incident_month'] = anonymized['incident_date'].apply(
            lambda d: f"{d.year}-{d.month:02d}"
        )
        
        # Generalize city to province
        anonymized['province'] = anonymized['city'].apply(self._city_to_province)
        
        # Generalize age to bracket
        anonymized['age_bracket'] = anonymized['claimant_age'].apply(
            lambda age: f"{(age // 10) * 10}-{(age // 10) * 10 + 9}"
        )
        
        # Remove original quasi-identifiers
        anonymized = anonymized.drop(['vehicle_make', 'vehicle_model', 'vehicle_year', 'incident_date', 'city', 'claimant_age'], axis=1)
        
        # Verify k-anonymity
        quasi_identifiers = ['vehicle_category', 'incident_month', 'province', 'age_bracket']
        group_sizes = anonymized.groupby(quasi_identifiers).size()
        
        if (group_sizes < self.k).any():
            raise ValueError(f"K-anonymity violation: Some groups have fewer than {self.k} members")
        
        return anonymized
    
    def _generalize_vehicle(self, make: str, model: str, year: int) -> str:
        """Generalize vehicle to category."""
        # Simple heuristic: Make + Body Type + Year Range
        body_type = self._infer_body_type(model)
        year_range = f"{(year // 5) * 5}-{(year // 5) * 5 + 4}"
        return f"{make} {body_type} {year_range}"
    
    def _infer_body_type(self, model: str) -> str:
        """Infer body type from model name."""
        model_lower = model.lower()
        if any(kw in model_lower for kw in ['sedan', 'corolla', 'camry', 'accord']):
            return 'Sedan'
        elif any(kw in model_lower for kw in ['suv', 'rav4', 'crv', 'highlander']):
            return 'SUV'
        elif any(kw in model_lower for kw in ['truck', 'pickup', 'hilux', 'ranger']):
            return 'Truck'
        else:
            return 'Other'
```

---

## 8. Model Version Tracking

### 8.1 MLflow Integration

**MLflow Model Registry:**

The system uses **MLflow** for comprehensive model version tracking, experiment management, and model deployment:

**MLflow Components:**

| **Component** | **Purpose** | **Usage** |
|--------------|-----------|----------|
| **Tracking Server** | Log experiments, parameters, metrics, artifacts | Track all training runs |
| **Model Registry** | Centralized model store with versioning | Register production models |
| **Artifact Store** | Store model files, training data, plots | S3 bucket integration |
| **Backend Store** | Store experiment metadata | PostgreSQL database |

**Model Lifecycle Stages:**

| **Stage** | **Description** | **Promotion Criteria** |
|----------|----------------|----------------------|
| **None** | Newly trained model, not yet evaluated | N/A |
| **Staging** | Model passed evaluation, ready for A/B testing | Meets evaluation thresholds |
| **Production** | Model serving live traffic | Passed A/B test, approved by ML team |
| **Archived** | Deprecated model, no longer in use | Replaced by newer model |

**Implementation:**

```python
import mlflow
from mlflow.tracking import MlflowClient

class ModelVersionTracker:
    def __init__(self, tracking_uri: str, registry_uri: str):
        mlflow.set_tracking_uri(tracking_uri)
        mlflow.set_registry_uri(registry_uri)
        self.client = MlflowClient()
    
    def register_new_model_version(
        self,
        model_name: str,
        model,
        metrics: Dict[str, float],
        training_data_version: str
    ) -> str:
        """Register a new model version in MLflow."""
        
        with mlflow.start_run(run_name=f"{model_name}_training") as run:
            # Log model
            mlflow.sklearn.log_model(model, model_name)
            
            # Log metrics
            mlflow.log_metrics(metrics)
            
            # Log parameters
            mlflow.log_param('training_data_version', training_data_version)
            mlflow.log_param('training_date', datetime.now().isoformat())
            
            # Register model
            model_uri = f"runs:/{run.info.run_id}/{model_name}"
            model_version = mlflow.register_model(model_uri, model_name)
            
            return model_version.version
    
    def promote_model_to_staging(self, model_name: str, version: str):
        """Promote model version to Staging stage."""
        self.client.transition_model_version_stage(
            name=model_name,
            version=version,
            stage='Staging'
        )
    
    def promote_model_to_production(self, model_name: str, version: str):
        """Promote model version to Production stage."""
        # Archive current production model
        current_production_versions = self.client.get_latest_versions(
            model_name, stages=['Production']
        )
        for mv in current_production_versions:
            self.client.transition_model_version_stage(
                name=model_name,
                version=mv.version,
                stage='Archived'
            )
        
        # Promote new model to production
        self.client.transition_model_version_stage(
            name=model_name,
            version=version,
            stage='Production'
        )
    
    def get_production_model(self, model_name: str):
        """Load current production model."""
        model_uri = f"models:/{model_name}/Production"
        return mlflow.sklearn.load_model(model_uri)
```

### 8.2 Model Metadata

**Model Metadata Schema:**

Each model version is tracked with comprehensive metadata:

```python
@dataclass
class ModelMetadata:
    model_name: str
    version: str
    training_date: datetime
    training_data_version: str
    training_samples_count: int
    evaluation_metrics: Dict[str, float]
    hyperparameters: Dict[str, Any]
    feature_importance: Dict[str, float]
    deployment_date: Optional[datetime]
    deployment_status: str  # 'staging', 'production', 'archived'
    a_b_test_results: Optional[Dict[str, Any]]
    rollback_count: int
    performance_degradation_alerts: List[Dict[str, Any]]
```

---

## 9. Performance Monitoring Dashboards

### 9.1 Model Drift Dashboard

**Dashboard URL:** `/ml/monitoring/model-drift`

**Metrics Displayed:**

| **Metric** | **Visualization** | **Alert Threshold** |
|-----------|------------------|-------------------|
| **Data Drift Score** | Line chart (7-day rolling window) | >0.15 |
| **F1 Score Trend** | Line chart (daily) | <0.90 |
| **MAPE Trend** | Line chart (daily) | >10% |
| **AUC-ROC Trend** | Line chart (daily) | <0.85 |
| **Prediction Distribution** | Histogram (current vs baseline) | KS test p-value <0.05 |
| **Feature Drift Heatmap** | Heatmap showing drift by feature | Per-feature p-value <0.05 |

**Implementation:**

```typescript
// pages/ml/ModelDriftDashboard.tsx
export function ModelDriftDashboard() {
  const { data: driftMetrics } = trpc.ml.getDriftMetrics.useQuery({
    model_name: 'damage_scope_detection',
    lookback_days: 30
  });
  
  if (!driftMetrics) return <DashboardLayoutSkeleton />;
  
  return (
    <DashboardLayout>
      <div className="container py-8">
        <h1 className="text-3xl font-bold mb-2">Model Drift Monitoring</h1>
        <p className="text-muted-foreground mb-8">
          Real-time monitoring of model performance and data drift
        </p>
        
        {/* Alert Banner */}
        {driftMetrics.drift_detected && (
          <Alert variant="destructive" className="mb-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Drift Detected</AlertTitle>
            <AlertDescription>
              Data drift detected with score {driftMetrics.drift_score.toFixed(3)}.
              Model retraining has been triggered automatically.
            </AlertDescription>
          </Alert>
        )}
        
        {/* Metrics Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Data Drift Score</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-3xl font-bold ${driftMetrics.drift_score > 0.15 ? 'text-red-600' : 'text-green-600'}`}>
                {driftMetrics.drift_score.toFixed(3)}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Threshold: 0.150
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">F1 Score (7-day avg)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-3xl font-bold ${driftMetrics.avg_f1_score < 0.90 ? 'text-red-600' : 'text-green-600'}`}>
                {(driftMetrics.avg_f1_score * 100).toFixed(1)}%
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Threshold: 90%
              </p>
            </CardContent>
          </Card>
          
          {/* Additional metrics cards */}
        </div>
        
        {/* Drift Trend Chart */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Drift Score Trend (30 days)</CardTitle>
          </CardHeader>
          <CardContent>
            <LineChart data={driftMetrics.drift_history} />
          </CardContent>
        </Card>
        
        {/* Feature Drift Heatmap */}
        <Card>
          <CardHeader>
            <CardTitle>Feature Drift Heatmap</CardTitle>
          </CardHeader>
          <CardContent>
            <HeatmapChart data={driftMetrics.feature_drift_scores} />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
```

### 9.2 Model Performance Dashboard

**Dashboard URL:** `/ml/monitoring/model-performance`

**Metrics Displayed:**

| **Metric** | **Visualization** | **Breakdown** |
|-----------|------------------|--------------|
| **Prediction Accuracy** | Line chart (daily) | By claim type, by assessor tier |
| **Inference Latency** | Histogram | P50, P95, P99 percentiles |
| **Error Rate** | Line chart (daily) | By error type (timeout, validation, model error) |
| **Throughput** | Line chart (hourly) | Predictions per second |
| **Model Version Distribution** | Pie chart | % of traffic per model version (during canary deployment) |

### 9.3 Training Pipeline Dashboard

**Dashboard URL:** `/ml/monitoring/training-pipeline`

**Metrics Displayed:**

| **Metric** | **Visualization** | **Details** |
|-----------|------------------|-----------|
| **Training Data Volume** | Bar chart (monthly) | New ground truth examples ingested |
| **Label Quality Score** | Line chart (weekly) | % of labels passing validation |
| **Retraining Frequency** | Timeline | Retraining events with trigger reasons |
| **Model Evaluation Results** | Table | Latest model versions with metrics |
| **A/B Test Results** | Comparison table | Staging vs Production model performance |

---

## 10. Implementation Checklist

### 10.1 Data Pipeline

- [ ] Implement ground truth extraction SQL queries
- [ ] Implement data anonymization (PII removal, differential privacy, k-anonymity)
- [ ] Implement label validation checks (damage scope, cost, fraud)
- [ ] Implement outlier detection algorithms
- [ ] Implement batch ingestion cron job (daily at 02:00 UTC)
- [ ] Implement real-time ingestion via Kafka event listener
- [ ] Create Parquet storage structure in S3

### 10.2 Model Training

- [ ] Implement drift detection algorithms (data drift, concept drift)
- [ ] Implement retraining trigger logic
- [ ] Implement damage scope detection model retraining
- [ ] Implement cost estimation model retraining
- [ ] Implement fraud detection model retraining
- [ ] Implement model evaluation pipeline
- [ ] Integrate MLflow for experiment tracking

### 10.3 Model Deployment

- [ ] Set up MLflow Model Registry
- [ ] Implement model version tracking
- [ ] Implement canary deployment strategy (5% → 25% → 50% → 100%)
- [ ] Implement automated rollback on performance degradation
- [ ] Implement A/B testing framework
- [ ] Create model deployment approval workflow

### 10.4 Monitoring

- [ ] Build model drift monitoring dashboard
- [ ] Build model performance monitoring dashboard
- [ ] Build training pipeline monitoring dashboard
- [ ] Implement real-time alerting (Slack/email notifications)
- [ ] Implement automated incident response (rollback, retraining)

### 10.5 Testing

- [ ] Unit tests for data anonymization
- [ ] Unit tests for label validation
- [ ] Unit tests for drift detection
- [ ] Integration tests for end-to-end training pipeline
- [ ] Load testing for batch ingestion (10,000+ reports)
- [ ] Validation of k-anonymity enforcement

---

## 11. Conclusion

The **Continuous Learning Feedback Pipeline** establishes a production-ready framework for transforming approved assessor reports into ground truth training data that continuously improves AI model accuracy. The architecture implements privacy-preserving machine learning through comprehensive data anonymization (PII removal, differential privacy, k-anonymity), ensuring compliance with POPIA, GDPR, and insurance industry regulations.

**Key Design Achievements:**

**Ground Truth Extraction Pipeline:** Automated daily batch ingestion processing 10,000+ approved reports per month with strict eligibility criteria (approved claims, Tier 0-2 reconciliation, Proficient+ assessors, 95%+ data completeness, 5+ photos).

**Label Validation Process:** Multi-stage quality checks including component consistency verification, cost reasonableness validation, fraud label alignment, and statistical outlier detection with manual review queue for flagged cases.

**AI Retraining Triggers:** Automated drift detection monitoring data drift (KL divergence >0.15), concept drift (F1 score degradation >5%), and prediction drift (KS test p-value <0.05), with retraining triggered weekly or when thresholds exceeded.

**Model Evaluation Metrics:** Comprehensive evaluation across three learning objectives: damage scope detection (F1 score target 0.92+), cost estimation (MAPE target <8%), and fraud detection (AUC-ROC target 0.88+).

**Fraud Pattern Learning:** Dedicated fraud pattern extraction pipeline identifying pre-existing damage, staged accidents, inflated claims, document fraud, and behavioral patterns, feeding two-stage ensemble classifier (CV + NLP + Tabular → XGBoost).

**Cost Optimization Learning:** Pattern extraction for aftermarket parts usage (30-50% savings), repair vs replace optimization (40-60% savings), labor efficiency, and paint strategy optimization, feeding multi-task regression model.

**Data Anonymization:** Privacy-preserving ML through PII removal (name, phone, email, VIN, license plate), differential privacy (Laplace noise on numeric fields), and k-anonymity enforcement (k=5) with quasi-identifier generalization.

**Model Version Tracking:** MLflow integration with model registry, experiment tracking, artifact storage, and lifecycle management (None → Staging → Production → Archived) with comprehensive metadata tracking.

**Performance Monitoring:** Real-time dashboards for model drift detection, performance metrics, and training pipeline health with automated alerting and incident response.

The pipeline is ready for implementation following the provided checklist, with clear integration points to the existing Assessor Ecosystem Architecture (KINGA-AEA-2026-018), Workflow Lifecycle (KINGA-AWL-2026-019), and Premium Monetization Architecture (KINGA-PMA-2026-020).

---

**End of Document**
