# KINGA End-to-End Claim Walkthrough

**Author:** Tavonga Shoko, Lead Engineer

This document traces a complete motor claim from submission to settlement, showing exactly what happens at every step: which code runs, what data is written to the DB, which notifications are sent, and which reports are generated.

**Test claim used:** DOC-20260802-AE62B9CF (Toyota Corolla, rear impact, 4 quotes received)

---

## Step 1: Claim Submission (FNOL)

**Channel:** My Portal (`/client/submit-claim`) or WhatsApp

**What the claimant does:** Fills in vehicle details (make, model, year, registration), incident details (date, location, description), uploads damage photos, and selects 3 panel beaters from the insurer-approved list.

**Code path:**
```
client/src/pages/SubmitClaim.tsx
  → trpc.claims.submit.useMutation()
  → server/routers/claims-core.ts: submit procedure
  → server/db.ts: createClaim()
  → drizzle/schema.ts: claims table
```

**DB writes:**
```sql
INSERT INTO claims (
  claim_number,        -- CLM-XXXXXXXXXX (nanoid)
  claimant_id,         -- user.id
  vehicle_make,        -- "Toyota"
  vehicle_model,       -- "Corolla"
  vehicle_year,        -- 2019
  vehicle_registration,-- "ABC 1234"
  incident_date,       -- "2026-08-02"
  incident_description,-- "Rear-ended at traffic lights..."
  damage_photos,       -- JSON array of S3 URLs
  policy_number,       -- "POL-12345"
  status,              -- "intake_pending"
  workflow_state,      -- "intake_queue"
  claim_source         -- "client_portal"
)
```

**Notifications sent:** None at submission. The claimant sees a confirmation screen.

---

## Step 2: Intake Gate Check

**Trigger:** Automatic, immediately after claim creation

**Code path:**
```
server/db.ts: triggerAiAssessment(claimId)
  → server/db.ts: runDocumentHealthGate()
  → server/pipeline-v2/pipelineGateController.ts: evaluateGate()
```

**What it checks:**
- Photo count (minimum 1 required)
- Document completeness (incident description, vehicle details)
- Conflict detection (temporal impossibility, etc.)

**Critical policy:** The gate **never blocks** the pipeline. If `mayProceed=false`, the pipeline logs a warning, sends an in-app notification to claims processors ("⚠️ Low Document Quality"), and proceeds in degraded mode.

**DB writes:** None (gate result is logged to console and notification only)

---

## Step 3: AI Pipeline (14 Stages)

**Trigger:** `triggerAiAssessment(claimId)` in `server/db.ts` (line ~683)

**Concurrency:** Protected by semaphore (`MAX_CONCURRENT_PIPELINES = 1`). Concurrent claims are queued.

**Resume support:** If interrupted, `loadCompletedStages()` from `db-pipeline.ts` skips already-completed stages.

### Stage 1: Ingestion
```
server/pipeline-v2/stage-1-ingestion.ts
```
Parses the uploaded PDF/images using OCR. Extracts raw text from the claim form, registration book, and damage photos.

**DB write:** `ai_assessments.ingestion_json`

### Stage 2–3: Extraction and Structured Extraction
```
server/pipeline-v2/stage-2-extraction.ts
server/pipeline-v2/stage-3-structured-extraction.ts
```
LLM extracts structured fields: vehicle make/model/year/VIN, incident date/location/type, claimant name/ID, driver details.

**DB write:** `ai_assessments.extraction_json`, `ai_assessments.structured_json`

### Stage 4–5: Validation and Assembly
```
server/pipeline-v2/stage-4-validation.ts
server/pipeline-v2/stage-5-assembly.ts
```
Validates extracted fields (temporal guards, format checks). Assembles the canonical claim record from all extracted data.

**DB write:** `ai_assessments.validation_json`, `ai_assessments.assembly_json`

