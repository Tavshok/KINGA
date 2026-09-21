# P0 Baseline Reconciliation and Rehearsal Plan — Proposal

**Decision ID:** `KINGA-P0-BASELINE-RECONCILIATION-REHEARSAL-PROPOSAL-2026-09-21`
**Status:** **Proposal only — owner review required.**
**Prepared by:** Manus AI
**Scope:** Controlled Gate D baseline designation, preservation-first migration provenance treatment, schema-versus-data authority separation, and future rehearsal proof requirements.

## Decision requested

This proposal recommends designating the verified **Gate D D-01–D-05 closure** as a **controlled, noncanonical staging baseline** for `KINGA-staging` / `kinga_staging`. The designation would recognize a verified inherited schema state without claiming that it was produced by a clean Drizzle replay.

> **This proposal authorizes nothing.** It does not authorize migration authoring, DDL, DML, a seed, application-data access, a ledger write, implementation, a deployment, credential work, recovery activity, or production activity. Every operational mechanism below is a future approval gate.

The alternative—retrospectively repairing the historical Drizzle record—would make the repository appear more coherent without proving which historical statements ran, committed, or produced the observed target. The proposal therefore preserves that history unchanged and establishes a new, reviewable parent-state assertion only for a later forward-only lineage.

## Current decision context

The authorized read-only preflight established that KINGA-staging has the same **188-table** inventory as the completed Gate D closure. It found the twelve inspected P0, inspection, and active-geometry anchors present and compatible at the inspected metadata level. It also found no target-side `__drizzle_migrations` ledger. Current source declares 224 tables, so the verified target is a bounded historic Gate D state rather than the whole current-source schema.[1] [2] [3]

The canonical Drizzle history remains unsafe to replay. The journal jumps from `0055` to `0060`, while `0056` and `0057` exist as SQL but are not journal-wired. The last canonical snapshot is `0055`. The prior audit also records a partial `0045` failure and a failed first statement in `0058`. These are historical facts to retain, not metadata gaps to rewrite.[3] [4]

| Option                                        | Treatment                                                                                                                                                        | Result                                                                                                                                           | Recommendation                                                     |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| **A. Retroactive Drizzle repair**             | Backfill journal entries, relabel a new snapshot as historical, or fabricate legacy `__drizzle_migrations` rows.                                                 | Changes provenance without demonstrating historical execution or physical target state. It could cause later automation to skip unverified work. | **Reject.**                                                        |
| **B. No controlled baseline**                 | Preserve history but make no controlled assertion about the observed Gate D state.                                                                               | Avoids an overclaim but leaves no auditable parent-state assertion for future planning. P0 stays blocked.                                        | Use only if the owners cannot approve the bounded evidence record. |
| **C. Controlled Gate D baseline designation** | Designate the observed 188-table Gate D state as a controlled, non-Drizzle staging baseline. Preserve all historical artifacts and record the source/target gap. | Gives a truthful, auditable parent-state assertion while leaving implementation and all data decisions gated.                                    | **Recommend.**                                                     |

## 1. Controlled Gate D baseline designation

### Proposed designation

The designation record should name the following state, and only that state:

> **Identifier:** `KINGA-STAGING-GATED-188-2026-09-15`
> **Target:** `KINGA-staging` / `kinga_staging`
> **Inherited state:** Gate D D-01–D-05 verified closure, dated 2026-09-15
> **Scope:** The verified 188-table Gate D inventory, its recorded key, foreign-key, and source-explicit-index controls, and the closure’s zero-row state as historical schema evidence.
> **Classification:** Controlled, evidence-backed, **noncanonical** staging schema baseline. It is neither a Drizzle baseline nor a historical replay root.

This designation must explicitly retain the source/target discontinuity: the current source’s 224-table inventory, the 36 source-only declarations, the absent target-side Drizzle ledger, and the three intentionally deferred geometry objects. It does not decide those objects’ ownership, require their deployment, or repair them.[1]

### Evidence manifest and preservation record

Approval should require two artifacts. A **Controlled Baseline Designation Record** captures the owner’s bounded decision. An immutable **Controlled Baseline Manifest** fixes the exact evidence bytes against which future read-only conformance may be checked.

