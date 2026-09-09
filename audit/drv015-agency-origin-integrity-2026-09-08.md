# DRV-015 — Agency-Origin Service-Request Integrity Investigation

**Date:** 8 September 2026
**Scope:** Read-only source, schema-metadata, and aggregate relationship-integrity review.
**Out of scope:** Agency-client recovery, record deletion or re-parenting, schema/DDL, migration, service-request status change, invitation creation, snapshot creation, claim creation, and production mutation.

## Conclusion

The managed database contains **one agency insurance service request**. Its vehicle parent exists, but its agency-client parent does not. The request is marked `ready_for_insurer_review`, while aggregate evidence shows **no insurer invitations**, no condition snapshots, and no assisted claimant identity associated with the request.

| Aggregate-only observation | Result | Interpretation |
|---|---:|---|
| Service requests | 1 | A single agency-origin record exists. |
| Missing agency-client parents | 1 | The request cannot establish a current agency-client authority relationship. |
| Missing vehicle parents | 0 | Its vehicle reference remains present. |
| Requests with insurer invitations | 0 | No current insurer decision-support visibility was evidenced. |
| Requests with condition snapshots | 0 | No dated pre-loss snapshot is presently linked. |
| Requests with assisted identities | 0 | No agency-assisted claimant identity link was evidenced. |
| Current status | `ready_for_insurer_review` | The status is inconsistent with the absence of invitations normally created by dispatch. |
| Live foreign keys on `agency_insurance_service_requests` | None | The database does not enforce the parent relationships declared or assumed in application logic. |

## Current application-path assessment

The normal creation procedure first resolves an agency client within the caller’s agency tenant. New requests therefore cannot be created with a missing client parent through the current normal path. The current orphan is a retained integrity condition, not proof of a current write-path bypass.

| Surface | Current behavior | Consequence |
|---|---|---|
| Agency list (`getInsuranceServiceRequests`) | Uses an inner join to `agency_clients`. | The orphan is hidden from the normal agency list rather than represented as an actionable integrity exception. |
| Insurer decision support | Requires an eligible invitation row. | The aggregate inventory found no invitations, so no current insurer exposure is evidenced. |
| Agency-assisted claim | Resolves the client under the agency tenant before identity/persistence. | The orphan cannot be used to create an assisted claim through this path. |
| Dispatch | Current status is not awaiting acknowledgement, so normal dispatch cannot be repeated. | The inconsistent status/invitation state cannot be repaired safely without an authorised disposition. |
| Snapshot recording | Resolves the request and vehicle under agency scope but does not re-resolve the client parent. | A new snapshot could be added to an orphaned request; this is a containment candidate, but changing it would be an operational-policy decision because it changes whether an agency may preserve pre-loss evidence while client identity is unavailable. |

> **No client, vehicle, insurer, request, or invitation identifiers were selected or recorded.** The investigation does not infer why the client relationship is absent or who is authorised to restore it.

## Decision gate

The retained request requires a named business and governance decision before any data or code remediation. The responsible owner must decide whether the request should be: retained as a quarantined agency-origin audit record; deleted under a documented retention rule; recovered only after a verified client relationship is re-established; or allowed to retain new pre-loss evidence while its client authority is unresolved.

Until that decision, no service-request status change, invitation insertion, agency-client re-creation, re-parenting, snapshot addition, or assisted-claim action should be automated. Adding live foreign keys also requires separate schema-reconciliation planning because existing orphan data would prevent immediate enforcement.

## Evidence sources

| Source | What it established |
|---|---|
| `server/routers/agency-insurance-service.ts` | Current creation validates the agency client in scope; list, dispatch, insurer-review, snapshot, and assisted-claim paths have the behaviors described above. |
| Live aggregate joins | Parent integrity and downstream occupancy counts without selecting row content or identities. |
| Live `information_schema.KEY_COLUMN_USAGE` | No live foreign keys enforce the service-request parent relationships. |
| `audit/vehicle-policy-portability-and-agency-origination-discovery-2026-09-08.md` | The original DRV-015 finding and boundary that portability is not an authorised data-transfer model. |
