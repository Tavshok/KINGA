# Global Search Fleet Tenant Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

Non-platform global search now requires a session tenant. Fleet-role claim search always applies that tenant predicate; the `1=1` fallback is removed. The focused regression passed **1/1**; bundled server and Vite builds passed with only the existing large-chunk advisory. No search history, claim, policy, payment, settlement, or financial record changed.

## References

1. [Global search router](../server/routers/global-search.ts)
2. [P0 regression](../server/globalSearchFleetTenantAuthority.p0.test.ts)
