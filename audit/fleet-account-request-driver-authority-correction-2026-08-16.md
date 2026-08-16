# Fleet Account Request and Driver Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

## Finding

Fleet-manager approval and rejection procedures accepted a numeric request ID without binding the request to the reviewing insurer tenant. Claim-review flags accepted an arbitrary claim ID for any fleet manager. Driver creation accepted an arbitrary fleet account ID for any authenticated tenant user. These paths could create foreign role, account-verification, audit, notification, or driver-assignment side effects.

## Correction

Approval and rejection now resolve a manager request through its linked fleet account and require that account's linked insurer tenant to equal the reviewing user's session tenant. Request and fleet-account writes retain the same relationship. Claim flags resolve the claim through a fleet account owned by the calling fleet manager before audit or notification. Driver creation requires fleet-manager/fleet-admin role and an account owned by the caller before inserting a driver.

## Verification

The deterministic authority regression passed **2/2**. It proves that review paths require the linked insurer tenant and that claim flags and driver creation require the manager-owned fleet relationship. The bundled server and Vite production build passed; Vite emitted only the existing large-chunk advisory. No fleet account, manager request, driver, claim, policy, payment, settlement, or financial record changed.

## References

1. [Fleet accounts router](../server/routers/fleet-accounts.ts)
2. [Authority regression](../server/fleetAccountRequestAuthority.p1.test.ts)
