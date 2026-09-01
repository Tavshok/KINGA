# KINGA External Production Migration Plan

> **Status:** Planning only. This document defines the engineering work required to run KINGA’s production frontend and server outside Manus, with an externally owned TiDB Cloud data layer. It does **not** authorise database migration, secret rotation, DNS changes, production deployment, data copying, provider activation, or an application cutover.

## 1. Purpose and decision boundary

KINGA can be operated with its browser client, Node/Express+tRPC server, database, identity, storage, provider adapters, observability, and asynchronous work owned outside Manus. This is feasible, but it is a **production-platform migration**, not a simple frontend publish. The safe objective is to achieve an externally owned staging environment that reproduces the implemented application contracts before any production traffic or production data is moved.

The current codebase is a React/Vite client and TypeScript Express/tRPC service using Drizzle with a MySQL-compatible database. It also contains managed identity/context infrastructure, managed provider and storage helpers, scheduled routes, pipeline/replay/report paths, and third-party configuration hooks. The primary sources are `server/_core/index.ts`, `server/_core/context.ts`, `server/routers.ts`, `client/src/App.tsx`, `drizzle/schema.ts`, `server/db.ts`, `server/pipeline-v2/`, `server/reporting/`, and `server/storage.ts`.

> **Migration rule:** no environment may be treated as production-ready because the application starts. Production readiness requires a non-production proof of tenant isolation, claim lifecycle integrity, pipeline/report parity, controlled failure handling, observability, backup/restore, and rollback.

## 2. Goals, non-goals, and confirmed constraints

| Category | Required outcome | Explicitly not included in this plan |
|---|---|---|
| Application ownership | A company-controlled source repository, CI/CD path, hosting account, domain, secrets store, storage, database, logs, and monitoring path. | A change to business workflows, pricing, payment/settlement logic, or report policy. |
| Production topology | Frontend and server run on external infrastructure; TiDB Cloud holds the externally owned production database. | A direct production cutover before staging acceptance gates pass. |
| Security | Identity, sessions, tenant authority, object authority, audit and provider access remain fail-closed. | Using client-provided tenant IDs, bypass sessions, or weakening guards to ease migration. |
| Data | Schema and existing data are reconciled, backed up, migrated deliberately, and checked before any connection switch. | Unapproved DDL, ad-hoc schema fixes, destructive cleanup, or unlogged production-data manipulation. |
| Operations | Jobs, reports, retries, provider calls, dashboards and alerts have explicit owners. | Assuming an imported platform helper remains externally available. |

## 3. Current implementation evidence and migration impact

The table below is an implementation-facing inventory. “Present in code” means the repository has a code or configuration reference; it does not prove that an account, key, channel, or production service is active.

| Current concern | Evidence location | Migration impact | Required external replacement or proof |
|---|---|---|---|
| Client build and routes | `client/src/App.tsx`, `client/src/lib/trpc.ts`, Vite configuration | Static client deployable separately from server, subject to origin/cookie/API routing decisions. | External frontend build/CDN, custom domain, environment-specific API origin, route fallback and error monitoring. |
| HTTP server and tRPC | `server/_core/index.ts`, `server/routers.ts`, `server/_core/trpc.ts` | Conventional Node service, but request limits, proxy trust, rate limiting and route order must be preserved. | Container or managed Node runtime, health checks, HTTPS/proxy configuration, route smoke tests. |
| Session/context identity | `server/_core/context.ts`, `server/_core/oauth.ts`, `OAUTH_SERVER_URL`, `VITE_APP_ID`, `JWT_SECRET` references | Managed OAuth/session assumptions cannot be copied as deployment variables alone. | Company-owned identity provider or an owned compatible session/OAuth implementation, key rotation and logout/revocation design. |
| Database access | `drizzle/schema.ts`, `server/db.ts`, `DATABASE_URL` | TiDB Cloud is MySQL-compatible, but source-schema/live-schema drift and migration ownership are known risks. | Separate staging and production TiDB Cloud environments, approved migration process, backup/restore test and least-privilege accounts. |
| Document/report storage | `server/storage.ts`, document and reporting paths | Managed storage helpers must be replaced with a company-owned object store and access model. | S3-compatible storage, encrypted buckets, key naming/metadata rules, signed access or equivalent, retention/deletion policy. |
| AI/provider access | `server/_core/llm.ts`, pipeline callers, Forge environment references | Provider configuration and structured-output/error behaviour may be platform-dependent. | Direct vendor/API credentials or company-owned gateway, request validation, spend/rate controls, timeout/retry policy and audit boundary. |
| WhatsApp/email/observability | `TWILIO_*`, `SENDGRID_API_KEY`, `SENTRY_DSN`, `CLICKHOUSE_PASSWORD`, notification and WhatsApp modules | Keys and callbacks must be company-owned; provider configuration is not proven by source references. | Per-environment provider projects, webhook verification, delivery/error monitoring, privacy review and secret management. |
| Scheduled/recovery routes | `server/_core/index.ts` contains recovery-deadline and keep-warm route handling | Current comments reference a managed scheduled task and a scheduled session cookie. | External scheduler with a dedicated machine identity, HMAC/mTLS or equivalent authentication, idempotency and audit. |
| Pipeline/replay/report workloads | `server/pipeline-v2/`, `server/reporting/reportQueue.ts`, replay/reanalysis routers/services | These may exceed interactive request limits or need retries/observability. | Background worker/queue pattern, dead-letter/error handling, retry policy, job correlation IDs and dashboard. |

