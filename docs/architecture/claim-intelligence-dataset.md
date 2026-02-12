# KINGA Claim Intelligence Dataset Capture Architecture

**Date:** February 12, 2026  
**Phase:** 2 of 8 — Production Hardening & Intelligence Maturity  
**Purpose:** Design persistent dataset capture system for ML training and continuous learning

---

## 1. Executive Summary

This document specifies the **Claim Intelligence Dataset Capture Layer** — a comprehensive system for logging structured training data from every processed claim. The dataset will serve as the foundation for:

- **Continuous Learning Pipeline** (Phase 3) — Training improved ML models from production data
- **Assessor Benchmarking** (Phase 5) — Measuring assessor accuracy vs AI vs final approved costs
- **Fraud Pattern Evolution** (Phase 6) — Detecting emerging fraud tactics over time
- **Model Accuracy Drift Monitoring** (Phase 6) — Identifying when models need retraining

**Design Principles:**

- **Append-only logging** — Never delete or modify captured records (immutable audit trail)
- **Versioned feature schema** — Support schema evolution without breaking existing records
- **Multi-tenant isolation** — Ensure dataset capture respects tenant boundaries
- **Privacy-preserving** — Exclude PII from training datasets (vehicle VIN, claimant names)

---

## 2. Dataset Schema Design

### 2.1 Core Table: `claim_intelligence_dataset`

This table captures a **snapshot of all intelligence features** at the moment a claim reaches final approval (ground truth capture trigger).

```sql
CREATE TABLE claim_intelligence_dataset (
  -- Primary Key
  id INT AUTO_INCREMENT PRIMARY KEY,
  
  -- Foreign Keys
  claim_id INT NOT NULL,
  tenant_id VARCHAR(255),
  
  -- Schema Version (for feature evolution)
  schema_version INT NOT NULL DEFAULT 1,
  
  -- CLAIM CONTEXT FEATURES
  vehicle_make VARCHAR(100),
  vehicle_model VARCHAR(100),
  vehicle_year INT,
  vehicle_mass INT, -- kg, for physics validation
  accident_type VARCHAR(50), -- 'frontal', 'rear', 'side', 'rollover', 'multi-impact'
  impact_direction VARCHAR(50), -- 'front', 'rear', 'left', 'right', 'top'
  accident_description_text TEXT,
  police_report_presence TINYINT DEFAULT 0, -- Boolean flag
  
  -- DAMAGE FEATURES
  detected_damage_components JSON, -- Array of component names
  damage_severity_scores JSON, -- Map of component → severity (0-100)
  llm_damage_reasoning TEXT, -- AI's explanation of damage assessment
  physics_plausibility_score INT, -- 0-100, from physics validator
  
  -- ASSESSMENT FEATURES
  ai_estimated_cost INT, -- cents
  assessor_adjusted_cost INT, -- cents (if assessor modified AI estimate)
  insurer_approved_cost INT, -- cents (final ground truth)
  cost_variance_ai_vs_assessor INT, -- percentage
  cost_variance_assessor_vs_final INT, -- percentage
  cost_variance_ai_vs_final INT, -- percentage
  
  -- FRAUD FEATURES
  ai_fraud_score INT, -- 0-100
  fraud_explanation TEXT,
  final_fraud_outcome VARCHAR(50), -- 'legitimate', 'fraudulent', 'suspicious', 'under_investigation'
  
  -- WORKFLOW FEATURES
  assessor_id INT,
  assessor_tier VARCHAR(50), -- 'free', 'premium', 'enterprise'
  assessment_turnaround_hours DECIMAL(10, 2), -- Hours from assignment to submission
  reassignment_count INT DEFAULT 0, -- Number of times claim was reassigned
  approval_timeline_hours DECIMAL(10, 2), -- Hours from submission to final approval
  
  -- METADATA
  captured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_claim_id (claim_id),
  INDEX idx_tenant_id (tenant_id),
  INDEX idx_captured_at (captured_at),
  INDEX idx_schema_version (schema_version)
);
```

