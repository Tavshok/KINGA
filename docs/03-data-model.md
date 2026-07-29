# 03 — Data Model

## Core Entities

The schema is defined entirely in `drizzle/schema.ts`. There are approximately 130 tables. The following are the core entities that engineers will interact with most frequently.

---

### `claims`

The central entity. Every claim from every source (web upload, claimant form, WhatsApp, mobile, simulator) creates exactly one row here.

**Key columns:**

| Column | Type | Description |
|--------|------|-------------|
| `id` | int PK | Auto-increment primary key |
| `claimNumber` | varchar(50) | Human-readable ID, format `DOC-YYYYMMDD-XXXXXXXX` |
| `kingaRef` | varchar(40) | Immutable KINGA audit reference, format `KNG-{INSURER_CODE}-{YEAR}-{SEQ}`. Never changes after assignment. |
| `tenantId` | varchar(255) | Tenant scope — all queries MUST filter by this |
| `status` | enum | Current pipeline/workflow status (see 01-system-overview.md) |
| `workflowState` | enum | Governance workflow state (transition-validated) |
| `sourceDocumentId` | int FK → `ingestionDocuments.id` | Set for document-ingestion claims; null for form submissions |
| `claimSource` | varchar(50) | `document_ingestion` \| `claimant_form` \| `simulator` \| `whatsapp` \| etc. |
| `documentProcessingStatus` | varchar(30) | Fine-grained pipeline DPS: `pending` → `parsing` → `extracting` → `analysing` → `DOCUMENT_COMPLETE` \| `DOCUMENT_FAILED` |
| `pipelineCurrentStage` | varchar(100) | Live stage label, e.g. `Stage 6 — Damage Analysis`. Cleared on completion. |
| `aiAssessmentTriggered` | tinyint | 1 when pipeline has been fired (prevents double-trigger) |
| `aiAssessmentCompleted` | tinyint | 1 when pipeline completed successfully |
| `recoveryRetryCount` | int | Incremented by recovery job on each re-trigger. Max 3. |
| `fraudRiskScore` | int | Denormalised from `ai_assessments.fraudScore` for fast queries |
| `confidenceScore` | int | Denormalised from `ai_assessments.confidenceScore` |
| `estimatedCost` | int | Repair cost in cents (from Stage 9) |
| `estimatedSpeedKmh` | decimal | Consensus vehicle speed at impact (from Stage 7) |
| `claimantStatedSpeedKmh` | decimal | **IMMUTABLE** — claimant-stated speed from Stage 3. Never overwritten. |
| `currencyCode` | varchar(10) | ISO 4217, default `USD` for Zimbabwe deployment |
| `productType` | varchar(100) | Insurance product class: `EXCESS`, `COMPREHENSIVE`, `THIRD_PARTY` |
| `fleetAccountId` | int FK | Set for company/fleet claimants |
| `claimantType` | enum | `individual` \| `company` |

**Indexes:** `(tenantId, status)`, `(tenantId, createdAt)`, `(tenantId, workflowState, createdAt)`, `(status)`, `(createdAt)`, `(sourceDocumentId)` unique.

---

### `ai_assessments`

One row per pipeline run. A re-analysis creates a new row with `isReanalysis=1` and `previousAssessmentId` pointing to the prior row.

All stage outputs are stored as `longtext` JSON columns. The column names follow the pattern `{stageName}Json` (e.g., `fraudScoreBreakdownJson`, `repairIntelligenceJson`, `costIntelligenceJson`).

**Key columns:**

| Column | Source | Description |
|--------|--------|-------------|
| `claimId` | FK | Links to `claims.id` (cascade delete) |
| `estimatedCost` | Stage 9 | Total repair cost in cents |
| `confidenceScore` | Stage 7d | Overall pipeline confidence 0–100 |
| `fraudScore` | Stage 8 | Numeric fraud score 0–100 |
| `fraudRiskLevel` | Stage 8 | `low` \| `medium` \| `moderate` \| `high` \| `critical` \| `elevated` |
| `recommendation` | Stage 10 | `APPROVE` \| `REVIEW` \| `REJECT` \| `ESCALATE` \| `NEGOTIATE` \| `PROCEED_TO_ASSESSMENT` |
| `claimRecordJson` | Stage 5 | Full `ClaimRecord` — canonical structured extraction |
| `stage2RawOcrText` | Stage 2 | Raw OCR text (stored for audit and re-extraction) |
| `pipelineRunSummary` | All | `PipelineRunSummary` — per-stage health, durations |
| `forensicExecutionLedgerJson` | Phase 2A | Court-grade audit: input hash, output snapshot, model/prompt versions per stage |
| `assumptionRegistryJson` | Phase 2A | All assumptions introduced during the run |
| `claimTruthObjectJson` | TRE | Canonical Claim Truth Object — single source of truth for all downstream consumers |
| `physicsTruthJson` | Post-Stage 7 | Authoritative physics measurements with provenance |
| `decisionReadinessJson` | Stage 10 | Whether the report is ready for publication |
| `forensicAuditValidationJson` | Stage 36 | 10-dimension post-pipeline validation |
| `sharedWithRolesJson` | Manual | JSON array of insurer sub-roles this report has been pushed to |
| `humanOverride` | Manual | 1 when a human adjuster has overridden any AI decision |
| `fcdiScore` | Phase 2A | Forensic Confidence Degradation Index 0–100 (0 = maximally degraded) |
| `imageAnalysisSuccessRate` | Stage 6 | Percentage of images successfully analysed |