## 4. Reference target architecture

The final cloud provider selection is a business/engineering decision. The following is provider-neutral and is the required **capability architecture**, not a mandate to use any particular vendor.

```text
Users
  │ HTTPS
  ▼
External DNS + TLS + CDN/WAF
  ├── Browser application (Vite build, company-controlled static hosting)
  └── API hostname
        │ HTTPS
        ▼
    Node/Express + tRPC service (stateless containers)
        ├── Company-owned Identity Provider / session verification
        ├── TiDB Cloud: staging or production cluster
        ├── Object storage: documents, report artefacts, metadata references
        ├── Provider adapter layer: AI, WhatsApp, email, weather, observability
        ├── Queue / worker service: pipeline, replay, report, recovery jobs
        └── Audit/log/metric/trace platform

External scheduler ── authenticated command ──► worker or job endpoint
CI/CD ── deploy promotion + migration gate ──► staging then production
```

### 4.1 Design rules

1. **Keep the browser client untrusted.** Role/portal hiding remains presentation; every API and side effect must derive tenant/role from server-held identity.
2. **Make the API stateless.** Persistent work belongs in TiDB/object storage/queue records, never in a process-local timer, cache, or session assumption.
3. **Separate interactive and long-running work.** The request that accepts a document or starts a replay should return a durable job/reference; a worker performs time-consuming execution where the current code path requires it.
4. **Use environment isolation.** Staging and production must have separate database credentials, buckets, provider projects/channels where possible, encryption keys, domains and monitoring alert routes.
5. **Treat every integration as replaceable.** Application code should call an owned adapter with clear configuration, error classification, timeout/retry and audit semantics.

## 5. Delivery workstreams

The estimates below are planning bands for focused engineering work. They assume engineers who can work in the current TypeScript/React/Drizzle stack and do not include unrelated product feature development. The work is deliberately sequenced because later items cannot be validated safely without earlier foundations.

| ID | Workstream | Principal deliverables | Dependencies | Difficulty | Planning band |
|---|---|---|---|---:|---:|
| W0 | Ownership and environment foundation | Cloud accounts, access model, two environments, naming, DNS inventory, secret-management design, incident owners. | Business owner decisions. | Medium | 2–4 engineer-days |
| W1 | Build and deployment baseline | Reproducible client/server builds, container or managed-runtime definition, CI pipeline, artefact registry, deployment promotion and rollback. | W0. | Medium | 3–6 days |
| W2 | TiDB Cloud and data reconciliation | Staging/prod clusters, separate service accounts, schema inventory, migration baseline, backup/restore rehearsal, data-move plan. | W0; existing schema-drift records. | Medium–high | 4–8 days |
| W3 | Identity and session externalisation | Owned identity provider/session verification, user lifecycle, tenant/role mapping, logout, revocation, deletion and key rotation tests. | W0, W1. | High | 5–10 days |
| W4 | Storage and artefact externalisation | Object storage adapter, document/report access control, metadata, signed-access rules, migration/retention/deletion implementation. | W0, W1, W3. | Medium–high | 3–7 days |
| W5 | Provider adapter externalisation | AI, email, WhatsApp, weather and observability configuration; owned secrets; webhook/retry/error policy. | W0, W1, W3, W4 as applicable. | High | 5–12 days |
| W6 | Jobs, queue and scheduler | Pipeline/replay/report/recovery execution model, worker, scheduler identity, idempotency/retry/dead-letter observability. | W1–W5. | High | 5–10 days |
| W7 | Staging verification and operational readiness | Tenant-A/B suites, report parity, pipeline failure drills, alerting, dashboards, runbooks, load/timeout checks, recovery rehearsal. | W1–W6. | High | 5–10 days |
| W8 | Controlled production cutover | Final backup, production environment parity check, phased traffic move, rollback window, intensive monitoring, reconciliation. | W0–W7 and explicit approval. | High | 2–5 days |