**Key Design Decisions:**

- **JSON fields for complex features** — `detected_damage_components` and `damage_severity_scores` use JSON to support variable-length arrays without schema changes
- **Percentage-based variance fields** — Easier to analyze than absolute differences (e.g., $100 variance on $1000 claim vs $10,000 claim)
- **Turnaround time in hours** — Decimal precision for sub-hour measurements
- **Schema versioning** — `schema_version` field allows adding new features in future without breaking existing ML pipelines

---

### 2.2 Supporting Table: `claim_events`

Event log for tracking all state transitions and actions taken on a claim. Used for:

- Reconstructing claim timelines
- Identifying workflow bottlenecks
- Calculating turnaround times

```sql
CREATE TABLE claim_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  claim_id INT NOT NULL,
  event_type VARCHAR(100) NOT NULL, -- 'claim_submitted', 'ai_assessment_completed', 'assessor_assigned', etc.
  event_payload JSON, -- Flexible payload for event-specific data
  user_id INT, -- Who triggered the event (NULL for system events)
  user_role VARCHAR(50), -- Role at time of event
  tenant_id VARCHAR(255),
  emitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_claim_id (claim_id),
  INDEX idx_event_type (event_type),
  INDEX idx_emitted_at (emitted_at)
);
```

**Event Types:**

| Event Type | Trigger | Payload Example |
|------------|---------|-----------------|
| `claim_submitted` | Claimant submits claim | `{ "damagePhotoCount": 5, "policyVerified": true }` |
| `ai_assessment_triggered` | AI assessment starts | `{ "photoCount": 5, "vehicleYear": 2020 }` |
| `ai_assessment_completed` | AI assessment finishes | `{ "estimatedCost": 45000, "fraudRiskLevel": "low" }` |
| `assessor_assigned` | Assessor assigned to claim | `{ "assessorId": 123, "assessorTier": "premium" }` |
| `assessor_evaluation_submitted` | Assessor submits evaluation | `{ "adjustedCost": 48000, "turnaroundHours": 3.5 }` |
| `quotes_received` | All panel beater quotes received | `{ "quoteCount": 3, "lowestQuote": 42000 }` |
| `claim_approved` | Insurer approves claim | `{ "approvedAmount": 45000, "selectedQuoteId": 456 }` |
| `claim_rejected` | Insurer rejects claim | `{ "reason": "Pre-existing damage detected" }` |
| `claim_disputed` | Claimant disputes decision | `{ "disputeReason": "Undervalued damage" }` |

---

### 2.3 Supporting Table: `model_training_queue`

Queue for tracking which claims are ready for ML model retraining.

```sql
CREATE TABLE model_training_queue (
  id INT AUTO_INCREMENT PRIMARY KEY,
  claim_id INT NOT NULL,
  dataset_record_id INT NOT NULL, -- FK to claim_intelligence_dataset
  training_priority VARCHAR(50) DEFAULT 'normal', -- 'high', 'normal', 'low'
  processed TINYINT DEFAULT 0, -- Boolean flag
  processed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_processed (processed),
  INDEX idx_training_priority (training_priority),
  INDEX idx_created_at (created_at)
);
```

**Purpose:**

- Decouples dataset capture from model training
- Allows batch training (e.g., retrain model every 100 new claims)
- Supports priority training (e.g., high-value claims or fraud cases)

---

## 3. Event Logging Hooks

### 3.1 Hook Locations in Claim Lifecycle

Event logging hooks must be inserted at the following points in `server/routers.ts`:

