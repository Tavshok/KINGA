# ML Tenant Fallback Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

ML confidence processing, review-queue listing, and review-queue statistics now require a session tenant rather than use `default`. Direct confidence calculation resolves the requested historical claim in that tenant before scoring. Existing confidence-score and training approval/rejection tenant predicates remain in place. The focused regression passed **2/2**; bundled server and Vite builds passed with only the existing large-chunk advisory. No ML score, review queue, historical claim, policy, payment, settlement, or financial record changed.

## References

1. [ML router](../server/routers/ml.ts)
2. [P0 regression](../server/mlTenantFallbackAuthority.p0.test.ts)
