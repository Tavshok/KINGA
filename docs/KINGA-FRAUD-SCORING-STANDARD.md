# KINGA Fraud Scoring Standard

**Document ID:** KINGA-FSS-2026-001  
**Status:** Active — Authoritative Specification  
**Version:** 1.0.0  
**Effective Date:** 2026-07-09  
**Owner:** KINGA Platform Architecture & Release Governance  
**Supersedes:** All prior ad-hoc fraud band definitions in `weighted-fraud-scoring.ts`, `intelligence-enforcement.ts`, and `report-normalisation.ts`

---

## 1. Purpose

This document establishes the single canonical definition of fraud score bands for the KINGA AutoVerify AI platform. It exists to eliminate specification drift, enforce deterministic behaviour across all pipeline stages, and provide a governance anchor for any future threshold changes.

Prior to this standard, three independent implementations of score-to-level mapping existed in the codebase with inconsistent boundary definitions. This document resolves that drift and designates `shared/fraudScoring.ts` as the sole authoritative implementation.

All platform components — pipeline stages, enforcement engines, report generators, API serialisers, and UI helpers — **must** delegate to `shared/fraudScoring.ts`. No component may define its own score-to-level mapping.

---

## 2. Canonical Fraud Score Bands

The following table defines the official fraud risk levels for the KINGA platform. These bands are **immutable** without a formal governance change (see Section 8).

| Fraud Risk Level | Score Range | Lower Bound | Upper Bound | Boundary Behaviour |
|---|---|---|---|---|
| `minimal`  | 0 – 19   | 0 (inclusive)  | 19 (inclusive) | score = 19 → `minimal`; score = 20 → `low` |
| `low`      | 20 – 39  | 20 (inclusive) | 39 (inclusive) | score = 39 → `low`; score = 40 → `moderate` |
| `moderate` | 40 – 60  | 40 (inclusive) | 60 (inclusive) | score = 60 → `moderate`; score = 61 → `high` |
| `high`     | 61 – 80  | 61 (inclusive) | 80 (inclusive) | score = 80 → `high`; score = 81 → `elevated` |
| `elevated` | 81 – 100 | 81 (inclusive) | 100 (inclusive) | score = 81 → `elevated`; score = 100 → `elevated` |

**All bounds are inclusive.** The bands are contiguous and exhaustive over the valid score range [0, 100].

---

## 3. Threshold Rationale

### 3.1 Why score = 20 is the first `low` signal

A score of 20 represents the first meaningful accumulation of fraud indicators beyond background noise. Scores 0–19 reflect claims where the AI has found no material evidence of manipulation; they are classified `minimal` to allow straight-through processing without human review overhead. Score 20 crosses the threshold where at least one substantive signal has been detected, warranting a `low` risk designation and triggering soft-review routing.

### 3.2 Why score = 40 is the `moderate` threshold

Score 40 represents a compound signal — multiple independent fraud indicators co-occurring. At this level, automated approval is suspended and the claim is routed for assessor review. The `moderate` band (40–60) is intentionally wide to capture the largest segment of ambiguous claims without over-escalating.

### 3.3 Why score = 61 is the `high` threshold

Score 61 represents a strong convergence of fraud signals. Claims in this band are routed to senior assessors and trigger enhanced audit logging. The threshold is set at 61 (not 60) to ensure the `moderate` band has a clean upper bound at 60, preserving the symmetry of the band structure.

### 3.4 Why score = 81 is the `elevated` threshold

Score 81 represents near-certainty of fraudulent intent as assessed by the AI. Claims in this band are escalated to the fraud investigation unit and may trigger regulatory reporting obligations. The `elevated` designation is reserved for the highest-confidence fraud signals only.

### 3.5 Score range validity

The valid score range is [0, 100]. Scores below 0 or above 100 are invalid inputs and must be rejected by the calling system before invoking `scoreToFraudLevel`. The shared utility will clamp or throw on out-of-range inputs as documented in `shared/fraudScoring.ts`.

---

## 4. Boundary Behaviour

The following boundary cases are explicitly specified and must be covered by tests in every consumer:

| Input Score | Expected Output | Notes |
|---|---|---|
| 0  | `minimal`  | Minimum valid score |
| 19 | `minimal`  | Last score in `minimal` band |
| 20 | `low`      | First score in `low` band — **critical boundary** |
| 39 | `low`      | Last score in `low` band |
| 40 | `moderate` | First score in `moderate` band |
| 60 | `moderate` | Last score in `moderate` band |
| 61 | `high`     | First score in `high` band |
| 80 | `high`     | Last score in `high` band |
| 81 | `elevated` | First score in `elevated` band |
| 100 | `elevated` | Maximum valid score |

The score = 20 boundary is the most historically inconsistent point in the codebase. All implementations **must** return `"low"` for score = 20.

---

## 5. Worked Examples

The following examples illustrate how the standard applies in practice.

**Example 1 — Straight-through claim:**  
A motor vehicle claim with no document anomalies, consistent repair quotes, and a corroborated police report receives a fraud score of 12. This falls in the `minimal` band (0–19). The claim proceeds to automated approval without human review.

**Example 2 — Soft-review trigger:**  
A claim with a minor quote inconsistency and an unverified workshop receives a fraud score of 24. This falls in the `low` band (20–39). The claim is flagged for soft review but remains eligible for assessor approval without escalation.

**Example 3 — Assessor review required:**  
A claim with multiple document anomalies and a vehicle valuation outside the expected range receives a fraud score of 53. This falls in the `moderate` band (40–60). The claim is routed to an assessor and automated approval is suspended.

