# WA-SEC-01 WhatsApp Test-Route Removal: Verification Results

**Date:** 17 September 2026
**Package:** WA-SEC-01
**Base:** GitHub `main` after merged WA-SEC-02, commit `228ac4182d5af233627d7ed0ec8102a8e31a097f`
**Status:** Verified isolated source package, pending GitHub review. It is not merged, deployed, or exercised against a live endpoint.

## Result

WA-SEC-01 removes the orphaned public `POST /api/whatsapp/test` simulation route and its handler. The route previously accepted caller-controlled data without authentication and passed it to the real WhatsApp intake engine. The updated registration exposes only the existing authenticated provider routes, `GET` and `POST /api/whatsapp/webhook`.

The new regression proves that a request to the deleted public URL returns HTTP 404 and invokes neither provider handler. It also proves that the provider GET and form-encoded POST registrations remain present. The combined WA-SEC-01/02 and WhatsApp claimant-identity tests passed, the server entry point bundled successfully, patch hygiene passed, and an independent application-security review found no blockers.

## Source changes

| File | Result |
|---|---|
| `server/_core/index.ts` | Replaces direct registration of three WhatsApp routes with `registerWhatsAppRoutes(app)`. This removes the public test endpoint from the application’s HTTP surface. |
| `server/whatsapp/webhook.ts` | Deletes `whatsappTestEndpoint`. The merged WA-SEC-02 provider signature-validation boundary is preserved unchanged. |
| `server/whatsapp/routes.ts` | Adds a narrowly scoped registrar that exposes only the existing provider GET and form-encoded POST routes. |
| `server/whatsapp/routes.test.ts` | Adds isolated loopback tests for the removed public route and retained provider routes. |

There is no change to database access, claimant creation logic, Twilio credentials, Twilio/Render configuration, deployment, WorkOS, the provider callback URL, or any existing data.

## Executed verification

| Check | Evidence | Result |
|---|---|---|
| Removed route | JSON `POST /api/whatsapp/test` to an isolated Express server | HTTP 404; neither injected provider handler was invoked. |
| Provider route preservation | Isolated GET and form-encoded POST to `/api/whatsapp/webhook` | Both reached their injected provider handlers. |
| Combined security regression | `pnpm vitest run server/whatsapp/routes.test.ts server/whatsapp/webhook.signature.test.ts server/whatsapp/engine.p0-identity.test.ts` | **20 tests passed** across 3 files. |
| Server entry-point bundle | `pnpm check:server` | Passed. |
| Changed-file formatting | Prettier check for the WhatsApp route registrar, regression test, and webhook module | Passed. |
| Patch hygiene | `git diff --check` | Passed. |
| Removed-route reference scan | Repository scan excluding historical audit records | The only remaining reference is the regression assertion that requires the old URL to return HTTP 404. No handler or registration remains. |
| Independent application-security review | Read-only source/test review | **Approved with non-blocking notes.** |

## Independent review conclusion

The review confirmed that the new registrar exposes only the legitimate provider routes, the deleted handler cannot be called through the application route surface, and WA-SEC-02 remains intact: it validates provider configuration and Twilio signatures before the intake engine can run. The review found no blocker to source review or merge.

It noted one **pre-existing** operational limitation that WA-SEC-01 did not introduce or change. The global 1 MB URL-encoded parser is registered before the provider route’s intended 5 MB parser. This means that an inbound form payload larger than 1 MB may be rejected by the global parser before the 5 MB route parser is reached. It is outside the approved removal-only scope and is not evidence that this package changes provider behavior. If 5 MB WhatsApp webhook payload support is required, it should be investigated in a separate, deliberately scoped package.

## Explicit operating status and next boundary

WA-SEC-01 is a source-review package only. **No live HTTP request was made.** The owner explicitly deferred all deployment preflight, Twilio Console inspection, Twilio/Render configuration changes, callback URL checks, and monitoring-schedule creation until after a personal confirmation of the callback URL and current WhatsApp traffic.

WA-SEC-02 was merged into `main` before this package was created. WA-SEC-01 will be sent for separate review and will be merged only when explicitly approved. Even after both source packages are merged, the daily aggregate-only identity monitor remains paused until the owner separately authorizes it.

## Merge posture

This package is ready for source review. It does not request or authorize deployment or any live configuration action. The owner retains the protected merge decision.