| Hook Location | Event Type | Data to Capture |
|---------------|------------|-----------------|
| `claims.create` mutation (line 399) | `claim_submitted` | Vehicle details, damage photo count, policy verification status |
| `triggerAiAssessment()` function (db.ts:291) | `ai_assessment_triggered` | Photo count, vehicle year, accident type |
| `triggerAiAssessment()` function (db.ts:485) | `ai_assessment_completed` | Estimated cost, fraud risk level, detected components |
| `assessor.assignClaim` mutation (line 523) | `assessor_assigned` | Assessor ID, tier, assignment timestamp |
| `assessor.submitEvaluation` mutation (line 593) | `assessor_evaluation_submitted` | Adjusted cost, turnaround time, confidence score |
| `panelBeater.submitQuote` mutation (line 953) | `quote_submitted` | Quote amount, panel beater ID |
| `claims.approveClaim` mutation (line 700) | `claim_approved` | Approved amount, selected quote ID, approver user ID |

---

### 3.2 Hook Implementation Pattern

**Standardized event emission function:**

```typescript
// server/dataset-capture.ts

export async function emitClaimEvent(event: {
  claimId: number;
  eventType: string;
  payload: Record<string, any>;
  userId?: number;
  userRole?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Get claim to extract tenant_id
  const claim = await getClaimById(event.claimId);
  if (!claim) throw new Error("Claim not found");
  
  await db.insert(claimEvents).values({
    claimId: event.claimId,
    eventType: event.eventType,
    eventPayload: JSON.stringify(event.payload),
    userId: event.userId || null,
    userRole: event.userRole || null,
    tenantId: claim.tenantId,
    emittedAt: new Date(),
  });
}
```

**Example usage in mutation:**

```typescript
// In claims.create mutation (routers.ts:399)
await createClaim({
  // ... claim data
});

// Emit event
await emitClaimEvent({
  claimId: newClaim.id,
  eventType: "claim_submitted",
  payload: {
    damagePhotoCount: input.damagePhotos.length,
    policyVerified: false, // Will be verified later
    vehicleYear: input.vehicleYear,
  },
  userId: ctx.user.id,
  userRole: ctx.user.role,
});
```

---

### 3.3 Turnaround Time Calculation

Turnaround times are calculated by querying the `claim_events` table:

```typescript
export async function calculateAssessmentTurnaround(claimId: number): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const events = await db.select()
    .from(claimEvents)
    .where(eq(claimEvents.claimId, claimId))
    .orderBy(claimEvents.emittedAt);
  
  const assignedEvent = events.find(e => e.eventType === "assessor_assigned");
  const submittedEvent = events.find(e => e.eventType === "assessor_evaluation_submitted");
  
  if (!assignedEvent || !submittedEvent) return 0;
  
  const turnaroundMs = submittedEvent.emittedAt.getTime() - assignedEvent.emittedAt.getTime();
  return turnaroundMs / (1000 * 60 * 60); // Convert to hours
}
```

---

## 4. Dataset Capture Trigger

### 4.1 Trigger Point: Final Approval

The dataset capture is triggered when a claim reaches **final approval** (insurer approves claim and selects panel beater quote).

**Trigger location:** `claims.approveClaim` mutation (routers.ts:700)

**Implementation:**

```typescript
// In claims.approveClaim mutation
await updateClaimStatus(input.claimId, "repair_assigned");

// Capture dataset snapshot
await captureClaimIntelligenceDataset(input.claimId, {
  approvedAmount: selectedQuote.quotedAmount,
  approvedBy: ctx.user.id,
  approvedAt: new Date(),
});

// Emit approval event
await emitClaimEvent({
  claimId: input.claimId,
  eventType: "claim_approved",
  payload: {
    approvedAmount: selectedQuote.quotedAmount,
    selectedQuoteId: input.selectedQuoteId,
  },
  userId: ctx.user.id,
  userRole: ctx.user.insurerRole || ctx.user.role,
});
```

---

### 4.2 Dataset Capture Function