The aggregate planning range is **29–62 focused engineer-days**. It is not a delivery promise. It will reduce if some managed dependencies are deliberately retained temporarily, and it will increase if the live schema/data or provider account state differs materially from the repository evidence.

## 6. Workstream detail and exit criteria

### W0 — Ownership and environment foundation

Establish named owners for cloud administration, application deployment, data stewardship, identity, provider accounts, security review and incident response. Create separate externally owned staging and production accounts/projects where the chosen providers permit it. Define required DNS names, service names, secret ownership and least-privilege access groups before creating credentials.

**Exit criteria:** no production secret is held only in a developer workstation or a platform-specific panel; each operational responsibility has a named owner and recovery contact; staging cannot accidentally use production credentials or provider recipients.

### W1 — Build, runtime and release baseline

Build the React client and Express server from the same Git commit in CI. Package the server in a reproducible Node runtime; retain Node version, `pnpm` lockfile, build commands and required runtime configuration. Preserve the server’s explicit proxy trust, body-size route overrides, rate limiting, security headers, tRPC registration order and health endpoints from `server/_core/index.ts`.

**Exit criteria:** a clean CI runner can build the client and server, deploy staging, confirm health/readiness, serve a browser route refresh correctly, roll back to the prior artefact, and emit structured logs correlated to a deployment version.

### W2 — TiDB Cloud and data reconciliation

Create separate **staging** and **production** TiDB Cloud targets. Use distinct least-privilege application users and a separate migration identity. Before applying anything, compare `drizzle/schema.ts`, checked-in migration history, and database metadata. Classify every difference as source-schema-behind, database-behind, intentional compatibility, or human decision—not as an automatic migration candidate.

The existing database-drift and ownership documentation is a starting point, not permission to issue DDL. Build a restore rehearsal using non-production data or a controlled anonymised copy where approved. Record row counts/checksums or equivalent reconciliation measures for agreed tables. Confirm connection TLS settings, certificates, network policy, secret rotation, backups, retention and access logs.

**Exit criteria:** staging schema matches an approved baseline; migrations are repeatable and reversible where practical; the restore rehearsal passes; the application passes tenant-isolation and core workflow tests against staging; production is untouched until a separate cutover approval.

### W3 — Identity, session and account lifecycle

The most safety-sensitive migration is replacing the current managed OAuth/session/context route. Preserve the current security principles: no user row must be silently re-provisioned when an authenticated identity has been deleted; a tenantless session must fail closed on tenant procedures; `ctx.user` derives from server verification; and client-supplied tenant values never establish authority.

Choose one of two implementation directions before coding:

| Direction | Description | Trade-off |
|---|---|---|
| External OIDC identity provider | Use a company-owned provider and server-side token/session verification. | Lower protocol maintenance; requires tenant/role/user-lifecycle mapping and provider administration. |
| Company-owned authentication service | Build/operate OAuth/session lifecycle directly. | Maximum control; materially more security and operational work. |

**Exit criteria:** login, logout, expiry, refresh/re-authentication, hard-deleted user, disabled user, role change, tenantless user, cross-tenant attempt and session revocation tests pass in staging. Session cookies, CORS, CSRF, same-site policy and HTTPS settings are reviewed for the chosen frontend/API domain arrangement.

