# Gate D — D-03 Read-Only Preflight Evidence

**Status:** In progress. This record contains only authenticated console observations and source-derived comparisons. It does not authorize or perform DDL, DML, account/grant changes, networking changes, backup/restore actions, deployment, or production work.

## Fresh recovery observation

| Observation time | Target | Backup time | Status | Expires time | Action taken |
|---|---|---|---|---|---|
| 2026-09-13 approximately 14:22 UTC | `KINGA-staging` / `kinga_staging` | `2026-09-13 03:01:00 UTC±00:00` | `Succeeded` | `2026-09-14 03:01:00 UTC±00:00` | Read-only Backup-page inspection only; no restore, backup-setting, or database action. |

This is fresh console evidence for D-03 packet review. It is not an execution-window approval and must be rechecked immediately before any separately authorised D-03 action.

## Exact runner-account grant recheck

The authenticated SQL editor executed `SHOW GRANTS FOR '289ZyKGJwbC2SkB.d01_runner'@'%';` as a read-only metadata query at approximately 14:23 UTC. It returned the following two rows in 20 ms:

```sql
GRANT USAGE ON *.* TO '289ZyKGJwbC2SkB.d01_runner'@'%'
GRANT SELECT,CREATE,REFERENCES,ALTER,INDEX ON `kinga_staging`.* TO '289ZyKGJwbC2SkB.d01_runner'@'%'
```

The immutable Wave 3 source contains only 50 `CREATE TABLE`, 26 `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY`, and 111 `CREATE INDEX` statements. Its source-derived minimum execution privileges are therefore `CREATE`, `ALTER`, `REFERENCES`, and `INDEX`; `SELECT` is additionally necessary for the stipulated preflight/postflight metadata checks. The exact tenant-prefixed account has each of these privileges on `kinga_staging.*`, and no broader schema-level grant appeared in the returned rows. **No source-derived D-03 privilege gap was found.**

This evidence supports packet review only. It neither authorises execution nor permits any change to the account, its grants, the target schema, or the network.

## D-03 execution preflight — fresh same-day recovery recheck

| Observation time | Target | Backup time | Status | Expires time | Action taken |
|---|---|---|---|---|---|
| 2026-09-14 approximately 09:53 UTC | `KINGA-staging` / `kinga_staging` | `2026-09-14 03:00:00 UTC±00:00` | `Succeeded` | `2026-09-15 03:00:00 UTC±00:00` | Read-only Backup-page inspection only; no restore, backup-setting, or database action. |

The current snapshot is same-day and successful. Its expiry is later than the present preflight time; the final window duration and two-hour post-closure margin remain an execution-time acceptance check and must be recorded before the first ledger statement.

## D-03 execution preflight — prerequisite and absence inventory

