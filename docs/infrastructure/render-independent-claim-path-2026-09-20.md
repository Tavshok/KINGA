# Render-Independent Claim Path

**Status:** Source implementation and review package. **Not an activation or deployment instruction.**

**Recorded:** 20 September 2026

## Objective and boundary

This package makes the **claim-processing path** independently executable by an external Render service. In external mode, it calls either Gemini or Anthropic directly and stores evidence and generated reports in a direct S3-compatible object store. It does not call `BUILT_IN_FORGE_API_URL` or `BUILT_IN_FORGE_API_KEY` for AI or storage, and it has **no fallback** from a direct provider to Forge.

The boundary is enforced at each adapter selector, not merely reported by `readyz`: `KINGA_RUNTIME_MODE=managed` requires `AI_PROVIDER=forge` and `OBJECT_STORAGE_PROVIDER=forge`; `KINGA_RUNTIME_MODE=external` requires `AI_PROVIDER=gemini|anthropic` and `OBJECT_STORAGE_PROVIDER=s3`. An invalid or omitted external choice fails closed before a Forge AI or storage request can be made.

The intentionally deferred boundary is **owner notification delivery**. `notifyOwner` remains on the existing Forge channel until a separately authorized notification migration. A failed or delayed owner notice does not prevent claim persistence, evidence storage, AI processing, or report storage; it is not proof that the Render claim path is fully independent in every ancillary service.

## Runtime selection

| Concern                 | Managed Manus mode                                             | External Render mode                                                                                             |
| ----------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| AI adapter              | Existing Forge adapter (`AI_PROVIDER=forge`)                   | Gemini or Anthropic direct HTTP adapter                                                                          |
| Evidence/report storage | Existing Forge storage proxy (`OBJECT_STORAGE_PROVIDER=forge`) | S3-compatible SDK plus short-lived presigned GET URLs (`OBJECT_STORAGE_PROVIDER=s3`)                             |
| AI media input          | Forge reads project URLs                                       | Render downloads only a bounded, HTTPS, exact-host-allowlisted object URL and sends bytes to the chosen provider |
| Report renderer         | Existing system Chromium path                                  | Same code; the Render image installs `/usr/bin/chromium` explicitly                                              |
| Owner notification      | Forge                                                          | Forge temporarily; separate future migration                                                                     |

The direct adapters preserve the existing `invokeLLM` contract for text, images, PDFs, structured output, and current function-tool requests. Direct media access is deliberately strict: it does not follow redirects, does not accept HTTP, does not accept wildcard hosts, and does not turn a claim-controlled URL into an SSRF primitive.

## Render configuration contract

Values below are names and expected shapes only. **Do not commit or paste any secret values into source control.**

| Variable                     |       Required | Purpose / allowed value                                                                                                                                      |
| ---------------------------- | -------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `KINGA_RUNTIME_MODE`         |            Yes | `external`                                                                                                                                                   |
| `DATABASE_URL`               |            Yes | Existing `kinga_staging` connection for the reference environment; use its existing least-privilege application credential                                   |
| `JWT_SECRET`                 |            Yes | Same session-signing secret only if the two environments must share cookies; otherwise a distinct Render secret is safer and results in independent sessions |
| `KINGA_PUBLIC_APP_ORIGIN`    |            Yes | Render staging HTTPS origin                                                                                                                                  |
| `KINGA_API_ORIGIN`           |            Yes | Render API HTTPS origin (same value is valid when the service serves both)                                                                                   |
| `KINGA_IDENTITY_MODE`        |            Yes | `oidc` for eventual WorkOS activation; this package does not activate WorkOS                                                                                 |
| `KINGA_OBJECT_STORAGE_MODE`  |            Yes | `s3-compatible`                                                                                                                                              |
| `KINGA_SCHEDULER_AUTH_MODE`  |            Yes | Current declared external scheduler boundary, e.g. `machine-identity`; this does not activate G1 routes                                                      |
| `KINGA_JOB_EXECUTION_MODE`   |            Yes | Current declared job mode, e.g. `queue-worker`                                                                                                               |
| `KINGA_WEBSOCKET_MODE`       |            Yes | Current declared WebSocket mode, e.g. `edge-or-same-server`                                                                                                  |
| `AI_PROVIDER`                |            Yes | Exactly `gemini` or `anthropic`; `forge` is not valid for the external direct claim path                                                                     |
| `GEMINI_API_KEY`             |    Gemini only | Direct Google AI API key                                                                                                                                     |
| `GEMINI_MODEL`               |    Gemini only | Explicit Gemini model identifier approved for the environment                                                                                                |
| `ANTHROPIC_API_KEY`          | Anthropic only | Direct Anthropic API key                                                                                                                                     |
| `ANTHROPIC_MODEL`            | Anthropic only | Explicit Claude model identifier approved for the environment                                                                                                |
| `OBJECT_STORAGE_PROVIDER`    |            Yes | Exactly `s3`                                                                                                                                                 |
| `S3_BUCKET`                  |            Yes | Dedicated evidence/report bucket name                                                                                                                        |
| `S3_REGION`                  |            Yes | Region (or S3-compatible provider’s documented value, e.g. `auto`)                                                                                           |
| `S3_ACCESS_KEY_ID`           |            Yes | Least-privilege object-store access key                                                                                                                      |
| `S3_SECRET_ACCESS_KEY`       |            Yes | Matching least-privilege object-store secret                                                                                                                 |
| `S3_ENDPOINT`                |    Conditional | Credential-free HTTPS endpoint for R2/MinIO/other S3-compatible providers; omit for AWS S3                                                                   |
| `S3_FORCE_PATH_STYLE`        |    Conditional | `true` only when required by the selected compatible provider                                                                                                |
| `DIRECT_MEDIA_ALLOWED_HOSTS` |            Yes | Comma-separated **exact** object-storage hostnames from which the application may fetch media; no protocol, path, wildcard, or private hostname              |
| `DIRECT_MEDIA_MAX_BYTES`     |       Optional | Integer `1`–`52428800`; default is `52428800` (50 MiB)                                                                                                       |

