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

## 4. REST and non-tRPC routes

The runtime also contains Express route handling. Search `server/_core/index.ts` and server modules for `.get`, `.post`, `.put`, `.patch`, and `.delete` before changing transport or export behaviour. REST paths must enforce the same session-derived tenant/object authority as tRPC. A route must not be called “internal” as a substitute for authorisation.

## 5. API rules that must not regress

- Validate input at the boundary; do not accept a client-provided `tenantId` as authorisation.
- Resolve target tenant/object authority before reading related rows or emitting an audit/event side effect.
- Return honest unavailable/empty states rather than placeholder analytics or fabricated report facts.
- Keep report output sourced from its canonical resolver/model.
- Add a regression that proves both authorised success and an important unauthorised denial path for security-relevant procedures.

See [KINGA_SECURITY_MANUAL.md](./KINGA_SECURITY_MANUAL.md) for the detailed access model and [KINGA_TESTING_MANUAL.md](./KINGA_TESTING_MANUAL.md) for validation conventions.
