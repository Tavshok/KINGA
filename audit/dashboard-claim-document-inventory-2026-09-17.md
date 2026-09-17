# Dashboard Claim-Document Inventory

**Date:** 17 September 2026  
**Author:** Manus AI  
**Scope:** Read-only inventory of documents associated with the Claims Processor dashboard’s **Pending Review**, **In Review**, and **KINGA Complete** sections. No document was opened, analysed, downloaded, copied, changed, reclassified, or submitted to KINGA. No file name, storage URL, claim number, claimant data, user data, or other direct record is included.

## Summary

The three dashboard sections currently contain **18,064 claims**. Only **217 claims** have attached records in `claim_documents`, holding **1,953 attached documents**. All attached documents are recorded as PDFs. The attached-document pattern is highly regular: every one of the 217 document-bearing claims has exactly **nine** attachments, and each follows the same category distribution. That regularity is consistent with a fixture or seeded bundle, not evidence of 217 independently assembled real claim files.

There are also **101 separate source-ingestion documents** linked from claims through `source_document_id`. These source documents are not assumed to be the same objects as the `claim_documents` attachments, so the report presents them separately and does not add them to the 1,953 attachment total.

> **Important distinction:** A claim’s dashboard section reflects lifecycle fields on the claim. It is not proof that every linked document has completed extraction or validation. In particular, 79 source-ingestion documents are linked to KINGA Complete claims but remain marked pending in the ingestion table. This is an observed data-state inconsistency; no attempt was made to repair it.

## Attached document inventory

| Dashboard section | Claims in section | Claims with attachments | Claims without attachments | Attached documents | Stored size | Document media |
|---|---:|---:|---:|---:|---:|---|
| Pending Review | 12,642 | 60 | 12,582 | 540 | 6,635,520 bytes | PDF only |
| In Review | 114 | 0 | 114 | 0 | 0 bytes | None |
| KINGA Complete | 5,308 | 157 | 5,151 | 1,413 | 17,362,944 bytes | PDF only |
| **Total** | **18,064** | **217** | **17,847** | **1,953** | **23,998,464 bytes** | **PDF only** |

Every attachment-bearing Pending Review claim has nine attachments. The same is true for every attachment-bearing KINGA Complete claim. No In Review claim has an attached `claim_documents` record.

### Attached-document categories

The attached category records form the same nine-document bundle for each document-bearing claim.

| Category | Pending Review | In Review | KINGA Complete | Total |
|---|---:|---:|---:|---:|
| Damage photo | 60 | 0 | 157 | 217 |
| Repair quote | 60 | 0 | 157 | 217 |
| Invoice | 60 | 0 | 157 | 217 |
| Police report | 60 | 0 | 157 | 217 |
| Medical report | 60 | 0 | 157 | 217 |
| Insurance policy | 60 | 0 | 157 | 217 |
| Correspondence | 60 | 0 | 157 | 217 |
| Other | 120 | 0 | 314 | 434 |
| **Total** | **540** | **0** | **1,413** | **1,953** |

The category count is significant: each attachment-bearing claim has one record in each of seven named categories and two records in `other`. The inventory does not infer the substantive contents of those PDFs from their category labels.

## Attached-document metadata quality

All 1,953 attachment records have a non-empty storage key, non-empty storage URL, and a positive stored byte count. However, title and description metadata are largely absent.

| Dashboard section | Attachments | Missing title | Missing description | Missing storage key | Missing storage URL | Non-positive size |
|---|---:|---:|---:|---:|---:|---:|
| Pending Review | 540 | 480 | 480 | 0 | 0 | 0 |
| In Review | 0 | 0 | 0 | 0 | 0 | 0 |
| KINGA Complete | 1,413 | 1,256 | 1,256 | 0 | 0 | 0 |
| **Total** | **1,953** | **1,736** | **1,736** | **0** | **0** | **0** |

Only the `other` category has titles in this inventory: 60 Pending Review records and 157 KINGA Complete records. This report does not expose those titles because they may contain identifying information.

The attachments were created in synchronized groups. Pending Review attachments occupy 59 creation minutes, with a largest same-minute group of 18 attachments. KINGA Complete attachments occupy 158 creation minutes, with a largest same-minute group of 18 attachments. This supports the established conclusion that the environment contains batched test or fixture activity.

## Source-ingestion document inventory

Claims can separately reference an original uploaded object in `ingestion_documents`. There are 101 such references in the three sections. Each source document is a PDF with a present storage URL, a present original filename, and a verified hash. The names and locations were intentionally not selected.

| Dashboard section | Source PDFs | Stored size | Classified as claim form | Unclassified | Hash verified |
|---|---:|---:|---:|---:|---:|
| Pending Review | 18 | 48,450,499 bytes | 0 | 18 | 18 |
| In Review | 0 | 0 bytes | 0 | 0 | 0 |
| KINGA Complete | 83 | 237,235,245 bytes | 4 | 79 | 83 |
| **Total** | **101** | **285,685,744 bytes** | **4** | **97** | **101** |

The ingestion state does not align uniformly with the claim section. The 18 source PDFs in Pending Review are pending extraction and pending validation. Of the 83 source PDFs linked to KINGA Complete claims, 79 are still pending extraction and validation, while four are extraction-completed and validation-approved. This is a status-record observation only; it does not determine whether the physical PDF is readable, sufficient, or authentic.

## Other document and evidence structures checked

The database contains additional document-related structures, but they do not add material attached-document inventory for these three sections. `document_versions` has zero records connected to claims in all three sections. `claim_evidence_findings` has zero records in Pending Review and In Review, and six findings associated with one KINGA Complete claim. The findings were counted only; no content, labels, or linked source data were selected.

## Interpretation and limit

This inventory answers **what document records exist** in the three dashboard sections. It does not certify that an attachment is a genuine document, determine whether a PDF can be opened, assess its contents, run OCR, trigger AI analysis, or change any record.

The recurring nine-document bundle, systematic missing titles and descriptions, and synchronized attachment timing strongly reinforce the earlier finding of test-fixture contamination. They do not provide a safe automatic method to identify the owner’s protected claims. Any reset or preservation decision must continue to rely on the owner’s exact protected-claim list and a separate aggregate dependency-closure check.

## Explicit non-authorisation

No file was accessed or changed. No claim was changed. No user was changed. No document-processing action, ingestion action, OCR, extraction, AI analysis, classification, export, download, archive, deletion, reset, configuration change, deployment, or WorkOS action is authorised or performed by this inventory.

## References

[1]: file:///home/ubuntu/kinga-replit/client/src/pages/ClaimsProcessorDashboard.tsx "Claims Processor dashboard section definitions"
[2]: file:///home/ubuntu/kinga-replit/drizzle/schema.ts "Claim documents and claim source-document schema declarations"
[3]: file:///home/ubuntu/kinga-replit/audit/claim-lifecycle-queue-and-synthetic-signature-assessment-2026-09-17.md "Lifecycle, intake queue, and synthetic signature assessment"
