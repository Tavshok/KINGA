# Document Ingestion Tenant Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

## Finding

Document ingestion used a static `test-ops-001` tenant fallback for administrative users in upload, batch list, batch documents, detail, classification, and approval procedures. Document classification and approval final updates used the document ID alone, while batch statistics and ingestion-document back-links likewise omitted their tenant at the write boundary.

## Correction

All document ingestion operations now require a session tenant through a shared strict resolver. The static testing-tenant fallback is removed. Existing batch/document/detail reads retain their tenant filters. Ingestion-document back-link, batch statistics, classification, and approval final writes now include both target ID and tenant ID.

## Verification

The deterministic regression passed **2/2**, proving strict tenant requirement, removal of the default fallback, and tenant-bound final writes. The bundled server and Vite production build passed; Vite emitted only existing large-chunk advisories.

No ingestion batch, document, extracted record, claim, policy, payment, settlement, or financial record changed.

## References

1. [Document ingestion router](../server/routers/document-ingestion.ts)
2. [Tenant-authority regression](../server/documentIngestionTenantAuthority.p0.test.ts)
