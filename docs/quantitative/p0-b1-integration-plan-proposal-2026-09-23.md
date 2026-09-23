# Review-Only Proposal: Conflict-Aware P0-B1 Integration Plan over Merged P0-A-2

**Status:** **Review-only proposal.** This document authorizes neither implementation nor any repository operation. It does **not** authorize a rebase, merge, cherry-pick, file replacement, edit, test execution, data change, migration, staging activity, deployment, or pull request for P0-B1.

**Decision requested:** Approve this document only as the required design-and-review sequence for a _future_ P0-B1 composition. The future package must preserve the merged P0-A-2 collision-physics publication boundary and independently add the P0-B1 fraud-decision hold. It must remove the confirmed Forensic Decision Report numeric `fraudScoreAdjusted` fallback. It must stop on any conflict, unclassified consumer, or failed validation condition. [1] [2] [3]

## 1. Scope, source baseline, and explicit non-goals

### Scope

The proposed scope is limited to a reviewable design for composing the paused fraud boundary with the merged physics boundary. The authoritative planning baseline is merge commit `ee8b80e4`, the P0-A-2 merge baseline. The compared material is an **uncommitted** P0-B1 worktree based on the pre-A2 commit `a18d692`; it is not current-main evidence and has no merge, implementation, deployment, data, or authority approval. [2] [3]

The intended future outcome is narrow: two independent, fail-closed boundaries at applicable report, PDF, narrative, snapshot, API, queue, and automated-decision consumer boundaries. A physics eligibility result must not enable fraud authority. A fraud eligibility result must not enable physics publication or physical authority.

### Explicit non-goals

This proposal does not authorize or imply any of the following:

- Rebase, merge, cherry-pick, replacement, editing, testing, or other application of P0-B1.
- Any assertion that the paused overlay or its historical focused tests establish behavior on `ee8b80e4`.
- P0-A3, P0-B1c, browser/UI/export work, direct API remediation, snapshot/audit egress remediation, vehicle/feed work, physical workflow work, cost/repairer authority, schema, data, migration, model, calibration, training, staging, production, or deployment work.
- A new governing physics measurement, a governing fraud score, an automated action, a policy threshold, a low-risk pass, a benign fallback, or a new human-review authority.
- Treating raw evidence, historical records, snapshots, model outputs, LLM output, caller-supplied values, a stored score, a default, a neutral band, or a manual-review marker as automated authority.

The inventory makes clear that P0-A-2 is a publication boundary, not a general closure for the remaining authority surfaces. The plan therefore preserves the sequence: decide authority surfaces separately, then define later execution-boundary packages. [2] [4]

## 2. Planning invariants that a future composition must preserve

### 2.1 P0-A-2 invariants — all must survive intact

1. **Source-bound, fail-closed physics authority.** `hasGoverningCrushDepthEligibility()` remains the governing publication predicate. A stored Physics Truth value, legacy physics analysis, visual geometry, raw crush observation, cross-validation value, CGI result, historical record, or numeric-looking field is not authority by itself. When eligibility is absent, the stable outcome remains **Collision Physics Withheld — Manual Review Required**. [1] [4]

2. **The full collision hold stays nonnumeric and substantive.** The physics boundary continues to withhold crush depth, speed, delta-V, force, energy, deceleration, braking, physical impossibility, CGI, hidden damage, structural/load-path conclusions, causation, direction, and collision-consistency conclusions. Independently supported descriptive claim, documentary, photo, quote, cost, workflow, approval, vehicle-identifier, and source-bound registration-history facts may remain available only through their existing safe projections. [1] [4]

3. **Independent, composable projections.** `server/reporting/p0PhysicsPresentation.ts` remains separate from the prospective `server/reporting/p0FraudPresentation.ts`. Redaction in either order cannot restore a field, marker, conclusion, or authority removed by the other boundary. Qualification in one domain does not unlock the other. [1] [4]

4. **P0-safe descriptive photo handling.** The P0-A-2 projection remains in every in-scope shared photo call. It must continue to strip `suitableForCrushDepth`, `physicsExclusionReason`, and `directionContradiction`; descriptive type, component, and provenance information may remain when independently supported. [1] [4]

5. **Private canonical PDF input.** `server/pdf-export.ts` retains the A2 private canonical-record gate. Arbitrary direct objects continue to fail to the minimal non-physics projection; a generic recursive redactor is not an adequate substitute for canonical provenance. The canonical path retains only the existing allow-listed vehicle identifiers and independently supported cost evidence. [1] [4]

6. **Deterministic narrative.** `server/report-narrative-generator.ts` remains deterministic in P0. It must make no LLM call and create no prompt capable of turning narrative, damage text, or raw values into a collision conclusion. The collision abstention text remains the output where a physics conclusion would otherwise be generated. [1] [4]

