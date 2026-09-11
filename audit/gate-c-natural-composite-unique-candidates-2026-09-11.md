# Gate C Natural and Composite Unique-Constraint Decision Shortlist

## Boundary

This is a **decision list only**. The current authorised pass adds explicit surrogate primary keys to compatible auto-increment `id` columns. It does not add, remove, rename, or make any index unique. A surrogate primary key and a natural/composite unique constraint answer different questions: the former gives each row a stable identity; the latter prevents a specific business-level duplicate.

The shortlist below identifies source shapes where a natural/composite uniqueness rule appears potentially valuable. It is not a migration instruction. Before any constraint is added, the business must confirm history/versioning semantics and perform a duplicate-data preflight in a separately authorised environment.

## Candidates requiring a business rule decision

| Table | Candidate key | Why it is a candidate | Decision required before any constraint |
|---|---|---|---|
| `assessor_insurer_relationships` | `(assessorId, tenantId)` | The declaration already names a non-unique index `unique_assessor_tenant`, strongly indicating the intended pair-level rule. | Confirm that an assessor may not have separate concurrent relationships for different `relationshipType` values in the same tenant. If multiple types are permitted, include `relationshipType` or retain the non-unique index. |
| `policy_claim_links` | `(policyId, claimId)` | The table is explicitly a policy-to-claim link with coverage-verification fields. A repeated pair would otherwise create multiple indistinguishable links. | Confirm whether repeat links are legitimate historical decisions. If they are, use a version/active-status design rather than a blanket pair constraint. |
| `fleet_drivers` | `(fleetId, userId)` | The table models a fleet membership/driver assignment and separately records employment status/dates. | Confirm whether the application requires historical re-hire rows. If history is required, a current-membership rule needs an active-status design rather than a simple all-time unique key. |
| `entity_relationships` | `(entityAType, entityAId, entityBType, entityBId, relationshipType)` | The record represents an entity-to-entity relationship and would otherwise allow repeated identical relationship records. | Define canonical ordering for A/B first. Without it, reciprocal pairs (`A→B` and `B→A`) remain duplicates even with this constraint. Confirm whether multiple evidence events per relationship are intended. |

## Relationship tables already protected by a source-declared composite unique constraint

The following clearer association tables already have a composite `uniqueIndex` in source and therefore do **not** require a new uniqueness change in this task.

| Table | Existing source-declared unique constraint |
|---|---|
| `driver_claims` | `(driverId, claimId, role)` via `idx_dc_unique`. |
| `insurer_marketplace_links` | `(insurerTenantId, marketplaceProfileId)` via `unique_insurer_marketplace_link`. |
| `insurer_marketplace_relationships` | `(insurerTenantId, marketplaceProfileId)` via `unique_insurer_relationship`. |
| `agency_insurance_service_request_insurers` | `(serviceRequestId, insurerTenantId)` via `uq_agency_service_request_insurer`. |

## Deferred verification requirement

Any later uniqueness decision requires: a source-level business-rule approval, a read-only duplicate preflight scoped to the candidate columns, an explicit treatment for historical/versioned rows, and a fresh scratch replay before any staging authorisation. None of those steps is performed here.
