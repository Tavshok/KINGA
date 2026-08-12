# P0 Package 1 — Tenant-Boundary Emergency Remediation Work Notice

**Author:** Tavonga Shoko, Lead Engineer  
**Prepared:** 12 August 2026  
**Status:** Prepared for approval — **no implementation authorised by this notice**

## Purpose and boundary

This package addresses only the P0 tenant-boundary defects established in the full-platform functional audit. It will prevent an ordinary authenticated user or a user from another tenant from using a supplied ID, tenant identifier, or previously observed report URL to read, generate, download, or mutate another tenant's operational data.

It does **not** change pricing, claim decisions, L2 cost logic, workflow states, report content, dashboard design, integrations, or any user-facing business process except where an unauthorised action must be denied. It will not create, alter, submit, accept, reject, or delete customer, claim, quote, payment, or policy data during implementation or verification.

## Confirmed attack paths in scope

| ID | Affected path | Confirmed exposure | Required security outcome |
|---|---|---|---|
| P0-1 | Report generation, job polling, download recording, output access, and schedules | A caller can supply a tenant ID when generating a report; a job-status read accepts only a job ID and returns the persisted download URL; download recording accepts an arbitrary job ID. | Every report operation must bind to an authorised tenant and requester. A report file is retrieved only after an access check. |
| P0-2 | Agency quote acceptance/rejection | The operation reads a quote request by ID and mutates it without comparing its agency tenant to the caller's tenant. It can also close sibling requests. | An agency user can mutate only quote requests in their agency tenant and authorised client/fleet scope. |
| P0-3 | Intelligence registries and relationship graph | Protected procedures accept caller-supplied tenant IDs, use raw SQL interpolation, return sensitive registry records, and the relationship graph has no observed tenant predicate. | The server derives tenant scope from the authenticated session; sensitive intelligence requires an explicit authorised role/permission; every query is parameterised and tenant constrained. |

## Implementation mapping confirmed before modification

| Package path | Exact current implementation | Confirmed relationship / defect |
|---|---|---|
| P0-1 report generation | `server/routers/reporting.ts` `generate` accepts `input.tenantId`, copies it into report parameters, and forwards it to `enqueueReport`. | The normal caller can cause the background generator to operate under the submitted tenant rather than the session tenant. |
| P0-1 job status and download record | `reporting.getJobStatus` calls `reportQueue.getJobStatus(jobId)` without `ctx`; `recordDownload` updates by `job_id` only. | A valid foreign job ID is sufficient to retrieve job fields or alter its download record. |
| P0-1 output file path | `reportQueue.processJob` persists `s3_key` and `download_url`; both `getJobStatus` and `getUserJobs` select `download_url`. | A stored URL is exposed as report data rather than issued after a fresh object-level check. |
| P0-1 schedules | `deleteSchedule` and `toggleSchedule` select by schedule ID first, then permit a top-level `admin` bypass. | The query lacks the ordinary caller's tenant predicate and the bypass is broader than platform-super-admin. |
| P0-2 agency quote decision | `agency-broker.acceptOrRejectQuote` selects/updates target `insurer_quote_requests` by ID only. | The row has `agencyTenantId`, but the procedure does not obtain caller agency scope or include it in the lookup/update. |
| P0-2 sibling closure | Sibling update constrains claim/fleet and status only. | It can affect sibling requests outside the authoritative agency tenant. |
| P0-3 registries | `intelligence.ts` procedures accept optional `tenantId`, resolve it before `ctx.user.tenantId`, and construct SQL with `sql.raw`. | Ordinary callers can select a foreign tenant and inputs can enter raw SQL text. |
| P0-3 relationship graph | `entity_relationship_graph` has authoritative `tenant_id` and originating `claim_id`; the current query is global. | The query can be constrained directly by graph `tenant_id`; no invented relationship is required. |

The implementation will alter only these mapped procedures and shared helpers/tests strictly needed to enforce their boundary.

## Non-negotiable invariants

| Invariant | Rule to be implemented and proven |
|---|---|
| Tenant derivation | For ordinary users, tenant scope comes only from the authenticated session. Client-supplied tenant identifiers are ignored or rejected. |
| Cross-tenant denial | A user from Tenant A cannot read, generate, poll, download, record a download for, accept, reject, or otherwise mutate Tenant B data, even with a valid numeric ID, UUID, stored link, or guessed tenant identifier. |
| Platform-super-admin control | Platform-super-admin access remains available for system testing, but must be explicit, auditable, and tenant-selectable. It must not be inherited by ordinary admin, agency, insurer, fleet, or customer roles. |
| Report file access | The application must persist a report object key, then issue a short-lived retrieval URL only after authorisation. A persisted public download URL is not an access-control mechanism. |
| Agency mutation scope | Quote-request lookup and sibling closure are constrained by the caller's agency tenant before any status change or commission calculation. |
| Intelligence minimisation | Intelligence data is available only to approved operational roles, returns the minimum required fields, and never falls back to a global graph or caller-chosen tenant. |
| Audit trail | Every platform-super-admin cross-tenant report or intelligence action records actor, selected tenant, action, timestamp, and relevant object ID. |
| Fail closed | Missing tenant context, missing ownership, or an ambiguous relationship returns `FORBIDDEN` or `NOT_FOUND`; it never falls back to a global/default tenant. |

