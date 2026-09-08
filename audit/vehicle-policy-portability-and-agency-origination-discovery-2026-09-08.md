# KINGA Vehicle/Policy Portability and Agency-Origination Discovery

**Date:** 8 September 2026  
**Scope:** Read-only inspection of vehicle, policy, claim, agency-origin and Vehicle Passport tenancy.  
**Related records:** Extends the driver and cross-stakeholder discovery reports dated 8 September 2026.  
**Out of scope:** Implementation, schema/DDL/migration work, record changes, new portability, cross-tenant access, or report changes.

## Executive conclusion

The current model is **not a vehicle- or policy-history portability model**. Vehicles, policies and claims all carry tenant-related information, but their relationships do not record a controlled insurer-switch event or a historical insurer ledger. The vehicle registry has a single nullable `tenant_id`, while its VIN is globally unique. Its active ingestion upsert matches VIN or registration globally and does not transfer the vehicle’s tenant ownership when it sees a claim from another insurer. Policies are tenant-attributed, and their schema has a renewal pointer, but there is no executable insurer-transfer or coverage-history process.

The direct answer to the portability question is therefore: **a vehicle/policy association is operationally single-owner and not safely transferable today.** A manual tenant change would leave existing claims under their original claim tenants, rather than transfer them. Some vehicle-history endpoints would still return an old tenant’s claim rows when that tenant supplies the shared vehicle ID, while the Vehicle Passport aggregation and timeline are presently broader than their access gate and do not scope their underlying claim, damage, inspection, fraud or confidence queries to the requesting tenant.

KINGA does have a distinct **agency-origin decision-support flow**, but it is deliberately not a policy or claim ownership transfer. An agency creates an agency-tenant-scoped market valuation and pre-loss condition record, then may invite insurers. The invited insurer can receive that bounded pre-loss evidence; the agency’s vehicle record remains agency-scoped. Agency-assisted accident intake separately creates a claim for the selected insurer and preserves agency-source metadata. It explicitly reports that historical claim ownership has not changed.

> **Material boundary finding:** Vehicle Passport is not tenant-only in its access model—it has an explicit invitation-evidence exception for agency pre-loss snapshots. But the broader Passport reads are not tenant-filtered after admission. This is an accidental, unsafe platform-wide data boundary, not a governed portability feature.

## Method and evidence boundary

The review used current executable source, schema definitions, and read-only live database metadata/aggregate counts. It did not read personal information, insurer identities, claim narratives, policy values, VINs, registrations or individual record contents.

| Evidence source | Use in this discovery |
|---|---|
| `drizzle/schema.ts` | Physical data contract for `vehicle_registry`, `claims`, `insurance_policies`, `vehicle_history`, agency service requests, insurer invitations and condition snapshots. |
| `server/vehicle-registry.ts` and `server/routers/vehicle-registry.ts` | Active vehicle identity matching, upsert ownership behavior, vehicle lookup, claims-history filtering and manual flag scope. |
| `server/services/epic4-aggregation.ts` and `server/routers/vehicle-passport.ts` | Vehicle Passport admission rules, aggregation/timeline data predicates, agency snapshot exception and cache scope. |
| `server/routers/agency-insurance-service.ts` and `server/agency/agencyAssistedClaimSubmission.ts` | Agency origination, insurer invitation, condition snapshot, insurer decision-support and agency-assisted claim boundaries. |
| `server/insurance/policy-issuance.ts` | Policy issue and renewal-pointer usage. |
| Live aggregate metadata | Occupancy, tenant representation, claim-to-vehicle links, duplicate registration groups and agency referential coverage. |

## 1. Current data model

