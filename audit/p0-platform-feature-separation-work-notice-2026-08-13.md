# Controlled Work Notice: Platform-Wide Feature Separation

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 13 August 2026  
**Status:** Proposed — no implementation authorised by this notice

## 1. Purpose

KINGA already separates the Agency Portal’s insurance service-request pathway from the agency-assisted accident-claim pathway. A remaining legacy review is required to ensure that the same architectural separation is retained across platform-level valuation, insurance request, quotation, policy, repair, and settlement paths.

> **Invariant:** An insurance service request, accident claim, standalone valuation, policy workflow, repair workflow, and settlement workflow must not share a record type, authority model, evidence contract, lifecycle state, report meaning, or financial outcome merely because they concern the same vehicle or customer.

## 2. Proposed Scope

The proposed work is limited to an evidence-led audit and targeted refactor of the remaining legacy paths, principally `server/routers/insurance-phase7.ts` and its direct writers. The work will identify which procedures create future records, which legacy records are read-only history, and whether any future valuation or service-request write still enters a quotation, policy, repair, settlement, or claim lifecycle.

| Workflow | Required record boundary | Explicitly not created by this workflow |
|---|---|---|
| Standalone valuation | Dedicated valuation record with source/provenance and client confirmation | Policy, premium, claim, repair, settlement |
| Insurance service request | Dedicated service-request record with insurer decision-support only | Synthetic claim, policy, premium, repair, settlement |
| Accident claim | Canonical claim and evidence records only | Insurance quote request, valuation substitution, policy decision |
| Policy/quotation | Quotation and policy records under insurer authority | Claim, settlement, repair instruction |
| Repair/settlement | Approved claim workflow records with separately authorised actors | Valuation or service-request completion |

## 3. Controls Required Before Closure

The implementation must provide a procedure-to-record map for every affected future write, label legacy quotation records as history where appropriate, and add deterministic regressions that reject a mixed writer. It must preserve the current agency insurance service-request tables, client valuation tables, market-valuation disclosure, client acknowledgement, agency deviation record, and Vehicle Passport condition evidence.

No valuation output may silently become a sum insured, premium, underwriting decision, repair cost, settlement, or policy instruction. No service request may create a synthetic claim. No quote or benchmark may become an L2 price substitute.

## 4. Explicit Exclusions

This package does **not** authorise:

- policy issuance, premium or underwriting changes;
- claim assessment, repair-cost, settlement, payment, or recovery changes;
- migration or alteration of historic customer records;
- new valuation pricing sources, models, thresholds, confidence scores, or comparable-data ingestion;
- changes to insurer decision rights or agency commission logic.

## 5. Acceptance Matrix

| Acceptance case | Required result |
|---|---|
| New standalone valuation | Dedicated valuation record only |
| New insurance service request | Dedicated service-request record only; no claim/policy/premium/settlement |
| Agency-assisted accident claim | Canonical claim intake only; no service-request or valuation record created |
| Legacy quotation history | Read-only and labelled as legacy history, never re-used as a new workflow writer |
| Cross-workflow writer attempt | Rejected by deterministic regression before persistence |
| Tenant and role scope | Preserved for every retained read/write path |

## 6. Definition of Done

The package is complete only when future writes are demonstrably separated, legacy history is not misrepresented as a new workflow, no prohibited financial or operational outcome is created, focused regressions pass, both production builds pass, and the work is checkpointed. The package must be separately approved before implementation.
