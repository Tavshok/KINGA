# WhatsApp Test Route: Usage Assessment and Security Change Proposal

**Date:** 17 September 2026
**Status:** Proposal only; no source, runtime, configuration, route, credential, or database change has been made.
**Scope:** The public `POST /api/whatsapp/test` route only. This is isolated from the live-user population investigation, WorkOS migration, data remediation, and normal WhatsApp provider webhook.

## Decision requested

**Approve removal of the unused public `POST /api/whatsapp/test` route and its handler.** The repository provides no evidence that it is used by the owner, contractors, a test suite, browser automation, a package script, documentation, or a recent development workflow. Removal is safer and narrower than retaining a second entry point behind a development-only condition.

## Usage assessment

The route was introduced once, in commit `2a025fd1` on 7 August 2026, as part of the initial WhatsApp webhook implementation. It has no later functional change in Git history. There is no reference to either the route URL or its `whatsappTestEndpoint` handler outside its two implementation locations:

| Checked evidence source | Result |
|---|---|
| Vitest and Playwright tests | No reference. |
| Browser automation configuration | No reference. |
| Package scripts and CI workflows | No reference. |
| Repository documentation and development runbooks | No reference. Documentation names the provider webhook only. |
| Source call sites outside implementation | No reference. |
| Recent Git history after initial introduction | No functional change or consumer added. |
| Retained local application logs examined | No observed request marker. This is weak supporting evidence only because log retention is incomplete. |

This cannot prove that an undocumented external person has never sent a manual HTTP request. It does establish that the route has **no known repository-backed consumer** and is not a test dependency. The safer conclusion is that it is orphaned code.

## Why removal is the appropriate fix

The route accepts caller-controlled input, has no authentication, no provider signature verification, no development-environment guard, and no source-IP restriction. It calls the real WhatsApp intake engine. A caller that completes the relevant claim journey could create an actual claimant record through the project database.

A development-only guard would reduce production exposure but retain a second weaker path in every development runtime that uses a real database. It would also require developers to keep a security-sensitive testing convention correct over time. The intended test behavior can instead be exercised directly against the engine with dependency-controlled tests; a public HTTP test endpoint is not required.

## Proposed implementation package: WA-SEC-01

The proposed source scope is deliberately small.

| File | Exact change |
|---|---|
| `server/_core/index.ts` | Remove the `whatsappTestEndpoint` import and remove registration of `POST /api/whatsapp/test`. Preserve the existing provider webhook GET and POST registrations unchanged. |
| `server/whatsapp/webhook.ts` | Delete the now-unreachable `whatsappTestEndpoint` function. Preserve `whatsappWebhookVerify` and `whatsappWebhookReceive` unchanged. |
| `server/whatsapp/webhook.routes.test.ts` | Add focused regression coverage proving that the production webhook registration remains available while `POST /api/whatsapp/test` returns HTTP 404 and cannot invoke the intake engine. The test will use an isolated Express application and mocks; it will not connect to the project database or send WhatsApp messages. |

For reliable route-level regression coverage, the package may make a small testability-only refactor: expose a `registerWhatsAppRoutes(app)` helper from the WhatsApp route module, then have `server/_core/index.ts` call it. This would contain only the existing provider webhook registrations. It creates no new route, policy, or runtime capability.

### Explicit non-goals

WA-SEC-01 will not change the normal `POST /api/whatsapp/webhook` provider route, user creation logic, claimant lifecycle, database schema, credentials, WorkOS design, identity data, deployment configuration, or any existing claim data. It will not call a live endpoint.

## Regression proof required before commit

The implementation must prove the following in an isolated test process:

1. A request to `POST /api/whatsapp/test` receives HTTP 404.
2. The request does not invoke `handleIncomingMessage`.
3. The provider webhook remains registered and retains its documented response behavior.
4. The focused new test and changed-path server bundle check pass.
5. The repository has no remaining reference to `/api/whatsapp/test` or `whatsappTestEndpoint` outside the regression assertion that verifies the route is absent.

No full TypeScript-clean claim will be made because the project has inherited, unrelated diagnostics. The pre-existing diagnostics will be recorded separately from this isolated change.

## Separate issue: provider webhook authentication

The normal provider endpoint, `POST /api/whatsapp/webhook`, remains publicly reachable after WA-SEC-01 because provider webhooks must be reachable. The reviewed implementation currently does not verify Twilio’s `X-Twilio-Signature` header before passing requests to the intake engine. Twilio states that webhook requests are signed and recommends SDK validation using the full configured URL and all received parameters.[1]

That is a **separate hardening package**, provisionally WA-SEC-02, not part of the narrow route-removal change. It should add signature validation, fail closed when provider configuration is absent or invalid, and have positive/negative signature tests. It requires separate review because it can affect legitimate inbound WhatsApp delivery and must account for reverse-proxy URL handling. WA-SEC-01 does not delay on it, but it does not resolve it either.

## Read-only observation plan after WA-SEC-01

No monitor will be created until WA-SEC-01 is implemented and verified, consistent with the requested sequencing. Once it is closed, one recurring read-only aggregate query should check the entire `users` table, not only the four headline cohorts. The query must never select identifiers or user records. It will report only:

| Field | Purpose |
|---|---|
| Latest user creation timestamp | Detect any insertion after the currently known latest timestamp. |
| Total users created in the observation window | Establish general activity. |
| New rows matching the broad test-marker predicate | Detect recurrence beyond the four known cohorts. |
| New rows with unknown tenant references | Detect the known malformed-tenant pattern. |
| New rows with absent login method | Detect the known synthetic lifecycle pattern. |
| New rows with unregistered-claimant flag | Distinguish any legitimate WhatsApp/agency claimant creation from the historic pattern. |

Two viable frequencies follow. They differ only in how quickly recurrence is surfaced; neither needs a database write or an additional credential.

| Option | Behaviour | Operational trade-off | Run frequency |
|---|---|---|---:|
| **Daily monitor** | Checks an overlapping 26-hour window and reports aggregate results in this task. | Best early-warning coverage for a recently active incident; a missed run still has a short overlap. | Once per day |
| **Weekly monitor** | Checks the previous eight days and reports aggregate results in this task. | Lower operational frequency but can leave a resumed writer undetected for up to a week. | Once per week |

Given rows were still being created six days before the investigation, **daily observation is the recommended option**. The schedule prompt will explicitly prohibit all writes, direct-record queries, remediation, notifications outside Manus unless separately requested, and any WorkOS action.

## Approval boundary

Approval of WA-SEC-01 authorizes only the three-file route-removal/testing package, an isolated branch, focused tests, and a review commit. It does not authorize provider-webhook changes, monitoring schedule creation, deployment, data cleanup, access changes, WorkOS work, or database writes.

After WA-SEC-01 is verified and you confirm the monitoring frequency, the recurring read-only check can be created under its own explicit boundary.

## References

[1]: https://www.twilio.com/docs/usage/webhooks/webhooks-security "Twilio secure webhooks documentation"
