# KINGA Schema Scratch-Replay Design

**Status:** Design only. No scratch database, container, migration command, DDL, schema comparison against a database, or external environment operation was performed while producing this document.
**Scope boundary:** This design is a prerequisite for a future, separately approved **Gate B** migration-chain repair package. It does not authorise work against `kinga_staging`, KINGA production, the current managed database, or any database containing claims, users, documents, quotations, evidence, workflow data or credentials.

## 1. Purpose

The scratch replay is intended to answer one narrow question before staging bootstrap is ever considered:

> Can a reviewed, explicitly journaled KINGA migration chain create its approved schema baseline from an empty, disposable MySQL/TiDB-compatible database with zero SQL errors and an exact, machine-comparable metadata result?

It is not an application test, a data-migration test, a performance test, a production rehearsal or proof that managed-database history can be replayed safely. It validates schema-chain integrity only.

## 2. Isolation model

| Control | Required design | Prohibited condition |
|---|---|---|
| Target name | Unique, timestamped disposable database or container, for example `kinga_schema_scratch_YYYYMMDD_NN` | `kinga_staging`, production, current managed database, or an unlabelled shared development database. |
| Credentials | Ephemeral scratch-only connection identity, stored only in the execution environment’s secure secret store | Root TiDB credentials, the staging verification account, a production account, or `DATABASE_URL` inherited without an explicit guard. |
| Network | Local disposable engine is preferred. If a remote scratch service is used, it must be a separately named non-production target with its own firewall/identity record. | A scratch connection that can resolve to staging or production. |
| Data | Empty only for the initial replay. | Claims, users, quotations, documents, evidence, personal data, production exports, or a copy of a managed database. |
| Lifecycle | Build → inspect → preserve logs/manifests → destroy only under an explicit cleanup instruction after evidence is retained. | Silent auto-delete or destructive cleanup that loses the failed replay evidence. |

## 3. Immutable inputs

Before a future replay begins, the executor must freeze and record these inputs in its change packet:

| Input | Required record | Reason |
|---|---|---|
| Git source | Exact Git commit SHA and clean `git status` output | Ensures schema, SQL and journal are from one auditable revision. |
| Source manifest | SHA-256 of `audit/staging-schema-manifest/source-schema-manifest.json.gz` | Fixes the expected type/column/index/FK contract. |
| Migration manifest | SHA-256 of `audit/staging-schema-manifest/migration-artifact-manifest.json` | Fixes the reviewed artefact set and its classification. |
| Decision ledger | SHA-256 of `audit/staging-schema-manifest/drift-decision-ledger.json.gz` | Prevents an unclassified table from entering the execution scope. |
| Journal | SHA-256 of `drizzle/meta/_journal.json` and a table of all registered tags | Makes skipped/renumbered history visible. |
| Engine | MySQL/TiDB version, image/digest or managed-service version; SQL mode and charset/collation | Schema semantics and index support can differ by engine/version. |
| Runner | Node, pnpm, Drizzle Kit and shell-tool versions | Produces a reproducible toolchain record. |

The present manifest package identifies **57 journaled primary-chain SQL artefacts, 4 journal-skipped numbered artefacts, 20 supplementary artefacts and 1 manual/unregistered artefact**. A future replay must not silently substitute this classification with file-order execution. [1]

## 4. Preflight gates

No DDL should be attempted until all preflight gates pass.

| Gate | Required check | Pass condition | Stop condition |
|---|---|---|---|
| P1 | Target identity | Connection resolves to the explicitly named disposable scratch target and a zero-table metadata snapshot is retained. | Target is staging/production, has unknown rows/objects, or identity cannot be proven. |
| P2 | Secret separation | Scratch connection is separate from `DATABASE_URL`, `KINGA_STAGING_DATABASE_URL`, and all production credentials. | Any inherited/ambiguous target credential. |
| P3 | Source clean state | Branch is clean and manifests/checksums match the reviewed packet. | Uncommitted/generated SQL differs from reviewed input. |
| P4 | Migration classification | Every candidate file is registered, explicitly corrected, or explicitly excluded. | Any journal gap, supplementary script, unregistered SQL or known failing file is selected implicitly. |
| P5 | SQL review | Every statement in the next test batch is enumerated, checksum-locked and has an expected metadata delta. | Auto-generated unreviewed SQL, prompt auto-acceptance, `DROP`, data SQL, rename, or unexpected `ALTER`. |
| P6 | Evidence retention | Log directory and recovery evidence location are available before execution. | A failure cannot be retained or attributed to a precise statement. |

## 5. Proposed replay sequence

The sequence is deliberately split. It should never attempt the entire historical tree in one command.

### R0 — Static chain validation, no database

Run the committed manifest generator and verifier from the selected Git commit. Confirm the source/migration count reconciliation, classification completeness, direct-runtime evidence rule, duplicate-declaration handling and known-risk inventory. This is the last gate that is fully read-only.

**Expected output:** a checksum-locked manifest package and explicit set of files proposed for repair/replay. No SQL connection is opened.

### R1 — Historical-chain diagnostic replay, scratch only

Under a future Gate B approval, replay **only** the registered historical sequence in a new empty scratch target, one reviewed file at a time. Capture the exact first error, SQL file, statement boundary, server version, resulting metadata and journal state. The purpose is to document the current chain’s failure modes, not to ignore them.

**Expected result from existing evidence:** a failure or incomplete result is plausible because the journal skips `0056`–`0059`, `0058_claim_comments_extend.sql` assumes a non-existent physical column, and `0045_colossal_molecule_man.sql` has a text-index issue. [2]

