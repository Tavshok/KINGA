# KINGA Training Data Governance Framework

**Document Version:** 1.0  
**Last Updated:** February 13, 2026  
**Classification:** Internal Use Only

---

## Purpose and Scope

This document establishes the governance framework for managing training data used in KINGA's AI-powered insurance claims assessment system. It defines policies, procedures, and controls to ensure training data quality, prevent model degradation, and maintain ethical AI practices.

**In Scope:**
- Historical claims data ingestion
- Training dataset composition and quality
- Model training approval workflows
- Bias detection and mitigation
- Audit and compliance requirements

**Out of Scope:**
- Production model deployment (covered in separate document)
- Real-time claims processing
- Customer data privacy (covered in Data Protection Policy)

---

## Governance Principles

### 1. Quality First

Training data quality directly impacts model accuracy and fairness. We prioritize:
- **Completeness** - Claims with comprehensive documentation
- **Accuracy** - Verified and validated data
- **Consistency** - Standardized formats and classifications
- **Relevance** - Data representative of current claims landscape

### 2. Human Oversight

Critical decisions require human judgment:
- **Borderline Cases** - Manual review for medium-confidence claims
- **Anomalies** - Human investigation of statistical outliers
- **Bias Risks** - Expert review of potential bias sources
- **Model Approval** - Senior approval for production deployment

### 3. Transparency and Auditability

All decisions must be traceable:
- **Full Audit Logs** - Every action logged with timestamp and user
- **Decision Justifications** - Documented reasons for approvals/rejections
- **Version Control** - Complete history of dataset changes
- **Explainability** - Clear documentation of model behavior

### 4. Continuous Improvement

Governance evolves with experience:
- **Regular Reviews** - Quarterly policy assessments
- **Feedback Loops** - Incorporate learnings from production
- **Metric Tracking** - Monitor governance effectiveness
- **Stakeholder Input** - Engage assessors, underwriters, data scientists

---

## Roles and Responsibilities

### Data Governance Committee

**Composition:**
- Chief Data Officer (Chair)
- Head of Claims
- Lead Data Scientist
- Compliance Officer
- IT Security Representative

**Responsibilities:**
- Approve governance policies
- Review quarterly metrics
- Investigate major incidents
- Authorize policy exceptions

**Meeting Frequency:** Quarterly (minimum)

### Data Scientist

**Responsibilities:**
- Design confidence scoring algorithms
- Develop bias detection methods
- Train and validate models
- Submit deployment requests
- Monitor model performance

**Authorities:**
- Approve HIGH confidence claims (auto-approval)
- Reject LOW confidence claims
- Request manual reviews for borderline cases

### Data Quality Reviewer

**Responsibilities:**
- Review MEDIUM confidence claims (50-79 score)
- Investigate flagged anomalies
- Approve/reject claims for training dataset
- Document review decisions

**Authorities:**
- Approve claims with score 50-79
- Request additional information
- Escalate to Senior Reviewer

### Senior Data Reviewer

**Responsibilities:**
- Review LOW confidence claims (< 50 score)
- Approve policy exceptions
- Investigate bias incidents
- Final approval for contentious cases

**Authorities:**
- Override automated decisions
- Approve claims with score < 50
- Remove claims from training dataset
- Approve model deployments

### System Administrator

**Responsibilities:**
- Maintain ingestion infrastructure
- Monitor system health
- Manage user access
- Generate audit reports

**Authorities:**
- Grant/revoke user permissions
- Execute emergency rollbacks
- Access audit logs

---

## Training Data Lifecycle

### Stage 1: Ingestion

**Entry Criteria:**
- Claim documents uploaded (batch or individual)
- Minimum required documents present
- Valid claim reference number

**Process:**
1. Upload to secure S3 storage
2. Calculate SHA-256 hash for integrity
3. Create database records
4. Trigger extraction pipeline

**Quality Gates:**
- File format validation
- Virus scanning
- Duplicate detection

**Responsibilities:** System Administrator (automated)

### Stage 2: Extraction

