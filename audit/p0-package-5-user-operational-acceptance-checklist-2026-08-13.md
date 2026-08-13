# P0 Package 5 — RFQ Authority Operational Acceptance Checklist

**Author:** Tavonga Shoko, Lead Engineer  
**Status:** User-executable acceptance gate  
**Purpose:** Verify tenant-safe RFQ authority and agency-commercial commission configuration after publication, without issuing a policy, changing a premium, or creating a customer-facing financial outcome.

## Preconditions

Use an isolated test fleet account, two different agency tenants, two insurer responses to one fleet-policy RFQ, and a product that is visible in the Agency Commission Configuration screen. Do not submit a policy issuance instruction. Where production-like accounts are unavailable, record the scenario as not executed rather than substituting another account.

## Acceptance Matrix

| ID | Persona | Action | Expected result |
|---|---|---|---|
| P5-OA-01 | Fleet owner | Open Fleet Quotes; choose a quoted insurer response and click **Instruct accept**. | An instruction is created. No policy is issued and no commission is calculated. |
| P5-OA-02 | Same fleet owner | Re-open the RFQ after instruction submission. | The page explains that agency execution is pending; it does not show direct finalisation. |
| P5-OA-03 | Agency tenant A | Open **Authorised Fleet Instructions** and execute the instruction. | Only the instructed RFQ is actioned; if accepted, only its same-fleet, same-agency active siblings close. Audit wording confirms no policy, premium, claim, settlement, or commission effect. |
| P5-OA-04 | Agency tenant B | Attempt to execute tenant A's instruction through any visible or direct route. | Access is denied or the instruction is unavailable. No quote status changes. |
| P5-OA-05 | Fleet owner | Attempt to call or reach the agency execution action directly. | The action is unavailable or denied; a fleet owner can submit an instruction only. |
| P5-OA-06 | Agency tenant A | Configure a commission rate for one product. | Configuration appears only under agency tenant A and is labelled commercial metadata. |
| P5-OA-07 | Agency tenant B | View the same product configuration. | Tenant A's rate is not visible or reusable. An unconfigured product says **unavailable**, not a default percentage. |
| P5-OA-08 | Agency tenant A | Accept or reject a fleet RFQ after commission configuration exists. | RFQ outcome is identical to an unconfigured product; no commission is created from the RFQ and no policy is issued. |
| P5-OA-09 | Agency/fleet owner | Inspect the RFQ comparison and commission dashboard. | No 5% or 10% placeholder appears. Commission is configured separately per product and is not RFQ-derived. |

## Evidence to Return

For each executed scenario, record the persona, tenant, RFQ identifier, result, timestamp, and a screenshot or error text. Do not include customer personal data, policy details, or payment information. A failed denial control must include the precise route/action attempted and confirm that no RFQ state changed.

> **Operational boundary:** This checklist verifies authority and commercial isolation. It is not a policy issuance, underwriting, premium, claims, settlement, or payment test.
