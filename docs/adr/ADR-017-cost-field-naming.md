# ADR-017: Cost Field Canonical Naming

**Status:** Accepted
**Author:** Tavonga Shoko, Lead Engineer
**Date:** 2026-Q3

## Context

The quote optimisation engine writes the KINGA Optimised cost figure to `costIntelligenceJson` in the `ai_assessments` table. The field was originally named `compositeOptimisedCostUsd` in the engine code, but the actual field written to the DB was `l2CompositeOptimisedCostUsd` (the L2 composite optimised figure). This mismatch caused all three report generators to display $0.00 for KINGA Optimised.

## Decision

The canonical field name for the KINGA Optimised cost is `l2CompositeOptimisedCostUsd` in `costIntelligenceJson.compositeOptimisation`. This is the field written by `buildCompositeQuote()` in `quoteOptimisationEngine.ts`. All report generators must read from this field. The field name `compositeOptimisedCostUsd` does not exist in DB data and must never be used.

## Consequences

**Positive:** All three reports now display the correct KINGA Optimised figure. The field name is documented and enforced.

**Negative:** Any future refactor of the field name must update all three report generators simultaneously.

## Related Components

`server/pipeline-v2/quoteOptimisationEngine.ts`, `server/reporting/reportDefinitions.ts`, `server/reporting/claimsIntelligenceReport.ts`, `server/reporting/forensicDecisionReport.ts`
