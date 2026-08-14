# KINGA Systematic Error Audit Ledger

**Author:** Tavonga Shoko, Lead Engineer  
**Status:** Discovery in progress — no production behaviour changed  
**Audit principle:** Traceable evidence → deterministic interpretation → transparent uncertainty → defensible intelligence → controlled decision boundary.

## Audit Scope and Evidence Sources

| Audit domain | Evidence to trace | Initial authoritative contracts | Discovery status |
|---|---|---|---|
| Source-to-ledger integrity | Quote documents, extracted fields, submitted quote ledger, provenance, reconciliation | Canonical active-quote ledger and quote reconciliation contracts | Pending |
| L1/L2 intelligence | Evidence state, component coverage, tax/cost basis, comparison outputs, suppression state | Shared cost decision presentation and immutable R0 fixtures | Pending |
| Decision boundary | Evidence, finding, intelligence, recommendation, decision, settlement/savings suppression | Cost integrity and report decision contracts | Pending |
| Cross-report consistency | CL, CI, FR, Claims Manager, L2, Top Cost inputs and rendered decisions | Shared report presenters and same-snapshot fixtures | Pending |
| UI-to-backend truth | UI value/action, tRPC procedure, service, persistence, source evidence | Procedure contracts and client integrations | Pending |
| Negative and degraded states | Missing, malformed, duplicate, revised, incomplete, conflicting, unavailable evidence | Existing regression suites and no-write fixtures | Pending |

## Discovery Evidence Log

| Evidence ID | Area | Source examined | Result | Test/trace evidence | Status |
|---|---|---|---|---|---|
| AUD-BASE-001 | L2 submitted-price selection | `server/pipeline-v2/quoteOptimisationEngine.ts` | The composite builder selects lowest submitted active-quote price per component and retains benchmarks as comparison metadata only. | `buildCompositeQuote.test.ts`: 19 passing tests, including low/no benchmark, VAT/workshop fee, reconciliation, and missing-component cases. | Baseline verified |
| AUD-BASE-002 | Report cost decision boundary | `server/reporting/costIntegrity.ts`, `server/reporting/costDecisionPresentation.ts` | The report contract uses the active ledger, preserves incomplete-scope comparison intelligence, and withholds final L2/savings/settlement conclusions when scope or reconciliation is incomplete. | `costIntegrity.test.ts`, `costDecisionPresentation.test.ts`, and `r0FixtureModelAcceptance.test.ts`: 16 passing tests. | Baseline verified |
| AUD-OBS-001 | Incomplete composite benchmark fields | `stage-9-cost.ts` and `quoteOptimisationEngine.ts` | Incomplete composites persist benchmark comparison fields, but the inspected report decision contract does not consume them as settlement or savings conclusions. | Static producer-to-consumer trace; no confirmed user-visible divergence in this discovery pass. | Monitor in UI/API trace |

| AUD-P0-001 | Report quote detail authorization | `server/routers/quotes-core.ts` `quotes.getWithLineItems` | Every report-related quote query must derive and enforce authority from the claim object and caller tenant/role before returning quote rows. | The protected procedure called `getQuotesByClaimId(input.claimId)` without tenant or claim-object authorization. Its comment deliberately removed tenant filtering, so an authenticated caller who knew a foreign numeric claim ID could receive its quote rows and line items. | Missing object-level claim authorization at the procedure boundary. | P0 | Added target-claim lookup under a required tenant scope before quote/line-item reads. Ordinary callers are session-scoped; platform-super-admin requires explicit audited tenant selection. Restored the missing `inArray` query-helper import surfaced by the authorised-path regression. | `quotes-core.authorization.p0.test.ts`: same-tenant success, foreign numeric claim unavailable before read, explicit platform-super-admin selection. `tenant-isolation.test.ts`: 18 existing tenant tests. | 21 focused tests passed; bundled server and Vite production builds passed. | Corrected and re-verified |

## Finding Ledger

| ID | Area | Evidence | Expected | Actual | Root Cause | Severity | Correction | Regression | Verification | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| — | No confirmed finding yet | Discovery baseline only | — | — | — | — | — | — | — | Open |

## Classification Rules

Any divergence found during discovery is recorded before correction and classified as one of: **verified source value**, **documented revision**, **extraction defect**, **ledger reconstruction issue**, **scope difference**, **evidence gap**, **unresolved discrepancy**, or **pricing variance review signal**. A divergence is not silently normalised merely to make amounts reconcile.

## Correction Control

Only a confirmed defect with an identified affected component, intended invariant, severity, and bounded correction scope may move to implementation. Every correction requires deterministic regression evidence and a re-verification pass. Ambiguous intended behaviour remains a decision item rather than a speculative change.
