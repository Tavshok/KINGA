# ML Tenant Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

ML confidence-score retrieval now joins its historical claim and requires that claim to be in the session tenant. Training approval and rejection updates retain both the historical claim identifier and review-queue tenant predicate. The focused regression passed **2/2**; bundled server and Vite builds passed with only the existing large-chunk advisory. No training, historical claim, policy, payment, settlement, or financial record changed.

## References

1. [ML router](../server/routers/ml.ts)
2. [P0 regression](../server/mlTenantAuthority.p0.test.ts)
