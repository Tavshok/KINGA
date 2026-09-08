# KINGA Engineering System Manual

> **Purpose:** This is the technical key to KINGA. Use it to follow one claim from browser action to governed data access, pipeline analysis, decision/reporting, and operational evidence. It is a map of the implemented codebase at the documented baseline, not a claim that every optional provider, deployment control, or historical data path is live.

## 1. How to use this manual

Start with the failure or feature in front of you, then follow its **entry point**, **authority boundary**, **owning contract**, **persistence boundary**, and **verification evidence**. Do not begin from a screen label or a database column name alone. In KINGA, the same business concept can appear in client presentation, a tRPC router, a service/resolver, a pipeline stage, an audit entry and a report model; the owning source is determined by the code path that creates or governs it.

| If you need to… | Start here | Then trace | Do not assume |
|---|---|---|---|
| Diagnose a browser action | `client/src/App.tsx` and the page/component | `client/src/lib/trpc.ts` → router namespace → procedure body | A visible control proves the user is authorised. |
| Diagnose a claim or pipeline result | `server/pipeline-v2/orchestrator.ts` | stage module → persisted assessment/claim field → canonical reporting resolver | A pipeline output is a human-approved outcome. |
| Change a report field | `server/reporting/` model/resolver | claim/assessment source → renderer → shared CL/CI/FR parity tests | A renderer may independently derive a field safely. |
| Change tenant/role behaviour | `server/_core/context.ts`, `trpc.ts`, `domain-middleware.ts` | target-object predicate in router/service → authority regression | A role check alone scopes data to the right tenant. |
| Change a table or field | `drizzle/schema.ts` | all reader/writer queries, canonical contracts, migration history, tests | Source schema and live database are automatically identical. |

## 2. Executable runtime map

KINGA is a React/Vite client with an Express/tRPC server, Drizzle/MySQL-compatible data layer, server-side provider adapters, reporting, and a staged claim-intelligence pipeline. The primary runtime assembly is `server/_core/index.ts`; procedure composition is rooted at `server/routers.ts`; client route composition is rooted at `client/src/App.tsx`.

```text
Browser route / portal page
  → typed tRPC hook (client/src/lib/trpc.ts)
    → server/routers.ts namespace
      → protected/domain/role middleware
        → session user + tenant context
          → target-object authority check
            → Drizzle query / service / pipeline / provider adapter
              → database, storage, audit, notification, report artefact
                → typed response → client loading / error / empty state
```

| Layer | Primary locations | Responsibility | Hard boundary |
|---|---|---|---|
| Browser shell | `client/src/App.tsx`, `client/src/pages/`, `client/src/components/` | Routes, portal navigation, presentational state, typed queries/mutations | Client hiding is not access control. |
| Transport/runtime | `server/_core/index.ts`, `server/_core/context.ts`, `server/_core/trpc.ts` | HTTP lifecycle, request user/context, tRPC procedure primitives | Missing/invalid user context must fail closed on protected paths. |
| Domain authority | `server/_core/domain-middleware.ts`, feature routers | Role/domain permission plus tenant/object permission | Session tenant is authoritative; client tenant input is not. |
| Application services | `server/`, `server/reporting/`, `server/engineer/` | Claim flows, workflow, reports, operational logic | Preserve explicit audit/notification side effects. |
| Intelligence pipeline | `server/pipeline-v2/` | Staged evidence, validation, damage, physics, fraud, cost, interpretation and report preparation | Preserve stage contracts, timeouts, degradation and provenance. |
| Persistence | `drizzle/schema.ts`, `server/db.ts` | Schema declarations and query access | Parent claim/tenant authority must precede sensitive child-row access. |
| Integrations | `server/_core/llm.ts`, `server/storage.ts`, notifications/observability adapters | Provider invocation and evidence/artefact storage | A dependency or adapter is not proof of active production configuration. |

## 3. Claim execution path

