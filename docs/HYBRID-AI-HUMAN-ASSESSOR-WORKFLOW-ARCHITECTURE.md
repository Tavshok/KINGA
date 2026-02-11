# Hybrid AI-Human Assessor Decision Workflow Architecture

**Document ID:** KINGA-HAHAW-2026-017  
**Version:** 1.0  
**Date:** February 11, 2026  
**Author:** Tavonga Shoko  
**Classification:** Technical Architecture Specification

---

## Executive Summary

This document specifies the Hybrid AI-Human Assessor Decision Workflow Architecture for the KINGA (Knowledge-Integrated Next-Generation Auto-verify) platform. The architecture implements a parallel dual-path assessment system where AI damage assessment and human assessor evaluations operate independently and are then reconciled through an intelligent comparison engine. The system incorporates variance detection logic, confidence scoring, disagreement escalation protocols, decision audit trails, and a feedback loop into AI training datasets to continuously improve assessment accuracy.

The hybrid approach addresses the fundamental challenge in insurance claims processing: balancing the speed and consistency of AI with the nuanced judgment and contextual understanding of human experts. By treating AI and human assessments as complementary rather than competitive, KINGA creates a decision framework that is faster than pure human assessment, more accurate than pure AI, and more transparent than either approach alone.

---

## 1. Parallel Workflow Architecture

### 1.1 Dual-Path Assessment Model

KINGA implements a **parallel dual-path assessment architecture** where AI and human assessor workflows operate independently and simultaneously from the point of claim submission. This parallel structure ensures that neither path influences the other, preserving the independence necessary for meaningful comparison and variance detection.

The workflow begins when a claim enters the `ai_assessment_pending` and `assessor_assignment_pending` states simultaneously. The AI path executes immediately and autonomously, while the human path follows a traditional assignment and scheduling workflow. Both paths converge at the **reconciliation intelligence layer**, where outputs are compared, variances are detected, and a unified decision recommendation is generated.

**Workflow State Diagram:**

```
Claim Submitted
       ├──────────────────┬──────────────────┐
       │                  │                  │
   AI Path          Human Path         Metadata
       │                  │                  │
       ▼                  ▼                  ▼
AI Assessment      Assessor           Parallel
   Engine          Assignment         Tracking
       │                  │                  │
       ▼                  ▼                  │
AI Damage          Assessor           Timestamp
 Analysis          Inspection          Capture
       │                  │                  │
       ▼                  ▼                  │
AI Cost            Assessor           Confidence
Estimation         Evaluation          Scoring
       │                  │                  │
       ▼                  ▼                  │
AI Fraud           Assessor           Evidence
Detection          Report              Logging
       │                  │                  │
       └──────────────────┴──────────────────┘
                          │
                          ▼
              Reconciliation Intelligence Layer
                          │
       ┌──────────────────┼──────────────────┐
       │                  │                  │
       ▼                  ▼                  ▼
   Variance          Confidence        Escalation
   Detection          Scoring           Protocol
       │                  │                  │
       └──────────────────┴──────────────────┘
                          │
                          ▼
                 Decision Recommendation
                          │
       ┌──────────────────┼──────────────────┐
       │                  │                  │
       ▼                  ▼                  ▼
  Insurer           Audit Trail        AI Training
  Override          Capture            Feedback Loop
```

### 1.2 AI Assessment Path

The AI assessment path executes within seconds of claim submission, leveraging computer vision for damage analysis, machine learning models for cost estimation, and pattern recognition for fraud detection. The AI path operates in four sequential stages:

**Stage 1: Image Analysis and Damage Detection**

The AI engine processes uploaded damage photos using a multi-model computer vision pipeline. The system employs object detection models to identify vehicle components, semantic segmentation to delineate damaged areas, and depth estimation to assess impact severity. Each detected damage region is classified by type (dent, scratch, crack, shatter, deformation, paint damage) and severity (minor, moderate, severe, total loss).

The AI generates a **structured damage inventory** with bounding box coordinates, confidence scores per detection, and spatial relationships between damage regions. This structured output enables precise comparison with human assessor findings.

**Stage 2: Cost Estimation**

Using the damage inventory, the AI estimates repair costs by matching detected damage to a **parts and labor database** indexed by vehicle make, model, and year. The cost estimation model incorporates:

- **Parts pricing** from OEM and aftermarket suppliers
- **Labor time standards** from industry benchmarks (e.g., Mitchell, Audatex)
- **Regional pricing adjustments** based on claim location
- **Complexity multipliers** for difficult repairs (e.g., aluminum body panels, advanced driver assistance systems)

The AI produces a **line-item cost breakdown** with individual part costs, labor hours, and total estimated repair cost. Confidence intervals are calculated for each line item based on historical variance in similar claims.

**Stage 3: Fraud Pattern Detection**

The AI analyzes the claim for fraud indicators using a multi-dimensional scoring model. Fraud detection examines:

- **Photo authenticity** (EXIF metadata analysis, reverse image search, AI-generated image detection)
- **Damage consistency** (impact physics validation, damage progression analysis)
- **Claimant history** (frequency of claims, prior fraud flags, insurer hopping patterns)
- **Entity relationships** (assessor-panel beater collusion networks, staged accident indicators)
- **Temporal patterns** (delayed submission, weekend/holiday claims, end-of-month spikes)

Each fraud dimension produces a **risk score** (0-100), and a weighted aggregate **fraud risk score** is calculated. Specific fraud indicators are flagged with evidence references (e.g., "EXIF timestamp mismatch: photo taken 3 days before reported incident date").

**Stage 4: AI Assessment Report Generation**

The AI compiles all findings into a **structured assessment report** with:

- Executive summary (total estimated cost, fraud risk level, recommendation)
- Damage inventory (annotated images with bounding boxes and labels)
- Cost breakdown (line-item parts and labor estimates)
- Fraud analysis (risk score, flagged indicators, evidence)
- Confidence metrics (overall confidence score, per-component confidence)
- Processing metadata (timestamp, model versions, data sources)

