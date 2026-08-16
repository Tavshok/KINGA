# Decision Intelligence Tenant Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

## Finding

The decision-intelligence router exposed several claim-derived reads without session tenant scope: decision and contradiction summaries, readiness summaries, decision traces, claim explanations, claim routing, and escalation summaries. An authenticated caller could obtain aggregate samples, fraud/risk context, or a direct explanation/routing outcome for foreign tenant assessments by numeric claim ID.

## Correction

All assessment-backed summary queries now require a session tenant and filter both `ai_assessments` and joined `claims` by that tenant. Direct decision trace, claim explanation, and route-by-ID procedures require the requested claim assessment to match the tenant. The readiness and escalation summaries likewise filter assessment and claim evidence before generating aggregate or per-claim output. Stateless client-supplied analysis utilities remain independent because they do not query stored records.

## Verification

The expanded deterministic regression passed **3/3**, covering decision, contradiction, readiness, explanation, routing, trace, and escalation evidence paths. The bundled server build passed. The Vite production build passed; only existing large-chunk advisories remain.

No decision, claim, assessment, report, policy, payment, settlement, or financial record changed.

## References

1. [Decision router](../server/routers/decision.ts)
2. [Tenant-authority regression](../server/decisionTenantAuthority.p0.test.ts)