**Entry Criteria:**
- Documents successfully ingested
- OCR/LLM services available

**Process:**
1. OCR for scanned documents
2. LLM-assisted data extraction
3. Feature engineering
4. Metadata tagging

**Quality Gates:**
- OCR confidence > 70%
- Extraction completeness > 60%
- Required fields populated

**Responsibilities:** Data Scientist (automated with monitoring)

### Stage 3: Confidence Scoring

**Entry Criteria:**
- Extraction completed
- Features engineered

**Process:**
1. Calculate 8 component scores
2. Compute weighted overall score
3. Assign confidence category (HIGH/MEDIUM/LOW)
4. Flag anomalies and bias risks

**Quality Gates:**
- All score components calculated
- Category assignment validated

**Responsibilities:** Data Scientist (automated)

**Decision Matrix:**

| Score Range | Category | Action | Approver |
|-------------|----------|--------|----------|
| 80-100 | HIGH | Auto-approve to training | System |
| 50-79 | MEDIUM | Manual review required | Data Quality Reviewer |
| 0-49 | LOW | Extensive review or reject | Senior Data Reviewer |

### Stage 4: Review and Approval

**Entry Criteria:**
- Confidence score calculated
- Category assigned

**Process for MEDIUM Confidence (50-79):**
1. Claim added to review queue
2. Data Quality Reviewer inspects documents
3. Reviewer checks score breakdown
4. Reviewer makes decision:
   - **Approve** → Training dataset
   - **Reject** → Reference dataset only
   - **Request Info** → Back to extraction

**Process for LOW Confidence (< 50):**
1. Claim flagged for senior review
2. Senior Data Reviewer investigates
3. Detailed justification required for approval
4. Decision logged in audit trail

**Quality Gates:**
- Review completed within 5 business days
- Decision justification documented
- Approval authority verified

**Responsibilities:** 
- MEDIUM: Data Quality Reviewer
- LOW: Senior Data Reviewer

### Stage 5: Dataset Inclusion

**Entry Criteria:**
- Claim approved (auto or manual)
- No critical anomalies
- Bias risk acceptable

**Process:**
1. Add to appropriate dataset:
   - **Training Dataset** - Approved claims only
   - **Reference Dataset** - All claims
2. Update dataset version metadata
3. Log inclusion event
4. Trigger dataset statistics recalculation

**Quality Gates:**
- Dataset diversity thresholds met
- No single source > 30% of dataset
- Geographic distribution balanced

**Responsibilities:** System (automated with oversight)

### Stage 6: Model Training

**Entry Criteria:**
- Training dataset version finalized
- Minimum dataset size met (500 claims)
- Dataset diversity validated

**Process:**
1. Data Scientist submits training request
2. Automated validation checks run
3. Training job executed in isolated environment
4. Validation metrics calculated
5. Results reviewed by Data Scientist

**Quality Gates:**
- Accuracy ≥ baseline model
- Bias drift within acceptable limits
- No critical errors during training

**Responsibilities:** Data Scientist

### Stage 7: Model Deployment

**Entry Criteria:**
- Model training completed successfully
- Validation metrics meet thresholds
- Deployment request submitted

**Process:**
1. Senior Data Reviewer reviews metrics
2. Bias and fairness assessment
3. Approval/rejection decision
4. If approved, deploy to staging
5. Monitor for 48 hours
6. Final production deployment

**Quality Gates:**
- Accuracy ≥ production baseline
- Bias metrics within policy limits
- Performance benchmarks met
- Manual approval obtained

**Responsibilities:** Senior Data Reviewer (approval), System Administrator (deployment)

---

## Confidence Scoring Methodology

### Component Scores

**1. Assessor Report Score (Weight: 25%)**

| Condition | Score |
|-----------|-------|
| No assessor report | 0 |
| Report present, < 200 words | 30 |
| Report 200-500 words | 50 |
| Report > 500 words | 70 |
| + Contains damage photos | +15 |
| + Contains cost breakdown | +15 |

**2. Supporting Photos Score (Weight: 20%)**

