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
| Application-validation roles | Tavonga Shoko may also act as D-01 application-validation owner and observer because no independent owner is currently available. The role is included in this same D-01-only exception; it provides no independent assurance. |
| Expiry | The exception ends immediately when D-01 is closed, stopped, or abandoned. It cannot be carried to D-02–D-06, any recovery action, an application rollout, or production. |
| Reopening rule | Any scope enlargement, target ambiguity, preflight/postflight difference, execution error, expired recovery record, or application smoke-test failure voids the exception and requires a new owner decision before further action. |

This exception accepts the absence of separation of duties for D-01 only, including the application-validation owner/observer assignment; it does not represent independent assurance. The retained evidence must therefore be sufficiently complete for a later independent review, and the owner must not rely on this exception to bypass any other D-01 stop condition.

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

The owner accepted the free Starter recovery posture for the completed **staging rehearsal** and subsequently accepted, for **D-01 only**, that a same-day current Free Starter snapshot is the valid recovery point for any later D-01 execution decision. The recovery rehearsal restored the successful `2026-09-11 03:00:45 UTC` `KINGA-staging` snapshot to a separately named disposable instance, confirmed it Active, and then removed only that target. Final owner-supplied TiDB Cloud resource-list evidence shows only `KINGA-staging` and `KINGA-production`, both Active. No SQL, schema/data action, or application test was executed against the restored target.

| Recovery control | D-01 draft position |
|---|---|
| Rehearsal | Passed for the selected Starter snapshot-to-new-instance path, including target cleanup. |
| Current recovery point | **Not yet current for D-01.** An owner-approved latest successful same-day snapshot timestamp and expiry must be captured again immediately before an execution decision. |
| PITR | Not available on free Starter. This is accepted for the staging rehearsal and D-01 only, subject to the same-day recovery-point restriction in Section 4B. |
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
| D-01 recovery point | **Captured for final preflight review:** `2026-09-12 03:01:00 UTC+00:00`; status **Succeeded**; expiry `2026-09-13 03:01:00 UTC+00:00`; source selector `KINGA-staging`; Restore action visibly available. | This evidence supports review of the proposed window only. The owner must re-confirm it is still present and valid immediately before any future execution decision. |
| Recovery acceptance | Free Starter snapshot recovery is accepted for D-01 only under the same-day limitation in the decision below. | The owner must expressly accept the final preflight package and confirm the evidenced snapshot remains valid for the proposed window. No automatic backup is treated as sufficient without this confirmation. |
| Manual backup or PITR | Not proposed, requested, or authorised. Starter PITR is unavailable. | Any future manual-backup request or service-class change requires its own owner decision; neither is implied by D-01. |
| Stop rule | Any absent, stale, expired, failed, or target-ambiguous snapshot record stops D-01. | Do not proceed, substitute an older snapshot, or create a backup without new explicit authority. |

### D-01 same-day Starter recovery-point acceptance

| Field | Recorded decision |
|---|---|
| Decision maker | Tavonga Shoko, KINGA owner |
| Decision date | 12 September 2026 |
| Accepted limitation | Free Starter retains the available snapshot for one day; only a snapshot captured and still valid on the same UTC date as the proposed D-01 window can serve as its recovery point. |
| Limited scope | D-01 only: the three-table identity/tenant-root packet for `KINGA-staging`. |
| Current console evidence | Owner-supplied `KINGA-staging` Backup-page view: Backup time `2026-09-12 03:01:00 UTC+00:00`; Status **Succeeded**; Expires time `2026-09-13 03:01:00 UTC+00:00`; Restore visibly available. |
| Window coverage assessment | The snapshot and 14:00–20:00 UTC proposed window are on the same UTC date. The snapshot precedes the proposed start by 10 hours 59 minutes, and its expiry is 5 hours 1 minute after the required 22:00 UTC window-plus-safety-margin endpoint. **Timing criterion passed for review.** |
| Required confirmation | The owner must re-confirm the current TiDB Cloud Backup record immediately before a future execution decision and expressly confirm its timestamp, successful status, expiry, source target, and validity for the proposed window. |
| Excluded scope | This decision does not permit an old snapshot, a manual backup, PITR, account creation, staging SQL, DDL/DML, later waves, recovery/cutover action, or production work. |
| Expiry | The acceptance expires when D-01 is closed, stopped, abandoned, or moves outside the snapshot’s recorded validity; it is not transferable to D-02–D-06 or production. |

