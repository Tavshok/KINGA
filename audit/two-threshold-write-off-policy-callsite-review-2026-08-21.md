# Two-Threshold Write-Off Policy — Call-Site Review

## Policy

| Threshold | Behaviour | Authority boundary |
|---|---|---|
| **65%** `WRITE_OFF_WARNING_THRESHOLD` | Surface an assessor/reviewer warning that repair cost is approaching write-off territory. | It is not a recommendation and cannot force a decision. |
| **70%** `WRITE_OFF_RECOMMENDATION_THRESHOLD` | Present a KINGA economic write-off recommendation. | It remains subject to human assessor or insurer override; it is not an automatic write-off, settlement, disposal, payment, or policy decision. |

`shared/writeOffPolicy.ts` is the canonical policy source. `pipelineCostConstants.ts` re-exports the named values for pipeline callers. Deprecated single-threshold aliases resolve only to the 70% recommendation constant for compatibility.

## Reclassification of Active Call Sites

| Call site | Behaviour before this change | Reclassified purpose | Implemented behaviour |
|---|---|---|---|
| `shared/writeOffRecommendation.ts` | 70% recommendation; 65–69.99% appeared as repair. | Core decision/report contract. | 65–69.99% produces `economic_write_off_warning`; 70%+ produces a human-overridable recommendation. |
| `server/pipeline-v2/claimTruthLayer.ts` | One economic write-off signal. | Recommendation signal. | Uses the explicit 70% recommendation threshold. |
| `server/pipeline-v2/truthReconciliationEngine.ts` and `stage-7-physics.ts` | One economic/total-loss indication. | Recommendation signal. | Uses 70% only; a 65% warning does not set an economic recommendation. |
| `server/pipeline-v2/stage-5-assembly.ts` | 70% write-off plus a generic 60% borderline band. | Preliminary valuation output. | 65–69.99% becomes an explicit early-warning reason; 70%+ remains a preliminary recommendation. |
| `server/pipeline-v2/costIntelligenceNarrative.ts` | 70% write-off language; 50–69.99% only “elevated.” | Assessor-facing narrative. | 65–69.99% emits warning-only text; 70%+ emits recommendation wording and preserves human review. |
| `server/assessment-processor.ts` | Direct `0.7` concern. | Legacy recommendation concern. | Uses the named 70% recommendation threshold and human-review wording. |
| `server/reporting/costDecisionPresentation.ts` | No warning-only report verdict. | Rendered report contract. | Maps the warning to **“Approaching write-off territory — review required”**, distinct from **“Economic write-off recommended.”** |
| `ForensicDecisionPanel.tsx` | A green/red 70% UI split. | Live operational UI. | Uses green repair, amber 65% warning, and red 70% recommendation display states and markers. |
| `ReportComponents.tsx` | One 70% chart line. | Report visual. | Renders distinct 65% review-warning and 70% recommendation markers with different explanatory text. |

## Legacy 65% Test Intent

The six legacy R-E-01 expectations were not changed mechanically. The old 65% and 67% “economic write-off” assertions were actually testing escalation/attention behavior and now assert **warning**. The old 64% assertion remains **repair**. The old 70% assertion remains a **recommendation**. The two 67% narrative assertions now verify warning copy and explicitly reject recommendation status.

## Verification

The reconstructed focused suite passed **33/33 tests across 5 files**, including an executable UI/report contract that proves a 65% input produces a review-only verdict and a 70% input produces a different recommendation verdict. The bundled server build and Vite production build both passed. No schema, migration, DDL, data, payment, settlement, or automatic decision behavior was changed.

The separate **75%** learning-only `COST_TIER_TOTAL_LOSS_THRESHOLD` remains unchanged. It is a benchmarking classification threshold, not an assessor-facing warning or write-off recommendation.