The AI assessment report is stored in the `ai_assessments` table with a `completed_at` timestamp, triggering the reconciliation workflow if the human assessment is also complete.

### 1.3 Human Assessor Path

The human assessor path follows a traditional claims assessment workflow but is instrumented with structured data capture to enable comparison with AI outputs. The human path operates in five stages:

**Stage 1: Assessor Assignment**

Claims are assigned to assessors based on the **assignment routing algorithm** specified in the Dual Assessor Governance Architecture (KINGA-DAGMA-2026-015). Assignment considers assessor specialization, geographic proximity, current workload, performance history, and insurer preferences (insurer-owned vs. marketplace assessors).

The assignment creates an `assessor_claim_assignments` record with `assigned_at` timestamp, `expires_at` deadline (default: 30 days), and `status: assigned`. The assessor receives a notification with claim details and damage photos.

**Stage 2: Physical Inspection Scheduling**

The assessor schedules an in-person inspection with the claimant using the appointment scheduling system. The inspection appointment is recorded in the `appointments` table with `scheduled_at`, `location`, and `attendees` fields. The assessor may also schedule appointments with panel beaters for independent damage verification.

**Stage 3: Damage Evaluation**

During the physical inspection, the assessor conducts a comprehensive damage evaluation, documenting:

- **Visual inspection findings** (damage types, locations, severity assessments)
- **Measurements** (dent depths, crack lengths, panel deformations)
- **Component testing** (mechanical function tests, electrical system checks)
- **Additional photos** (close-ups, angles not captured by claimant)
- **Contextual observations** (pre-existing damage, wear and tear, maintenance condition)

The assessor uses the **structured evaluation form** in the KINGA assessor portal, which mirrors the AI damage inventory schema to enable direct comparison. Each damage region is classified using the same taxonomy (type, severity, affected component).

**Stage 4: Cost Estimation and Report Preparation**

The assessor prepares a **line-item cost estimate** using industry-standard estimating software or the KINGA cost estimation tool. The estimate includes:

- Parts list with part numbers, descriptions, and unit costs
- Labor operations with operation codes, time estimates, and hourly rates
- Sublet operations (e.g., glass replacement, paintless dent repair)
- Miscellaneous costs (storage, towing, rental car)
- Total estimated repair cost

The assessor also provides a **narrative assessment** with professional judgment on:

- Repair vs. replace decisions for borderline components
- Hidden damage likelihood (e.g., frame damage not visible externally)
- Safety concerns (e.g., airbag deployment, structural integrity)
- Fraud suspicions (e.g., inconsistent damage patterns, claimant behavior)

**Stage 5: Assessor Report Submission**

The assessor submits the evaluation report through the KINGA portal, which stores the structured data in the `assessor_evaluations` table with:

- `assessor_id`, `claim_id`, `version` (for report revisions)
- `damage_assessment` (JSON structure matching AI damage inventory schema)
- `cost_breakdown` (JSON line-item estimate)
- `fraud_indicators` (array of flagged concerns)
- `narrative_assessment` (text field for professional judgment)
- `confidence_level` (self-reported: low, medium, high)
- `submitted_at` timestamp

The submission triggers the reconciliation workflow if the AI assessment is also complete.

### 1.4 Parallel Tracking and Metadata Capture

Throughout both workflows, KINGA captures **parallel tracking metadata** to enable performance analytics and continuous improvement:

**Timing Metrics:**
- AI assessment start/complete timestamps
- Assessor assignment/acceptance/submission timestamps
- Total time-to-completion for each path
- Bottleneck identification (e.g., scheduling delays, assessor availability)

**Confidence Metadata:**
- AI confidence scores per damage detection, cost estimate, fraud indicator
- Assessor self-reported confidence level
- Historical accuracy rates for the specific assessor and AI model version

**Evidence Capture:**
- All damage photos (claimant-submitted and assessor-captured)
- EXIF metadata and photo provenance tracking
- Assessor inspection notes and measurements
- Panel beater quotes and supporting documentation

This metadata feeds into the reconciliation intelligence layer and the AI training feedback loop.

---

## 2. Comparison Intelligence Algorithm

### 2.1 Reconciliation Engine Architecture

The **Reconciliation Intelligence Layer** is the core innovation of the hybrid workflow. It compares AI and human assessor outputs across multiple dimensions, detects variances, assigns confidence scores, and generates a unified decision recommendation. The reconciliation engine operates as a **multi-stage pipeline**:

**Stage 1: Schema Normalization**

AI and human assessor outputs are normalized into a **common comparison schema**. The normalization process:

- Maps AI damage detections to assessor damage findings by spatial overlap and component matching
- Aligns cost estimate line items by part number or description similarity
- Standardizes fraud indicators to a common taxonomy
- Converts free-text assessor narratives into structured attributes using NLP

The normalized schema enables apples-to-apples comparison across all dimensions.

**Stage 2: Variance Detection**

The variance detection algorithm compares normalized AI and human outputs across three primary dimensions:

**Dimension 1: Damage Scope Variance**

Damage scope variance measures the agreement between AI and human assessor on which components are damaged and the severity of each damage. The algorithm:

1. **Matches damage findings** by component (e.g., "front bumper", "driver door")
2. **Calculates overlap score** for each matched component (Intersection over Union for spatial regions)
3. **Compares severity classifications** (minor/moderate/severe/total loss)
4. **Identifies discrepancies**:
   - **AI-only detections** (damage detected by AI but not by assessor)
   - **Assessor-only findings** (damage found by assessor but missed by AI)
   - **Severity disagreements** (both detected damage but assigned different severity)

The damage scope variance is quantified as:

```
Damage Scope Variance = 1 - (Matched Components / Total Unique Components)
```

A variance of 0% indicates perfect agreement; 100% indicates complete disagreement.

**Dimension 2: Cost Estimate Variance**

Cost estimate variance measures the difference in total estimated repair cost and line-item cost breakdown. The algorithm:

