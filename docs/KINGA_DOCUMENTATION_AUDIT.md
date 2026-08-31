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
