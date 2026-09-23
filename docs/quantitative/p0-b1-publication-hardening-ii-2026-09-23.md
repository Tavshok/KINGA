# P0-B1 Independent Publication Hardening II

**Status:** Merge-ready locally; commit, hosted quality gate, and approved merge pending.
**Date:** 23 September 2026
**Scope:** A narrow, independent hardening package. It does not resume or merge the paused P0-B1 integration.

## Purpose

This package closes two active raw-fraud publication bypasses found during the adversarial review of the rebased P0-B1 integration. Both bypasses could expose stored fraud classifications outside the P0-B1 evidence boundary, despite P0-B1 correctly withholding those values in its primary reports, PDF adapters, and decision sinks.

The package makes the two affected surfaces fail closed. It preserves operational search and claim-review information that does not state or imply a fraud conclusion. It adds the same actionable manual-review explanation used by the existing P0-B1 hold contract.

## Boundary changes

### Analytics global search

`analyticsRouter.globalSearch` previously selected and spread the full `claims` record. That made stored `fraudRiskScore`, `fraudRiskLevel`, and `fraudFlags` serializable through an Executive Dashboard query.

The route now selects an explicit operational allowlist. The returned claim search item contains only the identifier, vehicle, policy, incident, status, workflow, permitted financial, timestamp, and claimant-display fields required for discovery. It cannot inherit stored fraud properties when new schema fields are added. The response retains its legacy `results` and `claims` collection shapes and now includes the standard P0-B1 manual-review hold.

The Executive Dashboard renders the complete hold next to search results. It identifies the missing evidence and resolution path; it does not render a fraud score, level, flag, or neutral fallback. The visible search card now delegates to a small rendered component that consumes both the route’s `results` and retained `claims` response forms. That component converts any unexpected legacy status containing `fraud` to the non-conclusive operational state `manual_review` before display.

### Browser-generated Claim Review PDF

`client/src/lib/export-pdf.ts` previously accepted AI and assessor fraud fields and printed a risk level and indicators. `ClaimReviewDialog` forwarded the raw fields into that browser-side PDF payload.

The browser PDF data contract no longer accepts those fields, and the caller no longer serializes them. The PDF retains claim, vehicle, damage, cost, assessor, and quote information. It inserts a **Fraud Decision** section whose status is withheld and which explains the required evidence and resolution action using the shared P0-B1 presentation contract.

### Shared client/server hold contract

The P0-B1 evidence requirements and action hold now live in `shared/p0FraudDecisionHoldPresentation.ts`. The server re-exports that contract for existing decision sinks, while browser PDF and dashboard consumers use the same evidence and resolution wording. This removes the prior client/server duplication without allowing a browser-only fallback to invent a different fraud policy.

The malformed-response fallback in `ValidationGate` retains a specific explanation that the hold response is incomplete, but now takes its required-evidence and resolution text directly from the immutable shared contract. It therefore fails closed without creating a parallel browser-only evidence policy.

## Explicit exclusions and follow-up

During the focused client audit, four additional raw-fraud display paths were found in `ClaimReviewDialog`: the overview risk score and flags; the assessor recommendation risk badge; the AI fraud-indicator card; and the timeline-and-risk badge. The component receives these values from `claims.getById`, `aiAssessments.byClaim`, and `assessorEvaluations.byClaim`, so the follow-up must trace both browser rendering and route-response exposure before choosing a safe shared projection. A later static audit also found the Executive Dashboard alert-bar `fraudFlags` count and `highRisk` AI-review count outside the approved Global Search card. These are not silently included here. Together they are an independent, unimplemented browser-publication hardening package that must be approved, implemented, reviewed, and merged before the P0-B1 integration may resume.

The broader static client inventory also found many files containing fraud-related names. That inventory is not a semantic closure claim. Before P0-B2 begins, its consumer-surface preflight must explicitly include **client and browser code**, including dashboards, claim-detail views, component-level displays, browser PDF/Excel exports, and client-side derived presentation logic, alongside server routers, reports, PDFs, exports, snapshots, analytics, and admin views.

## Regression evidence

`server/p0B1PublicationHardeningII.test.ts` verifies the global-search allowlist with adversarial score, level, flag, and suspicion values; confirms the response uses the immutable P0-B1 hold; prevents reintroduction of a whole-claim selection or spread; verifies the client PDF contract and caller omit raw fraud fields; and checks that the active Executive Dashboard card mounts the rendered P0-B1 search component.

`server/p0B1PublicationHardeningII.router.test.ts` invokes the real global-search tRPC procedure with a mocked query chain. It proves the serialized response preserves tenant- and role-middleware behavior, emits the hold, and excludes all adversarial stored fraud fields. `server/p0B1PublicationHardeningII.ui.test.ts` server-renders the active global-search result component, verifies that a withheld response visibly shows its missing-evidence and resolution text while a `fraud_flag` status is downgraded to `manual_review`, and intercepts browser PDF table and text calls to confirm non-fraud evidence remains while fraud metrics do not.

The first adversarial review blocked on three defects: the actual visible Global Search card consumed the wrong response shape and rendered its hold only in a hidden legacy block; the browser malformed-hold fallback duplicated and drifted from shared guidance; and the initial checks were insufficiently behavioral. Those defects are remediated in the scope above.

The guarded post-remediation matrix passed **7 files / 24 tests** through `scripts/run-isolated-vitest.ts` against `kinga_ci_test`. It includes package source, procedure, and rendered-browser/PDF behavior tests; the shared P0-B1 hold contract; existing client hold rendering; the preceding independent-hardening regressions; and the existing global-search tenant-authority checks.

On 23 September 2026, a fresh independent adversarial re-review returned **APPROVE**. It verified the explicit global-search query/projection, unchanged role and tenant middleware, active-card hold rendering, browser PDF behavior, shared malformed-hold guidance, and behavior-based coverage. It reconfirmed five non-blocking follow-ups outside this package: the four `ClaimReviewDialog` raw-fraud displays and the Executive Dashboard alert-bar fraud/high-risk counts. Those remain the explicitly separate browser-publication hardening package described above. Guarded full-suite merge readiness and hosted checks remain required before merge.

## Merge-readiness validation

The guarded full suite completed against `kinga_ci_test`: **613 files passed, 1 skipped; 9,715 tests passed, 4 skipped**. `git diff --check` passed and all new or focused package artifacts passed Prettier. Direct `tsc --noEmit` reported 1,472 existing diagnostics; no new diagnostic was attributed to this package. The one matched `server/routers/analytics.ts` diagnostic is pre-existing in the unchanged `resolveAnalyticsTenant()` return annotation on the merged baseline.

The repository’s guarded command wrapper rejects `pnpm build` from a non-managed worktree, so the equivalent production commands were run directly: `vite build` for the client and `esbuild server/_core/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist` for the server. Both passed. Vite emitted only its existing large-chunk warning.

## References

[1]: ./p0-b1-fraud-decision-gates-2026-09-22.md "P0-B1 fraud decision gates implementation record"
[2]: ./p0-b1-independent-bypass-hardening-2026-09-23.md "P0-B1 independent bypass hardening implementation record"
[3]: ./p0-combined-physics-fraud-consumer-inventory-2026-09-22.md "Combined physics-and-fraud consumer inventory"
