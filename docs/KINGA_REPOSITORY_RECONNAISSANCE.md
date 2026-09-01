# KINGA Repository Reconnaissance Register

> **Purpose:** This is the evidence map behind the engineer-enrolment package. It is a guide to where to start tracing a change, not a substitute for reading the complete affected code path. Baseline: `main` commit `f100e65a1f01d71f461e6bd42d6f15944af41eca`.

## 1. Runtime and composition

| Subsystem | Primary implementation | Direct interface / consumer evidence | Test and configuration evidence | Notes |
|---|---|---|---|---|
| HTTP/tRPC runtime | `server/_core/index.ts` | Browser client reaches registered application router; selected Express paths may also be mounted here | `package.json` `dev`, `start`, `build`, `check:server` scripts | Read before transport/middleware changes. |
| Request context | `server/_core/context.ts` | All protected procedures depend on current request user/database context | Core/auth/router test suites | Context absence is a security boundary, not a nullability inconvenience. |
| Procedure primitives | `server/_core/trpc.ts` | `publicProcedure`, `protectedProcedure`, admin/executive/insurer controls, global error/tenant isolation paths | Router and authority tests | A procedure primitive alone may not prove target-object authority. |
| Domain middleware | `server/_core/domain-middleware.ts` | Platform, agency, insurer, fleet, marketplace, portal, customer and engineer domain controls | `inspectionAuthority.p0.test.ts` and domain-specific router tests | Change review required for role/tenant semantics. |
| Router assembly | `server/routers.ts` | Defines application namespaces consumed through `client/src/lib/trpc.ts` | All router test files; `vitest.config.ts` | Start here when mapping a client hook. |
| Browser routes | `client/src/App.tsx` | Maps URLs to portal/page components | `test:portal`, `audit:portal`, page/router tests | Route visibility is not server authorisation. |

## 2. Claims, documents and reporting

| Subsystem | Primary implementation | Main API / data evidence | Verification entry points | Change hazards |
|---|---|---|---|---|
| Claim core | `server/routers/claims-core.ts` | `claims`, events, assignments, review and claimant/policy fields in `drizzle/schema.ts` | claims/router lifecycle suites | Claim status and workflow state are separate fields. |
| Claim completion/replay | `claim-completion.ts`, `claim-replay.ts` | completion/replay router namespaces in `server/routers.ts`; historical/replay tables | claim replay/history and pipeline tests | Re-run/idempotency semantics require explicit proof. |
| Documents | `document-ingestion.ts`, document/storage procedures | `claim_documents`, ingestion/extraction entities, `server/storage.ts` | document ingestion, PDF/image and pipeline tests | Parent claim/tenant authority before a document/URL read. |
| Comments/communications | `comments.ts`, `claimComments.ts`, `notifications.ts` | `claim_comments`, notification DB/service modules | comments and notification P0/P1 authority tests | Do not lose tenant predicate on list/read/action paths. |
| Reporting | `server/reporting/`, `reports.ts`, `reporting.ts`, `claim-reports-core.ts` | report job/snapshot/link/audit schema entities | report definition, renderer, parity and tenant-authority suites | Shared values must use canonical resolver/model path. |
| Executive/role analytics | `executive.ts`, analytics/intelligence routers, `resolvedPlatformReportCollection.ts` | executive dashboard and role pages | `executive.test.ts`, platform collection authority tests | Same period/tenant/KPI must draw from the same canonical per-claim input source. |
| Forensic report | `forensicDecisionReport.ts`, `forensicReportModel.ts`, evidence presentation modules | assessment/claim/event/quote evidence supplied through model | `forensicReportModel.test.ts`, report decision/evidence tests | Human sign-off stages are not payment authorisations. |

## 3. Pipeline, intelligence and engineering

| Subsystem | Primary implementation | Main inputs/outputs | Test / contract evidence | Change hazards |
|---|---|---|---|---|
| AI gateway | `server/_core/llm.ts` | Server-side structured/completion invocation | `llm.circuit-breaker.test.ts` | No credentials/client-side bypass; preserve provider failures. |
| AI assessment | `ai-analysis.ts`, `ai-assessments-core.ts`, `ai-reanalysis.ts` | `ai_assessments` and parent claim | assessment/report consistency tests | Version/reanalysis selection must be explicit. |
| Pipeline V2 | `server/pipeline-v2/` | staged claim/document/image intelligence outputs | stage-specific tests plus pipeline fixes/audits | Preserve stage input/output, provenance, retry and degradation semantics. |
| Stage 6 damage analysis | compatibility barrel `stage-6-damage-analysis.ts`; `.vision`, `.fallback`, `.merge`, `.stage` modules | image evidence to component/damage output | `stage-6-vision.test.ts`, degraded/pipeline tests | Preserve public exports, eligibility, timeouts, constants and no-fabrication output. |
| Physics/cross-stage consistency | pipeline physics/truth/cross-stage helpers; inspection reconciliation | physical measurements, pipeline measurement map, flags | inspection router tests and physics/pipeline suites | Units, calibration and tolerance are architecture-sensitive. |
| Engineering workspace | `inspections.ts`, engineer services/profile schema | inspections, projects, observations, measurements, evidence docs | `inspectionAuthority.p0.test.ts` | Target object access precedes all reads/writes/provider calls. |
| Fraud/intelligence | fraud, analytics, cross-claim, predictive/intelligence routers | fraud tables plus assessment canonical fields | analytics/executive/intelligence tests | A risk score is not a final fraud decision. |

