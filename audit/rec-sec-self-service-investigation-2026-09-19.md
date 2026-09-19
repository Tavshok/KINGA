# REC-SEC: Self-Service Deployment and Route Reconciliation

**Report timestamp:** 2026-09-19T20:44:30Z  
**System:** KINGA Manus-hosted production  
**Status:** Investigation in progress; no additional support escalation will be initiated during this investigation.

## Initial Control-Surface Inventory

The configured project connectors contain no separate hosting, deployment, domain, content-delivery-network, cache, or production-environment connector. The available managed-project controls currently expose checkpointing, local development-server restart, managed-secret updates, rollback, database SQL execution, and debugging. They do not expose a documented publish, unpublish, domain-binding, cache-purge, force-redeploy, or environment-slot operation. This is an inventory finding only; the browser project interface is being inspected next for self-service controls not represented in the managed-project tool inventory.

The active managed project status identifies project version `ecda86cd`, while the merged emergency default-deny source was separately checkpointed as `c1c8eebb`. The public domain was previously observed serving a route response that neither revision should produce. The source and the managed configuration therefore cannot yet be treated as live deployment evidence.

**2026-09-19T20:45:50Z — direct browser inspection:** The project task interface has no visible or discoverable control labelled publish, deploy, release, domain, environment, cache, preview, or production. The available managed-project tool inventory likewise has no documented operation for unpublishing a deployment, rebinding a domain, purging a cache, selecting an environment, or forcing a production redeploy. This does not establish that the controls do not exist elsewhere in the product; it establishes that they are not present on the active task view or documented in the available project-control interface. The next self-service step is to inspect project navigation and browser-network metadata for a project settings or deployment view.

**2026-09-19T20:47:31Z — cache-bypass result:** Four fresh POST probes to the recovery path, including no-cache request directives and distinct cache-busting query strings, all returned the same `403 {"error":"permission error for cron cookie"}`. Each response had a different Cloudflare request identifier, so this is not a simple replay of one cached response. The root path, requested with the same no-cache controls, returned `503` with Express and `x-manus-proxy-mode: transparent/1` headers. That is direct evidence that the owner-authorized maintenance configuration has now reached the production application.

The recovery path does **not** receive the maintenance `503`; it receives a `403` without the Express header. The most supportable current interpretation is that a Manus/Cloudflare scheduled-route gate intercepts this path **before** the Express maintenance middleware. It is therefore not correct to describe the current state as a whole-backend deployment detachment. It is a path-specific pre-application boundary whose configuration and exact admission semantics remain undisclosed in the project controls. The `403` blocks anonymous and placeholder callers; it still does not by itself prove that a genuine human session is denied. No genuine session was used.

**2026-09-19T20:49:16Z — project menu path:** The hidden project context menu was opened directly from the KINGA project header. It presents project-level actions, including an edit/settings path and a delete path. The menu did not expose a published deployment, domain binding, cache purge, or force-redeploy command. The edit/settings path will be opened next to inspect whether it provides an independent custom-domain or release binding control. No project or deployment has been deleted.

**2026-09-19T20:50:09Z — command inventory:** Direct DOM inspection confirms that the project context menu has exactly two commands: **Edit project** and **Delete**. It has no deployment-level unpublish, republish, cache, domain, environment, or release action. The project itself must not be deleted: that would remove the project and its workspace rather than cleanly withdrawing a public release. The remaining safe self-service check is **Edit project**.

**2026-09-19T20:50:33Z — project edit result:** The **Edit project** panel only allows the project display name to be changed. It contains no domain, publishing, release, environment, cache, or deployment-binding field. The panel was opened for inspection and will be closed without saving. This exhausts the project-level self-service control path; deleting the project is neither a deployment reset nor a safe way to republish.

## Self-Service Deployment Matrix

