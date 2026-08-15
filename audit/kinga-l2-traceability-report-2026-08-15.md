# KINGA Optimised Quote: Source-to-Presentation Traceability Report

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 15 August 2026  
**Scope:** Verified implementation trace for L1, KINGA Optimised Quote (L2), Potential savings, review-required states, and presentation boundaries.

## Executive Position

KINGA Optimised Quote is the platform’s **evidence-led repair-cost recommendation**. It is not a simple component total, a benchmark-only estimate, or an assessor-agreed amount. It uses eligible submitted repair evidence, component-level verification, benchmark intelligence, scope and quotation controls, and continuously improving benchmark learning. The recommendation is always visible: complete evidence produces a final L2, while incomplete evidence produces a clearly labelled human-review state without inventing a repair cost.

> **Decision rule:** KINGA only selects a component value where a submitted repair price exists. Benchmarks validate the selection; they do not create a missing component price.

## Authoritative Cost Flow

| Decision step | Authoritative input | Rule | Resulting boundary |
|---|---|---|---|
| Submitted quotation evidence | Panel-beater quote, line item, source identity, workflow state, and pricing-integrity marker | Cancelled, rejected, superseded, duplicate, explicitly ineligible, and inferred/proportional-fallback pricing are retained as history or quote issues, not decision evidence. | Only eligible active submitted evidence can influence cost conclusions. |
| L1 — submitted quotation comparison | Eligible active whole-quote totals | Select the lowest eligible active submitted whole-quote total. | L1 is a submitted quotation comparison point, not a component recommendation. |
| L2 — KINGA Optimised Quote | Eligible active submitted component prices and a comparable P50 benchmark where available | For each like-for-like component, compare the lowest eligible submitted price, **Qmin**, with P50. If the deviation is within 30%, select P50; otherwise select the lower of Qmin and P50 and retain a deviation remark. | No component is created without a submitted price. A high spread is a review signal, not an automatic L2 failure. |
| Potential savings | Complete eligible L1 and complete L2 | Show only where `L1 − L2` is positive. | It is decision support, not settlement, approval, payment, or automatic negotiation authority. |
| Review-required L2 | Incomplete submitted component coverage, no active eligible evidence, or no supported component amount | Keep the KINGA Optimised Quote section visible; state the supported basis or lack of a supportable amount and recommend human review. | No all-in L2, savings, or settlement conclusion is created. |

## L2 Selection and Evidence Controls

The executable composite engine records a selection method, benchmark deviation, line-item spread, and pricing-source trace for each selected component. A P50 benchmark is selected only inside the approved 30% tolerance. Outside that tolerance, the lower validated value is selected and the material deviation remains visible. Where like-for-like submitted prices vary by more than 20%, KINGA retains the chosen evidence-led value and flags the scope for review.

The following conditions do **not** suppress an otherwise complete L2. They remain visible under KINGA Quote Verification or Quote Issues: source provenance pending, extraction-quality review, header-to-line-item reconciliation differences, benchmark deviation, and high submitted-price variance. Conversely, a price explicitly identified as inferred or proportional fallback is not eligible submitted pricing. It is retained for audit visibility but excluded from L1, L2, anomaly, recommendation, negotiation, savings, and settlement-facing calculations.

## Presentation Contract

| Surface | Complete eligible evidence | Review-required evidence | Detail level |
|---|---|---|---|
| **Client top-cost view** | Submitted quotation, KINGA Optimised Quote, and Potential savings when positive. | KINGA Optimised Quote with a simple human-review statement; no partial-scope amount, formula, or whole-quote anchor. | Concise and client-safe. |
| **Claims Ledger, Claims Intelligence, and Forensic Claim Decision** | The same final recommendation and potential-savings eligibility, supported by quotation verification and repairability context. | The same human-review conclusion with no numeric L2/savings where an all-in recommendation is unsupported. | Concise decision summary plus professional verification sections. |
| **Component Cost Matrix** | Component source, benchmark-selection method, deviation, and high-variance remarks remain visible. | No unsupported total or savings treatment is introduced. | Professional evidence traceability. |

This separation is intentional. Clients see the outcome and any review requirement without calculation mechanics. Professional users retain the supporting evidence required to audit the recommendation.

## Confirmed Inconsistencies Identified During the Audit

| Finding | Confirmed inconsistency | Decision risk | Corrected boundary |
|---|---|---|---|
| **L2 formula divergence** | Executable selection, unused credibility code, and stated policy did not agree on the role of P50 and tolerance. | A valid recommendation could use a different basis from the approved business rule. | The P50/30% method is the sole component-selection authority; the retired P25/P75 credibility path has no decision role. |
| **CI quote-state split** | Claims Intelligence displayed visible quote amounts as active while high-level metrics used an empty active population, producing “Highest submitted quote $0.00.” | Users could see contradictory quote evidence and cost context. | One typed quote-evidence projection now controls visible history, active counts, highest quote, L1, and review language. |
| **Stage 9 benchmark-path interruption** | A split-module schema reference failed during benchmark lookup and prevented canonical ledger persistence. | Report output could lose the quote-state authority required for safe L1/L2 presentation. | Canonical ledger persistence occurs before optional benchmark enrichment, and Stage 9 now has its own observable job lifecycle. |
| **Raw Claim Truth quote input** | The live Claim Truth path previously received raw extracted quotations instead of the canonical eligible ledger. | Historical, cancelled, inferred, or ineligible amounts could influence decision, anomaly, or negotiation fields. | Claim Truth receives only Stage 9 active, final-L2-eligible quotation evidence. |
| **Inferred-price admission** | Proportional-fallback pricing could remain active at quote level despite not being submitted pricing. | An unsupported value could influence high quote, anomaly, recommendation, or savings logic. | Inferred/proportional-fallback quotations are comparison-only history and have no decision authority. |

