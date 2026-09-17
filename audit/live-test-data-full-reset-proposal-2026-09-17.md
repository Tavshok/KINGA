# Live Test-Data Full Reset: Review Package

**Date:** 17 September 2026  
**Status:** **Proposal only — no execution authority**  
**Scope:** The live Manus-hosted KINGA project database only. This package is based solely on read-only aggregate and metadata queries performed on 17 September 2026. No record, file, configuration, credential, schema object, deployment, or WorkOS setting was changed.

## Decision translated into a deterministic preservation rule

The owner has directed a full test-data reset with two protected exceptions: the owner’s own administrator account, and the claims personally processed through the real document-ingestion route. The protected claim population is now defined by a **specific, reproducible rule**, not by lifecycle date, claimant marker, or dashboard visibility.

> Preserve every claim whose reference matches the document-ingestion format `DOC-YYYYMMDD-XXXXXXXX`, together with the four separately owner-confirmed records in the existing revision group. Preserve the one configured owner account. Reset all remaining live test data only after the preflight, archive, rehearsal, and stop conditions in this package pass.

This preservation rule reflects the owner’s direct domain confirmation. It does not assert that the DOC format by itself proves ownership in a general system context; the owner has confirmed this particular cohort as the processed set for this reset. The four exact revision-group references remain in an owner-controlled sealed execution input and are intentionally omitted from this general review document.

At the read-only snapshot, the rule retained **101 of 18,066 claims** and selected **17,965 claims** for reset. The preserved cohort comprises 97 document-ingestion claims and four owner-confirmed revision records. The 97 document-ingestion claims are distributed across the corrected lifecycle as follows:

| Dashboard interpretation | Physical state in the database | Preserved claims |
|---|---|---:|
| Pending Review | `intake_pending` | 18 |
| In Review | `analysis_complete` | 12 |
| KINGA Complete | `assessment_complete` | 67 |
| Owner-confirmed revision group | `assessment_complete` | 4 |
| **Total preserved** |  | **101** |

The cohort is internally coherent for the purpose stated by the owner. It has **101 distinct linked source documents**, no source document shared with a reset-candidate claim, and four source documents classified as claim forms with completed extraction and approved validation. The linked document/evidence/report graph is also non-empty and bounded: 85 AI assessments, 300 audit-trail rows, 178 panel-beater quotes, 173 vehicle-market valuations, 67 quote-evidence-ledger rows, seven report-provenance snapshots, six evidence findings, two quote-evidence gaps, and three approval rows are connected to the preserved claims. These records must remain intact.

## Current dry-run scope

The following counts are a **point-in-time dry run**, not an execution target. The mandatory fresh preflight must reproduce the preservation rule and recalculate every count after a maintenance freeze. Any mismatch is a stop condition.

| Object class | Retain | Candidate for reset | Basis |
|---|---:|---:|---|
| Claims | 101 | 17,965 | Owner-confirmed DOC cohort plus four sealed owner-confirmed revision records |
| Local users | 1 | 44,884 | Direct configured-owner match; the owner is the only live user resolved from protected-claim actor metadata |
| Source documents linked to retained claims | 101 | 0 directly linked to reset claims | No protected source is shared with a reset claim |
| Unlinked source documents | 0 protected | 135 current candidates | No linked claim; archive-and-review before deletion |
| Direct claim-reference base tables | 22 retain populated rows | 29 reset-populated tables | Comprehensive metadata scan across 74 base tables; one additional relation is a view and is not modified |

The 97 DOC claims contain a claimant identifier value that does **not** resolve to any current row in `users`. Therefore, there is no claimant user to preserve for those claims. The only resolved user in protected-claim audit and approval metadata is the configured owner. This is a pre-existing orphan-reference condition, not a justification to invent or reassign an identity. The final preflight must verify that this remains true; if it changes, execution stops.

## Dependency closure and deletion implications

The live schema contains **55 enforced foreign-key child relations** to `claims`. Seventeen have rows attached to reset claims. One child relation, `recovery_cases`, uses `RESTRICT` and currently has **364** reset-candidate rows; it prevents parent-claim deletion until its reset rows are explicitly archived and deleted. Six relations use `SET NULL`. They must not be allowed to silently retain unlinked test residue: reset rows in these relations are to be explicitly archived and deleted before parent claims, while records attached to preserved claims remain untouched. Eleven relations use `CASCADE`; the execution package will still enumerate and archive their reset rows explicitly so the archive and postflight totals are auditable.

A broader metadata scan found **74 base tables** containing a claim-reference column and one view. Of those base tables, 29 contain reset-candidate references, 22 contain preserved-claim references, and 18 contain pre-existing dangling or non-matching claim references. The latter cannot belong to the protected set and must be preserved in a separate archive section before they are removed as reset residue. The view is read-only metadata and is not an execution target.

The user graph requires the same discipline. The authoritative schema has six enforced foreign keys to `users`: assessor-report reviewer, assessor-report assessor, assessor-report attester, claim-assignment creator, claim-assignment assignee, and claim-comment author. The non-owner rows presently found in the assessor-report and assignment paths are linked only to reset claims; no such row is attached to a protected claim. A generated execution manifest must nevertheless enumerate every non-owner user reference, including non-enforced application references, before user deletion. No inference from column naming alone is acceptable at execution time.

## Archive, recovery, and rehearsal control

