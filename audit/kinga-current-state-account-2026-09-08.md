# KINGA Current-State Account

**Date:** 8 September 2026  
**Purpose:** A factual account of what has been completed, what is currently stable, what remains open, and the next controlled work sequence.

## Executive position

KINGA has moved from an unstable mix of managed-workspace divergence, report inconsistency, and several confirmed tenant-isolation defects to a **reconciled, checkpointable workspace with no open pull requests**. The project has not reached a global-green TypeScript or full-suite state; that pre-existing engineering debt remains visible and must not be described as resolved.

The current GitHub `main` tip returned by the GitHub API is `a3ad7af9b65ce13440da87b07a0d2c57e855d7c5`. The managed workspace is checkpointed at `29aadc20`; it retains a local, uncommitted backlog-only update for this account. The GitHub PR inventory returned zero open pull requests at the time of review.

| Area | Current position | Confidence |
|---|---|---|
| Managed workspace | Checkpointing recovered after non-destructive reconciliation; no runtime conflict was required to recover it. | Verified |
| GitHub review state | No open PRs. Clean, independently revalidated replacements were merged; obsolete contaminated PRs were closed without deleting source branches. | Verified |
| Vehicle Passport | Missing ORM import and documented tenant-scoping weaknesses were remediated and tested with owned live fixtures. | Verified for merged scope |
| Report quotation presentation | CL, CI, and FR use a shared canonical quote-evidence section and common cost-state presentation. | Verified for merged scope |
| Claims Intelligence printing | The viewer prints its iframe document; stale physical page counters were removed and document print structure was validated. | Verified for merged scope |
| Global TypeScript health | 1,012 diagnostics remain in the managed workspace. This is baseline debt, not a green result. | Open risk |

## Work completed and merged

The controlled review sequence deliberately did not merge every historical branch as-is. Where a branch contained unrelated checkpoint artifacts, stale metadata, or historical changes, its intended valid change was rebuilt or applied on a clean current-main branch, revalidated, and then merged. The following table records the substantive outcomes.

| Workstream | Delivered outcome | Safeguard and evidence |
|---|---|---|
| Root application availability | Restored the public Home bootstrap path and later eliminated the duplicate `useAuth` import that prevented the client from compiling. | Isolated browser render confirmed the root view loaded without the duplicate-identifier error. |
| Vehicle Passport runtime correction | Added the missing Drizzle `inArray` import used to filter insurer invitation states. | Owned fixture demonstrated `invited`, `viewed`, and `responded` records returned while `withdrawn` was excluded; populated panel did not use the fallback. |
| Vehicle Passport tenancy | Enforced non-empty session-tenant admission and request-tenant scoping for Passport aggregate, timeline, history, signal, alert, confidence, inspection, damage, and renewal-risk data. | Owned live fixtures covered tenantless denial, unrelated-tenant denial, same-tenant data, and the invitation exception limited to pre-loss snapshots. |
| Vehicle identity containment | Cross-tenant VIN/registration collisions no longer mutate the existing tenant’s vehicle row or attach the incoming claim. A system claim event records containment. | Owned fixture proved no foreign-row mutation, duplicate vehicle, or claim attachment. |
| Police badge history isolation | Police officer badge lookup and concentration history now require badge plus tenant and fail closed without a tenant. | Owned live same-badge/two-tenant regression proved foreign history exclusion and same-tenant retention. |
| Quote comparison presentation | CL, CI, and FR now share one canonical quote-evidence presenter. It separates active comparison from historical submissions and includes explicit `Not quoted` cells. | Permanent legacy and owned active/reconciled multi-quote parity regressions rendered all three tiers and compared their shared sections. |
| Cost-state presentation | CL, CI, and FR now share a cost-integrity-only state presenter. It labels unreconciled submitted totals distinctly from qualified L1, partial evidence, final L2, and unavailable states. | Four state-specific cross-tier parity cases passed. The state presenter opens no database connection. |
| Claims Intelligence print path | CI printing now targets the loaded iframe document. Generated document footers use stable section labels rather than inaccurate physical page counts; A4 section-break behavior is explicit. | Browser route, iframe print interception, generated-document regression, and local A4 PDF inspection passed. |
| Engineer handover and audits | Engineer documentation and four governed audit reports were retained in documentation-only changes. | Audit recovery was split from stale metadata and merged as one clean four-file PR. |
| External staging foundation | The optional external-staging runtime/readiness foundation and its package-manager workflow were repaired and merged only after dedicated runtime contract validation. | Managed deployment remains compatible unless explicitly configured for external staging. |

