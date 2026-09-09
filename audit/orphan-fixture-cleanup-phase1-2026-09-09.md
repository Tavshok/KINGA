# Orphan Fixture Cleanup — Phase 1 Evidence Record

**Date:** 9 September 2026  
**Authority:** User-approved deletion of the exact fixture artefacts identified by the PR #58 orphan-workflow discovery.  
**Scope:** Three confirmed orphan fixture rows only. No schema, migration, application-code, workflow, relationship-repair, or additional data operation was performed.

## Authorised record identification

The approved live identification query used only the parent-absence joins and fixture fingerprints documented in PR #58. It returned exactly the documented population: two police-report orphans and one agency service-request orphan. No additional orphan rows existed in either target table at the pre-deletion check.

| Table | Exact row ID | Parent-absence condition | Reconfirmed fixture fingerprint |
|---|---:|---|---|
| `police_reports` | `3` | No `claims.id = police_reports.claim_id` parent. | `ZRP-TAB 95/24`, `Mutare Rural ZRP`, reported speed `80`. |
| `police_reports` | `510001` | No `claims.id = police_reports.claim_id` parent. | `ZRP-TAB 95/24`, `Mutare Rural ZRP`, reported speed `80`. |
| `agency_insurance_service_requests` | `1` | No `agency_clients.id = agency_client_id` parent. | `VP-REQUEST-%`, Vehicle Passport fixture instruction, `Fixture` / `Passport`, and `created_by = agency_client_id`. |

## Pre-deletion safety gate

Immediately before deletion, a transaction re-read and locked the exact three IDs. The transaction required all target IDs, parent-absence checks, fingerprints, and global target-table orphan counts to match before any `DELETE` could execute. A mismatch would have rolled back the transaction.

No database-declared foreign key referenced either target table. The known downstream columns for the agency service-request ID had zero references: `agency_insurance_service_request_insurers.service_request_id`, `agency_insurance_valuation_deviations.service_request_id`, and `vehicle_condition_snapshots.insurance_service_request_id`. No direct police-report reference column or matching prior administrative audit entry was present.

## Performed deletion and audit

The single transaction inserted three `audit_trail` records using the existing administrative audit mechanism and then executed exact-ID deletes only. Each audit event uses action `ADMIN_DELETE_CONFIRMED_FIXTURE_ORPHAN`, references its exact entity type and ID, and records the reason:

> confirmed test-fixture artefact per PR #58 orphan-workflow discovery

The three exact deletes were:

| Table | Deleted row IDs | Rows deleted |
|---|---|---:|
| `police_reports` | `3`, `510001` | 2 |
| `agency_insurance_service_requests` | `1` | 1 |

## Post-deletion verification

The post-transaction check confirmed all Phase 1 gates.

| Check | Result |
|---|---:|
| Remaining rows with police-report IDs `3`, `510001` | 0 |
| Remaining row with agency service-request ID `1` | 0 |
| Remaining orphan `police_reports` rows | 0 |
| Remaining orphan `agency_insurance_service_requests` rows | 0 |
| Retained matching administrative audit entries | 3 |

This completes the approved data-cleanup phase. Fixture lifecycle hardening is deliberately separate and has not been included in this commit.
