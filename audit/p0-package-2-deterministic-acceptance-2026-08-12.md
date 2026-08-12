# P0 Package 2 — Deterministic Operational-Acceptance Record

**Author:** Tavonga Shoko, Lead Engineer  
**Status:** Deterministic acceptance complete; live WhatsApp inbound acceptance remains an external integration gate

## Scope and evidence boundary

This record distinguishes verified deterministic behavior from an unperformed external-provider test. No live claimant record, production WhatsApp message, email, or payment action was created during this acceptance activity.

| Acceptance subject | Deterministic evidence | Result |
|---|---|---|
| Canonical claim intake | Canonical intake guards, persistence flow, and real My Portal source boundary | Passed |
| Repairer preferences | 0, 1, 2, 3, 4, and 6 preferences; duplicate normalisation | Passed; warnings only, no submission block |
| Evidence preservation | Claim/document persistence contract, attachment-key ownership and duplicate-key guard | Passed |
| Idempotent retry | Durable idempotency ledger and repeated-persistence regression | Passed |
| Assessment-start recovery | Retained intake record plus one in-app notification on failure | Passed |
| WhatsApp identity | Existing account resolution, restricted guest creation, and unknown-insurer denial | Passed |
| Tenant protection | Foreign attachment ownership is denied; unknown insurer fails closed | Passed |
| Existing lifecycle compatibility | Claim lifecycle and portal regression contracts | Passed |
| Bundled server build | `esbuild` server bundle | Passed |
| Frontend production build | Vite build after memory-safe retry | Passed |

## Executed focused suite

The final deterministic run completed **7 test files and 38 tests**, all passing:

1. `server/services/canonicalClaimIntake.p0.test.ts`
2. `server/services/canonicalClaimIntake.persistence.p0.test.ts`
3. `server/services/canonicalClaimIntake.recovery.p0.test.ts`
4. `server/whatsapp/engine.p0-identity.test.ts`
5. `server/submit-claim-ui-p0-intake-routing.test.ts`
6. `server/claim-lifecycle-contract.test.ts`
7. `server/portal-conformance.test.ts`

## Explicit remaining live integration gate

> **Not yet demonstrated:** an actual WhatsApp provider inbound message travelling through webhook receipt, provider media download, storage, verified insurer mapping, canonical claim persistence, and report-visible evidence using a dedicated test number.

This test requires a connected WhatsApp/Twilio test number and an approved isolated tenant. It must use a synthetic claim only, verify no external email is sent, and confirm that a repeated provider delivery produces no duplicate claim, attachment, assessment start, or notification.

Until that test is complete, P0 Package 2 remains open in `todo.md`; the deterministic implementation must not be described as completed live-channel acceptance.
