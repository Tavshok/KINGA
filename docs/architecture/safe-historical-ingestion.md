# Safe Historical Claims Ingestion Architecture

**Document Version:** 1.0  
**Last Updated:** February 13, 2026  
**Status:** Active

---

## Executive Summary

The Safe Historical Claims Ingestion system provides a controlled pipeline for importing legacy insurance claims data while preventing biased or low-quality data from degrading AI model performance. The architecture implements multi-stage validation, confidence scoring, human-in-the-loop approval, and strict dataset separation to ensure only high-quality claims are used for machine learning training.

---

## System Architecture Overview

### Core Principles

1. **Quality Over Quantity** - Only claims meeting confidence thresholds enter the training dataset
2. **Human Oversight** - Critical decisions require manual approval
3. **Dataset Separation** - Training data and reference data are strictly isolated
4. **Full Auditability** - Every decision is logged and traceable
5. **Bias Prevention** - Automated detection of anomalies and bias risks

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    INGESTION SOURCES                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ZIP Batch │  │Individual│  │  API     │  │  Email   │       │
│  │  Upload  │  │  Upload  │  │ Import   │  │ Forward  │       │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘       │
└───────┼─────────────┼─────────────┼─────────────┼──────────────┘
        │             │             │             │
        └─────────────┴─────────────┴─────────────┘
                      │
        ┌─────────────▼──────────────┐
        │  STAGE 1: DOCUMENT GROUPING │
        │  - Group by claim reference │
        │  - Validate completeness    │
        │  - Create claim record      │
        └─────────────┬───────────────┘
                      │
        ┌─────────────▼──────────────┐
        │  STAGE 2: OCR + EXTRACTION  │
        │  - OCR for scanned docs     │
        │  - LLM-assisted extraction  │
        │  - Structured data output   │
        └─────────────┬───────────────┘
                      │
        ┌─────────────▼──────────────┐
        │  STAGE 3: FEATURE ENGINEERING│
        │  - Damage features          │
        │  - Cost features            │
        │  - Fraud indicators         │
        │  - Assessor narratives      │
        └─────────────┬───────────────┘
                      │
        ┌─────────────▼──────────────┐
        │  STAGE 4: METADATA TAGGING  │
        │  - Country, insurer, year   │
        │  - Currency, vehicle class  │
        │  - Claim type               │
        └─────────────┬───────────────┘
                      │
        ┌─────────────▼──────────────┐
        │  STAGE 5: CONFIDENCE SCORING│
        │  - 8 component scores       │
        │  - Overall score (0-100)    │
        │  - Category: HIGH/MED/LOW   │
        └─────────────┬───────────────┘
                      │
        ┌─────────────▼──────────────┐
        │  STAGE 6: ANOMALY DETECTION │
        │  - Statistical outliers     │
        │  - Bias risk detection      │
        │  - Completeness validation  │
        └─────────────┬───────────────┘
                      │
              ┌───────┴───────┐
              │               │
    ┌─────────▼────┐   ┌─────▼──────────┐
    │  HIGH SCORE  │   │ MEDIUM/LOW     │
    │  Auto-approve│   │ Manual Review  │
    └─────────┬────┘   └─────┬──────────┘
              │               │
              │      ┌────────▼────────┐
              │      │  REVIEW QUEUE   │
              │      │  Human Approval │
              │      └────────┬────────┘
              │               │
              └───────┬───────┘
                      │
          ┌───────────▼───────────┐
          │  DATASET SEPARATION   │
          └───────────┬───────────┘
                      │
          ┌───────────┴───────────┐
          │                       │
  ┌───────▼──────┐      ┌────────▼─────────┐
  │   TRAINING   │      │    REFERENCE     │
  │   DATASET    │      │     DATASET      │
  │ (AI Learning)│      │  (Benchmarking)  │
  └──────────────┘      └──────────────────┘
```

---

## Component Specifications

### 1. Document Ingestion Pipeline

**Purpose:** Accept and process historical claims from multiple sources

**Supported Formats:**
- PDF claim files
- Panel beater quotes (PDF, Word, Excel)
- Police reports (PDF, scanned images)
- Damage images (JPEG, PNG, HEIC)
- Handwritten notes (scanned images)

**Batch Upload Structure:**
```
batch-2026-02-13.zip
├── claim-001/
│   ├── assessor-report.pdf
│   ├── damage-photo-1.jpg
│   ├── damage-photo-2.jpg
│   ├── panel-beater-quote.pdf
│   └── police-report.pdf
├── claim-002/
│   ├── assessor-report.pdf
│   └── damage-photos/
│       ├── front.jpg
│       ├── rear.jpg
│       └── side.jpg
└── claim-003/
    └── ...
