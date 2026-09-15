# Gate D — JSON-Shaped TEXT Default Compatibility Reconciliation

**Status:** Source metadata and derived execution artefacts corrected for review. D-03 remains stopped after owner-reported successful execution of ordinals 1–13. This record performs no database connection, DDL, DML, account/grant, network, backup/restore, deployment, or production action.

## Finding and boundary

The owner reported a controlled D-03 stop at original statement 14, `cost_learning_records`. The exact pinned statement hash was verified before submission; ordinals 1–13 succeeded and created 13 D-03 tables with zero rows. TiDB Cloud Starter rejected the `TEXT` defaults expressed as parenthesized string literals, such as `DEFAULT ('[]')` and `DEFAULT ('{}')`. No statement was skipped, retried blindly, or executed after the server error.

> The accepted partial state is **D-03 ordinals 1–13 only**. It must be preserved and must not be rerun. The revised resumption package begins at ordinal 14.

## Compatibility basis

TiDB documents that `BLOB`, `TEXT`, and `JSON` columns may have defaults only when the default is an expression, not a literal. `JSON_ARRAY()` and `JSON_OBJECT()` are among the listed supported default expressions.[1] A local, isolated Drizzle generation proof using the repository's pinned Drizzle versions confirmed that `.default("[]")` renders `DEFAULT ('[]')`, whereas `.default(sql\`(JSON_ARRAY())\`)` renders `DEFAULT (JSON_ARRAY())`; the corresponding object form renders `DEFAULT (JSON_OBJECT())`. The proof used no database connection.

The source reconciliation retains each field’s physical type, nullability, logical meaning, and resulting empty JSON value. It changes only the SQL representation from a parenthesized literal to a TiDB-supported JSON expression.

| Wave | Table | Column(s) | Former rendered form | Corrected source expression |
|---|---|---|---|---|
| D-03 / Wave 3 | `cost_learning_records` | `high_cost_drivers_json`, `component_detail_json`, `quality_flags_json` | `TEXT NOT NULL DEFAULT ('[]')` | `sql\`(JSON_ARRAY())\`` |
| D-03 / Wave 3 | `cost_learning_records` | `component_weighting_json` | `TEXT NOT NULL DEFAULT ('{}')` | `sql\`(JSON_OBJECT())\`` |
| D-04 / Wave 4 | `claim_comments` | `to_roles`, `to_user_ids`, `to_emails` | `TEXT NOT NULL DEFAULT ('[]')` | `sql\`(JSON_ARRAY())\`` |
| D-04 / Wave 4 | `workflow_templates` | `stages_json` | `TEXT NOT NULL DEFAULT ('[]')` | `sql\`(JSON_ARRAY())\`` |
| D-04 / Wave 4 | `workflow_templates` | `applies_to_json` | `TEXT DEFAULT ('{}')` | `sql\`(JSON_OBJECT())\`` |
| D-05 / Wave 5 | `calibration_overrides` | `fraud_adjustments_json` | `TEXT DEFAULT ('{}')` | `sql\`(JSON_OBJECT())\`` |

The scripted inventory found **10** affected schema declarations: four in Wave 3, five in Wave 4, and one in Wave 5. No parenthesized `DEFAULT ('[]')` or `DEFAULT ('{}')` form remains in the regenerated full source or the revised Wave 3–5 source selections.

## Immutable and revised artefacts

| Artefact | SHA-256 | Status |
|---|---|---|
| Immutable Gate C Wave 3 source | `ccdca4a47d9d82c04cc9b9a12e6d49960d4271a052773a342282086a9aff9254` | Preserved unchanged; its original statement 14 is retained as historical execution evidence. |
| Revised D-03 source | `0c45f9ea613381185fd8afecfd99da1bd1d5f3275467c7286e892ab32745e59a` | Derived from the corrected canonical schema; exactly 187 marker-split statements. |
| Original statement 14 | `706fb95e86213d9bd88f9c7375649d16ec2a56a2912af58cf3b30bd378b8ce8e` | Stopped, not retried. |
| Revised statement 14 | `082052db3bbe4acc4dd72f10f2d043a2ed7c60f82adca4ea2328db39a00ab3be` | First pending statement for any authorised resume. |
| Revised full D-03 ledger | `fae70dd948b828038687334cc256f488bb8f92a1b54e0773ec08570f7908c06b` | 187 rows; 50 tables, 26 foreign keys, 111 explicit indexes. |
| Resumption ledger | `1acddceae53770f4e1d42b7ad8752286b6ed20b413c5c459a02ab010999aa53d` | 174 rows, preserving original ordinals 14–187 only. |

The offline comparator passed: **only ordinal 14 changed**; ordinals **1–13** and **15–187** are byte-identical between the immutable and revised Wave 3 sources. The revised full ledger and all 187 generated statement files passed exact-text and SHA-256 verification. The resumption ledger emitted exactly 174 statement files, `014` through `187`, with each file matching its ledger row.

## Future-wave evidence

The correction is systemic rather than a D-03-only patch. The new full source snapshot and the source-selected future artefacts retain all reviewed membership and statement totals while replacing only the incompatible default representation.

| Future source | SHA-256 | Source-selection result |
|---|---|---|
| Wave 4 compatible selection | `8317ccc6d01c8c34b6fd2e1f466ca8781c9152910953c5f345fe13de65183f61` | 40 tables, 7 foreign keys, 88 explicit indexes, 135 statements; five corrected defaults. |
| Wave 5 compatible selection | `416de72140bb50ea254031c841e9ee1d027bc710d5fc9aba5b6c074e487764df` | 75 tables, 25 foreign keys, 190 explicit indexes, 290 statements; one corrected default. |

No D-04 or D-05 ledger, staging action, or execution authority is created by this reconciliation.

## D-03 resumption controls

Before Claude Code resumes, it must independently verify the revised D-03 source SHA-256, full ledger SHA-256, resumption-ledger SHA-256, and the hash of every proposed statement. It must execute **only ordinals 14–187**, in order, and must not submit marker literals or rerun ordinals 1–13. A hash discrepancy, parser/server error, unexpected object, or target/snapshot discrepancy requires an immediate stop without blind retry.

The revised source has not been executed in this task. A fresh current snapshot and target/read-only preflight must be rechecked at the actual resume time; the earlier same-day snapshot record must not be treated as current after its expiry.

## References

[1]: https://docs.pingcap.com/tidb/stable/data-type-default-values/ "TiDB Default Values documentation"
