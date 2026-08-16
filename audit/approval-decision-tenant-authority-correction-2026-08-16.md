# Approval Decision Tenant Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

## Finding

The approval-decision mutation checked the actor stage role and tenant-scoped approval history, but it never established that the target claim belonged to the actor tenant before querying blocking annotations, inserting an approval, reading claim context, or issuing notifications. It also notified every user holding the next insurer role across all tenants.

## Correction

Approval decision now resolves the target claim by exact ID and actor tenant before annotation reads, approval writes, claim-context reads, or notification work. The claim context query is tenant-scoped. Next-stage notifications now select recipients by both insurer role and tenant. Administrative stage override uses the shared `isAdminRole()` contract.

## Verification

The deterministic regression passed **2/2**, proving tenant-owned claim preconditions and tenant-scoped next-stage recipient selection. The bundled server and Vite production build passed; Vite emitted only the existing large-chunk advisory.

No approval, claim, annotation, notification, policy, payment, settlement, or financial record changed.

## References

1. [Approval router](../server/routers/approval.ts)
2. [Tenant-authority regression](../server/approvalDecisionTenantAuthority.p0.test.ts)
