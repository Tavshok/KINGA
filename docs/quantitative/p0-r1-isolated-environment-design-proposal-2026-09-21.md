# P0 R1 Isolated-Environment Design — Proposal

**Decision ID:** `KINGA-P0-R1-ISOLATED-ENVIRONMENT-DESIGN-PROPOSAL-2026-09-21`
**Status:** **Proposal only — owner review required.**
**Baseline parent:** `KINGA-STAGING-GATED-188-2026-09-15`
**Pinned CB-4/R0 source:** `0566f41d8c4e3bd1327d5ef2f70c694aa6f0e43a`
**Scope:** Target, runner, transport, identity, privilege, custody, isolation, retention, and writer-disable/recovery design for a future rehearsal.
**Explicitly excluded:** R2 packet design, environment provisioning, cloud-console changes, credentials, grants, firewall changes, a target connection, DDL, DML, seed activity, application-data access, staging/production access, and deployment.

## Decision requested

Approve the following **R1 design contract only**. Approval would permit a later, separately authorized provisioning task to implement and prove the listed controls. It would not create a target, authorize R2, approve a packet, or permit any schema/data operation.

> **Recommendation:** A future rehearsal must use a newly created, empty, separately named TiDB Cloud Starter or Essential instance, or an equally isolated TiDB-compatible target whose controls meet every requirement below. It must be reachable only from one owner-controlled runner with fixed egress and no application route. `KINGA-staging`, production, a staging branch, a shared development database, the existing CI MariaDB service, and a generic hosted runner without provable fixed egress are not eligible.

A separate instance—not merely a new schema inside an existing environment—is the recommended unit of isolation. It gives the rehearsal a distinct resource identity, endpoint, firewall boundary, credential namespace, and disposal lifecycle. The final choice of Starter versus Essential must be recorded at provisioning time because the actual service class determines endpoint, firewall, backup, and private-connectivity capabilities.[1] [2]

## R1 outcome and boundary

R1 has one purpose: establish a controlled environment in which later gates can prove a Gate-D-equivalent schema materialization without a route to staging or production. It does not test the canonical Drizzle history, does not create an approved packet, and does not establish any application-data or seed authority.

The future R1 execution is deliberately split into two separately accepted substages. **R1-A** provisions and proves the clean execution envelope through non-mutating identity, TLS, custody, ingress, egress, and application-route checks. Its clean target starts empty. **R1-B** is a separately authorized security-probe substage. It may use a distinct, newly named R1-only probe target and administrator-created probe objects solely to demonstrate expected privilege and writer-disable denials. R1-B must never share its target or objects with an R3 clean-baseline instantiation.

Neither target may be a backup restore, clone, export, staging branch, database copy, or data-bearing snapshot. If a future gate needs a Gate-D-equivalent schema, it must use the separately approved R2 packet and R3 clean-baseline proof. The R1-A clean target remains only an isolated execution envelope.[3]

## Proposed environment model

