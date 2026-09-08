# KINGA External Staging Foundation

> **Status:** Review-only preparation. This document and its associated code add no cloud account, database, DNS, credential, provider, storage, data-transfer, or production-traffic change. They create a safe preparation boundary for the external-production sprint plan.

## 1. Scope and intent

KINGA’s external production migration begins with a staging foundation, not a production cutover. This package makes the minimum runtime declarations and probe semantics explicit, records the platform-coupled boundaries still requiring replacement, and adds a small CI contract that can run without a database or external credentials.

The package preserves the current managed implementation. It does **not** switch authentication, storage, scheduled jobs, reports, pipeline execution, WebSockets, provider calls, frontend hosting, or data access to an external system.

## 2. What this package adds

| Asset | Purpose | What it does not prove |
|---|---|---|
| `server/_core/runtime-readiness.ts` | Names the required non-secret external runtime declarations and returns only configuration status. | TiDB connectivity, identity validity, provider activation, tenant isolation, object authority, storage access, worker operation, or production readiness. |
| `GET /healthz` | Liveness probe showing that the API process can answer a request and identify its release version. | Database health, authentication health, or business-function health. |
| `GET /readyz` | Readiness probe for the declared runtime configuration; returns HTTP 503 when required declaration names are missing or malformed. | Any live external-service integration or security acceptance gate. |
| `server/_core/runtime-listen.ts` | Keeps local managed fallback-port behaviour but requires an external host to bind exactly the assigned `PORT`. | WebSocket ingress configuration or a complete hosting integration. |
| `.github/workflows/external-staging-readiness.yml` | Runs conflict, runtime-contract and server-bundle checks without credentials or deployment. | Full-suite correctness, database integration, external cloud deploy, or staging acceptance. |

The `readyz` response contains configuration names and status only. It is intentionally marked `verificationScope: "configuration-only"`; it must never be used as a tenant-security or data-integrity acceptance result.

## 3. Runtime declaration contract

The existing managed runtime remains the default when `KINGA_RUNTIME_MODE` is absent or `managed`.

| Mode | Required declaration names | Purpose |
|---|---|---|
| `managed` | `DATABASE_URL`, `JWT_SECRET` | Maintains the current application bootstrap expectation. |
| `external` | `DATABASE_URL`, `JWT_SECRET`, `KINGA_PUBLIC_APP_ORIGIN`, `KINGA_API_ORIGIN`, `KINGA_IDENTITY_MODE`, `KINGA_OBJECT_STORAGE_MODE`, `KINGA_SCHEDULER_AUTH_MODE`, `KINGA_JOB_EXECUTION_MODE`, `KINGA_WEBSOCKET_MODE` | Forces the external staging design to name its required boundaries before a platform claims configuration readiness. |

Values are never returned by the API. For an external production-labelled process, the public app and API origin declarations must use HTTPS. The contract accepts HTTP only for explicitly non-production development/staging execution.

The following are **decision declarations**, not implemented external adapters:

| Declaration | Required decision before activation |
|---|---|
| `KINGA_IDENTITY_MODE` | Company-owned OIDC integration or explicitly approved owned-session service. |
| `KINGA_OBJECT_STORAGE_MODE` | Owned object storage provider and protected object-access model. |
| `KINGA_SCHEDULER_AUTH_MODE` | Dedicated machine identity with authenticated scheduled invocation; never an end-user session. |
| `KINGA_JOB_EXECUTION_MODE` | Durable queue/worker or an explicitly bounded alternative for pipeline, replay, report, and recovery work. |
| `KINGA_WEBSOCKET_MODE` | Same-server upgrade support, edge WebSocket service, or an approved replacement; never an unreviewed fixed secondary port. |

## 4. Current boundary inventory

