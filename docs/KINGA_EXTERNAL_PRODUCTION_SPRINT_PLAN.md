# KINGA External Production Migration Sprint Plan

> **Status:** Planning only. This sprint plan turns `KINGA_EXTERNAL_PRODUCTION_MIGRATION_PLAN.md` into bounded engineering work. It does not approve, perform, or schedule a production deploy, DNS change, database migration, secret rotation, provider activation, data copy, or production cutover.

## 1. Purpose and working assumptions

This plan prepares KINGA to operate with an externally hosted frontend and server, an externally owned TiDB Cloud database, external object storage, company-controlled identity and provider credentials, and an external worker/scheduler model. The current codebase evidence is a React/Vite browser client, a Node/Express+tRPC server, Drizzle/MySQL-compatible persistence, Pipeline V2, reporting and forensic models, managed identity/context assumptions, storage helpers, provider adapters, and scheduled/recovery paths.

The plan uses **six two-week implementation sprints**, preceded by a short decision/ready period and followed by a controlled cutover window. A two-week sprint is a planning cadence, not a promise about elapsed delivery: a sprint only closes when its exit criteria and evidence are met. Where a dependency or decision is incomplete, the work moves to an explicit blocked state rather than being approximated in code.

> **Operating principle:** staging proof comes before production activity. No sprint is permitted to weaken session-derived tenant authority, object authority, human decision boundaries, auditability, data reconciliation, or fail-closed error handling to make external deployment easier.

## 2. Roles and decision rights

The same person may fill multiple roles in a small team, but each responsibility must be explicitly named before the relevant sprint starts.

| Role | Accountable work | May approve | Must not decide alone |
|---|---|---|---|
| Business sponsor | Priorities, acceptable service window, provider/account ownership, production readiness and go/no-go. | Product scope and production cutover. | Security posture, data migration method or legal retention policy without specialist input. |
| Platform engineer | Cloud foundations, CI/CD, networking, secrets, runtime, worker/scheduler, observability and rollback. | Staging infrastructure readiness. | Business data loss tolerance or report-policy changes. |
| Application engineer | React/Node portability, adapter interfaces, auth integration, domain contracts, tests and release artefacts. | Code-level implementation readiness. | Provider terms, production credentials or data-retention policy. |
| Data engineer / DBA | TiDB Cloud environments, schema inventory, migrations, backups, restore rehearsal and reconciliation. | Staging data readiness. | Unapproved production DDL or live-data manipulation. |
| Security reviewer | Identity/session model, tenant/object authority, secret handling, storage policy, threat review and incident controls. | Security gate evidence. | Product trade-offs that accept a security exception without sponsor approval. |
| Operations owner | Alerts, runbooks, provider delivery monitoring, job recovery and incident response. | Operational-readiness evidence. | Production cutover without business and security approval. |

## 3. Sprint roadmap at a glance

| Period | Sprint objective | Principal output | Entry gate | Exit gate |
|---|---|---|---|---|
| Ready period | Resolve target decisions and ownership | Approved architecture decision record and environment ownership matrix | Sponsor initiates programme | G0 architecture/ownership evidence complete |
| Sprint 1 | Establish externally owned staging foundation | Reproducible client/server build and deploy path | G0 | G1 and G2 staging/build proof |
| Sprint 2 | Reconcile data and establish controlled storage | Staging TiDB baseline and owned storage design | Sprint 1 deploy path | G3 data/storage proof |
| Sprint 3 | Externalise identity and preserve authority | Staging login/session/tenant/object authority proof | Sprint 1; identity decision | G4 security/identity proof |
| Sprint 4 | Externalise provider and asynchronous-work contracts | Adapter boundaries, worker/scheduler design and selected implementations | Sprints 1–3 foundations | G5 integration/job proof |
| Sprint 5 | Prove functional and operational parity in staging | End-to-end acceptance evidence and practiced runbooks | Sprints 1–4 complete | G6 functional parity |
| Sprint 6 | Production-readiness review and controlled cutover rehearsal | Signed readiness pack and executable rollback | G0–G6 | G7 approval; cutover only under separate authority |

The production traffic move is **not a normal sprint task**. It is a separately authorised change window undertaken only after Sprint 6 confirms that all required gates are satisfied.

## 4. Sprint 0 — Decision and readiness period

This short period removes ambiguity that would otherwise turn into rework or unsafe assumptions. It may be completed in a workshop plus written decisions, but no cloud resource needs to be activated until owners have approved the record.