### W4 — Document and report artefact storage

Introduce an owned storage interface before replacing `server/storage.ts` callers. Every object must have an opaque key, content type, size, claim/tenant/owner metadata, lifecycle state, and access rule. Do not place object bytes in the database. Document upload, image extraction, report export, pre-signed download, deletion and failed-upload cleanup need explicit test cases.

**Exit criteria:** a tenant cannot enumerate or fetch another tenant’s object; failed upload does not leave an authorised-looking record; report/download links have bounded access; storage deletion and retention rules are documented; and a rollback from the new path does not destroy original artefacts.

### W5 — AI, communications and observability adapters

The code references managed Forge/LLM variables plus direct configuration hooks for Twilio WhatsApp, SendGrid, Sentry, ClickHouse and weather. Each external call requires an owned adapter contract: validated input, tenant/object authority before any call, explicit timeout, retry/idempotency decision, safe error classification, output validation/provenance, audit handling, and secret ownership.

For managed connector credentials, do not assume a platform-issued token can become a sustainable production credential. Obtain company-owned vendor accounts/API keys or implement an approved owned OAuth flow. Webhook usage must be confirmed against the selected provider’s current documentation during implementation, and verified with signature validation and replay protection.

**Exit criteria:** no provider key is embedded in source; staging uses non-production recipients/channels; outbound messaging is idempotent and preference-aware; provider outages are observable and do not fabricate claim/report results; and provider actions are impossible after a failed authority check.

### W6 — Pipeline, report, replay and scheduler architecture

The repository contains pipeline execution, reanalysis/replay, report queue/generation and scheduled recovery paths. The target design must classify each operation as synchronous (bounded request), asynchronous job, scheduled job or provider callback. Do not recreate a managed scheduled session cookie externally. A scheduled task must use a dedicated non-human machine identity and verify its authority independently of end-user sessions.

Every job record should capture a durable job ID, request/claim/tenant correlation, initiating actor, input version, attempt count, state, timestamps, failure class, output reference and retry/dead-letter outcome. The implementation must ensure that a retry cannot silently duplicate claim decisions, reports, notifications, artefacts or externally visible side effects.

**Exit criteria:** the worker can be restarted without losing or duplicating a job; each critical job has an idempotency rule; scheduled recovery can be executed once and observed; failed jobs are visible and retriable under controlled authority; and long work is not dependent on an HTTP request remaining open.

### W7 — Staging verification and operational readiness

This phase validates the external platform using non-production data and accounts. It must include the authentication/tenancy cases already treated as high risk in KINGA, claim/inspection/document boundary cases, pipeline failure/degradation states, replay paths, report shared-value parity, forensic approval-stage semantics, export authority, notification no-side-effect-on-denial, and data cleanup/retention operations.

Run builds from a clean CI worker, record exact test identifiers rather than generic “green” claims, and distinguish inherited/variable test failures from newly introduced ones. Add platform tests for DNS/TLS, CORS/cookies, unavailable TiDB/provider/storage, queue backlog, job retry, deployment rollback, metrics/log tracing and backup restore.

**Exit criteria:** all critical acceptance cases pass in staging, any non-critical exception has an owner and time-bounded disposition, security sign-off is recorded, operational runbooks are practised, and production cutover has explicit written approval.

### W8 — Controlled production cutover and rollback

Take a verified final backup and record the artefact/image/configuration versions before traffic moves. Freeze migrations and high-risk feature changes for the agreed window. Move the frontend/API endpoint in reversible steps, monitor authentication, tenant-denial rates, error ratios, pipeline/job queue depth, report/export output, provider delivery and database saturation. Reconcile selected business-critical counts and audit events after the move.

**Exit criteria:** the agreed monitoring window completes without a stop condition; reconciliation matches the approved tolerance; scheduled and worker jobs run under their external identities; post-cutover backup completes; and the old route is retired only after formal confirmation.

## 7. Acceptance gates and stop conditions

