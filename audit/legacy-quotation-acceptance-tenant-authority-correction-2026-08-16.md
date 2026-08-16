# Legacy Quotation Acceptance Tenant Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

## Finding

The legacy client quote-acceptance procedure checked customer ownership after retrieving a quotation request by numeric ID alone. Its accepted-status update also used the numeric request ID alone. A tenant boundary must be enforced before the ownership check and retained at the status-write boundary before an acceptance notification can lead to downstream policy-adjacent action.

## Correction

Quote acceptance now requires a session tenant. The quotation request is resolved by request ID and tenant ID before customer ownership, quoted-status, or expiry checks. The accepted-status update repeats both predicates before the agent notification path. A foreign request is not enumerated and cannot reach notification or further workflow activity.

## Verification

The deterministic tenant-authority regression passed **1/1**, proving the session tenant is required and retained on both the target lookup and final status write before notification. The bundled server and Vite production build passed; Vite emitted only the existing large-chunk advisory.

No quotation, policy, premium, commission, notification, payment, settlement, claim, or financial record changed.

## References

1. [Legacy insurance phase router](../server/routers/insurance-phase7.ts)
2. [Tenant-authority regression](../server/legacyQuoteAcceptanceTenantAuthority.p1.test.ts)
