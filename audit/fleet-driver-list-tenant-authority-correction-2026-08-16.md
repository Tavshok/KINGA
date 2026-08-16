# Fleet Core Driver List Tenant Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

Fleet management and read access now require a session tenant before resolving the fleet. Driver assignments, fleet lookup, fleet-specific driver lists, owned-fleet lists, and owner-scoped driver lists retain explicit tenant predicates. The `fleet.tenantId ?? sessionTenant ?? ""` fallback is removed. The focused regression passed **1/1**; bundled server and Vite builds passed with only the existing large-chunk advisory. No fleet, driver, vehicle, claim, policy, payment, settlement, or financial record changed.

## References

1. [Fleet Core router](../server/routers/fleet-core.ts)
2. [P1 regression](../server/fleetDriverListTenantAuthority.p1.test.ts)