A claim is not one linear function. The client and ingress paths create or update governed claim evidence; workflow and role procedures determine who may proceed; the pipeline generates structured analytical outputs; decision/approval procedures preserve human authority; reporting resolves a governed view for a requested tier or role. New engineers should identify the active path before changing it, particularly where replay, reanalysis, document ingestion, or an engineer inspection can re-enter the claim lifecycle.

| Step | Main code locations | Inputs | Output / persistence | Verification focus |
|---|---|---|---|---|
| Identity and context | `server/_core/context.ts`, auth and domain middleware | Session/JWT-derived user context | Current user, role and tenant context | Deleted/tenantless user must not acquire authority through a fallback. |
| Claim/core workflow | claim routers including `claims-core.ts`, completion/replay modules | Validated claim input and session context | Claim, event, assignment, workflow and related records | Tenant/object predicates and valid transition rules. |
| Evidence acquisition | document ingestion, inspection/engineer router paths | Document/image/inspection inputs linked to authorised claim | Documents, metadata, measurements, observations, ingestion results | Child evidence cannot be read/written across the parent claim’s tenant boundary. |
| Intelligence | `server/pipeline-v2/orchestrator.ts` | Governed claim record and evidence/context | Structured per-stage outputs, assessment fields, logs/flags | Stage contract, timeout/fallback, provenance and degradation visibility. |
| Human decision/approval | `decision.ts`, `approval.ts`, workflow/queue modules | Governed claim and permitted reviewer action | Decision/approval state, audit/event/report readiness | AI recommendation and human decision remain distinct. |
| Reporting | `server/reporting/`, report routers/renderers | Tenant-scoped canonical claim/report model | Tier-specific report content, jobs/snapshots/links/audit where applicable | Shared fields must resolve identically across CL/CI/FR for the same source inputs. |

## 4. Pipeline V2: orchestration map and stage contracts

`server/pipeline-v2/orchestrator.ts` is the central execution map. Its declared calls establish the implemented order below. Several specialist engines run within, before, after, or alongside numbered stages; their presence does not mean every claim runs every optional path. Follow the actual orchestration condition and captured stage result when debugging a claim.

| Orchestration order | Implemented owner | Primary responsibility | Key hand-off / safety contract |
|---:|---|---|---|
| 1 | `stage-1-ingestion.ts` → `runIngestionStage` | Prepare/categorise incoming claim evidence for downstream processing. | Record ingestion failure/availability rather than inventing extracted content. |
| 2 | `stage-2-extraction.ts` → `runExtractionStage` | Extract material data from ingested evidence. | Downstream stages must distinguish unavailable extraction from a valid empty value. |
| 3 | `stage-3-structured-extraction.ts` → `runStructuredExtractionStage` | Normalise extraction into structured claim/evidence form. | Preserve source/provenance and validation outcome. |
| 4 | `stage-4-validation.ts` → `runValidationStage` | Validate structured information against stage inputs. | Failed/partial validation must remain observable. |
| 5 | `stage-5-assembly.ts` → `runAssemblyStage` | Assemble validated information for analytical stages. | Do not bypass canonical assembly with a renderer-local reconstruction. |
| 6 | `stage-6-damage-analysis.ts` → barrel exports; `.vision`, `.fallback`, `.merge`, `.stage` | Assess vehicle damage from eligible evidence and fallback/merged sources. | The compatibility barrel is public; preserve its exports. Vision/fallback/degraded paths must remain distinguishable. |
| 6.5 | `stage-6-5a-vge.ts`, `stage-6-5b-vgr.ts`, `stage-6-5c-slpe.ts` | Calibration, reconciliation and specialist loss/physics evidence refinement. | Treat calibration and impact-zone/body-type mapping changes as architecture-sensitive. |
| 7 | `stage-7-unified.ts` → `runUnifiedStage7` | Unified physics/claim-truth processing. | Preserve physical units, evidence conditions and truth-object contract. |
| 7B | `stage-7b-causal-reasoning.ts` → `runCausalReasoningEngine` | Causal reasoning on the governed pipeline evidence. | Causal verdict is evidence-derived; carry uncertainty and inputs. |
| 8 | `stage-8-fraud.ts` → `runFraudAnalysisStage` | Fraud/risk analysis and subsequent score recomputation where called. | Score/risk level is analytical information, not a final fraud finding. |
| 9 | `stage-9-cost.ts` → `runCostOptimisationStage` | Cost optimisation using validated damage/physics/structured evidence and fraud context. | Use named cost/write-off policy constants and keep warnings separate from recommendations. |
| 9.5 | `stage-9-5-cgi.ts` → `runContactGeometryIntelligence` | Contact-geometry intelligence. | Respect physical/claim source conditions; preserve structured output. |
| 9B | `stage-9b-turnaround.ts` → `runTurnaroundTimeStage` | Turnaround-time analysis. | Ensure elapsed-time language reflects actual calculation semantics. |
| 10I | `stage-10i-interpretation.ts` → `runInterpretationEngine` | Interpret consolidated analytical output into an explainable claim view. | Explanation must not conceal incomplete/degraded upstream inputs. |
| 10 | `stage-10-report.ts` → `runReportGenerationStage` | Generate report-stage artefacts from governed output. | Report readiness/availability must be explicit; rendering is not approval. |
| Post-stage | `orchestrator.ts` → auto-valuation path | Runs auto-valuation after the numbered report-stage call. | Provider/circuit failure must remain non-fatal only where code explicitly handles it. |

