# KINGA API and tRPC Reference

## 1. API architecture

KINGA is tRPC-first. The Express application is started through `server/_core/index.ts`; protected/public procedure primitives are in `server/_core/trpc.ts`; request identity/context is created under `server/_core/context.ts`; the top-level `appRouter` is assembled in `server/routers.ts`. The browser client creates typed hooks through `client/src/lib/trpc.ts`.

The exact input and output schema of a procedure is the TypeScript/Zod definition in its router source. This manual is a navigation catalogue, not a substitute for reading that definition before calling or modifying an API.

## 2. Top-level router catalogue

| Namespace / family | Source | Responsibility | Authority focus |
|---|---|---|---|
| `claims`, `claimCompletion`, `claimReplay`, `claimComms`, `comments` | `claims-core.ts`, `claim-completion.ts`, `claim-replay.ts`, `claimComments.ts`, `comments.ts` | Core claim, communications, review and replay paths | Tenant + target-claim authority |
| `documents`, `documentIngestion`, `storage`, `policeReports` | `document-ingestion.ts` and document procedures in `server/routers.ts` | Document intake, object handling and extraction-related access | Tenant + document/claim ownership |
| `reports`, `reportingEngine`, `claimReports`, `executive` | `reports.ts`, `reporting.ts`, `claim-reports-core.ts`, `executive.ts` | Claim, role and executive reports | Report access, tenant and platform-role boundaries |
| `aiAnalysis`, `aiAssessments`, `aiReanalysis`, `photoReextraction` | `ai-analysis.ts`, `ai-assessments-core.ts`, `ai-reanalysis.ts`, `photo-reextraction.ts` | AI assessment/reanalysis and photo processing | Server-side AI invocation; tenant-scoped claim access |
| `inspections`, `engineeringIntelligence` | `inspections.ts`, engineering intelligence modules | Engineer profiles, inspections, projects and intelligence | `engineerDomainProcedure` and tenant/object authority |
| `fleet`, `fleetAccounts`, `fleetIntelligence` | `fleet-core.ts`, `fleet-accounts.ts`, fleet intelligence modules | Fleet, drivers, assets, RFQs and analysis | Tenant/fleet ownership and role scope |
| `tenant`, `admin`, `teamMembers`, `platformUserRoles` | `tenant.ts`, `admin.ts`, `team-members.ts`, `platform-user-roles.ts` | Tenant/user administration | Privileged role and organisation controls |
| `audit`, `superAudit`, `workflowAudit`, `governance*` | `audit.ts`, `super-audit.ts`, `workflow-audit.ts`, governance files | Governance and audit views/events | Session-derived tenant or explicit platform authority |
| `agency`, `agencyBroker`, `marketplace`, `platformMarketplace` | agency and marketplace routers | Agency/service and marketplace interactions | Tenant/agency/platform separation |
| `notifications`, `operationalHealth`, `platformObservability`, `platformOperations` | matching routers | Notifications and observability/operations | Never expose cross-tenant operational data to ordinary tenants |

## 3. Required procedure review checklist

Before documenting or changing a specific procedure, record all of the following from code:

| Required fact | Where to verify |
|---|---|
| Procedure name, input and output | router source (`input(...)`, `.query(...)`, `.mutation(...)`) |
| Caller context and role | selected procedure primitive and middleware chain |
| Tenant requirement | explicit guard plus every query/write predicate |
| Object authority | target record lookup and ownership/assignment verification |
| Database effects | Drizzle/SQL calls and service helpers |
| Side effects | audit, event, notification, pipeline invocation, storage or external calls |
| Failure behaviour | thrown `TRPCError`, validation branch or explicit unavailable response |
| Regression evidence | nearest named `*.test.ts` and integration tests |

## 3.1 Procedure-level orientation for high-impact API families

This table records the current named procedure surface for the paths a new engineer is most likely to change. It is intentionally an orientation aid: read the complete input schema and procedure body before implementation because default values, conditional branches and side effects cannot be represented safely in a catalogue alone.

