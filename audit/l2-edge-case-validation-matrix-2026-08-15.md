# KINGA L2 Edge-Case Validation Matrix

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 15 August 2026  
**Status:** Completed no-write validation  
**Scope:** Deterministic calculation and publication-contract validation only. No claim, quotation, assessment, report-job, policy, payment, settlement, recovery, tenant, or authority record was read or changed as part of this matrix.

## Purpose and Policy Boundary

This validation confirms the approved KINGA L2 boundary: L1 is the lowest whole eligible active submitted quotation, while L2 selects the lowest eligible submitted component price against benchmark P50. A P50 within 30% is selected; otherwise the lower supported value is selected. Benchmark data never creates a component without eligible submitted evidence. A complete L2 remains publishable despite an ordinary quote reconciliation issue; genuine missing submitted component evidence leads to human review rather than an invented price.

> The matrix tests the canonical calculation and shared presentation contracts. It does not recompute or change production records, and it does not create settlement authority.

## Executed Matrix

| Scenario | Authoritative result | Publication result | Classification |
|---|---|---|---|
| Complete multi-quote scope with P50 within 30% | P50 selected; L2 $90 against L1 $100 | Complete KINGA Optimised Quote; Potential savings $10 | Intended |
| One eligible submitted component quote | P50 selected where within 30%; negative comparison is retained internally | Complete KINGA Optimised Quote; no Potential savings | Intended |
| Submitted component with no benchmark | Lowest submitted component price selected | Complete KINGA Optimised Quote | Intended |
| P50 materially below Qmin | Lower P50 selected | Complete KINGA Optimised Quote | Intended |
| P50 materially above Qmin | Lower submitted Qmin selected | Complete KINGA Optimised Quote | Intended |
| Required component lacks submitted price | L2 is incomplete; priced evidence remains traceable only | Human review; no invented missing amount and no savings | Intended |
| Submitted total does not reconcile to itemised scope | Complete submitted-component L2 remains available; reconciliation is retained as a quote issue | Complete KINGA Optimised Quote with reconciliation required | Intended |
| Only comparison-only or ineligible quotation history remains | No eligible active L1/L2 evidence | Human review; no numeric L1, L2, or savings | Intended |
| No quotation received | No component evidence exists | Quotation required; human review; no invented amount | Intended |

The former P25/P75 floor-and-ceiling concept is not a current L2 authority. The two materially outside-30% cases above validate the approved replacement: select the lower supported P50 or Qmin and retain the submitted evidence rather than using a disconnected range gate.

## Executable Evidence

The new deterministic suite is [`server/pipeline-v2/l2EdgeCaseMatrix.p1.test.ts`](../server/pipeline-v2/l2EdgeCaseMatrix.p1.test.ts). It invokes the actual `buildCompositeQuote` calculation and `buildCostDecisionPresentationContract` publication reducer. The suite passed **8 of 8** cases.

| Validation command | Result |
|---|---|
| `pnpm exec vitest run server/pipeline-v2/l2EdgeCaseMatrix.p1.test.ts --pool=forks --poolOptions.forks.singleFork=true --maxWorkers=1 --minWorkers=1` | 1 file, 8 tests passed |
| Bundled server build | Passed |
| Vite production build | Passed; existing large-chunk warning only |

## Conclusion

Every approved matrix outcome is classified as **intended**. No formula defect, evidence-authority regression, or publication-policy divergence was reproduced. The relevant residual work remains external or operational validation rather than a change to the L1/L2 calculation or client presentation boundary.

## References

1. [Composite L2 engine](../server/pipeline-v2/quoteOptimisationEngine.ts)
2. [Shared cost-decision presentation contract](../shared/costDecisionPresentation.ts)
3. [No-write edge-case validation suite](../server/pipeline-v2/l2EdgeCaseMatrix.p1.test.ts)