| Boundary | Current implementation evidence | Externalisation requirement | Status in this package |
|---|---|---|---|
| Identity/session | `server/_core/sdk.ts`, `server/_core/oauth.ts`, `server/_core/context.ts` use managed OAuth and signed session cookies. | Replace via approved identity adapter while retaining deleted/deactivated-user fail-closed checks and DB-derived tenant context. | **Deferred to Sprint 3.** |
| Storage | `server/storage.ts` uses the managed Forge storage proxy. | Implement company-owned object storage adapter, scoped access, retention and rollback plan. | **Deferred to Sprint 2/4.** |
| Scheduled routes | `server/_core/index.ts` authenticates managed Heartbeat cron identities. | Replace with a dedicated external scheduler machine identity and narrow endpoint authorisation. | **Deferred to Sprint 4.** |
| Reports | `server/reporting/reportQueue.ts` inserts a durable DB row but starts processing through `setImmediate`. | Extract execution to a durable worker with job correlation, retry/idempotency and dead-letter policy. | **Deferred to Sprint 4.** |
| Pipeline/replay and other deferred work | Pipeline, reanalysis and upload paths include in-process deferred work. | Classify every long-running path and move unsafe request-bound work to the chosen worker model. | **Deferred to Sprint 4.** |
| WebSocket service | `server/_core/index.ts` starts `server/websocket.ts` on fixed port `8080`; the current implementation includes demo broadcast behaviour. | Choose and implement a production ingress/broadcast model before external traffic is accepted. | **Deferred; hard external staging decision.** |
| Frontend bundling | `vite.config.ts` includes `vite-plugin-manus-runtime` and development-only debug collection. | Audit and remove/replace provider-specific client behaviour only after the external identity/API-origin model is selected. | **Deferred to Sprint 1/3.** |
| Container | Root `Dockerfile` already builds the server and client, keeps `node_modules`, and installs `poppler-utils` used by the PDF image-rendering health check. | Validate on the chosen external host with exact resource limits; add packages only when a real runtime caller requires them. | **Retained; no speculative Docker change.** |

## 5. Staging deployment sequence

The first staging deployment must use an empty or approved non-production database target and non-production provider endpoints only. It must not point to production data, channels, storage objects or user sessions.

1. Select the company-owned cloud, identity, storage, scheduler, job-worker and WebSocket approach under Sprint 0 governance.
2. Create separate staging access, secret and alert paths; prove that staging cannot access production by default.
3. Build the exact reviewed commit in CI. Run the focused runtime workflow and the repository’s wider agreed validation baseline.
4. Supply the selected non-secret configuration declarations through the chosen external secret/configuration system. Do not use a checked-in `.env` file.
5. Verify `/healthz` answers and `/readyz` is configuration-ready. Record that this is configuration evidence only.
6. Execute the staging authority, claims, pipeline, report/export, storage, job/retry, provider-failure and rollback acceptance suites from `KINGA_EXTERNAL_PRODUCTION_SPRINT_PLAN.md`.

## 6. Explicit stop conditions

Do not activate external traffic or mark a staging deployment accepted when any of the following is true:

| Stop condition | Required response |
|---|---|
| Identity path re-provisions a missing or deleted user, trusts a client tenant value, or lets a tenantless user reach tenant data. | Stop security work and restore fail-closed behaviour before further deployment. |
| Storage/object access lacks a tenant and object-owner boundary. | Do not migrate or upload artefacts through the new path. |
| A report, pipeline, replay, notification or scheduler retry can duplicate a visible side effect. | Move the operation to a durable idempotent job design before enabling it. |
| External deployment uses a port other than the host-assigned `PORT`. | Stop deployment; correct binding/proxy configuration. |
| `readyz` is green but there is no tenant-A/tenant-B, data, provider and rollback evidence. | Treat it as configuration-only; do not promote. |
| Any production secret, production data, or provider recipient appears in staging. | Stop and rotate/isolate according to the incident process. |

## 7. Verification performed by this package

The runtime readiness contract has focused unit coverage for managed defaults, missing external declarations, complete non-production external declarations, production HTTPS enforcement, invalid runtime modes, and exact external port binding. These tests verify only the contract’s behaviour.

The companion workflow runs the conflict-marker check, those focused tests and the server bundle. It deliberately does not run a cloud deploy, TiDB migration, external identity flow, provider call, storage operation or database-backed acceptance suite.

## 8. Next approved engineering boundary

The next implementation task must be selected from the sprint plan after owners choose the external cloud, identity and data model. The recommended next package is either:

| Option | Outcome | Needs prior decision |
|---|---|---|
| External identity design spike | A reviewed identity adapter shape, domain/cookie model, user migration mapping and adversarial test matrix. | OIDC provider versus owned identity service. |
| TiDB staging reconciliation package | Metadata-only schema comparison, staging connection/runbook and restore rehearsal design. | Company-owned TiDB Cloud organisation/project and approved staging access. |
| Durable-job architecture package | Detailed report/pipeline/replay/scheduler execution classification and worker contract, without migration of live jobs. | Queue/worker/scheduler provider and failure-recovery policy. |

No external production implementation should begin merely because this document or `readyz` exists.