| Photo Count | Score |
|-------------|-------|
| 0 | 0 |
| 1-2 | 30 |
| 3-5 | 60 |
| 6-10 | 85 |
| 11+ | 100 |

**3. Panel Beater Quotes Score (Weight: 15%)**

| Quote Count | Score |
|-------------|-------|
| 0 | 0 |
| 1 | 50 |
| 2 | 80 |
| 3+ | 100 |

**4. Evidence Completeness Score (Weight: 15%)**

```
score = (populated_fields / total_required_fields) * 100
```

Required fields:
- Vehicle make, model, year
- Incident date, location
- Claimant name, contact
- Damage description
- Cost estimate

**5. Handwritten Adjustments Score (Weight: 10%)**

| Condition | Score |
|-----------|-------|
| No handwritten notes | 100 |
| 1-2 handwritten notes | 60 |
| 3+ handwritten notes | 30 |

*Rationale: Handwritten adjustments may indicate uncertainty or disputes*

**6. Fraud Markers Score (Weight: 5%)**

```
score = 100 - fraud_risk_score
```

Fraud risk calculated from:
- Multiple claims same vehicle
- Claimant claim frequency
- Cost significantly above market
- Inconsistent damage patterns

**7. Dispute History Score (Weight: 5%)**

| Condition | Score |
|-----------|-------|
| No dispute | 100 |
| Dispute resolved in favor | 70 |
| Dispute unresolved | 40 |
| Dispute resolved against | 0 |

**8. Competing Quotes Score (Weight: 5%)**

| Quote Count | Score |
|-------------|-------|
| 0-1 | 50 |
| 2 | 80 |
| 3+ | 100 |

### Overall Score Calculation

```python
overall_score = (
    assessor_report_score * 0.25 +
    supporting_photos_score * 0.20 +
    panel_beater_quotes_score * 0.15 +
    evidence_completeness_score * 0.15 +
    handwritten_adjustments_score * 0.10 +
    fraud_markers_score * 0.05 +
    dispute_history_score * 0.05 +
    competing_quotes_score * 0.05
)
```

### Category Assignment

```python
if overall_score >= 80:
    category = "HIGH"
    action = "auto_approve"
elif overall_score >= 50:
    category = "MEDIUM"
    action = "manual_review"
else:
    category = "LOW"
    action = "extensive_review_or_reject"
```

---

## Bias Detection and Mitigation

### Bias Categories

**1. Geographic Bias**

**Detection:**
- Calculate percentage of claims from each region
- Flag if any region > 40% of dataset
- Compare cost distributions across regions

**Mitigation:**
- Cap maximum percentage from single region (30%)
- Normalize costs by regional cost-of-living index
- Stratified sampling to ensure balance

**2. Temporal Bias**

**Detection:**
- Analyze claim year distribution
- Check for currency inflation adjustment
- Identify clustering in specific time periods

**Mitigation:**
- Require claims from minimum 3 different years
- Apply inflation adjustment to historical costs
- Weight recent claims higher (recency weighting)

**3. Insurer Bias**

**Detection:**
- Calculate percentage from each insurer
- Compare assessment patterns across insurers
- Identify systematic differences

**Mitigation:**
- Limit single insurer to < 30% of dataset
- Normalize assessment methodologies
- Include multi-insurer claims for calibration

**4. Vehicle Class Bias**

**Detection:**
- Analyze vehicle type distribution
- Check for under-representation of classes
- Compare luxury vs. economy vehicle ratios

**Mitigation:**
- Ensure minimum representation (5%) for each major class
- Oversample under-represented classes
- Separate models for distinct vehicle segments

**5. Assessor Bias**

**Detection:**
- Analyze assessment patterns by assessor
- Identify systematic over/under-estimation
- Check for assessor-specific language patterns

**Mitigation:**
- Normalize assessor estimates to market baseline
- Flag assessors with > 20% deviation from mean
- Include assessor ID as feature for model adjustment

### Bias Metrics