| Backlog item | Owner | Definition of done | Dependencies | Explicit non-goal |
|---|---|---|---|---|
| S0-01: Choose hosting model | Business sponsor + platform engineer | Provider-neutral architecture is accepted, including frontend, API, worker, scheduler, storage, observability and region approach. | None. | Do not create production resources. |
| S0-02: Choose identity direction | Business sponsor + security + application engineer | Decision between external OIDC provider and company-owned identity service; user migration and session-domain model recorded. | S0-01. | Do not rewrite authentication yet. |
| S0-03: Establish company ownership | Business sponsor | Named owners for cloud organisation, TiDB Cloud organisation/project, domain, source repository, object storage, vendor accounts and incident contact. | None. | Do not use a developer personal account as the durable owner. |
| S0-04: Define environments | Platform + data owner | Staging and production purpose, naming, account/project segregation, data policy and access boundaries written. | S0-01, S0-03. | Do not connect staging to production database or recipients. |
| S0-05: Define production policy decisions | Business + security + data owner | Data retention, object download, outgoing messaging, AI-provider, backup/restore and acceptable cutover/rollback tolerances recorded. | S0-03. | Do not infer business/legal policies from existing code. |

**Sprint 0 acceptance gate (G0):** every target component has a named owner, a credential-management plan, a staging/production boundary and an escalation contact. If any choice remains unresolved, downstream work that depends on it stays blocked.

## 5. Sprint 1 — External staging foundation and repeatable delivery

Sprint 1 creates an empty but externally owned staging path. It must reproduce how the existing client and server build before it attempts to replace identity, data, storage or provider behaviour.

| Backlog item | Owner | Engineering tasks | Evidence required |
|---|---|---|---|
| S1-01: Deployment repository and CI baseline | Platform + application | Define lockfile-respecting build, server artefact/container, client artefact, version tagging, environment validation and deployment promotion. | Clean CI run builds the exact Git commit; artefact digest/version is recorded. |
| S1-02: External frontend staging | Application + platform | Deploy Vite client to staging hostname, configure route fallback, content security decisions and environment-specific API URL. | Direct route refresh, error page and static asset checks pass. |
| S1-03: External API staging | Platform + application | Deploy Node/Express+tRPC server with existing route registration, proxy settings, headers, body limits, health/readiness and structured logging. | Health/readiness and a non-sensitive API smoke path pass; no runtime secret appears in logs. |
| S1-04: Secret-management foundation | Platform + security | Create staging secret namespaces, workload access policy, rotation register and local-development policy. | CI/deploy uses secret references, not committed `.env` files; least-privilege review recorded. |
| S1-05: Observability baseline | Platform + operations | Configure release/version correlation, application errors, request metrics, basic uptime and deployment events. | A controlled staging error and deploy can be traced to a version and an owner. |
| S1-06: Rollback proof | Platform | Deploy a controlled prior build to staging and document rollback decision/commands. | Reversal is completed and observable without data destruction. |

**Sprint 1 acceptance gate (G1/G2):** the same commit can build and deploy client/server from a clean CI runner, staging routes are reachable through TLS, health/readiness is meaningful, configuration is externalised, and a rollback is demonstrated. Do not connect production data or production provider recipients in this sprint.

## 6. Sprint 2 — TiDB staging baseline and artefact storage design

Sprint 2 makes the data and artefact layer explicit. Because schema drift and database ownership are known concerns, the first deliverable is a metadata comparison and an approved migration/reconciliation decision—not immediate DDL.

| Backlog item | Owner | Engineering tasks | Evidence required |
|---|---|---|---|
| S2-01: TiDB Cloud staging/prod foundation | Data + platform | Create separate staging and production projects/clusters/accounts as approved; configure TLS/network access and distinct application/migration identities. | Credentials are distinct; staging cannot write production; access matrix is reviewed. |
| S2-02: Schema reconciliation inventory | Data + application | Compare `drizzle/schema.ts`, migrations and database metadata; classify each difference as source-behind, database-behind, compatibility field or human decision. | Signed metadata-only inventory; no unapproved DDL. |
| S2-03: Migration baseline design | Data + application | Define migration ordering, repeatability, rollback/data-policy decisions and a staging-only rehearsal plan. | A written migration plan with dependencies and stop conditions. |
| S2-04: Backup/restore rehearsal | Data + operations | Exercise approved non-production backup and restore method, record duration, access, integrity checks and lessons. | Restore result and reconciliation evidence recorded. |
| S2-05: Object storage interface | Application + platform + security | Define external storage adapter, opaque object key, content metadata, ownership, signing, retention and deletion semantics. | Interface review plus tenant/object access test plan. |
| S2-06: Artefact migration design | Data + application | Identify document/report object references and create a non-destructive transition/rollback design. | No object is copied/deleted without a separately approved execution plan. |