Deletion must not begin from a live query result alone. The execution package must create a **frozen, encrypted logical archive** immediately after the maintenance freeze and immediately before any deletion. It must contain the full row payloads and primary-key manifests for all reset targets, including reset-claim rows, all dependent rows, all non-owner user rows and their dependent records, unlinked source documents, and pre-existing dangling reference rows. The archive must also contain a separate manifest for the 101 protected claims and the owner account, so the preservation boundary is independently checkable.

The archive must be encrypted with an owner-controlled recovery key, uploaded to an approved non-public location, and accompanied by a SHA-256 manifest covering every exported file and row-count ledger. The owner must be able to retrieve the archive without relying on the live application. A successful archive command is not sufficient: its restoration must be rehearsed into a genuinely separate disposable database, and the restored archive must reproduce the frozen row counts and the protected-set exclusion check.

Because TiDB DDL and some administrative operations do not offer conventional transactional rollback semantics, the reset is to use a **recovery-first design**, not a promise of rollback after delete. The archive restore rehearsal and its pass/fail evidence are therefore hard gates, not optional documentation.

## Proposed execution sequence

This is a sequencing specification, not runnable SQL. A later, separately reviewed change packet must generate exact statements from the frozen manifest and prove them in the disposable restore rehearsal first.

| Phase | Required action | Mandatory stop condition |
|---|---|---|
| 0. Authority and freeze | Confirm an approved maintenance window; suspend claim intake, uploads, seed runners, scheduled writers, and other write sources; record operator and reviewer. | Any active writer, unapproved operator, or inability to establish the freeze. |
| 1. Fresh read-only preflight | Recompute the 101 protected claims, one protected owner account, row counts, foreign-key graph, and source-document isolation. | Any protected-count, owner-match, source-share, or dependency-closure mismatch. |
| 2. Freeze the exact target set | Produce a primary-key manifest for every reset and protected row. The four COR references are supplied through the owner-controlled sealed input, not printed in the general report. | Any target row appears in both sets, or any target cannot be classified. |
| 3. Encrypt and verify archive | Export full target payloads and manifests; compute SHA-256 file and row-count ledger; store independently of the live database. | Missing table, count/hash mismatch, inaccessible archive, or unencrypted output. |
| 4. Restore rehearsal | Restore the archive to a separate disposable database and prove that the protected set is excluded, reset data is recoverable, and the generated delete order succeeds. | Any restoration, count, constraint, or protected-set failure. |
| 5. Controlled live reset | Re-run the frozen-manifest integrity check; delete reset-only leaf/child rows in dependency order; delete 364 reset recovery cases before reset claims; explicitly delete reset rows from `SET NULL` relations; delete reset claims; delete reset-only user dependents; delete all non-owner users last. | Any SQL error, affected-row mismatch, unexpected protected reference, or new write after the freeze. Stop without blind retry. |
| 6. Independent postflight | Verify the owner account is intact; exactly 101 protected claims and their closure remain; no reset claim or non-owner user remains; all foreign-key and application-level reference checks pass; confirm archive hashes and retained source documents. | Any count, relationship, integrity, smoke-test, or archive discrepancy. |
| 7. Controlled reopening | Resume writers only after the owner has reviewed postflight evidence. | Owner has not accepted the postflight report. |

The live deletion must use the frozen primary-key manifest rather than a broad predicate evaluated after the archive. This prevents a new row created during an imperfect maintenance window from being accidentally included. All operations must be batched with a documented expected affected-row count per table. A failed batch must halt the run; it must not be retried blindly or continued with a modified predicate.

## Explicit exclusions and unresolved matters

This package intentionally does **not** decide whether to delete shared tenant, policy, vehicle, insurer, or configuration roots. The protected claims have their own source documents, but the live project schema does not support a safe assumption that every broader parent root is exclusive to a reset claim. Parent-root deletion would require a separately generated ownership/isolation ledger and is excluded from this first reset packet.

The package also does not alter or repair pre-existing dangling references before archival. Those rows are reset residue for the stated full reset, but their existing state must be captured rather than silently repaired. Likewise, no reset SQL is included here, no database backup has been created, and no claim, user, document, attachment, report, audit, or configuration record has been changed.

## Required approval before any implementation or execution work

Approval of this document would authorize only the next planning artifact: a **rehearsal-only, manifest-driven reset packet** in a disposable restored database. It would not authorize deletion in the live project database.

Before live execution can be considered, the owner must separately approve: the maintenance window and write freeze; the named operator and reviewer; the archive encryption and storage destination; the successful independent restore-rehearsal evidence; the exact frozen preflight counts; and the final live delete packet. WorkOS migration, provider configuration, WhatsApp deployment activities, credential changes, and unrelated cleanup remain outside this package.

## Evidence references

1. [Live user-population discrepancy investigation](file:///home/ubuntu/kinga-replit/audit/live-user-population-discrepancy-investigation-2026-09-17.md)
2. [Initial user cleanup proposal](file:///home/ubuntu/kinga-replit/audit/live-users-cleanup-proposal-2026-09-17.md)
3. [Claim lifecycle, queue, and batch-signature assessment](file:///home/ubuntu/kinga-replit/audit/claim-lifecycle-queue-and-synthetic-signature-assessment-2026-09-17.md)
4. [Claim-number and approved-document attribution assessment](file:///home/ubuntu/kinga-replit/audit/claim-number-and-approved-document-attribution-assessment-2026-09-17.md)
5. [Protected owner-processed claim identification proposal](file:///home/ubuntu/kinga-replit/audit/protected-owner-claims-identification-proposal-2026-09-17.md)
6. Read-only metadata and aggregate closure queries executed on the live project database, 17 September 2026.
