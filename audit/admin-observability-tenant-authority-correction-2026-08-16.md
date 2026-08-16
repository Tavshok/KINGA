# Administrative Observability Tenant Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

Platform observability metric retrieval and collection now require an explicit non-empty tenant input. The prior optional session-tenant argument, which could yield global scope, is removed. `superAdminProcedure` remains the admission boundary, but scope selection is explicit and auditable. The focused regression passed **1/1**; bundled server and Vite builds passed with only the existing large-chunk advisory. No observability metric, claim, assessment, policy, payment, settlement, or financial record changed.

## References

1. [Admin router](../server/routers/admin.ts)
2. [P1 regression](../server/adminObservabilityTenantAuthority.p1.test.ts)