**Diversity Score:**
```python
diversity_score = (
    geographic_diversity * 0.30 +
    temporal_diversity * 0.20 +
    insurer_diversity * 0.20 +
    vehicle_class_diversity * 0.15 +
    assessor_diversity * 0.15
)
```

**Diversity Thresholds:**
- Excellent: diversity_score ≥ 80
- Good: 60 ≤ diversity_score < 80
- Acceptable: 40 ≤ diversity_score < 60
- Poor: diversity_score < 40 (requires mitigation)

**Bias Risk Flags:**
- `high_geographic_concentration` - Single region > 40%
- `temporal_clustering` - > 50% claims from single year
- `insurer_dominance` - Single insurer > 30%
- `vehicle_class_gap` - Major class < 5% representation
- `assessor_outlier` - Assessor deviation > 20%

---

## Anomaly Detection

### Statistical Anomalies

**Cost Anomalies:**
```python
z_score = (claim_cost - mean_cost) / std_dev_cost
if abs(z_score) > 3:
    flag_as_anomaly("cost_outlier")
```

**Time Anomalies:**
- Processing time > 2x median → `slow_processing`
- Claim age > 5 years → `very_old_claim`

**Feature Anomalies:**
- Damage severity vs. cost mismatch → `cost_severity_mismatch`
- Unusual component combinations → `unusual_damage_pattern`

### Logical Anomalies

**Inconsistencies:**
- Total cost ≠ sum of parts + labor + paint → `cost_calculation_error`
- Incident date after claim date → `temporal_inconsistency`
- Vehicle year > current year → `invalid_vehicle_year`

**Missing Critical Data:**
- No damage description → `missing_damage_description`
- No cost information → `missing_cost_data`
- No incident date → `missing_incident_date`

### Anomaly Handling

| Anomaly Type | Severity | Action |
|--------------|----------|--------|
| Cost outlier (z > 5) | Critical | Reject or senior review |
| Cost outlier (3 < z ≤ 5) | High | Manual review required |
| Temporal inconsistency | Critical | Reject |
| Missing critical data | High | Request additional info |
| Unusual damage pattern | Medium | Flag for review |
| Slow processing | Low | Monitor only |

---

## Dataset Composition Standards

### Minimum Dataset Requirements

**Size:**
- Training dataset: ≥ 500 claims (minimum for initial model)
- Optimal: ≥ 2,000 claims
- Production-ready: ≥ 5,000 claims

**Diversity:**
- ≥ 3 different countries/regions
- ≥ 3 different claim years
- ≥ 5 different insurers
- ≥ 10 different vehicle makes
- ≥ 3 different assessors

**Quality:**
- Average confidence score ≥ 70
- ≥ 80% of claims with HIGH or MEDIUM confidence
- < 5% anomaly rate
- Bias diversity score ≥ 60

### Dataset Version Management

**Versioning Scheme:** `MAJOR.MINOR.PATCH`

**Version Increments:**
- **MAJOR** - Significant changes (> 20% new data, methodology changes)
- **MINOR** - Incremental additions (5-20% new data)
- **PATCH** - Corrections, removals, metadata fixes

**Version Metadata:**
```json
{
  "version": "1.2.0",
  "created_at": "2026-02-13T10:00:00Z",
  "created_by": "data_scientist_id_123",
  "total_claims": 1547,
  "avg_confidence_score": 76.3,
  "diversity_score": 68.5,
  "geographic_distribution": {
    "ZW": 450,
    "ZA": 380,
    "BW": 320,
    "other": 397
  },
  "temporal_distribution": {
    "2023": 512,
    "2024": 635,
    "2025": 400
  },
  "changes_from_previous": {
    "added": 150,
    "removed": 8,
    "corrected": 12
  }
}
```

---

## Audit and Compliance

### Audit Log Requirements

**Mandatory Logged Events:**
1. Claim ingestion (batch and individual)
2. Extraction completion
3. Confidence score calculation
4. Manual review decisions
5. Dataset additions/removals
6. Model training starts/completions
7. Model deployments
8. Policy exceptions