**Example 4 — Senior assessor escalation:**  
A claim with fabricated repair quotes, mismatched VIN data, and a suspicious claimant history receives a fraud score of 71. This falls in the `high` band (61–80). The claim is escalated to a senior assessor and full audit logging is activated.

**Example 5 — Fraud investigation unit:**  
A claim with forged documents, a known fraud network connection, and a staged accident signature receives a fraud score of 94. This falls in the `elevated` band (81–100). The claim is immediately escalated to the fraud investigation unit and regulatory reporting is triggered.

---

## 6. Shared Utility Contract

The canonical implementation resides at:

```
shared/fraudScoring.ts
```

### 6.1 Public API

```typescript
/**
 * KINGA Fraud Scoring Standard — canonical score-to-level mapping.
 * Implements KINGA-FSS-2026-001.
 *
 * Bands:
 *   0–19   → "minimal"
 *   20–39  → "low"
 *   40–60  → "moderate"
 *   61–80  → "high"
 *   81–100 → "elevated"
 *
 * @param score - Integer in [0, 100]. Values outside this range will throw.
 * @returns FraudRiskLevel
 */
export type FraudRiskLevel = "minimal" | "low" | "moderate" | "high" | "elevated";

export function scoreToFraudLevel(score: number): FraudRiskLevel
```

### 6.2 Usage

```typescript
import { scoreToFraudLevel, FraudRiskLevel } from "../shared/fraudScoring";

const level: FraudRiskLevel = scoreToFraudLevel(claim.fraudScore);
```

### 6.3 Constraints

- The function is **pure** — no side effects, no I/O, no logging.
- The function is **deterministic** — identical input always produces identical output.
- The function **throws** if `score` is not a finite number in [0, 100].
- The function must **not** be duplicated. Any file containing its own score-to-level mapping is in violation of this standard.

---

## 7. Governance Rules

### 7.1 Prohibition on duplication

No file in the KINGA repository may define its own score-to-level mapping. This includes:

- Inline `if/else` chains comparing score to numeric thresholds
- `switch` statements on score ranges
- Lookup tables mapping score ranges to level strings
- Any function named `scoreToLevel`, `enforceFraudLevel`, `getFraudBand`, or similar

The only permitted implementation is `shared/fraudScoring.ts::scoreToFraudLevel`.

### 7.2 Permitted consumers

The following files are authorised to import and call `scoreToFraudLevel`:

| File | Role |
|---|---|
| `server/weighted-fraud-scoring.ts` | Fraud scoring engine |
| `server/intelligence-enforcement.ts` | Enforcement decision layer |
| `server/report-normalisation.ts` | Report generation layer |
| `server/pipeline-v2/decisionTraceGenerator.ts` | Decision trace output |
| `server/pipeline-v2/claimsDecisionAuthority.ts` | Claims routing authority |
| `server/routers/decision.ts` | API serialiser |
| Any future consumer | Must import from `shared/fraudScoring.ts` |

### 7.3 Test coverage requirement

Every consumer of `scoreToFraudLevel` must have test coverage for all ten boundary values defined in Section 4. The shared utility itself must have a dedicated test file (`shared/fraudScoring.test.ts` or equivalent) covering all ten boundary values plus the midpoint of each band.

### 7.4 API compatibility

The `FraudRiskLevel` type uses the values: `"minimal"`, `"low"`, `"moderate"`, `"high"`, `"elevated"`. These values are part of the external API contract and must not be changed without a major version increment and a migration plan. Note: the value `"medium"` (used in some legacy API serialisers) is **not** part of this standard and must be migrated to `"moderate"` in a coordinated release.

---

## 8. Future Change Procedure

Any change to the fraud score band thresholds requires:

1. **Governance review** — A formal proposal must be submitted to the KINGA Platform Architecture team, documenting the rationale, the proposed new thresholds, and the impact on existing claims in the database.
2. **Impact assessment** — The proposal must include a quantitative assessment of how many claims in the historical database would be reclassified under the new thresholds.
3. **Document update** — This document (`KINGA-FSS-2026-001`) must be revised with a new version number and effective date before any code changes are made.
4. **Single-commit implementation** — All code changes (shared utility, consumers, tests) must be implemented in a single atomic commit to prevent intermediate states where different components use different thresholds.
5. **Regression test gate** — The full test suite must pass before the change is merged.
6. **Database migration** — If the change reclassifies any stored `fraudRiskLevel` values, a database migration script must be prepared and reviewed before deployment.

---

## 9. Pre-Standard Inconsistency Record

This section documents the inconsistency that existed before this standard was established, for audit purposes.

| File | Function | score=20 result | Band definition |
|---|---|---|---|
| `server/intelligence-enforcement.ts` | `enforceFraudLevel()` | `"low"` ✓ | `score >= 20 → low` (correct) |
| `server/weighted-fraud-scoring.ts` | `scoreToLevel()` | `"low"` ✓ | `score < 20 → minimal` (correct) |
| `server/report-normalisation.ts` | `scoreToLevel()` | `"minimal"` ✗ | `score >= 21 → low` (incorrect — off by one) |

The `report-normalisation.ts` implementation contained an off-by-one error at the `minimal/low` boundary (using `>= 21` instead of `>= 20`). This standard corrects that error. The impact was limited to claims scoring exactly 20, which would have been labelled `"minimal"` in reports but `"low"` in enforcement decisions — a cosmetic inconsistency with no routing consequence, since both levels receive identical treatment in `claimsDecisionAuthority.ts` and `decisionTraceGenerator.ts`.

---

*This document is maintained by the KINGA Platform Architecture team. Queries should be directed to the Release Governance Engineer.*
