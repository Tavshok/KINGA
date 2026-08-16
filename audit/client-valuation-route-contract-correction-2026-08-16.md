# Client Valuation Route-Contract Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

## Finding

The client-facing `/client/valuation/bulk` page invoked `agency.getValuation` and `agency.bulkValuate`. Those procedures were protected by the agency domain guard. A claimant could enter the client route but could not execute its valuation calls. The procedure namespace also misrepresented a client market-valuation function as an agency function.

## Correction

KINGA now exposes `clientValuation.getMarketValuation` and `clientValuation.bulkMarketValuation`. Both use a customer-domain contract aligned with the client route: claimant, user, fleet customer, and authorised administrative testing roles are admitted; agency is denied. The procedures reuse the market valuation engine as internal logic only and return decision support without writing a policy, insurance-service request, claim, payment, settlement, commission, or other financial record.

The client CSV/single-vehicle page now calls the client contract. The legacy agency valuation engine entry remains separate and is no longer used by the client route.

## Verification

The role-contract regression passed **2/2**: claimant market valuation succeeds and agency access is denied. The bundled server and Vite production build passed; Vite emitted only the existing large-chunk advisory. No database writes are performed by this client valuation contract.

## References

1. [Client valuation router](../server/routers/client-valuation.ts)
2. [Client bulk valuation page](../client/src/pages/BulkValuation.tsx)
3. [Role-contract regression](../server/clientValuationRoleContract.p1.test.ts)
