# Report Integrity Investigation — Initial Evidence Register

**Author:** Tavonga Shoko, Lead Engineer  
**Status:** Read-only investigation in progress

## Scope

This workpaper records the initial evidence from the supplied production reports for claim `DOC-20260810-84080652` and the user-provided remediation punch-list. No code or data changes are authorised under this note.

## Supplied report set

| Report | File | Observed pages |
|---|---|---:|
| CL | `KINGA—DOC-20260810-84080652CL.pdf` | 6 |
| CI | `KINGA—DOC-20260810-84080652CI.pdf` | 3 |
| FR | `KINGA—DOC-20260810-8408065212.08.pdf` | 9 |

## Initial extracted contradictions and defects

| Area | CL | CI | FR | Initial observation |
|---|---|---|---|---|
| Decision | `APPROVE` | `REVIEW REQUIRED` | `REVIEW` | Same claim does not present one consistent decision state across tiers. |
| Fraud score | `37/100` low risk | review state with incomplete cost recommendation context | `37/100` low risk | The supplied PDFs do **not** match the older 53/68 punch-list values, which suggests either a different run, different source claim, or a provenance/version mismatch requiring trace. |
| Market value / insured value | not visibly fronted in viewed CL pages | `Sum Insured $12,500.80` | `Market value $12,500.80` | CI and FR currently align on the visible insured/value figure in this supplied set. |
| L2 / settlement | CL page 3 says `No quotes submitted for this claim.` | CI says missing quotation scope prevents savings/settlement output | FR says `KINGA optimised (L2) Incomplete` and `Settlement Not available` | The supplied set supports an **L2 integrity hold** rather than a false numeric settlement, but CL still contradicts the workflow by presenting an approval recommendation and a quote absence statement. |
| Physics | CL says low-speed impact estimated `18 km/h`; consistency `50/100` | CI shows `NaN km/h`, physics consistency `25/100` | FR shows `18.0 km/h` with low confidence and multiple warnings | Physics outputs are internally inconsistent across tiers for the same report set. |
| Photo count / coverage | CL checklist says `Only 14 damage photograph(s) detected` while report shows `2 shown` | not yet fully reviewed visually | FR states `2 images`, `2 usable`, `2 of 4 zones` coverage | CL still appears to have a count/wording defect. |
| Quote scope | CL says `No quotes submitted for this claim.` | CI says quotation scope missing/incomplete | FR shows quote comparison and explicit L2 incompleteness | Report language may be mixing “no valid complete quote scope” with “no quotes submitted,” which is materially different. |

## Visual evidence from CL pages 1–5

| Page | Finding |
|---|---|
| 1 | Draft banner states missing panel beater quote, yet the report still renders `APPROVE`. |
| 2 | Executive summary recommends approval and assignment to selected panel beater, despite incomplete data and missing quote condition. |
| 3 | Quotation section states `No quotes submitted for this claim`, while the same page uses physics output and damage-photo findings to support a final recommendation. |
| 4 | Approval chain renders as pending only; no contradiction found yet, but workflow is incomplete while recommendation is affirmative. |
| 5 | Confidence Improvement Checklist still contains the likely defective `Only 14 damage photograph(s) detected` statement. |

## Visual evidence from CI pages 1–3

| Page | Finding |
|---|---|
| 1 | The first page is materially blank apart from report chrome and footer. This is a report-generation/pagination defect, not a valid cover page because no claim-identifying cover content is present. |
| 2 | CI correctly shows a `REVIEW REQUIRED` state, 3 quotes received, repair-to-value 44%, and an explicit L2 integrity hold. However, the page footer/narrative renders `Impact speed estimate: NaN km/h` while its later speed comparison renders the physics consensus as `18.0 km/h`. |
| 2 | The visible data completeness is 15%, but CI marks `Quotes received` as sufficient while simultaneously holding L2 because a required repair-scope item lacks a traceable price. The UI needs to distinguish quote count from complete repair-scope coverage. |
| 3 | The approval workflow is pending and states `0 of 4 required stages complete`, which is consistent with review status. It further exposes the contradiction with CL's approval recommendation. |

## Visual evidence from FR pages 1–5

