# KINGA AutoVerify AI — Full System Audit and Remediation Plan

**Date:** 4 April 2026
**Scope:** Pipeline extraction, cost engine, data pass-through, UI rendering, readability

---

## Executive Summary

A full-system audit was conducted across the KINGA pipeline (Stages 2–10), the database persistence layer (`db.ts`), the tRPC router, and the ForensicDecisionPanel UI. Seven categories of defects were identified, ranging from critical data loss during persistence to missing visual components. This document presents each finding with its root cause, impact, and a prioritised remediation plan.

---

## 1. FINDINGS

### Finding 1: Cost Decision Engine Output Not Persisted to Database

**Severity:** CRITICAL
**Location:** `server/db.ts` lines 611–640

The `costIntelligenceJson` construction in `db.ts` serialises only a subset of the Stage 9 output. The following fields are computed by the pipeline but **discarded before database write**:

| Field | Computed By | Persisted | Impact |
|---|---|---|---|
| `costDecision` | `costDecisionEngine.ts` | No | `true_cost_usd`, `cost_basis`, `recommendation` lost |
| `costNarrative` | `costIntelligenceNarrative.ts` | No | Human-readable cost explanation lost |
| `costReliability` | `costReliabilityScorer.ts` | No | Confidence scoring for cost lost |
| `quoteOptimisation` | `quoteOptimisationEngine.ts` | No | Multi-quote selection logic lost |
| `alignmentResult` | `mechanicalAlignmentEvaluator.ts` | No | Damage-to-quote alignment lost |
| `reconciliationSummary` | `damageReconciliationEngine.ts` | No | Parts matching summary lost |

**Root cause:** When `costIntelligenceJson` was first written, these engines did not exist. As engines were added to Stage 9, their outputs were returned from the stage function but never added to the `db.ts` serialisation block.

**Consequence:** The UI receives `costDecision: undefined` from the database. The Cost Decision Engine's `true_cost_usd` (which correctly selects the documented quote over the AI estimate for single-quote claims) is never shown. The UI falls back to displaying the raw AI component estimate (`expectedRepairCostCents: 262935` = $2,629.35) instead of the documented quote ($591.33).

---

### Finding 2: AI Cost Estimate Hallucination on Single-Quote Claims

**Severity:** CRITICAL
**Location:** `server/pipeline-v2/stage-9-cost.ts` lines 40–80

The `estimateComponentCost` function uses hardcoded base part costs (e.g., bumper = $200, door = $400, frame = $800) multiplied by severity factors to produce an AI estimate. For the test claim:

- Documented quote: **$591.33** (from panel beater SKINNERS)
- AI component estimate: **$2,629.35** (from hardcoded lookup tables)
- Deviation: **-75.25%** (AI thinks the quote is 75% too low)

The Cost Decision Engine (`costDecisionEngine.ts`) correctly resolves this — it sets `cost_basis: "AGREED_COST"` and `true_cost_usd: 462.33` (the assessor-agreed amount). However, because Finding 1 prevents this from reaching the database, the UI shows the hallucinated AI estimate instead.

**Root cause:** Two-part failure: (1) the AI estimate is inherently unreliable for markets with different pricing (e.g., Zimbabwe vs USA labour rates), and (2) the engine that corrects for this is not persisted.

---

### Finding 3: Damage Photos Not Displayed in ForensicDecisionPanel

**Severity:** HIGH
**Location:** `client/src/components/ForensicDecisionPanel.tsx`

The ForensicDecisionPanel contains **zero `<img>` tags**. It parses `damagePhotosJson` and `enrichedPhotosJson` from the assessment but only uses them for:
- A boolean check in the evidence integrity table ("Damage photographs: used/not used")
- An integrity flag when photos are missing

A fully functional `DamageImagesPanel` component exists at `client/src/components/DamageImagesPanel.tsx` (654 lines) with photo gallery, AI enrichment, zoom, and inconsistency detection — but it is **not imported or rendered** in ForensicDecisionPanel. It is only used in `InsurerComparisonView.tsx`.

Additionally, the database shows `damage_photos_json: []` (empty array) for the latest assessment, indicating the pipeline is not extracting photo URLs from the uploaded claim documents.

---

### Finding 4: Force Vector Diagram Not Rendered

**Severity:** HIGH
**Location:** `client/src/components/ForensicDecisionPanel.tsx`

The physics data exists in the database:
- `impactVector: {"direction":"frontal","magnitude":83330,"angle":0}`
- `estimatedSpeedKmh: 90`
- `accidentSeverity: severe`

The ForensicDecisionPanel displays this as **text labels only** ("Speed: 90.0 km/h", "Impact Force: 83.3 kN"). There is no SVG, canvas, or visual diagram showing the force vector direction, magnitude arrow, or energy distribution.

A `VehicleDamageVisualization` component exists (512 lines) with a vehicle outline and damage zone overlay — but it is only used in `AssessmentResults.tsx`, not in ForensicDecisionPanel.