**Sprint 2 acceptance gate (G3):** staging TiDB and staging object storage are controlled and owned; schema differences are classified; backup/restore is rehearsed; no production data/schema has changed; and the storage design proves how tenant ownership will be enforced.

## 7. Sprint 3 — Identity, sessions, tenancy and object authority

This sprint is security-critical. It ports the authentication/context model only when the external identity direction and domain/cookie model are approved. The migration must retain the current fail-closed rules documented in `KINGA_ENGINEERING_SYSTEM_MANUAL.md` and `KINGA_SECURITY_MANUAL.md`.

| Backlog item | Owner | Engineering tasks | Required regression evidence |
|---|---|---|---|
| S3-01: Identity adapter | Application + security | Add an owned server-side identity/session verification boundary. Map external identity to the existing user, tenant and role contract deliberately. | Unauthenticated request denied; valid identity resolves expected user/role/tenant. |
| S3-02: Account lifecycle | Application | Define create/invite, disable, deletion, reactivation, role/tenant change, logout, expiry and revocation behaviour. | Deleted user with still-valid external token is denied and never re-provisioned. |
| S3-03: Cookie/CORS/CSRF design | Security + application + platform | Configure external frontend/API origin model, secure cookie flags, CSRF protection where relevant and proxy behaviour. | Browser-based staging login/logout and cross-origin rejection/allowance tests. |
| S3-04: Tenant authority matrix | Application + security | Exercise tenantless, same-tenant, foreign-tenant and spoofed input cases across high-risk routers. | Session tenant, never supplied input, is authoritative; tenantless routes fail closed. |
| S3-05: Object-authority matrix | Application | Validate claim, inspection, document, quote, report/export and notification target-object checks. | Foreign target access and denied side effects are tested with exact owned fixtures. |
| S3-06: Audit compatibility | Application + operations | Confirm actor/tenant/target/action/reason/time are retained on external identity paths. | Audited staging actions retain the expected identity and tenant context. |

**Sprint 3 acceptance gate (G4):** staging identity has passed deleted, disabled, tenantless, same-tenant, foreign-tenant, spoofed input, logout/revocation and side-effect-after-denial tests. A role check without object/tenant scope is not accepted as proof.

## 8. Sprint 4 — Provider, queue, worker and scheduler externalisation

Sprint 4 separates platform-bound dependencies from application contracts. It should begin with interfaces and controlled staging adapters, not with live outbound traffic.

| Backlog item | Owner | Engineering tasks | Acceptance evidence |
|---|---|---|---|
| S4-01: Integration contract inventory | Application + platform | Inventory current LLM/Forge, WhatsApp, email, weather, Sentry/ClickHouse and notification usage; map each caller, secret, request/output, retry and audit expectation. | Every adapter has a named owner and replacement/retention decision. |
| S4-02: Owned provider adapters | Application | Introduce provider-neutral interfaces with validated input/output, timeout, error classification, retry/idempotency and audit boundary. | Unit/integration tests cover success, timeout, invalid response and provider outage. |
| S4-03: Staging communications | Operations + security + application | Configure non-production sender/channel, webhook signature validation, recipient safeguards, preference/suppression policy and delivery observability. | No production recipient/channel can be reached from staging. |
| S4-04: Job classification | Application + platform | Classify pipeline, replay, report generation, recovery and provider callback work as request, queue job, scheduled job or callback. | Each long-running operation has a documented target execution class. |
| S4-05: Worker/queue implementation | Platform + application | Add durable job state, correlation, attempt/retry, idempotency, failure, dead-letter/recovery and worker health design. | Worker restart does not lose/duplicate test jobs; failures are observable. |
| S4-06: Scheduler identity | Platform + security | Replace managed schedule/session assumptions with a non-human machine identity and authenticated trigger. | A scheduled staging recovery job is authorised, auditable and idempotent. |

**Sprint 4 acceptance gate (G5):** every selected external provider and asynchronous path has an owner, secret management, failure model and staging proof. A retry must not duplicate a report, notification, claim decision, artifact or external message.

## 9. Sprint 5 — End-to-end staging parity and operational rehearsal