| Page | Finding |
|---|---|
| 1 | FR is internally consistent with a review hold: `REVIEW REQUIRED`, fraud `37/100`, data completeness `15%`, quality score `45/100`, L2 `Incomplete`, settlement `Not available`, and `3 active quotes`. |
| 1 | FR explicitly shows the quote ledger (`L1 lowest active submitted quote $5,915.00`, `L2 incomplete`, `L3 not available`), which directly contradicts CL page 3 saying `No quotes submitted for this claim.` |
| 1 | FR front page physics snapshot includes `consensus speed 18 km/h`, `Delta-V 9 km/h [0–19]`, and `deformation efficiency 138% [97–100%]`. This must be reconciled with later detailed sections and the CI `NaN km/h` display. |
| 2–4 | FR repeatedly uses `18.0 km/h` low-confidence speed language, `physics integrity 80/100`, `2 warnings`, and `causation type not determined from narrative`. This is materially different from CL's simpler approval-oriented narrative and CI's `NaN km/h` display. |
| 3 | FR classifies impact direction as `Unknown` and states narrative causation is unavailable, so any other report asserting a confirmed front/rear causation without the same caveat is using a different source path or stale output. |
| 4 | Vehicle Structural Intelligence is effectively empty (`—`, safety risk low, notes only). This supports the user's concern about thin/placeholder structural content still occupying report space. |
| 5 | FR financial validation shows three quotes: `The Dent Doctor $5,915.00`, `C.A.M.E.L BODY SHOP AUTO $7,230.00`, and `Stylin Auto $8,349.00`, together with an `L2 integrity hold`. This proves the supplied claim does have RFQs and that CL's `No quotes submitted` statement is false for this output set. |
| 5 | FR photo evidence says `2 of 4 zones` with two visible images labelled `RIGHT SIDE, FRONT` and `LEFT SIDE, FRONT`. It also states rear, underbody, and interior zones lack photographic corroboration, which must be reconciled with narrative and classification outputs from other tiers. |

## Visual evidence from FR pages 6–9

| Page | Finding |
|---|---|
| 6 | FR states `Classified Damage Zones vs Photographic Coverage` with an `unknown` severe zone and `No photos`, then says coverage gap detected and settlement for those zones must not be authorised until additional evidence or independent inspection is provided. This is a strong hold condition absent from CL's approval language. |
| 6 | FR fraud section shows `37/100 (Low)` but also says `Component breakdown not available` and every fraud component bucket is rendered `0/x`. The score is therefore not transparently decomposed, which is a report integrity defect even if the headline score itself is sourced. |
| 7 | FR overall classification is `CONCERN`, recommends verifying repair-quote coverage and escalating to manual review, and says additional evidence is required. This sharply contradicts CL's approval recommendation. |
| 7 | FR states `Damage–Physics Consistency 50/100 CONCERN`, again matching review/hold behavior rather than approval. |
| 8 | FR cost optimisation renders `KINGA Expected Repair Cost USD 5456.25` with `Cost Decision ESCALATE`, even though page 1 and page 5 say L2 is incomplete and not published. This means a different cost-engine value is still leaking into the interpretation layer despite the L2 integrity hold. |
| 8 | FR contact geometry intelligence is partially populated (`4/12 indicators evaluated`) and flagged `ATTENTION`; this section should not silently read as complete operational evidence. |
| 8–9 | Approval workflow remains pending with no actions recorded, which is consistent with review state and inconsistent with any final approval recommendation elsewhere. |

## New contradiction cluster requiring source trace

| Contradiction | Evidence |
|---|---|
| L2 hold versus expected repair cost | FR suppresses L2 on pages 1 and 5, but page 8 still prints `KINGA Expected Repair Cost USD 5456.25`, which is operationally a leaked optimisation value under a hold condition. |
| Fraud score versus component transparency | FR renders a 37/100 headline score while showing every fraud bucket as 0 and stating the component breakdown is unavailable. The headline may be valid, but the displayed decomposition is not trustworthy. |
| Coverage gap versus approval language | FR repeatedly says missing corroborative photos and incomplete quote scope require manual review; CL still moves to `APPROVE`. |

## Consolidated plain-language explanation emerging from the supplied outputs

At this stage the supplied PDFs do **not** show one single L2 bug. They show a broader **cross-tier source-of-truth split**:

1. **FR and CI are mostly honouring the L2 integrity hold** and suppressing settlement.
2. **CL is still following an older or looser recommendation path** that can approve even when quotation scope and evidence remain incomplete.
3. **FR itself still leaks a separate optimisation value (`USD 5456.25`) into interpretation text**, even while marking L2 incomplete.
4. **Physics and fraud sub-fields are not being rendered from one consistent source contract**, which is why CI can show `NaN km/h` and FR can show `18 km/h`, and FR can show a valid headline fraud score with an invalid all-zero component breakdown.

## Live-data provenance — claim `12909902`