| Manifest item                         | Required SHA-256                                                   | Role in the baseline claim                                                                                                  |
| ------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Gate 0 KINGA-staging target preflight | `8d4299c5b50c9b3d3286ed2d4eb079296c0209e643f29c289c2caf3a37df717a` | As-of attestation of target identity, Gate D inventory match, inspected P0 shapes, ledger absence, and scope discontinuity. |
| D-05 independent postflight           | `5cf571ff99decc37cbad637d87ba3ba77130993dccc713ef96dd8ef194178301` | Primary independent structural verification record for the final Gate D wave.                                               |
| Gate D final closure                  | `4444a5602ba063cf17aa7068c978d818434aceee9fdc2f7763030a7d841505d9` | Primary Gate D scope and decision record.                                                                                   |
| D-05 TiDB-compatible source           | `416de72140bb50ea254031c841e9ee1d027bc710d5fc9aba5b6c074e487764df` | Supplemental final-wave source provenance only.                                                                             |
| D-05 canonical statement ledger       | `67cf9e0ad6c0d1bc100678dd5d659226e6729430917363386217c153778a604d` | Supplemental final-wave per-statement verification provenance only.                                                         |
| Gate D closure inventory export       | `e73fabe79ba6d0f217baf440a06781be6d0b1c49afe1afa211680044b203a4a2` | Exact 188-table inventory against which the later target preflight was matched.                                             |
| Current canonical Drizzle journal     | `abc0a9fffbe8bb4973ba569ac3b4c93e30ca1ccf4d660ce058830fc40b1ce51e` | Preserved historical record; not proof of a replayable baseline.                                                            |

The closure is the primary scope-and-decision artifact. The postflight is the primary verification artifact. The later read-only preflight is an as-of confirmation that the named target still matched the Gate D inventory. The final-wave source and ledger hashes are material but cannot alone establish an all-wave baseline. The postflight’s recorded aggregate-file-hash discrepancy must remain visible: the controlling evidence is the pinned documents and documented per-statement verification, not an unsupported replacement aggregate.[2] [3]

Before designation, an independent authenticated read-only verifier must reproduce the manifest’s target identity and relevant inventory and inspected-shape evidence. This is a conformance check, not a target change. The owner must then expressly accept that P0 remains blocked until later gates are approved.

## 2. Preservation-first treatment of the journal discontinuity

Historical migration evidence should be **preserved, not repaired**. This proposal prohibits adding retrospective `0056`–`0059` journal entries, renumbering the journal, editing numbered historical SQL, relabeling a later snapshot as historical canonical state, or inserting a compensating legacy row into `__drizzle_migrations`.

A row in `__drizzle_migrations` would be especially misleading. The target does not have that ledger, and inserting one would only assert that a migration had been applied. It would not prove historical SQL execution, transactional outcome, target shape, the partial `0045` result, or the failed `0058` path. It could also make later tooling skip content on the basis of false provenance.

The future designation gate should freeze immutable copies and hashes of the current journal, all numbered SQL files, all snapshots, the Gate D packet evidence, and the drift audit. It should also maintain an **exception register** that records without changing: the `0045` partial state, the `0058` column-name failure, skipped `0056`–`0059` entries, the post-`0055` snapshot discontinuity, and the current source-only object list.[3] [4]

After a separate future authorization, a new forward-only lineage may begin from the controlled-baseline identifier and manifest hash. That lineage must be recorded in a **distinct append-only reconciliation/execution ledger**, not by retrofitting historical Drizzle execution. Only actual, reviewed future execution may create entries in any future tool-managed ledger.

### What the checkpoint does not do

The proposed baseline checkpoint is an **external reconciliation record**, not a Drizzle migration and not a row in `__drizzle_migrations`. It records the controlled-baseline identifier, target fingerprint, manifest hash, frozen historical-artifact hashes, approved object classifications, accountable approvers, and the explicit statement that historical Gate D work was not executed through Drizzle. It therefore establishes a reviewable parent-state assertion without fabricating migration provenance.