```typescript
// server/dataset-capture.ts

export async function captureClaimIntelligenceDataset(
  claimId: number,
  approval: {
    approvedAmount: number;
    approvedBy: number;
    approvedAt: Date;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // 1. Fetch claim details
  const claim = await getClaimById(claimId);
  if (!claim) throw new Error("Claim not found");
  
  // 2. Fetch AI assessment
  const aiAssessment = await db.select()
    .from(aiAssessments)
    .where(eq(aiAssessments.claimId, claimId))
    .limit(1);
  
  if (aiAssessment.length === 0) {
    console.warn(`No AI assessment found for claim ${claimId}, skipping dataset capture`);
    return;
  }
  
  const ai = aiAssessment[0];
  
  // 3. Fetch assessor evaluation (if exists)
  const assessorEval = await db.select()
    .from(assessorEvaluations)
    .where(eq(assessorEvaluations.claimId, claimId))
    .limit(1);
  
  const assessor = assessorEval.length > 0 ? assessorEval[0] : null;
  
  // 4. Calculate turnaround times
  const assessmentTurnaround = await calculateAssessmentTurnaround(claimId);
  const approvalTimeline = await calculateApprovalTimeline(claimId);
  
  // 5. Calculate cost variances
  const aiCost = ai.estimatedCost || 0;
  const assessorCost = assessor?.estimatedCost || aiCost;
  const finalCost = approval.approvedAmount;
  
  const varianceAiVsAssessor = assessorCost > 0 
    ? Math.round(Math.abs(aiCost - assessorCost) / assessorCost * 100)
    : 0;
  
  const varianceAssessorVsFinal = finalCost > 0
    ? Math.round(Math.abs(assessorCost - finalCost) / finalCost * 100)
    : 0;
  
  const varianceAiVsFinal = finalCost > 0
    ? Math.round(Math.abs(aiCost - finalCost) / finalCost * 100)
    : 0;
  
  // 6. Parse damage components
  const damagedComponents = ai.detectedDamageTypes 
    ? JSON.parse(ai.detectedDamageTypes)
    : [];
  
  const damageSeverityScores = ai.damagedComponentsJson
    ? JSON.parse(ai.damagedComponentsJson)
    : {};
  
  // 7. Determine fraud outcome (default to 'legitimate' unless flagged)
  const fraudOutcome = ai.fraudRiskLevel === "high" ? "suspicious" : "legitimate";
  
  // 8. Get assessor details
  const assessorUser = claim.assignedAssessorId 
    ? await db.select().from(users).where(eq(users.id, claim.assignedAssessorId)).limit(1)
    : [];
  
  const assessorTier = assessorUser.length > 0 ? assessorUser[0].assessorTier : null;
  
  // 9. Count reassignments
  const reassignmentCount = await db.select({ count: sql`COUNT(*)` })
    .from(claimEvents)
    .where(and(
      eq(claimEvents.claimId, claimId),
      eq(claimEvents.eventType, "assessor_assigned")
    ));
  
  // 10. Insert dataset record
  const datasetRecord = await db.insert(claimIntelligenceDataset).values({
    claimId,
    tenantId: claim.tenantId,
    schemaVersion: 1,
    
    // Claim context
    vehicleMake: claim.vehicleMake,
    vehicleModel: claim.vehicleModel,
    vehicleYear: claim.vehicleYear,
    vehicleMass: null, // TODO: Add vehicle mass lookup
    accidentType: ai.accidentType || "unknown",
    impactDirection: ai.impactDirection || "unknown",
    accidentDescriptionText: claim.incidentDescription,
    policeReportPresence: 0, // TODO: Check if police report exists
    
    // Damage features
    detectedDamageComponents: JSON.stringify(damagedComponents),
    damageSeverityScores: JSON.stringify(damageSeverityScores),
    llmDamageReasoning: ai.damageDescription,
    physicsPlausibilityScore: ai.confidenceScore || 0,
    
    // Assessment features
    aiEstimatedCost: aiCost,
    assessorAdjustedCost: assessorCost,
    insurerApprovedCost: finalCost,
    costVarianceAiVsAssessor: varianceAiVsAssessor,
    costVarianceAssessorVsFinal: varianceAssessorVsFinal,
    costVarianceAiVsFinal: varianceAiVsFinal,
    
    // Fraud features
    aiFraudScore: ai.fraudRiskScore || 0,
    fraudExplanation: ai.fraudIndicators ? JSON.stringify(ai.fraudIndicators) : null,
    finalFraudOutcome: fraudOutcome,
    
    // Workflow features
    assessorId: claim.assignedAssessorId,
    assessorTier,
    assessmentTurnaroundHours: assessmentTurnaround,
    reassignmentCount: reassignmentCount[0]?.count || 0,
    approvalTimelineHours: approvalTimeline,
    
    capturedAt: new Date(),
  });
  
  // 11. Add to training queue
  await db.insert(modelTrainingQueue).values({
    claimId,
    datasetRecordId: datasetRecord.insertId,
    trainingPriority: "normal",
    processed: 0,
  });
  
  console.log(`Dataset captured for claim ${claimId}, record ID: ${datasetRecord.insertId}`);
}
```