## 4C. UTC-bounded change-window decision record — review only

No D-01 change window is scheduled or authorised by this draft. The following **proposed** window is deliberately later on 12 September 2026, preserving a substantial review period before any possible action and a protected postflight/closure period afterwards. It becomes usable only if the owner captures and accepts a same-day successful snapshot whose recorded expiry safely covers the entire window.

| Field | Draft value | Required decision before execution |
|---|---|---|
| Packet | `D-01` only; three tables and 11 SHA-pinned `CREATE` statements. | Confirm unchanged scope and hash. |
| Original proposed start / end | 12 September 2026, 14:00–20:00 UTC (`16:00–22:00 GMT+2`). | Replaced by the owner’s later revised window below; it is no longer the D-01 execution window. |
| Revised authorised start / end | **Immediate start through 12 September 2026, 13:00 UTC**. | Explicitly authorised by the owner on 12 September 2026. All other scope, SQL pins, target, recovery, stop, and production-exclusion controls remain unchanged. |
| Review buffer before window | Approximately 6 hours 48 minutes from the 07:11 UTC drafting reference time to the proposed 14:00 UTC start. | Use this time for review of the actual snapshot record, target/account controls, and final go/no-go decision. No preflight query or account action is implied. |
| Protected postflight buffer | 10:00–13:00 UTC is reserved for verifier postflight, application smoke test, retained-evidence review, runner revocation/expiry, and closure decision; no D-02 activity may begin in this window. | If D-01 is not conclusively closed by 13:00 UTC, stop and carry no authority forward. |
| Snapshot-expiry safety margin | The current same-day snapshot must remain valid for the full revised window **plus at least two hours** after closure, through 15:00 UTC. | If the console-recorded expiry is before 15:00 UTC, or any timestamp is ambiguous, stop D-01. |
| Named operator / reviewer | Tavonga Shoko, KINGA owner, under the dated D-01-only exception. | Confirm availability for the complete window and closure evidence. |
| Stop authority | Tavonga Shoko, KINGA owner. | Confirm authority to stop immediately on any preflight, execution, postflight, or application-gate discrepancy. |
| Application isolation owner | **Unassigned.** | Name the person accountable for determining whether application traffic must be paused or isolated for the window. |
| Application validation owner and observer | Tavonga Shoko, KINGA owner, under the dated D-01-only exception. | Record the exact basic connectivity/read smoke observations and result; this is not independent assurance. |
| Communication route | **Unassigned.** | Record the incident/escalation and completion route before the window. |
| Network posture | Existing owner-managed TiDB Cloud public-endpoint settings are unchanged by this packet. | Confirm the narrow approved route; no access-list expansion/revocation is implied. |
| Entry gate | No account creation, staging preflight query, or SQL command is authorised. | A separate owner decision must approve accounts and read-only preflight before execution may be considered. |
| Exit gate | No later Wave, application rollout, or production work is implied. | Close D-01 with evidence, runner revocation/expiry, and a fresh decision before considering D-02. |

### Current snapshot capture record

The current browser session reached the TiDB Cloud sign-in page rather than the owner-authenticated console, so no current backup information was read or changed by this task. The owner supplied the following **read-only console evidence** from `KINGA-staging` → **Data** → **Backup**:

1. latest snapshot **Backup time** `2026-09-12 03:01:00 UTC+00:00`, **Status** Succeeded, and **Expires time** `2026-09-13 03:01:00 UTC+00:00`;
2. source instance selector `KINGA-staging` and a visible **Restore** action; and
3. sufficient validity to cover the same-day proposed window through its two-hour safety margin, as quantified in Section 4B.

