# Intake Auto-Assignment Statistics Tenant Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

Auto-assignment statistics now require a session tenant and join audit-trail rows to their parent claims before counting events. The count is restricted to the parent claim's tenant. The focused regression passed **1/1**; bundled server and Vite builds passed with only the existing large-chunk advisory. No audit, claim, policy, payment, settlement, or financial record changed.

## References

1. [Intake gate router](../server/routers/intake-gate.ts)
2. [P0 regression](../server/intakeAutoAssignStatsTenantAuthority.p0.test.ts)