| Component             | Proposed design                                                                                                                                                                                                                                                                                                | Explicit prohibition                                                                                                                                                                                                                          |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R1-A clean target** | A new, empty TiDB Cloud Starter or Essential instance in a separately named non-production resource. The instance name must include `kinga-p0-r1-clean`, a UTC date, and an owner-approved unique suffix.                                                                                                      | `KINGA-staging`; production; a staging branch; a database inside an existing staging or production instance; a shared development database; restore/clone/import of application data.                                                         |
| **R1-B probe target** | A distinct, newly named empty non-production target, created only after a separate R1-B security-probe authorization. Any administrator-created probe object is unique to this target and retained as evidence.                                                                                                | The R1-A clean target; any R3/R4/R5 clean target; application data; a shared probe database; cleanup that destroys the denial-test evidence.                                                                                                  |
| **Runner**            | A single-use, owner-controlled runner host or isolated runner VM/container with a **dedicated, non-shared** egress identity or an authenticated private-endpoint identity. It runs one named action at a time.                                                                                                 | Manus default sandbox; GitHub-hosted runner; a developer laptop with changing egress; a generic CI runner; shared NAT/all-AWS egress; or any executor that cannot prove dedicated egress and enforce outbound policy.                         |
| **Network direction** | A private endpoint is preferred. If a public endpoint is the only supported option, the runner must use an owner-controlled egress proxy/firewall that enforces the exact R1 destination using verified FQDN/SNI, port, and DNS policy; the target firewall permits the dedicated runner egress identity only. | `Allow_all_public_connections`; broad CIDRs; all-AWS access; IP-only allow rules that cannot distinguish a shared/dynamic provider destination; public access from unapproved locations; any outbound database path to staging or production. |
| **Application path**  | No KINGA application deployment, environment variable, DNS route, service binding, scheduler, worker, webhook, or frontend points to the target.                                                                                                                                                               | Reusing an existing app configuration; testing through a deployed service; any background worker or application writer.                                                                                                                       |
| **Data**              | R1-A is empty and schema-only. R1-B contains only administrator-created security-probe objects and command outcomes. Evidence contains metadata, hashes, redacted logs, and command outcomes only.                                                                                                             | Claims, users, documents, reports, evidence, fixtures, secrets, database exports, seeds, row-level validation, or data copied from any KINGA environment.                                                                                     |
| **Lifecycle**         | Create only after a separate authorization; retain target and evidence through the approved rehearsal/incident retention period; destroy only through a separate recorded owner instruction.                                                                                                                   | Automatic cleanup before evidence acceptance; destructive rollback; silent recreation of a failed target.                                                                                                                                     |

### Why this excludes a generic Manus or Claude Code runner

This design does not select Manus or Claude Code as the future executor. Tool choice is secondary to the required operating envelope. The default Manus sandbox has no owner-controlled fixed egress identity or persistent host-level outbound policy. Claude Code running on an unspecified local machine or generic CI worker has the same deficiency. Either may be used **only if** its actual execution location is a named, owner-controlled runner that supplies the fixed egress/private endpoint, secret injection, network policy, and audit evidence defined here.

If no eligible runner can be demonstrated, the provisioning task must stop. A local loopback TiDB/MariaDB scratch target remains useful for source tests, but it is not an R1 substitute because it cannot prove the intended TiDB Cloud network and service compatibility controls.[3] [4]

## Target and runner identities

Every future R1 execution record must contain the following non-secret identities before it performs any operation:

| Identity                       | Required evidence                                                                                                                                                                                                                  | Acceptance condition                                                                                                                                                                                                |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Target resource**            | Owner-approved organization/project/resource ID, provider region, service class, instance name, endpoint model, database name, and target fingerprint.                                                                             | It is newly created, separately named, non-production, and not equal to staging or production.                                                                                                                      |
| **Runner host**                | Immutable runner ID or instance ID, image/version digest, geographic/hosting location, dedicated non-shared egress IP or authenticated private-endpoint identity, UTC creation time, ephemeral run ID, and outbound-policy digest. | The target ingress accepts only this identity, the egress enforcement can distinguish the exact R1 destination, and no staging/production endpoint is configured.                                                   |
| **Verifier database identity** | Account name, intended database scope, redacted effective-privilege evidence, active/default/inherited-role evidence, host-match evidence, and credential-custody owner.                                                           | Metadata-only access to the named R1 target; no DDL, DML, account administration, cross-resource access, or application runtime use.                                                                                |
| **Runner database identity**   | Account name, intended database scope, redacted effective-privilege evidence, active/default/inherited-role evidence, host-match evidence, and credential-custody owner.                                                           | It may be prepared for a later packet but has no execution authority at R1-A. R2 must prove the exact constrained execution path; database grants alone do not prove destructive `ALTER` operations are impossible. |
| **Recovery authority**         | Named owner-controlled TiDB Cloud console role, incident/stop authority, and separately held investigation identity/route.                                                                                                         | Distinct from verifier and runner identities; not exported into the runner. Investigation access is enabled only under the recorded incident rule.                                                                  |
| **Application identity**       | Explicit absence declaration and deployment/configuration scan result.                                                                                                                                                             | No application identity, route, scheduler, or writer exists for R1.                                                                                                                                                 |

