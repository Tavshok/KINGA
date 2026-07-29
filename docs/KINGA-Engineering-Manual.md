# KINGA Engineering Manual

**Author:** Tavonga Shoko  
**Last updated:** July 2026  
**Status:** Living document — update when behaviour changes, not after the fact.

---

## About This Manual

This manual is the canonical engineering reference for KINGA — a forensic motor insurance claims intelligence platform. It is written for engineers (including future contractors) who have general full-stack experience but zero prior KINGA context. Every statement in this manual was verified against the actual codebase at the time of writing. Where something could not be verified, it is marked **[needs verification]**.

This manual does **not** contain exact fraud-scoring weights, detection thresholds, pricing tiers, or any real customer data. Those are deliberately excluded.

---

## Sections

| # | File | Contents |
|---|------|----------|
| 1 | [01-system-overview.md](./01-system-overview.md) | What KINGA does, the high-level pipeline, data flow |
| 2 | [02-architecture.md](./02-architecture.md) | Services, modules, portal structure, orchestrator contract |
| 3 | [03-data-model.md](./03-data-model.md) | Core DB tables, relationships, read/write ownership |
| 4 | [04-type-contracts.md](./04-type-contracts.md) | Type enforcement, `@ts-nocheck` inventory, error conventions |
| 5 | [05-pipeline.md](./05-pipeline.md) | Full stage-by-stage pipeline reference |
| 6 | [06-report-stack.md](./06-report-stack.md) | Report tiers, HTML/PDF rendering, design tokens |
| 7 | [07-failure-modes.md](./07-failure-modes.md) | Known bugs found and fixed — do not reintroduce |
| 8 | [08-verification.md](./08-verification.md) | How to verify a change is correct |
| 9 | [09-extension-points.md](./09-extension-points.md) | How to add fields, claim types, portals safely |

---

## Quick Reference

**Tech stack:** React 19 + Tailwind 4 + Express 4 + tRPC 11 + Drizzle ORM + MySQL/TiDB  
**Auth:** Manus OAuth — session cookie, `protectedProcedure` injects `ctx.user`  
**AI:** LLM calls via `invokeLLM()` helper (server-side only), PDF rendering via `pdftoppm` + vision  
**PDF export:** `puppeteer-core` + system Chromium (`/usr/bin/chromium`)  
**File storage:** S3 via `storagePut` / `storageGet` helpers  
**Pipeline:** `server/pipeline-v2/orchestrator.ts` — single entry point `runPipelineV2()`  
**Recovery:** `server/stuck-assessment-recovery-job.ts` — runs every 10 minutes  
**Concurrency:** Max 1 pipeline at a time — in-process semaphore in `server/db.ts`


---

# 01 — System Overview

## What KINGA Does

KINGA is a forensic motor insurance claims intelligence platform. Its primary function is to receive a motor insurance claim document (typically a PDF containing the claim form, repair quotations, and damage photographs), run it through a multi-stage AI pipeline, and produce a structured forensic assessment that tells an insurer:

- What damage was actually sustained and whether it is physically consistent with the reported incident
- Whether the claim exhibits fraud indicators and at what risk level
- What the repair should realistically cost (with parts reconciliation against market benchmarks)
- What the recommended decision is: APPROVE, REVIEW, REJECT, ESCALATE, NEGOTIATE, or PROCEED_TO_ASSESSMENT

The output is a structured database record (the `ai_assessments` row) plus a human-readable report available to insurer staff through the portal.

KINGA is **not** a decision-making system in the legal sense — it produces recommendations and evidence bundles that human adjusters review and act on. Every AI decision is accompanied by a full audit trail including the prompt version, model ID, input hash, and output snapshot.

---

## High-Level Data Flow

```
Claim Source
  │
  ├── Web upload (multipart POST /api/upload-documents)
  ├── tRPC claims.submit (claimant portal form)
  ├── WhatsApp API / mobile app (same tRPC endpoint or REST)
  ├── Fleet incident report (auto-linked to fleet account)
  └── Platform simulator (synthetic test claims)
  │
  ▼
claims table (status = intake_pending, workflowState = intake_queue)
  │
  ▼
triggerAiAssessment(claimId)  ← in-process, via setImmediate
  │                             Recovery: stuck-assessment-recovery-job.ts
  ▼
Pipeline Semaphore (MAX_CONCURRENT_PIPELINES = 1)
  │
  ▼
runPipelineV2(ctx)  ← server/pipeline-v2/orchestrator.ts
  │
  ├── Stage 1:  Document Ingestion (PDF → page images via pdftoppm)
  ├── Stage 2:  OCR & Text Extraction (Tesseract / LLM vision)
  ├── Stage 0a: Document Read Verification
  ├── Stage 0:  Evidence Registry Initialisation
  ├── Stage 3:  Structured Data Extraction (LLM → ClaimRecord JSON)
  ├── Stage 4:  Data Validation (Zod + field-level confidence scoring)
  ├── Stage 5:  Claim Data Assembly (quote normalisation, vehicle lookup)
  ├── Stage 2.5: Automotive Domain Corrector (OCR error correction)
  ├── Stage 2.6: Image Classification (damage photos vs. quote scans)
  ├── Stage 2.7: Embedded Quote Extraction from quotation scan images
  ├── Stage 6:  Damage Analysis (vision-based, per-component)
  ├── Stage 6.5A: Vision Geometry Engine (scale calibration from reference objects)
  ├── Stage 6.5B: Vision Geometry Reconciliation (cross-image crush depth consensus)
  ├── Stage 6.5C: Structural Load Path Engine (penetration depth, energy absorption)
  ├── Stage 7:  Physics & Severity Consensus (accident reconstruction)
  ├── Stage 7b: Causal Reasoning Engine (Pass 1, without fraud/cost)
  ├── Stage 35: Damage-Physics Coherence Validation
  ├── Stage 8 ‖ Stage 9: Fraud Analysis + Cost Optimisation (parallel)
  ├── Stage 7d: Confidence Aggregation
  ├── [Post-S8/S9 parallel block]:
  │     Stage 7b (Pass 2), Stage 36–45, Stage 9b
  ├── Cross-Stage Reconciliation Pass
  ├── Claim Truth Layer (Truth Reconciliation Engine)
  ├── Stage 10: Report Generation (deterministic, no LLM)
  ├── Stage 11: Validated Outcome Recorder (learning gate)
  └── Stage 11.5: Case Signature Generator
  │
  ▼
ai_assessments table (all stage outputs persisted as JSON columns)
claims table (status = analysis_complete, workflowState = ai_assessment_completed)
  │
  ▼
Insurer Portal (ClaimsProcessorDashboard → claim detail → reports)
```

---

## Claim Lifecycle States

A claim moves through two parallel state fields: `status` (legacy, UI-facing) and `workflowState` (governance, transition-validated). The mapping between them is defined in `server/workflow-migration.ts`.

### Status Enum (claims.status)

| Status | Meaning |
|--------|---------|
| `intake_pending` | Claim created, pipeline not yet started |
| `document_validating` | Pipeline started, Stage 1 in progress |
| `document_ready` | Stages 1–5 complete, damage analysis pending |
| `analysis_running` | Stage 6+ in progress |
| `analysis_complete` | Pipeline completed successfully |
| `document_failed` | Pipeline failed (watchdog fired or transient error) |
| `recovery_attempted` | Recovery job re-triggered the pipeline |
| `human_review_required` | Exceeded max retries, needs manual attention |
| `assessment_in_progress` | Legacy: pipeline running (pre-DRA architecture) |
| `assessment_complete` | Legacy: pipeline completed |
| `submitted` | Claimant-submitted form (pre-pipeline) |
| `triage` | Under initial review |
| `quotes_pending` | Awaiting repair quotes |
| `comparison` | Quote comparison stage |
| `repair_assigned` | Panel beater assigned |
| `repair_in_progress` | Repair underway |
| `completed` | Claim closed successfully |
| `rejected` | Claim rejected |
| `closed` | Claim closed (any outcome) |

### WorkflowState Enum (claims.workflowState)

| WorkflowState | Meaning |
|---------------|---------|
| `intake_queue` | Initial state — awaiting pipeline or processor action |
| `created` | Processor has reviewed intake |
| `assigned` | Assessor assigned |
| `under_assessment` | Active assessment in progress |
| `internal_review` | Assessment complete, under internal review |
| `technical_approval` | Awaiting technical sign-off |
| `financial_decision` | Awaiting payment authorisation |
| `payment_authorized` | Payment approved |
| `closed` | Claim closed |
| `disputed` | Claim under dispute |

All transitions are validated by `canTransitionTo()` in `server/rbac.ts` and enforced by the workflow engine in `server/workflow-engine.ts`. **No direct DB updates to `workflowState` should bypass this engine.**

---

## Portals