## Controlled Correction Decisions

The following decisions were controlled by explicit user direction and implemented without creating payment, settlement, policy, disposal, or authority outcomes.

| Decision | Applied rule | Presentation consequence |
|---|---|---|
| **L2 should not disappear for ordinary quote imperfections** | Provenance, extraction-quality, reconciliation, benchmark-deviation, and variance issues are warnings where usable submitted scope remains complete. | KINGA Optimised Quote stays visible; Quote Issues retain the limitation. |
| **L2 is always visible** | A complete scope produces the final numeric recommendation. Partial or unsupported scope produces a human-review presentation rather than a fabricated number. | Users see the recommendation section and the exact evidence limitation; savings remains unavailable outside complete evidence. |
| **Clients see a concise outcome** | Client-facing cost summaries do not expose formulas, benchmark mechanics, component-optimisation terminology, partial-scope calculations, or whole-quote anchors. | The client sees KINGA Optimised Quote, Potential savings when supported, and a simple human-review message where needed. |
| **Potential savings is evidence-bound** | Show only where complete eligible L1 and L2 exist and L1 exceeds L2. | “Potential savings” is decision support only; it does not authorise settlement or payment. |
| **Repairability is separate from cost optimisation** | Economic write-off recommendation requires complete L2 at or above 70% of verified market value. Technical write-off requires combined KINGA structural and physics evidence. | Reports may recommend a write-off with reasons, but no financial action is created automatically. |

## Decision and Repairability Boundaries

Quote status has a single authority boundary. The Claim Truth layer receives the Stage 9 canonical eligible evidence population rather than raw extracted quotations. This prevents historical, cancelled, rejected, superseded, ineligible, duplicate, and inferred fallback prices from changing the cost verdict, anomaly state, recommendation, negotiation guidance, potential savings, fraud/review triggers, or settlement-facing outputs.

Repairability remains a decision separate from L2. KINGA recommends an economic write-off when a **complete L2** reaches at least 70% of verified market value. It recommends a technical write-off only where KINGA’s dedicated structural analysis and executed physics evidence jointly support that conclusion. Neither recommendation creates payment, settlement, disposal, or policy authority.

## Code and Contract Map

| Area | Primary implementation | Responsibility |
|---|---|---|
| Canonical quotation authority | `server/pipeline-v2/canonicalQuoteLedger.ts` | Classifies active, historical, superseded, excluded, comparison-only, and inferred-pricing quotation evidence. |
| L1/L2 and Stage 9 composition | `server/pipeline-v2/stage-9-cost.ts` | Builds active evidence, persists canonical ledger information, and calculates L1/L2/savings only from authorised evidence. |
| Component selection | `server/pipeline-v2/quoteOptimisationEngine.ts` | Implements Qmin/P50 selection, 30% tolerance, 20% spread review, and submitted-price integrity. |
| Claim Truth decision input | `server/pipeline-v2/orchestrator.ts` and `server/pipeline-v2/claimTruthLayer.ts` | Passes canonical eligible evidence to downstream decision, anomaly, recommendation, and review logic. |
| Shared presentation contract | `shared/costDecisionPresentation.ts` | Defines complete and human-review L2 states plus evidence-bound Potential savings. |
| Report projection | `server/reporting/costIntegrity.ts` and `server/reporting/costDecisionPresentation.ts` | Derives report-safe L1/L2/savings/review states from stored Stage 9 evidence. |
| Client presentation | `client/src/components/KingaClaimsReport.tsx` | Presents concise client-facing KINGA Optimised Quote and Potential savings. |
| Professional matrix | `client/src/components/ComponentCostMatrix.tsx` | Displays source labels, selection method, deviation, and variance evidence without inventing savings or settlement treatment. |

## Verification Summary

The current verified matrix covers canonical quote eligibility, inferred-price exclusion, mixed-status decision isolation, complete and review-required L2 states, client and report presentation, potential-savings eligibility, benchmark source/deviation/variance traceability, and economic/technical write-off boundaries. Production bundle verification succeeded before the related checkpoints. The real-claim validation remains recorded separately; no subsequent traceability test changed a live claim, quote, assessment, policy, payment, settlement, recovery, or report job.

## Conclusion

KINGA Optimised Quote now has a consistent evidence boundary: it uses submitted evidence first, validates it with benchmarks and controls, transparently identifies quote issues, and remains visible even where human review is required. Potential savings is shown only when it is supported by complete eligible L1 and L2 values. This maintains a clear insurer value proposition while protecting users from unsupported cost, savings, settlement, or repairability conclusions.

## Internal References

1. [Canonical quotation ledger](../server/pipeline-v2/canonicalQuoteLedger.ts)
2. [Stage 9 cost orchestration](../server/pipeline-v2/stage-9-cost.ts)
3. [Component selection engine](../server/pipeline-v2/quoteOptimisationEngine.ts)
4. [Shared cost-decision presentation contract](../shared/costDecisionPresentation.ts)
5. [Systematic error audit ledger](systematic-error-audit-ledger-2026-08-14.md)
