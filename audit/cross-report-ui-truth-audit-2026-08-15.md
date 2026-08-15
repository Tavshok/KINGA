# KINGA Cross-Report and UI Truth Audit

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 15 August 2026  
**Status:** Completed no-write audit  
**Scope:** Canonical evidence-consumer trace only. No claim, quotation, report job, formula, workflow, policy, payment, settlement, or stored record was changed.

## Audit Objective

The audit traced a common complete all-in quotation state through the shared cost-decision contract and every approved presentation consumer. It also inspected Claims Manager comparison authority because that workspace is a decision-facing professional surface.

> **Truth rule:** A decision-facing view must not derive its own “lowest quote” from raw quotation rows when KINGA already maintains a canonical eligible ledger and L1/L2 decision record.

## Consumer Classification

| Consumer | Authority path observed | Outcome |
|---|---|---|
| Claims Ledger | Shared report cost-decision renderer | Consistent with canonical presentation contract |
| Claims Intelligence | Shared report cost-decision renderer | Consistent with canonical presentation contract |
| Forensic Claim Decision | Shared report cost-decision renderer | Consistent with canonical presentation contract |
| Client top-cost view | Shared `buildCostDecisionPresentationContract` | Consistent with canonical presentation contract and concise client boundary |
| Claims Manager comparison | Raw `quotes.byClaim` response reduced by `quotedAmount` and displayed directly in the summary | **Divergent authority path and raw-cent display defect**; does not read canonical ledger or persisted L2 |

The common complete fixture produced a passed verification, KINGA Optimised Quote of USD 1,725, and a complete publication state through the shared report/client contract. The existing source-to-decision trace separately confirms exact L1 USD 1,000, L2 USD 900, and Potential savings USD 100 through Stage 9, CL, CI, FR, and the client surface.

## Confirmed Finding: AUD-P1-017

`ClaimsManagerComparisonView.tsx` obtains `trpc.quotes.byClaim`, applies an in-page `quotes.reduce(...)` over raw `quotedAmount`, and exposes this as its lowest quote. The underlying query returns all claim quote rows without canonical workflow/evidence eligibility qualification. The view contains no canonical quote-ledger or persisted L2 authority field.

This creates a real divergence risk: cancelled, rejected, superseded, duplicate, explicitly ineligible, inferred, or otherwise non-final-L2-eligible quotation values can affect a decision-facing Claims Manager comparison result even though they are excluded from L1/L2, savings, and report conclusions elsewhere.

The actual isolated rendering acceptance supplied a cancelled quote of **80,000 cents** and an eligible submitted quote of **120,000 cents**. Claims Manager rendered the cancelled raw value as **`$80,000`** under “Lowest Quote,” rather than the correctly scaled $800. Its individual quote card separately divides by 100, demonstrating an intra-view unit inconsistency. This is recorded as **AUD-P1-018, P1** and must be corrected separately with AUD-P1-017 because both changes affect a professional decision-facing view.

The finding is recorded as **AUD-P1-017, P1**. No code correction was made in this audit-only batch. A future correction must replace the raw lowest-quote calculation with the same canonical eligible ledger/L1/L2 projection used by the report and client cost-decision consumers, while retaining transparent historical quotation information separately.

## Executable Evidence

| Validation | Result |
|---|---|
| Cross-report/client/Claims Manager audit group | 5 files, 18 tests passed |
| Bundled server build | Passed |
| Vite production build | Passed; existing large-chunk warning only |

The audit assertion is [`server/reporting/crossReportUiTruthAudit.p1.test.ts`](../server/reporting/crossReportUiTruthAudit.p1.test.ts). It positively verifies the shared report/client contract, traces Claims Manager’s raw source path, and renders the actual view with a cancelled lower-cent quote to capture both open defects.

## Conclusion

CL, CI, FR, and the client top-cost presentation share the intended cost-decision authority. Claims Manager comparison does not, and its lowest-quote summary also formats cents as dollars. The remaining correction is targeted and must be separately approved because it alters a decision-facing professional view’s data authority and displayed amount.

## References

1. [Shared cost-decision contract](../shared/costDecisionPresentation.ts)
2. [Claims Manager comparison view](../client/src/pages/ClaimsManagerComparisonView.tsx)
3. [Quote query](../server/db/assessment-db.ts)
4. [No-write audit assertion](../server/reporting/crossReportUiTruthAudit.p1.test.ts)