---

## 5. Privacy & Compliance

### 5.1 PII Exclusion

The following fields are **excluded** from the dataset to protect claimant privacy:

- Claimant name
- Claimant email
- Claimant phone number
- Vehicle VIN
- Vehicle registration number
- Exact incident location (only city/region captured)
- Damage photo URLs (only photo count captured)

### 5.2 Multi-Tenant Isolation

All dataset records include `tenant_id` to ensure:

- Insurers only access their own training data
- Cross-tenant data leakage is prevented
- Regulatory compliance (e.g., GDPR, POPIA)

### 5.3 Data Retention

- Dataset records are **immutable** (never deleted or modified)
- Retention period: 7 years (standard insurance industry practice)
- Anonymization: After 2 years, PII fields in source tables can be anonymized while preserving dataset records

---

## 6. Schema Evolution Strategy

### 6.1 Adding New Features

When new features are added to the dataset (e.g., "weather_conditions", "driver_age_bracket"), increment `schema_version`:

```sql
ALTER TABLE claim_intelligence_dataset
  ADD COLUMN weather_conditions VARCHAR(50),
  ADD COLUMN driver_age_bracket VARCHAR(20);
```

Update the capture function to populate new fields:

```typescript
await db.insert(claimIntelligenceDataset).values({
  // ... existing fields
  schemaVersion: 2, // Increment version
  weatherConditions: "rainy", // New field
  driverAgeBracket: "25-35", // New field
});
```

### 6.2 Handling Schema Versions in ML Pipelines

ML training scripts must handle multiple schema versions:

```python
# training/prepare_dataset.py

def load_dataset(min_schema_version=1):
    records = db.query("SELECT * FROM claim_intelligence_dataset WHERE schema_version >= ?", [min_schema_version])
    
    for record in records:
        if record['schema_version'] == 1:
            # Use default values for missing fields
            record['weather_conditions'] = 'unknown'
            record['driver_age_bracket'] = 'unknown'
        
        yield record
```

---

## 7. Performance Considerations

### 7.1 Async Capture

Dataset capture should be **asynchronous** to avoid blocking the approval mutation:

```typescript
// In claims.approveClaim mutation
await updateClaimStatus(input.claimId, "repair_assigned");

// Capture dataset in background (don't await)
captureClaimIntelligenceDataset(input.claimId, {
  approvedAmount: selectedQuote.quotedAmount,
  approvedBy: ctx.user.id,
  approvedAt: new Date(),
}).catch(error => {
  console.error(`Failed to capture dataset for claim ${input.claimId}:`, error);
  // Log error but don't fail the approval
});
```

### 7.2 Indexing Strategy

Indexes are critical for fast dataset queries:

- `idx_claim_id` — Fast lookup of dataset record for a specific claim
- `idx_tenant_id` — Fast filtering by tenant for multi-tenant queries
- `idx_captured_at` — Fast time-range queries (e.g., "last 30 days")
- `idx_schema_version` — Fast filtering by schema version for ML pipelines

---

## 8. Testing Strategy

### 8.1 Unit Tests