The owner did not press **Restore**, create a new snapshot, change retention, alter networking, create an account, or perform any database operation as part of this evidence capture. If the snapshot is no longer visible, no longer valid, or does not meet the same-day and safety-margin conditions at the actual go/no-go point, the correct result is **no D-01 execution** and a new review after the next available snapshot.

### Immediate-before-execution Backup-page recheck

At `2026-09-12 07:32:34 UTC`, the authenticated `KINGA-staging` Backup page was rechecked before any account, metadata, or SQL action. It still showed exactly one relevant snapshot: Backup time `2026-09-12 03:01:00 UTC±00:00`; Status **Succeeded**; Expires time `2026-09-13 03:01:00 UTC±00:00`; and a visible Restore action. The recheck was read-only: Restore was not selected and no console setting was changed.

For the owner-authorised revised immediate-to-13:00 UTC window, the recheck left 5 hours 27 minutes 26 seconds of authorised time. The two-hour post-closure safety-margin endpoint is `2026-09-12 15:00 UTC`; the recorded snapshot expiry is 12 hours 1 minute after that endpoint. The snapshot and revised window end are on the same UTC date. **The recovery-point and timing stop gates passed.**

## 5. Preconditions that remain incomplete

No D-01 execution decision may be requested until every item below is recorded and accepted.

| Required evidence | Required content | Draft state |
|---|---|---|
| Target identity proof | Owner-approved TiDB organisation, project, cluster ID/name, database `kinga_staging`, AWS Frankfurt region, Starter service class, and connection/TLS method. | Partially evidenced from prior read-only inspection; must be reconfirmed immediately before any action. |
| Reviewer-control exception | The dated D-01-only owner exception in Section 1A, including its strict scope and expiry, plus a commitment to retain complete preflight/execution/postflight evidence for later independent review. | Accepted by the owner for D-01 only; no exception exists for D-02–D-06 or production. |
| Least-privilege accounts | Owner-created verifier and D-01-only schema runner, separate from runtime credentials; redacted grants proving no DML, no `DROP`, no user administration, and no cross-database or production scope. The specific design is in Section 4A. | Designed for review; creation is not authorised by this draft. |
| Current recovery record | Latest successful snapshot UTC timestamp, successful status, expiry evidence, source target, and accepted same-day limitation. The verified current record is in Section 4B. | Complete for final preflight review; re-confirm immediately before any execution decision. |
| Change window | UTC start/end, application isolation owner, communications route, operator, reviewer, observer, and stop authority. The current record and Backup-page recheck are in Section 4C. | Revised and authorised for immediate start through 13:00 UTC on 12 September 2026; recovery timing gate passed. |
| Preflight metadata | Verifier-produced inventory showing the exact approved initial state, including zero D-01 tables or a separately approved reconciliation decision. | Missing; no staging metadata query is authorised by this draft. |
| Application gate | Tavonga Shoko is the D-01 application-validation owner and observer under the dated exception. The basic connectivity/read smoke-test scope and observation record remain required. | Partially assigned; no smoke test has been run. |

## 5A. Final-preflight review status

The following matrix is the complete review package requested before any D-01 execution authority is considered. It does not convert incomplete live controls into approval to perform them.

