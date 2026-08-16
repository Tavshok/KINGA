# Claim Comment Read Tenant Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

Comment-list, notification, unread-count, and mark-all-read paths now require a session tenant rather than using an empty fallback. The comment-list helper requires tenant scope, filters root comments by comment and parent claim tenant, and filters replies by tenant. Notification helpers retain the required tenant. The focused regression passed **1/1**; bundled server and Vite builds passed with only the existing large-chunk advisory. No comment, notification, claim, policy, payment, settlement, or financial record changed.

## References

1. [Claim comments router](../server/routers/claimComments.ts)
2. [Claim comments database helper](../server/claim-comments-db.ts)
3. [P1 regression](../server/claimCommentReadTenantAuthority.p1.test.ts)
