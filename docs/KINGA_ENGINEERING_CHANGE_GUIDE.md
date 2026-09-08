# KINGA Engineering Change Guide

## 1. The safe-change rule

Every change begins with a trace, not an edit. Trace the browser route or external caller to the tRPC/REST entry, middleware, domain service/canonical resolver, database/storage boundary, report or workflow consumer, and nearest regression test. A small line change can cross tenant, evidence, report, workflow or audit boundaries.

## 2. Change playbooks

| Change | Inspect first | Required safeguards and tests |
|---|---|---|
| New or changed frontend feature | `client/src/App.tsx`, relevant page/component, tRPC hook and backing procedure | Loading/empty/error state; truthful labels; route access; focused UI/component test where available; no client-side authority. |
| New tRPC procedure | `server/routers.ts`, target router, `server/_core/trpc.ts`, domain middleware | Zod input/output; session/role/tenant/object authority before data access; authorised and denied tests; audit/side-effect coverage. |
| Change tenant-scoped logic | `domain-middleware.ts`, target router, schema ownership columns, security tests | Session tenant must be required; client tenant input cannot authorise; every read/write constrained; foreign/tenantless denial with no side effect. |
| Change database table | `drizzle/schema.ts`, migration history, live-schema reconciliation docs, all consumers | Schema review, generated SQL review, non-production verification and rollback plan. Never perform ad hoc production DDL. |
| Change report field/calculation | `server/reporting/` resolver/model, all tier renderers, client views | Preserve canonical field source; enumerate consumers; cross-tier parity test; distinguish unavailable from zero; do not add unused sensitive fields. |
| Change AI/pipeline stage | `server/pipeline-v2/`, LLM helper, evidence model, stage tests | Input provenance, structured output, units, retries, timeouts, degradation and no-fabrication tests; human-decision boundary. |
| Change workflow | workflow engine/validator/middleware, role/tenant checks, events/audit | Valid state transition, actor authority, write/audit/notification sequence and forbidden transition tests. |
| Change integration/provider | adapter, environment configuration, error paths, data classification | No secrets in code; server-side credentials; timeout/retry/error semantics; tenant scope; test/staging plan. |

## 3. Non-negotiable pre-merge checklist

1. Pull and understand current `main`; preserve reviewable history.
2. Run `pnpm check:conflicts` before and after any merge/conflict resolution.
3. Run the focused test suite and compare broader test/type failures with a current-main baseline.
4. Run `pnpm check:server`; run `pnpm build` where resources permit, documenting any incomplete build honestly.
5. Re-read the diff for direct raw `claims`/`ai_assessments` access, missing tenant predicates, client-controlled tenant IDs, dropped audit effects, unowned test fixtures and invented UI data.
6. Use a PR with a concise evidence note, including known validation limits.

## 4. Changes requiring architectural review

Do not make these casually: authentication/session identity, `protectedProcedure`/domain middleware semantics, tenant/object authority helpers, schema/DDL, canonical report/forensic model fields, claim decision/approval rules, AI evidence promotion, physics units/calibration, workflow status transitions, report/export authority, broad cleanup/deletion logic, or public compatibility barrel exports.

## 5. Definition of done

A change is done only when the implementation, tests, documentation and observable UI/report semantics agree. If any evidence conflicts, record it as a known limitation or review-required finding; do not hide it with prose, a fallback or an unchecked type assertion.