If a later P0 packet is approved for real execution, its own execution record may reference this external parent-state assertion. A tool ledger may record that later packet **only after the reviewed packet actually executes**. The tool record and the external reconciliation ledger must both retain the baseline identifier and manifest hash. Neither record may retrospectively claim that Gate D, `0056`–`0059`, or any earlier historical packet was applied by the tool.

## 3. Schema authority is separate from seed and data authority

The Gate D designation establishes only **schema provenance**. It does not authorize application-data access, data reliance, a seed, data creation, or a reference-data release. These decisions require three separately owned records.

| Authority record                                                                                            | Accountable owner                                                                       | Required evidence                                                                                                                                                               | Does **not** authorize                                                                         |
| ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **Gate D Schema Provenance Attestation**                                                                    | Schema/release owner                                                                    | Exact Gate D closure, target metadata, signed 188-table comparison, inspected-shape scope, ledger-absence statement, current-source delta, and explicit schema-only limitation. | Application records, a seed, DDL, DML, or a deployment ledger.                                 |
| **Application-Data Authority Decision**                                                                     | Product/data owner and data-governance authority                                        | Permitted purpose, data classification and inventory, lineage, consumers, privacy, retention, and accountable approval before any future application-record use.                | A schema baseline, source declaration, CI snapshot, or Gate D packet cannot substitute for it. |
| **Geometry Reference-Data / Seed Authority Decision** followed by a future **Seed Release Evidence Record** | Product/data owner and governance authority, with independent review of future evidence | Authoritative source and usage basis, named steward, versioned manifest and hash, units, acceptance criteria, isolated proof, and retention treatment.                          | Seed execution, target write, or an assumption that a declared table must be populated.        |

The three missing geometry tables remain deliberately excluded. `vehicle_landmarks` is seed-only in the reviewed source path; `geometry_sources` and `vision_calibration_results` lack an active runtime reader or writer. Their name, declaration, or presence in the disposable CI snapshot cannot create a persistence or seed mandate.[1] [5]

A further version-pinned source trace is required before a later reference-data decision. Gate C identified `measurement_types` as a live reliability lookup, while the VGE investigation reported that the active VGE path does not read it. The responsible technical and product/data owners must reconcile that discrepancy and sign the definitive consumer scope for `vehicle_models`, `vehicle_geometry_measurements`, and, if applicable, `measurement_types`.[5] [6]

## 4. Future baseline-adoption checkpoint

Only after a fresh independent conformance check may the owners consider a **P0 Baseline-Adoption Checkpoint**. The checkpoint is a planning and lineage artifact. It is not permission to write to a target.

The checkpoint should bind the approved target identity and TiDB compatibility context; frozen source commit; hashes of the untouched historical files and Gate D evidence; approved schema fingerprint and table inventory; a reconciliation register for present-compatible, divergent, absent, and intentionally deferred objects; explicit exclusions for `0045`, `0056`–`0059`, and the 36 source-only tables; and the statement that data and seed state are outside the schema claim.

Any later packet must state that its first eligible change is relative to the verified Gate D state, not to a claimed historical Drizzle replay. It must identify the baseline identifier and manifest hash, record a packet hash and predecessor identifier, bind one named environment, name approvers and executor, and retain independent preflight and postflight fingerprints. It must not retrospectively reclassify historical Gate D direct execution as a Drizzle migration.

## 5. Future rehearsal proof requirements

The following are **future proof gates only**. They do not approve a rehearsal today. A later rehearsal must use two independent clean instantiations of a **Gate-D-equivalent baseline materialization**, validated by the approved fingerprint. It must not be called a clean replay of the discontinuous canonical Drizzle journal.

This proposal does not choose how that materialization is made. A later reviewed packet must choose and prove an isolated, reproducible mechanism—such as a new target produced from an approved retained baseline artifact or a constrained bootstrap from approved Gate D packets. It must not use an unreviewed direct runner, staging, production, or reused staging/production credentials.