The verifier, runner, recovery authority, and application identity must remain separate. The application runtime must never use a verifier or runner credential. The runner must never receive console-owner, recovery-administrator, staging, production, or application credentials.[5]

## TLS and endpoint acceptance design

TiDB Cloud Starter and Essential standard connections require TLS; the provider supports TLS 1.2 and TLS 1.3 only. The R1 provisioning proof must demonstrate certificate and hostname validation, not merely assert encryption. A public endpoint must have `Allow_all_public_connections` removed before any rehearsal credential is usable. The target firewall can then allow only the approved runner egress identity. TiDB Cloud documents that an authorized IP can reach databases only when it also holds valid credentials, so firewall restriction and distinct database identities are both required.[1] [2]

The future R1 acceptance transcript must retain, with secrets redacted:

1. The provider resource identity, endpoint FQDN, service class, region, endpoint model, and firewall rule list.
2. The client connection policy showing TLS verification enabled, minimum TLS 1.2, hostname verification enabled, and the trusted public CA or pinned provider CA path. `rejectUnauthorized: false`, insecure certificate modes, and hostname-bypass options are prohibited.
3. The negotiated TLS protocol, cipher, server certificate subject/SAN evidence, authenticated database identity, `SELECT VERSION()`, `SELECT DATABASE()`, and `CURRENT_USER()` result.
4. Controlled negative TLS tests against the R1 endpoint only: an untrusted-CA configuration and a mismatched-server-name configuration must both fail before database authentication. A missing test or unexpected success is a stop condition.
5. A fail-closed endpoint validator that positively allowlists the exact raw connection tuple: approved driver scheme and TLS profile, account or role identifier, R1 FQDN, explicit port, and database name. It must reject aliases, IP literals, encoded authority or path variants, query/hash/options, alternate socket/config sources, and every ambient variable not on its narrow allowlist. The runner must start from an empty environment with all staging/production connection variables absent.

No R1 proof may test staging or production reachability by attempting a connection. The no-route guarantee is demonstrated by the approved configuration, redacted environment inventory, endpoint validator, outbound firewall policy, target firewall allow-list, and the absence of those endpoints/credentials from the runner—not by probing protected systems.

## Grant boundaries and negative-privilege proof

The exact TiDB SQL syntax remains unchosen until the future provisioning task knows the actual service class. The privilege **evidence standard** is fixed now. R1 must not overclaim that a MySQL/TiDB grant set distinguishes additive from destructive schema statements: `ALTER` or index privileges can permit destructive variants even when standalone `DROP` is absent.

| Principal              | Minimum purpose                                                               | Permitted scope                                                                                                                                                                   | Must be denied                                                                                                                                                                                                                                                                                                       |
| ---------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Verifier**           | Metadata preflight and postflight                                             | Read-only metadata visibility for the one R1 database and provider-supported identity inspection.                                                                                 | DDL, DML, account/role administration, `GRANT OPTION`, cross-database access, staging/production access, and application runtime use.                                                                                                                                                                                |
| **Schema runner**      | A credential reserved for a later R2-reviewed schema-only packet              | No execution authority during R1-A. If a later R2 packet requires schema privileges, its exact service-class/version-specific effective scope must be enumerated before issuance. | DML, account/role administration, `GRANT OPTION`, global/dynamic privileges, wildcard scope, cross-database access, staging/production access, application runtime use, and any direct-client or dynamic-SQL bypass. The proposal makes no claim that database grants alone deny destructive `ALTER`/index variants. |
| **Recovery authority** | Preservation, incident isolation, and owner-approved investigation/recreation | Provider console only, outside the runner; no normal packet execution.                                                                                                            | Routine runner use, application runtime use, staging/production cutover, secret sharing with the runner.                                                                                                                                                                                                             |
| **Application**        | None                                                                          | No identity exists for R1.                                                                                                                                                        | Every target connection and write.                                                                                                                                                                                                                                                                                   |

