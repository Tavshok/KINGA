# KINGA L2 and Cost-Decision Boundary Audit

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 15 August 2026  
**Status:** Completed no-write audit  
**Scope:** Deterministic quotation-evidence and publication-contract validation. No live claim, quotation, assessment, workflow, policy, payment, settlement, or calculation logic was changed.

## Boundary Principle

The audit confirms that KINGA preserves submitted evidence and distinguishes it from a payable recommendation. A complete, equivalent, source-backed all-in scope may publish a KINGA Optimised Quote. Where that basis is absent, the system retains useful source history or partial evidence but presents human review rather than inventing a price, savings, settlement conclusion, tax, labour, or fee.

> **Decision boundary:** A lower number does not become L2 merely because it is lower. It must be traceable submitted evidence, equivalent in scope and tax basis, and eligible for the relevant decision.

## Executed Matrix

| Evidence state | Calculation and evidence outcome | Publication outcome | Classification |
|---|---|---|---|
| No quotation | No L1/L2 source basis | Quotation required; human review; no amount or savings | Intended |
| Total-only quotation | Whole-quote comparison history retained; no submitted component scope | Scope-gap review; no payable L2 or savings | Intended |
| Incomplete itemised scope | Submitted priced scope remains traceable; missing component is named | Review-required, not-all-in evidence; no savings or decision approval | Intended |
| Complete all-in scope | Eligible complete L2 calculated from payable submitted rows | Complete KINGA Optimised Quote; only complete scope can proceed to approval | Intended |
| Source-to-ledger conflict | Lower structured value classified `source_to_ledger_mismatch` / extraction defect and excluded; verified equivalent source value retained | No fraud conclusion follows from the variance | Intended |
| Different tax basis or repair scope | Lower incompatible record excluded from like-for-like selection | No artificial lower L2; qualified evidence remains reviewable | Intended |
| Explicit VAT and workshop fee | Explicitly submitted payable rows retained in the all-in basis | No tax or fee is invented; complete all-in L2 remains supported only by submitted rows | Intended |

## Finding Classification

No L2 formula, evidence-authority, or publication-boundary defect was reproduced in the audited states. The test assertions confirmed that source-versus-ledger mismatches are extraction defects rather than price or fraud conclusions, and that tax-basis/scope mismatches cannot displace an eligible like-for-like submitted amount.

During the no-write audit, the development runtime reported `ReferenceError: getTenantRates is not defined` from `server/db.ts` while attempting to load optional tenant rate overrides. Static inspection confirmed that `getTenantRates` is exported by `server/db/intelligence-db.ts` but is not imported by `server/db.ts`. The exception is currently caught and the assessment continues with defaults, but configured tenant rates are not loaded on that path. This is recorded as **AUD-P1-016** for a separately approved correction because changing the import alters live rate-configuration availability; it is not part of this audit-only batch.

## Executable Evidence

The added [`server/reporting/l2DecisionBoundaryAudit.p1.test.ts`](../server/reporting/l2DecisionBoundaryAudit.p1.test.ts) combines the immutable R0 quote-state model, source-evidence eligibility, source-to-ledger reconciliation, shared report cost integrity, cost-decision publication contract, and actual composite all-in calculation.

| Validation command | Result |
|---|---|
| Boundary regression group | 7 files, 62 tests passed |
| Bundled server build | Passed |
| Vite production build | Passed; existing large-chunk warning only |

## Conclusion

All seven approved quotation-evidence states are classified as **intended**. The audit confirms that useful information is retained without permitting unsupported amounts to become L1/L2, savings, approval, or settlement-facing conclusions. The optional tenant-rate loader reference failure is separately logged for controlled remediation.

## References

1. [Shared cost-decision presentation contract](../shared/costDecisionPresentation.ts)
2. [Report cost-integrity projection](../server/reporting/costIntegrity.ts)
3. [Evidence eligibility gate](../server/evidence-governance/evidenceEligibility.ts)
4. [Source-evidence reconciliation builder](../server/evidence-governance/sourceEvidenceBuilder.ts)
5. [No-write boundary audit suite](../server/reporting/l2DecisionBoundaryAudit.p1.test.ts)