### Stage 6: Damage Analysis
```
server/pipeline-v2/stage-6-damage-analysis.ts
server/pipeline-v2/stage-6-5a-vge.ts  (Vehicle Geometry Engine)
server/pipeline-v2/stage-6-5b-vgr.ts  (Vehicle Geometry Reconstruction)
server/pipeline-v2/stage-6-5c-slpe.ts (Structural Load Path Engine)
```
Vision AI analyses damage photos. Identifies damaged components (Front Bumper, Front Grille, etc.) with confidence scores. Maps components to structural zones. Detects photo-narrative contradictions (e.g., front damage components on a claimed rear-impact).

**DB write:** `ai_assessments.damage_analysis_json`, `ai_assessments.enriched_photos_json`

**Example output for test claim:**
```json
{
  "damagedComponents": [
    { "name": "Front Bumper Bar", "confidence": 85, "zone": "FRONT", "source": "vision" },
    { "name": "Front Grille", "confidence": 78, "zone": "FRONT", "source": "vision" }
  ],
  "directionContradiction": true,
  "collisionDirection": "REAR",
  "photoZoneLabel": "FRONT"
}
```
> Note: `directionContradiction: true` because the claim narrative says "rear impact" but photos show front damage. This is flagged in the FR report with a ⚠️ badge.

### Stage 7: Physics Analysis
```
server/pipeline-v2/stage-7-physics.ts
server/accidentPhysics.ts
```
Applies impulse-momentum analysis to estimate collision speed. Uses coefficient of friction based on road surface (dry tarmac: μ=0.7, wet: μ=0.4, gravel: μ=0.3).

**Key formula:** `v = √(2μgd)` where d is stopping distance, μ is friction coefficient, g is 9.81 m/s²

**DB write:** `ai_assessments.physics_analysis_json`, `ai_assessments.cross_validation_json`

**Example output:**
```json
{
  "estimatedSpeedKmh": 61,
  "claimedSpeedKmh": 80,
  "speedDeviation": "23%",
  "physicsConsistency": "INCONSISTENT",
  "roadSurface": "dry_tarmac",
  "mu": 0.7
}
```

### Stage 8: Fraud Scoring
```
server/pipeline-v2/stage-8-fraud.ts
server/fraud-scoring.ts
```
Evaluates 12 fraud signals: speed inconsistency, photo-narrative contradiction, late submission, repeat claimant, network relationships, component mismatch, and more.

**DB write:** `ai_assessments.fraud_analysis_json`

**Example output:**
```json
{
  "overallFraudScore": 42,
  "riskLevel": "MEDIUM",
  "components": {
    "speedInconsistency": 15,
    "directionContradiction": 12,
    "lateSubmission": 8,
    "repeatClaimant": 7
  }
}
```

### Stage 9: Cost Intelligence
```
server/pipeline-v2/stage-9-cost.ts
server/pipeline-v2/quoteOptimisationEngine.ts
```
Extracts per-line prices from submitted quote PDFs using OCR. Builds a composite optimised quote by selecting the best price per component across all quotes.

**Pricing tiers:** T1 (benchmark P50) → T2 (adjusted benchmark) → T3 (lowest submitted) → T4 (unpriced)

**DB write:** `ai_assessments.cost_intelligence_json`

**Key fields:**
- `l2CompositeOptimisedCostUsd`: KINGA Optimised total (e.g., $993 for 4 priced components)
- `documentedAgreedCostUsd`: Lowest submitted quote ($1,995.33)
- `documentedOriginalQuoteUsd`: Highest submitted quote ($2,443.75)

**Benchmark learning:** Selected prices written to `component_repair_outcomes` after this stage.

### Stage 9.5: Crash Geometry Intelligence (CGI)
```
server/pipeline-v2/stage-9-5-cgi.ts
```
Evaluates 7 structural consistency indicators: Contact Patch Ratio, Bumper Height Compatibility, Force Density Index, Load Path Coherence, Overlap Fraction Consistency, Multi-Image Convergence, Structural Zone Activation.

**DB write:** `ai_assessments.cgi_analysis_json`

### Stage 10: Report Generation + Interpretation
```
server/pipeline-v2/stage-10-report.ts
server/pipeline-v2/stage-10i-interpretation.ts
server/reporting/reportDefinitions.ts       (CL report)
server/reporting/claimsIntelligenceReport.ts (CI report)
server/reporting/forensicDecisionReport.ts  (FR report)
```
Generates three PDF reports. The interpretation engine adds plain-language summaries to each report.

