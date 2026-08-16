# Vehicle Damage History Tenant Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

## Finding

The claim-scoped vehicle damage-history procedure read records using a caller-supplied claim identifier without a tenant or parent-claim check. Other vehicle, zone, repeat-zone, and aggregate dashboard paths treated tenant scope as optional and could fall back to unrestricted reads.

## Correction

All exposed damage-history reads now require the authenticated session tenant. Claim history resolves the parent claim inside that tenant before reading history. Shared read helpers require a tenant argument and preserve it in vehicle, claim, zone, and repeat-zone predicates. Dashboard aggregate SQL now receives a mandatory parameterised tenant condition; its `1=1` fallback is removed.

## Verification

The deterministic regression passed **2/2**, covering foreign claim denial, mandatory tenant scope through all helper reads, and tenant-bound aggregate SQL. Bundled server and Vite production builds passed. Vite emitted only the pre-existing large-chunk advisory.

No vehicle, damage history, claim, fraud, policy, payment, settlement, or financial record changed.

## References

1. [Vehicle damage history router](../server/routers/vehicle-damage-history.ts)
2. [Vehicle damage history helper](../server/vehicle-damage-history.ts)
3. [P1 tenant-authority regression](../server/vehicleDamageHistoryTenantAuthority.p1.test.ts)
