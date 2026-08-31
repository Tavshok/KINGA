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
