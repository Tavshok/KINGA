# KINGA Engineer Onboarding

## Before Day 1

Obtain approved repository access, non-production environment access, the current approved `.env` provisioning route, and an assigned reviewer for platform/data-integrity changes. Do not request or copy production secrets into chat, source control or personal notes.

## Five-day enrolment path

| Day | Objective | Required reading / activity | Demonstrable outcome |
|---|---|---|---|
| 1 | Product and safety context | This overview, architecture, invariants and limitations manuals | Explain tenant authority, AI advisory boundaries and canonical report contracts. |
| 2 | Repository and data navigation | Codebase guide, database manual, schema-drift docs; trace one page to a router and table | Locate the source of a displayed claim/report field. |
| 3 | API, security and workflow | API, security and workflow manuals; read `inspections.ts` with `inspectionAuthority.p0.test.ts` | Explain how an authorised and a denied procedure call behave. |
| 4 | Intelligence/forensic path | Claims intelligence, AI and forensic manuals; Stage 6 and report model tests | Distinguish evidence, AI output, calculated inference and human approval. |
| 5 | Safe contribution | Local-development, testing and change guide; make a small reviewed branch change | Submit a focused PR with tests and a clear validation record. |

## First files to read together

1. `server/routers.ts` and `client/src/App.tsx` — system entry maps.
2. `server/_core/context.ts`, `trpc.ts`, and `domain-middleware.ts` — authority foundation.
3. `server/routers/inspections.ts` and `server/engineer/inspectionAuthority.p0.test.ts` — tenant/object authority reference.
4. `drizzle/schema.ts` plus schema drift/remediation documents — data contract and caution.
5. `server/reporting/resolvedReportRecord.ts`, `forensicReportModel.ts`, and their tests — reporting source-of-truth pattern.
6. `server/pipeline-v2/stage-6-damage-analysis.ts` and the extracted modules/tests — evidence-aware refactoring pattern.

## Daily working agreement

Pull current `main`, create an isolated branch, read the full relevant code path, make the smallest coherent change, run focused and baseline-aware validation, write a meaningful PR description, and leave work pushed/reviewable. Never leave the only copy of a meaningful change on one workstation.

## Common mistakes to avoid

Do not take tenant scope from a client payload, modify a schema/migration casually, alter report calculations in a renderer, treat AI confidence as approval, write broad test cleanup, replace missing data with demo numbers, or report an incomplete resource-limited build as passed.

## First-week operational runbooks

### A. “This page is blank, wrong, or missing a number”

Start in `client/src/App.tsx` and identify the page route. Locate the relevant `trpc.*` query/mutation in that page/component, then the matching namespace in `server/routers.ts`, procedure body and final resolver/service. Establish whether the UI is in loading, unavailable/error, or true empty-data state. For a KPI or report, trace to `resolvedReportRecord.ts`, `resolvedPlatformReportCollection.ts`, `forensicReportModel.ts` or the explicitly documented canonical equivalent before changing UI text or calculations.

### B. “A user sees the wrong tenant’s data or can act on a foreign object”

Stop and classify it as a security finding. Trace `createContext` → selected tRPC/domain procedure → target record lookup → related queries and side effects. Use `server/routers/inspections.ts` plus `server/engineer/inspectionAuthority.p0.test.ts` as the pattern. Add/inspect tests for a tenantless session, a same-role foreign tenant and the absence of a prohibited write. Do not attempt to patch only the visible page.

### C. “A report disagrees with another report”

Identify both procedure/renderer paths and compare the canonical record fields used. Shared facts must not be independently derived from raw `claims` or `ai_assessments` reads. Start with report consistency tests under `server/reporting/`; if the field is absent from a canonical contract, stop for data-contract design review rather than reintroducing a raw-SQL fallback.

### D. “A pipeline step failed or analysis is incomplete”

Start with the claim’s persisted processing/status fields, document/evidence availability and pipeline run/heartbeat fields. Then trace the relevant `server/pipeline-v2/` stage and its tests. Preserve explicit error/degraded/not-eligible states. Do not default a missing image/model response to zero damage, a successful classification or a business conclusion.

### E. “Tests are failing only on a branch or only sometimes”

First run the smallest implicated suite. Then compare the exact failing identifiers with a fresh current-main baseline using the same environment. Inspect fixture ownership/teardown, date/timer behaviour, worker order, database state and dependency/provider assumptions before changing application code. A variable or resource-limited result is diagnostic evidence, not validation success.