Before a later packet credential is considered eligible, the executor must retain an effective-privilege proof covering direct grants; default, active, and inherited roles; host matching; global, dynamic, database, table, and wildcard scope; `GRANT OPTION`; and the actual TiDB service class/version semantics. Any unknown, broad, inherited, or role-activated privilege is a stop condition. A redacted `SHOW GRANTS` line alone is insufficient.

The runner's database grant alone cannot distinguish `ALTER ... ADD` from destructive `ALTER ... DROP` or all destructive index operations on MySQL-compatible engines. Later execution is therefore blocked until R2 proves all of the following: exact-byte reviewed input; dialect- and version-correct, fail-closed statement parsing; disabled multi-statements and dynamic SQL; no direct-client fallback; a process boundary that prevents alternate socket/config injection; and a packet allow-list that rejects every unapproved statement before a database connection. A direct SQL client, `scripts/db-push.mjs`, and any runner that generates or accepts SQL at execution time are prohibited.[3] [5]

R1-A performs no DDL/DML denial probe. A future R1-B probe requires separate explicit authorization and a distinct R1-only probe target. The administrator may create the single probe object before the runner is credentialed; the runner must then demonstrate only expected denials for DML, account/role administration, cross-database access, and any service-class-proven database privilege boundary. A missing-object error never counts as a privilege denial. An unexpected success is a hard stop, leaves all evidence intact, and blocks reuse of that target for any clean-baseline proof. No probe may reference staging, production, or application data.

## Credential custody and secret handling

The owner-controlled administrator creates and stores credentials only after an explicit provisioning authorization. Credential values are never committed, printed, pasted into chat, passed on a command line, or placed in an application configuration file. The future execution environment receives only the one short-lived verifier or runner secret required for its run through an owner-approved secret injection mechanism.

| Custody rule            | Required control                                                                                                                                                                                                            |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Creation**            | Administrator generates a distinct credential per R1 role after target identity and firewall proof are accepted. No staging, production, application, CI, or historical credential is reused.                               |
| **Storage**             | Credentials remain in an owner-controlled secret store or provider facility. The repository contains only role names and redacted fingerprints.                                                                             |
| **Injection**           | The runner receives one role credential at a time through a masked environment/file descriptor. The secret is unavailable to child processes that do not require it and is not persisted in shell history or retained logs. |
| **Rotation/revocation** | Runner and verifier credentials are disabled or rotated immediately after the authorized rehearsal window, writer-disable exercise, or any anomaly. Recovery/console authority remains separately held.                     |
| **Evidence**            | Redacted grant output, creation/rotation timestamps, role identifiers, and custody owner are retained. Secret values, full connection strings, and unredacted endpoint credentials are excluded.                            |

## Four-layer no-route guarantee

A later provisioning task must show all four layers. Failure of any layer blocks R1 acceptance.

| Layer                             | Required proof                                                                                                                                                                                                                                                                                                                                                                                                                                | Why one layer alone is insufficient                                                                             |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **1. Input exclusion**            | Runner launches from a minimal environment. It has no `DATABASE_URL`, `KINGA_STAGING_DATABASE_URL`, `KINGA_PRODUCTION_DATABASE_URL`, application secret, staging/production hostname, or legacy direct-runner input. The endpoint validator allowlists only the exact raw R1 tuple and rejects aliases, IP literals, encoded variants, query/hash/options, alternate sockets/config files, and every ambient variable not explicitly allowed. | A firewall cannot prevent a mistaken process from selecting a wrong credential where a route remains available. |
| **2. Runner egress enforcement**  | Owner-controlled firewall/network policy blocks outbound database traffic except an authenticated private path or the exact R1 FQDN/SNI-and-port destination after DNS validation. The implementation must prove it can distinguish the R1 destination even where provider IPs are shared or dynamic. DNS resolution and approved provider TLS traffic are explicitly enumerated.                                                             | Distinct credentials do not prevent accidental or malicious connection attempts to another reachable endpoint.  |
| **3. Target ingress enforcement** | The R1 target removes allow-all public access and permits only the runner's dedicated, non-shared egress identity or an approved authenticated private-endpoint identity. A fixed public IP is insufficient when it is shared by any other runner or workload.                                                                                                                                                                                | Runner policy alone does not prevent another internet location from reaching a public target.                   |
| **4. Application-route absence**  | A configuration and deployment inventory proves no KINGA app, worker, scheduler, webhook, DNS name, service binding, or environment points at R1.                                                                                                                                                                                                                                                                                             | A correctly isolated database can still be mutated by an accidentally connected application.                    |