| Record type | Tenant / insurer relationship today | History / transfer capability | Current live observation |
|---|---|---|---|
| **`vehicle_registry`** | One nullable `tenant_id` on each vehicle record. VIN is globally unique; registration is indexed, not unique. | No owner-history table or transfer event links a vehicle record to a sequence of insurers. The active upsert finds a vehicle globally by VIN or registration and retains the existing row’s tenant. | **49 rows across 37 represented tenants; 2 tenantless rows.** |
| **`claims`** | Each claim carries its own `tenant_id`, vehicle registration/VIN fields and optional `vehicle_registry_id`. | Claim tenant is independent of vehicle-registry ownership. No active transfer process updates a prior claim’s tenant. | **0 current claims have a `vehicle_registry_id`** in the live aggregate check, so current stored data does not exercise the link. |
| **`insurance_policies`** | Each policy carries a nullable `tenant_id`; it references a generic `vehicle_id`, not a declared FK to `vehicle_registry`. | Has `renewed_to_policy_id`, cancellation and expiry fields, but no explicit prior insurer, insurer-transfer event, consent record or policy-history relation. | **0 live policies**, 0 renewal links, 0 policy documents/endorsements/claim links. |
| **`vehicle_history`** | Contains ownership and claim-summary fields but has no tenant column. | Its name suggests history but it does not contain insurer-transfer fields and has no active source consumer in the reviewed paths. | **0 rows.** It is not evidence that portability exists. |
| **Agency service request** | `agency_tenant_id` owns the client instruction, valuation and condition evidence. Insurer recipients are represented separately in an invitation table. | The invitation permits bounded decision-support access; it does not bind a policy, transfer ownership or migrate claims. | 1 request in 1 agency tenant; no active invite, snapshot or claimant-identity rows. The sole request lacks a current `agency_clients` parent but has a vehicle link. |
| **Agency-assisted claim** | Agency submits an accident-intake request for a selected `insurer_tenant_id`; canonical claim intake operates under that insurer context. | Agency source metadata and a restricted claimant identity are preserved. The response explicitly sets `historicalClaimOwnershipChanged: false`. | No active assisted-identity records in the aggregate count. |

### Vehicle identity and ownership behavior

`upsertVehicleRegistry()` accepts a `tenantId` from the pipeline but first finds an existing vehicle by VIN, or then registration, **without a tenant predicate**. If a match exists, it adds the incoming claim ID to the existing vehicle aggregate, updates counts, risk and last-seen values, but does not set `tenantId` to the incoming claim tenant. A new record is assigned the incoming tenant only on insert.

This means that the model neither represents a formal insurer change nor makes a tenant transfer. It instead treats identity as platform-global and the vehicle owner as whichever tenant first created the row. The code comment explicitly says it links every claim against the same VIN/registration for repeat-damage and risk scoring; it does not establish an approved data-sharing basis, a source scope, consent, match confidence, insurer history or audit event for that sharing.

The agency service path differs. `resolveServiceVehicle()` looks up VIN or registration using **both** the identity and the agency tenant. It then inserts a vehicle with the agency tenant if none exists in that tenant. Because `vehicle_registry.vin` is globally unique, an agency request with a VIN already held by another tenant will attempt an insert that conflicts with the global VIN constraint rather than producing an agency/insurer portability relationship.

## 2. Insurer switch, renewal and transfer

No executable insurer-switch, policy-transfer, coverage-history or portability flow was found. The specific existing concepts are narrower.

| Existing concept | What it does | What it does **not** do |
|---|---|---|
| **Policy renewal pointer** (`insurance_policies.renewed_to_policy_id`) | Can represent a successor policy ID in the policy table. | No source call site currently writes/reads it; it does not record a new insurer, policyholder consent, vehicle transfer or historical claim-access rule. |
| **Policy lifecycle** | Supports pending, active, endorsed, cancelled, expired and renewed statuses, with cancellation metadata. | Does not migrate a policy or claims between tenants. |
| **Vehicle history table** | Has ownership-change and claim-count fields. | It has no tenant or insurer history, no transfer state and no active rows/callers in the reviewed paths. |
| **Agency insurer invitations** | Allows an agency to invite selected insurer tenants to review valuation decision support. | It does not create a policy, premium, sum insured, settlement or claim transfer. |
| **Portable claim dossier** | Exports a document for a fleet claim. | It is a document portability feature, not record-level insurer-transfer or controlled historical-data access. |

### What happens if a vehicle tenant is changed today

The following is based on the current access and query logic, not an assumed migration behavior.

| Requesting party after a direct vehicle `tenant_id` change | Current behavior |
|---|---|
| **Original tenant: vehicle registry `getById` / `findByVinOrReg`** | Receives `null` because the router compares the vehicle’s current tenant to the session tenant. |
| **Original tenant: `vehicleRegistry.getClaimHistory` with the known vehicle ID** | The service queries claims by `vehicle_registry_id` **and the original session tenant**. It can therefore return that tenant’s historic claims, even though the vehicle row’s tenant was changed. This path does not independently assert current vehicle-row ownership. |
| **New tenant: `vehicleRegistry.getClaimHistory`** | Returns claims linked to the same vehicle ID only where `claims.tenant_id` equals the new session tenant. Earlier claims are not transferred, so they are not returned. |
| **Original tenant: Vehicle Passport** | The vehicle access gate rejects access unless an explicit agency insurer invitation evidence exception applies. |
| **New tenant: Vehicle Passport** | The access gate admits the new tenant, but aggregation and timeline queries use vehicle ID or registration only; they do not predicate claims or related records by the new tenant. Therefore the current Passport can return broader data than the new tenant’s own claim set. |

