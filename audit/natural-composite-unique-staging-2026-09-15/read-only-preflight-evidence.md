# NCU-01 Read-Only Staging Preflight Evidence

## Status and scope

**Status: in progress; execution is not authorized.** This record covers only the owner-authorized, read-only NCU-01 preflight for the four hash-pinned natural/composite unique-index statements. It records no DDL, DML, account or grant change, restore action, deployment, recovery/cutover, or production activity.

On 15 September 2026, **Tavonga Shoko** explicitly accepted the NCU-01 sole operator/reviewer/application-validation-owner exception. The exception is limited to the four hash-pinned NCU-01 statements on `KINGA-staging`; it expires on NCU-01 closure, stop, abandonment, or approved-window expiry and transfers no recovery, deployment, D-06, or production authority. The owner authorized **fresh read-only preflight only** and reserved a separate post-preflight execution decision.

## Packet pins

| Control | Pinned value |
|---|---|
| Staging packet | `docs/staging-schema-reconciliation/natural-composite-unique-staging-change-packet-draft-2026-09-15.md` |
| Transition source SHA-256 | `a8b8e8fda51a0830116d2516a7d017ee7401e3b35a72e7a7773e1689c10ab9be` |
| Ordered four-file SHA-256 | `81f1cba9f009ea414edd06c3bb8fbaf34fc462d25e3a5f6063a6731aa6ab1ab5` |
| Expected baseline table inventory | 188 names; SHA-256 `36b26b9ee7dcbc0f1883f31db0a06840f5fd247cf8958f8e23f3d608c4bb52b5` |
| Preflight query manifest | `audit/natural-composite-unique-staging-2026-09-15/preflight/query-hash-manifest.json` |

## Fresh authenticated observations

| UTC observation | Control | Query or console evidence | Result | Status |
|---|---|---|---|---|
| 2026-09-15 approximately 18:37 | Recovery snapshot | Authenticated `KINGA-staging` TiDB Cloud Backup page | Snapshot `2026-09-15 03:00:45 UTC±00:00`; **Succeeded**; expires `2026-09-16 03:00:45 UTC±00:00`. Restore control was visible and not selected. | Pass for read-only preflight; execution window remains unapproved. |
| 2026-09-15 approximately 18:39 | Exact table inventory | `01-baseline-table-inventory.sql`, SHA-256 `9b392e047ef0dcaedaf7d0ab65b0783d8fa1c3d2e5390689328938c5b466dab2` | Authenticated query completed in 185 ms and returned 188 rows. Export retained as `preflight-exports/01-baseline-table-inventory.csv`; after normalizing TiDB CSV quoting and its terminal newline only, the 188-name sorted set matched `expected-baseline-table-inventory.txt` byte-for-byte with SHA-256 `36b26b9ee7dcbc0f1883f31db0a06840f5fd247cf8958f8e23f3d608c4bb52b5`. | Pass. |
| 2026-09-15 approximately 18:43 | Baseline row state | `02-baseline-zero-row-assertion.sql`, SHA-256 `1a3f0497749751a168cf6e6b1d13147e858ff8e7c9d9f162d303bb70c0f9be76` | Authenticated query completed in 597 ms: `tables_checked=188`, `total_rows=0`, `minimum_rows=0`, `maximum_rows=0`. | Pass. |
| 2026-09-15 approximately 18:44 | Target-column metadata | `03-target-column-metadata.sql`, SHA-256 `aeaac79f1dcec9ed1373a50abe42b639e601fba686128d919158f8c299590df0` | Authenticated query completed in 31 ms and returned 41 `information_schema.columns` rows. Export retained as `preflight-exports/03-target-column-metadata.csv`; deterministic source-to-live comparator passed: 3/3 target tables, 41/41 columns, zero mismatches. The source comparator follows the established policy of comparing defaults only when an explicit source default exists. | Pass. |
| 2026-09-15 approximately 18:46 | Current index state | `04-current-index-state.sql`, SHA-256 `8f728bd281020137a6e6690d7d71a7b8eff15a62243f45b8433d219f14c9b451` | Authenticated query completed in 14 ms and returned exactly two rows. Export retained as `preflight-exports/04-current-index-state.csv`; CSV-aware comparator passed: the only matching pre-transition object is non-unique `unique_assessor_tenant` on `assessor_insurer_relationships` (`assessor_id`, then `tenant_id`), and all three planned unique indexes are absent. | Pass. |
| 2026-09-15 approximately 18:47 | Duplicate-pair preflight | `05-duplicate-pair-preflight.sql`, SHA-256 `3faaad3ba9ae21dd7b5c26215c408dd82692e5239de898c01911247781e04216` | Authenticated query completed in 18 ms and returned the three expected pair rules. Export retained as `preflight-exports/05-duplicate-pair-preflight.csv`; CSV-aware verifier passed: every rule has `duplicate_groups=0` and `rows_in_duplicate_groups=0`. | Pass. |
| 2026-09-15 approximately 18:48 | Exact runner grants | `SHOW GRANTS FOR '289ZyKGJwbC2SkB.d01_runner'@'%';`, SHA-256 `0420570427e2bf7ce0d3f7dcf5a3ca8f2ee1f089de4121f7b20f686dc76be1be` | Authenticated query completed in 20 ms and returned exactly two rows: global `USAGE`; and `SELECT, CREATE, REFERENCES, ALTER, INDEX` on ``kinga_staging`.*` only. | Pass. The four-statement transition requires `ALTER` and `INDEX`; no privilege gap is present. |

## Remaining mandatory controls

## Read-only preflight conclusion

All mandatory fresh live controls passed: current Starter snapshot visible and unexpired at observation; exact 188-table baseline inventory; zero rows across all 188 tables; target-table structural metadata; correct existing non-unique assessor index and absence of all planned unique indexes; zero duplicate groups for each proposed pair; and exact least-privilege tenant-prefixed runner grants.

After reviewing this evidence, Tavonga Shoko separately authorized execution **only** of the four hash-pinned NCU-01 statements through the owner’s local Claude Code environment, strictly one statement at a time and in ordinal order. The authorization retains every stop condition, prohibits `mysql < file`, grant changes, and work outside NCU-01, and keeps the same narrow sole-role exception expiry. The durable owner-only handoff is `owner-local-claude-code-execution-handoff.md`.

## Immediate packet-integrity recheck

After completing the live controls, no-database deterministic verification reconfirmed the packet artifacts:

| Control | Result |
|---|---|
| Packet generator verify mode | Pass: four statements; 188 baseline tables; transition SHA-256 `a8b8e8fda51a0830116d2516a7d017ee7401e3b35a72e7a7773e1689c10ab9be`; ordered-file SHA-256 `81f1cba9f009ea414edd06c3bb8fbaf34fc462d25e3a5f6063a6731aa6ab1ab5`. |
| Individual statement files | Pass: all four files match their ledger SQL text and SHA-256 values. |
| Whitespace and sensitive-content guard | Pass: no `git diff --check` issue and no credential-pattern match in the bounded source/tooling/packet paths. |
| Focused source-contract regression | Pass: Vitest 3/3, covering exact approved pair constraints and the deliberate absence of an `entity_relationships` secondary unique index. |

**This conclusion does not authorize execution.** The owner must separately review this evidence and grant execution authority before any of the four statements can be sent through the stipulated local Claude Code route.