| Router / procedure group | Verified procedure names | Protection primitive in source | Data/side-effect review focus | Regression starting point |
|---|---|---|---|---|
| `inspections` | `create`, `list`, `get`, `updateStatus`, `assign`, `addMeasurement`, `addObservation`, `transcribeVoice`, `draftObservationWithAi`, `runAiAnalysis`, `approveAiAnalysis`, `runPhysicsReconciliation`, `getMyProfile`, `upsertMyProfile`, `linkToClaim`, `createProject`, `listProjects`, `updateProject`, `getProjectDashboard` | `engineerDomainProcedure` | Engineer profile, inspection/project ownership, assignment, claim linkage, measurement/observation and AI/physics effects | `server/engineer/inspectionAuthority.p0.test.ts` |
| `reports` | `generateExecutiveReport`, `generateFinancialSummary`, `generateAuditTrailReport` | `protectedProcedure` | Tenant/object authority, period scope, report input source, export content, audit effect | report authority/parity suites under `server/reporting/` |
| `reporting` | `getCatalogue`, `generate`, `getJobStatus`, `getMyJobs`, `recordDownload`, `getDownloadUrl`, `adminGetAllJobs`, schedule create/delete/toggle procedures, regeneration procedures, `previewHtml`, `getReportReadiness` | Primarily `protectedProcedure`; admin methods use `adminProcedure` | Report job ownership, output storage URL, download authority, schedule tenant scope and administrative regeneration | report/model/tenant-authority tests in `server/reporting/` |
| `notifications` | `getAll`, `getUnreadCount`, `markAsRead`, `markAllAsRead`, `archive`, `archiveAll`, `getPreferences`, `updatePreference` | `restrictedCommunicationProcedure` | The session tenant must govern every notification read/write; unread counts must not cross tenants | `server/routers/notificationsTenantAuthority.p0.test.ts`, notification preference authority suite |
| `approval` | template retrieval/create/update; `getClaimApprovalStatus`, `submitApprovalDecision`, `getApprovalHistory`, `getApprovalQueue`, `getWorkflowSummary` | `protectedProcedure` | Actor role/tenant, claim authority, configured approval rules, final record/event/audit effect | approval/workflow tests and forensic report-model tests |
| `decision` | decision evaluate/batch/summary, contradiction check/stats, decision trace generation/retrieval, report-readiness, explanation, route/route-by-ID, escalation summary | `protectedProcedure` | Canonical input source, visible recommendation vs. actual decision, target claim authority, downstream report/workflow effects | decision/report/workflow regression suites |
| `documentIngestion` | `uploadDocuments`, `getIngestionBatches`, `getBatchDocuments`, `getDocumentDetails`, `classifyDocument`, `approveDocument` | `protectedProcedure` | Claim/document tenant ownership, content storage, extraction/classification status, approval/audit effect | document ingestion and pipeline tests |
| `quotes` | `submit`, `byClaim`, `getWithLineItems`, `adjustByAssessor`, `submitStripRequote`, `submitSupplementary`, `extractFromImage`, `runAudit` | `protectedProcedure` | Claim authority, quote/line-item tenant scope, assessor adjustment authority, AI extraction labelling | quote core authorisation tests |
| `tenant` | list/get/create/update/delete; role config; workflow thresholds; SLA config; current tenant; currency/rates | `protectedProcedure` | Verify exact role/tenant restriction in each body; these change organisational configuration and are high-impact | `server/routers/tenant.test.ts` and workflow config authority tests |
| `admin` | tenant creation/listing, invitation lifecycle, seed/AI generation, observability/pipeline/health, registration/user actions, platform network views, audit/security views | `superAdminProcedure` for listed global controls; selected operations are `protectedProcedure` | Never infer that a protected admin-looking method is platform-wide; trace each method’s internal role/tenant branch | admin/tenant/platform and pagination tests |
| `auth` | `me`, `logout`, `setInsurerRole`, `switchRole`, `addSecondaryRole` | `me`/`logout` are public procedures; role modifications are protected | Session/user state, active account, requested role and tenant/organisation constraints | auth/logout and role-management tests |
| `executive` | claim detail, claims-volume, fraud trends, cost by status, processing time, fraud distribution, override metrics, AI savings, escalation queue | `executiveProcedure` | Role-to-tenant/executive scope, date boundaries, canonical aggregate source and KPI parity | `server/routers/executive.test.ts`, platform report collection tests |

