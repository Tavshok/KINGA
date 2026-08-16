# AI Assessment Governance Tenant Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Partially corrected — primary P0 mutation paths closed

## Finding

The AI assessment-governance module exposed unfiltered assessment enumeration and accepted arbitrary claim IDs for decision snapshot creation, replay, lifecycle retrieval, review, finalisation, and locking. These procedures derived a tenant string but did not establish that the target claim belonged to that tenant before calling snapshot, lifecycle, governance, or audit writers.

## Correction

The assessment batch-export endpoint now requires a session tenant and filters every result by `ai_assessments.tenant_id`. A shared governed-claim resolver requires a tenant-scoped session and resolves the exact claim under that tenant. Snapshot save/read, replay, lifecycle retrieval, review, finalisation, and lock mutations now invoke that resolver before any snapshot read/write, replay log, lifecycle transition, governance audit, or authoritative-snapshot action.

## Verification

The deterministic regression passed **1/1**, proving tenant-filtered enumeration and tenant-owned claim preconditions on the core snapshot/replay/lifecycle mutation paths. The bundled server and Vite production build passed; Vite emitted only the existing large-chunk advisory. No production assessment, snapshot, lifecycle state, claim, policy, payment, settlement, or financial record changed.

## Remaining Qualifier

The lower-risk audit-export and replay-log read helpers remain in the continuing cross-tenant audit queue. They do not mutate lifecycle state, but must receive the same tenant-owned claim precondition before the broader AI assessment-governance finding is considered fully closed.

## References

1. [AI assessment router](../server/routers/ai-assessments-core.ts)
2. [Governance tenant-authority regression](../server/aiAssessmentGovernanceTenantAuthority.p0.test.ts)