1. **Calculates total cost delta**: `|AI Cost - Assessor Cost| / Assessor Cost`
2. **Matches line items** by part number or description similarity
3. **Calculates per-item cost delta** for matched items
4. **Identifies cost outliers**: line items with >30% cost difference
5. **Analyzes variance sources**:
   - Parts pricing differences (OEM vs. aftermarket, regional pricing)
   - Labor time differences (standard time vs. actual shop rates)
   - Scope differences (AI included/excluded items not in assessor estimate)

Cost variance is classified as:

- **Low variance**: <10% total cost difference
- **Moderate variance**: 10-25% total cost difference
- **High variance**: >25% total cost difference

**Dimension 3: Fraud Indicator Variance**

Fraud indicator variance measures the agreement on fraud risk assessment. The algorithm:

1. **Compares aggregate fraud risk scores** (AI vs. assessor)
2. **Matches specific fraud indicators** flagged by both
3. **Identifies unique flags**:
   - **AI-only flags** (e.g., EXIF metadata tampering detected by AI)
   - **Assessor-only flags** (e.g., claimant behavior concerns noted by assessor)
4. **Calculates fraud risk delta**: `|AI Fraud Score - Assessor Fraud Score|`

Fraud variance is classified as:

- **Aligned**: Both agree on low/medium/high risk classification
- **Divergent**: One flags high risk, other flags low/medium risk
- **Conflicting**: Specific fraud indicators contradict each other

**Stage 3: Variance Severity Scoring**

Each detected variance is assigned a **severity score** (0-100) based on:

- **Magnitude**: How large is the discrepancy? (e.g., 5% cost difference vs. 50%)
- **Impact**: How much does this affect the claim decision? (e.g., total loss determination vs. minor part substitution)
- **Frequency**: How common is this type of variance in historical data? (rare variances are more suspicious)
- **Confidence**: How confident are AI and assessor in their respective findings? (low confidence reduces variance severity)

The severity score determines whether the variance triggers an escalation workflow.

### 2.2 Variance Detection Rules

The reconciliation engine applies **variance detection rules** to classify variances and determine appropriate actions:

**Rule 1: Total Loss Disagreement**

If AI classifies the claim as total loss but assessor classifies as repairable (or vice versa), trigger **immediate escalation** to senior claims examiner. Total loss determination has significant financial and legal implications and requires human oversight.

**Rule 2: High Cost Variance (>25%)**

If total cost estimate variance exceeds 25%, trigger **detailed cost review workflow**. The system:

- Generates a **line-item variance report** highlighting outlier items
- Requests assessor to review and justify high-variance line items
- Flags potential parts pricing errors or scope mismatches
- Escalates to claims manager if variance persists after assessor review

**Rule 3: Fraud Risk Divergence**

If AI flags high fraud risk (score >70) but assessor reports low fraud risk (score <30), or vice versa, trigger **fraud investigation workflow**. The system:

- Escalates to fraud investigation team
- Requests additional evidence (e.g., police report, witness statements)
- Initiates background check on claimant and involved parties
- Suspends claim processing pending investigation outcome

**Rule 4: Damage Scope Mismatch**

If AI detects damage to safety-critical components (e.g., airbag system, braking system, steering components) that assessor did not identify, trigger **safety review workflow**. The system:

- Flags potential hidden damage or assessor oversight
- Requests assessor to re-inspect flagged components
- Escalates to technical specialist if discrepancy persists
- Documents safety concerns in audit trail

**Rule 5: Low Variance Auto-Approval**

If all variance dimensions are below thresholds (damage scope <10%, cost <10%, fraud aligned), and both AI and assessor confidence scores are high (>80%), the system **auto-approves** the claim with the **average** of AI and assessor cost estimates. This enables straight-through processing for routine claims.

### 2.3 Comparison Intelligence Outputs

The reconciliation engine generates three primary outputs:

**1. Variance Analysis Report**

A structured report documenting all detected variances with:

- Variance type (damage scope, cost, fraud)
- Variance magnitude (percentage difference, absolute delta)
- Variance severity score (0-100)
- Affected components or line items
- Recommended action (auto-approve, review, escalate, investigate)

**2. Unified Decision Recommendation**

A synthesized recommendation that combines AI and human assessor findings:

- **Recommended repair cost**: Weighted average or median of AI and assessor estimates
- **Recommended action**: Approve, deny, request additional information, escalate
- **Confidence level**: Aggregate confidence score based on AI and assessor confidence and variance magnitude
- **Rationale**: Explanation of how the recommendation was derived

**3. Escalation Triggers**

A list of triggered escalation workflows with:

- Escalation type (cost review, fraud investigation, safety review, senior examiner)
- Triggering rule (e.g., "Rule 2: High Cost Variance >25%")
- Assigned escalation handler (role or specific user)
- Escalation deadline (SLA-based)

---

## 3. Confidence Scoring Methodology

### 3.1 AI Confidence Scoring

The AI assessment engine calculates confidence scores at multiple levels of granularity:

**Component-Level Confidence**

For each detected damage region, the AI calculates:

- **Detection confidence**: Probability that the detected region contains actual damage (0-100%)
- **Classification confidence**: Probability that the damage type classification is correct (0-100%)
- **Severity confidence**: Probability that the severity assessment is accurate (0-100%)

Component-level confidence is derived from:

- Model prediction probabilities (e.g., softmax outputs from classification models)
- Historical accuracy rates for similar damage types on similar vehicles
- Image quality metrics (resolution, lighting, occlusion)

**Cost Estimate Confidence**

For each line item in the cost estimate, the AI calculates:

- **Parts pricing confidence**: Based on data source reliability and price volatility
- **Labor time confidence**: Based on standard time variance and shop rate consistency
- **Total cost confidence**: Aggregate confidence across all line items

Cost confidence is influenced by:

- Parts database completeness (OEM vs. aftermarket availability)
- Regional pricing data availability
- Vehicle make/model coverage in labor time databases

**Fraud Detection Confidence**

For each fraud indicator, the AI calculates:

- **Indicator confidence**: Probability that the flagged pattern is actually fraudulent (0-100%)
- **Aggregate fraud confidence**: Overall confidence in the fraud risk score