Existing claim rows remain their original tenant records. They are not orphaned by a vehicle-row tenant change because the vehicle link remains, but they are no longer included in a normal tenant-filtered registry history for the new tenant. This is not a compliant transfer design; it is a split-ownership condition with inconsistent read behavior.

## 3. KINGA agency origination

The source contains a clear agency-origination concept, but its boundaries are intentionally limited.

| Step | Data created | Scope and outcome |
|---|---|---|
| **Agency client and service request** | Agency client identity/contact and a service request containing vehicle facts, client instruction, proposed insured value, market valuation and evidence provenance. | Owned by `agency_tenant_id`; expressly distinct from a claim, policy, RFQ, repair work and settlement. |
| **Vehicle condition snapshot** | Dated, versioned pre-loss exterior/interior/mechanical condition, damage notes, odometer, modifications, photographs and evidence sources. | Snapshot’s `tenant_id` is the agency tenant. It is explicitly pre-loss evidence, not a claim outcome, policy term, premium, repair estimate or settlement input. |
| **Insurer invitation** | A selected insurer tenant receives an `invited`, `viewed` or `responded` decision-support channel. | Invitation records the agency tenant, insurer tenant and status. It creates no policy or data ownership transfer. |
| **Insurer decision support** | Insurer users can list invited agency service requests when their tenant appears in an eligible invitation state. | Bounded valuation decision support only. |
| **Agency-assisted claim** | A claim is persisted under the selected insurer tenant with `channel: "agency_assisted"` and agency source metadata. | Agency remains source/provenance; the claim is an insurer-tenant claim. Identity linkage explicitly says prior historical ownership did not change. |

There is no agency-origin flag on an `insurance_policies` row or a general policy/vehicle transfer lifecycle. An insurer invitation is also not evidence that an insurer selected, issued or now owns a policy. The only established later relationship is decision-support visibility and, separately, a specific insurer-scoped assisted claim.

## 4. Vehicle Passport’s current boundary

Vehicle Passport is neither a purely tenant-local passport nor an intentionally governed platform passport. It has a narrow agency-evidence exception layered over broader unscoped downstream queries.

| Passport area | Access admission | Data query boundary | Assessment |
|---|---|---|---|
| **`getPassport` / `getPassportByRegistration`** | Require non-empty session tenant. Admit a vehicle owned by the same tenant, or a different-owner vehicle where qualifying agency insurer invitation snapshots exist. | Calls `aggregateVehiclePassport(vehicleId, tenantId)`. The aggregation queries claims, damage, signals, inspections, confidence and alerts by vehicle ID or registration only, without a claim tenant predicate. | **Unsafe broader data boundary.** The invitation is a bounded evidence exception, but aggregation is not bounded to it. |
| **`getTimeline`** | Calls the access helper but does not independently require a non-empty session tenant. | Returns claim references/status/final approved amounts, damage records, inspection events and fraud alerts by registration/vehicle ID without tenant filters. Pre-loss snapshots are correctly invitation-filtered. | **Unsafe broader data boundary** and a tenantless-session issue for tenantless vehicle rows. |
| **`getClaimHistory`** | Denies only when a non-null vehicle owner differs from the session tenant; does not use the agency invitation exception or require a session tenant. | Returns claim identifiers, references, status, final amount and assessment risk/recommendation by registration without a tenant filter. | **Unsafe broader data boundary** and denies authorised agency-invitation users even though the main Passport permits their bounded evidence. |
| **`getFraudSignals`** | Same current-owner-only check; no non-empty session-tenant assertion. | Returns signals/alerts by registration, with no tenant filter. | **Unsafe broader data boundary** and a tenantless-session issue for tenantless vehicle rows. |
| **`getLatestSnapshot`** | Uses access helper and adds a tenant condition to the cache read. | Cache row is tenant-scoped; this does not repair the aggregation data that created it. | Correctly scoped cache read, but source aggregation needs separate remediation. |

The agency snapshot helper itself has the right narrow evidence shape: it joins a snapshot to an agency service request and invitation, then filters by requested insurer tenant and eligible invitation status. The current main branch still lacks the `inArray` import for that status filter; a separate isolated review fix exists in PR #38 and must be merged independently for the helper to run. That mechanical correction does not repair the broader Passport tenant-boundary findings documented here.

## 5. Continued risk ledger

The findings below continue the DRV sequence. They are discovery findings only; none was remediated by this task.

