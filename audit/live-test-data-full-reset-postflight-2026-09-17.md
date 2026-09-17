# Live Test-Data Full Reset: Final Execution and Postflight Report

**Date:** 17 September 2026  
**Execution authority:** Owner authorization recorded in this task  
**Status:** **Live data reset completed; integrity verification passed; public maintenance release pending publication**

## Scope and control record

The approved live reset was executed only after the public service was confirmed in maintenance mode, the full encrypted archive had been restored successfully to a separate disposable target, and the final live frozen-set preflight reproduced the approved boundaries exactly. No broad `DELETE FROM` statement was used. Every deleted row was first materialized into a session-local primary-key manifest and then removed through a keyed join inside a transaction. The execution stopped on every preflight deviation until the manifest could be made both TiDB-compatible and safe.

The frozen preflight reproduced the approved set exactly: **17,965 reset-candidate claims**, **44,884 reset-candidate users**, **101 protected claims**, and **one protected owner account**. The protected claims consist of 97 document-ingestion-format claims plus the four separately owner-confirmed revision records. The four live tables lacking a primary key were inspected before execution; all were empty and had no inbound or outbound foreign keys, so they were excluded from the primary-key manifest rather than guessed or mutated.

## Transactional deletion result

The main transaction deleted the frozen manifests from 33 affected tables. The two primary populations were deleted exactly as approved: **17,965 claims** and **44,884 users**. The transaction also deleted 364 reset-scope recovery cases before their parent claims, together with reset-scope pipeline, assessment, quote, valuation, event, notification, audit, and dependency records. Every table’s affected-row count had to match its frozen manifest count or the transaction would have rolled back.

The first independent postflight detected eight non-enforced legacy user-reference tables containing rows whose referenced test users had been deleted. This did not affect the protected claims or owner, but it did not meet the owner’s requested “no orphaned reference” standard. A second, separate manifest-keyed transaction therefore removed only those frozen orphan records, with an exact expected-row-count check for each relation. No protected claim or owner account was referenced by those rows.

| Residual non-enforced user-reference cleanup | Deleted rows |
|---|---:|
| Assessor subscriptions | 678 |
| Notifications | 3 |
| Audit trail | 189 |
| ISO audit logs | 189 |
| Routing-threshold configuration history | 1,368 |
| Tenant-isolation violation history | 454 |
| Assessor–insurer relationship rows | 3,795 |
| Notification events | 623 |
| **Total residual orphan records** | **7,299** |

## Independent postflight verification

The final verifier was run after both transactions. It uses fresh live reads, rather than deletion-process estimates, and returned the following results.

| Verification | Expected | Observed | Result |
|---|---:|---:|---|
| Remaining claims | 101 | 101 | Pass |
| Remaining users | 1 | 1 | Pass |
| Remaining document-ingestion claims | 97 | 97 | Pass |
| Remaining owner-confirmed revision claims | 4 | 4 | Pass |
| Remaining owner account | 1 | 1 | Pass |
| Remaining non-protected claims | 0 | 0 | Pass |
| Orphaned claim references across the validated physical claim-reference inventory | 0 | 0 | Pass |
| Orphaned user references across the validated user-reference inventory | 0 | 0 | Pass |

The retained protected closure also remains populated as expected: 85 AI assessments, 300 audit entries, 178 panel-beater quotations, 173 vehicle market valuations, 67 quote-evidence ledger entries, seven report-provenance snapshots, six evidence findings, and three approval records. The live staging-aligned schema does not contain a table named `source_documents`; the postflight therefore did not falsely claim a table-level source-document count. The retained claim and dependent-record closure above is the verified live evidence boundary.

> **Conclusion:** The approved test-data reset is complete. The owner account, 101 protected claims, and their verified dependent closure remain. The reset population has been removed, and the final tested claim- and user-reference inventories contain no orphaned references.

## Archive and recovery continuity

The pre-delete encrypted archive remains available and unchanged. Its SHA-256 is `0bc94ee9e78622ccf4b59ab338aaad1ea44ede9808d0e8d02a20641abbd33da6`; its disposable restore rehearsal passed before any deletion. The owner-held passphrase remains required for recovery. The archive is the recovery point for this completed reset; no replacement archive was created after deletion.

## Service reopening status

The project environment switch `KINGA_MAINTENANCE_MODE` has been updated to `false`, and the existing maintenance-mode test passed with the disabled value. The currently public domain still returned `503 MAINTENANCE_IN_PROGRESS` immediately after that configuration update because it is serving the already-published maintenance release. The Manus browser session expired before the required publication action could be completed.

**No further database action is required.** The sole remaining operational step is to publish/redeploy the current project configuration, then verify that public `/readyz` no longer returns the maintenance response before declaring the service reopened.
