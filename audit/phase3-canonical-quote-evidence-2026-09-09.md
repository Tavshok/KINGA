# Phase 3 — Canonical Quote Evidence Consolidation

## Scope and safety boundary

This isolated change reconciles the presentation path for the standard Claims Report with the existing shared quote-evidence contract already used by Claims Intelligence and Forensic reports. It does not query, create, update, delete, reconcile, convert, or otherwise alter claims, quotations, source documents, workflow, evidence, currency, L1, L2, savings, settlement, database schema, migrations, or provider configuration.

## Corrected presentation boundary

The Claims Report retained a hidden, inline quote-comparison implementation after the shared renderer had become the visible path. Although hidden from users, that duplicate renderer independently rebuilt active quote rows, performed loose component-name matching, and formatted L1/L2-related text. It was dead presentation code and a future divergence risk.

The duplicate block and its now-unused data preparation have been removed. Claims, Claims Intelligence, and Forensic reports now use the same `renderSharedQuoteEvidencePresentation` matrix and the existing `renderCostDecisionSummaryHtml` for visible quote state.

The shared active-comparison matrix now repeats the canonical complete L2 total in its own comparison-footer column when the integrity gate permits it. The column is named **KINGA Optimised (L2)**. If the canonical gate does not provide a complete L2 total, the matrix says **Not available**; it does not estimate, substitute an evidence-qualified partial value, or imply a settlement amount.

## Evidence-state rules preserved

| Evidence state | Visible output | Explicitly withheld |
|---|---|---|
| Eligible, active, one-currency quotations | Side-by-side submitted line items, recorded totals, canonical L1, and complete L2 only when supplied by the integrity gate | Any inferred missing line item, unapproved conversion, or settlement conclusion |
| Mixed-currency eligible quotations | Comparison-withheld explanation | Ranking, combining, L1, L2, savings, and settlement |
| Legacy, historical, comparison-only, or unreconciled submissions | Audit history and status/reconciliation context | Active-comparison matrix, L1/L2, savings, and settlement |
| Incomplete traceable scope | Available evidence and decision-state explanation | Final all-in L2 and savings |

The approved wording for an unreconciled submitted document total remains unchanged: **“Lowest submitted document total — unreconciled; not L1 decision evidence.”**

## Validation

| Check | Result |
|---|---|
| Shared matrix, CI quote-state, cost-decision, and cost-evidence focused suites | 6 files, 25 tests passed |
| All-three-report active and legacy quote-rendering parity | Passed; CL, CI, and FR emitted identical shared evidence sections for each fixture state |
| R0 reusable evidence fixture suite | Passed after replacing a stale source-text assertion with a renderer-independent behavioural contract assertion |
| Production build | Passed; Vite and server outputs completed, including stable entry assets |
| TypeScript same-base comparison | 999 inherited diagnostics on current main and 999 on this branch; no touched-path diagnostic and no new error-code category |
| Full suite same-base comparison | Current main and final branch each: 28 failed files, 54 failed tests, 9,249 passed, 3 skipped; identical failing identifiers; no Phase 3 report-path failure |

## Remaining acceptance boundary

The implementation evidence proves the renderer contracts and server-generated document parity. Authorised post-publication portal observation is still required to confirm the specific claim’s evidence state is displayed as expected in the authenticated UI. This does not authorise populating L1 or L2 where active, same-basis, reconciled evidence is absent.
