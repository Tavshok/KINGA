# Fleet Maintenance and Marketplace Tenant Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

Fleet maintenance schedule creation, service records, and service requests now resolve a tenant-owned vehicle and managed fleet before writing. Static tenant fallbacks are removed from maintenance and marketplace writes. Marketplace request, quote, acceptance, and completion helpers now carry tenant scope and retain tenant predicates through lifecycle updates. The focused regression passed **2/2**; bundled server and Vite builds passed with only the existing large-chunk advisory. No fleet, vehicle, maintenance, service request, quote, provider, policy, payment, settlement, or financial record changed.

## References

1. [Fleet core router](../server/routers/fleet-core.ts)
2. [Marketplace helper](../server/fleet/service-marketplace.ts)
3. [P0 regression](../server/fleetMarketplaceTenantAuthority.p0.test.ts)
