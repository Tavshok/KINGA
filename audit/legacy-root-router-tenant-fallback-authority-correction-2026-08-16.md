# Legacy Root Router Tenant Fallback Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

The legacy assessor-evaluation lookup and police-report creation routes no longer remove claim tenant scope for administrative roles or use a static `default` tenant. Administrative admission uses `isAdminRole()`, every target claim is resolved with the session tenant, and downstream evidence follows that scope. The focused regression passed **1/1**; bundled server and Vite builds passed with only the existing large-chunk advisory. No claim, evaluation, police report, assessment, audit, policy, payment, settlement, or financial record changed.

## References

1. [Legacy root router](../server/routers.ts)
2. [P0 regression](../server/legacyRootRouterTenantFallbackAuthority.p0.test.ts)
