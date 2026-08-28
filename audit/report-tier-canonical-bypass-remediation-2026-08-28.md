# KINGA Report-Tier Canonical-Data Remediation

**Date:** 28 August 2026  
**Branch:** `fix/report-tier-canonical-bypasses`  
**Purpose:** Remove individual-claim report renderer database-access bypasses while preserving the existing HTML structures and leaving the staging-gated forensic structural split deferred.

## Scope and Boundaries

This change is limited to the three individual claim report tiers: Claim Assessment / Claims Ledger (**CL**), Claims Intelligence (**CI**), and Forensic Claim Decision Report (**FR**). It does not change tenant authentication, database ownership, schema, migrations, production data, report access roles, report layouts, client code, or the deferred forensic module split.

> The renderer boundary is now deliberate: report generators receive resolved tenant-scoped data only. They must not open database connections, select claim or assessment rows, or select supporting evidence as a fallback.

The legacy `generateForensicReport()` function retained within `reportDefinitions.ts` is not registered by the dispatcher for `claim.forensic`; the active runtime route continues to call `generateForensicDecisionReport()`. During final validation, this dormant function was also found to retain an unnecessary local database connection despite already using `resolveReportRecord()`. Its connection lifecycle was removed, leaving it canonical-record-only and eliminating the remaining dormant forensic direct-access path.

## Explicit Forensic-Model Dependency Decision

The independently held `feat/forensic-report-model` work was reviewed before incorporation. Its original validation record established an immutable, tenant-scoped `ForensicReportModel`, deterministic latest-assessment selection, exact owned-fixture teardown, populated forensic field-family parity, and cross-tenant denial. It was not unmerged because of a known correctness failure; it was held because the later structural split was intentionally staging-gated.

The contract was incorporated as a separate traceable commit before FR migration. This imports only the resolved model, parity test, and audit record. It does **not** split `forensicDecisionReport.ts` into `dataFetcher`, `forensicEngine`, `visuals`, and `htmlRenderer`; that work remains deferred until a staging environment supports report-output review.

## Complete Active-Tier Bypass Inventory and Resolution

| Tier | Pre-change direct data access | Canonical resolution | Post-change renderer boundary |
|---|---|---|---|
| CL | One direct connection used solely to call `loadEvidenceGovernanceReportData(conn, claimId, tenantId)`. | `ResolvedReportRecord.evidence.evidenceGovernance`, loaded after claim tenant resolution. | `generateClaimAssessmentReport()` has no local connection or direct evidence query. |
| CI | Direct `claims` + latest `ai_assessments` SQL plus quote, line-item, document, vehicle-history, pre-loss, and evidence-governance reads. | `resolveReportRecord()` now loads typed quote evidence, documents, vehicle claim history, pre-loss condition, evidence governance, claim/assessment metadata, CGI, interpretation, and incident description. | `generateClaimsIntelligenceReport()` consumes `ResolvedReportRecord` and its presentation adapter only. |
| FR | Direct `claims` + latest `ai_assessments` SQL plus quotation, document, pre-loss, audit-event, and dispute reads. A dormant legacy FR helper also retained an unnecessary local connection. | `resolveForensicReportModel()` composes the authorised resolved record and tenant-scoped report-specific support data. The dormant helper already uses `resolveReportRecord()`. | `generateForensicDecisionReport()` calls only `resolveForensicReportModel({ claimId, tenantId, audience: "forensic" })` and its compatibility adapter. The active and dormant FR paths now contain no local connection, `SELECT`, or evidence-governance loader call. |

The codebase scan identified no other active individual-report renderer database bypass after the migration. Supporting data is loaded only after the parent claim has been resolved in the requested tenant scope.

## Canonical Contract Extensions

`ResolvedReportRecord` gained fields that were demonstrably rendered by CI rather than fabricated presentation fields: typed claim-document evidence; dated vehicle-claim history; availability-labelled pre-loss condition; evidence-governance report data; CGI and interpretation JSON; recorded claim events; assessment and policy/incident metadata; claim incident description; and quote congruency evidence.

`ForensicReportModel` remains a stricter FR-specific contract. It maps the canonical record into forensic sections, derives its approval chain from tenant-scoped audit data, carries explicit availability states, and keeps renderer compatibility in a small adapter. It does not expose a database connection or raw query capability to the FR renderer.

## Parity and Evidence-Governance Coverage

The live-database owned-fixture regression now resolves one claim and renders CL, CI, and FR. It confirms all three reports contain the same model-derived vehicle description, fraud score, market value, Delta-V, and decision label. CI and FR are also compared directly with canonical quotation evidence.

Audit-event parity is asserted at value level: the model's first approval stage is the fixture's **Claims Processor Review**, **Complete**, with officer **claims_processor**, and those values occur in rendered FR output. `claim_disputes` is absent from the current live schema inventory. The resolver preserves this as `source_unavailable` with no dispute rows; the FR renderer is asserted not to invent a dispute section. This is intentional absence disclosure rather than a fabricated or silently treated-as-empty data set.

The existing evidence and cost-provenance contract tests were updated only where they had required every renderer to repeat internal photo or cost derivation text. They now ensure CL and CI use the shared helper directly, and ensure FR uses the canonical forensic model while retaining the same qualified photo panel, shared cost presentation, structural evidence, and no-relabel safeguards.

## Commits

| Commit | Change |
|---|---|
| `07c24a38` | Record report-tier migration scope. |
| `ab89e536` | Incorporate independently validated `ForensicReportModel` as an explicit dependency. |
| `86d07000` | Migrate CI to `ResolvedReportRecord`; remove direct renderer queries. |
| `259f9262` | Migrate FR to `ForensicReportModel`; remove direct renderer queries. |
| `d63da3d2` | Migrate CL evidence governance to `ResolvedReportRecord`; add three-tier parity test. |
| `e89eef96` | Update behaviour-preserving report contract tests for the canonical boundary. |

## Validation Record

| Check | Result |
|---|---|
| CI / canonical focused test group | Passed after CI migration. |
| FR model, renderer, architecture, and agency-boundary group | 4 files, 119 tests passed. |
| Explicit audit-event and dispute-availability parity | Live TiDB fixture, 1 file, 4 tests passed. |
| CL / CI / FR shared-value parity group | 2 files, 7 tests passed. |
| Qualified photo and cost-provenance contract group | 4 files, 14 tests passed. |
| Final active-and-dormant report-path contract group | 8 files, 134 tests passed after the legacy forensic connection removal. |
| Server bundle after FR migration | Passed. |
| Vite production build after FR and CL migration | Passed; existing chunk-size warnings only. |
| Extra FR-commit full suite | Reached the inherited single-worker 1.8 GB heap limit and exited unexpectedly after executing tests; this is the known suite-reliability limitation. |
| Final committed branch full suite | 21 failed files, 42 failed tests, 9,052 passed, 3 skipped; worker exited unexpectedly at the 1.8 GB heap limit. Its 43 extracted failed identifiers exactly matched the retained current-main baseline's 43 identifiers: no branch-only failure. |
| TypeScript project check | Not a green gate: this repository's global check exhausts the same configured 1.8 GB heap before emitting diagnostics. Runtime compilation succeeded in focused tests and both production builds. |

## Held Status

The branch is pushed as `user_github/fix/report-tier-canonical-bypasses`. No pull request was opened, no branch was merged, and `main` was not modified. The outstanding staging prerequisite applies only to the later structural split of `forensicDecisionReport.ts`, not to this completed canonical data-acquisition migration.
