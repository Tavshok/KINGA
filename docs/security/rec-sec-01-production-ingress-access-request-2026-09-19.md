# REC-SEC-01: Production Ingress Discovery and Access Request

**Status:** Preflight-only request. This record authorizes no Cloud Run, load-balancer, Cloud Armor, DNS, IAM, scheduler, deployment, source, database, or data change.

## The blocker is real but narrow

The P0 containment design is complete, but it cannot safely be executed until the **actual production ingress** is identified and read-only evidence is available. The repository's Cloud Run references describe an intended architecture. They do not establish the live GCP project, region, Cloud Run service, public domains, default service URL, load balancer, Cloud Armor policy, DNS, external scheduler, or log destination. No configured project connector currently supplies that information.

This is a preflight blocker, not a source-code blocker. It does not prevent REC-SEC-02 from being reviewed as a separate source-only remediation. It prevents only the REC-SEC-01 edge change, because applying a path rule to an assumed provider or assumed hostname could leave another public ingress open or disrupt unrelated live traffic.

## Do not assume a Cloud Run-only answer

One of three broad topologies may be active. The discovery step must determine which one is real before an execution mechanism is chosen.

| Possible live topology | What must be established before containment | Why it changes the mechanism |
| --- | --- | --- |
| A standalone public Cloud Run service | The service, region, active revision, `run.app` endpoint, custom-domain mapping, ingress configuration, and any direct URL disabling. | Cloud Run ingress is a service-wide setting. It is not a safe route-specific deny control by itself. |
| Cloud Run behind an external Application Load Balancer and Cloud Armor | Every frontend and hostname, URL map, path matcher, backend service, serverless NEG, Cloud Armor policy attachment, direct service URL posture, and logging route. | A verified load-balancer/Cloud Armor layer may support a route-specific non-forwarding deny rule, but only if every public origin path is covered. |
| Another host, reverse proxy, CDN, or provider | The provider account, production hostname inventory, origin mapping, route-normalization rules, and access-log location. | The provider's own path-policy and identity-verification mechanism determines the safe containment change. |

A Cloud Run ingress or IAM change alone is therefore **not** an approved substitute for the proposed per-route default deny. It could alter all service traffic, fail to cover a separate public proxy, or interfere with a legitimate scheduler or service integration. Cloud Run documents its ingress settings as service configuration, while Cloud Armor policies apply at the load-balancer/backend-service layer rather than directly to a standalone Cloud Run URL. [1] [2]

## Preferred access path: read-only discovery first

The preferred path is to add or enable a Google Cloud connection or a browser session for the production GCP account and grant only read-only discovery access. No API key, service-account key, password, bearer token, cookie, or private certificate is needed or requested.

The discovery principal should be able to view the Cloud Run service and revisions, Cloud Logging, Cloud DNS if production zones are hosted there, and the read-only inventory of external load balancers, URL maps, target proxies, backend services, serverless NEGs, and Cloud Armor policies. A least-privilege starting point normally includes Cloud Run Viewer and Logs Viewer, plus equivalent read-only Compute, Cloud Armor, and DNS visibility appropriate to the actual ownership model. Cloud Run's predefined role reference describes the Cloud Run viewer role; exact additional permissions must be confirmed against the discovered topology rather than replaced with broad Editor or Owner access. [3]

The account must also identify the production GCP project ID and the Cloud Run region, if Cloud Run is the active host. Read-only access is enough for this stage. It does not authorize a policy edit, attachment, service update, scheduler change, deployment, credential creation, or route activation.

## Alternative: owner-provided console evidence

If a temporary read-only connection is not convenient, the owner may provide redacted console screenshots or exports. They should show the following facts without exposing secrets:

1. The production GCP project ID and the region of any live Cloud Run service.
2. Cloud Run **Services → Networking/Endpoints**, including the service URL, custom-domain or domain-mapping details, ingress setting, and whether the default URL is disabled.
3. **Load Balancing** inventory and relevant frontend, URL map, backend service, and serverless NEG mappings, if present.
4. **Cloud Armor** policies and their backend-service attachments, if present.
5. **Cloud Scheduler** inventory or the equivalent scheduler page for any job that targets this route, showing the target URL, authentication type, and caller service account name. Secret values and authorization headers must be redacted.
6. DNS records or provider-domain inventory for every hostname that can reach the production revision.
7. A sample of edge and origin log locations sufficient to correlate a sanitized request identifier, path, method, decision, and timestamp. Cookies, authorization values, claims, recovery records, and query values must remain redacted.

## Output of discovery and next authorization boundary

After read-only discovery, the result will be a provider-specific execution packet. It will list every public ingress, equivalent path representation, origin mapping, existing scheduler caller, safe observability correlation, and the exact narrow Phase 0 default-deny mechanism. Only then will a separate request be made for **Phase 0 execution authority**.

That later authorization must name the selected provider control, account/project, target object, exact route-equivalence match, expected generic response, rollback action that preserves default deny, and validation probes. Validation will correlate real edge denial logs with the absence of a matching origin request. Policy simulation alone will not be accepted as proof.

## Explicit exclusions

This access request does not authorize broad GCP Editor or Owner roles, production database access, credential issuance, IP/CIDR allowlisting, scheduler exception creation, Cloud Run ingress modification, default-URL disabling, Cloud Armor policy modification, load-balancer change, deployment, or any call to the recovery-deadline sweep. Package G1 and G2 remain paused until REC-SEC-01 is actually deployed and proven.

## References

[1]: https://cloud.google.com/run/docs/securing/ingress "Restricting ingress for Cloud Run services"
[2]: https://cloud.google.com/armor/docs/configure-security-policies "Configure Google Cloud Armor security policies"
[3]: https://cloud.google.com/run/docs/reference/iam/roles "Cloud Run IAM roles"
