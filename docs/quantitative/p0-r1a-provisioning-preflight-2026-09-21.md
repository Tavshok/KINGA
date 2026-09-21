# P0 R1-A Provisioning Preflight — Fail-Closed Outcome

**Decision ID:** `KINGA-P0-R1A-PROVISIONING-PREFLIGHT-2026-09-21`
**Timestamp:** `2026-09-21T14:19:00Z`
**Status:** **Blocked before provisioning.**
**Authority reviewed:** Owner authorization for **R1-A provisioning only**.
**Target outcome:** No R1 target, cloud resource, credential, firewall rule, grant, target connection, DDL, DML, seed, application-data action, staging action, production action, or deployment was performed.

## Conclusion

Neither currently available execution route qualifies as the owner-controlled R1-A runner required by the approved R1 design. The default Manus task environment is a Docker container with no demonstrated owner-controlled dedicated egress or authenticated private path, destination-specific outbound-policy authority, immutable/auditable runner identity, TiDB Cloud control-plane integration, or credential-custody path. The approved design expressly excludes this default sandbox unless those controls can be demonstrated. Claude Code is not present or attached in this task.

R1-A therefore stops **before** target provisioning. Creating a TiDB Cloud instance from this environment would violate the approved four-layer no-route guarantee and executor eligibility rules. The correct result is a fail-closed block, not a weaker provision attempt.

This stop does not advance a downstream gate. **R1-B security probes were not authorized or attempted** and remain separately authorized only on their own distinct probe target. **R2 packet design or execution, schema materialization, DDL/DML, seed/data activity, and staging/production work remain excluded.**

## Preflight evidence

| R1-A control                                      | Result                                    | Evidence and reasoning                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Named R1 target and cloud control plane**       | **Blocked**                               | No TiDB Cloud connector, TiDB Cloud CLI, or TiDB Cloud management credential is available to this task. `manus-config config load --search tidb` returned no connector match, and the custom connector inventory is empty. No target was created.                                                      |
| **Manus executor eligibility**                    | **Blocked**                               | The current host identifies itself as a Docker container. The environment has not demonstrated the approved immutable/auditable runner identity, dedicated non-shared egress or authenticated private path, destination-specific policy enforcement, or owner control required for an eligible runner. |
| **Destination-specific egress enforcement**       | **Blocked**                               | The task environment cannot inspect or manage host firewall policy: `nft` is unavailable and `iptables -S` is denied by the container host. It cannot prove an outbound policy that allows only the exact future R1 target while denying staging and production.                                       |
| **Fixed egress or authenticated private path**    | **Blocked**                               | An outward public address can be observed, but that does not prove a dedicated, non-shared egress identity or an owner-controlled policy. No private endpoint or authenticated network path is attached.                                                                                               |
| **Claude Code executor eligibility**              | **Blocked**                               | No `claude` executable, attached Claude Code host, or Claude Code runner identity is available in this task. There is therefore no candidate environment to inspect for fixed egress, custody, or firewall control.                                                                                    |
| **Role-separated credential custody**             | **Blocked**                               | No R1-specific secret-store or provider-side credential-custody mechanism has been demonstrated or made available to this task. No credential was requested, created, read, or reused.                                                                                                                 |
| **TLS, ingress, and identity checks**             | **Not started**                           | These require an approved target endpoint, target firewall identity, and separately held verifier identity. None exists.                                                                                                                                                                               |
| **Application-route absence and input exclusion** | **Partially inspectable; not sufficient** | The current task has no R1 endpoint or application binding, but this does not establish the required proof for a future target or runner. A qualifying runner must produce the approved minimal-environment and deployment/configuration absence evidence.                                             |
| **Append-only archive and writer-disable route**  | **Blocked**                               | No owner-controlled immutable/archive location, recovery authority, or separately held investigation route is available for this task.                                                                                                                                                                 |

## Executor decision

