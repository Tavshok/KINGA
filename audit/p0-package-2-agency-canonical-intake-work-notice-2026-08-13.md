# P0 Package 2 — Agency Canonical Claim-Intake Hand-off Work Notice

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 13 August 2026  
**Status:** Proposed — implementation requires explicit approval

## 1. Verified Current-State Finding

The Agency Broker router currently exposes `createAgencyClaim`. It verifies that an `agency_clients` record belongs to the agency tenant, then writes directly to `claims`. This bypasses the canonical intake idempotency ledger, canonical attachment ownership checks, durable `claim_documents` association, source metadata contract, assessment-start recovery, and canonical audit/event sequence.

This is a P0 conformance gap. An agency-assisted claim must not create a parallel claim-persistence model.

## 2. Proposed Authority Model

An agency may prepare and submit a claim only for a client record within its own agency tenant. The resulting claim remains an **agency-assisted client submission**, not an agency-owned claimant claim. The hand-off must retain the agency client reference and submitting agency user in canonical source metadata.

The implementation will require all of the following before persistence:

| Control | Required behavior |
|---|---|
| Agency tenant | The chosen agency client must belong to the authenticated agency tenant. |
| Client attribution | The canonical claim stores the client identity/reference as the intended claimant attribution; the agency submitter is retained as submission provenance. |
| Evidence ownership | Attachments must originate from an agency-scoped, authenticated upload prefix. No caller may attach a claimant, another agency, or another tenant’s file. |
| Canonical persistence | The hand-off calls `persistCanonicalClaimIntake` and `startCanonicalIntakeAssessment`; it does not insert a claim directly. |
| Idempotency | Each agency-assisted submission has a server-visible idempotency key and uses the canonical durable ledger. |
| Recovery | Assessment-start failure uses the existing in-app recovery path only. |
| Tenant isolation | Foreign agency-client IDs, storage keys, claim IDs, or replayed idempotency keys are denied or isolated. |

## 3. Scope

The approved implementation would replace the direct `claims` insert with an agency-to-canonical adapter, define a precise input schema including attachment metadata and client attribution, and provide an agency upload-key prefix to the canonical ownership guard. It would record agency assistance in canonical `sourceMetadata` and remove the agency-specific `estimatedDamageAmount` field from claim creation; KINGA must not create a repair cost at intake.

It would add router and service tests for same-tenant success, foreign client denial, foreign attachment denial, duplicate replay, lossless document metadata, and recoverable assessment-start failure.

## 4. Explicit Exclusions

This package will not alter client consent policy beyond recording agency assistance, create a policy, alter underwriting, premium, settlement, repair-cost, fraud, commission, insurer, payment, or WhatsApp behavior. It will not migrate or mutate historic agency-sourced claims automatically.

## 5. Acceptance Criteria

The package is accepted only when an agency-assisted claim has the same canonical request, claim, document, idempotency, recovery, and tenant-boundary behavior as My Portal, while preserving agency-client and agency-user provenance. The old direct claim-write route must no longer be reachable.
