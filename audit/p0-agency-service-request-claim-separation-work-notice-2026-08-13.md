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

## 3. Non-Negotiable Feature-Separation Invariant

KINGA must never use one feature record as a shortcut for another feature workflow. Insurance service requests, accident claims, valuations, policy issuance, repair work, and settlement each require their own record type, authority model, evidence contract, lifecycle, reports, and financial boundaries. A route that collects a cover requirement may not create a claim; a claim may not create a policy or settlement; and a valuation may not be represented as a claim.

## 4. Proposed Implementation

The implementation will rename and replace the legacy synthetic-claim insurance-quote path with an explicit agency insurance service-request lifecycle. It will retain agency-client ownership, selected insurers, risk/vehicle data, and quote-request audit evidence without manufacturing a policy, premium, claim, repair estimate, or financial conclusion.

An insurance service request may record a **client-proposed insured value** as a client statement and a distinct **KINGA valuation output** with its method, provenance, confidence, and uncertainty. The system will calculate and source-label their variance. Where the client retains a materially different proposed value, KINGA will present clear underinsurance and overinsurance implications, record the acknowledgement, and preserve an agency deviation record. The insurer may view the values and variance as decision support, but neither value may automatically become a sum insured, premium, policy term, or financial instruction.

The current valuation implementation is evidence-qualified rather than independently verified: it must not be described as highly accurate or multi-source until the individual comparable listings, recency, market coverage, adjustment provenance, and validation evidence are actually available. Until then, the service must disclose its method, confidence, data-source coverage, and uncertainty, and treat valuation output as non-binding decision support.

Standalone valuation remains a separate access path and report-gating journey. The insurance-request valuation is contextual decision support inside the service-request lifecycle, not a disguised standalone-valuation or claim record.

The agency-assisted accident-claim route will be introduced separately and only for actual loss information. It will use the approved Option B restricted identity model, canonical idempotency, agency-scoped attachment ownership, tenant isolation, in-app recovery, and auditable later verified My Portal linking.

## 5. Hard Boundaries

Neither route may create or infer a policy, premium, settlement, repair cost, fraud conclusion, commission, payment, or insurer decision. Agency assistance never makes the agency the claimant. A restricted assisted claimant remains lower trust until the client later verifies and links a My Portal identity. A valuation variance may trigger disclosure and acknowledgement, never automatic acceptance, rejection, pricing, or underwriting outcome.

## 6. Acceptance Criteria

Acceptance requires proof that an insurance quote request cannot enter the claim pipeline and that an actual agency-assisted accident claim cannot use the insurance service-request writer. Both routes must be tenant-scoped, audit-backed, idempotent where applicable, and preserve their distinct evidence, authority, reporting, and financial boundaries. The implementation must include a targeted audit of agency route writers to identify and remove any remaining mixed-feature persistence path. It must also prove that client-proposed value, KINGA independent valuation, variance, acknowledgement, and agency deviation records remain distinct, traceable, and non-binding for policy, premium, claim, and settlement decisions.