KINGA serves five distinct user portals, each with its own layout component and role guard:

| Portal | URL prefix | Layout component | Allowed roles |
|--------|-----------|-----------------|---------------|
| Insurer | `/insurer-portal/*` | `InsurerPortalLayout` | `insurer`, `admin` |
| Assessor | `/assessor/*` | `AssessorPortalLayout` | `assessor`, `admin` |
| Panel Beater | `/panel-beater/*` | `PanelBeaterPortalLayout` | `panel_beater`, `admin` |
| Claimant | `/portal/*` | `ClaimantPortalLayout` | `claimant`, `admin` |
| Platform (super-admin) | `/platform/*` | `PlatformLayout` | `platform_super_admin` |

Portal identity is resolved at the `ProtectedRoute` component level (`client/src/components/ProtectedRoute.tsx`) using the `DOMAIN_ROLE_MAP`. The server mirrors this in `server/_core/domain-middleware.ts`.

Within the insurer portal, a second-level role (`insurerRole`) further restricts access:

| Insurer sub-role | Primary dashboard |
|-----------------|-------------------|
| `claims_processor` | `ClaimsProcessorDashboard` |
| `assessor_internal` | `InternalAssessorDashboard` |
| `risk_manager` | `RiskManagerDashboard` |
| `claims_manager` | `ClaimsManagerDashboard` |
| `executive` | `ExecutiveDashboard` |
| `insurer_admin` | `InsurerAdminDashboard` |
| `recovery_officer` | Recovery management |

---

## Tenancy Model

Every claim, assessment, and document is scoped to a `tenantId` (a string, e.g. `tenant-1771335377063`). All database queries in tRPC procedures filter by `ctx.user.tenantId` (resolved from the session). The upload endpoint resolves `tenantId` from `user.tenantId`; admin users fall back to `"demo-insurance"`.

**Cross-tenant data access is a security violation.** The `tenantIsolationViolations` table records any detected breaches. The `audit-cross-tenant.ts` module enforces this at query time.


---

# 02 — Architecture

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Tailwind CSS 4, Wouter (routing), shadcn/ui components |
| API layer | tRPC 11 (type-safe RPC, no REST routes for features) |
| Backend | Express 4 (tRPC adapter + raw Express for multipart upload) |
| Database | MySQL / TiDB via Drizzle ORM |
| Auth | Manus OAuth — session cookie, JWT-signed |
| File storage | S3 (via `storagePut` / `storageGet` in `server/storage.ts`) |
| AI | `invokeLLM()` helper (`server/_core/llm.ts`) — server-side only |
| PDF ingestion | `pdftoppm` (poppler-utils system binary) + `pdfjs-dist` fallback |
| PDF export | `puppeteer-core` + system Chromium (`/usr/bin/chromium`) |
| Deployment | Cloud Run (Autoscale, serverless, Node.js only build image) |

---

## Directory Structure

```
client/
  src/
    pages/          ← Feature UI pages (one per route)
    components/     ← Reusable UI (shadcn/ui wrappers, layout shells)
    contexts/       ← React contexts (auth, theme)
    hooks/          ← Custom hooks
    lib/trpc.ts     ← tRPC client binding
    App.tsx         ← Route definitions + portal layout wiring
    index.css       ← Global CSS variables / design tokens

server/
  _core/            ← Framework plumbing (OAuth, context, LLM, map, env) — DO NOT EDIT
  pipeline-v2/      ← AI pipeline stages and orchestrator
  routers/          ← tRPC feature routers (split by domain)
  routers.ts        ← Root router — merges all sub-routers
  db.ts             ← Query helpers + triggerAiAssessment + pipeline semaphore
  workflow-engine.ts ← Centralised state transition engine
  workflow-migration.ts ← status ↔ workflowState mapping
  rbac.ts           ← Role definitions, permissions, transition rules
  stuck-assessment-recovery-job.ts ← 10-min recovery cron
  upload-documents.ts ← Multipart upload Express endpoint
  storage.ts        ← S3 helpers
  reporting/        ← PDF renderer (pdfRenderer.ts)

drizzle/
  schema.ts         ← All DB table definitions (source of truth)
  migrations/       ← Auto-generated migration files
```

---

## Server Entry Point

`server/_core/index.ts` bootstraps the Express app:

1. Registers the tRPC adapter at `/api/trpc`
2. Mounts the multipart upload router at `/api/upload-documents`
3. Runs startup health checks (pdftoppm availability, DB connectivity)
4. Starts the stuck-assessment recovery job (10-minute interval)
5. Starts the pipeline semaphore (in-process, module-level)

---

## tRPC Router Structure

The root router is in `server/routers.ts` and merges sub-routers from `server/routers/`:

| Sub-router file | Domain |
|----------------|--------|
| `analytics.ts` | Claim analytics and reporting |
| `admin.ts` | Platform admin operations |
| `agency.ts` | Agency/broker management |
| `approval.ts` | Multi-level approval workflow |
| `assessor-onboarding.ts` | Assessor marketplace onboarding |
| `audit.ts` | Audit trail queries |
| `claims-manager.ts` | Claims manager decisions |
| `comments.ts` | Claim comments |
| `decision.ts` | AI decision layer |
| `document-ingestion.ts` | tRPC-based document upload (base64, <2MB) |
| `driver-registry.ts` | Driver registry CRUD |
| `executive.ts` | Executive dashboard data |
| `fleet-accounts.ts` | Fleet account management |
| `governance.ts` | Governance and compliance |
| `historical-claims.ts` | Historical claim dataset |
| `intake-gate.ts` | Processor intake queue |
| `intelligence.ts` | Cross-claim intelligence |
| `marketplace.ts` | Panel beater marketplace |
| `notifications.ts` | Owner notifications |
| `operational-health.ts` | System health monitoring |
| `platform.ts` | Platform super-admin |
| `policy-management.ts` | Policy management |
| `reporting.ts` | Report generation and sharing |
| `reports.ts` | PDF report export |
| `review-queue.ts` | Human review queue |
| `routing-policy-version.ts` | Routing policy versioning |
| `simulation.ts` | Claim simulator |
| `team-members.ts` | Insurer team management |
| `tenant.ts` | Tenant configuration |
| `vehicle-registry.ts` | Vehicle registry CRUD |
| `workflow-queries.ts` | Workflow state queries |
| `workflow.ts` | Workflow transitions |
| `workflow-analytics.ts` | Workflow analytics |

**Rule:** Keep router files under ~150 lines. Split into sub-files when they grow.

---

## Pipeline Orchestrator Contract

The pipeline is invoked via `triggerAiAssessment(claimId)` in `server/db.ts`, which:

1. Acquires the pipeline semaphore (queues if another pipeline is running)
2. Fetches the claim and its source document from the DB
3. Resolves the PDF URL (presigned S3 URL for server-side download)
4. Builds a `PipelineContext` object
5. Calls `runPipelineV2(ctx)` from `server/pipeline-v2/orchestrator.ts`
6. Persists the `PipelineResult` to `ai_assessments` and updates `claims`
7. Releases the semaphore

### PipelineContext (inputs)

The full type is defined in `server/pipeline-v2/types.ts`. Key fields:

| Field | Type | Description |
|-------|------|-------------|
| `claimId` | `number` | DB primary key of the claim |
| `tenantId` | `number \| null` | Tenant identifier |
| `assessmentId` | `number` | DB primary key of the `ai_assessments` row |
| `claim` | Drizzle select type | Full claim row from DB |
| `pdfUrl` | `string \| null` | Raw S3 URL (for LLM `file_url` proxy calls) |
| `pdfDownloadUrl` | `string \| null` | Presigned URL (for `pdftoppm` / Node.js fetch) |
| `damagePhotoUrls` | `string[]` | Direct-upload damage photo URLs |
| `db` | Drizzle instance | Live DB connection |
| `log` | `(stage, msg) => void` | Stage-scoped logger |
| `onStageStart` | callback | Updates `pipeline_current_stage` in DB (UI progress) |
| `onStageComplete` | callback | Observability hook (non-blocking) |
| `tenantRates` | `TenantRates \| null` | Per-tenant cost rate overrides |
| `tenantCountry` | `string \| null` | ISO 3166-1 alpha-2 (drives default currency) |
| `runId` | `string` | UUID for this pipeline run (observability grouping) |

### PipelineResult (outputs)

The full type is defined in `server/pipeline-v2/types.ts` (interface `PipelineResult`). All fields are nullable — stages that fail or are skipped return `null`. Key fields:

