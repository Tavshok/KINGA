# P0 Controlled Baseline Designation — CB-1 Through CB-3

**Decision ID:** `KINGA-STAGING-GATED-188-2026-09-15`
**Record status:** **CB-1, CB-2, and CB-3 complete.**
**Timestamp:** 2026-09-21T13:30:53Z for the final CB-2 read-only re-check
**Target:** KINGA-staging / `kinga_staging` only
**Baseline authority and future-change authority:** Project owner, under the recorded temporary sole-operator exception
**Explicitly not authorized:** CB-4, R0–R8, P0 implementation, migration authoring, DDL, DML, seed activity, application-data access, credential/grant change, staging deployment, or production action.

## Decision

The owner approved **Option C** from the P0 reconciliation proposal. The verified Gate D D-01–D-05 closure is now designated as the controlled baseline `KINGA-STAGING-GATED-188-2026-09-15` for planning and future review.

> This is an **evidence-backed, noncanonical staging schema baseline**. It is not a Drizzle baseline, does not prove or imply a historical Drizzle replay, and is not a root from which the discontinuous journal may be replayed.

The controlled baseline covers the verified **188-table** Gate D inventory and its retained schema evidence. The current source inventory remains 224 tables, with 36 source-only declarations. Those 36 objects are classified **deferred** for CB-1 through CB-3; their classification does not authorize their creation, use, or deployment.[1] [2]

## CB-1 — Evidence freeze and designation

CB-1 is complete. The owner approved the designation, the non-Drizzle classification, the 188-table scope, preservation of historical discontinuities, continued exclusion of the three deferred geometry tables, and the future append-only reconciliation/execution ledger in principle.

The controlled baseline manifest is frozen at SHA-256 `efc683b034190c6269724bc04d34e18d7b64d4a5638c32c830eb8fd3faf33182`. It contains 1,498 tracked evidence artifacts from the current review branch, including the canonical journal, Gate D packet and closure artifacts, the Gate 0 target preflight, and the approved reconciliation proposal. The manifest was generated from clean source commit `631962efb0e42b51580602ded2dde524c1e59797` before the designation record was added.[2]

| Frozen control                     | Value                                                                 |
| ---------------------------------- | --------------------------------------------------------------------- |
| Controlled baseline identifier     | `KINGA-STAGING-GATED-188-2026-09-15`                                  |
| Target                             | KINGA-staging / `kinga_staging`                                       |
| Gate D inventory                   | 188 tables                                                            |
| Current-source inventory at Gate 0 | 224 tables                                                            |
| Source-only declarations           | 36; owner classification: **deferred** for CB-1–CB-3                  |
| Target-side Drizzle ledger         | `__drizzle_migrations` absent                                         |
| Deferred geometry objects          | `vehicle_landmarks`, `geometry_sources`, `vision_calibration_results` |
| Manifest SHA-256                   | `efc683b034190c6269724bc04d34e18d7b64d4a5638c32c830eb8fd3faf33182`    |
| Gate D inventory export SHA-256    | `e73fabe79ba6d0f217baf440a06781be6d0b1c49afe1afa211680044b203a4a2`    |
| Canonical journal SHA-256          | `abc0a9fffbe8bb4973ba569ac3b4c93e30ca1ccf4d660ce058830fc40b1ce51e`    |

The historical journal and migrations remain unchanged. This designation expressly prohibits retrospective `0056`–`0059` journal insertion, historical SQL renumbering or alteration, snapshot relabeling as historical canonical state, and fabricated legacy `__drizzle_migrations` rows. The documented `0045` partial state, `0058` first-statement failure, skipped `0056`–`0059` entries, and post-`0055` snapshot discontinuity remain preserved exceptions, not repaired provenance.[3]

## CB-2 — Independent authenticated read-only conformance

CB-2 is complete and **passed** at 2026-09-21T13:30:53Z. The check used the existing least-privilege `kinga_verify` account. It issued only hard-coded `SELECT` and `SHOW` statements against server metadata and `information_schema`; it did not read application tables, execute DDL or DML, run a seed or migration, create a credential, alter a grant, or connect to production.

The target fingerprint confirmed TiDB Serverless `8.0.11-TiDB-v8.5.3-serverless`, database `kinga_staging`, TLS 1.3 with `TLS_AES_128_GCM_SHA256`, global `USAGE`, and `SELECT` only on `kinga_staging`. The target’s complete inventory has 188 tables and exactly matches the Gate D inventory. The inspected P0, inspection, and active-geometry anchor metadata exactly matches the prior Gate 0 preflight under the documented normal form. Required anchors remain present, the three deferred geometry tables remain absent, and `__drizzle_migrations` remains absent.[4]

