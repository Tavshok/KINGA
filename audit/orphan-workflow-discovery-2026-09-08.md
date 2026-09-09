# Orphan Workflow Discovery — DRV-009 and DRV-015

**Date:** 8 September 2026  
**Scope:** Read-only tracing of the creation, deletion, retry, migration, test-fixture, audit, and live aggregate metadata paths relevant to orphan police-report and agency service-request rows.  
**Out of scope:** Data repair, deletion, re-parenting, schema changes, foreign-key addition, workflow/status changes, claim replay, and disposition decisions.

## Executive conclusion

Both orphan findings can now be attributed more narrowly than the earlier integrity inventory allowed.

The two orphan `police_reports` rows are **high-confidence historical test-fixture artefacts**. Both match the complete non-identifying fingerprint of the primary legacy police-report test fixture. They were created during the February 2026 manual-bootstrap/claim-cleanup period, have no matching police-report audit entry, and the live table has no enforced foreign key to `claims`. The available evidence does not prove the exact interruption or deletion statement that removed each parent claim, so this report does not present that final step as certain.

The single orphan `agency_insurance_service_requests` row is a **high-confidence current test-fixture artefact**. It matches all four non-identifying fingerprints of the Vehicle Passport regression fixture, including use of an agency user ID where an agency-client ID is required. The fixture directly inserts the invalid relationship and relies on later cleanup. The normal agency application procedure does not permit this: it resolves a same-tenant `agency_clients` row before creating a request. The database has no foreign key to prevent the fixture or another direct writer from persisting the invalid row.

| Finding | Most likely origin | Confidence | Can normal user workflow create a new orphan today? | Can a current repository workflow create a new orphan today? |
|---|---|---:|---|---|
| **DRV-009** police reports | Repeated legacy police-report test fixture plus an unprotected historical parent-claim cleanup/deletion path. | High for fixture origin; medium for the exact parent-removal event. | **No evidence of a normal supported application deletion/re-key path.** | **Yes.** A shared-DB test or out-of-band claim deletion can leave an orphan because the live FK is absent. |
| **DRV-015** agency service request | Vehicle Passport regression fixture directly writing an agency-user ID into `agency_client_id`. | High. | **No.** Normal creation requires a scoped agency-client row first. | **Yes.** The current fixture creates an invalid relationship by design; an interrupted/failed cleanup leaves it retained. |

## DRV-009 — Police-report orphan trace

### Creation and normal authority path

`policeReports.create` requires an authenticated assessor, insurer, or administrator role; requires a non-empty session tenant; and calls `getClaimById(input.claimId, tenantId)` before `createPoliceReport()` is invoked. The resolver adds `claims.tenant_id = tenantId` whenever a tenant is supplied. Therefore the normal tRPC creation route cannot intentionally create a police report for a missing claim or for a foreign-tenant claim.

The insert helper itself writes the supplied row without independently rechecking the parent. That is acceptable only if the database relationship is enforced or the create/check sequence is transactional. The current live metadata reports no foreign key on `police_reports.claim_id`, notwithstanding the later Drizzle declaration that specifies `ON DELETE CASCADE`.

| Evidence | Observation | Implication |
|---|---|---|
| Live aggregate | 2 reports have no live parent claim. Their creation dates are 6 February and 15 February 2026; their `updated_at` values equal their creation values. | Neither row shows a later in-table edit trail. |
| Live aggregate audit join | 0 of the 2 orphan reports has a matching `audit_trail` row recorded as a police-report entity. | The retained rows cannot be tied to an application audit event with the available audit model. |
| Historical bootstrap command | `police_reports` was manually created on 6 February 2026 with `claim_id INT NOT NULL` but no FK or cascade. | The deployed physical table was capable of retaining orphan rows from its origin. |
| Historical cleanup commands | Several direct `DELETE FROM claims` commands were recorded on 6 and 12 February 2026; no coupled police-report delete appears in those command records. | Direct parent cleanup was possible without relational protection. |
| Current legacy fixture | `server/policeReport.test.ts` creates a claim, creates a report with a fixed primary report/station/speed fingerprint, then attempts cleanup in an error-swallowing `afterAll`. | A failed/interrupted cleanup can retain test rows, and parent deletion is not database-protected. |
| Fingerprint comparison | Both orphan reports match the full primary legacy fixture fingerprint; neither matches the secondary fixture. One was created in the documented 6 February manual-cleanup window. | This is strong evidence of repeated primary-fixture provenance, not business-record provenance. |

### Retry, regeneration, and deletion assessment

The current historical-claim replay service writes replay-result records against `historical_claims`; it does not delete, replace, or re-key canonical `claims` rows. The report/pipeline regeneration paths operate against existing claims. No normal non-test router or service deletion path for canonical claims was found. The only non-test code match was a clearly named failure-test utility, `server/dra-failure-test.ts`, rather than a user-facing application procedure.

The current risk is therefore not a claim-retry design that loses police-report links. It is the absence of a live FK/cascade combined with direct test or operator-level writes/deletes. In particular, the tRPC creation check and insertion are not one atomic database operation; a concurrent direct parent deletion between those steps would also leave an orphan. No evidence indicates that this race is exercised by the normal application.

