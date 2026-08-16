# Intake-Gate Tenant Write Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

## Finding

The intake-gate escalation and emergency override procedures correctly resolved the target claim within the caller tenant, but their later update predicates used only the numeric claim ID. A target record must remain tenant-scoped at the write boundary, not only during the precheck, so that any record change between read and write cannot expand the mutation scope.

## Correction

Both claim updates now require the exact claim ID and the authenticated user's tenant. The escalation update cannot set `earlyFraudSuspicion`, and the override cannot change `workflowState`, unless the claim still belongs to the actor tenant at write time.

## Verification

The deterministic regression passed **1/1** and asserts the tenant predicate remains in both escalation and override write paths. No claim, workflow, escalation flag, policy, payment, settlement, or financial record changed.

## References

1. [Intake-gate router](../server/routers/intake-gate.ts)
2. [Tenant-write regression](../server/intakeGateTenantWriteAuthority.p0.test.ts)