The supplied report reference resolves to claim `DOC-20260810-84080652`, internal ID `12909902`, tenant `tenant-1771335377063`. The live claim is `analysis_complete` with workflow state `ai_assessment_completed`; the latest and only visible assessment is ID `19860001`, created `2026-08-10 12:50:52`, recommendation `REVIEW`, fraud score `37`, and repair-to-value ratio `44`.

| Provenance item | Live source result | Significance |
|---|---|---|
| Submitted quotations | Three submitted original quotes at the same assessment timestamp: Dent Doctor **$5,915.00**, C.A.M.E.L Body Shop Auto **$7,230.00**, Stylin Auto **$8,349.00**. All have `components_json` and `itemized_breakdown` null. | The CL statement `No quotes submitted` is provably false for the claim record; the quotes exist but lack component-level scope detail. |
| Expected repair cost | `ai_assessments.estimated_cost = 545625` cents; `cost_intelligence_json.expectedRepairCostCents = 545625`. | FR page 8's `USD 5456.25` is an expected/base estimate, not an L2 composite. It must not appear as an optimisation conclusion while L2 is incomplete. |
| L2 composite metadata | `cost_intelligence_json` contains a `compositeOptimisation` key, but its extracted nested values are null: no `isComplete`, no L2 total, no cost basis, no missing-components list. | This is an older/pre-R1 or incomplete Stage 9 payload. The shared resolver correctly returns L2 incomplete, but gives only a generic missing-scope explanation. |
| Cost decision | `costDecision.recommendation = REVIEW_REQUIRED`; quote count and quotes received both equal **3**. | Assessment-level source supports review, not approval, and recognises quote presence. |
| Physics truth | `physics_truth_json.speed.canonical` is an object `{ value: 18, min: 0, max: 36, confidence: 0.4, source: ENSEMBLE_CONSENSUS }`; legacy ensemble and Delta-V both contain **18**. | CI is passing the entire canonical speed object to `Number(...)`, yielding `NaN`; FR correctly reads `.value`. |
| Fraud | Stored headline score is **37**, low risk. The component-breakdown render is unavailable/all-zero for this assessment. | Headline may be valid, but displayed zero-filled component buckets are not explanatory evidence. |

## Exact current renderer defects verified in source

| ID | Renderer path | Defect | Direct evidence |
|---|---|---|---|
| R0-01 | `claimsIntelligenceReport.ts:106,417` | CI assigns `ptCI.speed.canonical` directly and then executes `Number(ptlSpeedCI)`. For this claim `canonical` is an object rather than a number. | Produces the supplied `NaN km/h`; FR uses `ptlSpeed.value`. |
| R0-02 | `forensicDecisionReport.ts` expected-cost interpretation path | FR emits the persisted expected/base repair estimate even where the shared cost-integrity resolver marks L2 incomplete. | FR page 8 prints `$5,456.25` and calls it a normal expected repair cost while pages 1 and 5 suppress L2. |
| R0-03 | Historical CL output versus current `reportDefinitions.ts:254–262,332–346` | The current CL renderer fetches all panel-beater quotes and uses the shared resolver. The supplied CL instead says no quotes and approves. | The supplied CL was generated by a stale/different report path or pre-R1 code; it cannot be reproduced from the current query/assessment state without a provenance/version record. |
| R0-04 | `reportDefinitions.ts:381–385,551` | CL derives decision text directly from `ai_assessments.recommendation` but does not require the same L2/quote/evidence gate to control decision display. | Any permissive/stale recommendation can appear as `APPROVED` even when report cost integrity holds L2. |
| R0-05 | FR/CL fraud detail paths | Where category-level fraud output is absent, report layouts still display zero-valued component cells or generic placeholder detail around a nonzero headline. | FR page 6 shows all component buckets `0/x` while headline is 37 and breakdown explicitly unavailable. |
| R0-06 | Report provenance persistence | No `report_jobs` row was found with `parameters.claimId`/`claim_id = 12909902`. | The supplied PDFs have no accessible job-level provenance record in the current queue, so generator version, input snapshot, and source-data timestamp cannot be proven from the job table. |

## Current evidence conclusion

The immediate L2 failure is not that the system has selected the wrong numeric L2. **It correctly has no publishable L2 because the three submitted quotes have no component-level pricing and the persisted composite payload has no complete all-in ledger.** The no-go failure is that separate report paths still present incompatible decision and optimisation language around that correct hold, and the report-provenance layer cannot prove which generator/data snapshot produced the contradictory CL.

## Root-cause determination