| Control | Evidence available for final review | Position |
|---|---|---|
| D-01 source scope and SQL pin | Three named tables, 11 `CREATE`-only statements, no FKs, Gate C two-run local scratch proof, and SQL SHA-256 `306797ab94529860bc9e88a69a955061916a94ddc3d08e3265229780ab08083c`. | Complete for review. |
| Staging target/recovery rehearsal | Successful snapshot-to-new-instance rehearsal and target cleanup; final evidence shows original `KINGA-staging` and `KINGA-production` remain Active. | Complete for review. |
| Same-day D-01 snapshot | `KINGA-staging` snapshot from `2026-09-12 03:01:00 UTC+00:00`, Succeeded, expiring `2026-09-13 03:01:00 UTC+00:00`; Restore action visible. | Complete for review; must be reconfirmed immediately before a future execution decision. |
| D-01 same-day Starter limitation | Owner-accepted, dated 12 September 2026, and limited to D-01. | Complete for review. |
| D-01 single-person operator/reviewer exception | Owner-accepted, dated 12 September 2026; limited to D-01 and expiring at D-01 closure. | Complete for review. |
| Proposed change window | 12 September 2026, 14:00–20:00 UTC; current snapshot expiry exceeds the required 22:00 UTC safety-margin endpoint by 5 hours 1 minute. | Timing criterion passed for review; window itself remains unapproved. |
| Verifier/runner account design | Separate D-01-only capability matrices, lifecycle requirements, privilege exclusions, and evidence requirements in Section 4A. | Complete for review; no account exists or is authorised to be created. |
| Target identity and grant proof | Historical verifier evidence exists, but execution-time target/TLS/account/grant evidence has not been collected. | Incomplete and prohibited until separately authorised. |
| Metadata preflight and postflight | Exact required comparison method, fingerprints, and stop conditions are specified. | Incomplete and prohibited until separately authorised. |
| Application-validation gate | Owner/observer exception, required basic connectivity/read scope, and pass/fail treatment are specified. | Incomplete: no smoke test has been run and its observations must be retained before closure. |
| D-01 execution authority | No owner decision authorises staging DDL or account creation. | **Not authorised.** |

## 5B. Decision requested after final review

The only decision requested at this stage is approval or rejection of this **final-preflight review package**. Approval of the package would not authorise account creation, a staging connection, metadata collection, or D-01 SQL execution. Any later request must separately identify the exact next action, its operator, its target, and its authority boundary.

## 5C. Execution-window target observation

At `2026-09-12 07:28 UTC`, an authenticated TiDB Cloud console view of the selected resource showed `KINGA-staging` as **Active**, Starter, TiDB v8.5.3, AWS Frankfurt (`eu-central-1`), instance ID `10622508722732097493`, with row-based storage recorded as `0 MiB`. The same resource list showed only `KINGA-staging` and `KINGA-production`, both Active. This establishes that the authenticated session is on the intended non-production resource; it is **not** the required immediate Backup-page snapshot recheck, which must be completed before any account or SQL action.

## 5D. D-01 existing-administrator access exception

The intended design used separate restricted verifier and runner accounts. TiDB’s required `INDEX` privilege also permits `DROP INDEX`, so a runner capable of the eight D-01 index creations could not satisfy a literal no-destructive-capability requirement. Before any account was created, the owner selected **Option B** on 12 September 2026: use the already authenticated TiDB Cloud SQL Editor administrator account for D-01 rather than create either planned account.

| Field | Recorded exception |
|---|---|
| Decision maker | Tavonga Shoko, KINGA owner |
| Decision date | 12 September 2026 |
| Account | Existing authenticated TiDB Cloud SQL Editor administrator account. A read-only `SHOW GRANTS FOR CURRENT_USER()` check recorded broad global privileges and `WITH GRANT OPTION`; its account identifier is intentionally not reproduced in this packet. |
| Scope | D-01 only, targeting database `kinga_staging` and only the pinned three-table / eleven-statement SQL artefact. |
| Explicitly not performed | No separate verifier or runner account was created, modified, or granted privileges. |
| Residual risk | The console administrator has privileges broader than D-01. The operator must use only the exact preflight queries and SHA-pinned SQL stated in this packet; no additional statement may be added, edited, or executed. |
| Retained controls | Immediate Backup-page recheck, exact target/database verification, preflight metadata inventory, SQL hash and statement-count verification, one-statement-at-a-time execution record, postflight comparison, application connectivity/read smoke test, and documented closure. |
| Expiry | Ends immediately at D-01 closure, stop, or 13:00 UTC on 12 September 2026, whichever occurs first. It cannot carry to later waves, account administration, restore activity, application deployment, or production. |
| Escalation rule | Any deviation, query error, unexpected object, unexpected data, source/hash mismatch, or timing breach stops D-01 immediately. |

