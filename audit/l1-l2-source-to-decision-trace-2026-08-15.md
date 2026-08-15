# KINGA L1/L2 Source-to-Decision Trace Audit

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 15 August 2026  
**Status:** Completed no-write audit  
**Scope:** One deterministic persisted-shaped quotation fixture was executed through the actual Stage 9 cost optimisation path, the shared cost-decision publication contract, Claims Ledger, Claims Intelligence, Forensic Claim Decision, and the client top-cost consumer. No production record, formula, workflow, or decision was changed.

## Trace Objective

The audit verifies that a material L1/L2 value remains traceable from submitted source evidence through the canonical ledger and final presentation. It checks the same decision basis rather than independently recalculating any cost in a report consumer.

> **Trace rule:** Source quotation headers establish L1 eligibility. Eligible submitted line items establish the component Qmin. Stage 9 applies the approved P50/30% rule, and downstream surfaces consume the persisted composite rather than creating a substitute cost.

## Executed Value Trace

| Trace point | Evidence and value | Result |
|---|---:|---|
| Submitted source quotation A | USD 1,000 whole quote; USD 1,000 itemised `Mystery Trace Part` | Verified source value |
| Submitted source quotation B | USD 1,200 whole quote; USD 1,200 itemised `Mystery Trace Part` | Verified source value |
| Canonical quote ledger | Both quotations active and `final_l2_eligible` | Verified ledger reconstruction |
| L1 | USD 1,000, the lower eligible active whole quotation | Verified calculation |
| Vehicle-specific fallback benchmark P50 | USD 900 for the submitted component | Verified benchmark comparison evidence |
| L2 | USD 900, benchmark within the approved 30% tolerance of Qmin | Verified calculation |
| Potential savings | USD 100, calculated only from complete eligible L1/L2 | Verified calculation and publication boundary |
| Shared cost-decision contract | Complete KINGA Optimised Quote USD 900; Potential savings USD 100 | Verified presentation contract |
| CL, CI, and FR | Each rendered KINGA Optimised Quote USD 900 and Potential savings USD 100 | Verified displayed value |
| Client top-cost consumer | Rendered concise KINGA Optimised Quote USD 900 and Potential savings USD 100 | Verified displayed value |

## Classification of Observations

| Observation | Classification | Assessment |
|---|---|---|
| Initial fixture used `Front Bumper` and produced an internal statistical P50 of USD 309.35 rather than the fixture’s intended vehicle-specific fallback P50 of USD 900. | Scope difference in test fixture | `Front Bumper` is covered by Stage 9’s earlier hybrid statistical model, whose priority intentionally precedes database fallback. The audit fixture was changed to an unmodelled component to test the stated fallback path. This did not reproduce a production L1/L2 divergence. |
| Isolated Stage 9 status was `degraded` while canonical L1/L2 evidence was complete. | Evidence-environment qualification | The no-write fixture intentionally supplies no persistence adapter. The stage retains canonical output and downstream traceability while qualifying optional persistence/learning work. This is not a cost-decision divergence. |
| Source values, canonical ledger, L1, L2, savings, shared contract, CL, CI, FR, and client output | No divergence | Every material value retained the authorised decision basis. |

## Executable Evidence

The audit is implemented in [`server/reporting/l1L2SourceDecisionTrace.p1.test.ts`](../server/reporting/l1L2SourceDecisionTrace.p1.test.ts). It invokes the real `runCostOptimisationStage` path, then supplies that result to the shared publication reducer and actual report/client renderers.

| Validation command | Result |
|---|---|
| Consolidated Stage 9/report/client trace group | 4 files, 19 tests passed |
| Bundled server build | Passed |
| Vite production build | Passed; existing large-chunk warning only |

## Conclusion

The audited source-to-decision path is internally consistent for the executed material L1/L2 fixture. No extraction defect, ledger reconstruction issue, unsupported displayed value, or report/client recalculation was reproduced. The two observations were classified as a test-fixture scope difference and a deliberate no-write infrastructure qualification respectively; neither warrants a production behaviour change.

## References

1. [Stage 9 cost optimisation](../server/pipeline-v2/stage-9-cost.ts)
2. [Canonical quote ledger](../server/pipeline-v2/canonicalQuoteLedger.ts)
3. [Shared cost-decision presentation contract](../shared/costDecisionPresentation.ts)
4. [No-write source-to-decision trace suite](../server/reporting/l1L2SourceDecisionTrace.p1.test.ts)
