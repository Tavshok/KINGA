# Draft: Manus Support Escalation — Suspected Corrupted Production Deployment Binding

**Draft timestamp:** 2026-09-19T21:41:45Z  
**Status:** **Prepared for owner review; not submitted**  
**Product:** KINGA — Manus-hosted insurance claims application  
**Manus project:** `YbS42LwGroxbVepAMjk4bS`  
**Task:** `wXdylySoP0CyrXQBgASmxL`  
**Public domain:** `kingaai-ybs42lwg.manus.space`

## Suggested subject

**Evidence-backed escalation: suspected corrupted production deployment binding for KINGA project `YbS42LwGroxbVepAMjk4bS`**

## Suggested message

Hello Manus Support,

We need assistance investigating a suspected **corrupted or misbound production deployment binding** for the KINGA project. This is not a generic request to retry a failed publish. We have performed a controlled source-to-public verification that shows the public domain is not receiving the current backend revision, despite merged source, a passing required quality gate, and successful managed-workspace checkpoints.

The project is `YbS42LwGroxbVepAMjk4bS`; the relevant task is `wXdylySoP0CyrXQBgASmxL`; the affected public domain is `kingaai-ybs42lwg.manus.space`.

A narrowly scoped diagnostic release, GitHub PR #126, added only this static, non-secret field to the existing maintenance-allowed `/healthz` response:

```json
{"deploymentProbe":"recsec-20260919T2054Z"}
```

The required **KINGA Quality Gate** passed. PR #126 then merged as commit `50713526212853197ce8163432ba911a35feac32`. The managed workspace synchronized that commit and created checkpoint `9eab780c`. After propagation time, a fresh no-cache request with a unique query string to:

```text
https://kingaai-ybs42lwg.manus.space/healthz?recsec_marker_probe=20260919T2101Z
```

still returned a Google-style `404` and no `deploymentProbe` value. This is decisive, externally observable evidence that the public backend binding did not receive the intended release.

We also ruled out a simple CDN replay. Fresh requests used no-cache directives and distinct query values; the scheduled-route probes received distinct Cloudflare request IDs while retaining the same response. The project UI and available project-control tools expose no safe self-service operation to unpublish, rebind a domain, select a production slot, purge a cache, force a redeploy, or recreate only the deployment. The sole destructive menu operation deletes the entire project, so it was deliberately not used.

There is a concrete security impact. A merged, tested emergency default-deny source fix for `POST /api/scheduled/recovery-deadline-sweep` cannot be verified on the public backend. A temporary maintenance gate currently protects normal application paths, and a separate pre-application scheduled-route gate returns `403` for the recovery route; however, we cannot prove from the exposed controls that a real human session is denied by that pre-application gate. We will not send a genuine authenticated request to test it because it could trigger cross-tenant recovery work.

Please investigate and answer these specific questions:

1. Is `kingaai-ybs42lwg.manus.space` currently bound to the correct KINGA project and the intended backend deployment/revision?
2. If not, what deployment, service, revision, or project identifier is it bound to now, and can Manus rebind it without deleting the project, database, or managed configuration?
3. If the binding is correct, why does it not serve the merged checkpointed backend source, including the existing `/healthz` route and the PR #126 marker?
4. Is there an account-level or project-level deployment record in a corrupted state that prevents new backend revisions from reaching the public domain?
5. What supported self-service control, if any, can force a clean production deployment or repair the binding?
6. After correction, please confirm the expected public response from `/healthz` includes `"deploymentProbe":"recsec-20260919T2054Z"`, so we can independently verify that the public backend is current before we remove maintenance mode or rely on the emergency source containment.

Please preserve the project, database, current managed configuration, and public domain during investigation. Do not recommend deleting and recreating the project as a first response; that is not an equivalent deployment reset and would be unsafe for this production system.

The attached investigation record contains the exact chronology, public probe results, self-service control inventory, and recovery-route evidence.

Thank you.

## Attachment and evidence set

Attach the completed [self-service deployment and route reconciliation record][1]. The request should cite PR [#125][2] as the merged emergency recovery-route default-deny release and PR [#126][3] as the merged non-secret marker release. Do **not** attach credentials, cookies, database connection strings, user records, or other personal data.

## Review checklist before submission

The owner should confirm that the project ID, task ID, public domain, marker string, and desired support request remain accurate. This draft intentionally requests diagnosis and a safe binding repair; it does not authorize Manus to delete, recreate, migrate, disable maintenance, change application data, or alter identity credentials.

## References

[1]: /home/ubuntu/kinga-replit/audit/rec-sec-self-service-investigation-2026-09-19.md "REC-SEC self-service deployment and route reconciliation"
[2]: https://github.com/Tavshok/KINGA/pull/125 "REC-SEC-02A emergency recovery-sweep default-deny pull request"
[3]: https://github.com/Tavshok/KINGA/pull/126 "Deployment verification marker pull request"
