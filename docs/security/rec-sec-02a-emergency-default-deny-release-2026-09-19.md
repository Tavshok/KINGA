# REC-SEC-02A: Emergency Recovery-Sweep Default-Deny Release

**Status:** Review-only source hotfix. It has not been merged or published.

## Purpose

REC-SEC-02A closes the live broken-function-authorization path immediately when no separately configurable Manus pre-application route-control surface is available. It registers the exact `POST /api/scheduled/recovery-deadline-sweep` denial after KINGA's pre-existing maintenance gate but before every body parser. In normal operation, every caller and request body representation therefore receives the same generic `404` response.

The handler performs no session authentication, capability verification, database access, recovery-case scan, notification, suppression update, scheduler work, or logging of request credentials. It has no success path. The answer is the same for anonymous requests, human session cookies, cron-looking cookies, scheduler-looking headers, bearer values, malformed JSON, and bodies larger than the ordinary API parser limit. When the existing maintenance gate is enabled, its deliberate global `503` preemption remains in force for every protected route, including this one.

## Scope and safety boundary

This is a temporary emergency containment at the application boundary, not an edge policy and not the full REC-SEC-02 implementation. It leaves unrelated routes unchanged, including `/readyz`, the root application, tRPC, intake escalation, stuck recovery, and keep-warm.

The existing in-process startup call remains a separate behavior. It is not reachable through the public HTTP route, but it is not made fenced or idempotent by this package. The full REC-SEC-02 package remains the required follow-on to implement dedicated non-human capability admission, lease fencing, durable effects, notification-result correctness, and adversarial concurrency controls.

No database migration, scheduler change, credential issuance, capability record, deployment configuration, or Package G work is included. No default-deny release is a scheduler activation. Any existing external caller of this specific route will receive the same `404` and must remain paused until a separately approved full capability implementation and activation plan exist.

## Validation required before review

The tests must compose the real application in normal operation and prove all representative callers receive the same generic `404`, including the Express trailing-slash representation, malformed JSON, and an oversized JSON body. A separate composed test must confirm the deliberately enabled maintenance gate remains the sole global preemption. The route registration must no longer contain `sdk.authenticateRequest` or call `checkRecoveryDeadlines`. Validation must use `kinga_ci_test` only; no production request may invoke the sweep.

## Publish decision

Merging and publishing this package will deliberately disable the public recovery-deadline sweep endpoint immediately. That is the intended containment effect. Because it changes live behavior, it requires explicit owner approval after the review pull request and hosted checks are complete.

## References

[1]: https://manus.im/docs/website-builder/publishing "Manus Publishing"
[2]: https://manus.im/docs/website-builder/cloud-infrastructure "Manus Cloud Infrastructure"
[3]: https://github.com/Tavshok/KINGA/blob/b4b6723e/server/_core/index.ts#L213-L241 "Vulnerable recovery-deadline sweep route before REC-SEC-02A"

## Supersession note — 20 September 2026

This document is retained as historical REC-SEC-02A design evidence. Its original status line became stale when PR #125 merged the temporary default-deny source into `main`; it must not be read as the current repository state.

The owner has now decided to retire the recovery-deadline sweep rather than continue emergency route containment. The source registration for `POST /api/scheduled/recovery-deadline-sweep`, the temporary REC-SEC-02A denial handler, the in-process startup invocation, and the global scanner were deleted together. An ordinary request to the removed path now reaches normal Express `404` fall-through. The separate update-triggered `checkSingleCaseDeadline` behavior and manual Recovery Portal visibility remain.

The durable REC-SEC-02 capability, fencing, lease, and outbox proposal is not part of this retirement and must not be merged to restore the retired sweep. It remains the required architectural pattern if proactive deadline automation is later rebuilt as a separately approved product feature.
