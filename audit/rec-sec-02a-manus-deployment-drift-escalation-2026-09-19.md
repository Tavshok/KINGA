# REC-SEC-02A: Manus Deployment-Drift Escalation

**Date:** 19 September 2026  
**System:** KINGA production site  
**Public domain:** `https://kingaai-ybs42lwg.manus.space`  
**Severity:** P0 — broken-function authorization remains live  
**Prepared by:** Manus AI

## Requested Platform Action

Please identify the backend revision that is currently serving the production domain, especially `POST /api/scheduled/*`, and immediately bind the domain to the current KINGA WebDev backend revision. The Manus project interface reports that the site has been updated and published, but the public API continues to execute an older handler. This is a security incident because the intended emergency authorization fix is not present in the live execution path.

The platform should perform a **full backend rebuild and deployment**, not a frontend-only update. It should also apply the currently configured `KINGA_MAINTENANCE_MODE=true` environment setting to the active backend instance. That temporary setting is an owner-authorized global containment control. Its absence from the live responses confirms that the public backend is not using the current managed project configuration.

Please confirm, in writing, the deployed backend revision and the component or route owner handling `/api/scheduled/*`. Do not remove the public domain, change application credentials, create a scheduler credential, or add a scheduler exception as part of this investigation.

## Incident Summary

KINGA previously exposed `POST /api/scheduled/recovery-deadline-sweep` to an inadequate scheduled-request authorization path. REC-SEC-02A replaces the route with a generic, unconditional `404 {"error":"Not found"}` denial before request-body parsing. It accepts no human session, cron-like cookie, task header, bearer placeholder, IP convention, or scheduler exception. The fix was merged through GitHub pull request #125 after required checks passed. [1]

The merged source was synchronized into the managed WebDev workspace and checkpointed as `c1c8eebb`. The project UI then accepted **Publish latest version** and displayed that the public site had been updated. However, the primary public domain still returned the older response `403 {"error":"permission error for cron cookie"}`. That response cannot be produced by either REC-SEC-02A or the separately prepared durable REC-SEC-02 implementation.

The owner then authorized emergency global maintenance containment. The managed project environment received `KINGA_MAINTENANCE_MODE=true`, and the existing production-stack maintenance tests passed locally. A second checkpoint, `ecda86cd`, was created and the publishing interface again acknowledged publication. A fresh public check still returned the older recovery-route `403` and served the application root with `200`, rather than the expected maintenance `503`. The public backend is therefore detached from both the current source and the current managed environment configuration.

> **Current safety status:** The intended P0 source default-deny is merged and published in the project interface, but it has not been demonstrated in the live public API. The owner-authorized maintenance control also has not reached the live public API. The P0 must remain open until a fresh anonymous live check proves the expected behavior.

## Evidence

| Item | Expected current behavior | Actual public behavior |
| --- | --- | --- |
| `POST /api/scheduled/recovery-deadline-sweep` after REC-SEC-02A | `404` with `{"error":"Not found"}` | `403` with `{"error":"permission error for cron cookie"}` |
| Same route after maintenance configuration | Global maintenance `503` | Same old `403` response |
| `GET /` after maintenance configuration | Global maintenance `503` | `200` HTML application shell |
| `GET /readyz` after maintenance configuration | Dedicated health response remains available | `200` health JSON |
| Project publishing UI | New backend revision and environment configuration live | UI reports “site has been updated,” but the public API continues serving an earlier revision |

The probes were anonymous and used only harmless placeholder values. No real user session, scheduler credential, capability, secret, or personal data was used. Cache-busting query parameters and the code-bearing public link variant produced the same old response. A bounded five-attempt verification window also remained on the old handler.

## Authenticated-Request Status

The live `403 {"error":"permission error for cron cookie"}` is **not evidence that a valid human application session is denied**. It establishes only that the anonymous and placeholder callers used in the safe verification matrix did not pass whatever older gate is currently running.

The repository revision immediately preceding the emergency fix authenticates the request with `sdk.authenticateRequest(req)` and, after any valid session succeeds, calls `checkRecoveryDeadlines()` without an `isCron`, role, task, capability, or tenant-specific authorization check. If the detached public backend is serving that revision or an equivalent implementation, a valid human session would enter the global sweep and normally receive the success response after the work completes. Because sending a genuine authenticated request may itself execute the global cross-tenant work, it was intentionally **not** used as a probe. The exact live authenticated response is therefore unverified, not safely claimed as blocked.

The current production population of one human account reduces the number of potential interactive callers, but it does not prove denial and does not remove the global blast radius if that account, its session, or a future user account is compromised. The support escalation treats the deployment mismatch as an independent production-integrity incident.

## Reproduction Command

The following request is sufficient to distinguish the old backend from the intended REC-SEC-02A release. It does not require authentication or any secret.

```bash
curl --silent --show-error --include --request POST \
  'https://kingaai-ybs42lwg.manus.space/api/scheduled/recovery-deadline-sweep?deploymentCheck=recsec02a'
```

The intended source release returns `404` and `{"error":"Not found"}`. While the temporary maintenance setting is active, the expected live result is the existing generic maintenance `503` response instead. The actual result remains `403` and `{"error":"permission error for cron cookie"}`.

## Verification Required After Platform Remediation

Once the backend binding has been corrected, the following checks must be performed from the public domain before the incident is closed. The route must return the same generic `404` for an anonymous request, a human-like cookie placeholder, a cron-like cookie placeholder, a task-header placeholder, a bearer placeholder, a trailing slash, malformed JSON, and an oversized JSON body. The root and authenticated application routes must remain under maintenance `503` until the owner explicitly authorizes maintenance removal. The readiness endpoint may remain available according to the established maintenance contract.

After the owner later authorizes removal of maintenance mode, the recovery route must retain its generic `404` default denial while `/`, tRPC, intake escalation, and stuck recovery return to their intended normal behavior. No scheduler exception may be added until the durable REC-SEC-02 capability, lease, and outbox design is separately activated and verified.

## Attachments and Identifiers

The source fix is GitHub PR #125 and merge commit `4f00bfab3e8fbe3d27102f216c1fb5fed29352f2`. The project checkpoints are `c1c8eebb` for the source default-deny release and `ecda86cd` for the emergency maintenance setting. The internal publication investigation is retained separately and can be supplied on request.

The escalation message was submitted through the authenticated Manus Support messenger on 19 September 2026. It requested backend revision identification, a full backend redeploy, current configuration binding, and a written explanation of the publish/API mismatch.

## References

[1]: https://github.com/Tavshok/KINGA/pull/125 "KINGA pull request 125: REC-SEC-02A emergency recovery-sweep default denial"
[2]: https://kingaai-ybs42lwg.manus.space "KINGA public production domain"
[3]: https://help.manus.im "Manus Help Center"