---

### `ingestionDocuments`

One row per uploaded file. Created atomically with the `claims` row in a DB transaction.

| Column | Description |
|--------|-------------|
| `id` | PK |
| `tenantId` | Tenant scope |
| `batchId` | FK → `ingestionBatches.id` |
| `documentId` | UUID (used in S3 key) |
| `s3Key` | S3 object key |
| `s3Url` | Public S3 URL |
| `sha256Hash` | File content hash (used for duplicate detection) |
| `historicalClaimId` | FK → `claims.id` (back-link set after claim creation) |
| `extractionStatus` | `pending` \| `processing` \| `completed` \| `failed` |

---

### `ingestionBatches`

Groups multiple uploaded documents into a batch. One batch per upload request.

---

### `vehicleRegistry`

Canonical vehicle records. The pipeline upserts a vehicle record after Stage 5 and sets `claims.vehicleRegistryId`. Subsequent claims for the same vehicle (matched by VIN or registration) link to the same registry entry, enabling cross-claim vehicle history.

---

### `drivers`

Canonical driver records. The pipeline upserts an insured driver record (`claims.driverRegistryId`) and optionally a third-party driver record (`claims.thirdPartyDriverRegistryId`).

---

### `panelBeaterQuotes`

Repair quotations extracted from uploaded documents (Stage 2.7) or submitted by panel beaters through the marketplace. Linked to `claims.id`.

---

### `approvalWorkflow`

Multi-level approval chain: `assessor → risk_surveyor → risk_manager`. One row per approval level per claim.

---

### `workflowAuditTrail`

Immutable record of every `workflowState` transition. Written by `server/workflow-engine.ts`. Never delete from this table.

---

### `auditTrail` / `auditLogs`

General-purpose audit tables. `auditTrail` is the primary one written by tRPC procedures. `auditLogs` is written by specific modules (analytics, governance).

---

### `users`

| Column | Description |
|--------|-------------|
| `id` | PK |
| `openId` | Manus OAuth subject identifier |
| `role` | Top-level role: `admin` \| `insurer` \| `assessor` \| `panel_beater` \| `claimant` \| `agency` \| `fleet_admin` \| `fleet_manager` \| `fleet_driver` \| `platform_super_admin` |
| `insurerRole` | Insurer sub-role (only for `role=insurer`): see rbac.ts |
| `tenantId` | Tenant scope |

---

### `insurerTenants`

One row per insurer organisation. The `tenantId` string on `claims` and `users` corresponds to `insurerTenants.tenantId`.

---

## Read/Write Ownership by Module

| Table | Primary writer | Primary readers |
|-------|---------------|-----------------|
| `claims` | `upload-documents.ts`, `routers.ts` (submit), `db.ts` (pipeline updates) | All dashboard pages, recovery job |
| `ai_assessments` | `db.ts` (pipeline persistence block) | Report pages, dashboard, analytics |
| `ingestionDocuments` | `upload-documents.ts` | Pipeline (Stage 1 PDF URL resolution) |
| `ingestionBatches` | `upload-documents.ts` | Processor dashboard |
| `vehicleRegistry` | `db.ts` (pipeline Stage 5 upsert) | Vehicle registry page, cross-claim intelligence |
| `drivers` | `db.ts` (pipeline Stage 5 upsert) | Driver registry page |
| `panelBeaterQuotes` | `db.ts` (pipeline Stage 2.7), panel beater portal | Comparison page, cost analysis |
| `approvalWorkflow` | `routers/approval.ts` | Approval workflow pages |
| `workflowAuditTrail` | `workflow-engine.ts` | Audit trail page |
| `auditTrail` | tRPC procedures (via audit helper) | Admin audit page |

---

## Historical Note: Wrong-Table Writes

Early versions of the pipeline wrote some data to `historicalClaims` instead of `claims`. This was corrected. If you see references to `historicalClaims` in pipeline code, verify they are intentional (the historical dataset is a separate feature for training data, not the live claims table).
