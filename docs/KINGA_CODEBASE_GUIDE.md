# KINGA Codebase Guide

## 1. Repository map

| Path | Purpose | Notes for a new engineer |
|---|---|---|
| `client/src/App.tsx` | Browser route registration and application shell | Start here to find a portal page from its URL. |
| `client/src/pages/` | Role-facing page components | The repository includes claimant, insurer, claims, assessor, engineering, fleet, agency, panel-beater, risk, executive, platform and admin pages. |
| `client/src/components/` | Reusable controls, layouts, report/dashboard views | Confirm the backing procedure before assuming a component displays authoritative data. |
| `server/_core/` | Express/tRPC runtime, context, authentication helpers, shared framework services | High-risk foundation; read before modifying auth or transport. |
| `server/routers.ts` | Top-level tRPC router composition | The authoritative map of registered router namespaces. |
| `server/routers/` | Feature routers and router-level tests | Prefer existing router patterns over introducing unscoped database access. |
| `server/reporting/` | Report resolvers, models, generators, renderers and report tests | Preserve canonical data contracts and evidence labels. |
| `server/pipeline-v2/` | Claims/document/image/vision and intelligence pipeline | Preserve staged contracts, graceful degradation and provenance. |
| `server/services/`, `server/engineer/` | Feature services, shared business logic and engineer authority | Trace callers before changing exported behaviour. |
| `drizzle/schema.ts` | Drizzle entity declarations | Source schema, not proof of live-DB parity; see drift documentation. |
| `drizzle/` | Schema, migrations and related configuration | Do not run unreviewed DDL against production. |
| `shared/` | Shared types and cross-client/server constants | Public changes have broad fan-out. |
| `docs/` and `audit/` | Design, decision, audit and operational records | Supporting evidence; code remains authoritative. |
| `scripts/` | Verification, governance and maintenance commands | Inspect before execution; script names do not prove production use. |

## 2. Feature navigation map

| Feature family | Client entry | Router / backend entry | Core data or logic | Test / configuration evidence |
|---|---|---|---|---|
| Claims | `SubmitClaim.tsx`, `ClaimantDashboard.tsx`, `ClaimsManagerDashboard.tsx` | `claims-core.ts`, `claim-completion.ts`, `claim-replay.ts` | `claims`, `claim_documents`, `claim_events`, review/assignment records | Claim and router `*.test.ts` suites |
| Documents and intake | `ClaimDocuments.tsx`, upload pages | `document-ingestion.ts`, document routes in `server/routers.ts` | ingestion/document/extraction tables; pipeline utilities | `document-ingestion` and pipeline tests |
| Quotes and repair | `QuoteDetails.tsx`, comparison pages, panel-beater pages | `quotes-core.ts`, `market-quotes.ts`, `panel-beaters-core.ts` | quote and line-item tables; canonical cost/report helpers | quote authorisation and reporting tests |
| Reports | `ReportsCentre.tsx`, `InteractiveReport.tsx`, `ClaimDecisionReport.tsx` | `reports.ts`, `reporting.ts`, `claim-reports-core.ts` | `server/reporting/` resolvers/models/renderers | report consistency and forensic-model tests |
| Assessors and review | `InternalAssessorDashboard.tsx`, `ExternalAssessorWorkspace.tsx`, `ReviewQueue.tsx` | `assessors-core.ts`, `assessor-onboarding.ts`, `review-queue.ts` | assessment/review/assignment entities | assessor onboarding and review suites |
| Engineering and inspections | `EngineerDashboard.tsx`, `EngineerInspectionList.tsx`, `EngineerInspectionDetail.tsx` | `inspections.ts`, engineering intelligence router | inspection/profile/project entities and authority helper | `inspectionAuthority.p0.test.ts` |
| Vehicles and fleet | `VehicleRegistry.tsx`, `FleetManagement.tsx`, `FleetManagerDashboard.tsx` | `vehicle-registry.ts`, `vehicle-passport.ts`, `fleet-core.ts`, `fleet-accounts.ts` | vehicle/fleet/driver/maintenance records | fleet router lifecycle tests |
| Agencies and marketplace | `KingaAgency.tsx`, agency and marketplace pages | `agency*.ts`, `marketplace.ts`, `platform-marketplace.ts` | agency, insurer marketplace and service request tables | marketplace/fleet-agency tests |
| Risk and executive | `RiskManagerDashboard.tsx`, `ExecutiveDashboard.tsx`, `FraudAnalyticsDashboard.tsx` | `executive.ts`, `analytics.ts`, `intelligence*.ts` | canonical collection/report helpers | `executive.test.ts`, analytics tests |
| Admin/platform | `client/src/pages/admin/`, platform pages | `admin.ts`, `platform*.ts`, `tenant.ts`, `governance*.ts` | tenants/users/audit/configuration entities | tenant, platform marketplace and pagination tests |

## 3. Finding a real procedure

1. Locate a client hook such as `trpc.<namespace>.<procedure>` in the page/component.
2. Find the namespace in `server/routers.ts`.
3. Open the registered router in `server/routers/<feature>.ts` and read the complete procedure: input schema, middleware, role/tenant checks, database calls and side effects.
4. Search for a `*.test.ts` naming the procedure or business rule.
5. For a report, trace from the router to `server/reporting/` and verify the canonical resolver/model that supplies the displayed value.

## 4. High-risk locations

| Location | Why it is high risk | Safe approach |
|---|---|---|
| `server/_core/context.ts`, `trpc.ts`, `domain-middleware.ts` | Session and tenant context governs all protected paths. | Change only with security tests and architecture review. |
| `drizzle/schema.ts` and migrations | It affects data shape across every tenant and environment. | Schema-first review; reconcile live schema separately. |
| `server/reporting/` canonical contracts | A field change can create cross-tier report disagreement. | Enumerate consumers and add parity regression coverage. |
| `server/pipeline-v2/` | It crosses ingestion, AI, evidence and decision-support boundaries. | Preserve units, provenance, timeout/retry and failure semantics. |
| `server/routers/inspections.ts`, notifications and exports | Tenant/object access regressions can expose another tenant’s data. | Use the tested session-derived authority pattern. |

## 5. Naming and file conventions

Source uses TypeScript and TSX. Router and domain code generally uses camelCase TypeScript properties mapped to snake_case database columns through Drizzle; raw SQL must use physical column names. A source-text assertion is not a stable behaviour guarantee: prefer observable API/module behaviour tests, as demonstrated by the Stage 6 regression repairs in `server/pipeline-v2/`.