### 4.1 Supporting engines that frequently affect interpretation

The pipeline directory also contains explicit helpers for document health, cross-stage consistency, pre-generation/publication validation, reconciliation, explainability, integrity, uncertainty, semantic classification, photo forensics, evidence confidence, incident narrative, cross-quote analysis, speed inference, animal-strike physics, and other specialist calculations. These are **not automatically interchangeable**. Before moving logic between them, identify their input type, caller, evidence assumptions, failure representation, and persisted consumer.

### 4.2 Pipeline resilience rules

The orchestrator imports `runWithTimeout` from `pipelineContractRegistry.ts` and contains stage-resume/cache handling. It also exports `PipelineIncompleteError`. These are evidence that incomplete and time-bounded execution are first-class concerns. A fix must preserve the distinction between: a stage that has not run, a stage that ran and found no result, a stage that failed, a stage that was skipped by condition, and a stage whose result was resumed/reused.

## 5. Governing data contracts

### 5.1 Source contracts and canonical readers

| Contract | Location | What it governs | Engineering rule |
|---|---|---|---|
| Schema contracts | `drizzle/schema.ts` | Declared relational fields, enums and foreign-key relationships | Assess all readers/writers/migrations; do not infer live parity. |
| Claim canonical record | reporting resolver layer including `resolveClaimRecord()` | Tenant-scoped claim/assessment selection for shared report meaning | Shared report data must not be re-derived independently from raw queries. |
| Report record | `ResolvedReportRecord`, `resolveReportRecord()` and collection helpers | Tenant-scoped individual claim report data with report-specific fields | Preserve deterministic assessment selection and field provenance. |
| Forensic model | `forensicReportModel.ts` → `resolveForensicReportModel()` | Explicit intermediate contract for forensic renderer evidence, approval and output | Keep approval/sign-off as human report/decision semantics, not payment semantics. |
| Platform aggregates | platform report collection/aggregate helper layer | Cross-claim/role/executive report inputs | The caller’s authority and exact period must be explicit. |

### 5.2 AI assessment selection and report consistency