| Requested check | Timestamp (UTC) | Result | Evidence and safety decision |
|---|---:|---|---|
| Clean delete/re-publish | 2026-09-19T20:50:33Z | **Not available as a deployment action** | The only destructive action is project deletion. It is not a safe redeploy control and was not used. |
| Separate domain binding | 2026-09-19T20:50:33Z | **No self-service control found** | Project menu and editor expose only name editing and deletion. |
| CDN/cache layer and purge | 2026-09-19T20:47:31Z | **Cloudflare is present; cache replay ruled out; no purge control found** | Fresh no-cache requests with distinct query values received distinct Cloudflare IDs but the same route response. |
| Multiple environment/instance mapping | 2026-09-19T20:51:15Z | **No exposed slot/binding selector** | Managed-project status identifies one running project version; project controls expose no preview/production slot or domain target. API metadata is being inspected read-only. |
| CLI/API force redeploy | 2026-09-19T20:50:33Z | **No documented or discoverable control** | Available managed-project operations include checkpoint, debug, restart of the development server, secrets, and database operations, but no production force-redeploy. |
| Existing public version marker | 2026-09-19T20:53:25Z | **Current source marker absent at public domain** | `/healthz` exists in source since 1 September but returns a Google-style 404 publicly. `/readyz` is preempted by the live maintenance gate. |

The owner-requested explicit marker release is being prepared as a separate, minimal diagnostic change with an isolated test. It will add only a static non-secret field to the maintenance-allowed `/healthz` response. Its expected public value is documented before any new publish attempt.

