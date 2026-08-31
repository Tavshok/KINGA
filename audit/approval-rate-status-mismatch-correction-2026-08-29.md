# Approval-Rate Status-Mismatch Correction

**Branch:** `fix/post-p0-report-remediation`  
**Scope:** One held correctness correction. No schema, migration, CL/CI/FR, P0 security, payment, policy, or settlement change.

## Verified status mapping

The live `claims.status` column is an enum that contains `completed` and does **not** contain `approved`. The checked-in Drizzle declaration matches the live database. The authorised claim workflow makes this semantic explicit: `claims-core.acceptSettlement` transitions a claim in `payment_authorized` workflow state to `workflowState = closed` and `status = completed`.

The use of `completed` as the final successful claim outcome is also consistent with existing claim workflow guards, intelligence-platform completion aggregates, and panel-beater claim-completion aggregates. The portfolio metric's prior comparison against `status === "approved"` was therefore unreachable for the physical claims table.

## Correction

`resolvedPlatformReportCollection` now uses a named `APPROVED_OUTCOME_STATUSES` set containing `completed`. The explanatory comment records both the physical enum constraint and the authorised settlement completion transition. `approvedCount` now counts those completed claim outcomes, and derived Approval Rate consequently has a meaningful numerator.

The Claims Manager portfolio report now displays the same `Approval Rate` KPI as the Executive portfolio report, computed from the same canonical `portfolio.approvedCount` and `portfolio.totalClaims` values.

## Regression and parity proof

The new live-TiDB owned-fixture regression creates exactly three tenant-scoped claims in one report period: one `completed`, one `rejected`, and one `submitted`. It verifies `totalClaims = 3`, `approvedCount = 1`, and `rejectedCount = 1`, then renders both report keys and requires their displayed Approval Rate to be exactly **33.3%**.

An independent disposable parity render used the same claim mix and report window. It produced Executive Approval Rate **33.3%** and Claims Manager Approval Rate **33.3%**. The fixture cleanup was confirmed with a follow-up read-only query returning zero remaining claims.

Focused live test result: **2 files passed, 2 tests passed**. The bundled server build and Vite production build also passed. The Vite build retained its existing large-chunk advisory.

## Related status-literal search

| Location | Finding | Treatment |
|---|---|---|
| `server/reporting/resolvedPlatformReportCollection.ts` | `status === "approved"` was an unreachable portfolio approval predicate. | **Fixed in this commit.** |
| `server/reporting/reportDefinitions.ts` legacy executive summary/full-report functions | Retired generator functions retain raw `status = 'approved'` calculations. Their report keys and active dispatch paths were removed in the earlier held retirement phase. | **Flagged as dormant retained code; not changed to avoid reopening the verified retirement scope.** |
| `client/src/pages/FleetManagerDashboard.tsx` | Its Fleet Summary's `Approved` count filters `claim.status === 'approved'`, which is likewise unreachable for current claim rows. Other nearby terminal-display checks redundantly include `approved` alongside `completed`. | **Flagged separately as a live dashboard-label/count correction, outside this portfolio-report metric scope.** |
| `client/src/pages/ExternalAssessorDashboard.tsx` | A completed-assignment grouping retains `approved`, but it is an assignment presentation grouping rather than an approval-rate or portfolio aggregate. | **Flagged separately; not changed here.** |
| `server/routers/reports.ts` | Alternate executive PDF uses `closed`, not invalid `approved`, as its completion condition. This is a separate status-definition consistency question rather than the unreachable-literal defect. | **Not changed in this correction.** |

All other `approved` occurrences from the full source search were attached to different table/domain status fields such as quotes, policies, relationship approvals, marketplace approvals, or calibration approvals and were not claim-status comparisons.
