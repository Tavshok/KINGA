# D-01 Wave 1 Staging Change Packet — Review Draft

## Status and authority boundary

**Status: Draft for KINGA owner review only.** This packet documents the first possible staging-only reconciliation change for the Wave 1 identity and tenant-root structures. It authorises no connection, credential creation, account change, backup action, restore, SQL execution, DDL, DML, application configuration change, or production work.

The owner has approved preparation of this packet and is provisionally named as both its operator and reviewer. That role assignment is sufficient for document drafting only. The Gate D readiness plan normally requires a **second person** to perform independent packet review before any execution decision. The owner has accepted the time-limited D-01-only exception recorded in Section 1A; no later packet or production work inherits that exception.

> **Execution remains prohibited.** A new, explicit written authority must name D-01, confirm the actual staging target and recovery point, designate a least-privilege runner account and an independent reviewer, approve a change window, and authorise the exact pinned SQL before any staging DDL can be considered.

## 1. Packet identity

| Field | Draft value | Execution status |
|---|---|---|
| Packet ID | `D-01` | Draft only |
| Purpose | Create the Wave 1 identity and tenant-root baseline on the approved empty staging target. | Not authorised |
| Environment | `KINGA-staging`, database `kinga_staging`, AWS Frankfurt (`eu-central-1`), Starter | Reconfirm immediately before any execution; no connection is authorised by this draft. |
| Operator | KINGA owner (provisional named operator) | No execution authority issued. |
| Reviewer | Tavonga Shoko, KINGA owner (provisional named reviewer) | The D-01-only single-person exception in Section 1A is accepted; it is not a general waiver. |
| Change approver and stop authority | KINGA owner | Explicit D-01 execution approval still required. |
| Application owner and observer | Unassigned | Must be named before the application-validation gate. |
| Change window | Unassigned | Must be UTC-bounded and approved before execution. |
| Production | `KINGA-production` | Explicitly excluded. No production connection, action, or planning is authorised. |

## 1A. D-01-only owner-accepted reviewer-control exception

| Field | Recorded exception |
|---|---|
| Decision maker | Tavonga Shoko, KINGA owner |
| Decision date | 12 September 2026 |
| Accepted deviation | The owner may act as both D-01 operator and reviewer because no independent second reviewer is available at this stage. |
| Limited rationale | D-01 is limited to three tables, has no foreign keys, is designed for an empty staging database, uses a SHA-256-pinned 11-statement `CREATE`-only artefact, and follows a successful restore-and-cleanup rehearsal. |
| Scope limit | `D-01` only: `tenant_invitations`, `tenants`, and `users` in the explicitly approved `KINGA-staging` target. |
| Controls that remain mandatory | Exact target identity, TLS/privilege proof, current recovery-point evidence, SQL/source hash validation, approved change window, preflight metadata, statement log, postflight metadata comparison, application smoke test, runner-account revocation/expiry, and documented closure. |
| Expiry | The exception ends immediately when D-01 is closed, stopped, or abandoned. It cannot be carried to D-02–D-06, any recovery action, an application rollout, or production. |
| Reopening rule | Any scope enlargement, target ambiguity, preflight/postflight difference, execution error, expired recovery record, or application smoke-test failure voids the exception and requires a new owner decision before further action. |

This exception accepts the absence of separation of duties for D-01 only; it does not represent independent assurance. The retained evidence must therefore be sufficiently complete for a later independent review, and the owner must not rely on this exception to bypass any other D-01 stop condition.

## 2. Immutable source and SQL pins

