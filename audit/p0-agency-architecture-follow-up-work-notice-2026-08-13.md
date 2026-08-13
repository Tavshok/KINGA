# KINGA — Agency Architecture Follow-Up Controls Work Notice

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 13 August 2026  
**Status:** Proposed — implementation requires explicit approval  
**Predecessor checkpoint:** `869f896e`

## 1. Purpose

The completed agency architecture correction separates the new Agency Insurance Service Request lifecycle from motor claims and records a valuation-linked, dated pre-loss vehicle-condition snapshot. This notice defines the remaining controls required before that correction may be represented as fully closed across the platform.

> This is a controlled follow-up scope. It does **not** authorise policy issuance, premium setting, payment, settlement, repair-cost generation, financial approval, bulk customer data migration, live claimant testing, or a change to existing claim outcomes.

## 2. Verified Follow-Up Gaps

| Control area | Current state | Required corrective outcome |
|---|---|---|
| Agency-assisted accident claim acceptance | The route delegates to canonical intake, but only deterministic source-contract coverage exists. | Prove same-tenant success, foreign client and attachment denial, idempotent replay, and recoverable assessment-start failure through router/service-level tests. |
| Restricted assisted identity | A lower-trust identity and audited link record exist, but cross-route capability denial has not been proven. | Deny independent portal, communication, document-control, financial, settlement, fraud, and non-claim report authority for unregistered agency-assisted identities. |
| Platform-wide workflow separation | The new agency path is separated, while a legacy mixed valuation/request path remains in `insurance-phase7.ts`. | Audit and refactor remaining mixed request/valuation persistence so standalone valuation and insurance service requests use distinct records, evidence, and lifecycles. |
| Professional valuation evidence view | Client presentation avoids raw confidence scores; agencies and insurers do not yet have a dedicated evidence view. | Provide a role-authorised professional view of source coverage, adjustments, provenance, and limitations without exposing raw confidence scores to clients. |

## 3. Proposed Controlled Implementation

### 3.1 Agency-assisted accident-claim runtime acceptance

The implementation will add deterministic router/service-level regressions for the new `createAgencyAssistedClaim` route. They will operate only against controlled fixture or mocked persistence boundaries and will prove agency-client ownership, insurer-tenant scope, attachment ownership, canonical idempotency, and recoverable assessment-trigger behavior. No live accident claim, assessment run, notification, or customer record will be created.

### 3.2 Restricted identity enforcement

The implementation will introduce an explicit shared guard for an `isUnregisteredClaimant` identity and apply it only to the authority-sensitive routes identified by audit. A restricted assisted identity will remain usable only as the canonical claim-workflow subject established by the agency. It will not independently sign in to a normal client portal, control documents, receive general communications, alter financial records, make settlement instructions, exercise fraud controls, or access non-claim reports until a verified My Portal identity is linked through the existing audited mechanism.

### 3.3 Remaining mixed valuation/request pathways

The implementation will first map the writers and readers in `insurance-phase7.ts`. It will not relabel records cosmetically. Any standalone valuation will retain its own report-gating and evidence path; any insurance service request will retain agency/client authority, invitation, acknowledgement, and non-binding decision-support boundaries. The audit will identify any migration required before a code change is proposed. No legacy quotation request, client policy, or premium will be silently reclassified.

### 3.4 Professional valuation evidence views

The implementation will add a professional, role-scoped view that displays the valuation date, method, available source coverage, adjustments, provenance, material limitations, selected client value, variance, and acknowledgement/deviation status. It will be explicitly labelled as decision support. The client experience will retain the simple **KINGA Market Valuation** label and will never show a raw model-confidence percentage.

## 4. Hard Boundaries

The following conditions remain mandatory:

| Boundary | Required rule |
|---|---|
| Feature separation | Insurance service requests, accident claims, valuations, policy issuance, repairs, and settlements must not share a persistence writer, lifecycle, or financial outcome. |
| Tenant isolation | An agency, insurer, client, attachment, vehicle record, snapshot, and report must remain inaccessible outside its authorised tenant scope. |
| Identity trust | Agency knowledge of a client is not equivalent to claimant authentication. Restricted identity remains lower trust until controlled verified linkage. |
| Pre-loss evidence | A condition snapshot may inform evidence review only. It cannot decide causation, repair scope, repair cost, fraud, policy, premium, settlement, or claim outcome. |
| Valuation | KINGA Market Valuation is evidence-qualified, non-binding decision support. Client responsibility for material vehicle facts and selected insured value remains explicit. |
| Operational safety | No live provider, payment, email, WhatsApp, policy, premium, claim, settlement, or customer-data operation is within this scope. In-app-only operational effects remain unchanged. |

## 5. Acceptance Criteria

The batch may be marked complete only if all of the following are demonstrated:

1. The agency-assisted accident-claim route proves same-tenant success and rejects foreign agency-client, tenant, and attachment attempts.
2. Duplicate idempotency keys do not create duplicate claim, document, attachment, assessment-start, or recovery side effects.
3. A recoverable assessment-start failure is recorded as an in-app operational recovery state without duplicate downstream effects.
4. A restricted assisted claimant is denied all independent non-claim capabilities through route-level evidence, while a later verified My Portal link is auditable and does not silently rewrite historical provenance.
5. `insurance-phase7.ts` writers/readers are classified and any remaining mixed record path is either removed under this approval or recorded as a separately controlled migration with no silent data conversion.
6. Agency and insurer professional evidence views display provenance, adjustments, source coverage, limitations, selected value, variance, acknowledgement, and deviation status; the client view exposes no raw confidence percentage.
7. Targeted regressions, bundled server build, and Vite production build pass with no new errors.

## 6. Out of Scope

The following work requires a separate Work Notice and approval: external comparable-market ingestion, valuation calibration or accuracy certification, policy issuance, premium calculation, insurer underwriting decisions, document upload redesign, account-registration redesign, live WhatsApp acceptance, report-template redesign, data migration of historical requests, or any customer-communications change.
