# KINGA Architectural Invariants

> These invariants are implementation safety rails. A proposed change that appears to violate one requires an explicit architectural decision, updated evidence, and appropriate tests.

| Invariant | Why it exists | Where it is enforced / evidenced | What can break it |
|---|---|---|---|
| Session-derived tenant authority | Prevents one tenant accessing another tenant’s data. | `server/_core/context.ts`, `domain-middleware.ts`, tenant-aware routers and P0 authority tests | Accepting `tenantId` from input; ID-only lookup; fallback tenant values. |
| Object authority before data/side effects | Prevents disclosure and unauthorised mutation. | Router target lookup/assignment checks; inspection/notification/report tests | Querying child data, writing audit/events, or calling a provider before the authority proof. |
| AI is advisory unless a governed decision says otherwise | Prevents model output becoming a silent business conclusion. | `server/_core/llm.ts`, pipeline, decision/approval/workflow routes | Mapping AI scores directly into status/payment/rejection without authorised review. |
| Evidence provenance and availability remain visible | Prevents fabricated certainty and false “zero” results. | pipeline evidence envelopes, per-photo results, report presentation tests | Replacing missing/ambiguous evidence with a default conclusion. |
| Canonical report records are the source for shared report facts | Prevents CL/CI/FR and dashboard drift. | `resolvedReportRecord.ts`, `resolvedPlatformReportCollection.ts`, `forensicReportModel.ts`, parity tests | New raw SQL/independent re-derivation in a renderer or dashboard. |
| Approval labels describe recorded human events | Prevents payments or approvals being invented in reports. | `forensicReportModel.ts`, forensic tests | Required-stage counts that assume events, or payment framing without an event/system. |
| Workflow transition integrity | Prevents invalid state/role changes. | workflow engine/validator/middleware, workflow tests/audit tables | UI-only gating; bypassing validator; transition without audit/event requirements. |
| Test fixtures are owned and cleaned precisely | Prevents tests mutating real/other tests’ data. | fixture teardown audit, test helpers and `afterAll` patterns | `LIMIT 1` borrowing, broad deletes, shared untracked mutable state. |
| Public module exports remain compatible across refactors | Prevents silent caller breakage. | compatibility barrels such as Stage 6; import/export baseline checks | Deleting/renaming a barrel export during a split. |
| Incomplete validation remains visible | Prevents unverified work being represented as passing. | build/test reporting practice and audit docs | Calling an OOM, timeout, missing DB or partial run “green”. |

## Safe modification protocol

For an invariant-adjacent change, identify its enforcement file, closest denial/parity test, callers and persistence side effects. Then add/adjust behaviour tests, not brittle file-text assertions. Review the diff for a bypass path and document unresolved environmental evidence as **[NOT VERIFIED IN CODEBASE]** rather than inferring success.