> **Answer:** The normal police-report workflow is not evidenced to create new orphans today. The shared-database test/manual-operation workflow remains capable of doing so until relational enforcement or a controlled test-isolation strategy is separately approved.

## DRV-015 — Agency service-request orphan trace

### Creation and normal authority path

The normal `createInsuranceServiceRequest` procedure first resolves `agency_clients.id = input.agencyClientId` within the caller’s `agencyTenantId`. It returns `NOT_FOUND` before vehicle resolution, valuation, or service-request insertion when that parent is absent. The request and initial snapshot are then written together inside a transaction. No application source path deleting agency clients or service requests was found.

The August agency migration creates indexes but no foreign key from `agency_insurance_service_requests.agency_client_id` to `agency_clients.id`. Consequently, the normal application guard is effective for normal callers but is not a persistence-level integrity guarantee for direct writers, imports, or test code.

| Evidence | Observation | Implication |
|---|---|---|
| Live aggregate | 1 service request lacks an agency-client parent, has a vehicle parent, and has no insurer invitation, condition snapshot, valuation deviation, or assisted-identity dependent row. | The orphan has not become an evidenced insurer decision-support or claim-conversion record. |
| Live timeline | The orphan was created and last updated at 11:41:42 UTC on 8 September 2026. | It is a same-day development/test-era artefact, not a historical agency-production record. |
| Fixture fingerprint comparison | The orphan matches the Vehicle Passport fixture’s request-number prefix, instruction text, make/model pair, and `created_by = agency_client_id` shape. | The direct fixture is the most likely source. |
| Fixture source | `server/vehiclePassportInArray.p0.test.ts` creates an agency user but no `agency_clients` row, then directly inserts service requests with `agencyClientId: agencyUserId`. | The fixture creates an invalid relation by construction, bypassing the normal procedure. |
| Fixture teardown | The fixture records inserted request IDs and deletes them in `afterAll`; it also verifies cleanup on a successful run. | The retained row is consistent with a cancelled/failed/interrupted fixture run or a prior fixture implementation, but available evidence cannot identify the exact execution failure. |
| Normal creation source | The agency router validates the agency-client parent in tenant scope before request creation. | Normal agency users cannot create the observed missing-parent state through this procedure. |

### Active-risk conclusion

The ordinary agency onboarding/service-request flow is not a multi-step write that persists a request before the client step. A client must exist before request creation is attempted. However, the current Vehicle Passport regression fixture remains an active shared-database integrity risk because it directly writes service requests using an actor ID in the client column. Its normal teardown reduces but does not eliminate the risk of retained records after cancellation, process termination, setup failure, or a cleanup failure.

> **Answer:** The normal agency workflow cannot create a new orphan on the available evidence. The current test-fixture workflow can, and has very likely done so for the retained row.

## What this discovery cannot determine

This review did not read report/client/request contents or identities and did not modify data. The available evidence cannot identify the human or process that started the relevant February or September test runs, prove the exact interruption that bypassed cleanup, or establish whether all historical manual database operations are represented in the preserved command records. It also cannot retrospectively prove the parent-claim deletion statement for each police row.

The findings therefore support a governance decision with confidence bounds; they do not authorise deletion, re-creation of parents, relinking, invitation insertion, status change, or foreign-key migration.

## Separate follow-up work, not performed here

Two independently scoped improvements are indicated, but neither is implemented by this discovery:

| Candidate | Reason it needs a separate scope |
|---|---|
| Convert shared-database police and agency fixtures to exact, valid owned relationships with failure-safe cleanup. | It changes test code and must be validated independently against the real database. |
| Evaluate schema enforcement and an orphan-safe data migration plan. | A new FK or cascade would be blocked by retained orphan data and requires an approved data-retention/disposition decision first. |

## Evidence references

| Reference | Evidence used |
|---|---|
| `server/routers.ts` (`policeReports.create`) | Current police-report creation authority and pre-insert claim lookup. |
| `server/db.ts` (`getClaimById`) | Tenant-scoped claim lookup behavior. |
| `server/db/documents-db.ts` | Direct police report insert/update helper behavior. |
| `drizzle/schema.ts` (`policeReports`) | Declared later cascade intent. |
| `.manus/db/db-query-1770390077687.json` | Historical physical police-report table bootstrap without FK. |
| `.manus/db/db-query-1770391624905.json`, `.manus/db/db-query-1770391703378.json`, `.manus/db/db-query-1770922425077.json`, `.manus/db/db-query-1770922585313.json` | Preserved direct claim-cleanup command chronology. |
| `server/policeReport.test.ts` | Legacy police fixture and cleanup behavior. |
| `server/routers/agency-insurance-service.ts` | Normal agency-client validation, transactional request/snapshot creation, and downstream authority checks. |
| `drizzle/migrations/20260813_agency_service_request_valuation_condition_snapshots.sql` | Agency-origin physical contract without FKs. |
| `server/vehiclePassportInArray.p0.test.ts` | Direct invalid agency service-request fixture and its cleanup path. |
| Aggregate-only live metadata | Orphan counts, timestamps, FK absence, audit-linkage count, and non-identifying fixture-correlation counts. |
