# Recovery-Deadline Sweep Retirement

**Date:** 20 September 2026
**Decision:** Owner-authorized minimal retirement
**Implementation branch:** `fix/retire-recovery-deadline-sweep`

## Decision and product tradeoff

The recovery-deadline sweep is retired because there is effectively no real recovery-case volume to justify preserving a vulnerable global automation path as emergency security work. The owner accepted the deliberate shift from periodic proactive reminders and lapsed-case discovery to manual Recovery Portal monitoring plus the existing update-triggered single-case check.

This is not a claim of feature equivalence. The removed scanner was the only time-driven mechanism that could discover an unchanged case entering the 90-, 60-, 30-, 14-, or 7-day windows or becoming lapsed. The retained Portal is pull-based, and `checkSingleCaseDeadline()` runs only after an authorized case update.

## Deleted behavior

The source registration for `POST /api/scheduled/recovery-deadline-sweep` is deleted. Its temporary REC-SEC-02A default-deny handler and route-only tests are also deleted. The path now has no route owner and reaches ordinary Express `404` fall-through in normal mode.

The exported `checkRecoveryDeadlines()` global cross-case scan is deleted, along with its 15-second server-startup invocation and the timer/checker dependencies in maintenance startup orchestration. Normal startup now starts only intake escalation and stuck-assessment recovery. The maintenance warning names only those retained writers.

The normal request parsers remain unchanged for every route, including retained scheduled endpoints. A well-formed request to the removed path reaches ordinary Express fall-through with no session authentication, database access, or notification work; malformed or oversized JSON continues to receive the established parser rejection rather than broadening a retired feature into a namespace-wide parser exception.

## Retained behavior

The update-triggered `checkSingleCaseDeadline(caseId)` function remains. Authorized, tenant-scoped `recovery.updateCase` calls it after persisting a case update. Threshold selection, duplicate suppression, lapsed-case handling for the updated case, `sendAlert`, owner notification, and the alert-sent timestamp remain unchanged.

Recovery deadline columns, indexes, and schema remain. The Recovery Portal and case-detail page still expose deadline and status data. The portal retains its 90-day approaching-deadline aggregate, case-table deadline chips and status values, status tabs, and the detail warning and Key Dates fields.

The keep-warm, intake-escalation, and stuck-recovery endpoints remain. Their existing behavior and harmless unauthenticated denials are covered by focused production-composition tests. Generic cron-session compatibility remains, with its fixture renamed to the retained intake-escalation identity. Maintenance middleware is unchanged.

## Deferred capability gap

> Recovery Portal lacks proactive deadline notifications (90/60/30/14/7-day, lapsed-case) and a true stalled-case indicator since the vulnerable automated sweep was removed. Rebuild this properly as a real feature — using the already-designed REC-SEC-02 fencing/lease/outbox pattern — when recovery case volume justifies it, not as emergency security work.

The source portal has only a 90-day approaching count. Its click-through currently sets an `approaching` tab that has no status mapping, and `recovery.getCases` has no deadline-only input. The click-through therefore does not produce a deadline-filtered queue. This limitation is preserved as a tested source contract and an append-only backlog item; no recovery UI feature work is included here.

A future rebuild must be separately approved as product work. It must use a dedicated non-human capability, fenced lease, durable outbox, idempotent effects, and concurrency-safe delivery semantics from the REC-SEC-02 design. The old route or unfenced global scanner must not be restored.

## Validation

Focused tests cover normal-mode ordinary 404 fall-through for well-formed and trailing-slash forms; absence of authentication, database, and notification work on the removed path; preserved malformed/oversized JSON parser behavior for retained scheduled endpoints; startup of only the two retained writers with no timer; update-triggered single-case notification and suppression; authorized router update invocation; maintenance coverage without a recovery-specific case; retained scheduled-route behavior; generic cron compatibility; and Recovery Portal/manual deadline and status source contracts.

The source-contract test is intentionally narrow. A rendered frontend integration test would require introducing and stabilizing browser-DOM infrastructure not used by the repository's Node-only Vitest configuration. That unrelated frontend refactor would widen this security retirement. The contract instead verifies the exact portal table columns, deadline chip, 90-day KPI, case-detail warning and key dates, while also locking in the documented absence of a deadline-only queue.

All Vitest execution uses the repository guard and the dedicated loopback `kinga_ci_test` database target. The implementation also requires `pnpm check:server`, selected-file formatter validation, `git diff --check`, a no-global-scan source reference check, and changed-path TypeScript comparison against reviewed current main.

## Non-deployment and external-schedule scope

This change is source-only and remains uncommitted for review. It does not deploy or publish the application. It does not alter production or staging databases or data, schema or migrations, maintenance settings, credentials, schedules, GitHub Actions, Render, WorkOS, or any external platform configuration.

Historical evidence found no confirmed active recovery endpoint schedule, but this implementation does not re-query or modify external schedules. Any future release owner must perform a separate read-only schedule inventory and retire a stale external caller through separately authorized schedule governance. A stale caller to the deployed new source will receive ordinary application fall-through; that fact does not authorize schedule changes.

## References

[1]: https://github.com/Tavshok/KINGA/blob/2d0b634d99d59af3c6893d9b0c96f3404c3ab1be/audit/rec-sec-recovery-sweep-removal-scope-2026-09-20.md "Verified recovery-deadline sweep removal scope"
[2]: https://github.com/Tavshok/KINGA/blob/2d0b634d99d59af3c6893d9b0c96f3404c3ab1be/server/recovery/recoveryDeadlineAlerts.ts "Pre-retirement recovery deadline alert implementation"
[3]: https://github.com/Tavshok/KINGA/blob/2d0b634d99d59af3c6893d9b0c96f3404c3ab1be/client/src/pages/RecoveryPortal.tsx "Recovery Portal manual deadline and status visibility"
[4]: https://github.com/Tavshok/KINGA/commit/264512db3ba959cc6cd8a2da7de4034f9d0e6c9a "REC-SEC-02 durable capability, fencing, lease, and outbox design"