**Manus default sandbox: ineligible.** It cannot satisfy the R1 design because it is transient, containerized, lacks owner-controlled destination-specific egress policy, and has no TiDB Cloud management integration or credential custody facility for this target.

**Claude Code: unavailable and therefore ineligible.** No Claude Code runner has been attached or made available for inspection. Its eligibility cannot be inferred from the product name; it must be demonstrated from the actual host, network, secret, and provider-control environment.

The decision is symmetric: any future executor is ineligible unless it runs inside the same named, owner-controlled, dedicated fixed-egress or authenticated-private-path environment and produces the R1 evidence required by the approved design.

## Minimum prerequisites for a compliant R1-A retry

A future owner-authorized R1-A execution needs all of the following before any TiDB Cloud target is created.

| Prerequisite                           | Required condition                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Owner-controlled runner**            | A controlled host, VM, or isolated container with an immutable, auditable runner identity; a dedicated non-shared fixed egress identity or authenticated private endpoint; and sufficient authority to apply and audit outbound network policy. It must not be the default Manus sandbox, a generic hosted CI runner, or an unspecified developer machine. |
| **Destination-specific egress policy** | A host/network control that can allow the exact R1 FQDN/SNI-and-port destination or authenticated private path, including safe handling of provider DNS and dynamic/shared addresses, while denying all staging and production database paths.                                                                                                             |
| **TiDB Cloud control plane**           | Owner access to create a separately named empty non-production instance, remove allow-all public access, configure the target firewall/private endpoint, and retain a redacted resource/ingress export. This can be through an owner-controlled console or separately configured automation integration.                                                   |
| **Credential custody**                 | An owner-controlled secret store or provider facility that can inject one distinct R1 role credential at a time without writing secrets to source, logs, shell history, or application configuration. The verifier, future runner, recovery authority, and investigation identity remain separate.                                                         |
| **Evidence archive**                   | An access-controlled append-only or immutable archive that retains a SHA-256 manifest, UTC timestamps, custody evidence, and a verified readable copy for at least 30 days after R8 closure or final incident disposition, whichever is later, before any later target destruction.                                                                        |
| **Executor attachment**                | Manus, Claude Code, or another executor must be attached to the named runner—not merely able to generate commands—and must be able to prove the pre-creation R1-A eligibility controls before it is selected.                                                                                                                                              |

### Required sequence after the prerequisites exist

The runner envelope, control-plane access, credential-custody design, destination-specific network-policy capability, and evidence archive must be established and inspected before a target is created. Only then may a separately authorized R1-A provisioning task create the empty target.

The actual target identity, endpoint/FQDN, target-ingress export, TLS transcript, and effective database-privilege evidence can only be collected after target creation. They remain mandatory before the target is accepted for R1-A or used for any later gate. A target that fails any of those post-creation checks is disabled through the approved evidence-preserving path and never used for R1-B, R2, R3, or application activity.

## Required next decision

No further R1 action is safe from the present environment. The next decision is to nominate or make available an owner-controlled runner and TiDB Cloud control-plane path that meet the prerequisites above. Once that environment exists, its eligibility must be inspected read-only against the R1 design before any target provisioning begins.

## References

[1]: [R1 isolated-environment design proposal](p0-r1-isolated-environment-design-proposal-2026-09-21.md) "P0 R1 Isolated-Environment Design — Proposal"

[2]: [P0 baseline reconciliation and rehearsal plan](p0-baseline-reconciliation-rehearsal-proposal-2026-09-21.md) "P0 Baseline Reconciliation and Rehearsal Plan — Proposal"

[3]: [TiDB Cloud Starter or Essential firewall rules](https://docs.pingcap.com/tidbcloud/configure-serverless-firewall-rules-for-public-endpoints/) "Configure TiDB Cloud Starter or Essential Firewall Rules for Public Endpoints"

[4]: [TiDB Cloud Starter or Essential TLS connections](https://docs.pingcap.com/tidbcloud/secure-connections-to-serverless-clusters/) "TLS Connections to TiDB Cloud Starter or Essential"