This exception does not reclassify the administrator as least privilege and does not waive the requirement to retain auditable evidence. The account-session `SHOW GRANTS` result is treated as privileged security evidence and is deliberately not copied into repository documentation.

## 5E. Immediate D-01 metadata preflight evidence

At `2026-09-12 07:33:58 UTC`, the authenticated SQL Editor session completed `SHOW GRANTS FOR CURRENT_USER()` as a read-only preflight. The result confirmed that the existing session has broad global administrative capability, including account-management and grant authority. This is the specific basis for the owner-approved Section 5D exception; no account, role, grant, or privilege was changed.

At `2026-09-12 07:39:40 UTC`, the session ran the following read-only target inventory query:

```sql
SELECT table_name, table_type
FROM information_schema.tables
WHERE table_schema = 'kinga_staging'
ORDER BY table_name;
```

The query completed successfully in 9 ms and returned an empty set. The `kinga_staging` schema therefore contains zero visible tables under the authenticated session at preflight. Together with the authenticated console’s confirmed `KINGA-staging` instance identity, active state, same-day successful snapshot, and revised execution window, the preflight target-state gate passed.

The SQL Editor still displayed **No database used** after this schema-inventory query. Before any pinned D-01 statement is entered, the session must select `kinga_staging` as its active database through the console and then run a read-only `SELECT DATABASE()` confirmation. Any other active database, or failure to obtain an explicit `kinga_staging` result, is a mandatory stop.

At `2026-09-12 07:40:44 UTC`, the session issued `USE kinga_staging;`. This is a non-DDL session-context selection and is not part of the SHA-pinned D-01 artefact or its eleven permitted DDL statements. At `2026-09-12 07:41:16 UTC`, `SELECT DATABASE() AS active_database;` returned exactly `kinga_staging` in 8 ms. The active-target stop gate therefore passed.