The R1 evidence record must include the firewall policy export, target ingress export, dedicated-egress/private-path proof, redacted runner environment manifest, endpoint-validator test result, deployment/configuration absence declaration, and a route-policy review signed by the owner-controlled network authority. If the selected provider/runner cannot prove destination-specific egress enforcement under shared or changing provider IPs, R1 is blocked; a fixed IP allow-list is not accepted as a substitute. Evidence must never include actual staging or production URLs.

## Retention, writer disable, and recovery design

The R1 target is evidence-bearing infrastructure. A failed or successful later run must not be “fixed” by destructive rollback. The primary response to any anomaly is to disable the isolated writer path, preserve evidence, and investigate from a clean successor target if necessary.

### Retention

The future provisioning record must set a minimum **30-day retention period after R8 closure or final incident disposition, whichever is later**. For an abandoned or cancelled run, closure means a recorded cancellation disposition that identifies the last known target fingerprint, packet state, discrepancy state, evidence custodian, and accountable owner; the same 30-day minimum starts from that disposition. The target, logs, packet bytes, metadata fingerprints, role/grant evidence, and firewall evidence must not be auto-deleted or deleted early.

Before any later target destruction, the owner-controlled evidence archive must contain an access-controlled append-only or immutable copy with a SHA-256 manifest, UTC timestamps, custody record, and a verified readable copy. A separate owner instruction may authorize target cleanup only after the 30-day minimum has expired, the archive proof is retained, and no open discrepancy or incident remains. It may not authorize premature evidence deletion, evidence rewrite, or target replacement.

### Writer-disable mechanism

Writer disable is intentionally outside the schema runner. The recovery authority must be able to take these non-destructive actions without using the runner:

1. Remove the runner egress identity from the target firewall or disable the target public endpoint/private route.
2. Disable or rotate the runner credential while preserving the verifier/recovery evidence record.
3. Disable the runner job/service identity and prevent new work from starting.
4. Record the stop time, triggering evidence, known target fingerprint, packet hash, and identity that executed the stop.

The normal writer-disable acceptance exercise is a future R8 proof, not an R1 action. Its byte-pinned R8 packet must name one isolated, non-destructive denial probe on the separate R1-B probe target. The expected result is permission/route denial; an unexpected success is a hard stop, is recorded without cleanup, and forbids reuse of that target. It must not use application data, staging, production, `DROP`, `DELETE`, `TRUNCATE`, target replacement, or improvised rollback SQL.[3]

### Recovery and investigation route

R1 requires a named recovery authority, a separately held read-only investigation identity, and an evidence-preserving investigation route; it does not require a tested backup restore. The investigation identity is unavailable to the normal runner. Its route remains usable after writer disable only if that route was pre-approved, separately firewalled, read-only, and present in the evidence record; otherwise it may be enabled only under a separately recorded incident authorization. An anomaly leaves the target unchanged, records the precise packet/statement/connection state, and opens a separate incident decision. Recreating or restoring a target always uses a newly named isolated successor; it never overwrites a failed target or repoints staging/production. Any backup, PITR, restore, or target replacement remains separately authorized.

## Provisioning acceptance checklist for a future task

No future task may claim R1 complete until it has retained evidence for every item below.