| Gate | Required evidence | Stop / do not advance when |
|---|---|---|
| G0: Architecture decision | Chosen frontend/API/worker/identity/storage/observability/secret architecture and named owners. | Any component has no owner, no recovery path, or no credential-management plan. |
| G1: Staging foundation | Isolated staging domains, secrets, TiDB cluster/account and least-privilege roles. | Staging can reach production data, recipients or credentials without deliberate controls. |
| G2: Build/deploy proof | Reproducible CI build, deployment, health check, rollback and deployment version. | Build differs by workstation or rollback is untested. |
| G3: Data proof | Approved schema inventory, migration plan, TLS/network proof, backup/restore rehearsal. | A drift item needs a product/data decision or data migration has no reconciliation/rollback. |
| G4: Identity/tenancy proof | Real staging tests for deleted, disabled, tenantless, same-tenant, foreign-tenant and spoofed-input cases. | Any procedure can substitute/derive tenant from client input or cause a side effect after denial. |
| G5: Integration/job proof | Provider adapters, storage, worker/scheduler and failure paths verified. | Retries can duplicate state/external effects or jobs rely on transient web sessions. |
| G6: Functional parity | Claim, evidence, pipeline, report, export, notification and role workflow tests against staging. | Shared reports disagree, incomplete data is presented as complete, or pipeline failure is silently normalised. |
| G7: Production readiness | Approved cutover/rollback plan, incident coverage, monitoring, final backup and change freeze. | Critical monitoring, restore, rollback or escalation paths are untested. |

## 8. Security and data-protection controls

The migration must preserve KINGA’s core authority trace:

```text
verified session → server-held user/tenant/role → domain/procedure guard
  → target object / parent claim tenant predicate → query or side effect
```

| Control | External-platform implementation requirement |
|---|---|
| Tenant authority | Resolve tenant from the verified server session/token; do not accept a client value as authority. |
| Object authority | Bind claim/document/inspection/report/notification access to the target’s tenant and parent relationship before reading, mutating or exporting. |
| Secret protection | Central secret manager, least-privilege workload identity, rotation record, no secrets in source/image/browser build/logs. |
| Network protection | TLS to client and TiDB; provider egress restrictions/allowlists where useful; separate staging/prod policy. |
| File protection | Private object storage by default, scoped signed access, metadata-based ownership checks, malware/content policy decision. |
| Audit protection | Preserve actor, tenant, target, action, reason, time and result; restrict audit export by server authority. |
| AI/provenance | Capture source/prompt-policy/version/output validation/error state as approved; do not call an AI result a human decision. |
| Incident response | Central logs/alerts, access to recovery runbooks, escalation owner and evidence-preservation process. |

## 9. Cutover checklist

### Before any production connection or DNS change

- [ ] The selected providers and ownership model are approved.
- [ ] Staging has passed G0–G6 with recorded evidence.
- [ ] TiDB production schema/data migration and reconciliation plan have separate approval.
- [ ] Full production backup and restore instructions are tested or explicitly deferred with accepted risk.
- [ ] All production secrets are present only in the approved secret-management service.
- [ ] Authentication, tenant/role mapping and user-lifecycle migration have been rehearsed with non-production accounts.
- [ ] Object storage and provider sender/channel production configuration are verified and scoped.
- [ ] CI artifact digest, configuration version and rollback target are recorded.
- [ ] A change window, responsible engineer, business owner, security contact and stop/rollback decision authority are named.

### During the cutover window

- [ ] Stop nonessential releases and schema changes.
- [ ] Deploy the previously verified production artefact/configuration only.
- [ ] Verify health, TLS, login, tenant isolation, claim retrieval, upload, pipeline trigger, report generation and export with approved smoke fixtures.
- [ ] Monitor application errors, denied-authority patterns, database connections/errors, worker backlog, provider failures and audit write failures.
- [ ] Keep the rollback route executable until the agreed observation window expires.

### After cutover

- [ ] Reconcile approved counts/critical records and selected report values.
- [ ] Confirm scheduled/recovery work and asynchronous workers execute with external machine identities.
- [ ] Review alerts and provider delivery failures.
- [ ] Take and verify a post-cutover backup.
- [ ] Hold a short operational review and record defects, exceptions and owners.

## 10. Risk register

