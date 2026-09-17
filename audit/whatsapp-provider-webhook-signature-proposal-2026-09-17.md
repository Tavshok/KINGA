# WA-SEC-02: Twilio Provider Webhook Signature Validation Proposal

**Date:** 17 September 2026
**Status:** Proposal only. No route, configuration, credential, deployment, database, user, claim, or WorkOS change has been made.
**Scope:** Authentication and fail-closed configuration handling for the existing provider endpoint, `GET` and `POST /api/whatsapp/webhook`.

## Decision requested

Approve an isolated WA-SEC-02 security package that validates each provider webhook request against Twilio’s `X-Twilio-Signature` using the installed Twilio Node SDK. The endpoint will reject unauthenticated or incorrectly configured requests before any session, claimant, claim, or database write can occur.

This proposal is separate from WA-SEC-01. The unguarded `POST /api/whatsapp/test` route remains a separate removal proposal and has not been changed. WA-SEC-02 does not resolve that route by itself.

## Security design

Twilio signs webhook requests with the account authentication token, the exact configured callback URL, and all received request parameters. Twilio recommends using its SDK validation library rather than reproducing the signature implementation.[1] The repository already has `twilio` version 6.0.2 installed, including `validateRequest`; this package adds no dependency.[2]

The provider route will use `twilio.validateRequest(authToken, signature, canonicalUrl, formParameters)`. It will validate the complete parsed form body, not a selected field list. This remains compatible with Twilio adding future webhook parameters.

### Canonical URL rule for Render

The route will **not** reconstruct a signature URL from `req.protocol`, `req.hostname`, `Host`, `X-Forwarded-Host`, or `X-Forwarded-Proto`. Render terminates TLS before proxying to the application, so those values can differ from the public URL Twilio signed. In the current server, `trust proxy` is already enabled, but WA-SEC-02 will deliberately avoid relying on it for webhook authentication.[3]

Instead, production configuration will require one exact public callback URL:

```text
TWILIO_WEBHOOK_URL=https://<the-active-Render-public-host>/api/whatsapp/webhook
```

The value must exactly match the URL configured in Twilio, including scheme, host, path, port treatment, and any encoding. The package will reject a missing, non-HTTPS, malformed, credential-bearing, query-bearing, hash-bearing, or wrong-path value at request time. The callback URL will be treated as a fixed URL with no query string. Requests with unexpected query parameters will be rejected, so the configured value remains unambiguous.

This approach makes the validation independent of Render’s internal HTTP connection and proxy headers. It also means that a future public-domain change is a controlled configuration change: the Twilio Console callback URL and `TWILIO_WEBHOOK_URL` must be changed together before deployment of the domain change.

## Exact proposed source change

| File | Change |
|---|---|
| `server/whatsapp/webhook.ts` | Add a small validation boundary before either existing webhook handler performs work. It will read the complete provider configuration, require `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`, and `TWILIO_WEBHOOK_URL`, parse and validate the canonical HTTPS callback URL, reject unexpected query parameters, obtain `X-Twilio-Signature`, and call the SDK validator against the full parsed form body. Existing normalized-message mapping and asynchronous processing will run only after validation succeeds. |
| `server/whatsapp/webhook.ts` | Keep the existing `GET /api/whatsapp/webhook` verification route but subject it to the same configuration/signature boundary. The current GET route has no write behavior, but applying a common boundary prevents it becoming a misleading unsigned provider endpoint later. |
| `server/whatsapp/webhook.signature.test.ts` | Add isolated, dependency-injected tests. The tests will never call the real engine, provider, project database, or any external endpoint. |
| Project runtime configuration | Add `TWILIO_WEBHOOK_URL` through the managed project secret/configuration workflow during the deployment-preflight stage only. No value will be placed in source control, `.env`, documentation examples beyond the placeholder above, terminal commands, or test artifacts. |

The code will contain a small factory/dependency boundary solely so the route test can supply a test configuration and a mocked message processor. The production route will continue to use the environment at request time. This avoids test bypasses and allows tests to prove that processing is impossible before authentication succeeds.

## Fail-closed behavior