| Field | Source stage | Description |
|-------|-------------|-------------|
| `summary` | All stages | `PipelineRunSummary` — per-stage health, total duration |
| `claimRecord` | Stage 5 | `ClaimRecord` — canonical structured extraction |
| `report` | Stage 10 | `Stage10Output` — human-readable report sections |
| `damageAnalysis` | Stage 6 | Per-component damage with confidence |
| `physicsAnalysis` | Stage 7 | Accident reconstruction output |
| `fraudAnalysis` | Stage 8 | Fraud indicators and score breakdown |
| `costAnalysis` | Stage 9 | Parts reconciliation and cost recommendation |
| `causalChain` | Stage 37 | Causal chain of events |
| `causalVerdict` | Stage 7b | Causal reasoning verdict |
| `evidenceBundle` | Stage 38 | Evidence strength scoring |
| `realismBundle` | Stage 40 | Output realism validation |
| `benchmarkBundle` | Stage 41 | Benchmark deviation analysis |
| `consensusResult` | Stage 42 | Cross-engine consensus |
| `claimTruth` | Claim Truth Layer | Unified truth from all stage outputs |
| `claimTruthObject` | TRE | Canonical Claim Truth Object (CTO) — single source of truth |
| `physicsTruth` | Post-Stage 7 | Authoritative physics measurements with provenance |
| `decisionAuthority` | Decision layer | Final recommendation with authority chain |
| `reportReadiness` | Pre-report gate | Whether report is ready for publication |
| `stage4Output` | Stage 4 | Field validation + pipeline gate decision |
| `forensicExecutionLedger` | Phase 2A | Court-grade per-stage audit record |

**Important:** Prior to the `PipelineResult` type being fully declared, many fields were silently dropped at persistence time. The full declaration in `types.ts` is the authoritative contract — any new stage output MUST be added to this interface and to the DB persistence block in `db.ts`.

---

## Pipeline Concurrency Model

Only one KINGA pipeline runs at a time per server process. This is enforced by an in-process semaphore in `server/db.ts`:

```
MAX_CONCURRENT_PIPELINES = 1
_activePipelineCount: number  (module-level)
_pipelineQueue: Array<() => void>  (module-level)
```

When `triggerAiAssessment` is called while a pipeline is already running, the new trigger is queued. When the active pipeline releases its slot (in the `finally` block), the next queued trigger is fired automatically.

**This semaphore is in-process only.** It does not survive server restarts. After a restart, the stuck-assessment recovery job (Cases 7, 11, 12) handles re-queuing claims that were in-flight when the server died.

---

## Startup Sequence

On every server start, `server/_core/index.ts` runs:

1. DB connectivity check
2. `pdftoppm` availability check (logs warning if missing, does NOT exit)
3. `runStartupCleanup()` from `stuck-assessment-recovery-job.ts`:
   - **Case 12:** Finds all `intake_pending` claims with a source document and `aiAssessmentTriggered=0` — triggers them immediately (500ms stagger per claim)
   - Resets any claims stuck in transient pipeline states (`document_validating`, `analysis_running`, etc.) to `intake_pending` so the recovery job can pick them up

The startup sweep is the primary defence against the "upload and disappear" bug (see [07-failure-modes.md](./07-failure-modes.md)).


---

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


---

# 04 — Type Contracts and Error Handling

## TypeScript Coverage

The KINGA codebase has **approximately 90 server-side files marked `// @ts-nocheck`** (as of July 2026). These are predominantly in the analytics, compliance, governance, and legacy assessment modules. The pipeline orchestrator (`server/pipeline-v2/orchestrator.ts`) and the core DB module (`server/db.ts`) are **not** `@ts-nocheck` — they are fully typed.

### Why `@ts-nocheck` Exists

These files were written rapidly during the initial build phase when the data model was still evolving. The `@ts-nocheck` directive was applied to suppress errors from:

1. **Drizzle ORM insert result shapes** — MySQL's `insertId` is returned as `{ insertId: string | number }` on the raw result, but Drizzle's TypeScript types do not expose this directly. The pattern `(result as unknown as { insertId: string | number }).insertId` appears throughout.
2. **Dynamic JSON column access** — Many columns store arbitrary JSON blobs. TypeScript cannot infer the shape of `JSON.parse(row.someJsonColumn)` without explicit casting.
3. **Legacy shape mismatches** — Some modules were written against an earlier schema version and not updated when columns were renamed or added.

### Policy Going Forward

New files MUST NOT use `@ts-nocheck`. Use `as unknown as T` casts with a comment explaining why, or add a proper type guard. Existing `@ts-nocheck` files should be migrated incrementally — do not add new logic to them without removing the directive first.

---

## Core Type Contracts

### `ClaimRecord` (Stage 5 output)

Defined in `server/pipeline-v2/types.ts`. This is the canonical structured extraction of a claim document. All downstream stages consume this type.

Key fields:

| Field | Type | Description |
|-------|------|-------------|
| `claimant` | `ClaimantInfo` | Name, contact, ID number |
| `vehicle` | `VehicleInfo` | Make, model, year, VIN, registration |
| `incident` | `IncidentInfo` | Date, location, description, type |
| `driver` | `DriverInfo` | Insured driver details |
| `thirdParty` | `ThirdPartyInfo \| null` | Third-party vehicle and driver |
| `quotes` | `RepairQuote[]` | Extracted repair quotations |
| `damageDescription` | `string` | Free-text damage description |
| `claimantStatedSpeed` | `number \| null` | **Immutable** — never overwritten after Stage 3 |
| `incidentType` | `string` | Classified incident type |
| `productType` | `string` | Insurance product class |

### `PipelineResult` (orchestrator output)

Defined in `server/pipeline-v2/types.ts`. The full output of `runPipelineV2()`. Every field is nullable — a stage that fails or is skipped returns `null` for its output field.

**Critical rule:** If you add a new stage that produces output, you MUST:
1. Add the output field to `PipelineResult` in `types.ts`
2. Add the persistence block in `db.ts` (the `upsert` call after `runPipelineV2` returns)
3. Add the corresponding column to `ai_assessments` in `drizzle/schema.ts`
4. Run `pnpm db:push` to migrate the schema

Failure to do step 2 will silently drop the stage output — it will be computed but never saved.

### `WorkflowState` and `InsurerRole`

Both are defined as TypeScript union types in `server/rbac.ts`. The DB stores these as `varchar` columns (not MySQL enums), so the TypeScript type is the enforcement mechanism. Always use the type, never raw strings.

---

## tRPC Procedure Patterns

### Public vs. Protected

```ts
// Public — no auth required
publicProcedure.query(...)

// Protected — requires valid session cookie
protectedProcedure.query(...)

// Insurer domain — requires insurer role + tenantId resolution
insurerDomainProcedure.query(...)

// Admin only
adminProcedure.query(...)
```

`insurerDomainProcedure` is defined in `server/routers.ts`. It wraps `protectedProcedure` and additionally resolves `ctx.insurerTenantId` from the user's `tenantId`. All insurer-facing queries MUST use this procedure to ensure tenant isolation.

### Input Validation

All procedure inputs are validated with Zod. The schema is the contract — if a field is not in the Zod schema, it cannot reach the handler. Never bypass Zod with `z.any()` in new code.

### Error Handling Convention

Procedures throw `TRPCError` with a typed `code`:

| Code | When to use |
|------|------------|
| `UNAUTHORIZED` | No valid session |
| `FORBIDDEN` | Valid session but insufficient role/permission |
| `NOT_FOUND` | Resource does not exist or is outside the user's tenant scope |
| `BAD_REQUEST` | Invalid input that passed Zod but failed business logic |
| `INTERNAL_SERVER_ERROR` | Unexpected error — always log the original error before throwing |

**Do not swallow errors silently.** If a stage in the pipeline fails non-fatally, log it with `ctx.log(stageName, errorMessage)` and continue. If it is fatal, throw a `PipelineIncompleteError` (defined in `server/pipeline-v2/types.ts`).

---

## Pipeline Error Types

Defined in `server/pipeline-v2/types.ts`:

| Error class | When thrown | Effect |
|------------|------------|--------|
| `PipelineIncompleteError` | Stage cannot proceed (missing required input, fatal LLM failure) | Pipeline aborts; claim set to `document_failed` |
| `StageTimeoutError` | Stage exceeds its time budget | Non-fatal by default; logged and stage marked as timed out in `PipelineRunSummary` |

The watchdog timer in `triggerAiAssessment` (`server/db.ts`) fires after 8 minutes and sets:
- `claims.status = 'document_failed'`
- `claims.documentProcessingStatus = 'DOCUMENT_FAILED'`
- `claims.workflowState = 'intake_queue'`

This ensures the claim is always recoverable by the recovery job (Case 11).

---

## LLM Call Conventions

All LLM calls go through `invokeLLM()` in `server/_core/llm.ts`. Key rules:

1. **Server-side only** — never call from client code
2. **Always set a timeout** — the default is 45 seconds; use `timeoutMs` override for large PDF extraction calls (up to 90s)
3. **Structured output** — use `response_format: { type: "json_schema", ... }` when you need a typed response. Parse with `JSON.parse(response.choices[0].message.content)` and validate with Zod
4. **Thinking budget** — set `budget_tokens: 0` to disable chain-of-thought for fast classification tasks; leave unset for complex reasoning
5. **Vision calls** — pass image URLs as `{ type: "image_url", image_url: { url: "..." } }` content items. The proxy handles authentication automatically — do not add API keys to image URLs

---

## `@ts-nocheck` Inventory (selected files)

The following files carry `@ts-nocheck` and are most likely to be touched during maintenance. Each has a note on why:

| File | Reason |
|------|--------|
| `server/accidentPhysics.ts` | Complex numeric computation with dynamic object shapes |
| `server/assessment-processor.ts` | Legacy shape mismatches from early schema iterations |
| `server/cost-optimization.ts` | Dynamic JSON column access, Drizzle insert result casting |
| `server/analytics-db.ts` | Dynamic aggregation queries with inferred column types |
| `server/upload-documents.ts` | Drizzle insert result `insertId` casting (documented in file header) |
| `server/claim-form-extractor.ts` | LLM response parsing with dynamic shapes |
| `server/confidence-scoring-engine.ts` | Numeric computation with many intermediate types |

When editing these files, add explicit type annotations to any new code you write, even if the surrounding code is untyped.


---

# 05 — Pipeline Reference

## Entry Point

```
triggerAiAssessment(claimId: number)  →  server/db.ts
  └── runPipelineV2(ctx: PipelineContext)  →  server/pipeline-v2/orchestrator.ts
```

The orchestrator is a single large async function (~2,300 lines). It is structured as a sequential series of named stage blocks with two parallel `Promise.all` blocks (Stage 8 ‖ Stage 9, and the post-S8/S9 block). Each stage block:

1. Calls `ctx.onStageStart("Stage N — Label")` — updates `claims.pipelineCurrentStage` in DB (visible in the UI progress indicator)
2. Executes the stage logic (LLM calls, computation, DB reads)
3. Writes its output to the `ctx` object for downstream stages
4. Optionally calls `ctx.onStageComplete(stageName, durationMs)` for observability

---

## Stage Reference

### Stage 1 — Document Ingestion
**Lines:** ~461–529  
**Input:** `ctx.pdfDownloadUrl` (presigned S3 URL) or `ctx.damagePhotoUrls`  
**Output:** `ctx.pageImageUrls[]` (PNG images of each PDF page, uploaded to S3)  
**Method:** `pdftoppm` system binary (150 DPI). Falls back to `pdfjs-dist` embedded image extraction if `pdftoppm` is unavailable.  
**Key behaviour:** Each PDF page is rendered to a PNG and uploaded to S3 under `{tenantId}/pipeline/{assessmentId}/pages/`. The URLs are stored in `ai_assessments.pageImageUrlsJson` for audit and re-use in subsequent stages.

---

### Stage 2 — OCR & Text Extraction
**Lines:** ~530–627  
**Input:** `ctx.pageImageUrls[]`  
**Output:** `ctx.rawOcrText` (full document text)  
**Method:** LLM vision call on each page image. Falls back to Tesseract OCR if LLM vision fails. Sparse-text fallback for pages with minimal text.  
**Key behaviour:** The raw OCR text is stored in `ai_assessments.stage2RawOcrText` and is never overwritten — it is the immutable evidence record of what was in the document.

---

### Stage 0a — Document Read Verification
**Lines:** ~628–656  
**Input:** `ctx.rawOcrText`  
**Output:** Pipeline gate decision  
**Key behaviour:** Confirms at least one page was successfully read. If `rawOcrText` is empty or below a minimum length threshold, throws `PipelineIncompleteError` with reason `DOCUMENT_UNREADABLE`.

---

### Stage 0 — Evidence Registry Initialisation
**Lines:** ~657–689  
**Input:** Stage 1 and Stage 2 outputs  
**Output:** `ctx.evidenceRegistry` (initial state)  
**Key behaviour:** Builds the initial evidence registry from available sources. The registry tracks what evidence is present (damage photos, quotation scans, police report, etc.) and is updated by subsequent stages.

---

### Stage 3 — Structured Data Extraction
**Lines:** ~690–717 (calls `runExtractionStage()`)  
**Input:** `ctx.rawOcrText`, `ctx.pageImageUrls[]`  
**Output:** `ctx.extractedData` (raw LLM extraction, pre-validation)  
**Method:** LLM call with a structured JSON schema response format. The schema mirrors the `ClaimRecord` type.  
**Key behaviour:** The claimant-stated speed (`claimantStatedSpeed`) is extracted here and stored as `claims.claimantStatedSpeedKmh`. **This field is immutable after this stage** — it represents what the claimant stated, not what the physics engine computed.

---

### Stage 4 — Data Validation
**Lines:** ~718–765  
**Input:** `ctx.extractedData`  
**Output:** `ctx.validatedData` (Zod-validated + coerced), `ctx.stage4Output` (field-level confidence scores, pipeline gate decision)  
**Key behaviour:** Applies Zod schema validation with field-level confidence scoring. Fields that fail validation are marked with `confidence: 0` and a reason. The pipeline gate decision (`PROCEED` / `HUMAN_REVIEW_REQUIRED`) is based on the aggregate confidence score.

---

### Stage 5 — Claim Data Assembly
**Lines:** ~766–797 (calls `runAssemblyStage()`)  
**Input:** `ctx.validatedData`  
**Output:** `ctx.claimRecord` (canonical `ClaimRecord`), vehicle/driver upserts in DB  
**Key behaviour:** Normalises repair quotes (currency conversion, line-item parsing), performs vehicle lookup (VIN/registration against `vehicleRegistry`), classifies incident type, and upserts vehicle and driver records. The `ClaimRecord` is the canonical structured representation used by all downstream stages.

---

### Stage 0.5 — Scenario-Conditional Evidence Notes
**Lines:** ~798–867  
**Input:** `ctx.claimRecord.incidentType`  
**Output:** Evidence registry updated with scenario-specific hints  
**Key behaviour:** Adds scenario-specific evidence requirements to the registry (e.g., for a rear-end collision, notes that a police report and third-party statement are expected).

---

### Stage 2.5 — Automotive Domain Corrector
**Lines:** ~868–1023  
**Input:** `ctx.claimRecord` (vehicle make/model/part names)  
**Output:** `ctx.claimRecord` (corrected)  
**Key behaviour:** Corrects common OCR and LLM errors in automotive terminology (e.g., "Toyata" → "Toyota", "bonnet" vs "hood" normalisation). Uses a curated automotive vocabulary.

---

### Stage 2.6 — Image Classification Layer
**Lines:** ~1024–1048 (calls `runImageClassificationLayer()`)  
**Input:** `ctx.pageImageUrls[]`, `ctx.damagePhotoUrls[]`  
**Output:** `ctx.imageMetadata[]` (per-image classification: `damage_photo` / `vehicle_overview` / `quotation_scan` / `police_report` / `other`)  
**Sub-stages:**  
- **Stage 2.6:** Direct-URL image classifier (for `damagePhotoUrls`)  
- **Stage 2.6B:** Semantic gate — filters images to only those eligible for Stage 6 (damage analysis). Non-damage images are excluded from Stage 6 to prevent false positives.

---

### Stage 2.7 — Embedded Quote Extraction
**Lines:** ~1049–1066  
**Input:** Images classified as `quotation_scan` by Stage 2.6  
**Output:** Additional `panelBeaterQuotes` rows in DB; `ctx.claimRecord.quotes[]` updated  
**Key behaviour:** Runs quote extraction on quotation scan images. Merges extracted quotes with those already found via OCR (Stage 2). Prefers the more complete/priced version when duplicates are found.

---

### Stage 0b — Evidence Registry Update (post-classification)
**Lines:** ~1049–1066 (immediately after Stage 2.7)  
**Key behaviour:** Updates the evidence registry with classification results (damage photos present/absent, quotation scans found, etc.).

---

### Complexity Gate
**Lines:** ~1049–1066 (after Stage 0b)  
**Output:** `ctx.claimComplexity` (`standard` / `complex` / `fast-track`)  
**Key behaviour:** Classifies the claim tier based on estimated cost, number of damaged components, and fraud indicator count. This gate influences which sub-stages run and at what depth.

---

### Stage 6 — Damage Analysis
**Lines:** ~1067–1130 (calls `runDamageAnalysisStage()`)  
**Input:** Stage-6-eligible images from Stage 2.6B, `ctx.claimRecord`  
**Output:** `ctx.damageAnalysis` (per-component damage list with confidence, severity, and repair recommendation)  
**Key behaviour:** Vision-based analysis of each damage photo. Memory-intensive — a GC hint is issued before this stage. Each component is assessed independently; results are aggregated into a damage manifest.

---