## 4. Insurance, fleet, agency and marketplace

| Subsystem | Primary implementation | Core data | Verification evidence | Review focus |
|---|---|---|---|---|
| Insurance/policy | `insurance-core.ts`, `insurance-phase7.ts`, `policy-management.ts` | carriers, policies, products, quotes, insurer tenants | insurance/router tests | Tenant/policy relation and authority. |
| Quotes/panel beaters | `quotes-core.ts`, `market-quotes.ts`, `panel-beaters-core.ts`, analytics | service/supplier/insurance quote and line-item tables | `quotes-core.authorization.p0.test.ts` | Quote submission, selection and cost interpretation are separate concepts. |
| Fleet | `fleet-core.ts`, `fleet-accounts.ts`, fleet intelligence | fleets, fleet vehicles, drivers, incidents, risk | fleet agency/RFQ lifecycle suites | Claim/fleet/driver relationship must remain tenant-scoped. |
| Vehicles | vehicle registry/passport/history/damage-history routers | registry, condition/history/valuation/mileage tables | vehicle/claim/pipeline tests | Source vehicle identity and report display fields can differ. |
| Agency/broker | `agency.ts`, `agency-broker.ts`, `agency-insurance-service.ts` | agency clients/service request/insurer association tables | agency/fleet tests | Do not infer insurer authority from client relationship alone. |
| Marketplace | `marketplace.ts`, `platform-marketplace.ts` | profiles, links, relationships, transactions | platform marketplace tests | Separate platform oversight from tenant marketplace use. |

## 5. Workflow, administration, security and operations

| Subsystem | Primary implementation | API/data evidence | Tests / operational evidence | Review focus |
|---|---|---|---|---|
| Workflow | `workflow-engine.ts`, `workflow-validator.ts`, workflow routers | workflow state/configuration/audit tables, claim events | workflow engine/validator/integration/RBAC suites | Actor, transition, event/audit and notification ordering. |
| Decision/approval | `decision.ts`, `approval.ts`, review queue | decision/approval and assessment report fields | approval, decision, reporting tests | Advice must not silently become approved outcome. |
| Tenant/admin | `tenant.ts`, `admin.ts`, `platform*.ts`, user roles | users, tenants, role/config/audit tables | tenant/platform/admin tests | Privilege and tenant governance require explicit code proof. |
| Audit/governance | audit, super-audit, governance, workflow-audit routers | audit logs/trail, violation, report access and role audit tables | audit/governance/workflow authority suites | Audit reads/exports are themselves sensitive operations. |
| Notifications | router, DB/service/tracker/preferences modules | notifications data and preferences | P0 tenant isolation and preference authority suites | Recipient/tenant/side-effect controls. |
| Observability | operational health, pipeline/platform observability and operations routers | health/operational data and audit records | operational/admin config, monitoring artefacts | Metrics scope must respect role/tenant boundaries. |
| Deploy/CI | Dockerfile, GitHub workflow, `package.json`, deployment artefacts | CI scripts/containers | deployment/operations documents | Artefact presence does not prove live activation. |

## 6. Explicit contradictions and verification boundaries

| Topic | Current documentation treatment |
|---|---|
| Source schema versus live database | Source schema is documented as a code fact; live parity is not assumed. Existing drift/reconciliation documents are flagged as supporting evidence. |
| Existing strategic/architecture documents versus code | Design documents are useful but do not supersede current procedures, models, schema declarations or tests. |
| Provider/deployment activation | Dependencies and Docker/CI artefacts are not treated as proof of configured production services. |
| UI/page existence versus functional access | The page map is an orientation tool; real capability must be proven through the bound procedure and authority path. |
| AI confidence versus business conclusion | The manuals retain the distinction between a model output, a derived recommendation and a governed human decision. |
