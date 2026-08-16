# Driver Registry Tenant Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

## Findings

Driver Registry direct reads, claim-history reads, claim-linked driver reads, high-risk lists, dashboard statistics, staged-accident flags, manual enrichment, and paginated lists did not require a session tenant consistently. Several used an unscoped fallback. The pipeline driver matching helper accepted a tenant but ignored it while matching licence/name/email/phone, updating driver aggregates, handling duplicate licence fallback, and linking drivers to claims. A claim could therefore reuse or mutate another tenant's driver record.

## Correction

The router now requires a session tenant for every exposed path. Direct driver lookup, licence lookup, history, high-risk/dashboard/list evidence, and final driver writes are tenant-scoped. Claim driver lookup verifies the parent claim tenant before linking driver records.

Pipeline matching now requires a non-empty tenant and applies it to every deduplication lookup, duplicate fallback, enrichment update, driver aggregate update, and claim link. Shared query helpers now require tenant parameters instead of optional scope.

## Verification

The deterministic regression passed **2/2**, proving strict session tenant across direct router targets and tenant preservation throughout pipeline matching and aggregate writes. The bundled server and Vite production build passed; Vite emitted only existing large-chunk advisories.

No driver, driver-claim link, risk flag, claim, policy, payment, settlement, or financial record changed.

## References

1. [Driver registry router](../server/routers/driver-registry.ts)
2. [Driver registry helpers](../server/driver-registry.ts)
3. [Tenant-authority regression](../server/driverRegistryTenantAuthority.p0.test.ts)