## What was deliberately *not* changed

No reconciliation action changed claim or quotation records, production data, database schema, DDL, migrations, payment/settlement behavior, or report regeneration. The work did not implement a cross-insurer intelligence network, vehicle portability, SAR/privacy changes, currency conversion, benchmark selection policy, or the historic evidence reconstruction required for a final legacy L2.

This boundary is important. The improvements make the application’s presentation and tenant boundaries more honest; they do **not** turn incomplete historical source evidence into a valid financial decision.

## Current report and evidence position

The Package A trace for claim `DOC-20260810-84080652` established that two visible submissions are **legacy, comparison-only** history rather than active eligible quote evidence. The correct state remains: no qualified L1 and no final L2. Package B and Package C now ensure that, when this state is presented, it is labelled as historical/unreconciled rather than promoted to a saving, settlement, payable amount, or decision-quality L1/L2 figure.

Package D addresses the separate CI printing failure. It does not regenerate historic reports or create missing underlying quote evidence. Future generated CI reports should use the corrected full-document print path after deployment of merged `main`.

## Remaining risks and open work

The backlog contains **388 open items** and **1,026 completed items**. The large open number is historical and includes long-term roadmap, audit, and staging work; it should not be interpreted as 388 active production incidents. The following items are material to the next controlled sequence.

| Priority | Item | Current status | Recommended next action |
|---|---|---|---|
| High | Global TypeScript debt | 1,012 diagnostics remain, including `canonicalClaimIntake` event-payload typing, `legacyQuoteEvidence` status mismatch, and nullable write-off inputs. | Establish a fresh baseline file and address in small typed batches; do not describe CI as green until then. |
| High | Stage 6 live degradation | A separate live run reported `calculateOverallSeverity is not defined`. It was explicitly kept out of Package C/D. | Open a new P0-style investigation, capture claim-independent reproduction, and fix only after root cause is proved. |
| High | Historic quote evidence reconstruction | Legacy claim data lacks page/row provenance necessary for a final all-in L2, savings figure, or settlement recommendation. | Complete controlled document-to-row transcription and reconciliation before publishing an all-in decision. |
| High | Governance export placeholder | The requested governance-export phase has not begun. | Confirm whether a canonical tenant-scoped governed export can be implemented or whether the control should be disabled pending product decision. |
| High | DRV-006 | Repairer/driver signal tenant-isolation remediation has not begun. | Start as a dedicated review branch with owned two-tenant fixture evidence. |
| Medium | DRV-007 and DRV-008 | Stakeholder report scope/contract drift has not begun. | First verify physical schema contract, then make separate scoped corrections. |
| Medium | DRV-009 and DRV-015 | These remain investigation items, not approved data corrections. | Trace orphaned police-report relation coverage and vehicle portability/identity behavior before any mutation. |
| Medium | Package D deployment confirmation | The fix is merged, but the managed preview currently shows an **Upgrade Required** gate rather than an application regression. | Publish from the current checkpoint only when the platform’s subscription/hosting gate is resolved; then repeat a production CI print smoke test. |

## Recommended next sequence

The safe next sequence is: first verify the governance export placeholder and decide whether it can be implemented safely; second, open a separate root-cause task for the Stage 6 severity runtime error; third, remediate DRV-006 using owned two-tenant fixtures; and only then consider DRV-007/008. Historic L2 reconstruction should continue as a controlled evidence-governance exercise, separate from report presentation work.

> **Operational rule:** each change should remain on its own clean branch, be tested against a current-main baseline, and be merged only after its runtime and tenant-boundary scope is independently verified. Stale workspace metadata, generated version files, and composite checkpoint history must not be used as a substitute for a clean reviewable change.

## References

1. [`todo.md`](../todo.md) — controlled project backlog and completion history.
2. [`Package A canonical quote-ledger trace`](package-a-canonical-quote-ledger-trace-2026-09-08.md) — governed legacy-evidence and L1/L2 conclusion.
3. [`Driver risk-profile discovery`](driver-risk-profile-discovery-2026-09-08.md) — DRV findings and identity boundaries.
4. [`Cross-stakeholder fraud discovery`](cross-stakeholder-fraud-data-discovery-2026-09-08.md) — police/repairer findings and governance limits.
5. [`Vehicle/policy portability discovery`](vehicle-policy-portability-and-agency-origination-discovery-2026-09-08.md) — vehicle ownership and Passport boundary findings.