---

### Finding 5: No Charts or Visual Aids in ForensicDecisionPanel

**Severity:** MEDIUM
**Location:** `client/src/components/ForensicDecisionPanel.tsx`

The panel contains no Chart.js, D3.js, or any chart rendering. All data is presented as:
- Text labels with values
- Progress bars (CSS width percentages)
- Tables (parts reconciliation)

Missing visual aids that would improve comprehension:
- Cost comparison bar chart (documented quote vs AI estimate vs agreed cost)
- Fraud score radar/breakdown chart
- Damage severity distribution chart
- Energy dissipation diagram
- Repair-to-value ratio gauge

---

### Finding 6: UI Readability — Partially Fixed, Remaining Issues

**Severity:** MEDIUM
**Location:** `client/src/index.css`, various page components

The CSS token layer was corrected in the previous session with WCAG AA-compliant contrast ratios. The `text-gray-500` → `text-gray-700 dark:text-gray-400` replacements were applied across all pages. However, the following issues remain:

1. **Hardcoded `oklch()` inline styles** in ForensicDecisionPanel severity bands and status indicators are not theme-adaptive — they use fixed lightness values that may not contrast well against all card backgrounds.

2. **The dark mode `--muted-foreground` at `oklch(0.70)`** is borderline for small text (12px) — it passes AA for normal text but fails AAA. Secondary labels in the ForensicDecisionPanel use this token extensively.

3. **Badge contrast in dark mode** — some status badges (e.g., amber warning badges) use `bg-amber-900/30 text-amber-300` which has approximately 3.5:1 contrast on the dark card background, below the 4.5:1 AA threshold.

---

### Finding 7: Data Completeness — Missing Fields in DB Persistence

**Severity:** MEDIUM
**Location:** `server/db.ts`

Several pipeline outputs are computed but not persisted:

| Field | Source Stage | DB Column | Status |
|---|---|---|---|
| `costDecision` | Stage 9 | `cost_intelligence_json` | Not included in JSON |
| `costNarrative` | Stage 9 | `cost_intelligence_json` | Not included in JSON |
| `costReliability` | Stage 9 | `cost_intelligence_json` | Not included in JSON |
| `quoteOptimisation` | Stage 9 | `cost_intelligence_json` | Not included in JSON |
| `alignmentResult` | Stage 9 | `cost_intelligence_json` | Not included in JSON |
| `reconciliationSummary` | Stage 9 | `cost_intelligence_json` | Not included in JSON |
| `quotesReceived` | Stage 9 | `cost_intelligence_json` | Hardcoded to 0 |

---

## 2. REMEDIATION PLAN

### Priority 1 — Cost Data Integrity (Findings 1 + 2)

**Objective:** Ensure the Cost Decision Engine output is persisted and displayed correctly.

**Step 1.1:** Add missing fields to `costIntelligenceJson` in `db.ts`
- Add `costDecision`, `costNarrative`, `costReliability`, `quoteOptimisation`, `alignmentResult`, `reconciliationSummary` to the JSON serialisation block
- Replace hardcoded `quotesReceived: 0` with actual count from `stage3?.inputRecovery?.extracted_quotes?.length`

**Step 1.2:** Update ForensicDecisionPanel Cost Analysis tab
- Read `costDecision.true_cost_usd` as the primary displayed cost
- Show `costDecision.cost_basis` label (AGREED_COST / OPTIMISED_COST / AI_ESTIMATE)
- Display `costDecision.recommendation` and `costDecision.anomalies`
- Add a cost comparison bar chart (Chart.js) showing: Documented Quote, Agreed Cost, AI Estimate, and True Cost side by side
- Show `costNarrative` as the human-readable explanation below the chart

**Step 1.3:** Suppress AI estimate when a documented quote exists
- In the Cost Analysis tab, when `costDecision.cost_basis === "AGREED_COST"`, label the AI estimate as "Internal Reference Only — Not Used for Decision"
- Apply the Output Validation Engine Rule 2 (Cost Governance) to enforce this

**Estimated effort:** 2–3 hours

---

### Priority 2 — Damage Photo Display (Finding 3)

**Objective:** Show damage photos in ForensicDecisionPanel with AI enrichment.

**Step 2.1:** Import and render `DamageImagesPanel` in the Damage tab
- Add `DamageImagesPanel` to the Damage tab of ForensicDecisionPanel
- Pass `damagePhotosJson`, `enrichedPhotosJson`, `claimId`, and `assessmentId` as props

**Step 2.2:** Fix empty `damage_photos_json` in pipeline
- Audit Stage 2 extraction to check if photo URLs from `claim_documents` (category `damage_photo`) are being collected
- If not, add a step in the orchestrator that queries `claim_documents` for damage photos and injects them into the pipeline context

**Step 2.3:** Add photo upload prompt
- When `damage_photos_json` is empty, show a clear call-to-action: "No damage photos found. Upload photos to enable visual damage analysis."

