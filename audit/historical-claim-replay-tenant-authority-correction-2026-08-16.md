# Historical Claim Replay Tenant Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

## Finding

Single and batch historical replay procedures called the replay service with a numeric historical claim ID only. The service then loaded the claim, replay-version history, and final historical-claim tracking row by ID alone. An authorised user could initiate replay or consume historical evidence from a foreign tenant, including replay-result and learning side effects.

## Correction

Replay now requires a session tenant in middleware. Single and batch replay resolve each historical claim by ID plus tenant before starting service work. The service accepts the tenant explicitly and retains it on historical-claim lookup, replay-version history, and final replay-tracking update predicates. The existing replay result insert remains tenant-tagged from the resolved claim.

## Verification

The deterministic regression passed **2/2**, proving tenant-owned preconditions for single and batch replay plus tenant predicates in replay history and final tracking writes. The bundled server and Vite production build passed; Vite emitted only existing large-chunk advisories.

No historical claim, replay result, learning output, claim, policy, payment, settlement, or financial record changed.

## References

1. [Claim replay router](../server/routers/claim-replay.ts)
2. [Replay comparison service](../server/services/claim-replay-comparison.ts)
3. [Tenant-authority regression](../server/claimReplayTenantAuthority.p0.test.ts)
