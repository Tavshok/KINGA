# Vehicle Passport Latest Snapshot Tenant Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

## Finding

The cached latest Vehicle Passport snapshot endpoint accepted a vehicle ID and queried snapshot rows with a tenantless `1=1` fallback whenever a session had no tenant. It did not invoke the existing vehicle-passport access boundary, which supports same-tenant ownership plus an explicitly authorised insurer-invitation evidence exception.

## Correction

The endpoint now requires a session tenant, resolves the vehicle, and invokes `canAccessVehiclePassport` before any snapshot read. The snapshot query always includes the caller tenant; the tenantless fallback is removed. A missing or inaccessible vehicle returns a non-enumerating not-found result.

## Verification

The deterministic regression passed **2/2**, proving a tenant is required, the canonical vehicle access boundary executes before evidence reads, and the tenantless query fallback is absent. The bundled server and Vite production build passed; Vite emitted only the existing large-chunk advisory.

No vehicle, snapshot, condition record, claim, policy, payment, settlement, or financial record changed.

## References

1. [Vehicle passport router](../server/routers/vehicle-passport.ts)
2. [Tenant-authority regression](../server/vehiclePassportSnapshotTenantAuthority.p0.test.ts)