## 3.2 Error and side-effect interpretation

An error must be derived from the current router source—not assumed from a procedure name. The tRPC core provides authentication/role error middleware and tenant-isolation/system-error logging paths. A review should record the exact expected error code/message category, whether an audit/denial log follows, and prove that a denial does not create a claim event, notification, provider call, stored file, job or other side effect.

## 3.3 Worked high-risk procedure walkthrough: `inspections`

`server/routers/inspections.ts` is a practical reference because it documents its domain guard, uses Zod inputs, and has an associated P0 authority regression suite. The following entries are verified from its current source; they should be rechecked if the router changes.

| Procedure | Input validation / output | Authorisation path | Data effects and important errors | Tests / engineering cautions |
|---|---|---|---|---|
| `create` | Requires an enumerated inspection type, non-empty asset type, bounded optional asset/claim/project/location fields, and optional auto-assignment requirements. Returns inspection reference, insert ID and status. | `engineerDomainProcedure`; the session tenant is assigned to `ctx.user!.tenantId!`, with no fallback. | May call workload balancing, increment the selected engineer's active-inspection counter, and insert an inspection. | Confirm assignment selection is tenant-scoped; a missing tenant must be denied by middleware. |
| `list` | Optional enumerated status/type; page is at least 1 and page size is 1–100. Returns page, totals and inspection rows. | Session tenant is explicitly required. Non-admin users are restricted to assigned/created inspections. | Queries and counts use the constructed tenant/role/status/type condition. Missing tenant returns `FORBIDDEN`. | `inspectionAuthority.p0.test.ts` is the starting regression suite. |
| `get` | Positive integer inspection ID; returns inspection with measurements and observations. | `requireInspectionAccess` finds target inspection; returns `NOT_FOUND` for missing or foreign-tenant record; non-admin needs assignment or creator identity. | Reads related measurement/observation rows after target authority. | Maintain the intentionally non-revealing `NOT_FOUND` response for foreign tenant access. |
| `updateStatus` | Positive ID and enumerated inspection status, with optional bounded notes. Returns success/status. | Calls `requireInspectionAccess` first. | Updates inspection status and adds completion timestamp only on `complete`. | Do not introduce a workflow status change before object authority. |
| `assign` | Positive inspection and engineer user IDs. Returns success. | Requires admin role and non-null tenant; target inspection plus selected engineer profile are tenant/role checked. | Writes assigned user/time/status and increments that tenant profile's active count. Errors `FORBIDDEN` for non-admin and `NOT_FOUND` for absent scoped engineer. | Preserve no-side-effect denial when the foreign target/engineer is supplied. |
| `addMeasurement` | Valid inspection ID, category, type, numeric value, unit and bounded optional calibration/standards/evidence fields. Returns new measurement ID. | Inspects target authority first. Supplied evidence document IDs are joined through their claims and checked against the inspection tenant. | Inserts a tenant-scoped physical measurement; backfills only scoped linked document IDs. | Evidence ID arrays are not trusted as authority; preserve claim tenant join. |
| `addObservation` | Valid inspection ID and controlled observation mode/type/severity with bounded optional content/evidence. Returns new observation ID. | As above; supplied evidence IDs are scoped by parent claim tenant. | Inserts a tenant-scoped observation; linked documents are backfilled afterward. | Preserve evidence tenant filtering and author identity. |
| `transcribeVoice` | Valid inspection ID, audio URL, language and optional observation metadata. Returns transcript/language and observation ID. | Target inspection access is required first. | Calls `transcribeAudio`, then writes a voice observation; the audio URL is saved with result metadata. | Treat external transcription failure as an honest error/degraded state; do not fabricate a transcript. |
| `draftObservationWithAi` | Positive observation ID with optional bounded context. Returns AI draft. | Looks up observation, then requires access to its parent inspection before LLM call. | Calls `invokeLLM` with an instruction to preserve facts/no fabrication; marks draft use/prompt on the observation. | The AI draft is not automatically approved. Preserve the parent-inspection authority check. |
| `runAiAnalysis` / `approveAiAnalysis` | Analysis takes positive inspection ID; approval takes ID, boolean and optional notes. | Both require target inspection access. | Analysis reads evidence, invokes a strict JSON-schema response, records analysis and moves to review; approval records approved flag and changes status to physics reconciliation or back to AI analysis. | Retain structured schema, parse-error visibility, and separate human approval. |
| `runPhysicsReconciliation` | Positive ID plus optional structured measurement map. Returns converted count and flags. | Target inspection access first. | Reads physical measurements, compares through `reconcileEngineerMeasurements`, stores reconciliation state/note, moves to report generation. | The source notes a >15% deviation threshold. Treat calibration/threshold changes as architecture review. |

