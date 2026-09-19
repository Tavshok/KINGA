# Recovery-Deadline Sweep Authorization Review

**Date:** 19 September 2026

**Author:** Manus AI

**Scope:** Read-only review of `user_github/main` at `b4b6723e`, covering `POST /api/scheduled/recovery-deadline-sweep`.

**Status:** **Requires a separately approved containment and source-fix package. No production, staging, deployment, database, scheduler, credential, or route change has been made.**

## Conclusion

The recovery-deadline sweep has a **high-severity broken-function-authorization defect**. In normal operation, any active authenticated human account can send a `POST` request to the endpoint and start a global recovery-case sweep. The endpoint does not require a dedicated scheduler identity, a cron identity, a task identifier allow-list, a role, or a tenant-scoped authority. Its own source comment states that any authenticated session is sufficient. [1]

The sweep can read recovery cases across tenants, send owner notifications that include operational case and claimant-related details, and update each notified case’s alert timestamp. This is not merely a read-only diagnostic endpoint. A normal user can therefore trigger cross-tenant operational work and owner-facing communications. [2]

The endpoint is also not concurrency-safe. It can overlap with the maintenance-mode-controlled startup sweep and with other HTTP calls, and it has no database lease, transaction-level claim, or idempotency mechanism around the notification-plus-timestamp effect. Concurrent callers can both observe an eligible case before either writes the suppression timestamp, producing duplicate notifications. [1] [2] [3]

## Verified authorization path

The route at `server/_core/index.ts` calls `sdk.authenticateRequest(req)` and discards the returned user. It then calls `checkRecoveryDeadlines()` with no authorization decision based on that user. The route accepts a valid regular session as well as a `cron_` session, but it does not distinguish the two. [1]

`authenticateRequest` validates the cookie JWT, resolves a current active user for normal identities, and returns the user. It does not apply route-specific role or tenant authorization. Its regular-user update of `lastSignedIn` is a secondary write caused by every successful interactive invocation. [4]

Maintenance mode blocks the application stack with a `503` response and therefore suppresses this endpoint while a maintenance freeze is active. That protection is operational, not authorization. When maintenance mode is off, it does not prevent an ordinary authenticated person from invoking the global sweep. [5]

## Verified effects and exposure

`checkRecoveryDeadlines()` queries all non-terminal recovery cases whose deadline is on or before the 90-day look-ahead date. The query has no tenant predicate and no lower deadline bound, so it can include overdue cases and approaching cases from every tenant. [2]

For an eligible case, the service builds an owner notification that includes the recovery-case identifier, claim number, deadline, third-party and insurer names, amount, score, status, and portal path. It calls `notifyOwner` and then writes `recovery_deadline_alert_sent_at`. The current logic does not check whether `notifyOwner` returned `false`, so it can record suppression even when the notification service did not accept delivery. [2] [6]

The current route therefore combines broad authorization, global data selection, external notification, and persistent mutation. The missing route-level authority control is material even if the expected caller is a scheduler.

## Concurrency assessment

At ordinary startup, `startMaintenanceSensitiveJobs` starts the normal writers and schedules a one-shot recovery-deadline sweep after 15 seconds. The route comments separately describe a daily scheduled caller. The repository does not prove whether an external task is currently registered, but it does prove that HTTP and startup paths can independently call the same function. [3] [1]

Neither the route nor `checkRecoveryDeadlines` has an in-flight guard, durable execution lease, transactionally claimed work row, or outbox/effect idempotency key. Two requests can read the same unsuppressed case, both send an owner notification, and then both update the alert timestamp. The existing rate limiter applies to `/api/trpc`, not this REST route. [1] [2]

## Existing test coverage

The repository verifies that maintenance mode blocks the endpoint and that the startup helper schedules one deferred sweep when maintenance is off. Those tests do not exercise normal-mode human authorization, dedicated scheduler authorization, effect delivery failure, cross-tenant selection, or overlapping execution. [3] [5]

No direct test was found for the route’s authorization policy or for the sweep’s notification and timestamp effect contract. This absence makes the current broad permission especially risky because it can regress without an endpoint-specific test failure.

## Recommended staged response

| Stage                       | Recommended action                                                                                                                                                                                                                                                                                                                | Scope and stop condition                                                                                                                                                                         |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Immediate containment       | At the deployment edge, deny interactive human traffic to `POST /api/scheduled/recovery-deadline-sweep` and allow only the known scheduled-caller path after verifying that identity and network boundary. Suspend any external scheduled invocation until that control has been independently verified.                          | Requires an owner-approved deployment or edge-configuration package. Do not assume maintenance mode, a generic user-role cookie, IP address, proxy header, or task name is an authority control. |
| Source remediation proposal | Design a dedicated non-human authorization mechanism with exact capability authorization, request limits, generic failure responses, and a durable single-execution/fenced lease plus transactional effect idempotency. The design should address a failed notification result before writing any delivery-suppression timestamp. | Keep this a distinct, narrowly reviewed remediation package. It must not be silently folded into G1 or activate Package G routes.                                                                |
| Test evidence               | Add adversarial route tests proving that ordinary human sessions, wrong machine capability, malformed credentials, and concurrent requests cannot trigger duplicate work. Add durable-effect tests proving a failed owner notification does not mark delivery as complete.                                                        | Run only against `kinga_ci_test`; no live database or external notification call is permitted.                                                                                                   |

## Relationship to Package G

Package G1 has been approved as a future design and source-implementation track for service principals plus scheduler fencing. This finding is related in architecture but is **not automatically resolved by G1**. The current recovery-deadline endpoint must remain out of G1 activation and receive its own reviewed containment and migration decision. G1 must not be used to quietly change or activate this route.

## References

[1]: https://github.com/Tavshok/KINGA/blob/b4b6723e/server/_core/index.ts#L203-L231 "Recovery-deadline HTTP route and current authorization"
[2]: https://github.com/Tavshok/KINGA/blob/b4b6723e/server/recovery/recoveryDeadlineAlerts.ts#L120-L225 "Recovery deadline selection, notification, and timestamp update"
[3]: https://github.com/Tavshok/KINGA/blob/b4b6723e/server/_core/maintenance-write-jobs.ts#L1-L40 "Maintenance-sensitive startup scheduling"
[4]: https://github.com/Tavshok/KINGA/blob/b4b6723e/server/_core/sdk.ts#L330-L378 "Session authentication and active-user resolution"
[5]: https://github.com/Tavshok/KINGA/blob/b4b6723e/server/_core/maintenance-mode.production-stack.test.ts#L75-L90 "Maintenance-mode endpoint suppression test"
[6]: https://github.com/Tavshok/KINGA/blob/b4b6723e/server/_core/notification.ts#L66-L113 "Owner-notification result contract"
