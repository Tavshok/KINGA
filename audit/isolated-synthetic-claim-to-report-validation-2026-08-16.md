# Isolated Synthetic Claim-to-Report Validation

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Passed — controlled degraded-evidence path

## Scope

This operational acceptance test used a fresh, random `test-oat-*` tenant, a synthetic claimant, a synthetic vehicle registration, and a one-pixel synthetic PNG stored under an isolated evidence key. It did not use a customer, repairer, policy, quotation, payment, settlement, or production claim.

The objective was to exercise the actual intake evidence persistence, assessment trigger, pipeline lifecycle, report rendering, and cleanup path. It was intentionally **not** a vehicle-damage intelligence quality test: the one-pixel image provides insufficient vehicle evidence and should therefore produce a qualified, review-bound outcome rather than fabricated damage or repair intelligence.

## Result

| Check | Result |
|---|---|
| Isolated claim and evidence persistence | Passed; the stored synthetic evidence reference remained attached to the tenant-scoped claim before and after pipeline execution. |
| Assessment trigger and pipeline execution | Passed; Pipeline V2 executed through its actual stages in approximately 39 seconds. |
| Evidence-quality handling | Passed; extraction, validation, assembly, damage, cost, turnaround, and report stages correctly recorded degraded evidence where the synthetic image could not support vehicle intelligence. |
| Decision boundary | Passed; pipeline output retained `decisionAuthority=REVIEW` and `reportReadiness=HOLD`; no payable or settlement conclusion was produced. |
| CL output | Passed; actual Claim Assessment report HTML rendered. |
| CI output | Passed; actual Claims Intelligence report HTML rendered. |
| FR output | Passed; actual Forensic Claim Decision report HTML rendered. |
| Synthetic data cleanup | Passed; final database verification found zero synthetic claims, users, pipeline runs, and vehicle-registry records. |

## Controlled Interpretation

The validation establishes that an isolated submission can persist evidence, enter the live assessment pipeline, reach a controlled evidence-qualified result, and still render all three report surfaces. It does **not** establish that a deliberately non-vehicle one-pixel image can produce an assessment-complete cost or repair recommendation; that would be an incorrect expectation. The `REVIEW`/`HOLD` outcome is the required safety behaviour for insufficient evidence.

## Automated Evidence

The acceptance is implemented in `server/isolated-claim-to-report.oat.test.ts`. It creates a fresh tenant per run, executes the actual pipeline and report generators, and removes all test-created database records in `afterAll`. The final direct cleanup verification returned zero rows for the synthetic claim, user, pipeline-run, and vehicle-registration prefixes.

## References

1. [Operational acceptance test](../server/isolated-claim-to-report.oat.test.ts)
2. [Lifecycle contract](../server/claim-lifecycle-contract.test.ts)
3. [Claims Intelligence generator](../server/reporting/claimsIntelligenceReport.ts)
4. [Forensic Claim Decision generator](../server/reporting/forensicDecisionReport.ts)
