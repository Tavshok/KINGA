# Claims Assignment Notification Tenant Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

Optional assessor assignment delivery now receives the already resolved insurer tenant directly. The static `default` fallback is removed while the existing tenant-owned claim resolution remains before assignment, transition, notification, or delivery preparation. The focused regression passed **1/1**; bundled server and Vite builds passed with only the existing large-chunk advisory. No claim, assignment, notification, email delivery, policy, payment, settlement, or financial record changed.

## References

1. [Claims core router](../server/routers/claims-core.ts)
2. [P0 regression](../server/claimsAssignmentTenantFallbackAuthority.p0.test.ts)
