# reportDefinitions Canonical-Layer Batch

## Scope

This batch corrects the **Claim Assessment / CL** renderer in `server/reporting/reportDefinitions.ts`. It is deliberately bounded to the three shared fields that must remain aligned across the CL, CI, and FR tiers:

| Shared field | Canonical contract now used | Previous local selection |
|---|---|---|
| Fraud score | `normaliseReportData().fraud.score` | Local JSON-first `overallScore` fallback chain |
| AI estimate | `normaliseReportData().costs.aiEstimateUsd` | Local `estimated_cost / 100` conversion |
| Decision status | `normaliseReportData().verdict.verdict` | Direct `a.recommendation` value |

`canonicalClaimReportPresentation.ts` is the sole report-row adapter. It converts persisted JSON and cent-denominated fields once, then invokes both `resolveClaimRecord()` and `normaliseReportData()`.

> **Never:** add a renderer-specific priority chain for shared fraud, cost, or decision values in `reportDefinitions.ts`. Extend the canonical resolver/normaliser instead.

## Preserved Behaviour

The renderer still loads report-specific evidence (quotes, damaged components, evidence governance, and presentation-only fields) through its existing queries. This batch does **not** change quote selection, L1/L2/L3 calculation, tenant filtering, rendering layout, report permissions, database schema, migrations, or business decision rules.

## Validation

| Check | Result |
|---|---|
| Canonical presentation unit test | 2/2 passed |
| Bundled server build | Passed |
| Vite production build | Passed; existing large-chunk advisory only |

## Explicit Deferred Work

The broader static survey inventory remains valid. Portfolio and executive report generators still use direct aggregate SQL against `claims` and `ai_assessments`; these are not individual-claim presentation values and cannot be replaced by `normaliseReportData()` without a separately designed aggregate read model. A future batch should introduce a tenant-scoped canonical reporting query facade for those aggregates. No such facade is created here.
