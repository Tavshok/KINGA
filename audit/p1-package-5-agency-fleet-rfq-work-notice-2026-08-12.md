# Package 5 Work Notice — Agency & Fleet RFQ Authority and Commission Integrity

**Author:** Tavonga Shoko, Lead Engineer  
**Status:** Proposed work only — implementation requires explicit approval  
**Source findings:** AUD-018, AUD-019, and AUD-020

## Purpose

This package corrects the agency/fleet RFQ workflow so the visible actor, permitted action, persisted outcome, and commission calculation agree. It prevents a fleet user from being shown an action that only an agency can execute, removes conflicting 10%/5% placeholder commissions, and preserves the Package 1 agency-tenant boundary.

> A customer or fleet may record a decision or instruction on its own RFQ. A broker/agency may execute the authorised insurer-facing decision only when it owns the RFQ and has the required client instruction. No interface may imply that an unauthorised action will succeed.

## Proposed scope

| Workstream | Change boundary | Required outcome |
|---|---|---|
| **P5-A — RFQ authority model** | Classify RFQ actions as fleet/client instruction, agency execution, and insurer response. Derive each action from the RFQ owner, agency tenant, client/fleet relationship, and current workflow state. | UI controls and server mutations expose only actions the authenticated actor may execute. |
| **P5-B — Fleet decision journey** | Replace the fleet-owner `Accept/Reject` dead-end with a tenant-scoped decision/instruction action that the owning agency can review. | A fleet owner can complete a truthful decision journey without receiving an agency-role backend denial. |
| **P5-C — Agency execution journey** | Constrain agency accept/reject and sibling closure to the owning agency tenant and require a valid client/fleet decision when the workflow requires one. | Agency execution affects only the target RFQ and intended same-batch siblings in its tenant. |
| **P5-D — Commission source of truth** | Remove 10% display and 5% persistence placeholders. Resolve commission from one configured, versioned commercial rule or explicitly show `Not configured` and block financial finalisation. | Displayed, persisted, and auditable commission values agree and have a source. |
| **P5-E — User states** | Add explicit pending client instruction, instruction received, agency action required, accepted, rejected, expired, unavailable, and forbidden states. | No ghost buttons, silent fallback, or fabricated commission appears. |
| **P5-F — Evidence** | Add two-agency, one-fleet, same-tenant positive, foreign-RFQ negative, sibling-isolation, commission-source, unconfigured-commission, and UI/action parity tests. | The full visible decision chain is deterministic and tenant-safe. |

## Explicitly outside scope

This package does not create insurer underwriting integrations, bind insurance policies, process premium payments, transfer commission, alter pricing, create customer testimonials, or change the broader Agency Portal service model. It does not weaken Package 1 tenant protections.

## Required invariants

| ID | Invariant |
|---|---|
| RFQ-01 | A fleet/client may act only on RFQs explicitly linked to its authorised fleet/client relationship. |
| RFQ-02 | An agency may execute only RFQs in its own agency tenant and only in permitted state. |
| RFQ-03 | A foreign RFQ ID, sibling ID, insurer ID, or batch ID cannot disclose or mutate another tenant's work. |
| RFQ-04 | One commission rule is used by UI, calculation, persistence, audit, and report surfaces; a missing rule is visible, never assumed. |
| RFQ-05 | The UI never renders an action whose server counterpart will reject the current role by design. |
| RFQ-06 | No acceptance or rejection triggers payment, policy binding, or external insurer action inside this package. |

## Acceptance matrix

| Scenario | Expected result |
|---|---|
| Fleet owner views an authorised RFQ | May record allowed instruction; no agency-only execution control is shown. |
| Agency user views its instructed RFQ | May execute permitted accept/reject; the outcome and audit trail are tenant-bound. |
| Agency A supplies Agency B RFQ ID | Forbidden/unavailable; no data or sibling mutation. |
| Fleet A supplies Fleet B RFQ ID | Forbidden/unavailable; no data or decision mutation. |
| Configured commission rule | Same source and value is displayed and persisted. |
| No configured commission rule | Financial finalisation is unavailable with explicit explanation; no 5%/10% default. |
| Source/UI scan | No active placeholder percentage or mismatched action label remains. |
| Regression/build | Focused tests, Package 1 non-regression, server bundle, and Vite build pass. |

## Release decision

Completion requires deterministic two-tenant and fleet/client relationship evidence plus an authenticated agency/fleet acceptance check when role accounts are available. The package will not be called complete simply because buttons are renamed or a percentage constant is removed.
