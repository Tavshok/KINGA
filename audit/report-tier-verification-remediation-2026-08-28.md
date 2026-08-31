# Report-Tier Canonical Migration — Verification Remediation

**Branch:** `fix/report-tier-canonical-bypasses`  
**Scope:** The two stale document-evidence tests and the six report-tier diagnostics found by the read-only verification run.  
**Excluded:** Structural forensic split, schema and migration work, database-access scope changes, and unrelated type-error remediation.

## Defect classification and correction

| Location | Original verification result | Classification | Correction | Validation |
|---|---|---|---|---|
| `server/reporting/p0IntakeEvidenceVisibility.test.ts` | Two branch-only source-shape failures required renderer-local `FROM claim_documents` text. | Stale test after intended canonical-boundary migration. | Replaced source inspection with two owned live-intake tests: one proves normal intake persists a document into `ResolvedReportRecord`; the other proves CI and FR render the same canonical document category and filename. Exact IDs are cleaned child-first. | Passed live TiDB. |
| `server/reporting/claimsIntelligenceReport.ts:423` | `TS2339`: stale `created_at` access on `ReportQuoteLedgerRow`. | Real canonical contract omission. | Added the persisted `createdAt` field to `QuoteEvidence`, populated it from `panel_beater_quotes.created_at`, and mapped it in CI’s canonical adapter. | No reporting diagnostic remains in server/shared check. |
| `server/reporting/forensicDecisionReport.ts:214` | `TS2322`: untyped JSON `repairabilityDecision`. | Real type-safety gap. | Added the reusable `isKingaWriteOffRecommendation()` type guard in the shared authoritative recommendation contract; FR now supplies a recommendation only after validated narrowing. | No reporting diagnostic remains in server/shared check. |
| `server/reporting/forensicDecisionReport.ts:1632` | `TS2345`: renderer supplied pill colours to `sectionTab`. | Real token-contract mismatch. | Mapped interpretation status to the existing `high`, `mid`, and `ok` section-tab severity vocabulary. | No reporting diagnostic remains in server/shared check. |
| `server/reporting/forensicDecisionReport.ts:1719` | `TS18046`: approval `stage` was unknown. | Real compatibility-contract gap. | Replaced generic approval JSON records with exported immutable `ForensicApprovalStage` values normalized at the model boundary. | No reporting diagnostic remains in server/shared check. |
| `server/reporting/forensicReportModel.ts:581` | `TS2339`: nonexistent `semanticConfidence` property on canonical photos. | Stale property reference. | Uses canonical `classificationConfidence` only. | No reporting diagnostic remains in server/shared check. |
| `server/reporting/forensicReportModel.ts:768` | `TS2322`: raw odometer value had an unsafe object path. | Real narrowing gap. | Added a finite-number/non-empty-string scalar boundary before model construction. | No reporting diagnostic remains in server/shared check. |

## Validation

| Check | Result |
|---|---|
| Rewritten live document-evidence regression | `p0IntakeEvidenceVisibility.test.ts`: **2/2 passed**. |
| Focused report regression group | **6 files, 21/21 tests passed**. |
| Complete configured server/shared test inventory | **42 bounded fresh-worker batches completed**. Branch and current-main ledgers each contain **45 unique failed identifiers**; **45 shared, 0 branch-only, 0 main-only**. |
| Server/shared TypeScript partition | 926 diagnostics, matching current main after worktree-path normalization; no branch-only diagnostic remains in `claimsIntelligenceReport.ts`, `forensicDecisionReport.ts`, or `forensicReportModel.ts`. |
| Client TypeScript partitions | All 18 bounded client source partitions completed. Comparison by normalized source location and `TS` code: **0 branch-only**, 1,648 shared, and 42 main-only occurrences of the six now-fixed reporting diagnostics repeated through client-importing partitions. |
| Bundled server | Passed. |
| Vite production build | Passed; pre-existing bundle-size warnings only. |

## Boundary confirmation

The rewrite does not restore direct renderer database access. CI and FR receive document evidence from canonical report contracts; the new intake test exercises the supported persistence path, the canonical resolver, and rendered output. The forensic structural split remains deferred.