**2026-09-19T20:55:22Z — marker release review:** The isolated marker branch adds `deploymentProbe: "recsec-20260919T2054Z"` to the existing `/healthz` JSON response and asserts it in the liveness contract test. The focused isolated test passed **3/3**; the bundled server check, formatting check, and diff-whitespace check also passed. Independent review approved the release: the marker is static and non-secret, does not disclose configuration or tenant data, does not affect `/readyz`, and does not alter maintenance or authorization behavior. Review PR: [#126][4].

The original direct test invocation was correctly stopped by the repository's dedicated-database guard. Its required loopback CI invocation then passed. This demonstrates that the validation followed the protected `kinga_ci_test` policy and did not touch the managed application database.

## Route-Reconciliation Lead

The project task interface visibly lists historical task titles named **Run Daily Recovery Sweep for KINGA AutoVerify AI** and **Daily Recovery Deadline Sweep for KINGA AutoVerify**. Their presence proves that historical scheduled-work artifacts exist, but it does not yet prove that either task is currently enabled, invokes the HTTP recovery route, or is the active production caller. Schedule metadata and the repository caller inventory remain under examination.

**2026-09-19T20:45:50Z — repository and current-schedule evidence:** The recovery HTTP route was introduced on 8 May 2026 as a session-cookie-protected scheduled sweep. The current source has no internal HTTP caller for it; the source contains only the emergency default-deny registration and tests. Separately, `startMaintenanceSensitiveJobs` calls `checkRecoveryDeadlines()` once, 15 seconds after each application start when maintenance mode is off. Therefore the recovery-deadline check is **not dead code**: it is still invoked in-process on ordinary application startup. The HTTP route has no confirmed active caller in the current project schedule inventory.

The only active schedule currently registered to this task is the daily, read-only user-contamination monitor. It neither targets the recovery route nor runs application maintenance work. The two recovery-titled artifacts shown in the UI are historical task records rather than entries in the active schedule inventory. Their individual task history still requires inspection before declaring that no external caller exists anywhere.

**2026-09-19T20:46:20Z — historical task identification:** The project UI exposes the recovery-title artifacts as ordinary historical task sessions, not as the active daily monitor schedule. Their session identifiers are `E2YhpZPVJAEgPD5uLscWwL` for **Run Daily Recovery Sweep for KINGA AutoVerify AI** and a second identifier retained in the browser view for **Daily Recovery Deadline Sweep for KINGA AutoVerify**. Opening the former through the task-list control did not change the current task view, so the next inspection uses its direct task URL. No active schedule has been created, changed, enabled, or disabled.

**2026-09-19T20:47:08Z — historical task inspection:** The direct task record is a historical run, not proof of a currently active schedule. Its instruction used `SCHEDULED_TASK_ENDPOINT_BASE` and `SCHEDULED_TASK_COOKIE` to POST to the recovery path. It recorded a successful `200` on **2026-05-10T02:01:11Z**. The same page shows an older 9 May record. The current schedule panel still lists only the daily user-contamination monitor. This establishes that the recovery HTTP path was used by an earlier Manus scheduled task with a dedicated scheduled-task cookie. It does not establish any successful invocation after May, and it does not identify a presently enabled recovery schedule.

The separate `/api/scheduled/keepwarm` route exists and returns `{ ok: true, ts }` to every caller. It has **no authorization check**. Its source comment states that a Heartbeat cron calls it every four minutes. It does not call `checkRecoveryDeadlines()` and is not the recovery-sweep route. This is a distinct, low-impact liveness endpoint but its unauthenticated public status should be separately reviewed rather than treated as scheduler authorization evidence.

## Protected-Claim Association Lead

The prior cleanup postflight records that 97 protected claims retain non-null `claims.claimant_id` values that do not match the single remaining `users.id`. The finding was explicitly characterized as a legacy soft association with no physical foreign key. A fresh aggregate-only database read will determine the exact value distribution, whether the values reference any surviving row, and whether they correspond to the 97 DOC-format protected claims. No data change is authorized or planned in this investigation.

**2026-09-19T20:46:20Z — schema confirmation:** The live schema confirms `claims.claimant_id` is nullable and indexed, rather than physically foreign-key constrained. The first aggregate query failed only because the final, unrelated user-column name did not match the deployed schema. It made no change and returned no row data. A corrected aggregate-only query will be issued using the confirmed column names.

**2026-09-19T20:47:09Z — aggregate data result:** The live database currently has **102 claims**, rather than the earlier 101-claim reset baseline. Four COR-prefixed claims have null `claimant_id`. The other **98 claims are DOC-prefixed and all carry `claimant_id = 0`**. No `users.id = 0` row exists. Thus the association is not 97 independent mismatches; it is one intentional-or-legacy **zero sentinel** applied uniformly to the document-ingestion claim family. The DOC group spans 8 May through 19 September, with one additional DOC-prefixed record dated 19 September. The next step is a source trace to determine why the intake path writes zero rather than null, and a separate non-mutating review of the one new protected-family claim created after the original reset baseline.

**2026-09-19T20:48:16Z — current-state confirmation:** There is exactly one post-reset DOC-prefixed claim. It was created at **2026-09-19T07:06:13Z**, is in `analysis_complete` status, and uses the same zero sentinel. The earlier reset baseline of 101 claims is therefore out of date; the present population is 102. This is not evidence of the historic contamination returning because the record is a document-ingestion-family claim rather than a deleted test-marker family. It is, however, a material change that must be included in future protection and monitoring baselines.

**2026-09-19T20:52:45Z — root cause resolved:** `server/upload-documents.ts` explicitly inserts every document-ingestion claim with `claimantId: 0`, despite the schema declaring `claims.claimant_id` nullable. The 98 live DOC-prefixed records are the direct consequence. `0` matches no surviving user and no `users.id = 0` row exists. This is a **source-contract defect**, not a post-reset orphaning event: document ingestion has no claimant identity at creation time, so the correct relational representation is `NULL`, not a fabricated numeric identity.

No existing protected claim has been changed in this investigation. A retrospective data correction needs a separate narrow approval because it would update 98 protected claims. The forward-only correction is scoped to replacing the explicit zero sentinel with null and adding a document-intake regression test; it does not require schema migration. The unrelated `claim.claimantId ?? 0` notification fallback in `claims-core.ts` is not an insert path and remains outside this specific correction until its notification contract is reviewed.

## Reporting Convention

Every subsequent status report in this incident record will state an ISO 8601 UTC timestamp and identify the observed source, rather than relying on a stale chat status.

## References

[1]: https://github.com/Tavshok/KINGA/pull/125 "REC-SEC-02A emergency default-deny pull request"
[2]: https://kingaai-ybs42lwg.manus.space "KINGA public production domain"
[3]: https://manus.im/app/wXdylySoP0CyrXQBgASmxL "KINGA Manus project task"
[4]: https://github.com/Tavshok/KINGA/pull/126 "Deployment marker review pull request"
