# Approval Workflow Tenant Fallback Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

All approval template, status, decision, history, queue, and summary procedures now require a session tenant instead of using a static `default` fallback. Claim approval decisions retain tenant-owned claim resolution before any record write or notification. Template administration also uses the shared administrative role contract. The focused regression passed **2/2**; bundled server and Vite builds passed with only the existing large-chunk advisory. No workflow template, approval, claim, policy, payment, settlement, or financial record changed.

## References

1. [Approval router](../server/routers/approval.ts)
2. [P0 regression](../server/approvalTenantFallbackAuthority.p0.test.ts)
