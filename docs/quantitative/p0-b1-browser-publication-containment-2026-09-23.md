# P0-B1 Browser Fraud Publication Containment

**Date:** 2026-09-23
**Status:** Merge-ready; review pull request pending
**Scope:** Owner-approved narrow hardening package for six known browser publication locations. It is separate from the paused P0-B1 integration and does not authorize P0-B1-Client or P0-B2 work.

## Purpose

P0-B1’s existing server and report boundaries did not protect two active browser surfaces. `ClaimReviewDialog` independently fetched full claim, assessment, assessor-evaluation, and quote records, then rendered stored fraud score, level, flags, and indicators in four locations. The Executive Dashboard alert bar independently displayed `fraudFlagCount` and `highRiskCount` as fraud review conclusions.

The P0 policy is fail closed: stored legacy fraud values cannot govern or be published as fraud risk, routing, certification, or decision evidence until a qualified owner-approved automated policy exists. Withholding must remain actionable: it must name the missing evidence and the resolution path.

## Implemented boundary

### Claim Review

`claims.getReviewView` is a new tenant-scoped projection for `ClaimReviewDialog`. It performs the same tenant-owned claim check and external-assessor assignment restriction as the existing claim-detail route. It obtains the assessment, accepted assessor evaluation, and quotes only after the claim is authorized, then returns an explicit allowlist of descriptive claim, repair, cost, workflow, and human-assessor fields.

The DTO omits stored `fraudRiskScore`, `fraudRiskLevel`, `fraudFlags`, `fraudIndicators`, `fraudScore`, and any equivalent field. It appends the immutable shared P0-B1 `FRAUD_DECISION_WITHHELD` contract. The client now consumes this DTO rather than four raw endpoints, and each former fraud display renders `P0FraudValidationHold` with the full shared actionable abstention.

The four replaced locations are the Claim Review overview authority card, the assessor-recommendation summary, the KINGA assessment fraud-indicator card, and the assessor timeline-and-risk card. Claim, cost, damage-description, quote, readiness, and documented assessor evidence remain visible.

### Executive Dashboard alert bar

The alert bar no longer reads `fraudFlagCount` or `highRiskCount`. Its two fraud-conclusion cards are replaced by the same full P0-B1 actionable hold. The independently sourced SLA-breach counter remains unchanged.

The adversarial review also found that the legacy SLA counter fell back to `highRiskCount` when `slaBreachedCount` was absent. This incorrectly relabelled a fraud-derived conclusion as an SLA measure in the same alert bar. The fallback has been removed: the alert now reads only `slaBreachedCount` and uses zero when that independently sourced metric is unavailable. The regression explicitly rejects the former `highRiskCount` fallback.

## Explicit exclusions

This package addresses only the owner-approved six display locations. It does not remediate every remaining client fraud-field consumer. In particular, the Executive Dashboard contains other fraud-derived chart and KPI paths outside this alert-bar scope; they are part of the separately required P0-B1-Client package. No automated-decision, fraud-routing, report-template, export, or server API policy outside the new Claim Review projection was expanded here.

## Regression evidence

`server/p0B1BrowserContainment.test.ts` verifies all of the following:

1. The Claim Review projection preserves descriptive claim, repair, cost, assessor, and quote content while removing stored fraud scores, levels, flags, indicators, and adversarial marker values.
2. The client uses `claims.getReviewView` rather than the four raw procedures, while the server route preserves tenant and external-assessor authorization before data reads.
3. All four Claim Review fraud displays use the full shared actionable hold and no longer read raw fraud fields.
4. The Executive Dashboard alert-bar segment uses the shared full hold and no longer reads the two raw fraud counters.
5. The SLA alert cannot use `highRiskCount` as a fallback source.

The guarded focused matrix passed **7 test files / 27 tests**:

- `server/p0B1BrowserContainment.test.ts`
- `server/claimsCoreTenantAuthority.p0.test.ts`
- `server/evidence-governance/p0FraudDecisionHold.test.ts`
- `server/p0B1IndependentBypassHardening.test.ts`
- `server/p0B1IndependentBypassHardening.ui.test.ts`
- `server/p0B1PublicationHardeningII.test.ts`
- `server/p0B1PublicationHardeningII.ui.test.ts`

`git diff --check` passed. The new containment test is Prettier-formatted. The repository-wide TypeScript command still reports inherited diagnostics; no diagnostic is located on the new projection or client containment edits.

### Adversarial review

One fresh read-only adversarial review initially blocked the package because the Executive alert-bar SLA display fell back to `highRiskCount`. The repair removed that fallback, added a provenance regression, and passed the required fresh re-review. The final review approved the explicit Claim Review allowlist, tenant and external-assessor ordering, all four Claim Review holds, the two Executive alert-bar replacements, and the strict separation from the deferred P0-B1-Client estate. The review recorded no remaining blocker or non-blocking remediation for this package.

### Merge-readiness validation

The full guarded suite completed against the isolated `kinga_ci_test` database with **614 passing files, 1 skipped file, 9,719 passing tests, and 4 skipped tests**. The configured `pnpm build` command cannot execute from this isolated Git worktree because the managed-project runner rejects the worktree directory. The equivalent production build completed successfully with `vite build` followed by the server `esbuild` bundle. It produced only existing bundle-size warnings; there was no build error.

## Required next steps

1. Commit, push, and open a dedicated review PR. The owner has pre-approved merge after the hosted quality checks pass.
2. Resume the already approved P0-B1 integration only after this package merges.
3. Treat P0-B1-Client as the next separately scoped closure package before P0-B2; it must cover the broader reachable client fraud-field inventory, including the remaining Executive Dashboard fraud-derived paths.