7. **Report-specific suppression remains complete.** `server/reporting/claimsIntelligenceReport.ts`, `server/reporting/reportDefinitions.ts`, and `server/reporting/forensicDecisionReport.ts` preserve A2 markers, descriptive-photo projection, and stripping of collision/structural/causation content. The Forensic Decision Report continues to omit physical-impossibility material, C1–C9 and cross-engine agreement content, physics-derived damage-zone/severity/coherence content, structural-review and reconciliation prose, Claim Truth collision aliases, and unsafe forensic-audit fallbacks. [1] [4]

8. **A2 regressions remain mandatory.** The focused A2 matrix and its rich adversarial fixture remain retained evidence requirements. A complete, bounded full-suite result is required afresh for a future composed package; a prior A2 result is a baseline reference, not proof of composition. [1] [4]

### 2.2 P0-B1 corrections the future design must incorporate

1. **Fraud eligibility is deliberately non-governing in P0.** The future plan must retain the P0-B1 `FraudDecisionEligibility` semantics: only `ADVISORY` or `UNAVAILABLE`; rebind the preserved shape to the live Stage 7/8 source snapshot; recompute forged, omitted, stale, fallback, degraded, or structurally inconsistent forms as unavailable; and retain an always-false `hasGoverningFraudDecisionEligibility()` predicate.

2. **A hold is not a score.** The sole P0 fraud outcome is the actionable **Fraud Decision Withheld — Manual Review Required** state, identifying the missing independently verifiable claim-linked evidence and the need for later qualified authority. It is neither low risk, neutral risk, proof of fraud, a pass, a decline, nor a threshold result. No `0`, `50`, `70`, `low`, `medium`, `moderate`, `high`, `null` rendering, historic number, or implicit default may take its place.

3. **Correct the Forensic Decision Report residual.** The future design must delete the numeric `fraudScoreAdjusted` default/coercion and every dependent rendering or decision-context use in `server/reporting/forensicDecisionReport.ts`: score cell, `/100` text, bands, threshold comparisons, `fallbackTriggers`, risk-tab subtitle, fraud headline, and component-breakdown prose. No score alias may survive in HTML, a data attribute, narrative, review trigger, or renderer input. The replacement is the actionable fraud hold plus an allow-listed non-fraud context. [2] [3]

4. **Retain B1b field-level behavior.** Mixed reports should preserve safe non-fraud operational content while removing fraud score, level, probability, indicator, classification, verdict, and derived narrative fields, and displaying one explicit fraud marker. Fraud-only report types remain withheld. Field-level preservation must not revive physics or fraud authority.

5. **Respect authorization order and side-effect order.** Existing session, role, tenant, resource, and historical-record checks remain before a hold wherever early withholding would reveal resource existence. After authorization, the fraud hold is evaluated before fraud queries, aggregation, writes, scheduling, dispatch, candidate work, automated route, recovery, or other authority-relevant side effect.

6. **Keep standalone evaluators non-production.** Retained rule evaluators may be used only for characterization coverage. They do not become a production decision, routing, reporting, or publication path.

## 3. Conflict-aware review order for a future composition

The following is a **review order**, not a command sequence and not authorization to modify a worktree. Each stage requires a clean review disposition before the next stage is considered.

1. **Freeze the comparison frame.** Confirm `ee8b80e4` as the only baseline and retain the paused overlay solely as review material. Inventory every overlay path and confirm the five known semantic overlaps: `server/pdf-export.ts`, `server/report-narrative-generator.ts`, `server/reporting/claimsIntelligenceReport.ts`, `server/reporting/forensicDecisionReport.ts`, and `server/reporting/reportDefinitions.ts`. A whole-file replacement is inadmissible. [2] [3]

2. **Review shared contracts before consumers.** Establish the hypothetical composed contract from A2 quantitative governance and `p0PhysicsPresentation`, alongside B1 `FraudDecisionEligibility`, `p0FraudDecisionHold`, and `p0FraudPresentation`. Review the two redactors in both orders and confirm that neither can restore fields removed by the other.

3. **Review the five overlaps from the A2 mainline version.** For `server/pdf-export.ts`, retain the private canonical-input restriction before applying fraud-safe treatment only to that trusted input. For `server/report-narrative-generator.ts`, retain deterministic, no-LLM behavior and add neither a score/level/indicator prompt nor a fallback. For `claimsIntelligenceReport.ts` and `reportDefinitions.ts`, retain A2 marker use, photo projection, and physics stripping while adding field-level fraud stripping. For `forensicDecisionReport.ts`, retain every A2 physical/structural/causation suppression and apply the fraud boundary, including the explicit removal of `fraudScoreAdjusted` behavior.

