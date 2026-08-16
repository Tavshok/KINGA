# Fleet Core Tenant Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

Fleet creation and vehicle registration now require a session tenant rather than use the default tenant. Bulk vehicle imports now require both a session tenant and managed-fleet authority before parsing or inserting records. The focused regression passed **2/2**; bundled server and Vite builds passed with only the existing large-chunk advisory. No fleet, vehicle, driver, claim, policy, payment, settlement, or financial record changed.

## References

1. [Fleet core router](../server/routers/fleet-core.ts)
2. [P0 regression](../server/fleetCoreTenantAuthority.p0.test.ts)
