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
