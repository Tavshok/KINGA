# Post-P0 Claim PDF Canonicalisation Evidence

**Date:** 2026-08-29  
**Status:** Completed and held for review  
**Branch:** `fix/post-p0-report-remediation`  
**Base commit:** `cb59e1355967b17fca0f95173343b925c854d318`

## Scope

This phase removes the legacy Claim PDF export's independent claim lookup and its non-deterministic, oldest-assessment query. The export now resolves one tenant-scoped `ResolvedReportRecord` using the authenticated insurer tenant and derives its legacy presentation input through `toClaimPdfCanonicalInput()`.

The change deliberately does **not** redesign the PDF, change calculations, alter quote optimisation selection, modify database schema, or touch CL, CI, FR, SAR, Shadow, audit export, policies, settlements, or the deferred forensic structural split.

## Source-of-truth result

| Concern | Previous export path | Held remediation result |
|---|---|---|
| Parent claim | Export-local Drizzle query on `claims` | `resolveReportRecord({ claimId, tenantId, audience: "audit" })` |
| Assessment selection | `ai_assessments` ordered by ascending `id`, then limited to one | Canonical resolver selects `created_at DESC, id DESC`, then limits to one |
| Assessment fields rendered | Independently selected row | Typed canonical assessment: cost, fraud risk, confidence, damage description, and causal verdict |
| Tenant authority | Local predicate followed by unscoped assessment selection | Session-derived insurer tenant is fail-closed before canonical resolution; foreign/missing claim is presented as the established `NOT_FOUND` response |
| Ancillary export reads | Claim-ID-only quote and decision-user reads | Performed only after canonical parent authority; quotes and decision user also receive explicit tenant predicates |

The canonical report contract gained only typed fields required by the pre-existing Claim PDF presentation: claim number, three panel-beater choices, assigned repairer identifier, incident description, and selected assessment cost/risk/confidence/causal verdict. `assessment_confidence_score` is explicitly aliased from the selected assessment so the PDF cannot accidentally render the similarly named claim-level field.

## Live-database parity and isolation proof

`server/claim-pdf-canonical-parity.p0.test.ts` creates an exact, uniquely stamped tenant, claim, and two assessments. The stale assessment has cost **US$1,111.00**, low risk, 41% confidence, and a unique stale description. The later assessment has cost **US$2,222.00**, critical risk, 92% confidence, a unique later description, and an 80% third-party-liability causal verdict.

The regression resolves the canonical record, adapts it for the Claim PDF, generates actual HTML, and proves all visible values come from the later assessment. It also proves the stale cost and stale description do not appear and that a different tenant cannot resolve the fixture claim. The cleanup removes the exact two captured assessment IDs first and then the captured claim ID.

| Validation | Result |
|---|---|
| Focused live-TiDB regression | 1 file, 1 test passed |
| Existing Claim PDF suite | 1 file, 60 tests passed |
| Combined focused validation | 2 files, 61 tests passed |
| Bundled server build | Passed (`esbuild` server entry) |
| Vite production build | Passed; existing large-chunk advisory only |
| Fresh-worker full suite, exact parent baseline | Parent: 492 files/41 shards; branch: 493 files/42 shards, including the new parity test |
| Full-suite failure identifiers | 46 parent identifiers and 46 branch identifiers; **no branch-only identifiers** |
| Controlled TypeScript target check | No diagnostics in either modified module on the branch; the parent had two pre-existing Claim PDF typing diagnostics, while the branch's controlled run had fewer total diagnostics (24 vs 26) |

The full-suite runner returns a non-zero overall status because the baseline suite already contains the same 46 failed identifiers. This evidence does not represent the overall suite as green.

## Hold and exclusions

This phase is ready for its own held commit only. No pull request, merge, main-branch update, schema migration, production-data change, external-provider activation, payment, policy, or settlement action occurred.

The user-provided role-based portfolio/executive consolidation instruction has been recorded as the later replacement scope for the executive/portfolio phase. It does not change this completed Claim PDF phase.