```

**Processing Steps:**
1. Extract ZIP archive
2. Group documents by claim folder
3. Upload each document to S3
4. Calculate SHA-256 hash for integrity
5. Create database records
6. Trigger extraction pipeline

### 2. OCR + LLM Extraction Engine

**Purpose:** Extract structured data from unstructured documents

**Extraction Targets:**

**Vehicle Information:**
- Make, model, year
- Registration number
- VIN (if available)
- Color, mass

**Incident Details:**
- Date and time
- Location (GPS coordinates if available)
- Description/narrative
- Accident type classification

**Damage Assessment:**
- Damaged components list
- Severity classification
- Repair vs. total loss decision

**Cost Information:**
- Panel beater quote amounts
- Assessor estimate
- Final approved cost
- Parts vs. labor breakdown

**Claimant Information:**
- Name, ID number
- Contact details
- Policy number

**Assessor Information:**
- Name, license number
- Observations and recommendations

**LLM Prompt Strategy:**
```
System: You are a data extraction specialist for insurance claims.

User: Extract structured data from the following claim documents:
- assessor-report.pdf (assessor_report)
- damage-photo-1.jpg (damage_photo)
- panel-beater-quote.pdf (repair_quote)

Output JSON with the following schema:
{
  "vehicleMake": string | null,
  "vehicleModel": string | null,
  ...
}
```

**Confidence Tracking:**
- OCR confidence per document (0-100%)
- Extraction confidence per field (0-100%)
- Overall extraction confidence

### 3. Feature Engineering Pipeline

**Purpose:** Transform raw data into ML-ready features

**Damage Features:**
```json
{
  "damagedComponents": [
    "front_bumper",
    "hood",
    "right_headlight",
    "right_fender"
  ],
  "severityScore": 65,
  "severityCategory": "moderate",
  "impactType": "front_collision",
  "estimatedSpeed": 45,
  "structuralDamage": false,
  "airbagDeployment": false
}
```

**Cost Features:**
```json
{
  "partsCost": 15000,
  "laborCost": 8000,
  "paintCost": 5000,
  "totalCost": 28000,
  "laborHours": 16,
  "laborRate": 500,
  "partsQuality": "oem",
  "bettermentAmount": 2000
}
```

**Fraud Indicators:**
```json
{
  "riskScore": 35,
  "riskCategory": "low",
  "flags": [
    "multiple_claims_same_vehicle",
    "quote_significantly_above_market"
  ],
  "claimantHistoryRisk": 20,
  "vehicleHistoryRisk": 15,
  "documentConsistencyRisk": 10
}
```

**Assessor Narrative Features:**
```json
{
  "sentimentScore": 0.8,
  "confidenceLevel": "high",
  "keyPhrases": [
    "consistent with reported incident",
    "no pre-existing damage observed"
  ],
  "recommendedAction": "approve_repair"
}
```

### 4. Metadata Tagging System

**Required Metadata Fields:**

| Field | Type | Required | Purpose |
|-------|------|----------|---------|
| country | string | Yes | Geographic bias detection |
| insurer | string | Yes | Insurer-specific bias detection |
| claimYear | integer | Yes | Temporal drift detection |
| currency | string | Yes | Cost normalization |
| vehicleClass | string | No | Segmentation |
| claimType | enum | No | Model specialization |

**Metadata Validation Rules:**
- Country must be ISO 3166-1 alpha-2 code
- Claim year must be between 2000 and current year
- Currency must be ISO 4217 code
- Vehicle class from predefined taxonomy

---

## Training Data Confidence Scoring

### Scoring Algorithm

**Overall Score Calculation:**
```
training_confidence_score = weighted_average([
  assessor_report_score * 0.25,
  supporting_photos_score * 0.20,
  panel_beater_quotes_score * 0.15,
  evidence_completeness_score * 0.15,
  handwritten_adjustments_score * 0.10,
  fraud_markers_score * 0.05,
  dispute_history_score * 0.05,
  competing_quotes_score * 0.05
])
```

**Component Scoring Logic:**

**1. Assessor Report Score (0-100)**
- Has assessor report: +50
- Report > 500 words: +20
- Contains damage photos: +15
- Contains cost breakdown: +15
- Missing: 0

**2. Supporting Photos Score (0-100)**
- 0 photos: 0
- 1-2 photos: 30
- 3-5 photos: 60
- 6-10 photos: 85
- 11+ photos: 100

**3. Panel Beater Quotes Score (0-100)**
- 0 quotes: 0
- 1 quote: 50
- 2 quotes: 80
- 3+ quotes: 100

**4. Evidence Completeness Score (0-100)**
```
completeness = (fields_populated / total_fields) * 100
```

**5. Handwritten Adjustments Score (0-100)**
- No handwritten notes: 100
- Handwritten notes present: 60
- Multiple handwritten adjustments: 30

**6. Fraud Markers Score (0-100)**
```
fraud_score = 100 - (fraud_risk_score)
```

**7. Dispute History Score (0-100)**
- No dispute: 100
- Dispute resolved in favor: 70
- Dispute unresolved: 40
- Dispute resolved against: 0

**8. Competing Quotes Score (0-100)**
- 0-1 quotes: 50
- 2 quotes: 80
- 3+ quotes: 100

### Confidence Categories

| Category | Score Range | Action |
|----------|-------------|--------|
| HIGH | 80-100 | Auto-approve for training |
| MEDIUM | 50-79 | Manual review required |
| LOW | 0-49 | Reject or extensive review |

---

## Anomaly and Bias Detection

### Statistical Anomaly Detection

**Outlier Detection Methods:**
1. **Cost Outliers** - Claims with costs > 3 standard deviations from mean
2. **Time Outliers** - Processing times significantly different from average
3. **Feature Outliers** - Unusual combinations of damage features

**Anomaly Flags:**
- `cost_anomaly` - Cost significantly above/below expected
- `time_anomaly` - Unusual processing duration
- `feature_anomaly` - Inconsistent damage-cost relationship

### Bias Risk Detection

**Bias Categories:**

**Geographic Bias:**
- Over-representation of specific regions
- Systematic cost differences by location

**Temporal Bias:**
- Claims clustered in specific time periods
- Currency inflation not accounted for

**Insurer Bias:**
- Single insurer dominance (>30% of dataset)
- Systematic assessment differences between insurers

**Vehicle Class Bias:**
- Under-representation of certain vehicle types
- Luxury vs. economy vehicle imbalance

**Bias Mitigation Strategies:**
1. **Stratified Sampling** - Ensure balanced representation
2. **Normalization** - Adjust for currency, inflation, regional costs
3. **Threshold Limits** - Cap maximum percentage from single source
4. **Diversity Scoring** - Reward diverse claim characteristics

---

## Dataset Separation Strategy

### Training Dataset

**Inclusion Criteria:**
- Confidence score ≥ 80 (HIGH category)
- OR Manual approval after review
- AND No critical anomalies detected
- AND No high bias risk

**Usage:**
- AI model training only
- Feature learning
- Pattern recognition

**Versioning:**
- Each training run creates a new dataset version
- Version format: `v1.0.0`, `v1.1.0`, etc.
- Major version: Significant data additions/changes
- Minor version: Small additions
- Patch version: Corrections/removals

### Reference Dataset

**Inclusion Criteria:**
- ALL claims, regardless of quality
- Includes rejected training claims

**Usage:**
- Benchmarking model performance
- Analytics and reporting
- Audit and compliance
- NEVER for direct model training

**Benefits:**
- Complete historical record
- Trend analysis across all data
- Quality comparison metrics

---

## Human-in-the-Loop Approval Workflow

### Three-Level Validation

**Level 1: Automated Validation**
- Confidence score calculation
- Anomaly detection
- Bias risk assessment
- Completeness check

**Decision:**
- Score ≥ 80 → Auto-approve to training dataset
- Score 50-79 → Route to Level 2
- Score < 50 → Route to Level 3 or reject

**Level 2: Borderline Review**
- Claims with MEDIUM confidence (50-79)
- Automated flags for human attention
- Quick review queue

**Reviewer Actions:**
- Approve → Training dataset
- Reject → Reference dataset only
- Request more info → Back to extraction

**Level 3: Admin Approval**
- Claims with LOW confidence (< 50)
- Claims with critical anomalies
- Claims with high bias risk

**Approval Requirements:**
- Senior reviewer or data scientist
- Detailed justification required
- Can override automated decisions

### Review Queue UI

**Queue Prioritization:**
1. High-value claims (high cost, rare vehicle types)
2. Borderline HIGH/MEDIUM scores (75-85 range)
3. Claims with single missing critical field
4. Oldest pending claims

**Review Interface Features:**
- Side-by-side document viewer
- Confidence score breakdown
- Anomaly/bias flags highlighted
- Historical context (similar claims)
- One-click approve/reject
- Bulk actions for similar claims

---

## Model Version Governance

### Model Lifecycle States

```
training → validation → staging → production
                ↓
            deprecated → archived
