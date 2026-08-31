# Post-P0 Downloadable Report Remediation — Final Evidence

**Held branch:** `fix/post-p0-report-remediation`  
**Baseline:** `cb59e1355967b17fca0f95173343b925c854d318`  
**Status:** Implementation complete and held for review. No pull request, merge, or main-branch change was made.

## Delivered changes

| Area | Result |
|---|---|
| Legacy Claim PDF | Uses one tenant-scoped canonical `ResolvedReportRecord`; the selected assessment is deterministically latest by `created_at DESC, id DESC`. |
| Assessment PDF | Accepts only an authorised persisted claim ID and derives display values server-side; arbitrary client-supplied values are not rendered. |
| Fast Track downloads | The false PDF and zero-value CSV have been disabled explicitly pending a supported, tenant-scoped data contract. |
| Manager portfolio reports | New claims-manager and risk-manager reports use the canonical tenant aggregate and have narrow, role-specific access. |
| Executive portfolio report | One executive-only canonical portfolio report combines approved aggregate portfolio, fraud, financial-exposure, and elapsed-time indicators; no recovery, assessor, action-register, or cross-insurer data is included. |
| Retired executive keys | `executive.insurer_summary`, `executive.claims_trend`, `executive.financial_exposure`, and `executive.full_report` were removed from active access, dispatch, catalogue, workflow readiness, and the two traced UI callers. |
| ML report scope | `executive.ml_performance` remains platform-administrator-only; executive users are denied in both catalogue and direct generation paths. |
| Metric wording | Total elapsed claim time is explicitly differentiated from time spent in a workflow status. No calculation or data input changed. |
| Alternate reports router | Executive, financial, and aggregate audit PDF procedures now apply the standard report access matrix before obtaining database access, while retaining the session tenant match check. |

## Validation evidence

Focused live-TiDB tests passed for Claim PDF latest-assessment parity and foreign-tenant denial; Assessment PDF authoritative value rendering, injected-value rejection, and foreign-tenant denial; role-specific report access and canonical aggregate parity; and alternate report role/tenant enforcement. The final focused alternate-router set passed **52/52**. Server bundles and Vite production builds passed after each affected phase. Vite continued to emit its pre-existing large-chunk advisory.

The final fresh-worker sharded suite completed all **42 shards** with `RUNNER_STATUS=1`, not a green full-suite result. Comparing exact failure identifiers to the immutable baseline found no substantive branch-only failure. Two apparent differences were the same pre-existing dataset-capture and tenant-isolation failures with only elapsed-duration suffixes. The held branch had 43 distinct failure identifiers versus 45 in the baseline; two baseline failures (`truthReconciliationEngine` idempotency and `upload-to-report` operational acceptance) did not reproduce in the final branch run. This is recorded as run variability, not a claim that those tests are fixed.

The controlled TypeScript check exited non-zero on both baseline and branch due to known project diagnostics. After path and location normalization, the branch had **zero branch-only diagnostics** and 13 parent-only diagnostics; no modified report module produced a branch-only diagnostic.

## Boundaries retained

No schema or migration work, production-data manipulation, external-provider activation, payment/policy/settlement change, SAR/privacy change, Shadow change, CL/CI/FR source change, audit-export change, or forensic structural split was included. The branch contains separate held commits for each logical phase and is review-only.
