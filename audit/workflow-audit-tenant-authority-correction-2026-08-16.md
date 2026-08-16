# Workflow Audit Tenant Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

## Finding

Workflow audit procedures accepted an arbitrary claim identifier without establishing a session tenant or verifying that the target claim belonged to the caller's tenant. The transition logging utility inserted audit entries directly, claim state updates read and wrote by claim identifier alone, and workflow history read audit rows by claim identifier alone.

## Correction

The router now requires a session tenant before every transition, claim update, or history request. The shared workflow utility requires `tenantId` in its transition contract. Transition logging resolves the parent claim inside the tenant before insertion. Atomic claim updates retain the claim ID and tenant predicate for the original read, final update, and re-read. History joins the parent claim and filters it by tenant.

## Verification

The deterministic regression passed **2/2**, covering router tenant derivation, tenant propagation to utilities, transition logging, atomic updates, and history reads. Bundled server and Vite production builds passed. Vite emitted only the pre-existing large-chunk advisory.

No claim, workflow transition, audit record, policy, payment, settlement, or financial record changed.

## References

1. [Workflow audit router](../server/routers/workflow-audit.ts)
2. [Workflow audit utility](../server/utils/workflow-audit.ts)
3. [P1 tenant-authority regression](../server/workflowAuditTenantAuthority.p1.test.ts)
