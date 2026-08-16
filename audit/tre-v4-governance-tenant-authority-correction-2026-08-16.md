# TRE v4 Governance Tenant Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

TRE v4 now requires a session tenant and resolves claim or assessment targets inside that tenant before exposing event-bus evidence, impact analysis, conflict queue actions, human-review requests, SLA operations, simulations, and the Trust API. The enterprise dashboard filters assessment evidence by session tenant. The focused regression passed **2/2**; bundled server and Vite builds passed with only the existing large-chunk advisory. No trust event, task, review, SLA, simulation, claim, assessment, policy, payment, settlement, or financial record changed.

## References

1. [TRE v4 governance router](../server/routers/tre-v4-governance.ts)
2. [P0 regression](../server/treV4GovernanceTenantAuthority.p0.test.ts)
