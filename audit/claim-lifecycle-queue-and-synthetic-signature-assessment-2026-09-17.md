# Claim Lifecycle, Intake Queue, and Synthetic-Batch Signature Assessment

**Date:** 17 September 2026  
**Author:** Manus AI  
**Status:** Read-only assessment. No database writes, reset, export, archive, configuration change, deployment, or protected-claim selection has occurred.

## Conclusion

The owner’s corrected operational lifecycle is the appropriate business interpretation: **Pending Review** means submitted and awaiting action; **In Review** means KINGA processing is active; and **KINGA Complete** means analysis has finished. The application implementation supports that order.

The separately displayed **18 pending intake processing** items are not a different document-ingestion queue. They are, with high confidence, the selected tenant’s `intake_pending` / `intake_queue` claim subset. However, the Claims Processor dashboard’s **Pending Review** section is broader than that subset. It also includes other non-complete and non-running statuses, including failed or legacy states. Consequently, the 18 items are part of Pending Review, but Pending Review should not be assumed to contain only those 18 items.

The batch-signature method **cannot safely identify the owner’s claims**. Large populations whose claimants do not carry the literal test marker show the same synchronized creation pattern as marked synthetic data. Treating “non-marker” or “not batch-like” as a proxy for owner activity would risk deleting genuine owner-processed claims or retaining test claims. The owner’s exact protected-claim list remains necessary.

## Corrected lifecycle mapping

The Claims Processor dashboard divides active claims in a priority order. A completed analysis appears as **KINGA Complete** when the claim has `analysis_complete` or the legacy `assessment_complete` status, or when its document-processing state is `ANALYSIS_COMPLETE`. A claim appears as **In Review** while it has an active pipeline status such as `analysis_running`, `document_validating`, `document_ready`, `assessment_in_progress`, `quotes_pending`, `recovery_attempted`, or `human_review_required`; it also appears there for the corresponding active document-processing states. All remaining non-closed, non-complete, non-running records appear as **Pending Review**. [1]

This means that the user-facing lifecycle labels are intentionally broader than a single database enum. They are a dashboard partition derived from both `claims.status` and `claims.document_processing_status`. The physical schema still supports `submitted` and `analysis_running`, but the live data at the time of this assessment had no rows with either exact status. The active review stage therefore cannot be identified by `status = 'analysis_running'` alone. [1] [2]

## The 18-item intake queue is a subset of Pending Review

The command-centre queue metric is tenant-scoped and counts `claims.workflow_state = 'intake_queue'`, independent of the display label. It does not query the `ingestion_documents` table. [3]

The aggregate live check found exactly one tenant with **18** claims in the state pair `status = 'intake_pending'` and `workflow_state = 'intake_queue'`. No tenant had exactly 18 claims whose document-processing state was pending or processing. In that same anonymous tenant cohort, there were 13 analysis-complete claims and zero claims with the exact `submitted` or `analysis_running` statuses. This makes it highly likely that the observed 18 is the tenant’s workflow intake queue rather than a separate document queue.

| Queue or display concept | Physical basis | Relationship to the 18 count |
|---|---|---|
| **Intake Queue** in the Claims Manager command centre | Tenant-scoped `workflow_state = 'intake_queue'` | The strongest match. The observed 18 is in this subset. |
| **Pending Review** in the Claims Processor dashboard | Any non-closed claim that is neither complete nor actively running | Broader than the intake queue. It includes the 18 but can include other waiting, failed, or legacy claim states. |
| Document-ingestion queue | `ingestion_documents` extraction and validation states | A distinct data structure. It does not explain the observed 18-count. |

> **Protection implication:** if a temporary non-destructive UI-based review is used while compiling the owner list, inspect both the broader Pending Review section and the 18-item Intake Queue. Neither is a reliable automatic preservation selector. The final reset design should protect the exact submitted list rather than every claim in a lifecycle bucket.

## Synthetic-batch comparison

The assessment compared two current lifecycle populations: `intake_pending` and `analysis_complete`. A claim was first classified only by whether its linked claimant carried the already-established literal test marker. The creation pattern was then evaluated independently: a record was called **batch-like** only if it shared a creation minute with at least one other claim and was created on a day on which synthetic-marked users were created. This is a deliberately conservative signature; it does not expose any claim, user, email, open ID, tenant identifier, or timestamp more precise than aggregate counts.

| Current lifecycle state | Claimant marker group | Claims | Batch-like claims | Batch-like share | Largest same-minute group |
|---|---:|---:|---:|---:|---:|
| Intake pending | Literal test marker present | 176 | 129 | 73.29% | 2 |
| Intake pending | No literal test marker | 669 | 650 | **97.15%** | 28 |
| Analysis complete | Literal test marker present | 347 | 227 | 65.41% | 4 |
| Analysis complete | No literal test marker | 2,666 | 2,647 | **99.28%** | 30 |

The outcome is decisive for the proposed identification method. The absence of the marker is not evidence of a distinct real-activity pattern. On the contrary, the supposedly non-marker claims have stronger batch concentration than the marked claims in both lifecycle states. In the recent synchronized creation windows, non-marker groups occurred alongside marked groups in repeatable quantities: for example, analysis-complete populations of 50, 225, and 339 non-marker claims appeared on known synthetic-user creation days, while intake-pending groups of 50 and 75 non-marker claims appeared on the same type of days.

Therefore, this evidence supports the prior conclusion that synthetic creation used more than one identity template. It does **not** establish which individual non-marker claims are owner-created. The pattern method is useful to demonstrate contamination and to rule out an automatic “keep the non-markers” rule. It is not safe enough to generate a preservation list.

## Required next identification input

The previously completed direct-owner attribution dry run returned zero associated claims across claimant, audit, event, assignment, approval, comment, and document-uploader paths. There is no defensible database-only field left that identifies the owner’s approximately 70 claims. [4]

The owner should continue compiling an exact protected-claim list from the UI. Claim numbers are preferred because they are human-recognisable business identifiers. The list must be provided through an owner-approved secure channel and must not be committed to GitHub, pasted into this report, or stored in the project workspace. The next action will remain read-only: a direct match and aggregate dependency-closure count. It will stop if the result is not close to the expected approximately 70 claims.

## Explicit non-authorisation

This assessment does not authorise any deletion, reset, export, encrypted archive, data modification, claim reassignment, user reassignment, status change, configuration change, or deployment. The owner account, every claim, every user, and all dependent data remain unchanged.

## References

[1]: file:///home/ubuntu/kinga-replit/client/src/pages/ClaimsProcessorDashboard.tsx "Claims Processor dashboard lifecycle partition"
[2]: file:///home/ubuntu/kinga-replit/drizzle/schema.ts "Claims status and workflow schema declarations"
[3]: file:///home/ubuntu/kinga-replit/server/routers/claims-manager.ts "Claims Manager intake queue health calculation"
[4]: file:///home/ubuntu/kinga-replit/audit/protected-owner-claims-identification-proposal-2026-09-17.md "Protected owner-processed claims identification proposal"
