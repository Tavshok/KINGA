# Vehicle Valuation Core Tenant Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

## Finding

Vehicle valuation detail, mismatch-annotation statistics, narrative history, and mismatch annotation writes accepted claim or assessment identifiers without first proving tenant ownership. The trigger path also permitted administrative lookup without a session tenant and updated the claim market-value field by claim identifier without retaining the tenant predicate.

## Correction

The router now uses shared tenant-required claim and assessment resolvers. Valuation detail and annotation statistics resolve their target claim inside the session tenant. Annotation writes require both the tenant-owned claim and a matching tenant-owned assessment. Narrative history requires a tenant-owned assessment. The valuation trigger derives tenant scope from the session and retains tenant scope on the market-value claim update.

## Verification

The deterministic regression passed **2/2**, covering claim and assessment target resolution, annotation/statistics/narrative access, and tenant-retaining claim updates. Bundled server and Vite production builds passed. Vite emitted only the pre-existing large-chunk advisory.

No valuation, claim, assessment, annotation, policy, payment, settlement, or financial record changed.

## References

1. [Vehicle valuation core router](../server/routers/vehicle-valuation-core.ts)
2. [P1 tenant-authority regression](../server/vehicleValuationCoreTenantAuthority.p1.test.ts)
