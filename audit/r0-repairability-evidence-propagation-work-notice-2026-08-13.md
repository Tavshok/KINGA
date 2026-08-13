# R0 Repairability Evidence Propagation Work Notice

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 13 August 2026  
**Status:** Proposed — no implementation authorised by this notice

## 1. Purpose

KINGA now presents **Repairability** as a distinct verdict alongside Submitted Quotations, KINGA Quote Verification, KINGA Optimised Quote, and concrete Quote Issues. The shared verdict contract supports four outcomes:

| Verdict | Meaning |
|---|---|
| Repairable | The recorded repair-versus-replace evidence does not indicate total loss, a material repairability condition, or structural review need. |
| Repairable with conditions | Explicit repair-to-value or repair-versus-replace evidence requires a qualified repairability conclusion. |
| Further structural review required | Explicit persisted structural-review evidence requires inspection or engineering review before final repairability conclusion. |
| Total loss indicated | An explicit recorded total-loss indication exists. |

The present shared resolver supports the full taxonomy. However, the primary report and client callers currently pass explicit total-loss and repair-to-value evidence but do not consistently propagate a persisted structural-review signal and rationale. Therefore the third outcome must not be presented as available merely because the taxonomy exists.

## 2. Proposed Scope

The approved implementation would trace existing persisted structural-review evidence from the claim assessment and repair-intelligence outputs into the shared report decision contract. It would then expose the **Further structural review required** verdict only where explicit evidence and a source rationale exist.

The work includes Claims Ledger, Claims Intelligence, Forensic Decision Report, and the client top-cost view. Each surface would show the same verdict label, while detailed reports retain the source rationale in their repair-analysis section. The client view would remain concise and would not expose technical confidence scores or raw engineering diagnostics.

| Control | Required behaviour |
|---|---|
| Evidence source | Use only explicit persisted structural-review, structural-damage inspection, or recorded engineering-review evidence. |
| Verdict trigger | Set **Further structural review required** only when that evidence is present and source-labelled. |
| Missing evidence | Do not infer structural review from quote price, L2 value, repair-to-value ratio, image assumptions, or a generic damage description. |
| Total loss | Preserve the existing explicit total-loss indication as a distinct outcome. |
| Detail | Retain a bounded evidence rationale in professional report detail; client summary remains plain-language. |
| Cross-surface consistency | CL, CI, FR, and client render the same underlying verdict for the same evidence snapshot. |

## 3. Exclusions

This work must not create a structural-review finding, change an assessment, alter repair scope, change a quote, produce a repair cost, revise a policy, premium, settlement, payment, or claim workflow decision. It does not introduce an arbitrary repair-to-value or damage-severity threshold.

## 4. Acceptance Criteria

The implementation is complete only when the following no-write regression evidence exists:

| Scenario | Required outcome |
|---|---|
| Explicit total-loss indication | **Total loss indicated** appears consistently on every approved surface. |
| Explicit conditional repair evidence | **Repairable with conditions** appears consistently. |
| Explicit persisted structural-review evidence plus rationale | **Further structural review required** appears with a bounded source rationale. |
| No structural evidence | No structural-review verdict is inferred. |
| Same evidence snapshot | CL, CI, FR, and client resolve the same repairability verdict. |
| Monetary isolation | Repairability does not change submitted quotes, KINGA Optimised Quote, L2 eligibility, savings, settlement, or policy outcomes. |

## 5. Decision Required

> Approve only the propagation and presentation of existing explicit structural-review evidence. Any proposal to create new structural-review rules, thresholds, scoring, or operational workflows requires a separate work notice and approval.
