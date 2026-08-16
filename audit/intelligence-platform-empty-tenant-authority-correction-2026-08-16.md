# Intelligence Platform Empty-Tenant Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

Every protected intelligence-platform procedure now passes through a shared router-level admission boundary that requires a session tenant before any legacy predicate can evaluate. This prevents the prior empty-string tenant fallback from allowing tenantless execution across cross-module, fleet, engineering, timeline, portfolio, and predictive intelligence reads. The focused regression passed **1/1**; bundled server and Vite builds passed with only the existing large-chunk advisory. No intelligence, claim, assessment, fleet, inspection, policy, payment, settlement, or financial record changed.

## References

1. [Intelligence platform router](../server/routers/intelligence-platform.ts)
2. [P0 regression](../server/intelligencePlatformEmptyTenantAuthority.p0.test.ts)
