# Fleet Lookup Tenant Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

Direct fleet vehicle lookup now resolves the vehicle then requires authorised fleet access before disclosure. Fleet driver lookup now requires the same access check and retains fleet driver tenant scope. The focused regression passed **1/1**; bundled server and Vite builds passed with only the existing large-chunk advisory. No fleet, vehicle, driver, claim, policy, payment, settlement, or financial record changed.

## References

1. [Fleet core router](../server/routers/fleet-core.ts)
2. [P0 regression](../server/fleetLookupTenantAuthority.p0.test.ts)
