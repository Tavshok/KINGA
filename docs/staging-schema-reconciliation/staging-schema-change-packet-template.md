# KINGA Staging Schema Change Packet — Template

> **Use:** one packet per reviewed staging schema wave. This template does not authorise execution by itself.

## 1. Change identity

| Field | Required value |
|---|---|
| Change ID | `STG-SCHEMA-YYYYMMDD-NN` |
| Source commit SHA | Exact reviewed Git commit |
| Drizzle schema checksum | SHA-256 |
| Migration journal checksum | SHA-256 |
| Target | `kinga_staging` only |
| Window owner / reviewer / stop authority | Named people and roles |

## 2. Exact intended metadata delta

| Object | Action | Rationale | Parent/FK prerequisite | Expected column/index/FK count |
|---|---|---|---|---|
| `<table or object>` | `CREATE TABLE` / approved additive change | Approved decision-ledger reference | `<required parent>` | `<counts>` |

Attach the generated SQL as a separate checksum-locked file. A packet must list every statement; an unlisted statement is a stop condition.

## 3. Preconditions

- [ ] Staging firewall, TLS and least-privilege verification are current.
- [ ] `kinga_verify` remains read-only and is available for post-change metadata checks.
- [ ] The source/migration manifest and decision ledger are approved for this wave.
- [ ] Scratch replay passed against an empty disposable database from the same source commit.
- [ ] No generated statement is destructive, rename-like, a data backfill, or an unreviewed `ALTER`.
- [ ] TiDB backup/recovery capability, retention and recovery target are recorded.
- [ ] No production credentials, production data or current managed `DATABASE_URL` are in scope.

## 4. Stop conditions

Stop before or during execution if any of the following occurs:

1. SQL differs from the reviewed/checksummed packet.
2. A statement proposes `DROP`, unapproved `ALTER`, a rename, data change, or an unexpected index/foreign key.
3. A required parent object is missing.
4. TiDB returns a warning/error or any metadata delta differs from expectation.
5. The read-only verification identity loses its expected restriction or cannot inspect metadata.
6. Recovery evidence is unavailable or a named stop authority cannot be reached.

## 5. Post-change metadata verification

| Check | Expected result | Actual result | Reviewer sign-off |
|---|---|---|---|
| Table manifest | Exact approved set |  |  |
| Column names/types/nullability/defaults | Exact approved manifest |  |  |
| Primary/unique/index definitions | Exact approved manifest |  |  |
| Foreign keys and referenced parents | Exact approved manifest |  |  |
| Unexpected objects | None |  |  |
| Migration journal | Exact approved entries |  |  |

## 6. Recovery record

| Item | Required evidence |
|---|---|
| Pre-change metadata export | File/checksum/location |
| TiDB recovery point or backup reference | Identifier and timestamp |
| Recovery target | Separate staging recovery database/cluster name |
| Restore rehearsal result | Command/runbook reference and outcome |
| Decision after failure | Stop / restore-to-new-target / escalation owner |

## 7. Completion

- [ ] All post-change metadata checks match.
- [ ] Full packet, logs and manifests are retained in the repository/audit store.
- [ ] Any exception is recorded with owner and expiry; no exception is silently carried to the next wave.
- [ ] A separate approval is received before the next staging wave.
