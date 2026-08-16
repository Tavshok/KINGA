# Exception Intelligence Tenant Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

## Finding

Exception queue, aggregate, drift, and recommendation procedures accepted an optional caller-supplied tenant selector. For administrative users, omitting that selector removed the tenant predicate entirely. The queue and aggregate joins also did not verify that the joined parent claim belonged to the same scope as the assessment.

## Correction

All four procedures now derive a mandatory tenant from the authenticated session. The input tenant selector and administrative unscoped fallback are removed. Queue and aggregate reads apply both assessment and parent-claim tenant predicates. Drift comparisons bind their current and previous assessment windows to the same tenant. Recommendation analytics are bound to the tenant at the assessment read.

## Verification

The deterministic regression passed **2/2**, covering session-derived queue/aggregate scope, parent-claim scope, drift window scope, recommendation scope, and the absence of optional tenant patterns. Bundled server and Vite production builds passed. Vite emitted only the pre-existing large-chunk advisory.

No exception, assessment, claim, workflow, fraud, policy, payment, settlement, or financial record changed.

## References

1. [Exception intelligence router](../server/routers/exception-intelligence.ts)
2. [P1 tenant-authority regression](../server/exceptionIntelligenceTenantAuthority.p1.test.ts)