`BUILT_IN_FORGE_API_URL` and `BUILT_IN_FORGE_API_KEY` must **not** be treated as AI or storage dependencies in this mode. They may remain present only for the explicitly deferred owner-notification channel; direct LLM and direct storage code does not read them.

## Credential and bucket posture

Use a new, Render-specific object-store principal limited to the designated bucket and only the object actions needed by the application. Do not reuse a Manus-issued credential. Configure private objects, not public bucket read access: the application generates short-lived presigned GET URLs for authorized consumption. `DIRECT_MEDIA_ALLOWED_HOSTS` should name only the S3/R2 host that serves those URLs.

The external `readyz` contract performs configuration-only validation and intentionally returns only missing or invalid **variable names**, never values. It is not proof of database reachability, S3 permissions, provider quota, PDF rendering, WorkOS behavior, scheduler safety, or tenant isolation.

## Explicit non-goals and accepted tradeoffs

This package does not create a Render service, issue cloud credentials, configure a domain, migrate a WorkOS callback, change scheduler ownership, retire Manus, or perform a live staging write. It does not move owner notifications, Manus identity, or scheduler control off Forge/Manus. It also does not replace the managed Forge adapter globally: managed mode remains unchanged while external mode has a separate direct-provider branch. This is an accepted short-term implementation drift tradeoff and must be revisited before a broader platform consolidation.

## Validation plan before any activation

1. Run `readyz` with the complete non-secret Render declaration and confirm configuration readiness without secret disclosure.
2. Use a disposable direct object-store prefix to prove a private upload, a bounded presigned retrieval URL, and clean prefix removal.
3. Submit a non-production document through the Render endpoint, confirm direct provider request telemetry from Google or Anthropic, and confirm no Forge AI/storage request occurred.
4. Confirm the resulting report uses the image’s installed Chromium and is stored in the direct bucket.
5. Exercise negative controls: unallowlisted media host, redirecting URL, missing direct provider key, and missing S3 credential must fail closed without a Forge fallback.
6. Perform the existing tenant-isolation and WorkOS activation preflight separately; neither is implied by this package.

## Source validation evidence

On 20 September 2026, focused isolated validation passed **31 tests in 7 files** for direct provider mapping, runtime selection, readiness parity, direct S3 configuration, storage test isolation, media-host syntax, and mocked DNS/pinned-HTTPS/redirect/streaming-cap enforcement. The full guarded `kinga_ci_test` suite then passed **594 test files / 9,643 tests**, with **1 skipped file / 4 skipped tests** and no failures. The production build completed successfully. The repository’s typecheck-baseline comparison reported **0 new diagnostics** (1 resolved inherited diagnostic relative to the recorded baseline).

Independent AppSec review initially identified runtime-selector, SSRF streaming/DNS, readiness-parity, and reserved IPv6 gaps. The final re-review approved the corrected implementation after evidence covering private IPv4/IPv6, multicast, IPv4-embedded IPv6, NAT64 local-use, discard-only, and IETF special-purpose IPv6 examples. The local sandbox does not have Docker installed, so container-image execution was not performed here; the Dockerfile change is source-verified and the image must be built by the selected Render build path before activation.