Sprint 5 proves the whole external staging platform, not just components in isolation. This sprint must use dedicated non-production tenant fixtures and exact cleanup; it must not use arbitrary production records.

| Acceptance suite | Owner | Required scenarios |
|---|---|---|
| Authentication and tenant isolation | Application + security | Login/logout; deleted/disabled/tenantless users; tenant A/B separation; spoofed input; no denied side effects. |
| Claims and evidence lifecycle | Application + data | Claim create/access, assignment/inspection, document upload/access/delete failure, workflow records and audit evidence. |
| Pipeline/replay resilience | Application + platform | Success, missing input, provider timeout, stage degradation, resume/retry, replay and worker restart. |
| Report and forensic parity | Application | CL/CI/FR shared fields, selected assessment determinism, unavailable-data wording, forensic human approval route and export authority. |
| Notifications and communications | Application + operations | User/tenant scoping, preferences, delivery failure, idempotency, audit and no send after denial. |
| Data/storage recovery | Data + platform | Staging restore, object access boundary, failed upload cleanup, approved retention/delete behaviour. |
| Operations | Platform + operations | Release/rollback, TLS/DNS, error/trace correlation, alert delivery, queue backlog, provider outage and incident runbook rehearsal. |

**Sprint 5 acceptance gate (G6):** the above suites pass with exact results, or each exception has a named owner, risk classification, compensating control and written acceptance. “The application loaded” is insufficient evidence.

## 10. Sprint 6 — Production readiness and cutover rehearsal

Sprint 6 completes readiness; it does not itself change traffic. The team rehearses the exact sequence it would use in a production window, including rollback and communications.

| Backlog item | Owner | Definition of done |
|---|---|---|
| S6-01: Production readiness pack | Platform + application + data + security | Records artefact version, environment differences, secret readiness, provider readiness, data migration/reconciliation steps, monitoring, owners and open risks. |
| S6-02: Cutover rehearsal | Platform + operations | A staged rehearsal follows the proposed runbook, including validation commands, stop points and rollback. |
| S6-03: Data and backup approval | Data + business | Production migration/connection-change plan, reconciliation criteria, backup proof, restore strategy and decision authority are explicitly approved. |
| S6-04: Security review | Security | Identity, cookies/CORS, tenant/object authority, secret access, storage and provider/webhook boundary review completed. |
| S6-05: Business readiness | Business sponsor + operations | Communication plan, service window, support coverage, reporting/claim workflow impact and acceptable rollback window are agreed. |
| S6-06: Go/no-go decision | Named approvers | Written decision against G0–G7. A “no-go” carries no penalty; unresolved gates move to the backlog. |

**Sprint 6 acceptance gate (G7):** production cutover is authorised only if all prior gates have evidence, the rollback is executable, owners are available, monitoring is live, a final backup is verified, and the business sponsor/security/data owners approve the window.

## 11. Backlog sizing, cadence and governance

### 11.1 Estimation convention

Use task sizes rather than calendar promises. A suggested convention is: **S** up to two focused days, **M** three to five days, **L** six to ten days, and **XL** more than ten days or containing an unresolved architectural decision. XL work must be split or converted into a design spike before sprint commitment.

| Sprint health signal | Green | Amber | Red |
|---|---|---|---|
| Scope | All committed items have dependencies and acceptance criteria. | One item needs a clarified interface/owner. | An unapproved production/data/security decision blocks core scope. |
| Quality | Required automated/manual evidence is recorded. | A non-critical test is delayed with owner/date. | Tenant authority, data integrity, rollback, job idempotency or audit evidence is missing. |
| Operations | Alerts/runbooks/owners are available for deployed components. | A non-critical dashboard or runbook is incomplete. | A staging failure cannot be diagnosed or recovered safely. |

### 11.2 Sprint operating rules

1. Start each sprint with a written sprint goal, dependency check, owner, acceptance criteria and explicit non-goals.
2. Do not combine infrastructure foundation, identity rewrite and production data move in one pull request or one deployment.
3. Use reviewable branches and pull requests. Record exact test/build identifiers; distinguish inherited/variable failures from new failures.
4. Every change to tenant/role/object access must include same-tenant success, foreign-tenant denial, tenantless handling where relevant, and denied-side-effect coverage.
5. Every change to pipeline/report/provider/worker behaviour must preserve explicit unavailable, failed, partial, skipped and resumed states; do not introduce default values that appear authoritative.
6. Production credentials, production data and DNS require a separately approved implementation task after Sprint 6; they never enter an exploratory sprint.