Immediately before execution, the repository artefact was rehashed. Its SHA-256 was exactly `306797ab94529860bc9e88a69a955061916a94ddc3d08e3265229780ab08083c`; it contains exactly three `CREATE TABLE` statements (`tenant_invitations`, `tenants`, `users`), eight `CREATE INDEX` statements with the approved names, and zero statements matching the prohibited `DROP`, `ALTER`, `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `GRANT`, `REVOKE`, `CREATE USER`, `CREATE DATABASE`, or `USE` classes. **All D-01 preflight stop gates passed.**

### Execution stop — SQL Editor input truncation

At `2026-09-12 07:43 UTC`, before selecting **Run**, the attempt to load the first pinned `CREATE TABLE tenant_invitations` statement into the TiDB Cloud SQL Editor exceeded the browser input timeout. A subsequent readback of the editor buffer showed an incomplete statement: the `role` enum ended at the truncated value `'fleet_dri'`, and the remainder of the statement was absent. This does not match the SHA-pinned source artefact.

No DDL was submitted, no table or index was created, and no data, account, privilege, backup, restore, network, or production action occurred. Under the packet’s hash/deviation stop rule, D-01 execution is **stopped before its first schema statement**. The incomplete editor buffer must be cleared or the console session closed without selecting Run. Any later execution attempt requires a new safe transfer mechanism that can verify the exact full statement text or the complete pinned artefact before each execution action, followed by renewed owner authority.

At `2026-09-12 07:43:34 UTC`, the unexecuted incomplete buffer was cleared. The editor returned to its empty prompt and its query log still ended with the successful read-only `SELECT DATABASE()` result. The browser did not select Run after the truncation. D-01 remains stopped and no schema object has been created.

The owner subsequently authorised use of TiDB Cloud **SQL Files** as the only transfer mechanism for a renewed D-01 attempt. The transfer is limited to the exact local file `wave-01-identity-tenant-roots.sql`, whose SHA-256 is `306797ab94529860bc9e88a69a955061916a94ddc3d08e3265229780ab08083c`. Uploading the file is not execution. Before any Run action, the SQL File content and loaded editor buffer must each be verified against the complete local artefact; any difference, unreadable content, automatic transformation, unexpected statement, or wrong active database is a mandatory stop. This renewed transfer authority does not change the preflight, snapshot, target, SQL-scope, exception-expiry, or production-exclusion controls.

At `2026-09-12 07:45 UTC`, the authenticated TiDB Cloud **SQL Files** tab was inspected. Its only available control was **Create a new SQL file**; the resulting new-query editor did not expose a file upload control. A direct DOM check also found zero `input[type=file]` controls and no visible upload action. The selected transfer mechanism is therefore unavailable in this console interface. No local artefact was uploaded, no query content was loaded from the artefact, and no SQL statement was run. D-01 remains stopped pending renewed owner direction on a different verified full-content transfer method.

The owner then authorised the replacement **A2 exact-content editor-paste** method. At `2026-09-12 07:49 UTC`, the immutable GitHub artefact at Gate C source revision `4336a2961147877a373a11a706e2a7ee4604f754` was retrieved in the authenticated browser and validated before loading: HTTP `200`, plain-text response, 4,253 characters, SHA-256 `306797ab94529860bc9e88a69a955061916a94ddc3d08e3265229780ab08083c`. The verified text was atomically inserted into the CodeMirror editor. A fresh browser-side SHA-256 over the complete resulting buffer exactly matched the expected value; it remained 4,253 characters with exactly 3 `CREATE TABLE` statements, 8 `CREATE INDEX` statements, and zero prohibited statement classes. The editor’s active database had been set to `kinga_staging` in the current SQL Files session. **The exact-content transfer and buffer-validation gates passed; no Run action had yet occurred at this point.**

The console’s **Run** control did not add the atomically-inserted buffer to the query log, indicating that the editor application had not registered the programmatic buffer mutation as executable query state. To recover through a native paste event, the exact source was prepared for the browser clipboard after the same hash check. The browser clipboard write did not complete within its allowed operation time, and the attempted keyboard paste was interpreted by the editor as a single literal `V`, not clipboard content. The `V` residue was cleared at `2026-09-12 07:52:38 UTC`; the editor returned to its empty prompt and query log remained limited to `USE kinga_staging;`. No pinned statement was submitted or run.

This is a second safe-transfer failure, not a database discrepancy. The complete D-01 artefact and its browser-buffer hash were verified, but the console has not provided a reliable route from that buffer into executable query state. D-01 is therefore **stopped before first DDL**. Further automated transfer attempts are prohibited in this window; any later resumption requires renewed owner authority for a different execution mechanism and a new immediate preflight.

## 5A. Proposed direct TLS-client workaround — review only

The recommended recovery path is a local MySQL-compatible command-line client, not the TiDB Cloud browser SQL editor. TiDB Cloud Starter supports direct MySQL-protocol connections over public or private endpoints, and its public standard connection requires TLS.[6] [7] The local execution environment has a MariaDB-compatible `mysql` client with `--ssl`, `--ssl-ca`, and `--ssl-verify-server-cert` support. This proposal is not authority to create an account, obtain a password, establish a connection, or execute SQL.

| Control | Proposed direct-client mechanism |
|---|---|
| Source integrity | Read only the local Wave 1 file. Recalculate SHA-256 and require exact equality with `306797ab94529860bc9e88a69a955061916a94ddc3d08e3265229780ab08083c` before any connection. |
| Separator handling | Treat only the ten exact `--> statement-breakpoint` delimiters as non-SQL transport markers. Validate 11 resulting statements, their allowed class/name list, and a separate SHA-256 for each statement before sending it. Do not edit, regenerate, or substitute the source file. |
| Transport | Use the exact host, port, and TiDB Cloud username format displayed in the **Connect** dialog; require TCP/TLS and server-certificate validation against the Ubuntu CA bundle. Do not reuse a runtime application URL or password. |
| Runner identity | Create a temporary D-01 runner with a host restriction matching the then-current execution IP, TLS required, and only `CREATE` plus `INDEX` on `kinga_staging.*`. `INDEX` necessarily retains the previously disclosed `DROP INDEX` residual capability; D-01 must keep the short lifetime, exact-statement guard, and immediate stop rules as compensating controls. |
| Verifier identity | Create a separate temporary D-01 verifier, TLS and same-host restricted, with read-only access only to the three empty D-01 tables and metadata required for preflight/postflight. It receives no DDL, DML, grant, or production scope. |
| Credential handling | The TiDB console account-creation statement must use a password verifier rather than a plaintext secret if the exact supported authentication form is confirmed. The temporary cleartext secret must be supplied through an approved secure channel, kept in a mode-`0600` temporary client defaults file, never printed in command output or committed, and securely removed after the run. TiDB does not support random password generation, so no password can be safely assumed or invented.[8] |
| Preflight | Reconfirm the current same-day snapshot, target/active database, public-network allowance for the then-current client IP, full source and statement hashes, runner/verifier effective grants, and zero D-01 tables. Any difference stops the run. |
| Execution | Send exactly one verified statement at a time through the runner. Capture only statement ordinal, source hash, statement hash, server result, duration, and non-sensitive error details. A nonzero client result stops immediately; no later statement is sent. |
| Postflight | Use the verifier for a machine-readable comparison of the three tables, three primary keys, two unique constraints, eight named indexes, and expected defaults. The three tables must remain empty. The owner then records the basic connectivity/read result under the D-01 exception. |
| Closure | Remove the temporary credentials and separately authorised temporary accounts; preserve redacted grant, client version, TLS, statement, metadata, and smoke-test evidence. No later wave is implied. |

### Required new owner decision before this workaround can run

1. Approve the direct-client pathway and replace the browser-editor execution channel; this requires a **new immediate preflight**, even if the current snapshot is still valid.
2. Authorise creation and later removal of the two short-lived D-01 identities, including the disclosed unavoidable `INDEX`/`DROP INDEX` residual capability for the runner.
3. Supply or approve secure delivery of the temporary direct-client credentials and confirm the exact TiDB Cloud Connect host, port, and username-prefix format; no secret may be copied into chat, shell output, Git, or the audit document.
4. Confirm the current sandbox public IP is permitted by the owner-managed TiDB Cloud public-endpoint rules at execution time. The IP may change after sandbox resume; a historical allow-list entry is not sufficient evidence.
5. Re-authorise the exact D-01 source hash, the execution window, and account cleanup after reviewing the generated statement-hash manifest and client plan.

This approach avoids the defective browser-editor transfer path while preserving stronger evidence than manual pasting. It does not cure the TiDB privilege model’s lack of a create-index-only grant, and it does not eliminate the D-01-only single-person control exceptions. Production remains expressly excluded.

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
| Accept same-day Free Starter recovery limitation and current snapshot timing assessment | Accepted for D-01 only by Tavonga Shoko, KINGA owner, 12 September 2026. Snapshot timing meets the proposed window-plus-margin criterion; re-confirmation remains required before any execution decision. |
| Approve the proposed 14:00–20:00 UTC D-01 window | Pending; the window is documented for review only. |
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
6. [Connect to Your TiDB Cloud Starter or Essential Instance](https://docs.pingcap.com/tidbcloud/connect-to-tidb-cluster-serverless/) — supported direct MySQL-protocol connections and network paths.
7. [TLS Connections to TiDB Cloud Starter or Essential](https://docs.pingcap.com/tidbcloud/secure-connections-to-serverless-clusters/) — public-endpoint TLS requirement and Connect-dialog connection details.
8. [TiDB Security Compatibility with MySQL](https://docs.pingcap.com/tidb/stable/security-compatibility-with-mysql/) — TiDB’s unsupported random-password generation and supported authentication model.