## Proposed implementation design

### 1. Report security boundary

`reporting.generate`, job-status retrieval, download recording, schedule create/list/toggle/delete, and direct report download will use one server-side scope resolver. It will derive the effective tenant from the session for ordinary users and require an explicit, validated tenant selection only for `platform_super_admin`. The resolver will use the shared administrative role policy rather than direct `role === 'admin'` comparisons.

Report jobs will be treated as requester-owned within their authorised scope. An ordinary user may poll and download only a job they requested. A platform-super-admin may inspect an explicitly selected tenant's job after an audit event is written. The worker will receive the already authorised tenant context; it will not trust a later UI value.

The report queue will persist `s3_key` as the authoritative file reference. It will not expose a stored output URL through an unrestricted job-status response. An authorised download endpoint will obtain a short-lived retrieval URL only after rechecking request ownership/tenant scope. Existing historic public URLs cannot be retroactively made private without a separate storage migration; this package will stop the application from returning them and document the follow-up rotation decision.

### 2. Agency quote-control boundary

`acceptOrRejectQuote` will resolve the caller's agency tenant before looking up the quote request. The lookup will include that tenant predicate, and the sibling-close update will carry the same agency predicate. The procedure will preserve its existing final-state guard and audit trail, but audit the authoritative agency tenant and client/fleet linkage.

This package will not redesign whether a fleet owner, agency user, or insurer should make a commercial acceptance decision. It will only ensure that an agency-only mutation cannot operate across agencies. The visible fleet-owner acceptance control is retained as a separately scoped P1 journey-design correction.

### 3. Intelligence boundary

The intelligence router will receive a dedicated access and scope guard. It will derive tenant context from the authenticated user and allow an explicit override only for platform-super-admin system testing. Queries will move from interpolated raw SQL to parameterised Drizzle/SQL bindings. The relationship graph will receive an explicit tenant predicate, using its own tenant field where present or a tenant-bound relationship to the originating claim/entity where that is the model's actual source of truth.

The implementation will inventory intelligence roles before permitting them. If no existing permission covers a sensitive registry, the safe default is to deny the route to that role until a clearly named `view_intelligence` permission is introduced in a later, separately approved package. It will not silently broaden access to make a dashboard render.

## Regression and acceptance evidence

| Test group | Required proof |
|---|---|
| Report tenant attacks | Tenant A cannot generate a Tenant B report, poll a Tenant B job, retrieve a Tenant B download reference, record a Tenant B download, or manage a Tenant B schedule. |
| Agency tenant attacks | Agency A cannot accept/reject Agency B's quote request and cannot close Agency B sibling requests. |
| Intelligence tenant attacks | A non-platform user cannot supply another tenant ID, read that tenant's registry records, read a global relationship graph, or inject a tenant value into a query. |
| Super-admin control | Platform-super-admin succeeds only with explicit selected tenant context and creates an audit entry; ordinary roles do not inherit this override. |
| Regression compatibility | Same-tenant ordinary user operations continue to work; existing report catalogue access and in-app notifications retain their expected behaviour. |
| Production build | Focused Vitest tenant-boundary tests, the existing report/portal suites, bundled server build, and Vite production build pass with no new errors. |

## Acceptance criteria

Implementation is complete only when all P0 paths fail closed in a two-tenant negative test suite, valid same-tenant operations continue to pass, and platform-super-admin exception use is explicit and auditable. No report, agency quote, intelligence record, schedule, or output URL may be returned based solely on a caller-supplied identifier.

## Risks and controlled compatibility impact

The package will intentionally deny some requests that were previously permitted because they lacked a verified tenant relationship. Existing long-lived report URLs may stop being returned by the application; this is a required security correction. The implementation will surface a clear authorised-download error rather than a broken or blank link. No database data migration is required for the access-control code path itself, but the storage URL rotation decision will be recorded separately.

## Excluded from this package

The following remain separate work packages: claim-intake evidence retention and non-blocking repairer exception handling; removal of mock executive data; agency commission and fleet acceptance design; global conversion to `isAdminRole()` beyond paths touched by this P0 package; image evidence remediation; WhatsApp/Twilio or insurer underwriting integration; and live persona acceptance testing.

## Approval requested

Approve **P0 Package 1** to implement the three tenant-boundary fixes and the stated adversarial test suite only. After implementation, the result will state the exact procedures changed, tests run, build results, any blocked compatibility decision, and the next proposed package.