`ai_assessments` has reanalysis/versioning-related fields in the source schema. Where a resolver chooses an assessment for a claim, selection must be deterministic, tenant-scoped and intentional; code that merely receives an arbitrary row can introduce cross-tier inconsistency. The report implementation has dedicated CL/CI/FR shared-value regression coverage, and the forensic model has parity/no-fabrication coverage. Extend these tests whenever a shared source field, normalisation, assessment ordering or renderer mapping changes.

### 5.3 Human authority is a separate contract

The system contains analytical recommendation/fraud/cost outputs and separate workflow/decision/approval paths. A human decision should have an authorised actor, time, status/reason and audit/event representation where the owning workflow implements them. Do not promote an AI output to a claim status, approval, settlement/payment, or external communication merely because it is present in an assessment/report model.

## 6. Security and tenancy: the mandatory trace

Every feature touching a tenant-owned record must trace all five links below. A missing link is a potential cross-tenant defect even when another link looks correct.

```text
request session → ctx.user tenant/role → procedure/domain guard
  → target object's tenant/claim-parent predicate → query/write/provider side effect
```

| Boundary | Required evidence | Reference implementation |
|---|---|---|
| Session identity | User is present and accepted from server context; no deleted-user reprovision fallback. | Core context/auth flow and deleted-user regression. |
| Tenant context | Tenant comes from session; tenantless authorised roles fail closed for tenant procedures. | `engineerDomainProcedure`, notification tenant helper. |
| Capability/role | Role/domain capability is assessed before feature action. | `domain-middleware.ts`, restricted notification procedure. |
| Target authority | Single claim/inspection/document/notification is bound to current tenant/parent/user as applicable. | `inspections.ts`, `notifications.ts`, report/quote/comment authority tests. |
| Side effect | Provider invocation, export, notification, audit and write only occur after authority success. | P0 authority and side-effect regression patterns. |

`server/routers/notifications.ts` is an especially clear current pattern: `requireNotificationTenant` returns only the session tenant or throws `FORBIDDEN`; list/count/update predicates bind current user and tenant; individual mutations bind row ID, user ID and tenant ID. Bulk updates still bind the user and session tenant. Use this pattern for a user-owned resource inside a tenant.

## 7. Persistence, audit and external effects

| Operation category | Where to look | Minimum change review |
|---|---|---|
| Claim/assessment reads and writes | Router/service and `drizzle/schema.ts` table declarations | Parent claim + session tenant, column naming/units, error path, tests. |
| Evidence/document storage | document ingestion/router code and `server/storage.ts` | Ownership metadata, URL/file access, ingestion failure, retention/deletion semantics. |
| Workflow events/audit | workflow/audit routers and relevant schema tables | Actor, tenant, target, action, reason/time, and whether an event is complete or merely recorded. |
| Notifications | notifications router/DB/service/tracker/preferences | Recipient/current user, tenant, preference, idempotency/retry and no side effect after denial. |
| Reports/exports | reporting model/renderer/job/export route | Request authority, tenant source, selected assessment, provenance, output storage/link and audit. |
| AI/provider calls | LLM/provider adapter and pipeline callers | Input minimisation, structured validation, timeout/circuit/degradation handling, persistence/audit policy. |

## 8. Debugging runbooks

### 8.1 A user sees an empty/broken/incorrect page

1. Identify the route in `client/src/App.tsx` and page/component in `client/src/pages/`.
2. Identify the tRPC hook or request and its namespace in `client/src/lib/trpc.ts`.
3. Read the entire server procedure: input schema, middleware, session tenant derivation, query/side effect, returned error/empty semantics.
4. Check the browser/server logs in `.manus-logs/` only as observation; do not make data-changing diagnoses from a log line alone.
5. Reproduce using a non-production, tenant-owned fixture. A “no data” state and a DB/provider failure must remain distinguishable.
6. Add or use a behaviour-level regression, not a source-text assertion tied to a file shape.

### 8.2 A pipeline result or report differs from expectation