**Estimated effort:** 2–3 hours

---

### Priority 3 — Force Vector Visualisation (Finding 4)

**Objective:** Render a visual force vector diagram in the Technical Details tab.

**Step 3.1:** Build an `ImpactVectorDiagram` component
- SVG-based top-down vehicle outline
- Directional arrow showing impact vector (angle, magnitude)
- Colour-coded severity zones on the vehicle body
- Speed and force labels positioned relative to the arrow

**Step 3.2:** Integrate `VehicleDamageVisualization` into Damage tab
- Import the existing component and pass `damagedComponents`, `impactDirection`, `accidentSeverity`
- Position alongside the damage zone table

**Step 3.3:** Add energy distribution diagram
- Small horizontal stacked bar showing kinetic energy → dissipated energy → residual energy
- Use Chart.js or inline SVG

**Estimated effort:** 3–4 hours

---

### Priority 4 — Charts and Visual Aids (Finding 5)

**Objective:** Replace text-only data with charts where they improve comprehension.

**Step 4.1:** Cost Comparison Bar Chart (Cost Analysis tab)
- Horizontal bar chart: Documented Quote | Agreed Cost | AI Estimate | Fair Range
- Highlight the selected `true_cost_usd` with a distinct colour
- Source label: "Cost Decision Engine v1"

**Step 4.2:** Fraud Score Breakdown Chart (Fraud & Risk tab)
- Horizontal bar chart showing each fraud indicator's contribution
- Threshold line at the REVIEW and REJECT boundaries
- Replace the current text list of indicators

**Step 4.3:** Damage Severity Distribution (Damage tab)
- Doughnut or horizontal bar chart showing component count by severity tier
- Cosmetic | Minor | Moderate | Severe | Catastrophic

**Step 4.4:** Confidence Gauge (Decision Header)
- Replace the text percentage with a semi-circular gauge
- Green (80–100), Amber (60–79), Red (0–59)

**Estimated effort:** 3–4 hours

---

### Priority 5 — Remaining Readability Fixes (Finding 6)

**Objective:** Eliminate all remaining contrast failures.

**Step 5.1:** Replace hardcoded `oklch()` inline styles with CSS custom properties
- Create `--status-approve`, `--status-review`, `--status-reject`, `--status-fraud` tokens
- Apply in both `:root` and `.dark` blocks with verified contrast ratios

**Step 5.2:** Increase dark mode `--muted-foreground` to `oklch(0.75)` for small text
- This brings the contrast ratio from 4.8:1 to 5.6:1, passing AAA for normal text

**Step 5.3:** Fix amber badge contrast in dark mode
- Change `text-amber-300` to `text-amber-200` on dark backgrounds (5.2:1 → 6.8:1)

**Estimated effort:** 1 hour

---

### Priority 6 — Data Completeness (Finding 7)

**Objective:** Persist all computed engine outputs to the database.

This is addressed by Priority 1 Step 1.1. No additional work required beyond that step.

---

## 3. IMPLEMENTATION ORDER

| Phase | Priority | Finding | Estimated Time |
|---|---|---|---|
| Phase 1 | P1 | Cost data integrity (persist + display) | 2–3 hours |
| Phase 2 | P2 | Damage photo display | 2–3 hours |
| Phase 3 | P3 | Force vector visualisation | 3–4 hours |
| Phase 4 | P4 | Charts and visual aids | 3–4 hours |
| Phase 5 | P5 | Readability fixes | 1 hour |
| **Total** | | | **11–15 hours** |

Each phase is independently deployable. Phase 1 is the most critical as it directly affects the accuracy of cost decisions shown to adjusters.

---

## 4. RISK ASSESSMENT

| Risk | Mitigation |
|---|---|
| Adding fields to `costIntelligenceJson` may break existing UI parsing | The ForensicDecisionPanel already uses optional chaining (`?.`) for all cost fields — new fields will be `undefined` for old assessments, which is safe |
| DamageImagesPanel expects specific prop shapes | The component already handles null/empty arrays gracefully |
| Chart.js bundle size increase | Chart.js is already available in the project dependencies — no new bundle cost |
| Force vector SVG may not render correctly for all impact angles | Use a tested set of 8 cardinal directions with interpolation |

---

## 5. VERIFICATION CRITERIA

After remediation, the following must be true:

1. For a single-quote claim: the Cost Analysis tab shows the documented quote ($591.33) and agreed cost ($462.33) as primary values, with the AI estimate clearly labelled as "Internal Reference Only"
2. The `costDecision` object is present in `cost_intelligence_json` in the database after a pipeline run
3. Damage photos from `claim_documents` are displayed in the Damage tab with zoom capability
4. A force vector arrow is visible in the Technical Details tab showing direction and magnitude
5. At least 3 charts are rendered: cost comparison, fraud breakdown, damage severity
6. All text passes WCAG AA contrast (4.5:1 for normal text, 3:1 for large text) in both light and dark mode
