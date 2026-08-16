# Authenticated Upload-to-Report Operational Acceptance

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Passed — canonical upload intake with controlled degraded evidence

## Scope

This acceptance exercises the actual authenticated multipart endpoint at `POST /api/upload-documents` rather than creating a claim directly. It creates a fresh `test-upload-oat-*` tenant and synthetic insurer claims-processor identity, signs a real session cookie through the production authentication contract, uploads a one-pixel synthetic PNG, and waits for the endpoint's fire-and-forget assessment trigger to finish.

The test then reads the persisted ingestion batch, ingestion document, back-linked canonical claim, pipeline run, and assessment. It renders the actual Claim Assessment, Claims Intelligence, and Forensic Claim Decision report generators under the isolated tenant. It does not use a customer, repairer, policy, quotation, payment, settlement, or production claim.

## Result

| Check | Result |
|---|---|
| Authenticated multipart route | Passed; a real signed session cookie admitted the isolated insurer claims-processor identity. |
| Canonical intake records | Passed; ingestion batch, hashed stored document, canonical `document_ingestion` claim, and document-to-claim back-link persisted together. |
| Asynchronous assessment start | Passed; the endpoint created `intake_pending` records, returned successfully, then invoked the actual Pipeline V2 trigger. |
| Pipeline lifecycle | Passed; Stage 1 ingestion completed, while intentionally insufficient synthetic image content produced qualified degraded states in later evidence-dependent stages. |
| Decision boundary | Passed; the final pipeline result remained `decisionAuthority=REVIEW` and `reportReadiness=HOLD`; no payment, settlement, or payable conclusion was created. |
| CL, CI, and FR | Passed; all three actual report generators rendered from the isolated claim. |
| Tenant/test-data cleanup | Passed; final direct database verification found zero isolated claims, users, ingestion documents, ingestion batches, pipeline runs, and vehicle-registry records. |

## Controlled Interpretation

This is a successful end-to-end **intake and controlled qualification** validation. A one-pixel synthetic PNG cannot be expected to produce complete vehicle, damage, pricing, or repair intelligence. Its degraded-evidence result is correct precisely because KINGA retained evidence, ran the pipeline, rendered the reports, and withheld unsupported decision authority.

## Automated Evidence

`server/upload-to-report.oat.test.ts` signs the actual session token, mounts the production upload router, posts actual multipart form data, polls only for completion of the asynchronous trigger, renders CL/CI/FR, and performs cleanup by exact test-tenant and registry identities. The final direct verification query returned zero records in every controlled test category.

## References

1. [Upload operational acceptance](../server/upload-to-report.oat.test.ts)
2. [Multipart canonical intake route](../server/upload-documents.ts)
3. [Pipeline trigger](../server/db.ts)
4. [Claims Intelligence generator](../server/reporting/claimsIntelligenceReport.ts)
5. [Forensic Claim Decision generator](../server/reporting/forensicDecisionReport.ts)
