# WorkOS Package A: Active Test-Database Schema Transition

**Date:** 18 September 2026  
**Purpose:** Bring the database used by the database-backed KINGA test suites into agreement with the already merged, additive WorkOS Package A source contract.  
**Scope:** The authorized active test database only. No staging or production TiDB database was targeted. No provider credentials, WorkOS account, callback, local identity link, session behavior, or deployment configuration changed.

## Approved transition

The transition used the reviewed, scratch-proven four-statement Package A artifact unchanged:

```text
SHA-256: eae14bcce580a75346edd4813757b795327229701a6f4f64e787486012d255e6
```

| Ordinal | Statement | Result |
|---:|---|---|
| 1 | Add nullable `tenants.workos_organization_id varchar(128)` | Succeeded |
| 2 | Add unique index `tenants_workos_organization_id_unique` | Succeeded |
| 3 | Add nullable `users.workos_user_id varchar(128)` | Succeeded |
| 4 | Add unique index `users_workos_user_id_unique` | Succeeded |

No deletion, update, or insert statement was executed as part of the transition. The preflight confirmed both mapping columns and both indexes were absent. It also confirmed a small non-production test population: **5 tenants and 61 users**.

## Postflight

Metadata verification confirmed both columns are nullable `varchar(128)` values and both are single-column unique indexes (`non_unique = 0`). Both mapping columns remain entirely null: **0 user mappings** and **0 organization mappings**. Thus, the additive schema is present while all identity-linking behavior remains inert.

## Regression proof

The schema test and every suite that previously stopped at `ER_BAD_FIELD_ERROR: Unknown column 'workos_user_id'` were rerun after the transition:

| Test file | Result |
|---|---:|
| `server/workosPackageA.schema.test.ts` | 2/2 passed |
| `server/services/role-assignment-audit.test.ts` | 19/19 passed |
| `server/approval-tracking.test.ts` | 14/14 passed |
| `server/reporting/forensicReportModel.test.ts` | 6/6 passed |
| `server/reporting/p0IntakeEvidenceVisibility.test.ts` | 2/2 passed |
| `server/reporting/sharedQuoteEvidencePresentation.integration.p0.test.ts` | 1/1 passed |
| **Total** | **44/44 passed** |

The source-to-test-database contract gap is therefore closed. This does not resolve the seven separately pre-existing reporting expectation failures; those are being traced individually before any test or source change is proposed.