| ID | Severity | Status | Evidence and consequence |
|---|---|---|---|
| **DRV-010 — Global vehicle identity upsert mixes claims under a single tenant-owned row** | **High** | **Confirmed active code path; currently latent in live linked-claim data.** | `upsertVehicleRegistry()` matches VIN and registration without tenant scope, then writes incoming claim IDs and aggregate risk data to the found row without changing its tenant. The live database has 49 vehicle rows across 37 tenants, 2 tenantless rows, but currently 0 claims linked by `vehicle_registry_id`. A multi-insurer match would contaminate aggregate vehicle history and deny the later insurer normal registry/passport access. |
| **DRV-011 — Vehicle Passport returns cross-tenant claim, financial and fraud data after access admission** | **Critical** | **Confirmed reachable query shape; current data linkage is insufficient to quantify affected records.** | `aggregateVehiclePassport()`, `getTimeline`, `getClaimHistory` and `getFraudSignals` filter related records by registration or vehicle ID, not the requesting tenant. Returned fields include claim references/status, final approved amount, fraud scores/signals and alerts. The agency invitation is a pre-loss-evidence exception only; it does not authorise this broader data. |
| **DRV-012 — Tenantless vehicle rows can bypass Passport’s owner comparison** | **High** | **Confirmed active condition; 2 tenantless vehicle rows exist.** | `canAccessVehiclePassport()` returns true when `vehicle.tenantId` is absent. `getTimeline`, `getClaimHistory` and `getFraudSignals` do not first require a non-empty session tenant. An authenticated user who knows a tenantless vehicle ID or registration can pass the current-owner check and reach unscoped vehicle-related reads. |
| **DRV-013 — Agency vehicle creation conflicts with global VIN ownership rather than modeling agency origin** | **Medium** | **Confirmed schema/code incompatibility; live agency data is too sparse to show a collision.** | Agency lookup is scoped to its own tenant, but `vehicle_registry.vin` is globally unique. If another tenant holds the same VIN, the agency path attempts an insert and can fail on the unique constraint. There is no agency-origin association, sharing contract or controlled reuse path. |
| **DRV-014 — Vehicle Passport agency snapshot filter is currently blocked on main by missing `inArray` import** | **High availability / correctness** | **Confirmed separately; remediation awaiting review.** | The snapshot helper calls `inArray(...)` without importing it on current main. The isolated, real-fixture-tested correction is review-only PR #38. It is deliberately outside this discovery task. |
| **DRV-015 — Agency service request has an orphaned client relation** | **Medium data integrity** | **Confirmed live aggregate observation; no access exposure demonstrated.** | The sole live agency service request has a valid vehicle link but no current `agency_clients` parent; the aggregate also shows no invitations or snapshots. It cannot substantiate a live agency-to-insurer flow without separate data-integrity investigation. |

## 6. Decisions needed before portability work

No portability, transfer or network capability should be designed from the existing accidental global matches. The business owner first needs explicit decisions on the following matters.

| Decision required | Why it must precede implementation |
|---|---|
| **Scope of portability** | Decide whether an insurer switch transfers no history, a verified limited summary, selected evidence, or full historic claim detail. These have fundamentally different risk and legal implications. |
| **Authority and lawful basis** | Decide whether portability depends on policyholder consent, insurer-to-insurer contractual authority, regulator approval, an agency mandate, or a combination; obtain Zimbabwe/Zambia-specific legal and regulatory advice before sharing claim history. |
| **Vehicle identity resolution** | Decide how VIN, registration and changes of ownership should be matched; require confidence, conflict handling, source provenance and human resolution. A global name/registration match is not an authority model. |
| **History and visibility rules** | Decide whether previous insurer claims remain visible to the original insurer, what a new insurer may see, whether amounts and narratives are redacted, and how a policyholder disputes/corrects matching. |
| **Agency-to-insurer transition** | Decide whether an agency valuation stays agency-owned evidence, becomes shared platform evidence under invitation, or can be adopted by a bound insurer; define what event constitutes placement/binding. |
| **Governance and auditability** | Require explicit session authority, tenant-source markings, immutable access/match audit records, report/export redaction, retention, correction, and human review before cross-tenant history influences any operational decision. |
| **Safety remediation sequencing** | Resolve DRV-010 through DRV-012 before treating Vehicle Passport or the shared registry as a foundation for portability. Merge the separate narrow `inArray` fix independently; it is not a security remediation. |

## Conclusion

KINGA currently has a tenant-attributed record model with some platform-global identity behavior; it does not have insurer-switch portability. Policy renewal, agency invitation and claim source metadata are useful adjacent concepts, but none is a controlled transfer of vehicle, policy or claims history.

Vehicle Passport already recognizes a limited agency-origin data category—invited, pre-loss condition evidence—but it does not consistently preserve that boundary downstream. The proper next step is not to implement portability. It is to obtain a business/legal decision on the intended sharing model and separately triage the confirmed Passport and vehicle-registry tenant-boundary findings.

