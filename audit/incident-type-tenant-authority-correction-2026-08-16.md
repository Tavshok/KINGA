# Incident Type Override Tenant Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

Incident-type override and override-status retrieval now require a session tenant for every role. Administrative admission uses `isAdminRole()` and does not remove object tenant scope. Claim and AI assessment reads retain the tenant; the final claim update retains claim ID plus tenant. The focused regression passed **1/1**; bundled server and Vite builds passed with only the existing large-chunk advisory. No claim, assessment, audit, policy, payment, settlement, or financial record changed.

## References

1. [Legacy root router](../server/routers.ts)
2. [P0 regression](../server/incidentTypeTenantAuthority.p0.test.ts)