**Stop rule:** on the first SQL error, stop the historical diagnostic replay. Do not “continue on error,” skip the file, hand-run the remainder, or call the resulting database a baseline.

### R2 — Corrected migration-chain replay, scratch only

Create a separate repair branch containing only reviewed migration-chain corrections. It must not alter staging, production or data. The repair design must:

1. Make the `0056`–`0059` journal treatment explicit and reproducible.
2. Replace unsafe/incorrect historical assumptions with forward corrective migration artefacts; never mutate historic SQL in place where it may have run elsewhere without a clear history decision.
3. Separate the `claim_comments` physical-name correction from later additive columns so one invalid operation cannot hide later work.
4. Correct/reconsider the governance-notification text index with the appropriate key-prefix/alternate indexing design, only if the index is still functionally required.
5. Classify `rate_limit_tracking` into a reviewed, journaled design or an explicitly excluded compatibility artefact.

Replay the corrected chain in a **new** empty scratch target. The command runner must enumerate the next file, print its checksum and stop non-zero on failure. It must not use `scripts/db-push.mjs`, because that helper auto-accepts creation/rename prompts before migration. [3]

**Exit condition:** zero errors; exact applied-file log; no unregistered execution; and metadata manifest equal to the approved chain-only expectation.

### R3 — Approved baseline-wave rehearsal, scratch only

After R2 succeeds and the table-by-table decision ledger has human approval, generate a candidate baseline wave from the approved source manifest. Start with only the dependency-root wave—tenant/identity/organisation/reference tables—and validate it before the claims/assessment/report waves.

For each wave:

1. Review SQL manually against the decision ledger.
2. Assert the reviewed statement set contains only the allowed operation types.
3. Apply to a new scratch target whose R2 chain is already verified.
4. Export `information_schema` tables, columns, indexes, foreign keys and constraints.
5. Compare the export to the expected manifest for that wave.
6. Preserve output and reviewer sign-off before starting the next wave.

**Stop condition:** any object omitted, unexpected object, mismatch in physical column name/type/nullability/default/index/FK, or an operation outside the packet.

## 6. Metadata comparison design

The future runner must produce a machine-readable record from both the expected source manifest and the scratch database. The comparison key is not just a table name.

| Object level | Required comparison fields |
|---|---|
| Table | Physical name, engine, collation/charset where material, and approved existence status. |
| Column | Physical name, ordinal position where ordering matters, type, length/precision/scale, nullability, default, generated/auto-increment properties and comment where used for semantics. |
| Primary/unique/index | Name, uniqueness, column sequence/order, prefix length, index type and visibility where supported. |
| Foreign key | Constraint name, child columns, parent table/columns, and delete/update action. |
| Journal | Exact applied tag, ordering and checksum/version policy. |

The compare output must distinguish **missing**, **unexpected**, **different**, and **unverifiable**. A matched table name is not a pass if a tenant key, evidence field, default, index or parent relation differs.

## 7. Recovery and evidence retention design

| Point | Required action | Why |
|---|---|---|
| Before R1/R2/R3 | Retain a zero-table metadata snapshot, target identity record, runner version record and packet checksums. | Proves the replay began on a disposable empty target. |
| On failure | Stop at first error; retain SQL file checksum, stdout/stderr, server error, metadata snapshot and precise step. | Enables repair without hidden partial state. |
| On success | Retain applied-file manifest, final metadata export, expected-versus-actual diff, journal record and reviewer sign-off. | Allows a later staging change packet to be grounded in reproducible evidence. |
| Cleanup | Do not destroy the failed/successful target until the retention artefacts are confirmed. Destruction requires its own recorded instruction. | Avoids loss of the only reproduction evidence. |

No destructive reverse SQL is proposed for scratch failure handling. The normal response is to preserve the failed target as evidence and create a new target for the next attempt. This avoids contaminating the next result with a partial/mutated state.

## 8. Explicit exclusions

The following may not be included in a scratch replay without a new approval:

- any row export/import, backup restore containing personal or claim data, anonymised data copy, or row-level checksum;
- any app deployment/configuration that points a server at `kinga_staging`;
- migration-account creation in TiDB Cloud;
- modification of `DATABASE_URL`, `KINGA_STAGING_DATABASE_URL`, firewall rules, certificates or current hosted service configuration;
- application code change unrelated to reproducing the reviewed migration chain;
- production metadata query, production backup, production credential use or production DDL.

## 9. Gate B approval checklist

Before a future migration-chain repair task starts, the reviewer must confirm all of the following in writing:

- [ ] The manifest package count reconciliation is accepted: 242 production-schema declarations, 226 MySQL declarations, 221 distinct MySQL/TiDB physical names, 16 PostgreSQL auxiliary declarations, and 5 test-only factory calls—not the unverified 254 figure.
- [ ] The table-by-table decision ledger is reviewed and no unclassified source declaration is being silently added to a baseline.
- [ ] A disposable target and scratch-only credentials are named and cannot resolve to staging or production.
- [ ] The exact migration-chain repair scope is identified before any replay command is written.
- [ ] The change packet template, recovery evidence location and stop authority are approved.
- [ ] The user separately authorises scratch-only DDL. This Option A package does **not** provide that authorisation.

## References

[1]: `audit/staging-schema-manifest/migration-artifact-manifest.json` — generated repository-only migration classification and checksums.

[2]: `docs/SCHEMA_MIGRATION_DRIFT_AUDIT.md` — prior static and disposable-MySQL replay evidence for journal, claims-comment and text-index defects.

[3]: `scripts/db-push.mjs` — existing helper that auto-accepts generator prompts and immediately calls `drizzle-kit migrate`; deliberately excluded from the controlled replay design.