| Root cause | Failure chain | Why it is a no-go |
|---|---|---|
| **RC-01 — Incomplete L2 contract persistence** | Stage 9 left an empty/null `compositeOptimisation` structure on this historical assessment. The assessment retains a base expected repair estimate and quote count, but no explicit `isComplete`, cost basis, missing component list, or canonical component ledger. | A downstream renderer cannot distinguish a valid all-in L2 from a pre-R1/incomplete L2 run with enough certainty to explain the hold. |
| **RC-02 — Separate decision and cost gates** | The CL header projects `ai_assessments.recommendation`; L2 integrity is resolved independently. A stale or permissive recommendation can therefore appear as approval while the cost path is unsafe. | An `APPROVE` recommendation can be printed despite missing quote scope, incomplete evidence, and a pending approval chain. |
| **RC-03 — Expected estimate leaked as optimisation** | `estimated_cost` / `expectedRepairCostCents` is a base expected repair estimate, not an L2. FR's interpretation layer displays it while the shared cost resolver withholds L2. | A reader sees a precise “KINGA Expected Repair Cost” under an L2 hold and may treat it as a decision-ready optimised figure. |
| **RC-04 — Quote presence conflated with priced repair scope** | Three total-only RFQs exist. They prove market quote receipt, but `components_json`, `itemized_breakdown`, and component-level scope are all null. Historical CL text rendered this as no quotes rather than as quotes received with unusable L2 scope. | The report states a factually false absence and obscures the actual action: obtain/reconcile itemised repair scope. |
| **RC-05 — Physics schema type mismatch** | CI passes the object `physics_truth_json.speed.canonical` to `Number`, whereas FR reads `.value`. | The same source record becomes `NaN km/h` in CI and `18 km/h` in FR. |
| **RC-06 — Fraud fallback presentation failure** | A valid headline score exists, but category-level breakdown is absent. The renderer creates zero-valued buckets alongside an unavailable disclosure. | Zero buckets are interpreted as measured evidence and contradict the stated absence of a breakdown. |
| **RC-07 — Report snapshot/provenance absence** | The queue contains no job whose parameters identify the supplied claim. The supplied CL cannot be tied to a generator version, source snapshot, or report-input timestamp. | Defects cannot be reliably reproduced, invalidated, or audited; a stale output can appear authoritative. |
| **RC-08 — Photo-count vocabulary/denominator mixing** | The live assessment has two enriched photos and eleven damaged components. The CL's “14 damage photographs” wording is not tied to either authoritative count. | Evidence coverage and evidence count are being mixed, so report language is not auditable. |

## Non-negotiable source-of-truth policy for remediation

1. **L2 exists only when Stage 9 persists a complete all-in composite ledger.** A base expected estimate, L1 quote, benchmark reference, documented assessor cost, or weighted average is never L2.
2. **The report decision state is a single report-safe contract.** Every CL, CI, and FR consumes the same `hold/review/decision` projection and may not derive a competing approval from a raw assessment string.
3. **Quote receipt and quote-scope completeness are separate facts.** The correct wording for this claim is “3 submitted total-only quotations; component scope unavailable; L2 withheld.”
4. **Every displayed field has a typed source and unavailable state.** Numbers are never coerced from objects, `null`, or missing component arrays; unavailable is displayed as unavailable, never `0`, `NaN`, low risk, or approval.
5. **Every report is a versioned snapshot.** It records report type, generator version, input assessment ID/version, quote-ledger hash, source-data timestamp, and rendering timestamp before delivery.

## Immediate root-cause hypotheses now requiring source trace

| Area | Evidence-based hypothesis |
|---|---|
| L2 failure | L2 is currently failing because the report layer is correctly recognising incomplete repair-scope pricing for this supplied run and suppressing savings/settlement, but CL is still reading an older or different summary path that recommends approval and claims no submitted quotes. |
| Quote contradiction | CL is likely querying a stale or simplified quote-presence flag rather than the same active RFQ ledger used by FR and CI. |
| Physics contradiction | CI is likely rendering a derived speed text field that can become `NaN`, while FR and CL render another physics-consensus field that resolves to `18 km/h`. |
| Cross-tier decision contradiction | CL appears to consume a permissive decision-rule summary path while CI/FR consume the newer hold/review path that respects incomplete L2 scope and lower data completeness. |

## Investigation priorities now locked

1. Confirm whether the supplied PDFs were generated from a different pipeline run than the older punch-list values.
2. Trace why CL still reaches `APPROVE` when CI and FR hold or review due to incomplete quotation scope.
3. Trace the exact source of the `NaN km/h` CI physics output versus the `18 km/h` CL/FR output.
4. Trace whether `No quotes submitted` is a true absence of RFQs or an incorrect render of an incomplete/missing-valid-scope condition.
5. Trace the photo-count defect producing `14 damage photograph(s)` when the visible evidence set is two photographs.
