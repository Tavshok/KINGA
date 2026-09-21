# P0 Baseline-Adoption Checkpoint and R0 Evidence Freeze

**Baseline identifier:** `KINGA-STAGING-GATED-188-2026-09-15`
**Checkpoint status:** **CB-4 complete; R0 complete.**
**Relative source commit:** `519615d892c92b7939af55b2901ece95bcb7629c`
**Authorized scope:** Planning and lineage artifacts only.
**Hard stop:** **R1 is not authorized.** No isolated target, infrastructure provision, target write, migration authoring, DDL, DML, seed, data access, credential/grant change, configuration, deployment, recovery action, or production action occurred or is authorized.

## Conclusion

CB-4 now binds the approved KINGA-staging controlled baseline to a frozen post-merge source commit and a repeatable reference fingerprint. R0 then revalidated every retained evidence artifact without changing any target or infrastructure resource. The resulting record provides a controlled parent-state assertion for any future, separately approved rehearsal design; it does not create a Drizzle migration lineage or authorize a future packet.

> **The checkpoint is evidence-backed and noncanonical.** It identifies the verified Gate D schema state but does not claim that historical Gate D work, `0045`, `0056`–`0059`, or any earlier source change was applied through a replayable Drizzle ledger.

## CB-4 — Baseline-Adoption Checkpoint

The checkpoint binds the following approved reference state:

| Control                      | Frozen value                                                                           |
| ---------------------------- | -------------------------------------------------------------------------------------- |
| Controlled baseline          | `KINGA-STAGING-GATED-188-2026-09-15`                                                   |
| Target                       | KINGA-staging / `kinga_staging`                                                        |
| TiDB context                 | TiDB Serverless `8.0.11-TiDB-v8.5.3-serverless`                                        |
| Read-only transport evidence | TLS 1.3 using `TLS_AES_128_GCM_SHA256`                                                 |
| Baseline manifest SHA-256    | `efc683b034190c6269724bc04d34e18d7b64d4a5638c32c830eb8fd3faf33182`                     |
| Source commit frozen by CB-4 | `519615d892c92b7939af55b2901ece95bcb7629c`                                             |
| Gate D / target inventory    | 188 tables; SHA-256 `36b26b9ee7dcbc0f1883f31db0a06840f5fd247cf8958f8e23f3d608c4bb52b5` |
| Current-source inventory     | 224 tables; 36 source-only declarations                                                |
| Inspected anchor metadata    | SHA-256 `e9f120a0c10fd1e8a6b2adc1d9467613c3889babd982c0ca32afc9333c3736e9`             |
| Target-side Drizzle ledger   | Absent; no historical tool execution is implied                                        |

The [CB-4 checkpoint](../../audit/p0-baseline-adoption/kinga-staging-gated-188-2026-09-21/cb-4-baseline-adoption-checkpoint-2026-09-21.json) binds these facts to the baseline manifest and states the successor-lineage boundary. A future forward-only packet may reference this parent-state assertion only after its own separate authorization and proof gates. It may not use the checkpoint to fabricate legacy `__drizzle_migrations` history.[1] [2]

## Reconciliation register

The [reconciliation register](../../audit/p0-baseline-adoption/kinga-staging-gated-188-2026-09-21/reconciliation-register-2026-09-21.json) classifies every relevant object as follows:

| Classification             | Count | Meaning                                                                                                                     |
| -------------------------- | ----: | --------------------------------------------------------------------------------------------------------------------------- |
| **Present-compatible**     |   188 | Gate D baseline tables. The 12 P0, inspection, and active-geometry anchors also retain direct CB-2 metadata confirmation.   |
| **Divergent**              |     0 | No divergence is recorded by this checkpoint. It is not a substitute for the later R3 independent clean-baseline preflight. |
| **Absent**                 |     0 | No in-scope, non-deferred baseline object is absent.                                                                        |
| **Intentionally deferred** |    40 | 36 current source-only tables, plus four preserved historical provenance exceptions.                                        |

The 36 source-only tables remain deferred by owner decision. The controlled baseline therefore does not silently expand from 188 tables to the current 224-table source inventory. The three Gate C geometry exclusions—`vehicle_landmarks`, `geometry_sources`, and `vision_calibration_results`—remain deferred. The `measurement_types` consumer-path question remains a VGE follow-up and does not alter this checkpoint.[1]

The four historical exclusions are preserved without repair: the `0045` partial-failure residue, the `0056`–`0059` journal discontinuity, the `0058` first-statement column-name failure, and the post-`0055` snapshot discontinuity. They are not translated into absent or divergent schema objects, and the register does not authorize historical rewriting.[2]

Neither the checkpoint nor the register establishes authority over application data, reference data, or seeds. No record content, data reliance, seed action, retention decision, or writer behavior is asserted.[2]

## R0 — Evidence freeze

R0 reverified the full controlled-baseline manifest against merged source evidence. All **1,498 of 1,498** tracked manifest artifacts matched their retained paths, byte counts, and SHA-256 hashes. The [R0 evidence-freeze record](../../audit/p0-baseline-adoption/kinga-staging-gated-188-2026-09-21/r0-evidence-freeze-2026-09-21.json) also pins the CB-4 checkpoint, the retained CB-2 conformance result, the table-inventory fingerprint, and the inspected-anchor fingerprint.

This is a read-only file-integrity proof. It did not reconnect to KINGA-staging, alter any database state, provision an environment, issue a credential, or construct a migration packet. Its role is to preserve the exact evidence set that R1 and later gates must use if they are ever authorized.[3]

## Explicit stop before R1

R1 is the first gate that could design a disposable environment and other infrastructure controls. It remains **blocked pending a new explicit owner authorization**. The next authorization must decide only the R1 isolated-environment and security-design scope; it should not authorize R2, a packet, a runner, test data, a target write, or an execution rehearsal by implication.

## References

[1]: [CB-1 through CB-3 controlled baseline designation](p0-controlled-baseline-designation-cb1-cb3-2026-09-21.md) "P0 Controlled Baseline Designation — CB-1 Through CB-3"

[2]: [P0 baseline reconciliation and rehearsal proposal](p0-baseline-reconciliation-rehearsal-proposal-2026-09-21.md) "P0 Baseline Reconciliation and Rehearsal Plan — Proposal"

[3]: `file:///home/ubuntu/kinga-p0-cb4-r0-checkpoint/audit/controlled-baselines/kinga-staging-gated-188-2026-09-15/controlled-baseline-manifest-2026-09-21.json` "Controlled baseline evidence manifest, 2026-09-21"