## 12. Dependency map and critical path

```text
S0 ownership + architecture decisions
  ├── S1 external build/deploy/observability
  │     ├── S2 TiDB staging + storage foundation
  │     └── S3 identity/session/tenant authority
  │             └── S4 providers + worker + scheduler
  └───────────── S5 end-to-end staging proof ──► S6 readiness/rehearsal ──► separately approved cutover
```

The critical path is **ownership → deployability → data/identity foundations → integrations/jobs → staging evidence → readiness approval**. Work on UI styling or ordinary feature changes may continue separately, but should not alter authentication, schema, pipeline contracts, reports or deployment topology while a related migration gate is being tested without coordination.

## 13. Sprint risks and escalation rules

| Trigger | Classification | Required action |
|---|---|---|
| Live database differs from schema/migration assumptions | Data decision required | Stop schema execution; record metadata evidence and obtain data-owner approval. |
| External identity cannot reproduce current user/tenant lifecycle safely | Security blocker | Stop auth cutover work; choose/adjust identity design before proceeding. |
| A provider credential is platform-issued or cannot be owned by KINGA | Dependency blocker | Do not copy it; obtain company-owned account/credential or defer that integration. |
| Pipeline/report work exceeds interactive runtime or retry duplicates effects | Architecture blocker | Move work to the job/worker design; do not increase timeouts as the only remedy. |
| A staging tenant/object-authority test fails | P0 security blocker | Stop rollout for that surface; fix and re-run the full authority matrix. |
| Vite/server/build behaviour differs between local and CI | Release blocker | Reproduce on clean runner and record the exact build/runtime difference before deployment. |
| Monitoring/rollback cannot be demonstrated | Operations blocker | Do not schedule production cutover. |

## 14. First sprint backlog ready for assignment

The following are the only items ready to begin without a production decision. They form a safe initial backlog once the business sponsor nominates owners.

| Priority | Item | Size | Owner | Success measure |
|---:|---|---:|---|---|
| 1 | Create external-production decision record and ownership matrix | S | Business sponsor + platform | Every core component and escalation path has an owner. |
| 2 | Create staging/prod environment separation design | S | Platform + data + security | No uncontrolled production access path is proposed. |
| 3 | Create reproducible external server/client build specification | M | Application + platform | Clean CI runner produces versioned artefacts. |
| 4 | Define staging deployment and rollback runbook | M | Platform | Staging deployment and reversal can be demonstrated. |
| 5 | Inventory platform-managed runtime/secret/provider dependencies | M | Application | Every dependency has a retain/replace/defer decision. |
| 6 | Produce metadata-only TiDB schema reconciliation inventory | M | Data + application | Drift is classified; no DDL is issued. |
| 7 | Define external identity decision paper | M | Security + application | External OIDC or owned-auth direction is ready for approval. |
| 8 | Define worker/scheduler execution classification | M | Application + platform | Long-running and scheduled paths have a target external model. |

## 15. Related documents and source traceability

| Need | Read |
|---|---|
| Overall scope, target architecture, workstreams and cutover controls | `KINGA_EXTERNAL_PRODUCTION_MIGRATION_PLAN.md` |
| Code/pipeline/stage navigation | `KINGA_ENGINEERING_SYSTEM_MANUAL.md` |
| Security and tenant/object authority rules | `KINGA_SECURITY_MANUAL.md`, `KINGA_ARCHITECTURAL_INVARIANTS.md` |
| Database/drift and safe schema-change rules | `KINGA_DATABASE_MANUAL.md`, `KINGA_ENGINEERING_CHANGE_GUIDE.md` |
| Operations, providers and known operational limits | `KINGA_DEPLOYMENT_OPERATIONS.md`, `KINGA_INTEGRATIONS.md`, `KINGA_KNOWN_LIMITATIONS.md` |
| New-engineer setup and verification | `KINGA_ENGINEER_ONBOARDING.md`, `KINGA_TESTING_MANUAL.md` |

The executable source references underpinning the migration work remain `server/_core/index.ts`, `server/_core/context.ts`, `server/_core/oauth.ts`, `server/_core/trpc.ts`, `server/_core/domain-middleware.ts`, `server/routers.ts`, `server/pipeline-v2/`, `server/reporting/`, `server/storage.ts`, `drizzle/schema.ts`, `server/db.ts`, `client/src/App.tsx`, and `client/src/lib/trpc.ts`.