## 3.4 Worked tenant-isolation procedure walkthrough: `notifications`

`server/routers/notifications.ts` demonstrates a narrower self-service pattern. Every procedure uses `restrictedCommunicationProcedure`, which adds an agency-assisted communication capability check to the protected procedure. `requireNotificationTenant` returns the session tenant or throws `FORBIDDEN` before the tenant-scoped data path runs.

| Procedure | Exact input/output orientation | Scope and data effects | Failure / regression expectation |
|---|---|---|---|
| `getAll` | Filter (`all`/`unread`/`archived`), optional module, limit 1–200, non-negative offset; returns matching rows. `unreadOnly` is legacy compatibility input. | Requires both `notifications.user_id = ctx.user.id` and `notifications.tenant_id = session tenant`, then adds archive/read/module filters. | Throws `INTERNAL_SERVER_ERROR` if DB is unavailable; tenantless session is `FORBIDDEN`. |
| `getUnreadCount` | Returns `{ count }`. | Counts only current user/current tenant rows that are unread and unarchived. | DB absence returns `{ count: 0 }`; do not change that degradation behaviour without review. |
| `markAsRead` / `archive` | Positive integer notification ID; returns success. | Update predicate includes notification ID, current user ID and session tenant. Archive writes both archived/read timestamps. | A foreign notification must not be modified; retain denial/no-cross-tenant regression coverage. |
| `markAllAsRead` / `archiveAll` | No input; returns success. | Bulk update is constrained to current user plus session tenant and appropriate read/archive state. | Never broaden the bulk predicate across a tenant/user boundary. |
| `getPreferences` / `updatePreference` | Gets default-expanded modules; update accepts only known module enum, booleans and priority enum. | Reads/writes preference rows with current user ID and session tenant; updates use duplicate-key upsert. | Preserve tenant/user keys through any schema or preference refactor. |

## 4. REST and non-tRPC routes

The runtime also contains Express route handling. Search `server/_core/index.ts` and server modules for `.get`, `.post`, `.put`, `.patch`, and `.delete` before changing transport or export behaviour. REST paths must enforce the same session-derived tenant/object authority as tRPC. A route must not be called “internal” as a substitute for authorisation.

## 5. API rules that must not regress

- Validate input at the boundary; do not accept a client-provided `tenantId` as authorisation.
- Resolve target tenant/object authority before reading related rows or emitting an audit/event side effect.
- Return honest unavailable/empty states rather than placeholder analytics or fabricated report facts.
- Keep report output sourced from its canonical resolver/model.
- Add a regression that proves both authorised success and an important unauthorised denial path for security-relevant procedures.

See [KINGA_SECURITY_MANUAL.md](./KINGA_SECURITY_MANUAL.md) for the detailed access model and [KINGA_TESTING_MANUAL.md](./KINGA_TESTING_MANUAL.md) for validation conventions.