Fraud confidence is derived from:

- False positive rates for each fraud indicator type in historical data
- Strength of evidence (e.g., definitive EXIF tampering vs. statistical anomaly)
- Correlation with other fraud indicators (multiple weak indicators increase confidence)

**Overall AI Confidence Score**

The overall AI confidence score is a **weighted average** of component-level, cost, and fraud confidence scores:

```
AI Confidence = (0.4 × Damage Confidence) + (0.4 × Cost Confidence) + (0.2 × Fraud Confidence)
```

The weights reflect the relative importance of each dimension in the final claim decision.

### 3.2 Human Assessor Confidence Scoring

Human assessor confidence is captured through a combination of **self-reported confidence** and **system-calculated confidence**:

**Self-Reported Confidence**

Assessors select a confidence level when submitting their evaluation:

- **High confidence (80-100%)**: Clear damage, straightforward repair, no ambiguity
- **Medium confidence (50-79%)**: Some uncertainty (e.g., hidden damage likelihood, borderline repair/replace decisions)
- **Low confidence (0-49%)**: Significant uncertainty (e.g., complex damage, unfamiliar vehicle technology, limited inspection access)

Assessors are encouraged to provide **confidence justifications** in the narrative assessment field (e.g., "Medium confidence due to potential hidden frame damage not visible without disassembly").

**System-Calculated Confidence**

KINGA calculates an **assessor performance-based confidence score** using historical accuracy metrics:

- **Accuracy rate**: Percentage of past assessments where the assessor's cost estimate was within 15% of actual repair cost
- **Consistency score**: Variance in the assessor's estimates for similar claims (low variance = high consistency)
- **Fraud detection rate**: Percentage of fraud cases correctly identified by the assessor
- **Timeliness score**: Percentage of assessments completed within SLA deadlines

The system-calculated confidence is:

```
Assessor Confidence = (0.5 × Self-Reported Confidence) + (0.5 × Performance-Based Confidence)
```

This hybrid approach balances the assessor's professional judgment with objective performance data.

### 3.3 Aggregate Confidence Scoring

The reconciliation engine calculates an **aggregate confidence score** for the unified decision recommendation:

**High Variance Penalty**

If AI and assessor outputs have high variance, the aggregate confidence is penalized:

```
Variance Penalty = max(Damage Variance, Cost Variance, Fraud Variance)
Aggregate Confidence = min(AI Confidence, Assessor Confidence) × (1 - Variance Penalty)
```

For example:
- AI Confidence: 85%
- Assessor Confidence: 90%
- Cost Variance: 30% (high variance)
- Aggregate Confidence = 85% × (1 - 0.30) = 59.5%

The high variance significantly reduces confidence in the decision, triggering escalation.

**Low Variance Boost**

If AI and assessor outputs have low variance and high individual confidence, the aggregate confidence is boosted:

```
if (Damage Variance < 10% AND Cost Variance < 10% AND Fraud Aligned):
    Aggregate Confidence = max(AI Confidence, Assessor Confidence) + 5%
```

The boost reflects the increased reliability of converging independent assessments.

---

## 4. Escalation Protocol Design

### 4.1 Escalation Trigger Conditions

The hybrid workflow defines **six escalation trigger conditions** based on variance severity, confidence levels, and specific risk factors:

**Trigger 1: Total Loss Disagreement**

- **Condition**: AI classifies as total loss (repair cost > 70% of vehicle value) but assessor classifies as repairable, or vice versa
- **Severity**: Critical
- **Escalation Target**: Senior Claims Examiner
- **SLA**: 4 hours
- **Action**: Manual review of both AI and assessor findings, third-party appraisal if needed

**Trigger 2: High Cost Variance (>25%)**

- **Condition**: Total cost estimate variance exceeds 25%
- **Severity**: High
- **Escalation Target**: Claims Manager
- **SLA**: 24 hours
- **Action**: Line-item cost review, assessor justification request, parts pricing validation

**Trigger 3: Fraud Risk Divergence**

- **Condition**: AI fraud score >70 and assessor fraud score <30, or vice versa
- **Severity**: High
- **Escalation Target**: Fraud Investigation Team
- **SLA**: 48 hours
- **Action**: Background check, additional evidence collection, investigator assignment

**Trigger 4: Safety-Critical Component Mismatch**

- **Condition**: AI detects damage to safety-critical components (airbag, braking, steering) that assessor did not identify
- **Severity**: High
- **Escalation Target**: Technical Specialist
- **SLA**: 12 hours
- **Action**: Re-inspection request, component testing, safety certification review

**Trigger 5: Low Aggregate Confidence (<50%)**

- **Condition**: Aggregate confidence score falls below 50% due to high variance or low individual confidence
- **Severity**: Medium
- **Escalation Target**: Claims Supervisor
- **SLA**: 48 hours
- **Action**: Manual review, request for additional information, third-party assessment

**Trigger 6: Assessor-AI Fraud Flag Conflict**

- **Condition**: AI flags specific fraud indicator (e.g., EXIF tampering) but assessor explicitly contradicts it (e.g., "photos verified authentic during inspection")
- **Severity**: Medium
- **Escalation Target**: Quality Assurance Team
- **SLA**: 72 hours
- **Action**: Evidence review, AI model validation, assessor interview

### 4.2 Escalation Workflow

When an escalation is triggered, the system executes a **structured escalation workflow**:

**Step 1: Escalation Record Creation**

The system creates an `escalations` table record with:

```sql
CREATE TABLE escalations (
  id INT PRIMARY KEY AUTO_INCREMENT,
  claim_id INT NOT NULL,
  escalation_type ENUM('total_loss_disagreement', 'high_cost_variance', 'fraud_divergence', 'safety_mismatch', 'low_confidence', 'fraud_conflict') NOT NULL,
  severity ENUM('critical', 'high', 'medium', 'low') NOT NULL,
  triggered_by VARCHAR(255) NOT NULL, -- e.g., "Rule 2: High Cost Variance"
  assigned_to_role VARCHAR(100) NOT NULL,
  assigned_to_user_id INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  due_at TIMESTAMP NOT NULL, -- SLA deadline
  resolved_at TIMESTAMP,
  resolution_notes TEXT,
  resolution_action ENUM('approve', 'deny', 'request_info', 'reassign_assessor', 'third_party_appraisal', 'fraud_investigation') ,
  status ENUM('pending', 'in_progress', 'resolved', 'escalated_further') DEFAULT 'pending',
  FOREIGN KEY (claim_id) REFERENCES claims(id)
);
```

**Step 2: Notification Dispatch**

The system sends notifications to:

- **Assigned role/user**: Email and in-app notification with escalation details
- **Claim stakeholders**: Insurer claims manager, assessor (if applicable)
- **Escalation dashboard**: Real-time update to escalation monitoring dashboard

**Step 3: Escalation Handler Review**

The assigned escalation handler reviews:

- AI assessment report
- Assessor evaluation report
- Variance analysis report
- Claim documentation (photos, police report, claimant statements)
- Historical data (claimant claim history, assessor performance history)

The handler has access to a **side-by-side comparison view** in the KINGA portal highlighting variances.

**Step 4: Resolution Decision**

The escalation handler makes one of the following decisions:

- **Approve claim**: Accept AI or assessor recommendation, or use handler's independent judgment
- **Deny claim**: Reject claim based on fraud evidence or policy exclusions
- **Request additional information**: Request claimant to provide additional documentation
- **Reassign assessor**: Assign a different assessor for second opinion
- **Third-party appraisal**: Engage independent third-party appraiser
- **Fraud investigation**: Escalate to formal fraud investigation workflow

**Step 5: Resolution Documentation**

The handler documents the resolution in the `escalations.resolution_notes` field with:

- Rationale for the decision
- Which assessment (AI or human) was deemed more accurate and why
- Any adjustments made to cost estimates or fraud risk scores
- Lessons learned for future similar cases

**Step 6: Feedback Loop Update**

The resolution outcome is fed back into the AI training pipeline (see Section 5.2) to improve future AI assessments.

### 4.3 Escalation Analytics

KINGA tracks escalation metrics to identify systemic issues and improvement opportunities:

**Escalation Rate Metrics:**
- Percentage of claims escalated by trigger type
- Escalation rate by AI model version
- Escalation rate by assessor (to identify training needs)
- Escalation rate by vehicle make/model (to identify AI training gaps)

**Resolution Metrics:**
- Average time-to-resolution by escalation type
- SLA compliance rate
- Resolution outcome distribution (approve/deny/request info)
- AI vs. assessor accuracy in escalated cases (which was ultimately correct?)

**Cost Impact Metrics:**
- Average cost adjustment in escalated cases
- Total cost impact of escalations (difference between initial estimate and final approved cost)
- Fraud detection value (amount saved by catching fraudulent claims)

---

## 5. Decision Audit Trail and AI Training Feedback Loop

### 5.1 Decision Audit Trail Capture

KINGA implements a **comprehensive audit trail** capturing every decision, variance, escalation, and override in the hybrid workflow. The audit trail serves three purposes:

1. **Regulatory compliance**: Demonstrating fair and transparent claims handling to regulators
2. **Dispute resolution**: Providing evidence in case of claimant disputes or litigation
3. **Continuous improvement**: Analyzing decision patterns to improve AI models and assessor training

**Audit Trail Data Model:**

```sql
CREATE TABLE decision_audit_trail (
  id INT PRIMARY KEY AUTO_INCREMENT,
  claim_id INT NOT NULL,
  event_type ENUM('ai_assessment_completed', 'assessor_evaluation_submitted', 'reconciliation_completed', 'variance_detected', 'escalation_triggered', 'escalation_resolved', 'insurer_override', 'claim_approved', 'claim_denied') NOT NULL,
  event_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  actor_type ENUM('system', 'ai_engine', 'assessor', 'claims_manager', 'fraud_investigator', 'insurer_admin') NOT NULL,
  actor_id INT, -- user_id if actor is human
  event_data JSON NOT NULL, -- detailed event-specific data
  decision_rationale TEXT, -- human-readable explanation
  confidence_score DECIMAL(5,2), -- confidence in this decision
  variance_data JSON, -- variance details if applicable
  escalation_id INT, -- reference to escalations table if applicable
  override_reason TEXT, -- if insurer override, reason for override
  FOREIGN KEY (claim_id) REFERENCES claims(id),
  FOREIGN KEY (escalation_id) REFERENCES escalations(id),
  INDEX idx_claim_event (claim_id, event_type),
  INDEX idx_timestamp (event_timestamp)
);
```

**Captured Events:**

1. **AI Assessment Completed**: AI assessment report, confidence scores, fraud indicators
2. **Assessor Evaluation Submitted**: Assessor report, confidence level, inspection notes
3. **Reconciliation Completed**: Variance analysis, unified recommendation, aggregate confidence
4. **Variance Detected**: Variance type, magnitude, severity score, triggered rules
5. **Escalation Triggered**: Escalation type, assigned handler, SLA deadline
6. **Escalation Resolved**: Resolution decision, rationale, cost adjustments
7. **Insurer Override**: Override decision, reason, supporting evidence
8. **Claim Approved/Denied**: Final decision, approved cost, payment authorization

**Audit Trail Query Capabilities:**

The audit trail supports queries for:

- **Claim timeline reconstruction**: Chronological sequence of all events for a specific claim
- **Actor activity tracking**: All decisions made by a specific assessor, claims manager, or AI model version
- **Variance pattern analysis**: Frequency and magnitude of specific variance types
- **Override analysis**: Reasons for insurer overrides, patterns in override decisions
- **Compliance reporting**: Demonstrating adherence to regulatory requirements (e.g., POPIA, FSCA)

### 5.2 AI Training Feedback Loop

The hybrid workflow creates a **continuous feedback loop** where human assessor findings and escalation resolutions are used to retrain and improve AI models. This feedback loop is critical to closing the accuracy gap between AI and human experts over time.

