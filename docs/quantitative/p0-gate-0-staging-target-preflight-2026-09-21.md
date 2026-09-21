# KINGA P0 Gate 0 — KINGA-staging Target Preflight

**Decision ID:** `KINGA-P0-GATE0-STAGING-TARGET-PREFLIGHT-2026-09-21`  
**Timestamp:** 2026-09-21T12:49:42Z  
**Status:** **Read-only preflight complete; Gate 0 remains blocked pending an owner baseline/reconciliation decision.**  
**Target:** KINGA-staging / `kinga_staging` only

## Scope and authority boundary

This report records the owner-authorized, **read-only** target preflight for P0. The connection used the existing dedicated `kinga_verify` account and hard-coded only `SELECT` and `SHOW` statements against `information_schema` and server metadata. The preflight did **not** read application records, create a credential, run a seed, author or apply a migration, issue DDL or DML, change a grant, or contact production.

The only named target is **KINGA-staging**. `scripts/db-push.mjs` and every unreviewed direct `DATABASE_URL` runner remain explicitly excluded as P0 execution mechanisms.

## Executive conclusion

The earlier repository-only Gate 0 finding was directionally correct but incomplete: the canonical Drizzle history is not a reproducible deployment record for the P0 surfaces. The newly authorized target read clarifies an important distinction.

> **KINGA-staging is not empty. Its 188 visible tables exactly match the completed Gate D closure inventory, and the twelve P0/inspection/active-geometry anchor tables that are present match the current checked-in Drizzle declarations at the inspected schema-shape level.**

This is **not** a clean canonical Drizzle migration baseline. The target has no visible `__drizzle_migrations` ledger; its observed state is attributable to the separately pinned Gate D packets and their closure evidence, not to a target-side replayable Drizzle ledger. The current source declares **224** MySQL tables, while the target contains the historic Gate D set of **188**. The three missing geometry tables are not an unexplained target failure: Gate C deliberately held them because they lacked an active runtime persistence contract. Their absence remains a product/ownership decision, not a repair action authorized by this preflight.

Accordingly, **P0 implementation remains blocked**. The owner must first decide whether to authorize a separate reconciliation/rehearsal plan that designates Gate D as the controlled staging baseline and resolves the canonical migration-history discontinuity. This preflight does not draft that plan or authorize any migration work.

## Target fingerprint

| Control                 | Observed result                                                       | Assessment                                                                            |
| ----------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Database                | `kinga_staging`                                                       | Matches the named target.                                                             |
| Server                  | TiDB Serverless `8.0.11-TiDB-v8.5.3-serverless`                       | TiDB-compatible target confirmed.                                                     |
| Authenticated principal | Dedicated `kinga_verify` verifier, principal suffix and host redacted | Matches the authorized read-only identity.                                            |
| Grants                  | Global `USAGE`; `SELECT` on `kinga_staging` only                      | Appropriate least-privilege verifier boundary.                                        |
| Transport               | TLS 1.3; `TLS_AES_128_GCM_SHA256`                                     | Encrypted network transport confirmed from both client and server status.             |
| Target inventory        | 188 visible base tables                                               | Exact set match with Gate D’s retained 188-table final inventory.                     |
| Row-state metadata      | The inspected anchors report zero metadata-estimated rows             | No application-table `SELECT` was issued; this is `information_schema` metadata only. |
| Drizzle target ledger   | `__drizzle_migrations` absent                                         | No target-side canonical Drizzle execution ledger is available for reconciliation.    |

The account cannot modify the target, which is intentional. Its `SELECT`-only grant also means that this evidence cannot be mistaken for staging DDL authority.

## Schema-shape reconciliation

The comparison used the current `drizzle/schema.ts` on main commit `696759a1`, the target’s `information_schema` table/column/index/constraint/FK metadata, the Drizzle journal and numbered SQL, supplementary SQL, the disposable CI snapshot, and the Gate D execution/closure artifacts. For each present object, the checked shape comparison covered column name and ordinal, SQL type, nullability, declared index names and ordered columns, and foreign-key count/definition. Primary-key and FK-support indexes that TiDB exposes separately in `information_schema.statistics` were reconciled through the matching key/constraint metadata rather than misclassified as drift.