Test dataset capture function with mock data:

```typescript
// server/dataset-capture.test.ts

describe("Dataset Capture", () => {
  it("should capture complete dataset when claim is approved", async () => {
    const claimId = await createTestClaim();
    await triggerAiAssessment(claimId);
    await assignAssessor(claimId, testAssessorId);
    await submitAssessorEvaluation(claimId, { estimatedCost: 50000 });
    
    await captureClaimIntelligenceDataset(claimId, {
      approvedAmount: 48000,
      approvedBy: testInsurerId,
      approvedAt: new Date(),
    });
    
    const dataset = await getDatasetRecord(claimId);
    expect(dataset).toBeDefined();
    expect(dataset.aiEstimatedCost).toBeGreaterThan(0);
    expect(dataset.insurerApprovedCost).toBe(48000);
    expect(dataset.costVarianceAiVsFinal).toBeGreaterThan(0);
  });
});
```

### 8.2 Integration Tests

Test end-to-end claim lifecycle with dataset capture:

```typescript
it("should capture dataset after full claim lifecycle", async () => {
  // Submit claim
  const { claimNumber } = await trpc.claims.create.mutate({ ... });
  const claim = await getClaimByNumber(claimNumber);
  
  // AI assessment (auto-triggered)
  await waitForAiAssessment(claim.id);
  
  // Assign assessor
  await trpc.assessor.assignClaim.mutate({ claimId: claim.id, assessorId: testAssessorId });
  
  // Submit evaluation
  await trpc.assessor.submitEvaluation.mutate({ claimId: claim.id, estimatedCost: 50000 });
  
  // Submit quotes
  await trpc.panelBeater.submitQuote.mutate({ claimId: claim.id, quotedAmount: 48000 });
  
  // Approve claim
  await trpc.claims.approveClaim.mutate({ claimId: claim.id, selectedQuoteId: quoteId });
  
  // Verify dataset captured
  const dataset = await getDatasetRecord(claim.id);
  expect(dataset).toBeDefined();
  expect(dataset.schemaVersion).toBe(1);
});
```

---

## 9. Deployment Checklist

- [ ] Create `claim_intelligence_dataset` table
- [ ] Create `claim_events` table
- [ ] Create `model_training_queue` table
- [ ] Implement `emitClaimEvent()` function
- [ ] Implement `captureClaimIntelligenceDataset()` function
- [ ] Add event hooks to all claim lifecycle mutations
- [ ] Add dataset capture trigger to `approveClaim` mutation
- [ ] Write unit tests for dataset capture
- [ ] Write integration tests for full lifecycle
- [ ] Add dataset capture monitoring (track capture success rate)
- [ ] Document dataset schema for ML team

---

## 10. Success Metrics

**Dataset Capture Completeness:**

- **Target:** 100% of approved claims have dataset records
- **Measurement:** `COUNT(DISTINCT claim_id) FROM claim_intelligence_dataset` / `COUNT(*) FROM claims WHERE status = 'completed'`

**Event Logging Coverage:**

- **Target:** All 7 key lifecycle events are logged for every claim
- **Measurement:** Average event count per claim should be ≥ 7

**Dataset Quality:**

- **Target:** <5% of dataset records have NULL values in critical fields (ai_estimated_cost, insurer_approved_cost)
- **Measurement:** `COUNT(*) FROM claim_intelligence_dataset WHERE ai_estimated_cost IS NULL OR insurer_approved_cost IS NULL` / `COUNT(*)`

---

## 11. Next Steps (Phase 3)

Once dataset capture is operational, Phase 3 (Ground Truth Learning Loop) will:

1. Implement automatic model retraining when training queue reaches threshold (e.g., 100 new records)
2. Build assessor performance analytics using captured variance data
3. Implement cost optimization intelligence (identify patterns where AI underestimates/overestimates)

---

**Document Status:** ✅ Complete  
**Implementation Priority:** Critical (blocks Phase 3)  
**Estimated Implementation Time:** 5 days
