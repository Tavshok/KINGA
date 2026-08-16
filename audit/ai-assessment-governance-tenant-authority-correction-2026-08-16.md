# AI Assessment Governance Tenant Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

## Finding

The AI assessment-governance module exposed unfiltered assessment enumeration and accepted arbitrary claim IDs for decision snapshot creation, replay, lifecycle retrieval, review, finalisation, and locking. These procedures derived a tenant string but did not establish that the target claim belonged to that tenant before calling snapshot, lifecycle, governance, or audit writers.

## Correction

The assessment batch-export endpoint now requires a session tenant and filters every result by `ai_assessments.tenant_id`. A shared governed-claim resolver requires a tenant-scoped session and resolves the exact claim under that tenant. Snapshot save/read/history, replay, replay-log read, lifecycle retrieval, review, finalisation, lock mutations, governance audit log/export/validation reads now invoke that resolver before any snapshot read/write, replay log, lifecycle transition, governance audit, or authoritative-snapshot action. Output validation no longer bypasses tenant scope for administrative users.

## Verification

The expanded deterministic regression passed **1/1**, proving tenant-filtered enumeration, tenant-owned claim preconditions on the core snapshot/replay/lifecycle paths, and tenant-bound audit/export/replay/snapshot/validation reads. No production assessment, snapshot, lifecycle state, claim, policy, payment, settlement, or financial record changed.

## References

1. [AI assessment router](../server/routers/ai-assessments-core.ts)
2. [Governance tenant-authority regression](../server/aiAssessmentGovernanceTenantAuthority.p0.test.ts)
