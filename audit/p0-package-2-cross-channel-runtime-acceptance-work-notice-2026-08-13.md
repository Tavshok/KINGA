# P0 Package 2 — Cross-Channel Canonical Intake Runtime Acceptance Work Notice

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 13 August 2026  
**Status:** Controlled scope — approval required before implementation.

## 1. Purpose

The approved canonical-intake foundation now covers the web/My Portal adapter, the local WhatsApp adapter, and the separate agency-assisted accident-claim service. The remaining P0 Package 2 work is to prove, with deterministic isolated fixtures and router/service contracts, that every concrete claim entry path preserves the same canonical claim/evidence behavior and rejects foreign-tenant object access.

This notice does not authorize a production claim submission, a provider message, a new policy, premium, quotation, repair cost, settlement, payment, or operational-data change.

## 2. Scope

| Entry path | Planned acceptance control | Expected result |
|---|---|---|
| Web/My Portal | Router-level canonical intake contract using isolated fixtures | One canonical claim/evidence shape; no dropped fields or attachments. |
| Agency-assisted accident claim | Service/router contract with restricted claimant identity and agency provenance | Same canonical persistence contract; lower-trust identity does not gain non-claim authority. |
| WhatsApp local adapter | Deterministic local inbound-message contract | Existing verified claimant link where present; tenant-fail-closed and restricted unregistered identity where not. |
| Concrete API/mobile path | Inventory actual registered submission procedures; test each concrete path or record absence explicitly | No untested claimed adapter. A non-existent adapter is not represented as conformant. |

## 3. Required Assertions

The acceptance suite will use an isolated or no-write fixture boundary and must prove the following for every implemented path:

| Control | Required proof |
|---|---|
| Canonical convergence | The entry point calls the shared canonical service or an approved thin adapter with the same normalized claim/evidence contract. |
| Evidence preservation | Supplied evidence fields, attachment metadata, original source associations, and provenance survive to the canonical persistence payload. |
| Idempotency | A repeated submission/retry produces no duplicate claim, document, attachment, assessment start, or recovery notification. |
| Repairer count | 0, 1, 2, 3, and 4+ repairer preferences are accepted without an artificial hard block and without changing price/settlement/fraud behavior. |
| Recovery | A recoverable assessment-start failure retains the one persisted canonical claim/evidence set and records the in-app recovery contract. |
| Tenant/object isolation | Cross-tenant claim, evidence, attachment, existing-record, and direct-ID attempts fail before disclosure or mutation. |
| No hidden adapter claim | Where no concrete mobile/API writer exists, the result is documented as absent rather than simulated or silently treated as covered. |

## 4. Explicit Exclusions

This scope does not alter pricing, L1/L2, benchmarks, quote decisions, policy issuance, underwriting, premiums, valuation, repair scope, fraud outcomes, settlement, payment, notifications beyond the existing in-app recovery behavior, WhatsApp/Twilio configuration, or external provider delivery.

It does not call a live WhatsApp provider. The connected-provider test-number/webhook/media replay remains a separately controlled external acceptance gate.

## 5. Completion Criteria

The package is complete only for the verified concrete adapters. The final result must state the exact files/procedures tested, test counts and results, build results, each absent/deferred adapter, and the remaining live external-provider gate. It must not claim universal multi-channel completion while a concrete untested entry path remains.
