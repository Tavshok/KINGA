# KINGA Documentation Audit

## 1. Audit scope

This package was prepared against Git commit `f100e65a1f01d71f461e6bd42d6f15944af41eca`. Reconnaissance included top-level repository layout, package scripts, client pages/components, server runtime/core, router assembly and router directory, reporting and pipeline modules, Drizzle schema/migrations, tests/configuration, deployment artefacts, scripts, existing documentation/audits, and named security/authority code paths.

## 2. Inspection status

| Area | Inspection status | Evidence used |
|---|---|---|
| Runtime/client/router composition | Code-verified at directory and entrypoint level | `client/src/App.tsx`, `server/_core/index.ts`, `server/routers.ts` |
| Security/tenant approach | Code-verified at pattern/reference-test level | core context/middleware, inspections/notifications/report authority tests |
| Data/entity map | Code-verified at source-schema level | `drizzle/schema.ts`, `drizzle.config.ts` |
| Reports/forensic model | Code-verified at canonical-contract and test level | `server/reporting/` models/resolvers/tests |
| Pipeline and AI controls | Code-verified at module/control level | `server/pipeline-v2/`, `server/_core/llm.ts` |
| Deployment/infrastructure | Artefact-verified only | Dockerfile, CI, deployment directories and existing operations docs |
| Live database, provider and production state | Not verified from repository | explicitly marked in applicable manuals |

## 3. Contradictions and gaps

1. The source schema is not sufficient evidence of live-database parity; existing schema drift material indicates a reconciliation backlog.
2. Repository dependencies and deployment artefacts do not prove that all providers/infrastructure are actively configured or used in production.
3. Existing historical documentation is extensive and may describe planned/future architecture. Code is therefore treated as primary authority.
4. Full-suite and Vite build results may be environment/resource dependent. A non-zero exit, timeout, missing database or memory termination remains an incomplete validation outcome.

## 4. Architectural/security risks identified

The principal risks are regression of tenant/object authority, raw/canonical report-source drift, accidental elevation of AI findings, workflow bypass, unowned test data, and schema drift. These are documented as invariants/change gates rather than asserted as current active vulnerabilities. If a concrete path violates one, document it as **SECURITY FINDING — REVIEW REQUIRED** and stop before making a product/security judgment.

## 5. What engineers must not assume

Engineers must not assume a page is wired to an authorised procedure, a package dependency is an activated integration, an environment artefact is deployed, source schema equals live schema, a report value is an approved decision, AI output is authoritative, or a test run was clean without the exact run output. Unverified matters are deliberately labelled rather than filled with assumptions.

## 6. Document-by-document traceability matrix

| New manual | Primary repository evidence reviewed | Explicit boundary recorded |
|---|---|---|
| `KINGA_SYSTEM_OVERVIEW.md` | `client/src`, `server/routers.ts`, `server/_core/index.ts`, `drizzle/schema.ts` | Product labels do not prove every channel/workflow/provider is live. |
| `KINGA_ARCHITECTURE.md` | runtime/core, router assembly, reporting/pipeline directory structure, Docker/CI artefacts | Deployment topology and active infrastructure are not inferred from artefacts. |
| `KINGA_CODEBASE_GUIDE.md` | client page inventory, server/router and shared/database layout | Page presence is not proof of authorisation or complete functionality. |
| `KINGA_REPOSITORY_RECONNAISSANCE.md` | source directories, router/module inventories, schema, test/configuration artefacts | It directs full-code tracing for a change; it is not a procedure-body substitute. |
| `KINGA_DATABASE_MANUAL.md` | `drizzle/schema.ts`, `drizzle.config.ts`, schema drift/remediation documents | Source schema is not claimed to equal the live database. |
| `KINGA_API_REFERENCE.md` | `server/routers.ts`, high-risk router procedure declarations, tRPC/domain middleware | Inputs/outputs and side effects must be read from the exact current procedure body. |
| `KINGA_SECURITY_MANUAL.md` | context, tRPC/domain middleware, inspection/notification authority regressions | Operational controls/configuration not present in source are marked unverified. |
| `KINGA_CLAIMS_INTELLIGENCE_MANUAL.md` | claims/document/AI routers, pipeline V2, reporting contracts | Not every claim is asserted to follow all pipeline branches. |
| `KINGA_FORENSIC_ENGINE_MANUAL.md` | forensic model/renderer/tests, Stage 6 modules | Scientific/legal validation and universal physics accuracy are not claimed. |
| `KINGA_AI_ENGINEERING_MANUAL.md` | LLM core, AI routers, pipeline and circuit-breaker test | Provider account/model/cost/data terms are not inferred. |
| `KINGA_WORKFLOWS.md` | workflow engine/validator/middleware/routers and workflow schema entities | Generic diagrams do not claim actual universal status reachability. |
| `KINGA_ADMIN_MANUAL.md` | admin/tenant/platform/governance routers and admin pages | Production roles, operations policy and delegation are not inferred. |
| `KINGA_TESTING_MANUAL.md` | package scripts, Vitest configs, named security/pipeline/report/workflow tests | Resource-limited/variable results are documented as incomplete. |
| `KINGA_LOCAL_DEVELOPMENT.md` | `.env.example`, package scripts, runtime/configuration | A single fully automated local DB/provisioning path is not claimed. |
| `KINGA_DEPLOYMENT_OPERATIONS.md` | Dockerfile, CI workflow, deployment folders, operations documents | Active production hosting, alerting, backup/rollback policies are unverified. |
| `KINGA_INTEGRATIONS.md` | LLM/storage/notification/Sentry source and package dependencies | Dependencies do not prove active provider configuration, including WhatsApp. |
| `KINGA_ENGINEERING_CHANGE_GUIDE.md` | architecture, schema, security, report/pipeline/workflow boundaries | It is a review control, not a replacement for product/business approval. |
| `KINGA_ARCHITECTURAL_INVARIANTS.md` | authority, canonical report, pipeline/AI, tests and refactor evidence | Invariant changes require architecture review. |
| `KINGA_KNOWN_LIMITATIONS.md` | drift docs, validation history, deployment/provider evidence boundaries | It does not declare every risk an active production fault. |
| `KINGA_ENGINEER_ONBOARDING.md` | client/router/core/schema/report/pipeline reference paths | Newcomer activities require approved non-production access. |
| `KINGA_GLOSSARY.md` | code/schema/reporting/pipeline terminology | Definitions do not override field/procedure source code. |
| `KINGA_ENGINEERING_DOCUMENTATION_INDEX.md` | all new manuals | Index identifies implementation-first reading order. |
| `KINGA_ENGINEERING_QUICK_REFERENCE.md` | package scripts and core path evidence | Commands require the appropriate local/non-production environment. |
| `KINGA_DOCUMENTATION_AUDIT.md` | repository reconnaissance and validation checks | Audit is not a deployment certification. |
