# KINGA Remediation Phase Ledger — 8 September 2026

**Ledger basis:** Remote `main` at `a3ad7af9b65ce13440da87b07a0d2c57e855d7c5` and the eight independently published review branches listed below.

## Overall position

The approved remediation programme has completed all currently actionable engineering and investigation phases as **isolated review work**. Each implementation branch was scoped to its confirmed defect, passed its focused regressions and production builds, and was compared with the known repository baseline. No branch was merged, deployed, or allowed to auto-merge.

The programme is not equivalent to a production completion: the branches remain open for review, GitHub currently reports their merge state as `UNSTABLE`, and two data-governance dispositions remain deliberately unresolved. The known full-suite baseline is **53 failing tests and 3 skipped tests**; for every implementation branch, the unique failing identifiers matched current `main` exactly. This ledger does not classify inherited failures as passing checks.

## Phase-by-phase record

| Phase | Review PR | Outcome | Scoped validation | Remaining boundary |
|---|---|---|---|---|
| Governance export placeholders | [#49](https://github.com/Tavshok/KINGA/pull/49) | Replaced fabricated zero-value PDF, CSV, and legacy outputs with explicit `PRECONDITION_FAILED` responses. | Direct tRPC contract test 2/2; governance suite 61/61; server and Vite builds passed. | A verified, single-period tenant-scoped export aggregation contract is needed before exports can be re-enabled. |
| Stage 6 severity runtime | [#50](https://github.com/Tavshok/KINGA/pull/50) | Restored missing shared-helper and PDF-direct bindings after the Stage 6 split. | Direct Stage 6 31/31; related pipeline suite 87/87; server and Vite builds passed. | No claim replay or production-claim mutation was performed. |
| DRV-006 repairer/driver signals | [#51](https://github.com/Tavshok/KINGA/pull/51) | Scoped every cross-claim evidence query to a required tenant. | Owned live fixture 3/3; related suite 50/50; server and Vite builds passed. Exact-ID teardown was verified. | No cross-insurer signal-sharing model was created. |
| DRV-007/008 stakeholder reports | [#52](https://github.com/Tavshok/KINGA/pull/52) | Repaired assessor/panel-beater registry queries, tenant scope, and truthful snapshot labels. | Owned live fixture 2/2; reporting access/definition suite 65/65; server and Vite builds passed. | Legacy registries remain snapshots because they do not carry activity-period timestamps. |
| DRV-009 orphan police reports | [#53](https://github.com/Tavshok/KINGA/pull/53) | Documented two orphan rows and absent live foreign key using aggregate-only evidence. | Read-only source, metadata, and aggregate review. | Retention, deletion, recovery, or quarantine of orphan rows needs a separately authorised data-governance decision. |
| Police-report authority defect found during DRV-009 | [#54](https://github.com/Tavshok/KINGA/pull/54) | Enforced parent-claim tenant authority for reads and OCR; OCR now updates the resolved report ID. | Owned live fixture 2/2; police suite 6/6; server and Vite builds passed. Exact-ID teardown was verified. | No orphan-row modification or schema action occurred. |
| DRV-013 agency vehicle-origin containment | [#55](https://github.com/Tavshok/KINGA/pull/55) | Refused cross-owner global-VIN reuse without revealing the existing vehicle; retained normal same-tenant registration. | Owned live fixture 2/2; agency suite 10/10; server and Vite builds passed. | This is containment only; it does not implement vehicle/policy portability. |
| DRV-015 agency-origin integrity | [#56](https://github.com/Tavshok/KINGA/pull/56) | Documented one request with a missing agency-client parent, a retained vehicle link, and no invitations/snapshots/assisted identity. | Read-only source, metadata, and aggregate review. | The request’s authorised disposition and whether further pre-loss evidence may be recorded require a business/governance decision. |

## Validation convention and baseline

| Check | Result across implementation PRs | Interpretation |
|---|---|---|
| Focused regressions | Passed for every implementation branch, using real owned fixtures where tenant/data-path behavior was changed. | The changed behavior was exercised against the actual database contract without borrowing or mutating existing business records. |
| Server bundle | Passed for #49–#52, #54, and #55. | No branch-specific server build failure was found. |
| Vite production build | Passed for #49–#52, #54, and #55. | Existing chunk-size warnings persisted but are not branch-specific failures. |
| TypeScript | Inherited diagnostics remained (1,005–1,010 depending on baseline timing); touched scopes had no new diagnostics. | The repository is not globally type-clean; branch-specific checks were isolated instead of misrepresenting that debt. |
| Full suite | Failure identifiers exactly matched current `main` for every implementation branch. | No new known test-failure category was introduced. |
| Merge automation | Every published PR has `autoMergeRequest: null`. | No unreviewed branch can merge automatically from this programme. |

## Required review and decision sequence

The engineering branches should be reviewed and, if their hosted checks become acceptable, merged in dependency-safe order: **#49**, **#50**, **#51**, **#52**, **#54**, then **#55**. The documentation PRs **#53** and **#56** may be reviewed independently. A post-merge baseline check is required after each merge because all branches currently share the same pre-merge `main` base.

Two decisions remain outside engineering authority. First, the two orphan police reports require a documented retention, quarantine, deletion, or verified recovery disposition. Second, the orphan agency service request requires a documented disposition and a decision on whether evidence recording may continue while agency-client authority is unresolved. Neither situation should be corrected by re-creating relationships, changing statuses, adding invitations, or altering schema constraints without that decision.

> No schema migration, DDL, production claim/quote/workflow change, report regeneration, deployment, policy portability mechanism, cross-tenant sharing path, or automatic merge was performed in this programme.