| Object                          | Scope                        | Target schema result                                                                | Source and CI evidence                                                       | Deployment-ledger status                                                                                  | Classification             |
| ------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------- |
| `ai_assessments`                | P0 assessment anchor         | Present; 102/102 columns, types, nullability, required indexes, and claim FK match. | Legacy numbered and supplementary SQL exist; CI snapshot contains the table. | Gate D D-03 packet; current target is in the closed 188-table Gate D inventory. No target Drizzle ledger. | **Present and compatible** |
| `pipeline_runs`                 | P0 run anchor                | Present; 15/15 columns and declared indexes match.                                  | No canonical numbered create path; CI snapshot contains the table.           | Gate D D-05 packet; no target Drizzle ledger.                                                             | **Present and compatible** |
| `pipeline_jobs`                 | P0 job anchor                | Present; 20/20 columns, including the run/stage uniqueness shape, match.            | No canonical numbered create path; CI snapshot contains the table.           | Gate D D-05 packet; no target Drizzle ledger.                                                             | **Present and compatible** |
| `physical_measurements`         | P0 measured-value anchor     | Present; 26/26 columns and declared indexes match.                                  | No canonical numbered create path; CI snapshot contains the table.           | Gate D D-05 packet; no target Drizzle ledger.                                                             | **Present and compatible** |
| `inspections`                   | Inspection anchor            | Present; 30/30 columns and declared unique/index structure match.                   | No canonical numbered create path; CI snapshot contains the table.           | Gate D D-02 packet; no target Drizzle ledger.                                                             | **Present and compatible** |
| `inspection_projects`           | Inspection anchor            | Present; 16/16 columns and declared indexes match.                                  | No canonical numbered create path; CI snapshot contains the table.           | Gate D D-04 packet; no target Drizzle ledger.                                                             | **Present and compatible** |
| `component_benchmarks`          | P0 benchmark anchor          | Present; 21/21 columns and declared indexes match.                                  | Supplementary precision SQL exists; CI snapshot contains the table.          | Gate D D-05 packet; no target Drizzle ledger.                                                             | **Present and compatible** |
| `cost_learning_records`         | P0 learning anchor           | Present; 24/24 columns, indexes, and claim FK match.                                | Supplementary precision SQL exists; CI snapshot contains the table.          | Gate D D-03 packet; no target Drizzle ledger.                                                             | **Present and compatible** |
| `physics_validation_records`    | P0 physics validation anchor | Present; 24/24 columns and declared indexes match.                                  | No canonical numbered create path; CI snapshot contains the table.           | Gate D D-03 packet; no target Drizzle ledger.                                                             | **Present and compatible** |
| `vehicle_models`                | Geometry                     | Present; 13/13 columns and declared indexes match.                                  | No canonical numbered create path; CI snapshot contains the table.           | Gate D D-02 packet; no target Drizzle ledger.                                                             | **Present and compatible** |
| `measurement_types`             | Geometry                     | Present; 7/7 columns and unique code structure match.                               | No canonical numbered create path; CI snapshot contains the table.           | Gate D D-02 packet; no target Drizzle ledger.                                                             | **Present and compatible** |
| `vehicle_geometry_measurements` | Geometry                     | Present; 10/10 columns and `vehicle_models` FK match.                               | No canonical numbered create path; CI snapshot contains the table.           | Gate D D-02 packet, including the separately ledgered FK; no target Drizzle ledger.                       | **Present and compatible** |
| `vehicle_landmarks`             | Geometry                     | Absent.                                                                             | Declared in source and CI snapshot, but no canonical create path.            | Deliberately excluded from the Gate D 188-table baseline.                                                 | **Intentionally deferred** |
| `geometry_sources`              | Geometry                     | Absent.                                                                             | Declared in source and CI snapshot, but no canonical create path.            | Deliberately excluded from the Gate D 188-table baseline.                                                 | **Intentionally deferred** |
| `vision_calibration_results`    | Geometry                     | Absent.                                                                             | Declared in source and CI snapshot, but no canonical create path.            | Deliberately excluded from the Gate D 188-table baseline.                                                 | **Intentionally deferred** |

### Interpretation of the three deferred geometry objects

Gate C’s retained runtime review classified `vehicle_landmarks` as **seed-only**: the current source reaches it through a manual seed ingestor, not the live Stage 6.5A calibration query. It classified `geometry_sources` and `vision_calibration_results` as having **no active production runtime reader or writer**. In particular, Stage 6.5A carries calibration evidence through the assessment/pipeline flow rather than persisting it to `vision_calibration_results`.[1]

