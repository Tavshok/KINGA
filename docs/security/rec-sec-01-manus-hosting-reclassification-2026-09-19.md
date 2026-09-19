# REC-SEC-01: Manus-Hosted Production Reclassification

**Status:** Factual topology correction and containment decision record. It authorizes no platform, route, deployment, database, scheduler, credential, or data change.

## Corrected production topology

KINGA's live application is published through Manus. The owner confirms there is no separately administered Google Cloud project, Cloud Run service, external load balancer, Cloud Armor policy, or CDN/WAF account to discover or configure. Manus owns the hosting path between the public internet and the application.

Manus' current public publishing documentation states that its default autoscale hosting runs the application on managed Google Cloud Run. The documentation also states that Manus provisions and manages cloud infrastructure and deployment. It does not document an owner-configurable path-specific pre-application policy, WAF, reverse-proxy route rule, or edge-deny control. The tools exposed to this project likewise provide status, checkpoint, rollback, secrets, database, and project-development controls, but no route-policy or edge-policy control. [1] [2]

> **Conclusion:** There is no verified user-accessible pre-application control that can satisfy REC-SEC-01's original edge-default-deny design today. The prior request for standalone GCP discovery or IAM access is superseded and must not be pursued.

This conclusion does not assert that Manus has no intermediary infrastructure. The platform necessarily operates managed hosting infrastructure. It means that no documented or project-exposed control has been found that allows the owner or this project to install and verify a route-specific non-forwarding rule before Express receives the request.

## Immediate containment consequence

The correct immediate action is an application-boundary emergency release, **REC-SEC-02A**, that changes only `POST /api/scheduled/recovery-deadline-sweep` to default deny every caller with the same generic response. It removes the current any-authenticated-session success path. It must not provide a temporary scheduler exception, because the current Manus scheduler identity is not a dedicated non-human authorization mechanism.

The emergency release is narrower than the full REC-SEC-02 remediation. It intentionally disables public HTTP invocation of the sweep. It leaves all unrelated routes unchanged and does not rely on IP addresses, proxy headers, task identifiers, user agents, cookie shape, or undocumented platform conventions. Its public-route behavior can be tested without invoking recovery work because the handler makes no database, notification, or executor call.

The in-process startup sweep is outside this HTTP route change. It remains a separate source-remediation concern, including fencing, bounded execution, transactional outbox effects, notification-result semantics, and any future dedicated scheduler capability. Those concerns remain in REC-SEC-02 and are not claimed resolved by REC-SEC-02A.

## What remains to verify after a separately approved release

Because Manus does not expose edge logs or an edge policy control to this project, verification must be proportionate to the application-boundary control:

1. Validate anonymous, ordinary-session, scheduler-looking, and malformed-bearer requests against the exact public host and trailing-slash representation, after explicit release authorization.
2. Confirm every result is the same generic denial and that no recovery notification, suppression update, or sweep execution is observed.
3. Confirm representative unrelated paths such as health/readiness, root, tRPC, intake escalation, and stuck recovery retain their expected behavior.
4. Treat absence of a provider-side edge/origin correlation facility as a documented platform limitation. Do not falsely claim an edge block or origin-non-forwarding proof.

If Manus later offers a supported route-level gateway, WAF, or access-policy product, a new read-only discovery and containment packet may reassess edge defense in depth. It does not replace the need for application-level authorization.

## References

[1]: https://manus.im/docs/website-builder/publishing "Manus Publishing"
[2]: https://manus.im/docs/website-builder/cloud-infrastructure "Manus Cloud Infrastructure"
[3]: https://manus.im/docs/website-builder/access-control "Manus Access Control"
