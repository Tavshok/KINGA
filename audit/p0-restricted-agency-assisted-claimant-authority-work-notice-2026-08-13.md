# P0 Restricted Agency-Assisted Claimant Authority Work Notice

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 13 August 2026  
**Status:** Proposed — no implementation authorised by this notice

## Purpose

The approved agency-assisted identity model allows an agency to submit a genuine accident claim for a known client who has not authenticated through My Portal. It is intentionally a **lower-trust claimant identity**, sufficient only to anchor the canonical claim workflow. This work closes the remaining authority-enforcement gap so the restricted identity cannot be treated as an ordinary authenticated claimant elsewhere in the platform.

## Authority Model

| Identity state | Permitted capability | Not permitted |
|---|---|---|
| Agency client contact | Agency relationship and provenance reference | System access or claim authority by itself |
| Restricted agency-assisted claimant | Canonical accident-claim submission, evidence association, recovery notification, and later verified linkage | Independent portal, policy, valuation, financial, settlement, payment, fraud, document-control, communication, or non-claim report authority |
| Verified My Portal claimant | Authenticated capabilities granted by ordinary claimant policy | Agency provenance is retained but does not create additional authority |

## Proposed Scope

The implementation will establish a reusable restricted-identity capability guard and apply it to active route categories that can create non-claim authority. It will add route-level regression proof that a restricted agency-assisted identity is denied before side effects. It will preserve agency submission provenance, tenant isolation, canonical attachments, idempotency, recoverable assessment start, and later verified identity linkage.

| Surface | Required control |
|---|---|
| Portal shell and client self-service | Restricted identity cannot independently enter or act through a normal client portal. |
| Insurance, valuation, policy, and financial routes | Deny before quotation, valuation, policy, premium, payment, settlement, or commission side effects. |
| Document control and communications | Deny independent cross-claim document retrieval, sharing, or non-claim messaging authority. |
| Fraud, disputes, recovery, and reports | Deny non-claim-workflow authority and prevent access to non-claim intelligence/report actions. |
| Claim submission/recovery | Preserve only the existing canonical claim workflow and in-app recoverable-start notification. |
| Later verification | Record a controlled, auditable transition from restricted to verified claimant ownership without replaying or re-owning prior evidence. |

## Acceptance Criteria

1. A restricted agency-assisted identity is denied from every active non-claim route class before persistence or external side effects.
2. The canonical agency-assisted accident claim continues to succeed for a same-tenant, authorised agency-client relationship.
3. Foreign insurer tenant, foreign agency client, and foreign attachment attempts remain denied.
4. Existing verified claimant access is unchanged.
5. Later verified-linking evidence is audit-recorded and does not alter claim evidence ownership retroactively.

## Explicit Exclusions

This work does not issue a policy, quote, premium, valuation, settlement, payment, commission, repair cost, or fraud result. It does not grant the restricted identity any new portal authority. It does not modify production claim, user, attachment, or financial records.

## Decision Required

> Approve only the authority-guard, route-level denial, canonical claim preservation, and audited later-linking controls above. Any expansion of restricted identity into normal claimant access requires a separate authentication and consent scope.
