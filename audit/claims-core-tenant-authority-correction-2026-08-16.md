# Claims-Core Tenant Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

## Finding

Several high-impact claims-core procedures accepted a numeric claim ID without resolving it under the caller's tenant. Policy verification, adjuster sign-off read/write, dispute evidence read, payment authorisation, claim rejection, and insurer override could therefore address a foreign claim. Claimant settlement acceptance and dispute initiation had claimant-ID checks, but their initial claim lookup and final workflow update also lacked tenant predicates.

## Correction

A shared `requireTenantScopedClaim` resolver now requires a session tenant and resolves the exact target claim before the affected procedures proceed. Policy verification persists its tenant predicate in `server/db.ts`. Payment authorisation, rejection, insurer override, claimant settlement, and claimant dispute retain both claim ID and tenant ID in their final claim updates. Adjuster sign-off and dispute evidence reads establish the tenant-owned claim before accessing claim-keyed records.

## Verification

The deterministic claims-core authority regression passed **2/2**, proving tenant-owned claim preconditions across policy verification, sign-off, settlement, dispute, payment, rejection, and override actions, plus tenant-bound writes for each workflow mutation. The bundled server and Vite production build passed; Vite emitted only the existing large-chunk advisory.

No claim, policy, payment, settlement, decision, sign-off, dispute, notification, or financial record changed.

## References

1. [Claims core router](../server/routers/claims-core.ts)
2. [Tenant-bound policy verification helper](../server/db.ts)
3. [Claims-core authority regression](../server/claimsCoreTenantAuthority.p0.test.ts)