4. **Review report delivery only after report composition.** Consider report router, canonical normalization, snapshot, replay, legacy read, direct PDF, and response-adapter paths only after the shared and overlapping report contracts have a written acceptance disposition. The design must not infer that a central projection secures an unreviewed browser, snapshot, email, audit, or direct-export consumer. [2] [3]

5. **Review non-overlap B1 sink families against the same contract.** The future review may then classify Stage 8, fallback, truth/reconciliation, Stage 12 and decision APIs, DOE, fast track and routing, recovery, analytics, replay, learning, trace, response adapters, claim-report routing, and police/documentary paths. Each review must preserve required authorization ordering and state that no authority result occurs after a P0 hold.

6. **Stop before a further package.** Do not begin A3, B1c, or any open authority group. Unresolved bypasses remain split later by execution boundary, not silently absorbed into this integration plan. [2] [3]

## 4. Future acceptance and validation matrix

No test in this matrix has been executed for the proposed composition. The table states the evidence that would be required before a future PR could be considered; it is not a claim of runtime proof.

| Validation area               | Required future evidence                                                                                                                                                                  | Acceptance condition                                                                                                                                                                                                                                                         |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Baseline and conflicts        | Static changed-path audit against `ee8b80e4`; post-composition review of all five overlap diffs                                                                                           | The overlap set is reconciled from A2 mainline semantics. Every A2 import, call, private canonical gate, photo projection, deterministic narrative property, and relevant regression remains present.                                                                        |
| Shared contracts              | A2 physics tests, B1 governance/presentation tests, and two-order composition cases                                                                                                       | Physics and fraud redactors cannot disclose or restore the other domain’s withheld field, marker, or conclusion.                                                                                                                                                             |
| Rich report fixtures          | Claims Assessment, Claims Intelligence, and Forensic Decision fixtures containing nested, historic, and free-text aliases                                                                 | Safe claim, photo, quote, cost, workflow, approval, and documented evidence remain. Both applicable holds appear. Collision and fraud fields, aliases, conclusions, and review triggers are absent.                                                                          |
| Dedicated FDR regression      | Inputs including raw/nested fraud aliases, historical values, `fraudScoreAdjusted` values `0`, `50`, `70`, and `77`, and score-derived prose                                              | No numeral-based score, `/100`, band, threshold, trigger, alias, or data attribute reaches HTML. The explicit fraud hold remains, and existing A2 collision/structural absence assertions still pass.                                                                        |
| PDF and narrative             | Direct arbitrary PDF input, trusted canonical input, and adversarial LLM response fixtures                                                                                                | Direct input remains minimal and A2-safe. Canonical PDF retains only allow-listed facts and both applicable boundaries. No LLM call occurs; no physics or fraud conclusion enters narrative.                                                                                 |
| Execution and authorization   | Gates for Stage 8, decision, DOE, fast track, routing/dispatch, recovery, replay, learning/calibration, analytics, vehicle verification, report router, response normalization, and trace | Authorized callers receive the held state when appropriate; unauthenticated, tenantless, and cross-tenant callers receive the existing non-disclosing authorization outcome. No pre-hold fraud read/write, scheduling, dispatch, candidate work, or automated action occurs. |
| Regression and suite evidence | Focused A2 (9 files/29 tests), B1b (3 files/15 tests), B1a (4 files/19 tests), new composed cases, then a guarded complete suite                                                          | All required focused tests and the composed set pass. A complete full-suite summary is captured; an interrupted, host-terminated, or summary-less runner is not green evidence. The prior A2 607-file/9,690-test result is baseline context only.                            |
| Hygiene and diagnostics       | `git diff --check`, changed-path diagnostics, and review of inherited tooling constraints                                                                                                 | No integrated path has an unresolved diagnostic or unreviewed source-order change. Incomplete guard output or any test failure blocks readiness.                                                                                                                             |

## 5. Hard stop conditions

The future design review must stop and return to owners immediately if any of the following occurs:

- An A2 helper, canonical PDF restriction, safe photo projection, deterministic no-LLM narrative constraint, physics hold, or A2 regression would be removed, weakened, or bypassed.
- The known five overlaps cannot be resolved semantically from `ee8b80e4`, or any additional overlap is found without explicit classification.
- `fraudScoreAdjusted`, a score alias, a score-derived title/band/threshold/trigger, or another fraudulent benign/adverse fallback remains in the Forensic Decision Report or another reviewed renderer.
- A hold causes an authorization or tenant-existence disclosure, or an applicable caller cannot preserve the necessary session/role/tenant/resource/historical-record check before withholding.
- A hold occurs after a fraud query, aggregation, model invocation, write, snapshot, candidate generation, scheduling, dispatch, routing, recovery, report release, or other operational side effect that should have been precluded.
- A consumer cannot be classified as raw evidence, documented human-reviewed evidence, or automated authority; a physical/structural/fraud effect is unclassified; or an owner decision is missing.
- The design expands into an excluded M05–M31 surface, schema/data work, browser work, deployment, or a new package without separate owner direction.
- Any required focused test fails, the bounded suite has no complete summary, changed-path diagnostics remain unresolved, or fresh independent adversarial review does not approve the composed design.

