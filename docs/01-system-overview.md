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
