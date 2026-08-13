# P0 Package 2 — Isolated Canonical Intake Operational Acceptance Work Notice

**Author:** Tavonga Shoko, Lead Engineer  
**Status:** Proposed; no implementation approved yet  
**Scope:** Deterministic, isolated verification of the canonical intake boundary. No connected WhatsApp provider, external webhook, live claimant, live policy, email, payment, or production claim outcome is required.

## Objective

Prove that all currently supported internal submission adapters converge on the canonical intake service, preserve evidence metadata and ownership, remain idempotent under retry, surface assessment-start failure as an in-app operational event, and deny foreign-tenant attachment or object access.

## In-Scope Acceptance Cases

| Case | Evidence required |
|---|---|
| Implemented web adapter convergence | Equivalent authorised web/My Portal payloads produce the same canonical claim and document shape in an isolated tenant fixture. |
| Supported hand-off convergence | The existing WhatsApp identity/media adapter is exercised with a local fixture, not a provider call. |
| Idempotency | Duplicate submission and replay preserve a single canonical request, claim, evidence set, assessment-start side effect, and notification record. |
| Failure recovery | A forced assessment-start failure records a recoverable in-app notification without duplicate claim or evidence persistence. |
| Ownership and tenant isolation | Foreign storage keys, tenant identifiers, direct IDs, and attachment mutations are denied. |
| Evidence preservation | Original filename, MIME type, bytes, category, storage key, URL, source channel, and associations remain unchanged from adapter input through canonical output. |

## Explicit Boundaries

This package will not call Twilio/WhatsApp, create a live claimant or policy, send email, issue a payment, alter settlement, or mutate a real claim. Provider-level webhook and media acceptance remains a separately tracked external gate.

## Discovered Conformance Boundary

The current codebase has canonical intake call sites in the web/My Portal claims router and the WhatsApp engine. It does **not** contain a direct agency claim-submission adapter. Agency-channel convergence is therefore an open implementation item, not an acceptance claim in this package. It requires a separately authorised agency hand-off that invokes the same canonical service with agency authority and evidence-ownership controls.

## Definition of Done

The result will include focused test output, isolated fixture evidence, a comparison of persisted canonical outputs, full server/client production builds, and an explicit list of external acceptance gates that remain open.