| Phase                                                     | Required proof                                                                                                                                                                                                   | Acceptance criterion                                                                                                                                                                                                         | Hard stop                                                                                                                                                     |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R0 — Evidence freeze**                                  | Signed designation record, immutable manifest, frozen historical artifact set, scope and exception register.                                                                                                     | Exact target and Gate D scope are approved as controlled noncanonical evidence.                                                                                                                                              | Missing accountable owner or pin; unclassified scope; any assertion of historical Drizzle replay.                                                             |
| **R1 — Isolated environment design**                      | Disposable or sanitized target plan; identity, TLS, grant, credential-custody, no-route, retention, recovery, and writer-disable design.                                                                         | Verifier, runner, recovery, and application roles are separate. Negative privilege tests deny DML, `DROP`, cross-database, grant, and production authority to the runner.                                                    | Staging/production routing, credential reuse, broad privilege, missing identity/TLS proof, or no writer-disable/recovery design.                              |
| **R2 — Packet and evidence design**                       | One forward-only packet ID; exact byte hash; ordered statement ledger; aggregate algorithm; expected pre/post fingerprints; TiDB normalization allowlist; stated repeat semantics; evidence location.            | Bytes and expected results are fixed before execution; no implicit data/seed behavior exists.                                                                                                                                | Generated-at-run SQL, direct runner, incomplete expected results, or a normalization rule that hides a mismatch.                                              |
| **R3 — Clean-baseline preflight**                         | Independent inventory/fingerprint comparison, target/TLS/account proof, and confirmation of no unexpected object, application route, or unapproved data.                                                         | Exact Gate-D-equivalent fingerprint, or a separately approved reconciled equivalent, is demonstrated and retained.                                                                                                           | Baseline mismatch, unclassified drift, unapproved data, missing evidence export, or target/grant anomaly.                                                     |
| **R4 — First clean schema-only run**                      | Exact packet on one clean isolated target; per-statement outcomes; pre/post comparisons of tables, ordered columns/types/nullability/defaults, keys, FKs, and ordered indexes.                                   | Postflight equals the approved expected fingerprint with no unexpected object or warning.                                                                                                                                    | Statement error, timeout, lock or connection anomaly, non-allowlisted warning, mismatch, or implicit data/seed action.                                        |
| **R5 — Independent clean replay**                         | Second clean target from the same designated baseline; same packet bytes and ordinal order; second complete comparison.                                                                                          | The two clean runs yield identical approved postflight fingerprints and a retained comparison report.                                                                                                                        | Any non-identical outcome, duplicate definition, changed object shape, or unexplained engine rendering difference.                                            |
| **R6 — Repeat-invocation behavior**                       | Controlled second invocation assessment with fingerprint and metadata/data checks.                                                                                                                               | The predeclared result occurs: either a no-op with identical fingerprint and no duplicate metadata/data, or a fail-closed one-time refusal before mutation.                                                                  | `IF NOT EXISTS` success without full comparison; duplicates; changed fingerprint; undocumented behavior.                                                      |
| **R7 — Separately authorized fixture and behavior proof** | After data authority only: minimized sanitized fixtures with provenance, privacy approval, fixed identifiers, hashes/counts, retention; tenant, FK, key/index, compatibility-read, and immutable-revision tests. | Permitted same-tenant behavior, denied cross-tenant behavior, valid/invalid FK handling, required uniqueness, ordered index/constraint behavior, and an auditable successor that retains original evidence identity/content. | Unapproved application-data access, data leakage, cross-tenant access, failed integrity assertion, implicit seed, or overwriting/deleting immutable evidence. |
| **R8 — Writer-disable, recovery, and closure**            | Evidence-preserving stop exercise; named incident owner; audited writer-disable proof; isolated investigation/restore route; retained logs and fingerprints.                                                     | Writers can be disabled without deleting immutable evidence, and the separately approved recovery/investigation route is available.                                                                                          | Destructive rollback, inability to disable writers, unavailable recovery proof, missing evidence retention, or an unaccepted discrepancy.                     |

A successful command is not enough. Acceptance depends on retained comparisons of target and engine identity, manifest and packet hashes, inventory, ordered definitions, keys, FKs, index names, and ordered index columns. TiDB rendering may be normalized only through a pre-approved equivalence rule. A genuine mismatch must remain a failure.[2] [7]