| Control | Pinned value | Verification status |
|---|---|---|
| Current GitHub `main` at packet draft | `9773b417aa4de5d329cb91c8e634e260caa82d45` | Verified during packet drafting. |
| Gate C source revision containing the latest schema change | `4336a2961147877a373a11a706e2a7ee4604f754` — `feat(schema): complete Gate C Wave 5 scratch baseline` | Verified as an ancestor of current `main`. |
| Current `drizzle/schema.ts` SHA-256 | `0d07fd920f1b260c75b85ec25ce224cef48d6deb4fe0fef47d6dc0ceec03a17c` | Repository-only calculation. |
| Reviewed D-01 SQL file | `audit/gate-c-scratch-baseline/wave-01-generated/wave-01-identity-tenant-roots.sql` | Retained immutable review artefact. |
| Reviewed SQL SHA-256 | `306797ab94529860bc9e88a69a955061916a94ddc3d08e3265229780ab08083c` | Proven in two independent local scratch replays. |
| Scratch structural metadata fingerprint | `e4d52b9f4ed2de6ffd00c6a184fdef807d8450b64edd1d1b604c08be06dc2a50` | Cross-check only; it covers the local scratch tables, constraints, and indexes and is not a staging preflight result. |
| Source-manifest SHA-256 | Not assigned in this draft | Generate and record from the exact approved source revision only after a separately authorised execution-preflight process is approved. |

The SQL file hash, source revision, source metadata hash, and table list must match at every later review. A hash or source mismatch is a mandatory stop; the operator must not regenerate, edit, or substitute SQL during a change window.

## 3. Approved D-01 scope

