# DRV-009 — Police-Report Parent Integrity Investigation

**Date:** 8 September 2026  
**Scope:** Read-only source, schema-metadata, and aggregate integrity review.  
**Out of scope:** Police-report content, officer/claimant identities, data correction, deletion, re-parenting, schema/DDL, migration, and production mutation.

## Conclusion

The managed database contains **2 police-report rows**, and the aggregate referential check found **0 rows with a current parent claim**. Live metadata shows `police_reports.claim_id` is non-nullable but has **no live foreign-key constraint**, even though the checked-in Drizzle contract declares a cascading reference to `claims.id`.

| Aggregate-only observation | Result | Interpretation |
|---|---:|---|
| Police-report rows | 2 | Existing data is present. |
| Rows joining to a current claim | 0 | Neither row can currently inherit tenant attribution from a parent claim. |
| Orphaned parent references | 2 | Confirmed data-integrity condition; the review did not inspect the referenced IDs or report contents. |
| Live `claim_id` foreign key | Absent | The live database does not enforce the parent invariant declared by source schema. |

> **No inference is made about why the parent claims are absent.** The evidence distinguishes an integrity condition from attribution of cause. The two records must not be deleted, re-parented, or treated as tenant evidence without a separately authorised data-remediation decision.

## Current application-path assessment

The normal `policeReports.create` procedure resolves the parent claim using the authenticated session tenant before inserting a report. That path is tenant-bound in current source. The investigation also identified two separate access-control defects in the existing router that need a bounded security repair before any later data remediation:

| Surface | Evidence | Risk | Required engineering response |
|---|---|---|---|
| `policeReports.byClaim` | The protected query calls `getPoliceReportByClaimId(input.claimId)` without resolving the claim in the caller’s tenant. The helper reads by claim ID only. | An authenticated user who can guess a claim ID may receive a police report associated with another tenant. | Add parent-claim tenant authority before lookup; preserve a non-disclosing not-found result. |
| `policeReports.extractPhysicsData` | The mutation checks role only, does not resolve a tenant-scoped parent claim, and passes `input.claimId` to `updatePoliceReport`, whose contract expects a police-report ID. | The OCR update target is ambiguous and can be unauthorised or incorrect when claim and report IDs differ. | Resolve the parent claim in the session tenant, resolve its report by that claim, then update the resolved report ID only. |

These code findings are distinct from the orphan-row condition. They can be corrected without deleting or changing the two orphan rows, and therefore belong in a separate, bounded security branch.

## Decision gate for the orphaned records

A later data-integrity decision is required before any action on the two rows. It must specify the authorised disposition for records with no current parent claim: retention with quarantine/audit marker, deletion under a retention policy, or recovery only when a verified authoritative parent can be established. Restoring the declared database foreign key also requires a schema-reconciliation and migration review because existing orphan rows would prevent immediate enforcement.

## Evidence sources

| Source | What it established |
|---|---|
| `drizzle/schema.ts` | Source declares `police_reports.claim_id` as non-null and referencing `claims.id` with cascade behavior. |
| Live `information_schema.KEY_COLUMN_USAGE` | No live foreign key exists for `police_reports`. |
| Aggregate `LEFT JOIN` from `police_reports` to `claims` | Two rows exist; none joins to a current parent claim. No row values were selected. |
| `server/routers.ts` and `server/db/documents-db.ts` | Current create path is parent-claim scoped; the read/OCR paths contain the separate access-control defects described above. |
