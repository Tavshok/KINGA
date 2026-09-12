# D-01 Wave 1 Staging Change Packet — Review Draft

## Status and authority boundary

**Status: Draft for KINGA owner review only.** This packet documents the first possible staging-only reconciliation change for the Wave 1 identity and tenant-root structures. It authorises no connection, credential creation, account change, backup action, restore, SQL execution, DDL, DML, application configuration change, or production work.

The owner has approved preparation of this packet and is provisionally named as both its operator and reviewer. That role assignment is sufficient for document drafting only. The Gate D readiness plan requires a **second person** to perform independent packet review before any execution decision; a single person must not both execute and independently approve the result.

> **Execution remains prohibited.** A new, explicit written authority must name D-01, confirm the actual staging target and recovery point, designate a least-privilege runner account and an independent reviewer, approve a change window, and authorise the exact pinned SQL before any staging DDL can be considered.

## 1. Packet identity

| Field | Draft value | Execution status |
|---|---|---|
| Packet ID | `D-01` | Draft only |
| Purpose | Create the Wave 1 identity and tenant-root baseline on the approved empty staging target. | Not authorised |
| Environment | `KINGA-staging`, database `kinga_staging`, AWS Frankfurt (`eu-central-1`), Starter | Reconfirm immediately before any execution; no connection is authorised by this draft. |
| Operator | KINGA owner (provisional named operator) | No execution authority issued. |
| Reviewer | KINGA owner (provisional named reviewer) | **Independent second-person reviewer still required** before execution. |
| Change approver and stop authority | KINGA owner | Explicit D-01 execution approval still required. |
| Application owner and observer | Unassigned | Must be named before the application-validation gate. |
| Change window | Unassigned | Must be UTC-bounded and approved before execution. |
| Production | `KINGA-production` | Explicitly excluded. No production connection, action, or planning is authorised. |

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

## 5. Preconditions that remain incomplete

No D-01 execution decision may be requested until every item below is recorded and accepted.

| Required evidence | Required content | Draft state |
|---|---|---|
| Target identity proof | Owner-approved TiDB organisation, project, cluster ID/name, database `kinga_staging`, AWS Frankfurt region, Starter service class, and connection/TLS method. | Partially evidenced from prior read-only inspection; must be reconfirmed immediately before any action. |
| Independent reviewer | A named person other than the operator, able to review the pin, preflight, execution record, and postflight comparison. | Missing. |
| Least-privilege accounts | Owner-created verifier and D-01-only schema runner, separate from runtime credentials; redacted grants proving no DML, no `DROP`, no user administration, and no cross-database or production scope. | Missing; creation is not authorised by this draft. |
| Current recovery record | Latest successful snapshot UTC timestamp, expiry/retention evidence, accepted RPO/RTO limitation, and recovery approver. | Missing for future execution time. |
| Change window | UTC start/end, application isolation owner, communications route, operator, reviewer, observer, and stop authority. | Missing. |
| Preflight metadata | Verifier-produced inventory showing the exact approved initial state, including zero D-01 tables or a separately approved reconciliation decision. | Missing; no staging metadata query is authorised by this draft. |
| Application gate | Named non-production test identities, smoke-test scope, expected results, application owner, and observation record. | Missing. |

## 6. Future preflight, execution, and postflight protocol

The following sequence is retained for later review. It is procedural control text, **not** an instruction to execute now.

| Step | Required later evidence | Mandatory stop condition |
|---|---|---|
| 0. Written execution authority | Owner-approved D-01 identifier, exact target, change window, SQL and source pins, operator, independent reviewer, current recovery point, and stop authority. | Any blank, expired, mismatched, or ambiguous field. |
| 1. Identity and privilege check | Read-only verifier transcript showing exact target, TLS negotiation, server/version, database, account identity, and redacted grants. | Target/TLS/account mismatch, privilege excess, runtime-credential reuse, or inaccessible metadata. |
| 2. Preflight metadata | Machine-readable table, column, key, index, foreign-key, and default inventory. It must show an empty D-01 target state or the separately approved baseline state. | Existing or unexpected root structure, any drift, or inability to inspect it. |
| 3. Recovery-point check | Current owner-approved snapshot timestamp and retention/expiry evidence, tied to the target and window. | Missing, expired, unaccepted, or misrouted recovery evidence. |
| 4. Exact SQL execution | One statement at a time using the approved D-01-only runner, with SHA-256 verified before use and a redacted statement result log. | Any failed statement, timeout, connection/lock error, unexpected output, or deviation from 11 permitted statements. |
| 5. Postflight metadata | Independent verifier comparison against the pinned source/SQL: exactly the three tables, three primary keys, two unique constraints, eight named indexes, expected defaults, and no unapproved object. | Any expected/actual difference. |
| 6. Application validation | Separately approved non-production identity/tenant/invitation and user-access smoke tests, performed by the named application owner. | Any runtime, authentication, tenant-isolation, data-integrity, or rendering failure. |
| 7. Closure | Runner revocation/expiry evidence, retained logs, outstanding-issue record, owner and independent-reviewer sign-off, and an explicit decision whether D-02 may be considered. | Missing closure evidence or unresolved defect. |

## 7. D-01 acceptance criteria

This packet can pass only if all the following are true after an explicitly authorised future execution:

1. The target is the owner-approved staging database and is not production.
2. The exact SQL hash is `306797ab94529860bc9e88a69a955061916a94ddc3d08e3265229780ab08083c`; execution comprises exactly 11 permitted `CREATE` statements.
3. The postflight result contains only the three D-01 tables and their reviewed keys, unique constraints, defaults, and eight named indexes.
4. No DML, destructive statement, account administration, unexpected object, or source/schema deviation is observed.
5. The named application smoke tests pass and an independent reviewer verifies the preflight/postflight comparison.
6. The schema-runner account is revoked or expires after the window, and no later packet is attempted without its own separate approval.

## 8. Owner review decision

| Decision | Current state |
|---|---|
| Approve this D-01 document as a planning/review packet | Pending owner review. |
| Name an independent reviewer for any future execution | Pending. |
| Authorise migration-account creation | Not requested and not approved. |
| Authorise staging preflight access | Not requested and not approved. |
| Authorise D-01 staging DDL | Not requested and not approved. |
| Authorise production work | Explicitly excluded. |

## References

1. `audit/gate-c-wave-one-review-2026-09-11.md` and `audit/gate-c-scratch-baseline/wave-01-evidence/README.md` — reviewed Wave 1 SQL scope, hashes, scratch replay, and metadata fingerprint.
2. `audit/gate-d-readonly-staging-inspection-attempt-2026-09-11.md` — authorised staging read-only inspection and completed Starter restore-and-cleanup rehearsal evidence.
3. `docs/staging-schema-reconciliation/gate-d-execution-readiness-plan.md` — Gate D access, recovery, independent review, execution, stop, and closure controls.
4. [TiDB Cloud Starter or Essential Backup and Restore](https://docs.pingcap.com/tidbcloud/backup-and-restore-serverless/) — documented Starter snapshot and PITR limitations.