**DB write:** `ai_assessments.status = "complete"`, report URLs stored in `ai_assessments`

---

## Step 4: Claims Processor Review

**Portal:** Insurer Portal → Claims Processing (`/insurer/claims`)

**What the processor sees:**
- Claim summary with AI assessment status
- Fraud score badge (42% MEDIUM for test claim)
- Physics consistency flag (INCONSISTENT — claimed 80 km/h, physics says 61 km/h)
- Direction contradiction badge (front damage on rear-impact claim)
- Quote comparison table (4 quotes, KINGA Optimised column)
- CL, CI, FR report download buttons

**Code path:**
```
client/src/pages/InsurerComparisonView.tsx
  → trpc.aiAssessments.getByClaimId.useQuery()
  → server/routers/ai-assessments-core.ts
  → server/db.ts: getAssessmentByClaimId()
```

---

## Step 5: Assessor Assignment

**Action:** Claims processor assigns to an internal or external assessor

**Code path:**
```
client/src/pages/InsurerComparisonView.tsx: AssignAssessor button
  → trpc.claims.assignToAssessor.useMutation()
  → server/routers/claims-core.ts: assignToAssessor procedure
  → server/db.ts: assignClaimToAssessor()
```

**DB writes:**
```sql
UPDATE claims SET
  assigned_assessor_id = ?,
  status = "assessment_in_progress",
  workflow_state = "assessor_review"
WHERE id = ?
```

**Notification sent to claimant:**
> "Your Claim Is Being Assessed — KINGA has completed its analysis. An assessor will review your claim within 24 hours."

---

## Step 6: Settlement Approval

**Action:** Claims manager approves settlement

**Code path:**
```
client/src/pages/ClaimsManagerDashboard.tsx
  → trpc.claims.approveClaim.useMutation()
  → server/routers/claims-core.ts: approveClaim procedure
  → server/db.ts: updateClaimStatus()
  → server/db.ts: createAuditEntry()
  → server/db.ts: createNotification()
```

**DB writes:**
```sql
UPDATE claims SET
  status = "approved",
  workflow_state = "settlement_approved",
  approved_by = ?,
  approved_at = NOW()
WHERE id = ?

INSERT INTO audit_trail (claim_id, user_id, action, change_description, ...)

INSERT INTO notifications (user_id, title, message, ...)
```

**Notification sent to claimant:**
> "Your Claim Has Been Approved — Your claim [CLM-XXXXXXXXXX] has been approved. Repairs can now proceed."

---

## Step 7: Settlement

**Action:** Claimant accepts settlement

**Code path:**
```
client/src/pages/ClientPortal.tsx: Accept Settlement button
  → trpc.claims.acceptSettlement.useMutation()
  → server/routers/claims-core.ts: acceptSettlement procedure
  → server/db.ts: updateClaimStatus()
```

**DB writes:**
```sql
UPDATE claims SET
  status = "settled",
  workflow_state = "closed",
  settlement_amount_cents = ?,
  settled_at = NOW()
WHERE id = ?
```

**Notification sent to claimant:**
> "Your Claim Has Been Settled — Settlement amount of $1,995.33 has been processed. Allow 3–5 business days for funds to reflect."

---

## Data Flow Summary

```
claims table          → Core claim record (status, vehicle, incident)
ai_assessments table  → All pipeline outputs (14 JSON columns)
quote_line_items      → Per-component prices from submitted quotes
component_repair_outcomes → Benchmark learning data
audit_trail           → Every state change with actor and timestamp
notifications         → In-app notifications to claimant and processor
```

## Key Invariants

1. Every state transition writes an audit entry — no silent changes.
2. The gate never blocks — the pipeline always proceeds.
3. AI outputs are advisory — every approval requires human action.
4. Benchmark data grows with every claim — cost intelligence improves over time.
5. The claimant receives a plain-language notification at every state transition.
