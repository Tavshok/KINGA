# KINGA AutoVerify AI — Codebase Map

**Version:** 1.0 | **Author:** Tavonga Shoko, Lead Engineer | **Last Updated:** August 2026

This document is the authoritative reference for every module in the KINGA platform. It is intended for engineers joining the project and for anyone navigating the codebase for the first time.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Entry Points](#entry-points)
3. [Server — Core Framework](#server--core-framework)
4. [Server — Database Layer](#server--database-layer)
5. [Server — tRPC Routers](#server--trpc-routers)
6. [Server — AI Pipeline (pipeline-v2)](#server--ai-pipeline-pipeline-v2)
7. [Server — Reporting](#server--reporting)
8. [Server — Intelligence Engines](#server--intelligence-engines)
9. [Server — Workflow Engine](#server--workflow-engine)
10. [Server — WhatsApp Integration](#server--whatsapp-integration)
11. [Server — Scheduled Jobs](#server--scheduled-jobs)
12. [Server — Services](#server--services)
13. [Client — Pages (Portals)](#client--pages-portals)
14. [Client — Components](#client--components)
15. [Client — Core Utilities](#client--core-utilities)
16. [Shared](#shared)
17. [Database Schema](#database-schema)
18. [Key Architectural Patterns](#key-architectural-patterns)
19. [File Size Reference](#file-size-reference)

---

## Architecture Overview

KINGA is a **portals-over-shared-engines** platform. Multiple user-facing portals (Insurer, Assessor, Panel Beater, Client, Fleet, Engineer, Agency, Admin) all consume the same shared intelligence engines. No portal owns its own engine — engines are platform assets.

```
Client Portals (React)
       │
       ▼
  tRPC Routers  ──────────────────────────────────────────────────────────────┐
       │                                                                       │
       ▼                                                                       │
  server/db.ts  ◄──── All DB helpers (4,883 lines, single source of truth)    │
       │                                                                       │
       ▼                                                                       │
  AI Pipeline (pipeline-v2/orchestrator.ts)                                   │
       │                                                                       │
       ├── Stage 1: Ingestion          ├── Stage 6: Damage Analysis            │
       ├── Stage 2: Extraction         ├── Stage 7: Physics                    │
       ├── Stage 3: Structured Extract ├── Stage 8: Fraud                      │
       ├── Stage 4: Validation         ├── Stage 9: Cost                       │
       ├── Stage 5: Assembly           ├── Stage 9.5: CGI                      │
       │                               └── Stage 10: Report                    │
       │                                                                       │
       ▼                                                                       │
  Shared Intelligence Engines                                                  │
  (accidentPhysics, fraudScoring, vehicleValuation, photoForensics, etc.)     │
       │                                                                       │
       ▼                                                                       │
  TiDB / MySQL  ◄─────────────────────────────────────────────────────────────┘
```

**Stack:** React 19 + Tailwind 4 + Express 4 + tRPC 11 + Drizzle ORM + TiDB/MySQL

---

## Entry Points

| File | Purpose |
|---|---|
| `server/_core/index.ts` | Express server entry point — mounts tRPC, OAuth, file upload, WebSocket, and Heartbeat handlers |
| `client/src/main.tsx` | React app entry point — wraps app in tRPC provider, auth context, and theme |
| `client/src/App.tsx` | All client routes — lazy-loaded pages, portal guards, redirect rules |
| `vite.config.ts` | Vite build config — bundle splitting by portal domain |

---

## Server — Core Framework

All files under `server/_core/` are framework-level infrastructure. **Do not edit unless extending the infrastructure itself.**

| File | Purpose |
|---|---|
| `_core/trpc.ts` | tRPC initialisation — exports `router`, `publicProcedure`, `protectedProcedure`, `insurerDomainProcedure` |
| `_core/context.ts` | Request context builder — extracts user from JWT cookie, builds `ctx.user` |
| `_core/index.ts` | Express app setup — mounts all middleware, routes, and the dev server proxy |
| `_core/env.ts` | Environment variable registry — single source of truth for all env vars |
| `_core/oauth.ts` | Manus OAuth flow — callback handler, state parsing, token exchange |
| `_core/llm.ts` | LLM invocation helper — wraps the Manus built-in LLM API |
| `_core/notification.ts` | Owner notification helper — sends in-app alerts to the platform owner |
| `_core/heartbeat.ts` | Heartbeat SDK integration — registers and handles scheduled cron jobs |
| `_core/sdk.ts` | Heartbeat SDK patches — adds cron-user bypass for scheduled job auth |
| `_core/audit-logger.ts` | Automated audit logging middleware |
| `_core/domain-middleware.ts` | Domain-based role guard middleware — enforces portal access by role |
| `_core/tenant-middleware.ts` | Tenant isolation middleware — injects tenantId into all procedures |
| `_core/cookies.ts` | Session cookie configuration |
| `_core/customAuth.ts` | Custom authentication helpers |
| `_core/platform-super-admin-guard.ts` | Super-admin bypass guard for platform testing |
| `_core/imageGeneration.ts` | Image generation helper |
| `_core/voiceTranscription.ts` | Whisper voice transcription helper |
| `_core/map.ts` | Google Maps API proxy helper |
| `_core/dataApi.ts` | Manus Data API helper |
| `_core/systemRouter.ts` | System-level tRPC procedures (notifyOwner, health check) |

---

## Server — Database Layer

| File | Purpose |
|---|---|
| `server/db.ts` | **Primary DB module** (4,883 lines). All query helpers, the pipeline semaphore, and `triggerAiAssessment()`. Every domain's DB helpers live here. |
| `server/db-pipeline.ts` | Pipeline observability helpers — `recordRunStart`, `recordRunComplete`, `recordStageStart`, `recordStageComplete`, `saveStageResult`, `loadCompletedStages`, read helpers. Fire-and-forget pattern. |
| `server/db-validation.ts` | DB schema validation utilities |
| `server/analytics-db.ts` | Analytics-specific query helpers |
| `server/claim-comments-db.ts` | Claim comment thread query helpers |
| `server/fleet/fleet-db.ts` | Fleet-specific query helpers |
| `drizzle/schema.ts` | **Canonical DB schema** — all Drizzle table definitions. Single source of truth for the database. |

> **Rule:** All DB queries must go through `server/db.ts` helpers or domain-specific helpers. Never write raw SQL in router files.

---

## Server — tRPC Routers

The main aggregator is `server/routers.ts` (1,573 lines). It imports from all domain router files and assembles the `appRouter`.

### Extracted Domain Routers (Aug 2026 split)

| File | Lines | Domain |
|---|---|---|
| `routers/claims-core.ts` | 3,566 | FNOL, claim submission, status transitions, approval, settlement, PDF export |
| `routers/ai-assessments-core.ts` | 1,799 | AI assessment results, report access, pipeline management, re-run |
| `routers/quotes-core.ts` | 620 | Panel beater quote submission, review, line items, optimisation |
| `routers/assessors-core.ts` | 404 | External assessor management, assignment, capacity checks |
| `routers/claim-reports-core.ts` | 430 | Report generation, access control, download |
| `routers/auth-core.ts` | 254 | Login, logout, session, user profile, role management |
| `routers/panel-beaters-core.ts` | 187 | Panel beater listing, approval, marketplace |

### Other Domain Routers

| File | Domain |
|---|---|
| `routers/analytics.ts` | Platform analytics and KPI dashboards |
| `routers/admin.ts` | Platform admin procedures |
| `routers/agency.ts` | Agency operations |
| `routers/agency-broker.ts` | Agency broker procedures |
| `routers/approval.ts` | Financial approval workflow |
| `routers/asset-passport.ts` | Asset Passport (Epic 4) |
| `routers/audit.ts` | Audit trail queries |
| `routers/claims-manager.ts` | Claims manager dashboard procedures |
| `routers/compliance.ts` | Compliance reporting |
| `routers/cross-claim-intelligence.ts` | Cross-claim pattern detection |
| `routers/decision.ts` | Decision governance |
| `routers/document-ingestion.ts` | Document upload and ingestion |
| `routers/driver-registry.ts` | Driver management |
| `routers/exception-intelligence.ts` | Exception and anomaly intelligence |
| `routers/executive.ts` | Executive dashboard procedures |
| `routers/fleet-accounts.ts` | Fleet account management |
| `routers/fleet-core.ts` | Fleet vehicle and driver management |
| `routers/global-search.ts` | Platform-wide search (Epic 5-A) |
| `routers/governance.ts` | Platform governance |
| `routers/governance-dashboard.ts` | Governance dashboard |
| `routers/historical-claims.ts` | Historical claims ingestion |
| `routers/inspections.ts` | Engineering inspections (Epic 3) |
| `routers/insurance-core.ts` | Insurance quote, payment, policy procedures |
| `routers/insurance-phase7.ts` | Phase 7 insurance — quote delivery, document delivery, policy management |
| `routers/intake-gate.ts` | Claim intake gate — quality checks before pipeline |
| `routers/intelligence-platform.ts` | Cross-module intelligence, fleet intelligence, portfolio intelligence (Epic 4) |
| `routers/intelligence.ts` | General intelligence procedures |
| `routers/marketplace.ts` | Panel beater marketplace |
| `routers/notifications.ts` | In-app notification procedures |
| `routers/operational-health.ts` | System health monitoring |
| `routers/panel-beater-analytics.ts` | Panel beater performance analytics |
| `routers/personal-vehicles.ts` | Client personal vehicle registry |
| `routers/pipeline-observability.ts` | Pipeline run monitoring |
| `routers/platform.ts` | Platform admin procedures |
| `routers/platform-operations.ts` | Platform operations centre (Epic 5-C) |
| `routers/platform-observability.ts` | Platform observability |
| `routers/policy-management.ts` | Policy lifecycle management |
| `routers/recovery.ts` | Recoveries and subrogation |
| `routers/repair-history.ts` | Vehicle repair history |
| `routers/reporting.ts` | Report access control |
| `routers/reports.ts` | Report generation procedures |
| `routers/review-queue.ts` | Manual review queue |
| `routers/tenant.ts` | Tenant management |
| `routers/vehicle-damage-history.ts` | Vehicle damage history |
| `routers/vehicle-passport.ts` | Vehicle Passport (Epic 4) |
| `routers/vehicle-registry.ts` | Vehicle registry |
| `routers/vehicle-structural-intelligence.ts` | Structural damage intelligence |
| `routers/vehicle-valuation-core.ts` | Vehicle valuation procedures |
| `routers/workflow.ts` | Workflow engine procedures |
| `routers/workflow-audit.ts` | Workflow audit trail |
| `routers/workflow-queries.ts` | Workflow state queries |

---

## Server — AI Pipeline (pipeline-v2)

The pipeline processes every claim through 14 stages. The orchestrator (`orchestrator.ts`) runs all stages sequentially and writes results to the DB after each stage.

| File | Stage | Purpose |
|---|---|---|
| `orchestrator.ts` | All | Main pipeline orchestrator — 14-stage sequential execution, semaphore, resume support |
| `stage-1-ingestion.ts` | 1 | Document ingestion — PDF/image parsing, OCR |
| `stage-2-extraction.ts` | 2 | Raw data extraction from ingested documents |
| `stage-3-structured-extraction.ts` | 3 | Structured field extraction — vehicle, incident, claimant |
| `stage-4-validation.ts` | 4 | Data validation and completeness checks |
| `stage-5-assembly.ts` | 5 | Claim record assembly — merges all extracted data |
| `stage-6-damage-analysis.ts` | 6 | Damage detection and component identification |
| `stage-6-5a-vge.ts` | 6.5a | Vehicle Geometry Engine — structural zone mapping |
| `stage-6-5b-vgr.ts` | 6.5b | Vehicle Geometry Reconstruction |
| `stage-6-5c-slpe.ts` | 6.5c | Structural Load Path Engine |
| `stage-7-physics.ts` | 7 | Physics analysis — speed estimation, impulse-momentum |
| `stage-7-unified.ts` | 7u | Unified physics output assembly |
| `stage-7b-causal-reasoning.ts` | 7b | Causal reasoning — collision direction, mechanism |
| `stage-8-fraud.ts` | 8 | Fraud scoring — component, behavioural, network signals |
| `stage-9-cost.ts` | 9 | Cost intelligence — quote extraction, composite optimisation |
| `stage-9-5-cgi.ts` | 9.5 | Crash Geometry Intelligence — structural consistency |
| `stage-9b-turnaround.ts` | 9b | Turnaround time estimation |
| `stage-10-report.ts` | 10 | Report generation trigger |
| `stage-10i-interpretation.ts` | 10i | Interpretation engine — plain-language decision summaries |
| `types.ts` | — | Pipeline type definitions (2,061 lines — canonical type contracts) |
| `quoteExtractionEngine.ts` | — | OCR-based quote extraction from PDF documents |
| `quoteOptimisationEngine.ts` | — | Composite quote optimisation — per-component minimum selection |
| `truthReconciliationEngine.ts` | — | Cross-stage truth reconciliation |
| `photoForensicsEngine.ts` | — | Photo forensics — zone labelling, contradiction detection |
| `accidentPhysics.ts` | — | Physics engine — impulse-momentum, coefficient of friction |
| `pipelineGateController.ts` | — | Gate controller — warns but never blocks assessments |
| `pipelineStateMachine.ts` | — | Pipeline state machine |

> **Critical rule:** The gate should **never block** an assessment — it warns and notifies only.

---

## Server — Reporting

| File | Report Tier | Purpose |
|---|---|---|
| `reporting/reportDefinitions.ts` | CL — Claims Assessment | Claims Assessment Report — process tier, client-facing summary |
| `reporting/claimsIntelligenceReport.ts` | CI — Claims Intelligence | Claims Intelligence Report — protect tier, insurer analytics |
| `reporting/forensicDecisionReport.ts` | FR — Forensic Decision | Forensic Decision Report — prove tier, legal-grade audit |
| `kingaReportGenerator.ts` | All | Report renderer — PDF generation via HTML→PDF pipeline |
| `final-claim-report-pdf.ts` | All | Final claim report PDF export |
| `claim-pdf-export.ts` | All | tRPC procedure wrapper for PDF export |
| `shadow-report-generator.ts` | — | Shadow report generation for A/B testing |

> **Report access:** CL is accessible to claimants and assessors. CI is insurer-only. FR is insurer + senior management only. Access is enforced by `REPORT_ACCESS` in `reportDefinitions.ts`.

---

## Server — Intelligence Engines

These are **shared platform services** — never duplicate them in portal-specific code.

| File | Engine | Purpose |
|---|---|---|
| `accidentPhysics.ts` | Physics Engine | Impulse-momentum, speed estimation, coefficient of friction |
| `fraud-scoring.ts` | Fraud Engine | Component-level fraud scoring |
| `fraud-detection-enhanced.ts` | Fraud Engine (Enhanced) | Behavioural and network fraud signals |
| `weighted-fraud-scoring.ts` | Fraud Engine (Weighted) | Weighted fraud score aggregation |
| `services/vehicleValuation.ts` | Valuation Engine | Vehicle market value estimation |
| `services/photoEnrichment.ts` | Photo Forensics | Photo zone labelling, contradiction detection |
| `services/damageConsistency.ts` | Damage Consistency | Cross-photo damage consistency checks |
| `cost-extraction-engine.ts` | Cost Engine | Quote line item extraction |
| `cost-optimization.ts` | Cost Optimisation | Quote comparison and optimisation |
| `cross-claim-intelligence.ts` | Cross-Claim | Pattern detection across claims |
| `vehicle-structural-intelligence.ts` | Structural Intelligence | Structural damage zone analysis |
| `vehicle-registry.ts` | Vehicle Registry | Vehicle identity and history |
| `vehicle-damage-history.ts` | Damage History | Per-vehicle damage history aggregation |
| `confidence-scoring-engine.ts` | Confidence Engine | Assessment confidence scoring |
| `services/confidence-explainability.ts` | Explainability | Human-readable confidence explanations |
| `decision-governance.ts` | Decision Governance | Decision audit and transparency |
| `executive-analytics.ts` | Portfolio Intelligence | Executive-level portfolio analytics |
| `fleet-maintenance-intelligence.ts` | Fleet Intelligence | Fleet risk and maintenance analytics |

---

## Server — Workflow Engine

| File | Purpose |
|---|---|
| `workflow.ts` | Main workflow engine — state transitions, event emission |
| `workflow-engine.ts` | Workflow execution engine |
| `workflow/state-machine.ts` | Claim state machine — valid transitions |
| `workflow/routing-engine.ts` | Claim routing — assigns to assessor or panel beater |
| `workflow/rbac.ts` | Role-based access control for workflow actions |
| `workflow/audit-logger.ts` | Workflow audit trail writer |
| `workflow/types.ts` | Workflow type definitions |
| `claim-state-machine.ts` | Claim lifecycle state machine |
| `claim-routing-engine.ts` | Routing decision engine |
| `workflow-notifications.ts` | Workflow event notifications |
| `workflow-middleware.ts` | Workflow middleware — injects workflow context |

---

## Server — WhatsApp Integration

All WhatsApp code lives under `server/whatsapp/`. The engine is provider-agnostic.

| File | Purpose |
|---|---|
| `whatsapp/types.ts` | Type definitions — session, message, journey state |
| `whatsapp/provider.ts` | Provider interface — `IWhatsAppProvider`, `TwilioAdapter`, `MockAdapter` |
| `whatsapp/sessionManager.ts` | Session state management — persists to `whatsapp_sessions` table |
| `whatsapp/engine.ts` | Main conversation engine — routes messages to journeys |
| `whatsapp/claimJourney.ts` | Claim submission journey — 12-step flow from "Hi" to submitted claim |
| `whatsapp/otherJourneys.ts` | Insurance quote, valuation, follow-up journeys |
| `whatsapp/outbound.ts` | Outbound notification helper — `notifyClientWhatsApp()` |
| `whatsapp/webhook.ts` | Twilio webhook handler — receives inbound messages |

> **Current state:** MockAdapter active (no Twilio credentials yet). Wire Twilio by setting `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER` in secrets.

---

## Server — Scheduled Jobs

| File | Purpose |
|---|---|
| `intake-escalation-job.ts` | Escalates claims stuck in intake for >2 hours |
| `stuck-assessment-recovery-job.ts` | Recovers assessments stuck mid-pipeline |
| `_core/heartbeat.ts` | Heartbeat SDK — registers crons, handles `/api/scheduled/*` |

> **Post-deploy runbook:** After each deployment, register both Heartbeat crons via `manus-heartbeat create` and set `HEARTBEAT_ALLOWED_TASK_UIDS` to the returned UIDs.

---

## Server — Services

The `server/services/` directory contains domain services that are consumed by pipeline stages and routers.

| File | Purpose |
|---|---|
| `services/intakeDescriptionNormaliser.ts` | Normalises free-text incident descriptions |
| `services/photoEnrichment.ts` | Photo enrichment — zone labelling, contradiction flags |
| `services/damageConsistency.ts` | Damage consistency checks across photos |
| `services/vehicleValuation.ts` | Vehicle valuation service |
| `services/externalReportSanitiser.ts` | Sanitises AI-generated report narratives |
| `services/apiResponseValidator.ts` | Validates AI API responses against contracts |
| `services/confidence-scoring.ts` | Confidence scoring service |
| `services/confidence-explainability.ts` | Explainability service |
| `services/user-management.ts` | User lifecycle management |
| `services/tenant-config.ts` | Tenant configuration service |
| `services/operational-health.ts` | System health monitoring service |
| `services/workflow-notifications.ts` | Workflow notification delivery |
| `services/fast-track-engine.ts` | Fast-track claim processing |
| `services/ingestion-review-queue.ts` | Manual review queue management |
| `services/historical-claims-ingestion.ts` | Historical claims bulk ingestion |

---

## Client — Pages (Portals)

Each portal is a separate page. Portal access is enforced by `ProtectedRoute` in `App.tsx`.

### Client Portal (My Portal)
| File | Route | Purpose |
|---|---|---|
| `ClientPortal.tsx` | `/client` | Unified client experience — Dashboard, My Vehicles, Valuations, Insurance, Claims, Company tabs |
| `SubmitClaim.tsx` | `/client/submit-claim` | Claim submission wizard |
| `ClaimantClaimDetail.tsx` | `/client/claims/:id` | Client claim detail view |
| `ValuationRequestPage.tsx` | `/get-a-quote` | Public valuation request form |
| `TeaserReportPage.tsx` | `/quote/result/:token` | Teaser valuation report (gated until policy issued) |

### Insurer Portal
| File | Route | Purpose |
|---|---|---|
| `InsurerDashboard.tsx` | `/insurer` | Insurer landing — role selection |
| `ClaimsProcessorDashboard.tsx` | `/insurer/claims` | Claims processor main dashboard |
| `InsurerComparisonView.tsx` | `/insurer/claims/:id/comparison` | Full claim detail — 8-section report display engine |
| `InsurerClaimDetails.tsx` | `/insurer/claims/:id` | Claim detail (legacy) |
| `InternalAssessorDashboard.tsx` | `/insurer/assessor` | Internal assessor dashboard |
| `ClaimsManagerDashboard.tsx` | `/insurer/claims-manager` | Claims manager command centre |
| `RiskManagerDashboard.tsx` | `/insurer/risk` | Risk manager analytics |
| `ExecutiveDashboard.tsx` | `/insurer/executive` | Executive portfolio dashboard |
| `InsurerAdminDashboard.tsx` | `/insurer/admin` | Insurer administrator |
| `RecoveryPortal.tsx` | `/insurer/recovery` | Recoveries and subrogation |

### External Assessor Portal
| File | Route | Purpose |
|---|---|---|
| `AssessorDashboard.tsx` | `/assessor` | External assessor main dashboard |
| `AssessorClaimDetails.tsx` | `/assessor/claims/:id` | Assessor claim detail |

### Panel Beater Portal
| File | Route | Purpose |
|---|---|---|
| `PanelBeaterDashboard.tsx` | `/panel-beater` | Panel beater main dashboard |
| `PanelBeaterQuoteSubmission.tsx` | `/panel-beater/quote/:claimId` | Quote submission form |

### Fleet Management Portal
| File | Route | Purpose |
|---|---|---|
| `FleetManagerDashboard.tsx` | `/fleet` | Fleet manager main dashboard — Vehicles, Drivers, Claims, Analytics |
| `FleetManagement.tsx` | `/fleet/management` | Fleet vehicle management |
| `FleetRegister.tsx` | `/fleet/register` | Fleet vehicle registration |

### KINGA Agency Portal
| File | Route | Purpose |
|---|---|---|
| `KingaAgency.tsx` | `/agency` | Agency service portal — Client Requests, Valuations, Commissions |
| `AgencyValuationInbox.tsx` | (component) | Valuation request inbox with quote delivery |

### Engineering Portal
| File | Route | Purpose |
|---|---|---|
| `EngineerDashboard.tsx` | `/engineer` | Engineer main dashboard |
| `EngineerInspectionList.tsx` | `/engineer/inspections` | Inspection list |
| `EngineerInspectionDetail.tsx` | `/engineer/inspections/:id` | Inspection detail |
| `EngineeringIntelligenceDashboard.tsx` | `/engineer/intelligence` | Engineering intelligence analytics |
| `AssetPassport.tsx` | `/engineer/asset-passport` | Asset Passport viewer |

### Platform Admin Portal
| File | Route | Purpose |
|---|---|---|
| `PlatformOverviewDashboard.tsx` | `/admin` | Platform admin overview |
| `PlatformOperationsCentre.tsx` | `/admin/operations` | Live platform monitoring |
| `PlatformClaimTrace.tsx` | `/admin/claim-trace` | Cross-tenant claim trace |
| `PlatformUserRoleManager.tsx` | `/admin/users` | User and role management |
| `AdminPortalLayout.tsx` | (layout) | Admin portal navigation shell |

---

## Client — Components

Key reusable components. Always check this list before creating a new component.

| Component | Purpose |
|---|---|
| `DashboardLayout.tsx` | Standard sidebar layout for all internal portals |
| `InsurerComparisonView.helpers.ts` | Pure cost intelligence helpers (computeMedian, getCostBand, BAND_CONFIG) |
| `QuoteOptimisationPanel.tsx` | KINGA Optimised quote display panel |
| `AiIntelligenceSummaryCard.tsx` | AI assessment summary card |
| `FraudScorePanel.tsx` | Fraud score display with component breakdown |
| `ForensicDecisionPanel.tsx` | Forensic decision display |
| `DamageImagesPanel.tsx` | Damage photo gallery with zone labels |
| `DamageConsistencyPanel.tsx` | Damage consistency analysis panel |
| `ApprovalHistoryPanel.tsx` | Approval workflow history |
| `ClaimsIntelligenceReportView.tsx` | CI report embedded viewer |
| `VehiclePassportPanel.tsx` | Vehicle Passport display |
| `AssetPassportPanel.tsx` | Asset Passport display |
| `CrossModuleIntelligencePanel.tsx` | Cross-module intelligence display |
| `EngineeringIntelligencePanel.tsx` | Engineering intelligence panel |
| `GlobalSearchBar.tsx` | Platform-wide search bar (Epic 5-A) |
| `NotificationCentre.tsx` | In-app notification centre (Epic 5-B) |
| `ErrorBoundary.tsx` | React error boundary — wraps all portal routes |
| `KingaPortalShell.tsx` | Shared portal shell with KPI strip and alert system |
| `EngineerWorkspaceLayout.tsx` | Engineer portal navigation shell |
| `AssessorPortalLayout.tsx` | Assessor portal navigation shell |
| `ClaimantPortalLayout.tsx` | Legacy claimant portal layout (redirects to /client) |

---

## Client — Core Utilities

| File | Purpose |
|---|---|
| `client/src/App.tsx` | All routes, lazy imports, portal guards |
| `client/src/lib/trpc.ts` | tRPC client binding |
| `client/src/lib/pdfExport.ts` | Client-side PDF export utilities |
| `client/src/_core/hooks/useAuth.ts` | Auth hook — returns `user`, `logout`, `getLoginUrl` |
| `client/src/_core/devRoleOverride.ts` | Dev-only role override for testing |

---

## Shared

| File | Purpose |
|---|---|
| `shared/const.ts` | Shared constants — `COOKIE_NAME`, `FINANCIAL_APPROVAL_THRESHOLD_CENTS` |
| `shared/role-permissions.ts` | Role permission matrix — `getRolePermissions`, `resolveDashboardRoute`, `DOMAIN_ROLE_MAP` |
| `shared/vehicleYearValidation.ts` | Vehicle year validation utility |

---

## Database Schema

The canonical schema is in `drizzle/schema.ts`. Key tables:

| Table | Purpose |
|---|---|
| `users` | All users — claimants, assessors, panel beaters, fleet managers, agents, admins |
| `claims` | Core claim records — FNOL data, status, workflow state, WhatsApp columns |
| `ai_assessments` | AI pipeline output — all stage results stored as JSON columns |
| `panel_beater_quotes` | Submitted repair quotes |
| `quote_line_items` | Per-line-item prices from submitted quotes |
| `component_repair_outcomes` | Benchmark learning data — selected prices per component |
| `component_benchmarks` | Aggregated benchmark prices per component |
| `insurer_tenants` | Insurer tenant registry |
| `fleet_accounts` | Fleet company accounts |
| `fleet_vehicles` | Fleet vehicle registry |
| `fleet_drivers` | Fleet driver registry |
| `personal_vehicles` | Client personal vehicle registry |
| `inspection_projects` | Engineering inspection projects |
| `inspections` | Individual engineering inspections |
| `vehicle_passport` | Vehicle Passport aggregated data |
| `asset_passport` | Asset Passport aggregated data |
| `pipeline_runs` | Pipeline execution records |
| `pipeline_jobs` | Per-stage pipeline job records |
| `whatsapp_sessions` | WhatsApp conversation sessions |
| `quotation_requests` | Insurance/valuation quotation requests |
| `quotation_request_documents` | Documents sent to clients by agents |
| `insurance_audit_logs` | Insurance workflow audit trail |
| `notifications` | In-app notifications |
| `audit_trail` | Platform-wide audit trail |
| `tenant_isolation_violations` | Tenant isolation violation log |

---

## Key Architectural Patterns

### 1. Adding a new tRPC procedure

1. Identify the correct domain router file in `server/routers/`.
2. Add the procedure using `protectedProcedure` (authenticated) or `publicProcedure` (public).
3. Use `insurerDomainProcedure` for insurer-scoped procedures (enforces tenant isolation).
4. Add DB helper in `server/db.ts` if new DB access is needed.
5. Consume in the client with `trpc.<namespace>.<procedure>.useQuery()` or `.useMutation()`.

### 2. Tenant isolation

Every insurer-scoped procedure must use `insurerDomainProcedure` which injects `ctx.insurerTenantId`. Never filter by `ctx.user.tenantId` directly in insurer procedures — use the middleware-injected value.

### 3. Gate policy

The intake gate (`routers/intake-gate.ts`, `pipeline-v2/pipelineGateController.ts`) **must never block an assessment**. It warns, notifies, and logs — but always allows the pipeline to proceed.

### 4. Cost field naming

The canonical KINGA Optimised cost field is `l2CompositeOptimisedCostUsd` in `costIntelligenceJson`. Do not use `compositeOptimisedCostUsd` (does not exist in DB data).

### 5. Notification policy

Use in-app notifications only for automated pipeline events. No email spam from pipeline events. Email is reserved for agent-initiated document delivery.

### 6. Report access tiers

- **CL** (Claims Assessment): claimant, assessor, claims processor
- **CI** (Claims Intelligence): insurer roles only
- **FR** (Forensic Decision): insurer + senior management only

---

## File Size Reference

Files over 1,500 lines that require care when editing:

| File | Lines | Notes |
|---|---|---|
| `server/db.ts` | 4,883 | All DB helpers — split planned (SPLIT-DB-01) |
| `server/routers/claims-core.ts` | 3,566 | Claims router — extracted Aug 2026 |
| `server/pipeline-v2/orchestrator.ts` | 3,430 | 14-stage pipeline — split planned (SPLIT-ORC-01) |
| `server/reporting/reportDefinitions.ts` | 2,924 | CL report — split planned (SPLIT-RPT-01) |
| `server/pipeline-v2/types.ts` | 2,061 | Type contracts — do not split |
| `server/routers/ai-assessments-core.ts` | 1,799 | AI assessments router — extracted Aug 2026 |
| `server/reporting/forensicDecisionReport.ts` | 1,749 | FR report |
| `client/src/pages/InsurerComparisonView.tsx` | 2,555 | Claim detail view — helpers extracted |
| `client/src/pages/ClaimDecisionReport.tsx` | 2,259 | Decision report viewer |
| `client/src/pages/ClaimsProcessorDashboard.tsx` | 1,972 | Claims processor dashboard |

> **Rule:** Never add more than 50 lines to a file already over 1,500 lines without first checking whether the new code belongs in a sub-module.