| Condition | HTTP result | Engine/database effect |
|---|---:|---|
| Complete configuration is absent | 503 | No engine call; no database access or write. |
| Callback URL configuration is malformed or differs from the required HTTPS route form | 503 | No engine call; no database access or write. |
| `X-Twilio-Signature` is absent | 403 | No engine call; no database access or write. |
| Signature does not validate against the canonical configured URL and complete form body | 403 | No engine call; no database access or write. |
| Request contains a query string when the callback URL contract requires none | 403 | No engine call; no database access or write. |
| Signature and configuration validate | Existing success response | Existing asynchronous provider workflow only; no broader behavioral change. |

The response bodies will be generic. Logs may record a safe event category, such as `webhook signature rejected` or `webhook configuration unavailable`, but will not log the authorization token, signature, phone number, request body, configured URL, or raw headers.

A configuration requirement will be deliberately stricter than the SDK minimum. Although signature validation itself only uses the authentication token, WA-SEC-02 will require the full Twilio provider configuration. This prevents the webhook from accepting traffic while the engine would otherwise fall back to a mock adapter. If any provider setting is absent, the route fails closed.

## Required regression tests

The isolated test module will use a test-only token and the SDK’s signature helper. It will assert the following.

| Test | Required proof |
|---|---|
| Valid signed form request | The existing provider success response is returned and the mocked engine is called exactly once with the normalized message. |
| Missing signature | HTTP 403 and zero engine calls. |
| Invalid or tampered signature | HTTP 403 and zero engine calls. |
| Changed form parameter after signing | HTTP 403 and zero engine calls, proving that all received parameters are covered. |
| Missing required provider setting | HTTP 503 and zero engine calls. |
| Invalid canonical URL | HTTP 503 and zero engine calls. |
| Render proxy header independence | A request carrying internal/spoofed host and forwarding headers still validates only when signed for the configured canonical URL. A signature made for the forwarded or request-derived URL is rejected. |
| GET provider route | Valid signed request follows its existing harmless response path; missing/invalid signature and missing configuration fail closed. |

The package will also run the existing WhatsApp identity unit test, the new signature test, the server bundle check, a repository reference scan, and `git diff --check`. It will not claim a full TypeScript-clean baseline because the project currently has pre-existing unrelated diagnostics.

## Deployment preflight and rollout boundary

WA-SEC-02 source work can be proven locally with test-only values. Applying it to a live published service requires a separate deployment preflight after the source package is reviewed:

1. Confirm the active public provider callback URL in the Twilio Console without exposing the authentication token.
2. Confirm the target Render public host and its HTTPS certificate are the intended public endpoint.
3. Set `TWILIO_WEBHOOK_URL` to exactly that existing Twilio callback URL through managed project configuration. No secret value is to be disclosed in chat or source control.
4. Confirm the existing Twilio account SID, authentication token, and sender-number configuration are present in the target runtime. If any value is absent, treat the service as disabled and stop; do not deploy a change that silently interrupts an active channel.
5. Deploy only after configuration equivalence is verified. A valid signed provider test may be performed only under separately authorized, non-production-safe test conditions because an inbound journey can write a claimant or claim record.

Until those deployment steps are explicitly authorized and passed, WA-SEC-02 is a source-review package only. It does not authorize changing Twilio configuration, adding credentials, changing a Render service, deploying, or sending a provider test message.

## Explicit non-goals

WA-SEC-02 does not remove the WhatsApp test route, alter claimant creation, alter user records, change the database schema, rotate credentials, investigate the historic contamination writer, perform cleanup, modify WorkOS, change access grants, or send a live WhatsApp message. It does not replace broader webhook replay protection, message idempotency, rate-limit policy, or provider-level fraud controls; those are separate security concerns.

## Approval boundary

Approval authorizes an isolated branch, the source/test package described above, focused test execution, and a review commit. It does not authorize any secret/configuration change, deployment, Twilio Console action, Render action, live endpoint call, database write, identity cleanup, WorkOS work, or WA-SEC-01 implementation.

## References

[1]: https://www.twilio.com/docs/usage/webhooks/webhooks-security "Twilio secure webhooks documentation"
[2]: https://www.twilio.com/docs/usage/tutorials/how-to-secure-your-express-app-by-validating-incoming-twilio-requests "Twilio Express webhook validation guide"
[3]: https://expressjs.com/en/guide/behind-proxies.html "Express behind proxies guidance"
