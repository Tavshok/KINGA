# Historical Repair-Item Tenant Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

## Finding

The manual historical repair-item correction accepted a numeric item ID and updated the item, then incremented its parent claim's correction counter, without establishing the authenticated tenant or the parent historical claim relationship. A caller could target a foreign repair-item ID.

## Correction

The procedure now requires the session tenant and resolves the repair item through an inner join to its parent historical claim in that tenant. It returns a non-enumerating not-found result when the item is not in scope. The item update remains bound to the authorised parent claim ID, and the parent manual-correction increment includes both the claim ID and tenant ID at the write boundary.

## Verification

The deterministic regression passed **1/1**, confirming that tenant-owned parent resolution occurs before item update and parent-total mutation. The bundled server and Vite production build passed; Vite emitted only the existing large-chunk advisory. No historical claim, repair item, training record, policy, payment, settlement, or financial record changed.

## References

1. [Historical claims router](../server/routers/historical-claims.ts)
2. [Tenant-authority regression](../server/historicalRepairItemTenantAuthority.p0.test.ts)
