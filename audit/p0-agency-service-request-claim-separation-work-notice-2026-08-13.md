# P0 Agency Service Request and Assisted Claim Separation Work Notice

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 13 August 2026  
**Status:** Proposed — implementation requires explicit approval

## 1. Verified Architectural Finding

The current Agency Portal action named `createAgencyClaim` is invoked by the **Request Insurance Quotes** form. That form collects a client cover requirement, vehicle or risk notes, declared value, and selected insurer tenants. It then creates a synthetic `claims` row solely to dispatch insurer quote requests.

This is not an accident or loss report. The procedure name and persistence target are therefore misleading. Moving this existing insurance service-request flow into canonical motor-claim intake would incorrectly create an accident claim from a quotation request.

## 2. Required Separation

| Flow | Intended purpose | Authority | Persistence boundary |
|---|---|---|---|
| Agency insurance service request | Agency requests insurance quotations for its client | Agency acts under its client relationship | A dedicated service-request and insurer-invitation lifecycle; no `claims` row, motor-claim pipeline, repair cost, settlement, or assessment start. |
| Agency-assisted accident claim | Agency assists a client to report an actual loss | Agency is submitter/provenance holder; client is claimant | Canonical claim intake only, using the approved restricted lower-trust assisted claimant identity where no verified My Portal identity exists. |

## 3. Proposed Implementation

The implementation will rename and replace the legacy synthetic-claim insurance-quote path with an explicit agency insurance service-request lifecycle. It will retain agency-client ownership, selected insurers, risk/vehicle data, and quote-request audit evidence without manufacturing a policy, premium, claim, repair estimate, or financial conclusion.

The agency-assisted accident-claim route will be introduced separately and only for actual loss information. It will use the approved Option B restricted identity model, canonical idempotency, agency-scoped attachment ownership, tenant isolation, in-app recovery, and auditable later verified My Portal linking.

## 4. Hard Boundaries

Neither route may create or infer a policy, premium, settlement, repair cost, fraud conclusion, commission, payment, or insurer decision. Agency assistance never makes the agency the claimant. A restricted assisted claimant remains lower trust until the client later verifies and links a My Portal identity.

## 5. Acceptance Criteria

Acceptance requires proof that an insurance quote request cannot enter the claim pipeline and that an actual agency-assisted accident claim cannot use the insurance service-request writer. Both routes must be tenant-scoped, audit-backed, idempotent where applicable, and preserve their distinct evidence and authority boundaries.