| Risk | Why it matters | Control / decision |
|---|---|---|
| Schema drift is migrated blindly | The source schema and live database may not be identical; unreviewed DDL can lose or reinterpret data. | Metadata-only classification, approved baseline, staging rehearsal, explicit migration/change approval. |
| Managed identity is replaced incompletely | Can create deleted-user resurrection, weak session handling or cross-tenant authority. | Dedicated identity workstream and adversarial tenant/user lifecycle tests. |
| Long-running pipeline work stays in HTTP requests | Leads to timeouts, duplicate retries, lost work and weak observability. | Durable job/worker architecture with idempotency and correlation records. |
| Provider credentials are copied from a managed environment | Tokens may be non-portable, expiring or overly broad. | Company-owned credentials/accounts or owned OAuth; central secret management. |
| Storage moves without ownership metadata | Documents/reports can be exposed across tenants or become unrecoverable. | Private object storage, scoped access, metadata and retention/delete validation. |
| Reports silently change source/rounding/availability behaviour | Can create contradictory or fabricated-looking outputs. | Canonical resolver/model parity tests and explicit unavailable/degraded rendering. |
| Production cutover lacks rollback | An auth/data/provider problem becomes a prolonged outage. | Prebuilt rollback target, change freeze, monitoring, ownership and decision authority. |

## 11. Decisions required before engineering begins

| Decision | Owner | Why it cannot be assumed |
|---|---|---|
| Preferred external cloud and regions | Business/platform owner | Affects data residency, contracts, network, operational skills, budget and support model. |
| Frontend/API/worker hosting model | Platform/application owner | Determines runtime limits, deployment model, networking and background-job implementation. |
| Identity provider and user migration approach | Business/security/application owner | Determines login, account lifecycle, existing user mapping, session mechanics and legal/privacy obligations. |
| TiDB Cloud organisation, project, staging/prod separation and account ownership | Data/business owner | Must be company-controlled; current live environment ownership/configuration is not proven by source alone. |
| Object storage, retention and download-access policy | Business/security/data owner | Claims evidence and reports need an explicit privacy, retention and legal-hold position. |
| Provider account ownership and outbound communication policy | Business/operations/security owner | WhatsApp/email/AI channels have recipient, cost, consent, audit and incident consequences. |
| Data migration/cutover window and rollback tolerance | Business/data owner | A technical team cannot decide acceptable downtime, reconciliation tolerance or loss window unilaterally. |

## 12. Recommended first engineering package

The first executable package should be **external staging foundation only**, not production migration. It should include W0, W1 and the non-destructive setup part of W2: external accounts, CI build, deployable client/server artefacts, empty staging TiDB/secret/storage/observability foundations, and a metadata-only schema comparison. It should not connect production data, switch DNS, invoke live outbound messaging, or apply schema changes without a separately approved migration plan.

That package produces the information needed to refine estimates for W3–W8 with evidence rather than assumption.

## 13. Source traceability

| Migration topic | Current KINGA implementation references |
|---|---|
| Runtime/server and scheduled routes | `server/_core/index.ts` |
| Session/context/procedure boundaries | `server/_core/context.ts`, `server/_core/oauth.ts`, `server/_core/trpc.ts`, `server/_core/domain-middleware.ts` |
| Browser routing/typed transport | `client/src/App.tsx`, `client/src/lib/trpc.ts` |
| Database/data access | `drizzle/schema.ts`, `server/db.ts` |
| Claim pipeline | `server/pipeline-v2/orchestrator.ts`, `server/pipeline-v2/` |
| Reports and forensic contract | `server/reporting/`, `server/reporting/forensicReportModel.ts` |
| Storage, notifications, provider activity | `server/storage.ts`, `server/notifications.ts`, `server/whatsapp/`, `server/_core/llm.ts` |
| Current safety and operational guides | `KINGA_ENGINEERING_SYSTEM_MANUAL.md`, `KINGA_SECURITY_MANUAL.md`, `KINGA_DATABASE_MANUAL.md`, `KINGA_DEPLOYMENT_OPERATIONS.md`, `KINGA_INTEGRATIONS.md`, `KINGA_KNOWN_LIMITATIONS.md` |

## 14. Planning status

This plan is ready to guide a design/ownership workshop. It is intentionally **not** a runbook to change production. The first next action is to choose the target hosting and identity ownership model, nominate environment owners, and approve a staging-foundation work package. Only then should an implementation branch or infrastructure repository be created.
