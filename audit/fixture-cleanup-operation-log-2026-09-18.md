# Fixture Cleanup Operation Log

**Date:** 18 September 2026  
**Scope:** Owner-authorized removal of newly introduced CI/test fixture contamination from the live KINGA application database, after the CI database isolation safeguard merged.

## Public write freeze

At approximately 16:20 UTC, the latest checked-point KINGA release was published with `KINGA_MAINTENANCE_MODE=true`. The release includes the fail-closed maintenance middleware and suppresses the intake-escalation, stuck-recovery, and recovery-deadline writer jobs. This publication is a prerequisite to the bounded live-fixture cleanup. Public endpoint verification follows before any archive or delete operation.

**No live database archive or delete operation has occurred at this point.**

## Frozen cleanup preflight

At 16:22 UTC, after the public maintenance gate returned HTTP 503 `MAINTENANCE_IN_PROGRESS` for both `/readyz` and `/`, the live database was read using an aggregate and relationship-only preflight.

| Control | Result | Expected / decision |
|---|---:|---|
| Pre-existing owner account | 1 user | Preserved; no target match |
| Pre-existing protected claim set | 101 claims | Preserved; no target match |
| New test-run users | 176 users | All are in the frozen target set |
| New test-run claims | 138 claims | All are in the frozen target set |
| User timing | 100% created on 18 September in tightly grouped test-run seconds | Confirms non-organic fixture origin |
| Claim timing | 100% created in four tightly grouped test-run windows | Confirms non-organic fixture origin |
| Dataset-capture users | 4 | Included in the 176 target users |
| Dataset-capture claims | 4 | Included in the 138 target claims |
| Direct target-claim links to pre-existing owner | 49 | These are target claim rows created by tests under the owner session; they do not make the owner a deletion target |
| Target-claim links to newly created users | 88 | These are within the target closure |
| Target claims without a user match | 1 | A fixture record; included by its frozen claim timestamp |

### Clarification: 138 claims, not 137

The requested estimate was 137 test-marked claims plus dataset fixtures. The exact frozen preflight instead finds **138 total target claims**, all created after the prior reset and within the observed test-suite execution windows. The difference is one source-test claim whose identifier does not fall under the narrow `TEST-` / `CLM-` / `WB-` prefix shorthand. It is created in the same 12:42–12:45 UTC test-run window and has a test tenant. The frozen criterion therefore does **not** rely on a name prefix: it is `claims.created_at >= '2026-09-18 00:00:00'`, yielding 138 claims. This is the safer, complete target definition.

The matching user criterion is `users.createdAt >= '2026-09-18 00:00:00'`, yielding 176 users. It includes 172 `test-` identities and four dataset-capture identities. The target set is strictly after the completed 17 September reset, and excludes the preserved account and all 101 preserved claims by timestamp.

### Identified target relationships

The relationship-only preflight located fixture-created rows in direct and named claim-reference relations including assessments, claim features, claim events, involvement tracking, panel-beater quotations, physical validation records, pipeline jobs/runs, market valuations, workflow audit trail, and the timeline view. The target-manifest executor will materialize primary keys under this frozen criterion, then recursively include foreign-key children and direct numeric claim/user reference rows. It will stop before a delete if a target row links to a preserved claim or if the executable deletion graph contains an unresolved dependency cycle.

**No archive or delete statement has yet been executed.**

## Complete-closure rehearsal stop

The encrypted archive was restored into a separate local MariaDB instance and the manifest-driven deletion was rehearsed there before any live deletion. The rehearsal completed the target-set construction but stopped **before a DELETE statement** when the strengthened closure check found nine newly created records that point to the 101 protected claims.

| Relation | New rows after the frozen cutoff | Parent claims | Effect on the protected claims |
|---|---:|---|---|
| `admin_pipeline_regenerations` | 2 | Protected | The rows are regeneration-history records. The deletion engine does not delete a parent claim through this relation. |
| `report_provenance_snapshots` | 7 | Protected | The rows are immutable report-input provenance records. The deletion engine does not delete a parent claim through this relation. |
| **Total** | **9** | **Protected** | A scope decision is required before deletion can continue. |

This is not an orphan or referential-integrity failure. It is a deliberate stop condition because the approved reset scope requires the 101 claims and their dependency closure to remain intact. Deleting these nine rows would not delete or alter their parent claims, but it would remove recently created history or provenance attached to protected claims. Conversely, retaining them means the live database would not be completely clear of all rows written by the full test run.

The two regeneration-history records both describe the same non-production lifecycle category, `analysis_complete → pending`. The seven provenance records are grouped across the three report types: three Claims Intelligence, two standard assessment, and two Forensic. No protected claim has an `updated_at` value after the frozen 18 September cutoff. This confirms that these are **new related records**, not evidence that the protected claims themselves were altered during the run. It does not determine whether the records should be preserved as useful real-test history or removed as test-run residue; that remains the required scope decision.

The prior two-stage closure check did not surface these rows because they reference pre-existing claims rather than the 138 claims selected by the frozen creation-time criterion. The strengthened all-table timestamp closure correctly identified them. The live database has not been changed after the public maintenance freeze: no archive restore, deletion, update, or schema change has been issued against it.

**Next control:** obtain an explicit choice to either preserve the nine protected-claim records as part of the protected dependency closure, or extend the reset scope to delete the nine test-run history/provenance records while retaining all 101 parent claims. The complete closure rehearsal will then be repeated before the live transaction.

## References

[1]: https://github.com/Tavshok/KINGA/blob/main/server/routers/reporting.ts "KINGA reporting router"
[2]: https://github.com/Tavshok/KINGA/blob/main/server/reporting/reportQueue.ts "KINGA report job queue"
