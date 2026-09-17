# Live Test-Data Full Reset: Encrypted Archive and Restore-Rehearsal Proof

**Captured:** 17 September 2026, during the owner-approved maintenance window  
**Scope:** archive and disposable restore rehearsal only  
**Deletion status:** **not executed**

## 1. Purpose and control boundary

This record documents the mandatory recovery gate that precedes any future live deletion. The work captured an encrypted full logical snapshot of the frozen live project database, then restored that archive into a fresh, **local-only disposable MariaDB instance with networking disabled**. No live database object, user, claim, configuration record, or credential was deleted, updated, or otherwise changed by the archive/rehearsal procedure.

The public site was first rechecked at `https://kingaai-ybs42lwg.manus.space/readyz`. It returned the expected `503` maintenance response with `MAINTENANCE_IN_PROGRESS`. The final aggregate live preflight showed zero new users and zero new claims in the preceding hour. The live population remained **44,885 users** and **18,066 claims**, and the newest creation timestamp in both populations remained **11 September 2026 11:49:37**.

> The public `/healthz` path returns a hosting-level 404 at this domain. That is not a failure of the freeze control. The application’s established readiness endpoint returned the intended maintenance 503 throughout the verification.

## 2. Encrypted archive evidence

The archive was streamed directly from the frozen source database through GnuPG symmetric AES-256 encryption. No plaintext logical dump was retained on disk. The archive passphrase was generated for and stored by the owner; it is not recorded in this document, the repository, shell history, or archive manifest.

| Evidence item | Result |
|---|---:|
| Archive format | GnuPG symmetric AES-256 encrypted SQL stream |
| Encrypted archive SHA-256 | `0bc94ee9e78622ccf4b59ab338aaad1ea44ede9808d0e8d02a20641abbd33da6` |
| Encrypted archive size | 175,703,125 bytes |
| Decrypted-stream SHA-256 | `bf5af9ded7c131235fb4352f38c463d9329fef830e97365cadf3638814755225` |
| Plaintext dump retained | No |
| Row-level data or PII written to this record | No |

The encrypted archive and its non-sensitive manifest have also been preserved as review artifacts. The final response to the owner will provide the encrypted-file recovery link and the matching manifest link.

## 3. Disposable restore result

The restore target was a newly initialized MariaDB data directory on the sandbox filesystem. It accepted no TCP connections and was stopped after verification. This target was separate from the live project database and was deleted only after the proof data was captured.

| Aggregate proof | Source | Restored target | Result |
|---|---:|---:|---|
| `users` row count | 44,885 | 44,885 | Match |
| `claims` row count | 18,066 | 18,066 | Match |
| Latest user creation timestamp | 11 September 2026 11:49:37 | Same | Match |
| Latest claim creation timestamp | 11 September 2026 11:49:37 | Same | Match |
| Composite source/restore fingerprint | `44885|18066|2026-09-11 11:49:37|2026-09-11 11:49:37` | Same | **Exact match** |
| Restored base tables | — | 238 | Completed |
| Restored foreign-key constraints | — | 79 | Completed |
| `mariadb-check` output digest | — | `92ef72ffc7d7b4fa28f0a4a593e3dda502f15346bb3445c226ff11983dd47d66` | Completed |

The final machine-readable result was **`fingerprints_match=true`**.

## 4. Restore-only compatibility transform

The archive is the original encrypted source dump and was **not altered**. The disposable restore stream required a documented compatibility transform because the live TiDB schema includes historic declarations that TiDB accepts but MariaDB 10.11 rejects. The transform operated only between archive decryption and the local disposable target; it did not change the source archive or the live database.

| Restore-only compatibility action | Count | Reason |
|---|---:|---|
| Added primary key to auto-increment field lacking any key | 4 | MariaDB requires each auto-increment field to be indexed; TiDB accepted these historic declarations without one. |
| Renamed foreign-key constraint | 79 | MariaDB requires schema-wide unique InnoDB FK names; TiDB permits historic repeats. |
| Removed empty-named index declaration | 2 | MariaDB rejects an empty index identifier; the affected declarations were redundant legacy metadata. |
| Replaced MySQL 8 collation token | 1 | MariaDB 10.11 does not recognise `utf8mb4_0900_ai_ci`; it was mapped only in the disposable stream to `utf8mb4_unicode_ci`. |

These transformations are evidence of a **cross-engine rehearsal compatibility layer**, not a recommendation to mutate the live TiDB schema. The exact source-derived user and claim aggregate fingerprints matched after the restore.

## 5. Gate outcome and required next authorization

The archive-and-restore-proof gate **passes**. The encrypted snapshot is decryptable with the owner-held passphrase, restores to a separate disposable instance, and preserves the agreed aggregate population fingerprint. The maintenance freeze remains active.

No deletion has been executed. Before any delete statement, the owner must separately review this result and explicitly authorize the final execution package, including the frozen target manifest, dependency-order deletion ledger, and independent postflight controls. The future delete phase must not reuse an old count without a final fresh preflight.
