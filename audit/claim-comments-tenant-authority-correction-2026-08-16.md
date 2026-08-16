# Claim Comments Tenant Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

Claim comment submission now requires a session tenant and resolves the target claim with both claim ID and tenant before writing the comment or notifying recipients. The regression passed **1/1**; bundled server and Vite builds passed with only the existing large-chunk advisory. No comment, claim, notification, policy, payment, settlement, or financial record changed.

## References

1. [Claim comments router](../server/routers/claimComments.ts)
2. [P0 regression](../server/claimCommentsTenantAuthority.p0.test.ts)