The schema-only proof must not invoke a seed path. Any later fixture proof requires the distinct data/seed approvals above. A correction to immutable evidence must create an auditable successor or revision and preserve the original evidence identity and content fingerprint; it must never overwrite or delete prior evidence.[7]

## 6. Failure handling and stop conditions

P0 remains blocked if the target cannot be independently verified against the manifest; if an object is outside the 188-table scope without signed classification; if data, seed, or fixture authority is absent; if the proposed environment routes to staging or production; if credentials are reused; if the runner has prohibited privileges; or if the packet is unpinned, generated at run time, or lacks stated repeat semantics.

Any error, timeout, lock, connection anomaly, non-allowlisted warning, unexpected object, fingerprint mismatch, duplicate metadata/data, failed integrity test, or unclassified engine difference is a hard stop. The response is **writer disable and evidence preservation**, not destructive rollback. The named incident authority must stop the packet, disable the isolated environment’s application-writer path, and preserve packet bytes, hashes, logs, fingerprints, manifests, fixtures, and immutable evidence records. This proposal permits no `DROP`, `DELETE`, `TRUNCATE`, evidence rewrite, baseline overwrite, or improvised rollback SQL. Re-enabling writers requires a separately approved incident disposition and repeatable clean proof.[7]

## 7. Required future approvals

1. **CB-1 — Evidence freeze and designation decision.** The baseline authority owner approves the designation record, manifest, target identity, 188-table scope, non-Drizzle classification, and historical preservation boundary.
2. **CB-2 — Independent conformance acceptance.** The independent read-only verifier attests that the current target conforms to the manifest and that no target ledger is being represented as historical authority.
3. **CB-3 — Discontinuity and boundary acceptance.** The owner accepts the unresolved journal/snapshot discontinuity, the source/target difference, deferred-object status, and the separation of schema from data and seed authority.
4. **CB-4 — Baseline-adoption checkpoint authorization.** Only after CB-1 through CB-3 may the future-change authority and independent reviewer consider the checkpoint and append-only ledger design. This does not authorize a target write, migration authoring, implementation, or rehearsal execution.
5. **R0–R8 — Rehearsal proof gates.** Each phase above needs its named approval before it may be considered. Rehearsal closure provides evidence for a later P0 change decision; it never automatically authorizes P0 implementation.

## Open owner decisions

The owner needs to decide whether to designate `KINGA-STAGING-GATED-188-2026-09-15`, who will hold the named accountability roles, and whether the fresh read-only comparison remains conformant immediately before any checkpoint decision. The owner must also decide how each of the 36 source-only declarations will be classified, confirm the deferred geometry-table treatment, resolve the `measurement_types` consumer discrepancy, and decide whether the future append-only reconciliation/execution ledger is acceptable in principle.

Until those decisions are made, P0 stays blocked. This proposal does not change the **10–14 calendar-week** planning range.

## References

[1]: [P0 Gate 0 staging target preflight](p0-gate-0-staging-target-preflight-2026-09-21.md) "KINGA P0 Gate 0 — KINGA-staging Target Preflight"

[2]: [Gate D D-05 independent postflight](../../audit/gate-d-d05-independent-postflight-2026-09-15.md) "Gate D — D-05 Independent Postflight Reconciliation"

[3]: [Gate D final closure](../../audit/gate-d-final-staging-schema-reconciliation-closure-2026-09-15.md) "Gate D Final Staging Schema Reconciliation Closure"

[4]: [Schema migration drift audit](../../docs/SCHEMA_MIGRATION_DRIFT_AUDIT.md) "KINGA Schema Migration Drift Audit"

[5]: [Gate C runtime candidate dispositions](../staging-schema-reconciliation/gate-c-runtime-candidate-dispositions.json) "Gate C Runtime Candidate Dispositions"

[6]: `file:///home/ubuntu/kinga-engine-research/vge-known-dimension-scaling-investigation-2026-09-21.md` "VGE Known-Dimension Scaling Investigation, 2026-09-21"

[7]: [Gate D execution readiness plan](../staging-schema-reconciliation/gate-d-execution-readiness-plan.md) "Gate D Execution Readiness Plan"