1. Record claim ID, session tenant, report tier/role, requested date/period and exact observed field/value.
2. Trace the report from renderer to `ResolvedReportRecord`/forensic model/canonical resolver; locate the selected `ai_assessments` row and its version/reanalysis metadata.
3. Trace the owning stage via `orchestrator.ts`; inspect stage logs/result, any `runWithTimeout` outcome, resume-cache path, gate/degradation indicator and provider error.
4. Compare values at the contract boundary before renderer formatting. For shared tier fields, run/extend the existing parity test rather than asserting visual similarity only.
5. If the conclusion relies on evidence, retain source/provenance/assumption/uncertainty fields; do not repair presentation by inserting a default value.

### 8.3 A security/tenant-isolation concern

1. Start from the exact procedure, not the client page.
2. Prove the request user and tenant path; do not trust supplied `tenantId`.
3. Prove the parent target (claim, inspection, document or report record) is tenant-owned before child access.
4. Prove mutation/export/provider calls cannot happen when authority fails.
5. Add same-tenant and foreign-tenant real-data fixtures using exact owned-ID cleanup. Include tenantless and spoofed-input coverage where the procedure accepts relevant input.

## 9. Safe change checkpoints

| Change | Required checkpoints before review | Additional specialist evidence |
|---|---|---|
| Client component/page | Typed hook/API contract, load/empty/error states, route render, relevant tests | User-role/tenant manual smoke test where accessible. |
| Router/service | Input schema, session tenant, target authority, query predicate, side effects, error path | Foreign-tenant and tenantless regressions for owned data. |
| Schema or migration | Source schema, migrations, live non-production inventory, all writers/readers, rollback/data policy | No production DDL/data action without explicit authorisation. |
| Pipeline stage/engine | Caller input/output contract, timeout/degradation/resume state, provenance, persisted/report consumers | Stage-focused suite plus baseline-aware full-suite comparison. |
| Report/model | Canonical source/selection, CL/CI/FR/role parity, no-fabrication output, export authority | Compare displayed precision and unavailable-data state. |
| Authentication/role | Session/context lifecycle, all call sites, deleted/tenantless cases, audit/side-effect boundary | Treat as P0 until evidence proves a narrower scope. |

## 10. What remains deliberately unverified

This manual does not certify a live production database, staging environment, provider account, WhatsApp channel, deployment topology, disaster-recovery process, observability alert, or external compliance posture. The repository contains source and configuration evidence; it does not alone prove operational activation. Use `KINGA_KNOWN_LIMITATIONS.md`, `KINGA_DEPLOYMENT_OPERATIONS.md`, `KINGA_INTEGRATIONS.md`, existing drift/reconciliation records, and approved environment owners before treating these areas as production-verified.

## 11. Companion manuals

| Need | Read next |
|---|---|
| First-day setup and first safe contribution | `KINGA_ENGINEER_ONBOARDING.md` and `KINGA_LOCAL_DEVELOPMENT.md` |
| Full source ownership map | `KINGA_REPOSITORY_RECONNAISSANCE.md` and `KINGA_CODEBASE_GUIDE.md` |
| Table and data-model interpretation | `KINGA_DATABASE_MANUAL.md` |
| Procedure details | `KINGA_API_REFERENCE.md` and `KINGA_SECURITY_MANUAL.md` |
| Claims/report/AI/forensic detail | `KINGA_CLAIMS_INTELLIGENCE_MANUAL.md`, `KINGA_FORENSIC_ENGINE_MANUAL.md`, `KINGA_AI_ENGINEERING_MANUAL.md` |
| Change/review rules and hard boundaries | `KINGA_ENGINEERING_CHANGE_GUIDE.md` and `KINGA_ARCHITECTURAL_INVARIANTS.md` |
| Test and operational recovery | `KINGA_TESTING_MANUAL.md`, `KINGA_DEPLOYMENT_OPERATIONS.md`, `KINGA_KNOWN_LIMITATIONS.md` |
