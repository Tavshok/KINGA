# ForensicReportModel — Isolated Contract and Parity Evidence

**Status:** Held for review on `feat/forensic-report-model`; no pull request or merge.
**Base revision:** `cb59e1355967b17fca0f95173343b925c854d318`.
**Scope:** Introduce a future-facing forensic data contract and resolver only. The active `server/reporting/forensicDecisionReport.ts` code path is unchanged.

## Purpose and boundary

`ForensicReportModel` is an immutable, tenant-scoped intermediate contract for a later, staging-gated split of the forensic decision report. `resolveForensicReportModel()` is intentionally an adjacent read path: it does not call, alter, or redirect the current HTML generator. This prevents an unverified refactor from changing a live report while the new model’s fidelity is established.

The resolver composes `resolveReportRecord()` for the previously approved canonical claim/assessment selection, then loads forensic-only data only after the parent claim has been resolved with both exact `claimId` and session-derived `tenantId`. It reuses the existing canonical cost-integrity, decision-integrity, photo-evidence, and evidence-governance helpers rather than reimplementing their rules.

## Contract coverage

| Model section | Current source family | Contract guarantee |
|---|---|---|
| Provenance and scope | Canonical report record; claim; latest assessment | Claim and tenant are immutable; assessment selection is explicit: newest `created_at`, then `id`. |
| Claim, vehicle, incident and identities | `claims`; canonical record | Keeps report-only PII within the forensic audience contract; no renderer receives a database row. |
| Decision, fraud and score strip | Latest `ai_assessments`; canonical decision helpers | Retains source values and bands; no unsourced numeric score is substituted. |
| Physics and causation | `physics_truth_json`; `physics_analysis` | Carries explicit values, units, ranges, provenance, constraints, speed ensemble, impact zones, calibration and reconciliation evidence. |
| Structural intelligence | Physics Truth; repair intelligence | Retains structural load path, latent-damage and vehicle-safety evidence with a produced/not-produced state. |
| Financial and reconciliation | Canonical quote evidence; cost intelligence; repair intelligence | Maintains the active-only L2 decision boundary while separately preserving submitted quote history for forensic presentation. |
| Evidence and governance | Claim documents; enriched photos; evidence governance helper | Holds document metadata and canonical photo labels; no image count, zone or usable status is invented. |
| Fraud, CGI, interpretation, validation and disputes | Assessment JSON; audit logs; dispute source | Carries classified risk evidence and explicit source availability. The optional dispute table is surfaced as `source_unavailable` if unavailable; it is not silently swallowed. |
| Approval history | Forensic audit workflow or recorded insurance audit logs | Identifies which source produced the stage history and does not claim the derived audit history is complete workflow history. |

## Availability and no-fabrication rule

Every optional evidence family is represented by `ForensicAvailability<T>`. Its state is one of `available`, `not_produced`, `not_applicable`, `source_unavailable`, or `legacy_partial`. A renderer can therefore distinguish missing evidence from zero or a successful-but-empty calculation. The resolver does not retain the former renderer defaults for impact severity, vehicle safety risk, damage zones, numeric category scores, photo usability, or unavailable speed discrepancy values.

## Tenant authority

`resolveForensicReportModel()` rejects an empty tenant before opening forensic source reads. It calls the canonical record resolver using the caller-supplied session tenant, and then scopes all direct supporting reads by a tenant-authorised parent claim. Assessment selection joins its tenant with the parent claim and uses deterministic latest-row ordering. A foreign tenant requesting the exact same numeric claim ID receives no model.

## Live-database parity test

`server/reporting/forensicReportModel.test.ts` creates one exact, uniquely stamped test tenant, actor, claim, two ordered assessments, repairer, quote, document, and audit entry. The fixture covers populated decision, physics, structural, financial, reconciliation, document, photo, fraud-category, CGI, interpretation, validation and approval field families. It then:

1. Asserts the model’s field values, units, ranges, category scores, availability states, deterministic latest-assessment selection and deep immutability.
2. Runs the unchanged `generateForensicDecisionReport()` for the exact same claim and checks its observable report values against the resolved model’s matching values.
3. Calls the resolver with the same claim ID under a different tenant and asserts denial.
4. Removes only the captured document, audit-log, quote, repairer, assessment, claim and actor IDs, then asserts that the exact captured claim, quote and assessment rows no longer exist.

The focused live-TiDB result was **1 file passed; 3 tests passed; 0 failed**.

## Broader validation

| Check | Result |
|---|---|
| Bundled server build | Passed. |
| Vite production build | Passed. Existing chunk-size warnings remain. |
| Full suite: unchanged `main` | 10 failed files; 21 failed tests; 8,467 passed; 1 skipped; worker exited unexpectedly. |
| Full suite: held branch | 10 failed files; 21 failed tests; 8,470 passed; 1 skipped; worker exited unexpectedly. The sole identifier text difference was Vitest’s elapsed-time suffix for the same dataset-capture test; no branch-only failed test was introduced. The new resolver suite ran and passed within this full run. |
| Project TypeScript check | Inconclusive: TypeScript exhausted the configured 1.8 GB Node heap before emitting diagnostics. This reproduces the known resource limitation and is not claimed as a green result. The new module did bundle and execute through both focused and full Vitest runs. |

## Deferred work

The report generator remains untouched. No production report depends on `ForensicReportModel` yet. The planned extraction into `dataFetcher`, `forensicEngine`, `visuals`, and `htmlRenderer` remains blocked on the separately required staging environment and must not be inferred from this contract-only branch.