1. A new R1-A clean-target identity and service class, separate from staging and production, together with an empty-target metadata snapshot.
2. A named dedicated-egress/private-endpoint runner identity and an exact destination-specific no-route configuration proof.
3. Target firewall export showing allow-all removed and only the dedicated runner identity or authenticated private path allowed.
4. Positive TLS certificate/hostname verification, negotiated protocol/cipher evidence, and controlled R1-only negative tests for an untrusted CA and mismatched server name.
5. Separate verifier, runner, recovery, and read-only investigation identities with redacted effective-privilege, role, host-match, and custody evidence.
6. A failure-closed privilege analysis that identifies direct grants, all role states, global/dynamic and wildcard scope, and `GRANT OPTION`, without claiming that database grants prevent destructive `ALTER` variants.
7. If separately authorized, R1-B expected-denial results from a distinct probe target with administrator-created probe objects, including literal `DROP` if the service-class grant model can deny it, DML, cross-database access, grants, and account administration. Missing-object results never qualify.
8. Application-route absence proof covering services, worker/scheduler configuration, DNS/bindings, and runtime environment references.
9. An append-only/immutable evidence archive proof, minimum-retention record, writer-disable design, investigation-route design, incident record, and successor-target recovery record, with accountable owners.
10. A failure-closed result if any target identity, TLS, privilege, network, no-route, retention, archive-integrity, or investigation control is incomplete.

## Executor decision after design approval

The provisioner may be Manus, Claude Code, or another controlled executor. The selection should be made **after** design approval against this eligibility table:

| Capability                          | Mandatory proof                                                                                              | Result if unavailable   |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------- |
| Fixed egress or private endpoint    | Stable identity accepted by the R1 target firewall.                                                          | Executor is ineligible. |
| Owner-controlled egress enforcement | Auditable firewall/route policy that denies staging/production database routes.                              | Executor is ineligible. |
| Secret custody                      | Masked, role-separated injection without source, logs, shell history, or application configuration exposure. | Executor is ineligible. |
| Provider/resource custody           | Owner can create/revoke target, firewall, and credentials independently of the executor.                     | Executor is ineligible. |
| Evidence retention                  | Executor can produce redacted, hashable, retained evidence without destroying failures.                      | Executor is ineligible. |
| Deterministic runner                | Packet runner can reject non-allowlisted SQL and has no direct runner fallback.                              | Executor is ineligible. |

**Recommendation:** Manus, Claude Code, and every other executor are identically ineligible unless each runs inside the same named, owner-controlled, dedicated fixed-egress/private-path envelope and satisfies every capability test above. No tool receives an exception by default.

## Proposed next authorization boundary

If this design is approved, the next decision should authorize **R1-A provisioning only**: create the named empty clean target; configure target ingress; establish the named runner; create role-separated credentials; perform non-mutating identity, TLS, endpoint-validation, effective-privilege inspection, no-route, and archive checks; and retain evidence. It must still exclude R1-B security probes, R2 packet design, DDL/DML, schema materialization, seed/data activity, and staging/production work.

## References

[1]: [TiDB Cloud Starter or Essential public endpoint](https://docs.pingcap.com/tidbcloud/connect-via-standard-connection-serverless/) "Connect to TiDB Cloud Starter or Essential via Public Endpoint"

[2]: [TiDB Cloud Starter or Essential firewall rules](https://docs.pingcap.com/tidbcloud/configure-serverless-firewall-rules-for-public-endpoints/) "Configure TiDB Cloud Starter or Essential Firewall Rules for Public Endpoints"

[3]: [P0 baseline reconciliation and rehearsal plan](p0-baseline-reconciliation-rehearsal-proposal-2026-09-21.md) "P0 Baseline Reconciliation and Rehearsal Plan — Proposal"

[4]: [KINGA Gate B scratch-only replay evidence](../../audit/gate-b-scratch-replay-2026-09-10.md) "Gate B Scratch-Only Migration Replay Evidence"

[5]: [Gate D execution readiness plan](../staging-schema-reconciliation/gate-d-execution-readiness-plan.md) "Gate D Staging Reconciliation — Execution Readiness Plan"

[6]: [TiDB Cloud Serverless TLS connections](https://docs.pingcap.com/tidbcloud/secure-connections-to-serverless-clusters/) "TLS Connections to TiDB Cloud Starter or Essential"

[7]: [TiDB Cloud identity access management](https://docs.pingcap.com/tidbcloud/manage-user-access/) "Identity Access Management"
