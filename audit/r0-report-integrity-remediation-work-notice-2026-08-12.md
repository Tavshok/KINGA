# R0 Work Notice — L2, Decision, Evidence, and Cross-Report Integrity

**Author:** Tavonga Shoko, Lead Engineer  
**Status:** Proposed work only — explicit implementation approval required  
**Severity:** **Production no-go**

## Decision required

The supplied claim `DOC-20260810-84080652` demonstrates that L2, report decision text, quote language, physics, fraud detail, photo evidence, and report provenance do not yet operate as one authoritative system. This package corrects those integrity breaks in dependency order. It does not change a claim's commercial outcome automatically, and it does not perform historical claim re-runs without separate approval.

## Plain-language reason L2 is failing

> L2 is correctly refusing to publish because the claim has three repairer quotations with totals only, not the item-by-item repair pricing required to build an all-in component ledger. The failure is that other report sections still use a separate expected estimate or stale recommendation and make the report look partially decided.

For this claim, the correct current state is: **three quotations received; component scope unavailable; L2 withheld; no savings; no settlement recommendation; manual quote/evidence reconciliation required.**

## Sequential implementation scope

| Sequence | Workstream | Exact change | Completion rule |
|---:|---|---|---|
| 1 | **R0-A — Canonical L2 state** | Persist a typed L2 status for every Stage 9 result: `complete`, `incomplete_scope`, `unavailable`; include required components, priced components, missing components, cost basis, quote-ledger version, and partial priced scope. Backfill no historical assessment automatically. | A total-only quote set produces `incomplete_scope`, never a numeric L2 and never a null/empty ambiguous composite object. |
| 2 | **R0-B — Quote receipt vs scope** | Make submitted quote count, active quote ledger, itemisation availability, and scope completeness distinct typed fields. Preserve total-only quotes and present them accurately. | CL/CI/FR all state “quotes received” and “scope incomplete” separately; none says “no quotes” when quotes exist. |
| 3 | **R0-C — Unified report decision contract** | Build one report-safe decision projection that combines claim workflow state, L2 integrity, evidence coverage, fraud/physics availability, and approval state. Remove raw recommendation strings from direct header decision display. | No report may print APPROVE/accepted/settlement language where an L2/evidence/approval hold exists. |
| 4 | **R0-D — Expected-cost quarantine** | Relabel or suppress base `estimated_cost` / `expectedRepairCostCents` wherever L2 is incomplete. It may appear only as a clearly labelled internal diagnostic reference, not as “KINGA Expected Repair Cost,” optimisation, saving, or settlement. | FR page 8 cannot leak a decision-like expected cost under L2 hold. |
| 5 | **R0-E — Typed physics/fraud/photo output** | Add shared field extractors and unavailable-state renderers. CI must extract canonical speed `.value`; no `NaN`. Fraud category absence renders a single unavailable explanation; photo count, usable count, zone coverage, and damaged-component count remain distinct. | Every report renders the same 18 km/h low-confidence physics value for this assessment or an explicit unavailable state; no zero-filled fraud buckets or photo-count fabrication. |
| 6 | **R0-F — Report provenance snapshot** | Persist a versioned report-input snapshot and provenance record for every report generated or downloaded, including assessment/version, quote ledger hash, decision-contract version, generator version, and input timestamp. | A report can be traced and reproduced; job/query provenance exists for every delivered output. |
| 7 | **R0-G — Deterministic cross-tier acceptance** | Use claim `12909902` and purpose-built fixtures for total-only, itemised, incomplete, and complete quotes. Generate CL/CI/FR from the same snapshot and compare decision, quotes, L2, settlement, physics, fraud, photos, and provenance. | All three reports agree on source facts and hold/decision state; tests prevent regression. |

## Explicitly outside scope

This package will not silently modify historical quotations, manufacture line items, auto-select a repairer, settle a claim, change fraud score methodology, alter valuation models, create commission/payment actions, or run historical claims again. Any historical reprocessing requires a separate approved workflow and audit trail.

## Required acceptance matrix

| Scenario | Required result |
|---|---|
| Three submitted total-only quotes | L1 may be visible; quote receipt is three; L2 is `incomplete_scope`; no saving, settlement, or approval. |
| Complete all-in component quotes | L2 may publish only after every required component and payable cost basis is traceable. |
| No quotes | Reports say no quotes and do not infer L2. |
| Base estimate exists but L2 incomplete | The base estimate is suppressed from decision-facing cost displays or clearly confined to an internal diagnostic reference. |
| Canonical speed object | All tiers render `.value` or unavailable; no `NaN`. |
| Fraud headline without category breakdown | Headline carries a provenance statement; components are unavailable, not zero. |
| Two photos / eleven components | Reports distinguish 2 photos, usable photo count, zone coverage, and 11 damaged components; no derived `14 photographs`. |
| Decision review/hold | CL, CI, and FR all show the same held/review decision contract. |
| Report rerender | Snapshot metadata proves the exact generator and source inputs used. |
| Existing Package 1–4 protections | Tenant, report-access, intake, executive, and admin authorization suites remain passing. |

## Release rule

The package is complete only when a same-snapshot CL, CI, and FR test set agrees for all required fields and an authorised reviewer can retrieve the report provenance. A visual correction alone is not completion.