**Log Entry Format:**
```json
{
  "event_id": "uuid",
  "event_type": "manual_review_approval",
  "timestamp": "2026-02-13T10:30:00Z",
  "user_id": "reviewer_123",
  "user_role": "data_quality_reviewer",
  "claim_id": 456,
  "action": "approve_for_training",
  "justification": "All required documents present, confidence score borderline but damage assessment thorough",
  "metadata": {
    "confidence_score": 78,
    "previous_status": "pending_review",
    "new_status": "approved_training"
  },
  "ip_address": "192.168.1.100"
}
```

### Compliance Requirements

**Data Protection:**
- Personal data anonymized before training
- Claimant names replaced with pseudonyms
- ID numbers hashed
- Contact details removed

**Retention:**
- Training dataset: Retained indefinitely
- Audit logs: Retained for 7 years
- Rejected claims: Retained in reference dataset

**Access Control:**
- Role-based permissions enforced
- Multi-factor authentication required
- Access logs reviewed quarterly

**Regulatory Compliance:**
- GDPR compliance (if applicable)
- Local data protection laws
- Insurance industry regulations

---

## Exception Handling

### Policy Exceptions

**Scenarios Requiring Exceptions:**
1. Approve LOW confidence claim (score < 50)
2. Exceed single-source limit (> 30%)
3. Deploy model below accuracy threshold
4. Emergency dataset correction

**Exception Request Process:**
1. Requester submits exception form
2. Detailed justification required
3. Senior Data Reviewer reviews
4. Data Governance Committee approval (for major exceptions)
5. Exception logged in audit trail
6. Time-limited approval (expires after specified period)

**Exception Form:**
```
Exception Request ID: EXC-2026-001
Requested By: [Name, Role]
Date: 2026-02-13
Policy Being Exceeded: Low Confidence Approval
Justification: Claim contains rare vehicle type (Lamborghini Aventador) 
with comprehensive documentation. Low score due to lack of competing 
quotes (only 1 panel beater in region services this vehicle). 
Critical for model to learn luxury vehicle patterns.
Risk Assessment: Low - all other quality indicators strong
Proposed Mitigation: Manual verification of cost against international 
Lamborghini repair databases
Approval: [Senior Reviewer Signature]
Expiry: Single-use exception
```

---

## Continuous Improvement

### Quarterly Reviews

**Metrics to Review:**
- Average confidence scores trend
- Manual review approval rates
- Anomaly detection effectiveness
- Bias metrics evolution
- Model accuracy trends

**Review Outcomes:**
- Update confidence scoring weights
- Adjust bias thresholds
- Refine anomaly detection rules
- Update training procedures

### Feedback Loops

**Production Feedback:**
- Monitor model predictions vs. actual outcomes
- Identify systematic errors
- Feed learnings back to training data selection

**Assessor Feedback:**
- Collect assessor input on model suggestions
- Identify areas where model underperforms
- Incorporate expert knowledge

**Stakeholder Feedback:**
- Underwriter concerns
- Claims manager observations
- Customer service insights

---

## Appendix A: Glossary

**Training Dataset** - Subset of historical claims approved for AI model training

**Reference Dataset** - Complete set of historical claims used for benchmarking only

**Confidence Score** - Numerical assessment (0-100) of claim suitability for training

**Anomaly** - Statistical outlier or logical inconsistency requiring investigation

**Bias** - Systematic skew in data distribution that may affect model fairness

**Model Version** - Specific iteration of trained AI model with unique version number

**Audit Trail** - Complete log of all actions taken on training data and models

---

## Appendix B: Contact Information

**Data Governance Committee Chair:**  
Chief Data Officer  
Email: cdo@kinga.ai

**Data Quality Review Team:**  
Email: data-quality@kinga.ai

**Technical Support:**  
System Administrator  
Email: ml-support@kinga.ai

**Policy Questions:**  
Compliance Officer  
Email: compliance@kinga.ai

---

**Document Control:**
- Version: 1.0
- Author: KINGA Data Governance Team
- Approved By: Data Governance Committee
- Next Review: May 13, 2026
