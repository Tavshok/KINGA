# Claims Manager Professional Cost-Unit and Comparison-Basis Audit

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 15 August 2026  
**Status:** Completed no-write audit  
**Scope:** Claims Manager professional assessment, assessor, quotation, variance, and currency-formatting paths. No live claim, quotation, formula, workflow, policy, payment, settlement, or stored record was changed.

## Unit Contract

`ai_assessments.estimated_cost`, `assessor_evaluations.estimated_repair_cost`, and `panel_beater_quotes.quoted_amount` are stored in **cents**. The tenant formatter accepts cents and performs the only display conversion. A variance calculation must compare values on one common basis before applying its percentage formula.

> **Professional display rule:** A stored-cent value is supplied to `fmt` once. A comparison either uses cents throughout or converts both operands to dollars before the calculation; it must never compare one of each.

## Executed Matrix

| Path | Observed calculation/display | Expected result | Classification |
|---|---|---|---|
| Panel-beater raw quotation | 80,000 cents supplied once to `fmt` | USD 800.00 | Intended; corrected by AUD-P1-018 |
| Canonical L1/L2 summary | USD amounts multiplied to cents once before `fmt` | Correct L1/L2 currency display | Intended; corrected by AUD-P1-017/018 |
| Assessor repaired cost | 100,000 cents → USD 1,000 intermediate → 100,000 cents to `fmt` | USD 1,000.00 | Numerically correct but unnecessarily round-tripped |
| KINGA assessment estimated cost | 150,000 cents multiplied by 100 before `fmt` | USD 1,500.00 | **AUD-P1-019: renders USD 150,000.00, 100× overstatement** |
| KINGA-versus-assessor variance | Assessor USD 1,000 compared with KINGA 150,000 cents | -33.3% for $1,000 versus $1,500 | **AUD-P1-020: renders -99.3% from mixed units** |
| Quote versus KINGA Optimised Quote | Both values represented in USD before comparison | Like-for-like variance | Intended |

## Confirmed Findings

**AUD-P1-019 (P1)** arises from `fmt(aiCost * 100)` while `aiCost` is already `estimatedCost` in cents. The actual rendering fixture provided 150,000 cents and showed **USD 150,000.00** instead of USD 1,500.00.

**AUD-P1-020 (P1)** arises because `assessorCost` is converted to dollars while `aiCost` remains cents before `calculateVariance(assessorCost, aiCost)`. The same fixture showed **-99.3%** rather than the correct -33.3% comparison between USD 1,000 and USD 1,500. This affects professional interpretation and must be corrected with AUD-P1-019 under a separate approved presentation-only batch.

## Validation Evidence

| Validation | Result |
|---|---|
| Actual Claims Manager no-write unit rendering audit | 4 assertions passed, including both reproduced findings |
| Claims Manager canonical/projection/source-trace regression group | 3 files, 6 tests passed |
| Bundled server build | Passed |
| Vite production build | Passed; existing large-chunk warning only |

## Conclusion

The canonical quote/L1/L2 path is unit-safe after AUD-P1-017/018. The remaining defect is limited to the separate KINGA assessment header and its assessor variance calculation. No correction has been made in this audit-only batch.

## References

1. [Claims Manager comparison view](../client/src/pages/ClaimsManagerComparisonView.tsx)
2. [Tenant currency formatter contract](../client/src/hooks/useTenantCurrency.ts)
3. [Actual rendering audit](../server/reporting/crossReportUiTruthAudit.p1.test.ts)