```

**State Definitions:**

**Training:**
- Model being trained on dataset
- Not accessible for predictions

**Validation:**
- Training complete
- Undergoing accuracy/bias testing

**Staging:**
- Validation passed
- Available for A/B testing
- Limited production traffic

**Production:**
- Fully deployed
- Serving all prediction requests
- Frozen (no retraining)

**Deprecated:**
- Replaced by newer version
- Available for rollback
- Not actively serving

**Archived:**
- Historical record only
- Not available for deployment

### Deployment Requirements

**Pre-Deployment Checklist:**
- [ ] Accuracy score ≥ baseline
- [ ] Bias drift validation passed
- [ ] Fraud detection stability confirmed
- [ ] Performance benchmark met
- [ ] Manual approval obtained
- [ ] Rollback plan documented

**Approval Workflow:**
1. Data scientist submits deployment request
2. Automated validation tests run
3. Results reviewed by ML lead
4. Approval/rejection decision
5. If approved, deploy to staging
6. Monitor for 48 hours
7. Final approval for production

### Model Audit Trail

**Logged Events:**
- Training started/completed/failed
- Validation results
- Deployment requests
- Approval decisions
- Production deployments
- Model deprecations
- Dataset additions/removals

**Audit Log Fields:**
- Event type
- Timestamp
- Performed by (user ID)
- Model version
- Event metadata (JSON)
- IP address

---

## Safety Rules and Enforcement

### Mandatory Safety Rules

1. **No Automatic Retraining**
   - Production models remain frozen
   - Retraining requires explicit approval
   - Training occurs in isolated environment

2. **Low Confidence Exclusion**
   - Claims with score < 50 excluded by default
   - Override requires admin approval + justification

3. **Mandatory Metadata**
   - Country, insurer, year, currency required
   - Claims missing metadata rejected

4. **Full Audit Logging**
   - Every dataset addition logged
   - Every approval decision logged
   - Every model deployment logged

5. **Multi-Tenant Isolation**
   - Training data segregated by tenant
   - No cross-tenant data leakage
   - Tenant-specific models

### Enforcement Mechanisms

**Database Constraints:**
- Foreign key constraints prevent orphaned records
- NOT NULL constraints on critical fields
- CHECK constraints on score ranges

**Application Logic:**
- Pre-insert validation
- Transaction rollback on rule violations
- Error logging and alerting

**Access Controls:**
- Role-based permissions
- Admin-only functions for overrides
- Audit trail for all privileged actions

---

## Monitoring and Observability

### Key Metrics

**Ingestion Metrics:**
- Claims ingested per day
- Documents processed per hour
- Extraction success rate
- OCR confidence distribution

**Quality Metrics:**
- Training confidence score distribution
- Anomaly detection rate
- Bias risk detection rate
- Manual review approval rate

**Dataset Metrics:**
- Training dataset size
- Reference dataset size
- Dataset diversity scores
- Geographic/temporal distribution

**Model Metrics:**
- Training duration
- Validation accuracy
- Production prediction latency
- Model drift indicators

### Alerting Rules

**Critical Alerts:**
- Ingestion failure rate > 10%
- Extraction confidence < 70% average
- Bias risk detected in > 5% of claims
- Model accuracy drops > 5%

**Warning Alerts:**
- Review queue backlog > 100 claims
- Single insurer > 30% of new claims
- Extraction taking > 5 minutes per claim

---

## Future Enhancements

### Phase 2 Capabilities

1. **Continuous Learning Pipeline**
   - Automated retraining on schedule
   - A/B testing framework
   - Gradual rollout mechanism

2. **Advanced Extraction**
   - Multi-language OCR
   - Handwriting recognition
   - Table extraction from PDFs

3. **Enhanced Governance**
   - Explainability reports
   - Fairness metrics
   - Regulatory compliance reports

4. **Integration Enhancements**
   - Real-time ingestion API
   - Email-to-claim automation
   - Third-party data enrichment

---

## Appendix

### Database Schema Summary

**Core Tables:**
- `ingestionBatches` - Batch upload tracking
- `historicalClaims` - Master claim records
- `ingestionDocuments` - Document storage
- `trainingDataScores` - Confidence scores
- `claimReviewQueue` - Manual review workflow
- `trainingDataset` - Approved training claims
- `referenceDataset` - All claims for benchmarking
- `modelVersionRegistry` - Model lifecycle tracking
- `modelTrainingAuditLog` - Full audit trail

### API Endpoints

**Ingestion:**
- `POST /api/ml/ingest/batch` - Upload ZIP batch
- `POST /api/ml/ingest/claim` - Upload individual claim
- `GET /api/ml/ingest/status/:batchId` - Check batch status

**Review:**
- `GET /api/ml/review/queue` - Get pending reviews
- `POST /api/ml/review/approve/:claimId` - Approve claim
- `POST /api/ml/review/reject/:claimId` - Reject claim

**Datasets:**
- `GET /api/ml/datasets/training` - List training dataset
- `GET /api/ml/datasets/reference` - List reference dataset
- `GET /api/ml/datasets/stats` - Dataset statistics

**Models:**
- `GET /api/ml/models` - List all model versions
- `POST /api/ml/models/deploy/:versionId` - Deploy model
- `GET /api/ml/models/audit/:versionId` - Get audit log

---

**Document Control:**
- Version: 1.0
- Author: KINGA AI Team
- Approved By: [Pending]
- Next Review: March 13, 2026
