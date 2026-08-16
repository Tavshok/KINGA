# Claim Completion and Reopening Tenant Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

## Finding

Claim completion and reopening retrieved claims by numeric ID without session-derived tenant scope. Their final closure-tracking writes likewise used the claim ID alone. A user could therefore target a foreign claim's closure or reopening workflow, including downstream damage-history and dataset capture effects after completion.

## Correction

Both workflows now require a tenant-scoped session and resolve the claim by exact ID plus tenant before any status precondition, workflow transition, audit, or downstream action. Their final closure/clear-tracking updates retain both claim ID and tenant ID. Reopening also now uses `isAdminRole()` for consistent administrative-shell admission.

## Verification

The deterministic regression passed **2/2**, proving tenant-owned claim preconditions and tenant-bound final writes for completion and reopening. The bundled server and Vite production build passed; Vite emitted only the existing large-chunk advisory.

No claim, closure state, damage history, dataset, policy, payment, settlement, or financial record changed.

## References

1. [Claim completion router](../server/routers/claim-completion.ts)
2. [Tenant-authority regression](../server/claimCompletionTenantAuthority.p0.test.ts)
