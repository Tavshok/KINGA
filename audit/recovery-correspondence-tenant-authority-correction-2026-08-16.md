# Recovery Correspondence Tenant Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

## Finding

The recovery correspondence entry mutation accepted a case ID and inserted a log record under the caller tenant without proving the target recovery case existed in that tenant. Any authenticated account could create misleading correspondence against a foreign recovery case ID.

## Correction

The mutation now requires a recovery-module role and a session tenant. Before any correspondence insert, it resolves the recovery case by exact case ID and tenant. A foreign or missing case returns a non-enumerating not-found result, so no log or related workflow side effect occurs.

## Verification

The deterministic regression passed **1/1**, proving recovery role admission and exact tenant-scoped case resolution before log insertion. The bundled server and Vite production build passed; Vite emitted only the existing large-chunk advisory.

No recovery case, correspondence entry, claim, policy, payment, settlement, or financial record changed.

## References

1. [Recovery router](../server/routers/recovery.ts)
2. [Tenant-authority regression](../server/recoveryCorrespondenceTenantAuthority.p1.test.ts)