These findings make the absence intentional under the prior Gate D baseline. They do not authorize P0 to create the tables, repurpose `vision_calibration_results` as an evidence ledger, or seed the three active geometry tables. The current VGE correction uses `vehicle_models` and `vehicle_geometry_measurements`; staging metadata reports both tables as empty. Consequently, a claim executed there cannot be presumed to have vehicle geometry available. The correct package behavior is to abstain/review rather than fabricate calibrated physics, but this preflight did not execute a claim or run a seed.

## Deployment baseline and migration-history result

| Question                                                                              | Result                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Does the target match the complete Gate D closure inventory?                          | **Yes.** The target’s 188 table names exactly equal the retained final Gate D export.                                                                                                          |
| Does the target provide a canonical Drizzle migration ledger?                         | **No.** `__drizzle_migrations` is absent.                                                                                                                                                      |
| Does the current source equal the target’s full schema inventory?                     | **No.** Current source declares 224 tables; the target is a strict 188-table subset, with 36 current source-only declarations.                                                                 |
| Is there shape drift on the inspected present P0 anchors?                             | **No.** The twelve present anchor tables reconciled as compatible at the inspected metadata level.                                                                                             |
| Are the absent geometry tables unexplained deployment loss?                           | **No.** They were explicitly held out of Gate D because the then-current runtime did not own an active persistence contract.                                                                   |
| Is the canonical journal/snapshot history now safe to replay as the staging baseline? | **No.** The journal still skips `0056`–`0059`, the last canonical snapshot remains `0055`, and the previously recorded `0045`/`0058` issues remain outside this read-only target preflight.[2] |

The target’s exact Gate D match is strong evidence of **which schema packet family reached KINGA-staging**. It is not a substitute for a future approved deployment ledger, nor does it resolve how later current-source declarations will be reconciled. The read-only verifier therefore improves the baseline from “unknown target state” to “known Gate D baseline with no canonical target ledger.”

## Effect on P0 planning estimate

The estimate remains **10–14 calendar weeks** for the full P0 effort. The core contract implementation assumption remains in the lower **8–11 engineering-week** band only after a target baseline and rehearsal route are approved. The target findings removed the risk that the inspected P0 anchors are simply absent or structurally incompatible on staging, but they did **not** remove the work that makes the longer planning range necessary:

1. The canonical Drizzle journal/snapshot chain remains discontinuous and cannot be promoted silently as the deployment authority.
2. Gate D is a proven target baseline but must be explicitly designated and reconciled as the authoritative starting point before additive P0 DDL is designed.
3. P0 still needs contract-policy decisions, durable immutable evidence storage or an approved immutable snapshot alternative, legacy read behavior, writer ordering, test fixtures, compatibility checks, rehearsal, and a safe forward-only rollout plan.
4. The geometry tables required by current VGE lookup exist but are metadata-empty in staging; data ownership and seed/rehearsal decisions remain separate from P0 schema work.

## Decision requested — no implementation authority implied

The owner’s next decision is whether to authorize a **separate, non-executing P0 baseline repair/reconciliation plan and rehearsal gate**. If authorized, that proposal should: preserve all historical migration and Gate D artifacts; designate the controlled target baseline; define how the skipped journal history and post-`0055` snapshot discontinuity are handled; distinguish schema from seed/data authority; and set proof requirements for a disposable/sanitized rehearsal. It must not contain P0 implementation, a migration statement, a seed, or target DDL/DML until reviewed separately.

Until that decision, **P0 remains blocked** and no repair plan, migration, seed, source implementation, or configuration/deployment change is authorized by this report.

## Evidence references

[1]: [Gate C runtime candidate dispositions](../staging-schema-reconciliation/gate-c-runtime-candidate-dispositions.json)

[2]: Original P0 Gate 0 migration and deployment baseline, retained as the independent research artifact `/home/ubuntu/kinga-engine-research/P0-gate-0-migration-deployment-baseline-2026-09-21.md`

[3]: [Gate D independent postflight and closure](../../audit/gate-d-d05-independent-postflight-2026-09-15.md)

[4]: [Gate D final staging schema reconciliation closure](../../audit/gate-d-final-staging-schema-reconciliation-closure-2026-09-15.md)

[5]: [Current Drizzle journal](../../drizzle/meta/_journal.json)

[6]: [CI disposable MariaDB schema bootstrap](../../scripts/ci/provision-isolated-test-db.mjs)