### Stage 6.5A — Vision Geometry Engine (VGE)
**Lines:** ~1338–1456 (within Stage 7 block)  
**Input:** Damage photos with reference objects (licence plates, door handles, tyres)  
**Output:** `ctx.vgeResult` (calibrated crush depth in metres, per-image scale factor, confidence level)  
**Key behaviour:** Detects reference objects of known dimensions in damage photos and uses them to calibrate a real-world scale. Computes calibrated crush depth (deformation depth) from the calibrated scale. If no reference objects are detected, VGE returns `null` and Stage 7 uses raw LLM estimates.

---

### Stage 6.5B — Vision Geometry Reconciliation (VGR)
**Lines:** ~1338–1456  
**Input:** `ctx.vgeResult` (per-image calibrated measurements)  
**Output:** `ctx.vgrResult` (cross-image consensus crush depth, conflict detection)  
**Key behaviour:** Reconciles VGE measurements across multiple images of the same damage. Detects conflicts (e.g., two images showing inconsistent deformation). The consensus value is the authoritative crush depth used by Stage 7.

---

### Stage 7 — Physics & Severity Consensus
**Lines:** ~1154–1292 (calls `runPhysicsStage()`, `runSeverityConsensus()`, `runCausalReasoningEngine()` Pass 1)  
**Input:** `ctx.damageAnalysis`, `ctx.vgrResult`, `ctx.claimRecord`  
**Output:** `ctx.physicsAnalysis` (accident reconstruction), `ctx.severityConsensus`, `ctx.causalVerdict` (Pass 1)  
**Key behaviour:** Reconstructs the accident physics from damage patterns and geometry measurements. Computes consensus vehicle speed at impact. The computed speed is stored in `claims.estimatedSpeedKmh` — this is the authoritative value. The claimant-stated speed (`claims.claimantStatedSpeedKmh`) is preserved separately and never overwritten.

**Authoritative vs. stated values:**

| Field | Column | Source | Immutable? |
|-------|--------|--------|-----------|
| Computed speed | `claims.estimatedSpeedKmh` | Stage 7 physics | No — updated on re-analysis |
| Stated speed | `claims.claimantStatedSpeedKmh` | Stage 3 extraction | **Yes — never overwritten** |
| Crush depth | `physicsTruth.crushDepthM` | Stage 6.5B VGR | No |

---

### Stage 35 — Damage-Physics Coherence Validation
**Lines:** ~1317–1337  
**Input:** `ctx.damageAnalysis`, `ctx.physicsAnalysis`  
**Output:** Coherence score and flag list  
**Key behaviour:** Validates that the damage analysis and physics outputs are mutually consistent (e.g., a high-speed impact should produce more severe damage than a low-speed one). Flags incoherent combinations for human review.

---

### Stage 8 ‖ Stage 9 — Fraud Analysis + Cost Optimisation (PARALLEL)
**Lines:** ~1338–1456  
**Input:** `ctx.physicsAnalysis`, `ctx.damageAnalysis`, `ctx.claimRecord`  
**Output:** `ctx.fraudAnalysis` (Stage 8), `ctx.costAnalysis` (Stage 9)  
**Key behaviour:** These two stages run in a `Promise.all` — they are independent and can execute concurrently. Stage 8 produces a fraud score and indicator list. Stage 9 produces a cost recommendation with parts reconciliation against market benchmarks.

**Note on fraud scoring:** The exact scoring weights and thresholds are intentionally excluded from this manual. See the KINGA Fraud Intelligence Specification (internal document, not in this repository).

---

### Stage 7d — Confidence Aggregation
**Lines:** ~1457–1476  
**Input:** All stage outputs  
**Output:** `ctx.confidenceAggregate` (overall pipeline confidence 0–100)  
**Key behaviour:** Aggregates confidence scores from all stages into a single overall confidence score. A GC hint is issued before this stage to release Stage 8/9 memory.

---

### Post-S8/S9 Parallel Block
**Lines:** ~1477–1705  
**Key behaviour:** Second `Promise.all` containing 11 sub-stages that depend on Stage 8 and Stage 9 outputs:

| Sub-stage | Purpose |
|-----------|---------|
| Stage 7b (Pass 2) | Causal reasoning with fraud + cost scores (~15–30s) |
| Stage 36 | Cost Realism Validation |
| Stage 37 | Causal Chain Builder |
| Stage 38 | Evidence Strength Scorer |
| Stage 40 | Output Realism Validator |
| Stage 41 | Benchmark Deviation Engine |
| Stage 42 | Cross-Engine Consensus Scorer |
| Stage 43 | Physics Deviation Score |
| Stage 44 | Claim Consistency Check |
| Stage 45 | Contradiction Detection Gate |
| Stage 9b | Turnaround Time Analysis |

---

### Cross-Stage Reconciliation Pass
**Lines:** ~1706–1732  
**Key behaviour:** Reconciles outputs across all stages for internal consistency. Resolves conflicts between Stage 6 damage output and Stage 7 physics output.

---

### Claim Truth Layer (Truth Reconciliation Engine)
**Lines:** ~1771–1837  
**Output:** `ctx.claimTruthObject` (Canonical Claim Truth Object — CTO)  
**Key behaviour:** Final adjudication of the claim truth from all stage outputs. The CTO is the single source of truth for all downstream consumers (report generation, decision layer, UI). It resolves conflicts between stages using a priority hierarchy: physics measurements > damage analysis > OCR extraction > claimant statements.

---

### Stage 10 — Report Generation
**Lines:** ~1922–2015  
**Input:** `ctx.claimTruthObject`, all stage outputs  
**Output:** `ctx.report` (`Stage10Output` — structured report sections)  
**Key behaviour:** Deterministic — no LLM calls. Assembles the final human-readable report from structured stage outputs. The report is stored as JSON in `ai_assessments.reportJson` and rendered to HTML/PDF on demand.

---

### Stage 11 — Validated Outcome Recorder
**Lines:** ~2016–2033  
**Key behaviour:** Records validated outcomes for future model improvement. Writes to the learning dataset if the pipeline completed with high confidence.

---

