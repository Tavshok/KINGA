# R0 Rendered-Report Combined Acceptance Work Notice

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 13 August 2026  
**Status:** Proposed — no implementation authorised by this notice

## Purpose

Recent R0 work has standardised the top decision presentation and evidence contracts for submitted quotations, KINGA Quote Verification, KINGA Optimised Quote, Repairability, concrete quote issues, and photo/damage evidence. These controls now require a combined rendered-report acceptance harness so Claims Ledger, Claims Intelligence, and the Forensic Decision Report can be checked together against immutable evidence states rather than only through isolated source-level tests.

## Proposed No-Write Scope

The work will add immutable fixtures and deterministic renderer assertions. It may render temporary local HTML for inspection, but it must not invoke a live claim pipeline or create, alter, or delete any production record.

| Fixture | Required rendered outcome |
|---|---|
| Complete verified quotation scope | Submitted totals visible; quote verification passed; concise KINGA Optimised Quote visible; no material issue; repairability derived only from recorded evidence. |
| Quote total reconciliation exception | Submitted totals remain visible; the exact reconciliation issue is visible; no invented labour, VAT, fee, paint, or all-in replacement cost. |
| Missing priced scope | Active submitted quotations remain visible; the named missing component is visible; no final all-in optimised quote, saving, settlement, or approval conclusion. |
| Explicit structural review | Repairability reads **Further structural review required** with the recorded rationale, without changing cost conclusions. |
| Photo-zone uncertainty | Canonical deduplicated photo count is consistent across reports; the unknown or conflicting zone is shown as a review limitation, not relabelled. |
| No canonical photo evidence | Each report makes photo absence explicit and does not use fallback narrative or synthetic visual analysis. |

## Invariants

1. **Submitted quotations are evidence, not generated values.** Their totals appear exactly as retained and duplicate records do not count twice.
2. **KINGA Quote Verification is a control, not a new total.** It reports documented reconciliation and scope outcomes.
3. **KINGA Optimised Quote is concise in the opening.** Its detailed line evidence remains in the appropriate report detail and its cost is never benchmark-substituted.
4. **Repairability is independent of cost.** It uses only persisted repair-versus-replace, total-loss, or explicit structural-review evidence.
5. **Photo evidence is canonical and bounded.** Zone, component, severity, and uncertainty stay faithful to the normalised source record.
6. **The report tiers remain distinct.** CL is concise, CI explains comparison and scope, and FR carries forensic detail—without contradicting the same evidence snapshot.

## Exclusions

This is an acceptance and rendering scope only. It does not change quote extraction, L2 eligibility, photo classification, model behaviour, repairability logic, claim status, policy, premium, repair cost, settlement, payment, or customer data.

## Decision Required

> Approve only the no-write fixtures, rendered-report assertions, and temporary local inspection outputs described above. Any defect discovered that requires a product behaviour change must be checkpointed and presented separately before correction.