| Item | Exact approved scope |
|---|---|
| Tables | `tenant_invitations`, `tenants`, `users` only. |
| Statement classes | Exactly 3 `CREATE TABLE` statements and 8 `CREATE INDEX` statements, for 11 total statements. |
| Primary keys | `tenant_invitations.id`, `tenants.id`, and `users.id`. |
| Unique constraints | `tenant_invitations.token` and `users.openId`. |
| Retained indexes | `tenant_id_idx`, `email_idx`, `expires_at_idx`, `idx_tenants_name`, `idx_tenants_status`, `idx_users_tenant_id`, `idx_users_is_active`, and `idx_users_phone_tenant`. |
| Source-default boundary | The reviewed SQL retains the four approved functional `DEFAULT (now())` timestamp defaults for `tenant_invitations.created_at`, `tenants.created_at`, `users.createdAt`, and `users.lastSignedIn`. |
| Foreign keys | None in D-01. No foreign key is implied or may be added opportunistically. |
| Explicit exclusions | `DROP`, `ALTER`, `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, database creation, user/role/grant administration, application configuration changes, data seeding, and any object outside the three named tables. |

The two local scratch replays each created the same three-table structure from the pinned SQL, each used 11 statements, and each scratch database was removed after capture. That evidence validates the source artefact in isolation; it is not evidence that D-01 has run or may run on staging.

## 4. Recovery posture and retained rehearsal evidence

The owner accepted the free Starter recovery posture for this **staging rehearsal only**. The recovery rehearsal restored the successful `2026-09-11 03:00:45 UTC` `KINGA-staging` snapshot to a separately named disposable instance, confirmed it Active, and then removed only that target. Final owner-supplied TiDB Cloud resource-list evidence shows only `KINGA-staging` and `KINGA-production`, both Active. No SQL, schema/data action, or application test was executed against the restored target.

| Recovery control | D-01 draft position |
|---|---|
| Rehearsal | Passed for the selected Starter snapshot-to-new-instance path, including target cleanup. |
| Current recovery point | **Not yet current for D-01.** An owner-approved latest successful snapshot timestamp and expiry must be captured again immediately before an execution decision. |
| PITR | Not available on free Starter. This is accepted for staging rehearsal only. |
| Production recovery | Out of scope. `KINGA-production` must move to TiDB Cloud Essential or Dedicated with real PITR before any production migration planning. |
| Failure response | Stop; retain logs; do not invent rollback SQL. Any recovery/replacement/repointing decision requires separate authority. |

## 4A. D-01 verifier and runner account design — review only

The following is a **capability design**, not an account-creation request and not executable grant syntax. TiDB documents that `CREATE TABLE` requires `CREATE`, `CREATE INDEX` requires `INDEX`, and privilege management should be performed through controlled account and grant statements rather than direct system-table changes.[5] The owner must check the exact supported TiDB Cloud Starter privilege syntax in the approved account context before proposing any account-creation action.

| Design element | D-01 schema verifier | D-01 schema runner |
|---|---|---|
| Proposed identity | `kinga_staging_schema_verifier_d01` | `kinga_staging_schema_runner_d01` |
| Sole purpose | Obtain target identity, redacted effective grants, and preflight/postflight schema metadata for `kinga_staging`. | Execute the one SHA-pinned D-01 SQL artefact only if separately authorised. |
| Requested capability boundary | Read-only metadata visibility limited to `kinga_staging`; operational procedure forbids application-row reads. It may not execute DDL, DML, user/role management, or any cross-database/prod operation. | Only the minimum `CREATE` and `INDEX` capability required for the 3 `CREATE TABLE` and 8 `CREATE INDEX` statements in the pinned D-01 artefact, scoped to `kinga_staging` only. |
| Explicitly absent | `CREATE`, `INDEX`, `ALTER`, `REFERENCES`, `DROP`, `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `GRANT OPTION`, user/role management, backup/restore administration, cross-database access, and production access. | `ALTER`, `REFERENCES`, `DROP`, `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `SELECT` for application rows, `GRANT OPTION`, user/role management, backup/restore administration, cross-database access, and production access. |
| D-01 limitation | No application data may be selected. No preflight “test DDL” is permitted. | No DDL may be used to test the account. The first permitted DDL, if ever authorised, is the exact pinned D-01 statement sequence. |
| Network and transport | Owner-approved narrow TiDB Cloud network path and mandatory TLS with verified server/certificate handling. The account host pattern must be the most restrictive form supported by the actual service/network design. | Same as verifier; no broadly reusable runtime credential and no unbounded public-network identity. |
| Lifecycle | Created only by the named KINGA account administrator after separate approval; active only for the approved verification/change window; revoked or disabled at D-01 closure. | Created only after the D-01 execution decision; restricted to the approved window; revoked or disabled immediately at closure or first stop. |
| Evidence before use | Redacted `SHOW GRANTS` and identity/TLS result, reviewed against this capability matrix. Any extra privilege is a stop condition. | Redacted `SHOW GRANTS`, reviewed SQL hash, target identity/TLS result, and an explicit confirmation that every grant maps to a D-01 statement class. Any excess is a stop condition. |

The existing `kinga_verify` identity remains a useful read-only inspection identity but is **not** the D-01 runner and must not be elevated or repurposed. The application runtime identity must never be used as verifier or runner. No username password, connection string, grant statement, or account operation is included in this packet.

## 4B. Current snapshot decision record — review only

| Field | Recorded position | Requirement before any execution decision |
|---|---|---|
| Prior rehearsal snapshot | `2026-09-11 03:00:45 UTC`; console status was Succeeded; recorded expiry was `2026-09-12 03:00:45 UTC`. | Historical rehearsal evidence only. It cannot be reused as the D-01 recovery point because the recorded one-day Starter expiry has passed. |
| Prior restore result | Restored to a separate new Starter instance, reached Active, and was removed. `KINGA-staging` and `KINGA-production` remained separate and Active. | Retained as evidence of the snapshot-to-new-instance recovery path only. |
| D-01 recovery point | **Not recorded.** | Before an execution authority is requested, the owner must capture the then-current latest successful `KINGA-staging` snapshot from TiDB Cloud, including backup UTC timestamp, status, expiry/retention, selected restore action, exact source target, and console capture time. |
| Recovery acceptance | Free Starter snapshot recovery was accepted for the rehearsal only. | The owner must expressly accept the actual D-01 recovery limitation and confirm the snapshot remains valid for the approved window. No automatic backup is treated as sufficient without this confirmation. |
| Manual backup or PITR | Not proposed, requested, or authorised. Starter PITR is unavailable. | Any future manual-backup request or service-class change requires its own owner decision; neither is implied by D-01. |
| Stop rule | Any absent, stale, expired, failed, or target-ambiguous snapshot record stops D-01. | Do not proceed, substitute an older snapshot, or create a backup without new explicit authority. |

## 4C. UTC-bounded change-window decision record — review only

No D-01 change window is scheduled or authorised by this draft. The following record must be completed and approved in writing after the current snapshot record and constrained account design have been reviewed.

| Field | Draft value | Required decision before execution |
|---|---|---|
| Packet | `D-01` only; three tables and 11 SHA-pinned `CREATE` statements. | Confirm unchanged scope and hash. |
| Planned start / end | **Unscheduled.** | Supply explicit UTC start and end times. |
| Named operator / reviewer | Tavonga Shoko, KINGA owner, under the dated D-01-only exception. | Confirm availability for the complete window and closure evidence. |
| Stop authority | Tavonga Shoko, KINGA owner. | Confirm authority to stop immediately on any preflight, execution, postflight, or application-gate discrepancy. |
| Application isolation owner | **Unassigned.** | Name the person accountable for determining whether application traffic must be paused or isolated for the window. |
| Application validation owner and observer | **Unassigned.** | Name the person who will conduct and record the separately approved non-production smoke tests. |
| Communication route | **Unassigned.** | Record the incident/escalation and completion route before the window. |
| Network posture | Existing owner-managed TiDB Cloud public-endpoint settings are unchanged by this packet. | Confirm the narrow approved route; no access-list expansion/revocation is implied. |
| Entry gate | No account creation, staging preflight query, or SQL command is authorised. | A separate owner decision must approve accounts and read-only preflight before execution may be considered. |
| Exit gate | No later Wave, application rollout, or production work is implied. | Close D-01 with evidence, runner revocation/expiry, and a fresh decision before considering D-02. |

## 5. Preconditions that remain incomplete

No D-01 execution decision may be requested until every item below is recorded and accepted.

| Required evidence | Required content | Draft state |
|---|---|---|
| Target identity proof | Owner-approved TiDB organisation, project, cluster ID/name, database `kinga_staging`, AWS Frankfurt region, Starter service class, and connection/TLS method. | Partially evidenced from prior read-only inspection; must be reconfirmed immediately before any action. |
| Reviewer-control exception | The dated D-01-only owner exception in Section 1A, including its strict scope and expiry, plus a commitment to retain complete preflight/execution/postflight evidence for later independent review. | Accepted by the owner for D-01 only; no exception exists for D-02–D-06 or production. |
| Least-privilege accounts | Owner-created verifier and D-01-only schema runner, separate from runtime credentials; redacted grants proving no DML, no `DROP`, no user administration, and no cross-database or production scope. The specific design is in Section 4A. | Designed for review; creation is not authorised by this draft. |
| Current recovery record | Latest successful snapshot UTC timestamp, expiry/retention evidence, accepted RPO/RTO limitation, and recovery approver. The review-only record is in Section 4B. | Missing for future execution time; the prior rehearsal snapshot is expired. |
| Change window | UTC start/end, application isolation owner, communications route, operator, reviewer, observer, and stop authority. The review-only record is in Section 4C. | Unscheduled and not authorised. |
| Preflight metadata | Verifier-produced inventory showing the exact approved initial state, including zero D-01 tables or a separately approved reconciliation decision. | Missing; no staging metadata query is authorised by this draft. |
| Application gate | Named non-production test identities, smoke-test scope, expected results, application owner, and observation record. | Missing. |

## 6. Future preflight, execution, and postflight protocol

The following sequence is retained for later review. It is procedural control text, **not** an instruction to execute now.

| Step | Required later evidence | Mandatory stop condition |
|---|---|---|
| 0. Written execution authority | Owner-approved D-01 identifier, exact target, change window, SQL and source pins, current recovery point, operator/reviewer identity, dated Section 1A exception, and stop authority. | Any blank, expired, mismatched, ambiguous, or out-of-D-01-exception field. |
| 1. Identity and privilege check | Read-only verifier transcript showing exact target, TLS negotiation, server/version, database, account identity, and redacted grants. | Target/TLS/account mismatch, privilege excess, runtime-credential reuse, or inaccessible metadata. |
| 2. Preflight metadata | Machine-readable table, column, key, index, foreign-key, and default inventory. It must show an empty D-01 target state or the separately approved baseline state. | Existing or unexpected root structure, any drift, or inability to inspect it. |
| 3. Recovery-point check | Current owner-approved snapshot timestamp and retention/expiry evidence, tied to the target and window. | Missing, expired, unaccepted, or misrouted recovery evidence. |
| 4. Exact SQL execution | One statement at a time using the approved D-01-only runner, with SHA-256 verified before use and a redacted statement result log. | Any failed statement, timeout, connection/lock error, unexpected output, or deviation from 11 permitted statements. |
| 5. Postflight metadata | Independent verifier comparison against the pinned source/SQL: exactly the three tables, three primary keys, two unique constraints, eight named indexes, expected defaults, and no unapproved object. | Any expected/actual difference. |
| 6. Application validation | Separately approved non-production identity/tenant/invitation and user-access smoke tests, performed by the named application owner. | Any runtime, authentication, tenant-isolation, data-integrity, or rendering failure. |
| 7. Closure | Runner revocation/expiry evidence, retained logs, outstanding-issue record, owner sign-off under the D-01 exception, and an explicit decision whether D-02 may be considered. D-02 requires an independent reviewer. | Missing closure evidence, unresolved defect, or an attempt to carry the exception forward. |

## 7. D-01 acceptance criteria

This packet can pass only if all the following are true after an explicitly authorised future execution:

1. The target is the owner-approved staging database and is not production.
2. The exact SQL hash is `306797ab94529860bc9e88a69a955061916a94ddc3d08e3265229780ab08083c`; execution comprises exactly 11 permitted `CREATE` statements.
3. The postflight result contains only the three D-01 tables and their reviewed keys, unique constraints, defaults, and eight named indexes.
4. No DML, destructive statement, account administration, unexpected object, or source/schema deviation is observed.
5. The named application smoke tests pass and the owner verifies the complete preflight/postflight comparison under the dated D-01-only exception; the evidence is retained for later independent review.
6. The schema-runner account is revoked or expires after the window, and no later packet is attempted without its own separate approval.

## 8. Owner review decision

| Decision | Current state |
|---|---|
| Approve this D-01 document as a planning/review packet | Pending owner review. |
| Accept D-01-only single-person operator/reviewer exception | Accepted by Tavonga Shoko, KINGA owner, 12 September 2026. Expires at D-01 closure and does not apply to any later packet or production. |
| Name an independent reviewer for D-02–D-06 or production | Required before any later packet is considered. |
| Authorise migration-account creation | Not requested and not approved. |
| Authorise staging preflight access | Not requested and not approved. |
| Authorise D-01 staging DDL | Not requested and not approved. |
| Authorise production work | Explicitly excluded. |

## References

1. `audit/gate-c-wave-one-review-2026-09-11.md` and `audit/gate-c-scratch-baseline/wave-01-evidence/README.md` — reviewed Wave 1 SQL scope, hashes, scratch replay, and metadata fingerprint.
2. `audit/gate-d-readonly-staging-inspection-attempt-2026-09-11.md` — authorised staging read-only inspection and completed Starter restore-and-cleanup rehearsal evidence.
3. `docs/staging-schema-reconciliation/gate-d-execution-readiness-plan.md` — Gate D access, recovery, independent review, execution, stop, and closure controls.
4. [TiDB Cloud Starter or Essential Backup and Restore](https://docs.pingcap.com/tidbcloud/backup-and-restore-serverless/) — documented Starter snapshot and PITR limitations.
5. [TiDB Privilege Management](https://docs.pingcap.com/tidb/stable/privilege-management/) — database privilege model and required privileges for `CREATE TABLE` and `CREATE INDEX`.