## 6. Review gates before any future implementation consideration

| Gate                                 | Required decision or evidence                                                                                                                       | Result if unmet                                             |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 1. Plan-only owner review            | Owner confirms this document is a planning artifact and approves no source operation                                                                | No integration work of any kind proceeds.                   |
| 2. Authority-policy decisions        | Owners decide each unresolved surface in Section 7 below                                                                                            | The surface remains held and outside any composition scope. |
| 3. Conflict and contract review      | Independent reviewer confirms A2 preservation, B1 independent fail-closure, and FDR fallback removal design                                         | Return to plan revision; do not edit a worktree.            |
| 4. Caller-map review                 | Every proposed affected consumer and side-effect boundary is classified; direct/export/UI/snapshot gaps are explicitly excluded or separately owned | Stop on an unclassified caller or effect.                   |
| 5. Fresh adversarial review          | An independent review attacks aliases, stale/historical data, direct inputs, redactor ordering, and authorization order                             | Any bypass blocks a PR proposal.                            |
| 6. Combined merge-readiness evidence | Future focused tests, source-order tests, hygiene, diagnostics, and complete bounded suite produce reviewable results                               | No PR readiness claim without full evidence.                |

## 7. Owner decisions that remain separate from this plan

The following decisions are deliberately not inferred from source code and must receive distinct authority classifications before a later package can consume relevant evidence operationally. The companion decision document provides proposed P0 defaults and owner choices.

1. **M20 — physical readiness, consistency, quality, and pre-analysis gates:** whether any physical/structural output may influence readiness, quality, review, or a workflow transition.
2. **M21 — physical/structural cost, DOE, repairer selection, and turnaround:** whether a physical/structural input can influence a cost recommendation, repairer choice, confidence, or timing.
3. **M17 — incident override and inspection reconciliation:** whether a human override, LLM/heuristic revalidation, client-supplied measurement, or comparison may set a validated state or advance report generation.
4. **M07/M30 — snapshots, interactive/PDF/email retrieval, and audit export:** the allowed recipient, purpose, allow-list, human-review role, and retention model for egress of preserved evidence.
5. **M31 — engineering, underwriting, vendor performance, and vehicle structural intelligence:** which documented observation, recommendation, risk statement, or performance measure may be presented and to whom.
6. **M28 — automation-policy threshold:** whether `maxFraudScoreForAutomation` may be published, mutated, simulated, or consumed as an operational control.
7. **M28 — human early-fraud suspicion:** whether and how a documented human suspicion may create a manual-review/evidence-collection workflow without becoming an automated conclusion.
8. **M13/M25–M27 — registry, relationship, vehicle, and generic risk feeds:** the provenance and permitted use of raw source facts versus composite risk/flags/watchlist/collusion labels.
9. **E01–E06/T02 — raw evidence, snapshots, learning, events, history, CGI, and dormant helpers:** conditions for preservation, reviewer presentation, external egress, replay, or future operational use.

## 8. Review conclusion

The recommended P0 position is to **approve only this conflict-aware plan**, not a change. P0-A-2 remains the merged collision-physics publication boundary. P0-B1 remains prospective. A future composition can be considered only if it begins from `ee8b80e4`, preserves every A2 invariant, applies B1 as a separate fail-closed fraud boundary, removes the Forensic Decision Report numeric fallback, resolves the nine authority decisions separately, and produces fresh combined evidence. [1] [2] [3]

> **Audit limitation:** This proposal synthesizes the supplied static, read-only inventory and records. It makes no runtime claim. No source edit, rebase, merge, test execution, database access, staging/production access, deployment, or external-service action is asserted here. Absence of an inspected caller does not prove that a dynamic or future caller is impossible. [2] [3]

## References

[1]: https://github.com/Tavshok/KINGA/pull/144 "PR #144 — P0-A-2: fail-close collision-physics publication"
[2]: https://github.com/Tavshok/KINGA/pull/145 "PR #145 — combined P0 physics and fraud consumer inventory"
[3]: https://github.com/Tavshok/KINGA/blob/main/docs/quantitative/p0-combined-physics-fraud-consumer-inventory-2026-09-22.md "P0 combined physics-and-fraud consumer inventory"
[4]: https://github.com/Tavshok/KINGA/blob/main/docs/quantitative/p0-a-2-physics-publication-boundary-2026-09-22.md "P0-A-2 collision-physics publication boundary"