At approximately 09:54 UTC, the authenticated SQL editor ran the following read-only query in 76 ms:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'kinga_staging'
ORDER BY table_name;
```

The console reported **23 rows**. This is the expected cumulative D-01/D-02 table count. The result export is retained for an exact set comparison with the pinned D-01/D-02 sources and the absence of all 50 D-03 table names.

The SQL editor’s result-download control was selected after the query. The current browser view did not expose a newly named local export path, so exact comparison will use the retained result if downloaded or a read-only result-grid extraction; this does not alter the preflight query result or the database.

The downloaded export `results-2026-09-14-095538.csv` was normalized for its CSV quotes and compared offline with the immutable Wave 1 and Wave 2 source table names. It contained exactly the expected **23** prerequisite names: no missing prerequisite, no unexpected live table, and no intersection with the immutable **50** D-03 table names. **Table-set prerequisite and D-03 table-absence check: PASS.**

After the table comparison, the authenticated SQL editor was restored and completed its permission validation. The remaining preflight queries will remain read-only and run only against `kinga_staging`.

The first attempt to enter a ten-table `COUNT(*)` union timed out in the editor and left an incomplete statement ending `UNION ALL SELECT ''`. It was **not executed**. The count evidence will be collected using shorter, complete read-only query groups only.

The first five-table replacement also timed out while entering its third clause and was **not executed**. The editor therefore contains an incomplete read-only draft only. Remaining count checks will use compact individual or two-table statements; no malformed draft will be run.

The incomplete draft was replaced without execution by one complete scalar-subquery `COUNT(*)` statement containing all 23 D-01/D-02 prerequisite tables. Its full text was visually confirmed in the editor before execution.

At approximately 10:02 UTC, that complete read-only statement ran in **161 ms**. The SQL editor returned one result row with `0` for every one of the 23 fields, covering all D-01/D-02 prerequisite tables. **Closed-wave zero-row prerequisite check: PASS.**

The next complete read-only query was loaded and visually checked. It selects only from `information_schema.table_constraints`, filters to `kinga_staging` foreign keys, and matches only the 26 exact D-03 source constraint names.

At approximately 10:03 UTC, the exact D-03 foreign-key absence query completed in **67 ms** with `Query OK` and an **empty set**. No D-03 named foreign key exists. **D-03 foreign-key absence check: PASS.**

The final D-03 object-absence query was loaded and visually checked. It selects only from `information_schema.statistics` and counts distinct table/index pairs for the complete 50-table D-03 source set. Because the query is table-scoped, a zero result establishes the absence of every D-03 index object, including all 111 planned explicit indexes.

At approximately 10:04 UTC, the table-scoped index query completed in **11 ms** and returned `existing_d03_index_objects = 0`. Together with the exact 50-table absence proof, no D-03 explicit-index object exists. **D-03 index absence check: PASS.**

### Fresh preflight conclusion

| Gate | Result |
|---|---|
| Same-day `KINGA-staging` snapshot | PASS — `2026-09-14 03:00 UTC`, `Succeeded`, expires `2026-09-15 03:00 UTC` |
| Closed D-01/D-02 table set | PASS — exact 23 tables; no missing or unexpected object |
| Closed D-01/D-02 rows | PASS — all 23 counts are zero |
| D-03 table absence | PASS — no intersection with the 50 source table names |
| D-03 foreign-key absence | PASS — all 26 named constraints absent |
| D-03 explicit-index absence | PASS — zero index objects across all 50 source tables; consequently all 111 planned explicit indexes are absent |

The fresh read-only preflight gates pass. This result permits the next controlled execution step only under the owner-approved D-03 exception, pinned source and ledger, per-statement SHA-256 verification, and immediate-stop rule.

## Immediate execution controls

Immediately after the fresh preflight, local deterministic controls rechecked the immutable source SHA-256 `ccdca4a47d9d82c04cc9b9a12e6d49960d4271a052773a342282086a9aff9254`, the canonical 187-statement ledger, all 187 one-statement SQL files, and ordered-file SHA-256 `753586076353452445b7adbbddcb6666e1bb6495230cf684b5997e70c026df5a`. Both verifiers returned `PASS`; no file was missing, unexpected, or text/hash-mismatched.

The requested execution route is **not available in this sandbox**: `command -v claude` returned no command. No alternative execution route was substituted, and **no D-03 DDL was sent**. This is a controlled stop pending use of the approved Claude Code environment or a new owner instruction authorising a different execution route.

## Owner-reported D-03 partial execution and compatibility stop

The owner subsequently reported that Claude Code independently hash-verified and successfully executed original ordinals **1–13** in strict order. The reported target state is 13 D-03 tables alongside the 23 closed D-01/D-02 tables, all with zero rows. Original ordinal 14, `cost_learning_records`, was hash-verified and then rejected by the TiDB Cloud Starter parser because its `TEXT` columns used parenthesized string-literal defaults such as `DEFAULT ('[]')` and `DEFAULT ('{}')`. No later statement was sent, and no accepted statement was rerun.

This is an owner-reported execution record, not independent postflight evidence. The immutable original statement 14 remains retained with SHA-256 `706fb95e86213d9bd88f9c7375649d16ec2a56a2912af58cf3b30bd378b8ce8e`.

## Source-level compatibility reconciliation

The canonical schema now uses TiDB-supported `JSON_ARRAY()` / `JSON_OBJECT()` expressions for all 10 identified JSON-shaped `TEXT` defaults across Waves 3–5. The revised Wave 3 source, its 187-row full ledger, and the ordinal-14 onward 174-row resumption ledger are retained in the packet branch. The immutable-to-revised comparator passed: only ordinal 14 differs; ordinals 1–13 and 15–187 remain byte-identical. The revised ordinal-14 SHA-256 is `082052db3bbe4acc4dd72f10f2d043a2ed7c60f82adca4ea2328db39a00ab3be`.

No revised D-03 statement has been executed. Any resumption requires a fresh snapshot and target/partial-state read-only preflight at the time of use, independent verification of the revised hashes, and execution of **only original ordinals 14–187**. See `gate-d-text-default-compatibility-2026-09-14/README.md` and the revised D-03 packet for the complete control record.