### Stage 11.5 — Case Signature Generator
**Lines:** ~2034–2060  
**Output:** `ctx.caseSignature` (unique fingerprint of this claim's evidence pattern)  
**Key behaviour:** Generates a deterministic signature from the claim's evidence pattern (damage types, incident type, vehicle class, fraud indicators). Used for cross-claim similarity matching.

---

## Partial Resume (Cache)

Stages 6, 7, 8, and 9 support partial resume. If a pipeline run was interrupted after one of these stages completed, a re-run will restore the cached output from `ai_assessments` and skip re-running the stage. This is controlled by the `PartialResume` log messages in the orchestrator.

**Cache invalidation:** The cache is invalidated when `forceRerun=true` is passed to `triggerAiAssessment`, or when the source document changes (re-upload with different SHA-256 hash).

---

## Pipeline Observability

Every pipeline run produces:

1. **`pipelineRunSummary`** — stored in `ai_assessments.pipelineRunSummary`. Contains per-stage health (`ok` / `failed` / `skipped` / `timed_out`), duration in ms, and error messages.
2. **`forensicExecutionLedger`** — stored in `ai_assessments.forensicExecutionLedgerJson`. Court-grade audit record: input hash, output snapshot, model ID, prompt version, and timestamp for each stage.
3. **Stage logs** — written to `ai_assessments.pipelineLogsJson` (ring buffer, last 500 entries). Accessible via the Pipeline Observability page in the insurer portal.
4. **`pipelineCurrentStage`** — live column on `claims` table, updated by `ctx.onStageStart`. Cleared on completion. Drives the "Stage N of 10" progress indicator in the UI.


---

# 06 — Report Generation Stack

## Report Tiers

KINGA produces several distinct report types, each targeting a different audience:

| Report type | Audience | Generated by | Format |
|-------------|----------|-------------|--------|
| KINGA Assessment Report | Claims processor, assessor | Stage 10 + `InteractiveReport.tsx` | HTML (interactive) + PDF on demand |
| Claim Decision Report | Claims manager, risk manager | `ClaimDecisionReport.tsx` | HTML (interactive) + PDF |
| Executive Summary | Executive, GM | `ExecutiveDashboard.tsx` | HTML |
| Compliance Report | Compliance officer | `server/compliance-report-generator.ts` | PDF |
| Demand Letter | Recovery officer | `server/recovery/demandLetterGenerator.ts` | PDF |
| Governance Report | Governance dashboard | `server/routers/governance-dashboard.ts` | PDF |
| Analytics Export | Analytics | `server/routers/analytics.ts` | PDF |

---

## Stage 10 Report Structure

Stage 10 (`runPipelineV2` lines ~1922–2015) produces a `Stage10Output` object with the following sections:

| Section | Contents |
|---------|---------|
| `executiveSummary` | One-paragraph plain-English summary of the claim outcome |
| `incidentReconstruction` | Narrative reconstruction of the accident from physics and damage evidence |
| `damageAssessment` | Per-component damage table with severity, repair recommendation, and confidence |
| `fraudAssessment` | Fraud indicator list, risk level, and narrative explanation |
| `costAssessment` | Parts reconciliation table, market benchmark comparison, recommended settlement amount |
| `recommendation` | Final recommendation with authority chain and confidence |
| `evidenceSummary` | Evidence registry summary — what was present, what was missing, and how gaps affected confidence |
| `auditTrail` | Key pipeline decisions and their rationale |

This structure is stored as JSON in `ai_assessments.reportJson` and rendered client-side by `InteractiveReport.tsx`.

---

## HTML/PDF Rendering

### Interactive Reports (client-side)

The primary report view is rendered client-side in React (`client/src/pages/InteractiveReport.tsx`). It reads from `ai_assessments` via tRPC and renders the structured JSON into a rich interactive layout. This is the default view for insurer portal users.

### PDF Export (server-side)

PDF export uses **`puppeteer-core` + system Chromium** (`/usr/bin/chromium`). The rendering pipeline is:

1. The server generates an HTML string from the report data (using template strings, not JSX)
2. `renderHtmlToPdf(html)` in `server/reporting/pdfRenderer.ts` launches a headless Chromium instance
3. Chromium renders the HTML to A4 PDF with print media
4. The PDF buffer is uploaded to S3 via `storagePut`
5. The S3 URL is returned to the client

**Browser instance reuse:** The Chromium browser instance is reused across PDF renders (module-level singleton in `pdfRenderer.ts`). If the browser crashes, it is re-launched on the next render call.

**Known constraint:** Chromium requires `--no-sandbox --disable-setuid-sandbox` flags in Cloud Run (no user namespace support). These flags are hardcoded in `pdfRenderer.ts` and all other PDF export modules. Do not remove them.

### PDF Layout Techniques

For reliable PDF export from HTML:

1. **Use `@media print` CSS** — Chromium renders with `printBackground: true` and `print` media. Ensure your HTML includes print-specific styles.
2. **Avoid `position: fixed` and `position: sticky`** — these do not paginate correctly in Chromium's print mode.
3. **Use `page-break-before: always` / `break-before: page`** for explicit page breaks between sections.
4. **Avoid CSS Grid for multi-page layouts** — use Flexbox or block layout for content that spans pages.
5. **Images must be fully loaded** — `pdfRenderer.ts` waits for `networkidle0` and then explicitly waits for all `<img>` elements to load before calling `page.pdf()`.
6. **Zero margins** — the renderer sets `margin: { top: "0mm", bottom: "0mm", left: "0mm", right: "0mm" }`. All padding must be in the HTML/CSS, not in the Puppeteer margin options.

---

## Design Tokens and Styling

### Report Colour Palette

All KINGA reports use a **black/white/grey palette** with colour used only in charts. This is documented in `server/reporting/pdfRenderer.ts`:

```
All reports: black/white/grey palette. Logo top-right. Colour only in charts.
```

The KINGA logo is stored in S3 and referenced by URL in report templates. Do not embed it as a base64 data URI — the PDF renderer waits for it to load from the URL.

### Client-Side Design Tokens

Global CSS variables are defined in `client/src/index.css` under `@layer base`. The token names follow the shadcn/ui convention:

```css
--background, --foreground
--card, --card-foreground
--primary, --primary-foreground
--secondary, --secondary-foreground
--muted, --muted-foreground
--accent, --accent-foreground
--destructive, --destructive-foreground
--border, --input, --ring
--radius
```

The active theme is `dark` (set in `App.tsx` `ThemeProvider defaultTheme="dark"`). The `.dark {}` block in `index.css` defines the dark-mode values for all tokens.

**Rule:** Always pair `bg-{semantic}` with `text-{semantic}-foreground`. Never use `bg-card` without `text-card-foreground` — text colour does not inherit automatically.

---

## Multiple PDF Export Modules

There are currently **five separate PDF export modules** in the server:

| Module | Used for |
|--------|---------|
| `server/reporting/pdfRenderer.ts` | Primary renderer — all new reports should use this |
| `server/pdf-export.ts` | Legacy assessment PDF export |
| `server/report-pdf-generator.ts` | Legacy report PDF generator |
| `server/claim-pdf-export.ts` | Claim-level PDF export (full claim dossier) |
| `server/final-claim-report-pdf.ts` | Final claim report PDF |
| `server/recovery/demandLetterGenerator.ts` | Demand letter PDF |

**Recommendation:** All new report types should use `server/reporting/pdfRenderer.ts`. The legacy modules exist for backward compatibility and should not be extended.

All modules use the same Chromium path (`/usr/bin/chromium`) and the same `--no-sandbox` flags. If the Chromium path changes (e.g., in a new deployment environment), update all six files.


---

# 07 — Known Failure Modes and Fixes

This section is a running log of non-obvious bugs that were found and fixed. Its purpose is to prevent future engineers from reintroducing the same issues. Each entry includes the root cause, the symptom, and the fix applied.

---

## FM-001: Upload and Disappear (setImmediate killed on server restart)

**Symptom:** A claim is uploaded successfully (HTTP 200 returned, claim visible in DB), but it never appears in the "Pending" queue and the pipeline never runs. The claim's `documentProcessingStatus` is `failed` or `DOCUMENT_FAILED`.

**Root cause:** The pipeline trigger uses `setImmediate(() => triggerAiAssessment(claimId))` immediately after the HTTP response is sent. `setImmediate` is in-process memory. If the server restarts (e.g., `tsx watch` hot-reload during development, or a deployment in production) between the HTTP response and the `setImmediate` callback execution, the callback is lost. The claim is created in the DB but the pipeline never fires.

**Fix applied (July 2026):**
1. **Startup sweep (Case 12)** in `stuck-assessment-recovery-job.ts`: On every server start, finds all `intake_pending` claims with a source document and `aiAssessmentTriggered=0`, and triggers them immediately with a 500ms stagger per claim.
2. **Watchdog normalisation** in `db.ts`: The watchdog timer now sets `status='document_failed'` AND `documentProcessingStatus='DOCUMENT_FAILED'` consistently (previously it only set `dps='failed'` in some paths).

**Prevention:** Do not replace the `setImmediate` trigger with a synchronous call — it must not block the HTTP response. The startup sweep is the durability layer. In production, the startup sweep fires on every deployment, catching any claims that were in-flight during the deploy.

---

## FM-002: Thundering Herd on Startup (8 pipelines fired simultaneously)

**Symptom:** After a server restart, multiple claims are triggered simultaneously. All of them hang at Stage 1 (INGESTION) for 8+ minutes, then all fail with `document_failed`. The recovery job then re-triggers all of them simultaneously, creating a loop.

**Root cause:** The startup sweep (Case 12) fired all `intake_pending` claims at once (with only a 500ms stagger, which is insufficient when each pipeline takes ~3 minutes per stage). All 8 pipelines competed for LLM API calls, memory, and CPU, causing all of them to time out.

**Fix applied (July 2026):**
1. **Pipeline concurrency semaphore** in `db.ts`: `MAX_CONCURRENT_PIPELINES = 1`. Only one pipeline runs at a time. All other triggers queue and wait. The slot is always released in the `finally` block.
2. The startup sweep's 500ms stagger is now irrelevant for concurrency (the semaphore handles it), but is kept to avoid a burst of DB writes on startup.

**Prevention:** Never remove the semaphore. Never increase `MAX_CONCURRENT_PIPELINES` above 2 without load testing on the production hardware (Cloud Run, 1 vCPU, 512 MiB RAM).

---

## FM-003: Case 7 Blind Spot (stuck claims not recovered)

**Symptom:** Claims stuck in `analysis_running`, `document_validating`, or `document_ready` status for hours. The recovery job reports "No stuck claims found" and does not reset them. The claims remain permanently stuck.

**Root cause:** Case 7 in `stuck-assessment-recovery-job.ts` only queried for `status = 'assessment_in_progress'`. The pipeline uses `analysis_running`, `document_validating`, and `document_ready` as intermediate statuses — none of which Case 7 watched.

**Fix applied (July 2026):** Case 7 now covers ALL pipeline-running statuses:
- `assessment_in_progress`
- `analysis_running`
- `document_validating`
- `document_ready`
- `recovery_attempted`

**Prevention:** Whenever a new pipeline-running status is added to the schema, add it to Case 7's status list in the recovery job.

---

## FM-004: Claimant-Stated Speed Overwritten by Physics Engine

**Symptom:** The `claimantStatedSpeedKmh` column shows the computed physics speed, not what the claimant stated in their form. This corrupts the fraud analysis (which compares stated vs. computed speed as a fraud indicator).

**Root cause:** An early version of the Stage 7 persistence block wrote the computed speed to `claimantStatedSpeedKmh` instead of `estimatedSpeedKmh`.

**Fix applied:** The pipeline now writes:
- Computed speed → `claims.estimatedSpeedKmh` (updated on every re-analysis)
- Stated speed → `claims.claimantStatedSpeedKmh` (written once at Stage 3, never overwritten)

**Prevention:** `claimantStatedSpeedKmh` must never be written by any stage after Stage 3. If you add a new speed-related field, use a new column — do not repurpose `claimantStatedSpeedKmh`.

---

## FM-005: New Stage Output Silently Dropped (not persisted to DB)

**Symptom:** A new pipeline stage produces output visible in the logs, but the output is not in `ai_assessments` after the pipeline completes. The field is always `null` in the UI.

**Root cause:** The `PipelineResult` type in `types.ts` was not updated with the new field, and/or the persistence block in `db.ts` was not updated to write the field to `ai_assessments`.

**Fix applied (pattern):** The persistence block in `db.ts` (the `upsert` call after `runPipelineV2` returns) must be updated whenever a new stage output field is added. The checklist is:
1. Add field to `PipelineResult` interface in `server/pipeline-v2/types.ts`
2. Add column to `ai_assessments` in `drizzle/schema.ts`
3. Run `pnpm db:push`
4. Add persistence line in `db.ts` upsert block

**Prevention:** After adding a new stage, always verify the output appears in the DB by running the pipeline on a test claim and checking the `ai_assessments` row directly.

---

## FM-006: `submitted` Status Claims Not Visible in Processor Dashboard

**Symptom:** Claims submitted via the claimant portal form appear in the DB with `status='submitted'` but do not appear in the processor dashboard pending queue.

**Root cause:** The `getClaimsByStatus` procedure's status list in `ClaimsProcessorDashboard.tsx` did not include `submitted`, `triage`, or `assessment_pending`.

**Fix applied (July 2026):** Added `submitted`, `triage`, and `assessment_pending` to the dashboard query status list.

**Prevention:** Whenever a new claim source is added (new mobile app, new API integration), verify that the status it creates claims with is included in the dashboard query list.

---

## FM-007: Duplicate Pipeline Trigger (double-run on same claim)

**Symptom:** The same claim runs through the pipeline twice simultaneously. Two `ai_assessments` rows are created for the same claim. The second run overwrites the first.

**Root cause:** The `aiAssessmentTriggered` flag was set to `1` after the pipeline started (not before), creating a race window where a second trigger could fire before the flag was set.

**Fix applied:** `aiAssessmentTriggered` is now set to `1` atomically at the start of `triggerAiAssessment`, before any pipeline work begins. The function checks this flag and returns early if it is already `1`.

**Prevention:** Never call `triggerAiAssessment` directly from multiple code paths without checking `aiAssessmentTriggered` first. Use the recovery job's re-trigger path for manual re-runs.

---

## FM-008: Chromium Path Mismatch Between Modules

**Symptom:** PDF export works in development but fails in production (or vice versa). Error: `Failed to launch the browser process`.

**Root cause:** Different PDF export modules use different Chromium paths:
- `server/reporting/pdfRenderer.ts`: `/usr/bin/chromium` (hardcoded)
- `server/pdf-export.ts`: `process.env.CHROMIUM_PATH ?? '/usr/bin/chromium'`
- `server/claim-pdf-export.ts`: `/usr/bin/chromium-browser` (different binary name)

**Fix applied (partial):** The primary renderer uses `/usr/bin/chromium`. The legacy modules use `process.env.CHROMIUM_PATH` with a fallback.

**Prevention:** Set `CHROMIUM_PATH` environment variable in production to the correct binary path. Do not hardcode different paths in different modules. New PDF export code should always use `server/reporting/pdfRenderer.ts`.

---

## FM-009: Tenant Isolation Bypass via Admin Fallback

**Symptom:** An admin user uploading a document creates a claim with `tenantId = 'demo-insurance'` instead of the intended tenant.

**Root cause:** The upload endpoint falls back to `'demo-insurance'` when `user.tenantId` is null and `user.role === 'admin'`. This is intentional for the demo environment but can cause data to land in the wrong tenant in production.

**Current behaviour (by design):** Admin users without a `tenantId` get `'demo-insurance'`. This is documented in `server/upload-documents.ts`.

**Prevention:** In production, ensure all admin users have a `tenantId` set in the `users` table. The `'demo-insurance'` fallback should only be active in the demo/development environment.

---

## FM-010: Recovery Job Retry Loop (max retries not respected)

**Symptom:** A claim with a corrupted source document (e.g., password-protected PDF) is retried indefinitely by the recovery job, consuming LLM API quota.

**Root cause:** The `recoveryRetryCount` check was not applied consistently across all recovery cases.

**Fix applied:** All recovery cases (7, 11, 12) check `recoveryRetryCount < MAX_RECOVERY_RETRIES` (max 3) before re-triggering. After 3 retries, the claim is set to `human_review_required` and removed from the auto-retry queue.

**Prevention:** When adding a new recovery case, always include the `recoveryRetryCount` check and increment it on trigger.


---

# 08 — How to Verify Changes

## The Standard

A fix is verified when you can show a real before/after pipeline output on a reference claim — not just passing unit tests. Unit tests verify logic in isolation; the pipeline is a complex multi-stage system where a change in one stage can have non-obvious downstream effects.

---

## Reference Claim Setup

The system includes a built-in claim simulator (`server/routers/simulation.ts`) that creates synthetic test claims with known characteristics. Use this for verification — never use real customer data.

### Creating a Test Claim

1. Log in as an admin or claims processor
2. Navigate to the Platform Simulator (admin portal → Platform → Simulator)
3. Select a claim template (e.g., "Standard rear-end collision", "High-value comprehensive claim")
4. The simulator creates a claim with `claimSource='simulator'` and `status='intake_pending'`
5. The pipeline triggers automatically via `setImmediate`

Alternatively, upload a synthetic PDF via the processor dashboard upload button.

### What to Check After a Pipeline Run

After the pipeline completes, verify the following in the database (use the Pipeline Observability page or direct SQL):

```sql
SELECT 
  c.claim_number,
  c.status,
  c.workflow_state,
  c.document_processing_status,
  c.pipeline_current_stage,
  c.ai_assessment_triggered,
  c.ai_assessment_completed,
  c.recovery_retry_count,
  a.recommendation,
  a.fraud_risk_level,
  a.confidence_score,
  a.estimated_cost,
  JSON_LENGTH(a.pipeline_run_summary) as summary_stages
FROM claims c
LEFT JOIN ai_assessments a ON a.claim_id = c.id
WHERE c.claim_number = 'DOC-YYYYMMDD-XXXXXXXX'
ORDER BY a.created_at DESC
LIMIT 1;
```

Expected values for a successful run:
- `status = 'analysis_complete'`
- `document_processing_status = 'DOCUMENT_COMPLETE'`
- `pipeline_current_stage = NULL` (cleared on completion)
- `ai_assessment_triggered = 1`
- `ai_assessment_completed = 1`
- `recovery_retry_count = 0` (or 1 if it was retried once)
- `recommendation` is one of: `APPROVE`, `REVIEW`, `REJECT`, `ESCALATE`, `NEGOTIATE`, `PROCEED_TO_ASSESSMENT`
- `confidence_score` between 0 and 100
- `summary_stages >= 10` (at least 10 stages ran)

---

## Verifying a Pipeline Stage Change

If you modify a pipeline stage, run the pipeline on at least two reference claims and compare the before/after output:

1. **Before:** Note the current output of the affected stage from `ai_assessments` (the relevant JSON column)
2. **Apply your change**
3. **Re-run:** Use the "Run KINGA" button in the claim detail view (or the manual trigger script at `server/scripts/test-pipeline-trigger.ts`)
4. **After:** Check the same JSON column in the new `ai_assessments` row (re-analysis creates a new row with `isReanalysis=1`)
5. **Compare:** Verify the output changed in the expected direction

### Manual Pipeline Trigger Script

```bash
cd /home/ubuntu/kinga-replit
npx tsx server/scripts/test-pipeline-trigger.ts <claimId>
```

This script runs the pipeline synchronously (not via `setImmediate`) and prints verbose output to stdout. It is safe to run in development — it creates a new `ai_assessments` row with `isReanalysis=1`.

---

## Running Unit Tests

```bash
cd /home/ubuntu/kinga-replit
pnpm test
```

The test suite uses Vitest. Test files are co-located with their modules (`server/*.test.ts`, `server/routers/*.test.ts`).

Key test files:
- `server/accidentPhysics.test.ts` — Physics engine unit tests
- `server/advancedPhysics.test.ts` — Advanced physics scenarios
- `server/assessment-processor.test.ts` — Assessment processor
- `server/auth.logout.test.ts` — Auth flow reference test
- `server/workflow-queries.test.ts` — Workflow query tests

**Rule:** Unit tests are required for new procedures and new pipeline stages. A PR that adds a stage without a test will not be merged.

---

## Verifying a Recovery Job Change

The recovery job runs every 10 minutes. To test a change immediately:

1. Create a claim in the target state (e.g., `document_failed`) directly via SQL or the simulator
2. Restart the server (the startup sweep runs on every start and will pick up `intake_pending` claims)
3. Or wait up to 10 minutes for the next recovery job cycle
4. Check the server logs for the recovery job output: `[RecoveryJob] CASE N: ...`

To force an immediate recovery job run without restarting:

```bash
# In the server logs, look for the recovery job interval ID
# There is no manual trigger endpoint — restart the server instead
```

---

## Verifying a Dashboard/UI Change

1. Open the processor dashboard in the browser
2. Check the "Pending" tab — it should show claims with `status` in: `intake_pending`, `document_failed`, `submitted`, `triage`, `assessment_pending`, `human_review_required`
3. Check the "In Review" tab — it should show claims with `status` in: `document_validating`, `analysis_running`, `document_ready`, `assessment_in_progress`
4. Check the "KINGA Complete" tab — it should show claims with `status` in: `analysis_complete`, `assessment_complete`

If a claim is not appearing in the expected tab, check:
1. The claim's `tenantId` matches the logged-in user's `tenantId`
2. The claim's `status` is in the query's status list (check `ClaimsProcessorDashboard.tsx` and `getClaimsByStatus` in `server/routers/workflow-queries.ts`)
3. The claim is not filtered out by the search/filter controls

---

## Verifying a Schema Change

1. Edit `drizzle/schema.ts`
2. Run `pnpm db:push` — this generates and applies the migration
3. Verify the migration ran: check `drizzle/migrations/` for a new file
4. Verify the column exists in the DB: use the Database panel in the Management UI or run a direct SQL query
5. Update any `@ts-nocheck` files that reference the changed table to use the new column name

**Warning:** `pnpm db:push` is destructive for column renames and drops. Always back up the DB before running it in production. In development, data loss is acceptable.


---

# 09 — Extension Points

## How to Add a New Pipeline Stage

### Step 1: Define the output type

Add the stage output interface to `server/pipeline-v2/types.ts`:

```ts
export interface Stage99Output {
  myNewField: string;
  confidence: number;
}
```

Add the field to `PipelineResult`:

```ts
export interface PipelineResult {
  // ... existing fields ...
  stage99Output: Stage99Output | null;
}
```

### Step 2: Add the DB column

In `drizzle/schema.ts`, add a column to `ai_assessments`:

```ts
stage99OutputJson: longtext("stage99_output_json"),
```

Run `pnpm db:push`.

### Step 3: Implement the stage in the orchestrator

In `server/pipeline-v2/orchestrator.ts`, add the stage block at the appropriate position in the execution flow:

```ts
// Stage 99: My New Stage
ctx.onStageStart?.("Stage 99 — My New Stage");
let stage99Output: Stage99Output | null = null;
try {
  const result = await invokeLLM({ /* ... */ });
  stage99Output = JSON.parse(result.choices[0].message.content);
  ctx.log("Stage 99", `Completed: myNewField=${stage99Output.myNewField}`);
} catch (err) {
  ctx.log("Stage 99", `Failed (non-fatal): ${String(err)}`);
  // Non-fatal: continue pipeline
}
```

Update the navigational map comment at the top of the orchestrator file.

### Step 4: Persist the output

In `db.ts`, add the field to the `upsert` call after `runPipelineV2` returns:

```ts
stage99OutputJson: result.stage99Output ? JSON.stringify(result.stage99Output) : null,
```

### Step 5: Write a test

Add a test in `server/pipeline-v2/stage99.test.ts` (or co-locate with the orchestrator). The test should verify the stage output shape and at least one happy-path scenario.

### Step 6: Verify end-to-end

Run the pipeline on a reference claim and verify `stage99_output_json` is populated in `ai_assessments`.

---

## How to Add a New Claim Field

### Step 1: Add to schema

In `drizzle/schema.ts`, add the column to the `claims` table:

```ts
myNewField: varchar("my_new_field", { length: 100 }),
```

Run `pnpm db:push`.

### Step 2: Add to the pipeline (if populated by the pipeline)

In the appropriate stage in the orchestrator, add the DB update:

```ts
await db.update(claims).set({ myNewField: value }).where(eq(claims.id, ctx.claimId));
```

### Step 3: Add to the tRPC procedure (if user-editable)

In the relevant router, add the field to the input schema and the update handler.

### Step 4: Add to the UI

In the relevant page component, add the field to the display and/or edit form.

---

## How to Add a New Claim Source

A new claim source (e.g., a new mobile app, a new API integration) must:

1. **Create the claim with canonical intake state:**
   ```ts
   status: "intake_pending",
   workflowState: "intake_queue",
   claimSource: "my_new_source",
   aiAssessmentTriggered: 0,
   aiAssessmentCompleted: 0,
   ```

2. **Set `sourceDocumentId`** if the claim has an associated document (required for the pipeline to run). If the claim has no document, the pipeline cannot run automatically — it will need a human to attach a document first.

3. **Trigger the pipeline** via `setImmediate(() => triggerAiAssessment(claimId))` after the claim is created. The startup sweep will catch any claims where this trigger is lost.

4. **Verify dashboard visibility:** Ensure the new `claimSource` value does not require any dashboard filter changes. The dashboard queries by `status`, not by `claimSource`, so new sources are automatically visible.

---

## How to Add a New Portal

### Step 1: Define the portal role

In `server/rbac.ts`, add the new role to the appropriate union type. If it is a top-level portal role (not an insurer sub-role), add it to the `role` enum in `drizzle/schema.ts` and run `pnpm db:push`.

### Step 2: Add the portal layout

Create `client/src/components/MyNewPortalLayout.tsx`. Use an existing layout (e.g., `InsurerPortalLayout.tsx`) as a template. The layout should:
- Check `useAuth().user?.role === 'my_new_role'` and redirect to login if not authenticated
- Provide navigation links to the portal's pages
- Include a logout button

### Step 3: Register the routes

In `client/src/App.tsx`, add the portal routes under a new path prefix:

```tsx
<Route path="/my-portal/*">
  <ProtectedRoute requiredRole="my_new_role">
    <MyNewPortalLayout>
      <Switch>
        <Route path="/my-portal/dashboard" component={MyPortalDashboard} />
      </Switch>
    </MyNewPortalLayout>
  </ProtectedRoute>
</Route>
```

### Step 4: Add the server-side domain middleware

In `server/_core/domain-middleware.ts`, add the new role to the `DOMAIN_ROLE_MAP`. This ensures the server correctly identifies the portal from the request context.

### Step 5: Add tRPC procedures

Create a new router file in `server/routers/my-new-portal.ts`. Use `protectedProcedure` with a role check:

```ts
const myPortalProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'my_new_role') {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
  return next({ ctx });
});
```

Register the router in `server/routers.ts`.

---

## How to Add a New Insurer Sub-Role

1. Add the role to the `InsurerRole` union type in `server/rbac.ts`
2. Add a permissions entry in the `PERMISSIONS` object in `server/rbac.ts`
3. Add workflow transition rules if the role has unique transition permissions
4. Add a dashboard component in `client/src/pages/`
5. Add a route in `App.tsx` under `/insurer-portal/`
6. Update `DashboardLayout.tsx` to show the correct navigation for the new role

---

## How to Add a New Report Type

1. Create the report data assembly function in `server/routers/reports.ts` (or a new file)
2. Create the HTML template function (returns an HTML string)
3. Use `renderAndUpload(html, s3KeyPrefix)` from `server/reporting/pdfRenderer.ts` to generate the PDF
4. Store the S3 URL in the appropriate DB table
5. Add a tRPC procedure to trigger generation and return the URL
6. Add a download button in the relevant UI page

Follow the existing pattern in `server/routers/reports.ts` for the procedure structure.

---

## How to Extend the Fraud Detection System

**Important:** The fraud scoring weights, thresholds, and indicator definitions are intentionally not documented here. Contact the KINGA security team before modifying fraud detection logic.

The safe extension points are:

1. **Adding a new fraud indicator** — add a new field to the `FraudIndicator` type in `server/pipeline-v2/types.ts` and populate it in Stage 8. The indicator will automatically appear in the fraud assessment report section.

2. **Adding a new data source for fraud cross-referencing** — add a new DB table for the reference data, add a query helper in `server/db.ts`, and call it from Stage 8 in the orchestrator.

3. **Adding a new cross-claim intelligence check** — add a new procedure in `server/routers/intelligence.ts`. Cross-claim queries MUST filter by `tenantId` — never query across tenants.
