# Vehicle Registry Strict Tenant Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

## Finding

Vehicle Registry treated missing tenant IDs as implicit broad access. Direct vehicle lookup returned tenantless records, list and claim-history helpers received an undefined tenant, dashboard statistics used an unscoped `1=1` fallback, and manual flag updates allowed tenantless records while issuing the final update by vehicle ID alone.

## Correction

Every exposed Vehicle Registry path now requires a session tenant. Direct ID and VIN/registration lookups require the record tenant to exactly match it. Claim history, list, and high-risk list always receive that tenant. Statistics has no `1=1` fallback. Manual flag updates reject tenantless/foreign records and retain both vehicle ID and tenant ID in the final update predicate.

## Verification

The deterministic regression passed **2/2**, proving strict tenant requirements on every exposed read surface, absence of the unscoped statistics fallback, and a tenant-bound final flag write. The bundled server and Vite production build passed; Vite emitted only existing large-chunk advisories.

No vehicle, risk flag, claim, policy, payment, settlement, or financial record changed.

## References

1. [Vehicle Registry router](../server/routers/vehicle-registry.ts)
2. [Tenant-authority regression](../server/vehicleRegistryTenantAuthority.p1.test.ts)