**Feedback Loop Architecture:**

```
Escalation Resolutions
         │
         ▼
   Ground Truth
   Labeling
         │
         ▼
   Training Data
   Enrichment
         │
         ▼
   Model Retraining
         │
         ▼
   A/B Testing
         │
         ▼
   Model Deployment
         │
         ▼
   Performance
   Monitoring
         │
         └──────────► (loop back to Escalation Resolutions)
```

**Step 1: Ground Truth Labeling**

When an escalation is resolved, the resolution outcome is treated as **ground truth** for AI training:

- If escalation handler agrees with AI assessment → AI was correct, assessor was incorrect
- If escalation handler agrees with assessor → Assessor was correct, AI was incorrect
- If escalation handler provides independent judgment → Both AI and assessor were incorrect, handler's judgment is ground truth

The ground truth label is stored in the `ai_training_feedback` table:

```sql
CREATE TABLE ai_training_feedback (
  id INT PRIMARY KEY AUTO_INCREMENT,
  claim_id INT NOT NULL,
  ai_assessment_id INT NOT NULL,
  assessor_evaluation_id INT,
  escalation_id INT,
  ground_truth_source ENUM('escalation_handler', 'actual_repair_cost', 'fraud_confirmed', 'fraud_cleared') NOT NULL,
  ground_truth_damage_assessment JSON, -- correct damage inventory
  ground_truth_cost_estimate DECIMAL(10,2), -- correct repair cost
  ground_truth_fraud_score INT, -- correct fraud risk score
  ai_error_type ENUM('false_positive_damage', 'false_negative_damage', 'cost_overestimate', 'cost_underestimate', 'false_positive_fraud', 'false_negative_fraud', 'severity_misclassification'),
  error_magnitude DECIMAL(10,2), -- quantified error (e.g., cost delta, severity level difference)
  labeled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  labeled_by_user_id INT,
  training_set_inclusion BOOLEAN DEFAULT TRUE, -- include in next training batch
  FOREIGN KEY (claim_id) REFERENCES claims(id),
  FOREIGN KEY (ai_assessment_id) REFERENCES ai_assessments(id),
  FOREIGN KEY (escalation_id) REFERENCES escalations(id)
);
```

**Step 2: Training Data Enrichment**

Ground truth labels are used to enrich the AI training dataset:

- **Positive examples**: Cases where AI was correct (reinforce existing patterns)
- **Negative examples**: Cases where AI was incorrect (learn from mistakes)
- **Hard negatives**: Cases where AI was highly confident but incorrect (prioritize for training)
- **Edge cases**: Rare or unusual claims that AI struggled with (improve generalization)

The enriched training dataset is versioned and stored in the AI training data repository.

**Step 3: Model Retraining**

AI models are retrained on a **monthly cadence** using the enriched training dataset. The retraining process:

1. **Damage detection models**: Retrain computer vision models on mislabeled damage regions
2. **Cost estimation models**: Retrain regression models on cost estimation errors
3. **Fraud detection models**: Retrain classification models on fraud false positives/negatives
4. **Confidence calibration**: Adjust confidence scoring to match actual accuracy rates

Retraining uses **transfer learning** to fine-tune existing models rather than training from scratch, preserving learned knowledge while correcting errors.

**Step 4: A/B Testing**

New model versions are deployed in **A/B testing mode** where:

- 90% of claims use the production AI model
- 10% of claims use the new candidate AI model
- Both models' outputs are compared to ground truth (escalation resolutions, actual repair costs)
- Performance metrics are tracked (accuracy, precision, recall, F1 score, cost RMSE)

If the candidate model outperforms the production model by a statistically significant margin (p < 0.05), it is promoted to production.

**Step 5: Model Deployment**

The new model version is deployed to production with:

- **Version tagging**: Each AI assessment records the model version used
- **Rollback capability**: Previous model version is retained for rollback if issues arise
- **Performance monitoring**: Real-time monitoring of accuracy, latency, and error rates

**Step 6: Performance Monitoring**

Post-deployment, the new model's performance is continuously monitored:

- **Accuracy drift detection**: Alert if accuracy degrades over time (e.g., due to changing vehicle technologies)
- **Bias detection**: Monitor for demographic or geographic biases in AI assessments
- **Escalation rate tracking**: Alert if escalation rate increases (indicating model degradation)

Performance metrics feed back into the next retraining cycle, creating a continuous improvement loop.

---

## 6. Insurer Override Mechanism

### 6.1 Override Workflow

While the hybrid workflow generates a unified decision recommendation, insurers retain **final decision authority** and can override the recommendation. The override mechanism balances automation with human judgment and regulatory compliance.

**Override Trigger Points:**

Insurers can override at three decision points:

1. **Post-Reconciliation**: After variance analysis and unified recommendation are generated
2. **Post-Escalation**: After escalation handler resolves a variance
3. **Pre-Payment**: Final review before authorizing claim payment

**Override Justification Requirements:**

All overrides must include:

- **Override reason category**:
  - Policy interpretation (e.g., exclusion applies that AI/assessor didn't account for)
  - Customer relationship (e.g., goodwill gesture for long-term policyholder)
  - Legal/regulatory (e.g., regulatory guidance requires different treatment)
  - Risk management (e.g., settling to avoid litigation costs)
  - Fraud prevention (e.g., additional fraud evidence not available to AI/assessor)
  - Cost control (e.g., negotiated settlement below estimated repair cost)

- **Override rationale**: Free-text explanation of the specific circumstances
- **Supporting evidence**: Attachments or references to supporting documentation
- **Cost adjustment**: If override changes the approved repair cost, document the adjustment and justification

**Override Approval Workflow:**

Overrides are subject to **approval thresholds** based on cost impact:

- **<$5,000 adjustment**: Claims manager approval
- **$5,000-$25,000 adjustment**: Senior claims manager approval
- **>$25,000 adjustment**: VP of Claims approval + legal review

High-value overrides require **dual authorization** to prevent fraud and ensure accountability.

### 6.2 Override Audit and Analytics

All overrides are captured in the decision audit trail with:

- Override timestamp and approver identity
- Override reason category and rationale
- Cost adjustment amount
- Supporting evidence references

Override analytics track:

- **Override rate**: Percentage of claims overridden by reason category
- **Cost impact**: Total cost adjustment from overrides (positive or negative)
- **Override patterns**: Frequent override reasons, overriding users, claim types
- **Override accuracy**: Comparison of override decisions to actual outcomes (e.g., did goodwill override prevent churn?)

Override data is also fed into the AI training feedback loop to help the AI learn policy interpretation nuances and business judgment patterns.

---

## 7. Governance and Compliance Alignment

### 7.1 Regulatory Compliance Framework

The hybrid AI-human assessor workflow is designed to comply with insurance regulatory requirements in South Africa and internationally:

**POPIA (Protection of Personal Information Act) Compliance:**

- **Automated decision-making transparency**: Claimants are informed that AI is used in claims assessment and have the right to request human review
- **Data minimization**: AI models only access data necessary for damage assessment, cost estimation, and fraud detection
- **Purpose limitation**: AI training data is used solely for improving claims assessment accuracy, not for unrelated purposes
- **Consent**: Claimants consent to AI-assisted claims processing in policy terms and conditions

**FSCA (Financial Sector Conduct Authority) Compliance:**

- **Treating Customers Fairly (TCF)**: Hybrid workflow ensures fair treatment by combining AI efficiency with human judgment and oversight
- **Transparency**: Claimants receive explanations of claim decisions, including how AI and assessor findings were reconciled
- **Complaints handling**: Claimants can dispute AI assessments and request independent review
- **Audit trail**: Comprehensive audit trail demonstrates compliance with FSCA record-keeping requirements

**GDPR (General Data Protection Regulation) Compliance:**

- **Right to explanation**: Claimants can request detailed explanations of AI assessment logic and variance analysis
- **Right to human intervention**: Escalation workflows ensure human oversight of AI decisions
- **Data portability**: Claimants can request export of their claim data, including AI assessment reports
- **Data retention**: AI training data is anonymized and retained only as long as necessary for model improvement

**ISO 27001 (Information Security) Compliance:**

- **Access control**: Role-based access control (RBAC) restricts access to AI models, training data, and audit trails
- **Encryption**: AI assessment data is encrypted at rest and in transit
- **Audit logging**: All access to sensitive claim data is logged for security monitoring
- **Incident response**: Security incidents involving AI systems trigger incident response protocols

### 7.2 Ethical AI Principles

The hybrid workflow adheres to **ethical AI principles** for insurance claims processing:

**Principle 1: Human-in-the-Loop**

AI is used to augment, not replace, human judgment. All high-stakes decisions (total loss, fraud investigation, claim denial) require human review and approval.

**Principle 2: Explainability**

AI assessments include **explainable AI (XAI) outputs** such as:

- Annotated damage images with bounding boxes and labels
- Line-item cost breakdowns with data sources
- Fraud indicator evidence references
- Confidence scores and uncertainty quantification

**Principle 3: Fairness and Non-Discrimination**

AI models are regularly audited for **bias** across demographic groups (age, gender, race, geographic location). Bias mitigation techniques are applied during model training to ensure equitable treatment.

**Principle 4: Accountability**

Clear **accountability chains** are established:

- AI model developers are accountable for model accuracy and bias
- Assessors are accountable for evaluation quality and professional judgment
- Escalation handlers are accountable for resolution decisions
- Insurers are accountable for override decisions and final claim outcomes

**Principle 5: Continuous Improvement**

The AI training feedback loop ensures continuous improvement of AI accuracy, reducing reliance on escalations over time while maintaining human oversight for edge cases.

---

## 8. Scalability and Performance Architecture

### 8.1 Parallel Processing Infrastructure

The hybrid workflow is designed for **high-throughput parallel processing** to handle large claim volumes:

**AI Assessment Scaling:**

- **Serverless compute**: AI assessment engine runs on serverless infrastructure (e.g., AWS Lambda, Google Cloud Functions) with auto-scaling based on claim volume
- **GPU acceleration**: Computer vision models leverage GPU instances for fast image processing
- **Batch processing**: Multiple claims are processed in parallel batches to maximize GPU utilization
- **Caching**: Frequently accessed data (parts pricing, labor time standards) is cached in-memory for low-latency access

**Assessor Workflow Scaling:**

- **Assignment queue**: Assessor assignments are managed via a distributed task queue (e.g., Redis Queue, Celery) with priority-based scheduling
- **Geographic sharding**: Assessor assignments are sharded by geographic region to minimize travel time and enable parallel processing across regions
- **Workload balancing**: Assignment algorithm balances workload across assessors to prevent bottlenecks

**Reconciliation Engine Scaling:**

- **Event-driven architecture**: Reconciliation is triggered by events (AI assessment completed, assessor evaluation submitted) using message queues (e.g., Kafka, RabbitMQ)
- **Asynchronous processing**: Variance detection and confidence scoring run asynchronously to avoid blocking claim workflows
- **Horizontal scaling**: Reconciliation workers scale horizontally based on queue depth

### 8.2 Performance Targets

**AI Assessment Performance:**

- **Latency**: <30 seconds from claim submission to AI assessment completion
- **Throughput**: 10,000+ claims per hour
- **Accuracy**: 90%+ agreement with ground truth (escalation resolutions, actual repair costs)

**Assessor Workflow Performance:**

- **Assignment latency**: <5 minutes from claim submission to assessor assignment
- **Inspection scheduling**: 90% of inspections scheduled within 48 hours
- **Evaluation submission**: 90% of evaluations submitted within 72 hours of inspection

**Reconciliation Performance:**

- **Latency**: <10 seconds from both assessments completed to reconciliation completed
- **Escalation rate**: <15% of claims escalated (target: reduce to <10% over 12 months via AI improvement)
- **Auto-approval rate**: >60% of claims auto-approved (low variance, high confidence)

---

## 9. Implementation Roadmap

### 9.1 Phase 1: Parallel Workflow Foundation (Weeks 1-8)

**Deliverables:**
- AI assessment engine integration (damage detection, cost estimation, fraud detection)
- Assessor evaluation form with structured data capture
- Parallel tracking metadata capture
- Database schema for AI assessments, assessor evaluations, and audit trail

**Success Criteria:**
- AI assessment latency <30 seconds
- Assessor evaluation form captures structured damage inventory matching AI schema
- Audit trail captures all AI and assessor events

### 9.2 Phase 2: Reconciliation Intelligence Layer (Weeks 9-16)

**Deliverables:**
- Variance detection algorithm (damage scope, cost, fraud)
- Confidence scoring methodology (AI, assessor, aggregate)
- Unified decision recommendation engine
- Variance analysis report generation

**Success Criteria:**
- Variance detection correctly identifies 95%+ of significant discrepancies
- Confidence scores correlate with actual accuracy (calibration)
- Unified recommendations align with ground truth in 85%+ of cases

### 9.3 Phase 3: Escalation Workflows (Weeks 17-24)

**Deliverables:**
- Escalation trigger rules and severity scoring
- Escalation workflow automation (assignment, notification, SLA tracking)
- Escalation handler portal with side-by-side comparison view
- Resolution documentation and feedback capture

**Success Criteria:**
- Escalation SLA compliance >95%
- Escalation handler portal enables efficient review (avg. 15 minutes per escalation)
- Resolution outcomes are captured for AI training feedback

### 9.4 Phase 4: AI Training Feedback Loop (Weeks 25-32)

**Deliverables:**
- Ground truth labeling pipeline
- Training data enrichment process
- Model retraining automation (monthly cadence)
- A/B testing framework for new model versions

**Success Criteria:**
- AI accuracy improves by 5%+ after first retraining cycle
- A/B testing framework enables safe model deployment
- Escalation rate decreases by 10%+ over 6 months

### 9.5 Phase 5: Insurer Override and Governance (Weeks 33-40)

**Deliverables:**
- Insurer override workflow with approval thresholds
- Override justification capture and audit
- Compliance reporting dashboards (POPIA, FSCA, GDPR)
- Ethical AI bias auditing tools

**Success Criteria:**
- Override workflow supports dual authorization for high-value overrides
- Compliance reports demonstrate regulatory adherence
- Bias audits show no statistically significant demographic disparities

---

## 10. Security Threat Model

### 10.1 Threat Vectors

**Threat 1: AI Model Manipulation**

- **Attack**: Adversarial examples (manipulated damage photos) designed to fool AI into misclassifying damage or underestimating costs
- **Mitigation**: Adversarial training (train AI on adversarial examples), input validation (detect anomalous image properties), human assessor cross-check

**Threat 2: Assessor-AI Collusion**

- **Attack**: Assessor deliberately submits evaluations that align with AI to enable fraudulent claims to pass low-variance auto-approval
- **Mitigation**: Random audit sampling, assessor performance monitoring (flag assessors with suspiciously low variance rates), periodic re-inspections by independent assessors

**Threat 3: Training Data Poisoning**

- **Attack**: Injection of fraudulent ground truth labels into AI training data to bias future model behavior
- **Mitigation**: Ground truth labeling access control (restrict to authorized escalation handlers), anomaly detection in training data (flag outlier labels), model performance monitoring (detect accuracy degradation)

**Threat 4: Escalation Handler Fraud**

- **Attack**: Escalation handler overrides legitimate AI fraud flags to approve fraudulent claims in exchange for kickbacks
- **Mitigation**: Dual authorization for high-value overrides, override pattern analysis (flag handlers with high override rates or suspicious patterns), audit trail review

**Threat 5: Unauthorized Access to AI Models**

- **Attack**: Theft of AI model weights or training data for competitive advantage or reverse engineering
- **Mitigation**: Encryption at rest and in transit, access control (RBAC), model watermarking (embed unique identifiers in models), security monitoring

**Threat 6: Denial of Service (DoS) on AI Infrastructure**

- **Attack**: Flood AI assessment engine with fake claims to overwhelm infrastructure and delay legitimate claims
- **Mitigation**: Rate limiting, CAPTCHA on claim submission, DDoS protection (e.g., Cloudflare), auto-scaling infrastructure

---

## 11. Conclusion

The Hybrid AI-Human Assessor Decision Workflow Architecture represents a paradigm shift in insurance claims processing, moving from a binary choice between AI automation and human judgment to a **synergistic collaboration** where both approaches complement and validate each other. By implementing parallel assessment workflows, intelligent variance detection, confidence-based escalation, and continuous AI improvement through human feedback, KINGA achieves the best of both worlds: the speed and consistency of AI with the nuanced judgment and accountability of human experts.

The architecture is designed for **regulatory compliance, ethical AI principles, and continuous improvement**, ensuring that KINGA not only meets current insurance industry standards but sets a new benchmark for transparent, fair, and efficient claims processing. As AI models improve through the feedback loop, the system will progressively reduce reliance on escalations while maintaining human oversight for edge cases and high-stakes decisions.

This hybrid approach positions KINGA as a **future-proof platform** that can adapt to evolving AI capabilities, regulatory requirements, and customer expectations, delivering superior outcomes for insurers, assessors, and claimants alike.

---

## References

[1]: expert.ai. (2024). *How Hybrid AI is Transforming the Claims Process*. Retrieved from https://www.expert.ai/blog/how-hybrid-ai-is-transforming-the-claims-process/

[2]: bolttech. (2025). *Human + AI: Why the future of insurance is hybrid model*. Retrieved from https://bolttech.io/insights/human-ai-why-the-future-of-insurance-is-hybrid-model/

---

**Document Control:**
- **Version History**: 1.0 (Initial Release)
- **Next Review Date**: August 11, 2026
- **Document Owner**: Tavonga Shoko, KINGA Technical Architecture Team
- **Approval Status**: Draft for Review