| CB-2 control                                                 | Result                                                             |
| ------------------------------------------------------------ | ------------------------------------------------------------------ |
| Exact Gate D 188-table inventory match                       | **Pass**                                                           |
| Target anchor metadata matches Gate 0 preflight              | **Pass**                                                           |
| Required P0, inspection, and active-geometry anchors present | **Pass**                                                           |
| Deferred geometry objects absent                             | **Pass**                                                           |
| `__drizzle_migrations` absent                                | **Pass**                                                           |
| TLS confirmed                                                | **Pass**                                                           |
| Verifier grants restricted to read surface                   | **Pass**                                                           |
| Sanitized CB-2 evidence SHA-256                              | `14044d29c64accfd6e5c020fe688868fbe85edef13409bb7600da346dbeadcac` |
| Sanitized anchor-metadata evidence SHA-256                   | `acb44cd59e5f850b7f3886d4bf7dec9c3a8201b01846780b27ea0ad4a38e613c` |

The first comparison attempt stopped fail-closed because its local comparator treated quoted CSV cells and a constraint ordinal field differently from the earlier preflight output. The target was not written. After the comparison normalizations were aligned, the complete inventory and all inspected metadata matched exactly. This was a **local verifier-normalization correction**, not target drift and not a relaxation of the acceptance condition.

## CB-3 — Discontinuity and authority-boundary acceptance

CB-3 is complete. The owner accepted the following boundaries:

1. The current journal and snapshot discontinuity remains unresolved and preserved. It is not a reason to alter history or to manufacture a historical tool ledger.
2. The current 224-table source inventory does not replace the designated 188-table Gate D baseline. The 36 source-only declarations are deferred, not silently promoted into scope.
3. `vehicle_landmarks`, `geometry_sources`, and `vision_calibration_results` remain intentionally deferred exactly as Gate C decided. No seed or persistence decision changed.
4. The `measurement_types` consumer discrepancy is a follow-up item alongside VGE work. It is not a CB-1–CB-3 blocker and does not alter the current controlled baseline.
5. The append-only reconciliation/execution ledger is approved only **in principle**. It may begin only after a separately authorized CB-4 and actual approved forward execution. It must not retrospectively represent Gate D or the skipped historical entries as Drizzle execution.
6. Schema provenance remains separate from application-data and seed authority. Neither is granted by this designation.

The current temporary sole-operator exception is limited to this owner-approved baseline designation and the named baseline/future-change authority roles. It does not convert CB-4 or any rehearsal or implementation gate into standing authorization, and it does not substitute for an independent verifier. CB-2’s dedicated read-only evidence remains separate from decision authority.

## Deferred source-only declarations

The following 36 current-source tables are **deferred** for CB-1 through CB-3. This is a scope classification, not a decision to create, seed, query, or deploy them.

`assessor_marketplace_reviews`, `audit_logs`, `benchmark_deviations`, `claim_evidence_findings`, `claimant_history`, `document_versions`, `email_verification_tokens`, `entity_relationships`, `geometry_sources`, `marketplace_transactions`, `model_training_audit_log`, `model_version_registry`, `organizations`, `part_stratification`, `parts_pricing_audit_log`, `parts_pricing_overrides`, `photo_reextraction_jobs`, `quality_metrics`, `quote_evidence_gaps`, `quote_evidence_ledger`, `reference_dataset`, `regional_benchmarks`, `regional_pricing_multipliers`, `registration_requests`, `report_provenance_snapshots`, `scheduled_job_effects`, `scheduled_job_executions`, `service_credential_audit`, `service_credentials`, `training_records`, `user_invitations`, `vehicle_history`, `vehicle_landmarks`, `vision_calibration_results`, `workflow_states`, and `workos_auth_transactions`.

## Resulting state and hard stop

CB-1 through CB-3 are complete. The controlled baseline may now be referenced as the evidence-backed parent-state assertion for a **future, separately approved** P0 Baseline-Adoption Checkpoint.

**CB-4 and R0–R8 remain blocked.** No P0 implementation, migration packet, schema change, seed, test-target provisioning, rehearsal, credential work, staging write, configuration change, deployment, or production action may start from this record.

## References

[1]: [P0 Gate 0 staging target preflight](p0-gate-0-staging-target-preflight-2026-09-21.md) "KINGA P0 Gate 0 — KINGA-staging Target Preflight"

[2]: `file:///home/ubuntu/kinga-p0-gate0-staging-preflight/audit/controlled-baselines/kinga-staging-gated-188-2026-09-15/controlled-baseline-manifest-2026-09-21.json` "Controlled baseline evidence manifest, 2026-09-21"

[3]: [P0 baseline reconciliation and rehearsal proposal](p0-baseline-reconciliation-rehearsal-proposal-2026-09-21.md) "P0 Baseline Reconciliation and Rehearsal Plan — Proposal"

[4]: `file:///home/ubuntu/kinga-p0-gate0-staging-preflight/audit/controlled-baselines/kinga-staging-gated-188-2026-09-15/cb-2-staging-conformance-2026-09-21.json` "CB-2 sanitized read-only conformance evidence, 2026-09-21"
