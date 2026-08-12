# KINGA Full Dashboard Functionality & End-to-End Service Audit

**Author:** Tavonga Shoko, Lead Engineer  
**Audit mode:** Read-only functional audit  
**Started:** 12 August 2026  
**Scope:** All implemented portals, dashboards, user journeys, tRPC procedures, data paths, reports, role controls, tenant boundaries, integrations, and operational actions.

## Audit standard

A capability is classified as functional only when the observed evidence supports the entire chain: **UI → navigation → frontend handler → procedure/API → backend/data operation → business outcome → UI refresh → required audit trail**. Source inspection alone is recorded as **code-traced**, not as a successful end-user journey. A capability that cannot be run safely with the available accounts, fixtures, external credentials, or environment is recorded as **UNTESTED — ENVIRONMENTAL LIMITATION**.

## Evidence taxonomy

| Code | Meaning |
|---|---|
| E1 | Static source trace: route, component, handler, procedure, and persistence path inspected. |
| E2 | Automated regression evidence: targeted test or deterministic audit assertion passed. |
| E3 | Read-only production-data/report rendering evidence. |
| E4 | Live browser journey evidence with the intended authenticated persona. |
| L1 | Environmental limitation: no permitted role account, fixture, credential, external provider, or safe non-production test record. |

## Confirmed audit constraints

| Constraint | Treatment |
|---|---|
| No code remediation during this audit | Findings only; no product behaviour changes. |
| No fabricated customers, claims, payments, reviews, or external integration events | Use existing data, deterministic tests, and clearly labelled synthetic-free evidence only. |
| No destructive actions | No mutations, state transitions, payments, submissions, or data deletion during audit. |
| Platform super admin | May be used only to inspect accessible professional areas; role-specific outcomes still require persona evidence. |
| Reports | A report is not counted as working unless generation, data retrieval, populated output, access, and saved/downloadable behaviour are evidenced. |

## Audit workpapers

The following sections are completed progressively from evidence captured in this audit:

1. Executive summary and readiness score.
2. Dashboard and route inventory.
3. Requirements, navigation, tab, action, and procedure matrix.
4. End-to-end workflow, data-flow, role, tenant, notification, export, and report audit.
5. Defect register, severity summary, and recommended corrective order.

> **Status:** Evidence collection in progress. No readiness score or functional-complete classification is final until the cross-domain audit and stated environmental limitations are recorded.

## Initial live black-box finding

| ID | Area | Evidence | Preliminary status |
|---|---|---|---|
| AUD-001 | Public landing-page access | On 12 August 2026, a read-only browser visit to `https://kingaai-ybs42lwg.manus.space/` redirected to the Manus OAuth sign-in endpoint before visible landing-page content rendered. | **P1 candidate — requires route/auth trace.** This conflicts with the stated product rule that the landing page remains visible to everyone. The audit will determine whether the redirect is an intended hosting-level access boundary or an application regression. |

## Initial implementation inventory and baseline evidence

The route registry contains public/customer entry points, client self-service, professional portals, insurer sub-role workspaces, fleet management, engineering, platform administration, notification centre, and reporting routes. The actual route registration is the authoritative inventory source, rather than legacy portal documentation.[^app-routes]

| Domain confirmed in the route registry | Representative route family | Evidence status |
|---|---|---|
| Customer and claim intake | `/`, `/client`, `/client/submit-claim`, `/claims/:id`, `/get-a-quote` | E1 inventory complete; E4 anonymous customer journey blocked by AUD-001. |
| Insurer and claims operations | `/insurer-portal/*`, `/insurer/*`, claims processor, claims manager, internal assessor, insurer admin, recovery, policy, executive, risk, and workflow analytics | E1 inventory complete; role-specific E4 journeys pending. |
| Assessor and panel beater | `/assessor/*`, `/panel-beater/*` | E1 inventory complete; role-specific E4 journeys pending. |
| Agency and fleet | `/agency*`, `/fleet*` including the dedicated driver workspace | E1 inventory complete; role-specific E4 journeys pending. |
| Engineering | `/engineer/*`, inspections, projects, intelligence, and asset passport | E1 inventory complete; role-specific E4 journeys pending. |
| Platform administration and operations | `/platform/*`, `/admin/*`, tenant, user, audit, health, observability, workflow, market, and operations routes | E1 inventory complete; privileged E4 journey pending. |
| Notifications and report centre | `/notifications*`, `/insurer-portal/reports-centre`, `/reports/interactive/:snapshotId` | E1 inventory complete; generation and download testing is a separate audit phase. |

The existing static portal baseline passed: the hook-import and lazy-export audits passed, and the portal-conformance suite passed **19/19** checks. This is recorded as E2 evidence only; it does not by itself establish functional completeness.

## Confirmed early defects and audit candidates

| ID | Severity | Area | Expected outcome | Observed evidence | Classification |
|---|---|---|---|---|---|
| AUD-002 | P1 | Public claim entry | The landing-page `Submit a Claim` customer journey should resolve to the current protected claim-submission route after sign-in. | `PortalSelection.tsx` directs the journey to `/claimant/submit`, while `App.tsx` registers `/claimant/submit-claim` as the legacy redirect and `/client/submit-claim` as the current route. The static navigation audit also identifies `/claimant/submit` as unregistered. | **Broken navigation — E1.** |
| AUD-003 | P1 | My Portal claims | Selecting a client claim should open its detail record. | `ClientPortal.tsx` navigates to `/claimant/claims/${id}`, but the registered detail route is `/claims/:id`. | **Broken navigation — E1.** |
| AUD-004 | P2 | My Portal documents | A visible download control should download the authorised document or explicitly state that it is unavailable. | The Client Portal action map identifies a visible `Download` button without a click handler. | **UI-only/placeholder action — E1.** |
| AUD-005 | P2 | Engineering inspection evidence | An engineer should be able to attach inspection evidence within the inspection workflow, or the product should provide a working, contextual handoff. | `EngineerInspectionDetail.tsx` displays a toast instructing the user to use a claim document uploader rather than providing an inspection-evidence attachment path. | **Operationally incomplete — E1.** |
| AUD-006 | P2 | Claims processor pagination | A visible enabled pagination action should move to the next page. | The claims processor page contains a `Next` button with a disabled condition but no observed click handler in the static action map. | **Candidate non-functional action — E1; requires browser confirmation.** |
| AUD-007 | P2 | Marketing/statistical claims | Public-facing operating metrics should be traceable to a source or clearly labelled as illustrative. | `PortalSelection.tsx` contains static values for vehicles assessed, claims processed, uptime, and analysis time. | **Unverified hard-coded metrics — E1.** |
| AUD-008 | P1 | Platform-super-admin portal testing | The platform super administrator must be able to enter every portal needed for system testing. | `ProtectedRoute.tsx` permits `platform_super_admin` in the agency, insurer, fleet, engineer, marketplace, and customer domains, but omits it from the `portal` domain. `App.tsx` protects `/claims/:id` with that domain. A platform super administrator can therefore be denied the client claim-detail route. | **Role-access contradiction — E1.** |
| AUD-009 | P1 | Platform-super-admin administrative testing | The platform super administrator must be able to inspect all administrative/control areas required for system testing. | Multiple `/admin/*` routes in `App.tsx` are explicitly restricted to `admin` only. `ProtectedRoute.tsx` gives explicit `allowedRoles` precedence over domain access, so platform-super-admin access is not inherited. | **Role-access contradiction — E1.** |
| AUD-010 | P0 | Report tenant isolation and download access | A user must not request, poll, or obtain another tenant's report output merely by supplying an identifier or tenant parameter. | `reporting.generate` accepts a caller-supplied `tenantId` and passes it to `enqueueReport` without an observed tenant-ownership or platform-admin check. `reporting.getJobStatus` accepts only a `jobId`; `reportQueue.getJobStatus` returns the job's `download_url` without requester or tenant filtering. The queue renders using the caller-supplied tenant and persists the resulting report URL. `recordDownload` also writes an event for an arbitrary job ID without an observed ownership check. | **Confirmed cross-tenant report disclosure/control exposure — E1.** |
| AUD-011 | P1 | Scheduled report delivery policy | KINGA must use in-app notifications rather than end-user email spam. | The Reports Centre exposes schedule creation with delivery-email inputs; `reporting.createSchedule` persists `delivery_emails`. | **Product-policy contradiction — E1.** The scheduler/dispatch service will be inspected to establish whether those emails are actually sent. |
| AUD-012 | P1 candidate | Report regeneration governance | Pipeline re-run capability must remain on the separately approved governance path. | Reports Centre exposes `adminRegeneratePipeline`; the procedure writes a regeneration record, resets the claim to `intake_pending`, and clears assessment state. | **High-impact workflow control — E1.** It is auditable and role-restricted, but requires comparison with the user-approved re-run governance decision before being treated as release-ready. |
| AUD-013 | P2 | Report access inheritance | A platform super administrator should access all reports for testing. | `canAccessReport` gives unrestricted access only when `isAdminRole(userRole)` and `insurerRole` is absent. A super-admin account carrying an insurer sub-role is instead evaluated against that sub-role's permitted catalogue. | **Conditional access inconsistency — E1.** |
| AUD-014 | P0 | Claim intake evidence preservation | Supporting documents, police information, accident type, third-party data, and witness data collected in the claim form must persist against the submitted claim and be available to downstream workflow/reporting. | `SubmitClaim.tsx` collects and uploads supporting documents, and captures incident, police, third-party, and witness fields. The submission mutation sends only vehicle, core incident date/description/location, policy, photos, currency, panel-beater choices, and company fields. The traced `claims.submit` input and create operation do not receive the omitted form fields. | **Data-flow break — E1.** Uploaded supporting documents can exist in storage without an observed claim linkage; several collected fields have no observed persistence path. |
| AUD-015 | P0 | Claim submission resilience | A claimant must not be prevented from lodging a valid claim solely because three approved repairers are unavailable; the system should warn/route an exception without blocking assessment. | The client handler and `claims.submit` both require exactly three distinct insurer-approved panel-beater identifiers. Missing choices, duplicates, an absent insurer tenant, or a repairer outside the approved list reject submission before claim creation. | **Business-rule contradiction — E1.** The gate blocks intake rather than warning and routing a recoverable exception. |
| AUD-016 | P1 | Assessment-trigger observability | When asynchronous assessment initiation fails after successful intake, the claim should remain visible in a recoverable state and generate an in-app operational notification. | `claims.submit` creates the claim, audit entry, and event, then triggers assessment fire-and-forget. A failure is logged to the server console; no observed in-app notification, recovery record, or intake failure state is written in this procedure. | **Partial workflow resilience — E1.** The claim persists, but the submitter/processor may see a success state while assessment initiation failed. |
| AUD-017 | P0 | Executive claim drill-down integrity | Executive users must see actual tenant-scoped claims, routing history, and override records when opening a dashboard drill-down. | `ExecutiveDashboard.tsx` renders `ClaimDrillDownModal`. That component declares static `mockClaims` and `mockOverrideHistory`, including named policyholders, claim identifiers, amounts, fraud scores, workflow paths, and override history; no active query supplies the displayed content. | **Reachable mock operational data — E1.** This can mislead an executive decision-maker and must not be counted as a functioning analytics capability. |
| AUD-018 | P0 | Agency RFQ tenant isolation | An agency user may accept or reject only a quote request belonging to that user's agency tenant and authorised client/fleet context. | `acceptOrRejectQuote` is guarded only by agency role. It retrieves the request by numeric ID without restricting `agencyTenantId`, then can accept/reject it and close sibling requests. The procedure does not derive or compare the caller's agency tenant before mutation. | **Confirmed cross-tenant quote-control exposure — E1.** |
| AUD-019 | P1 | Agency commission accuracy | The commission shown to an agency user must use the authorised, traceable commission rule and match persisted outcome calculations. | `AgencyFleetQuotes.tsx` displays a 10% placeholder commission estimate; `acceptOrRejectQuote` persists a 5% placeholder commission estimate. | **Incorrect financial outcome — E1.** The same quote can display a materially different commission from the amount recorded on acceptance. |
| AUD-020 | P1 | Fleet RFQ acceptance journey | The visible fleet-owner quote-comparison acceptance action must be authorised and complete its intended outcome. | `/agency/quotes` is only wrapped in a generic protected route. Its list query is designed for a fleet owner, but its Accept/Reject mutation is agency-role-only. A non-agency fleet owner can reach the controls but receives backend denial. | **UI-to-backend role mismatch — E1.** |
| AUD-021 | P1 | Notification delivery policy | KINGA is configured for in-app operational notifications; email must not be used as a broad end-user workflow channel. | The in-app Notification Centre appropriately scopes reads and archive/read mutations to `ctx.user.id`. However, the codebase also includes active `sendEmailSafe` call paths for invitations, claim comments, and platform notifications, while report scheduling collects `deliveryEmails`. | **Policy-control gap — E1.** The audit has not found a single enforced product-level channel policy that prevents an unintended email workflow. |
| AUD-022 | P0 | Intelligence tenant isolation and data protection | Relationship intelligence, entity registries, claimant identifiers, licence details, and risk records must be limited to the authorised tenant and intended roles. | `intelligence.ts` uses only `protectedProcedure`; several procedures accept `input.tenantId` directly rather than deriving scope from the session, interpolate it into raw SQL, and return sensitive registry fields. The relationship-graph procedure has no observed tenant predicate. | **Confirmed tenant-isolation and sensitive-data exposure — E1.** |
| AUD-023 | P1 | Canonical administrative access policy | Server-side administrative checks must use the shared `isAdminRole()` rule so `platform_super_admin` access is evaluated consistently. | The source audit identifies numerous production direct comparisons to `role === 'admin'` or `role !== 'admin'` in middleware, reporting, tenancy, claims, analytics, valuation, marketplace, and policy-related modules. | **Systemic authorization divergence — E1.** It explains several observed super-admin access inconsistencies and requires systematic remediation rather than isolated route exceptions. |

## Report catalogue audit

The Reports Centre catalogue advertises 29 report types across claim, portfolio, risk, executive, governance, assessor, panel-beater, and agency categories. Each advertised key has an observed `generateReportHtml` dispatch branch, which establishes **static generator coverage only (E1)**. It does not establish that each report can execute with production data, render correctly, be downloaded by the correct user, or be retained and audited correctly.

| Report class | Static dispatch status | Output/readiness evidence |
|---|---|---|
| Claims Ledger / Claims Intelligence / Forensic Claim Decision | Implemented | E3: re-rendered for claims `10719902`, `11709902`, and `12879902` during R1. Cost-provenance controls were specifically validated. |
| Claim assessment, audit trail, cost comparison, repair decision | Implemented dispatch | **UNTESTED — ENVIRONMENTAL LIMITATION:** no safe role-scoped browser journey and output verification captured in this audit phase. |
| Portfolio, risk, executive, governance, assessor, panel-beater, agency | Implemented dispatch | **UNTESTED — ENVIRONMENTAL LIMITATION:** generation may need tenant-scoped operational records and authorised persona accounts. These must not be counted as working merely because a dispatch branch exists. |
| Engineering inspection and risk survey | Generator dispatch exists, but no corresponding catalogue entry was observed in the Insurer Reports Centre catalogue | **Partially integrated — E1.** Entry-point and output-access audit remains required. |

| ID | Severity | Area | Expected outcome | Observed evidence | Classification |
|---|---|---|---|---|---|
| AUD-024 | P1 | Report output-format integrity | Selecting Excel must create an Excel output; selecting PDF must create a PDF output. | `reporting.generate` accepts `outputFormat: 'pdf' | 'excel'`, but `reportQueue.processJob` invokes `renderAndUpload` unconditionally without branching on that value. | **Incorrect advertised output behaviour — E1.** Excel requests have no observed Excel generation path. |
| AUD-025 | P1 | Engineering report discoverability | Engineering inspection and risk-survey reports should be discoverable through an authorised report entry point. | `generateReportHtml` supports `engineer.inspection_report` and `engineer.risk_survey`, but they are not listed in the inspected Reports Centre catalogue. | **Backend generator disconnected from catalogue — E1.** |

## Functional-readiness assessment

> **Release decision: NO-GO for external production use.** This conclusion is driven by six P0 defects: claim-evidence loss, claim-intake blocking, a reachable mock executive drill-down, cross-tenant agency quote control, cross-tenant report access, and cross-tenant intelligence access. The score measures **observed functional readiness**, not the quality of the product concept or the amount of implemented code.

| Dimension | Weight | Evidence-based score | Rationale |
|---|---:|---:|---|
| Customer claim intake and evidence retention | 20 | 2 | The primary submit path creates a claim and triggers assessment asynchronously, but visible evidence fields are not all submitted/persisted and a three-repairer requirement blocks valid intake. |
| Portal navigation and dashboard integrity | 15 | 5 | Route inventory and 19 static conformance checks passed, but broken client links, inactive actions, and a reachable mock executive drill-down materially reduce confidence. |
| Operational workflow hand-offs | 15 | 3 | The core claim path, agency RFQ fan-out, and in-app notifications have code traces; recoverable failure handling and persona-based completion evidence are missing. |
| Access control, tenant isolation, and sensitive-data protection | 25 | 0 | Confirmed P0 cross-tenant paths prevent any operational readiness credit. |
| Reporting and export integrity | 15 | 6 | R1 claim-report output was rendered against three real claims and 30 targeted report tests passed; job access, Excel output, and most catalogue reports remain unproven or defective. |
| Live persona acceptance and external integrations | 10 | 0 | No non-destructive E4 user journey was evidenced for customer, insurer, assessor, panel-beater, agency, fleet, engineer, or platform roles; WhatsApp/Twilio and underwriting integrations were not configured for this audit. |
| **Overall functional-readiness confidence** | **100** | **16 / 100** | **No-go until all P0 findings are remediated and role-based acceptance testing is completed.** |

### Portal and dashboard scorecard

The following five-point scores are confidence ratings based on the audit evidence, not claims that functionality was executed live. `0` means a P0 integrity/control defect in the accessible journey; `1` means source-traced only; `2` means deterministic checks or limited data output exist; `4–5` would require successful E4 journey evidence and operational exception handling. No portal earned a live-ready score because no intended-role E4 journey was safely completed.

| Portal / dashboard | Confidence | Evidence position | Principal blocker or limitation |
|---|---:|---|---|
| Public landing and My Portal | 1 / 5 | E1, E2 | Published landing redirected to authentication during black-box check; client navigation and claim-evidence defects remain. |
| Claims intake and lifecycle | 1 / 5 | E1, E2 | P0 evidence loss and blocked intake; async assessment failure lacks in-app recovery visibility. |
| Insurer operations | 1 / 5 | E1, E2 | Sub-role routes exist, but platform-super-admin inheritance is inconsistent and no insurer-role E4 journey was run. |
| Assessor workspace | 1 / 5 | E1, E2 | Routes and tools are implemented; authorised workflow completion and data outcomes are untested. |
| Panel-beater workspace | 1 / 5 | E1, E2 | Quote-builder code exists; no live allocation, quote, repair-evidence, and completion path was safely executed. |
| Agency workspace | 0 / 5 | E1 | P0 quote-control isolation failure, financial commission inconsistency, and fleet-owner acceptance mismatch. |
| Fleet management and driver workspace | 1 / 5 | E1, E2 | Assignment/attribution code exists, but RFQ acceptance mismatch and role-specific live journeys remain unresolved. |
| Engineering workspace | 1 / 5 | E1 | Inspection route exists; evidence attachment is a contextual handoff rather than a completed workflow, and reports are undiscoverable. |
| Platform administration / executive dashboards | 0 / 5 | E1 | P0 reachable mock claim data and super-admin access contradictions. |
| Reports Centre | 1 / 5 | E1, E2, E3 | Three claims reports have E3 output evidence; P0 job/output isolation and output-format defect block readiness. |
| Notification Centre | 2 / 5 | E1 | User-scoped in-app reads/mutations are correctly traced; channel policy and workflow delivery outcomes remain incomplete. |

### Required corrective order

| Order | Work package | Blocking findings | Required proof of completion |
|---:|---|---|---|
| 1 | Tenant-boundary emergency remediation | AUD-010, AUD-018, AUD-022 | Adversarial automated tests prove a non-admin cannot generate, poll, download, mutate, or query a different tenant's records; platform-super-admin override is explicit and audited. |
| 2 | Claim-intake evidence and non-blocking recovery | AUD-014, AUD-015, AUD-016 | A claim submitted from each approved intake source retains all evidence, enters `intake_pending` when needed, produces an in-app exception notification, and can be recovered without data loss. |
| 3 | Remove operational mock data and reconcile dashboards | AUD-017, AUD-007 | Executive drill-down uses tenant-scoped live data or is explicitly unavailable; every visible metric has a source and period. |
| 4 | Agency and fleet-RFQ role/financial correction | AUD-018, AUD-019, AUD-020 | Tenant-bound quote controls, a defined commission rule, and a complete authorised accept/reject journey are verified with two agency tenants and one fleet owner. |
| 5 | Admin-policy consolidation | AUD-008, AUD-009, AUD-013, AUD-023 | `isAdminRole()` is the sole server-side administrative decision helper; a platform-super-admin acceptance matrix passes every intended portal and report class. |
| 6 | Reporting hardening | AUD-010 to AUD-013, AUD-024, AUD-025 | All catalogue reports execute against authorised fixture/production-safe claims; PDF/Excel outputs match request; download ownership, audit events, expiry, and in-app completion notices are verified. |
| 7 | Portal completion and evidence-quality batch | AUD-001 to AUD-007, image verification backlog | Every tab, control, empty state, error state, upload, document action, pagination action, inspection evidence action, and image side/zone classification has E4 or explicit non-production readiness status. |

### Environmental limitations and next acceptance evidence

The audit deliberately did not create test claims, alter quotes, accept an RFQ, send a notification, upload documents, initiate payments, use WhatsApp/Twilio, call insurer underwriting APIs, schedule delivery, or change any state. The following evidence is therefore still required after corrective batches: a customer claim through every intake channel; separate insurer sub-role journeys; panel-beater quote/revision/repair completion; agency client and fleet RFQ workflows; fleet manager and assigned-driver views; engineering inspection and report output; platform-super-admin access; notification delivery; every report type and output format; and cross-tenant negative tests.

The existing automated evidence is valuable but limited: `audit:portal` and the 19 portal-conformance checks passed; the integration suite passed 25 tests with one skip; and the targeted report suite passed 30 tests. These results demonstrate regression coverage, not successful end-user operation.

## Dashboard and action requirements matrix

This matrix consolidates the extracted UI action inventory. It records the intended requirement, the observed UI-to-procedure path, and the resulting audit position. It does not treat a visible button as functioning unless the full chain has evidence.

| Area | Principal requirements and visible actions | Observed UI-to-procedure path | Audit position |
|---|---|---|---|
| Landing page / portal selection | Remain public; route customers and professionals to the correct signed-in journey. | Landing controls are present in `PortalSelection`; the published black-box visit redirected to OAuth before rendering. | AUD-001, AUD-002, AUD-007; E1/E4-limited. |
| My Portal | Manage personal vehicles, claims, documents, insurance requests/policies, valuations, personal/company fleet context, notifications, and sign-out. | Vehicle add/delete and insurance acceptance are wired to `personalVehicles` and `insuranceV2`; claims/documents are queried. Claim-detail and claim-submit links point to the obsolete claimant paths; document Download has no handler. | AUD-002 to AUD-004; E1. |
| Claim submission | Upload/evaluate source documents, upload photos/supporting documents, capture all incident and party information, select repairer preferences, submit, retain claim number, and route to tracking. | Storage upload, extraction, company-fleet linking, and `claims.submit` are wired. The submit payload omits several visible evidence/data fields and hard-blocks without three approved repairers. | AUD-014 to AUD-016; E1/E2. |
| Claims Processor | Search/filter queue; view claim; upload evidence; run/re-run KINGA; reset stuck claim; assign assessor; escalate; view CL/CI/FR comparisons. | `claims`, `documents`, `assessors`, and `workflowQueries` procedures are wired. Direct report links and re-run/reset actions require authorised E4 validation. | E1; AUD-012 governance restriction applies. |
| Claims Manager | Review, close, send back, escalate, reopen, comment, paginate, and export a claims portfolio. | Manager overview, status, fraud, SLA, comments, and workflow mutations are wired. Pagination has a state handler; end-to-end state/audit outcome remains untested. | E1; live role acceptance required. |
| Internal Assessor / Assessor | View assignments, enter evaluation, record discrepancy and repair recommendation, monitor appointments/performance, and authorise payment where permitted. | Assignment/performance/evaluation/payment procedures are wired. Several visible expansion/ghost controls have no observed handler in the action inventory. | E1; role-specific E4 and empty/error states required. |
| Panel Beater | View allocation/quote history, construct categorised VAT-aware quotes, submit quote, upload repair evidence, and mark repairs complete. | `claims.myQuoteRequests`, `quotes.submit`, repair-history, and repair-photo mutations are wired. Allocation-to-completion chain was not safely executed. | E1/E2; no live completion evidence. |
| Agency | Manage agency clients and documents; initiate client service request/insurer dispatch; record renewal/instruction; compare quote responses. | Client, document, service request, and quote procedures are wired. The fleet RFQ page exposes a 10% display placeholder and a backend 5% calculation; acceptance authority mismatches the visible fleet-owner flow. | AUD-018 to AUD-020; E1. |
| Fleet Management | Create fleet; register/delete/import/export vehicles; assign driver; inspect maintenance/alerts; select analytical period; export claims summary. | `fleet` procedures and selected-period manager intelligence are wired. A full manager/driver/fleet data lifecycle and imported file validation were not executed. | E1/E2; fleet RFQ acceptance mismatch remains. |
| Fleet Driver | View assigned-driver workspace and lodge a company claim through My Portal. | `fleet.getMyDriverWorkspace` query and routes to `/client/submit-claim`, `/client`, and notifications are wired. | E1; safe assigned-driver E4 claim journey required. |
| Engineers | List/filter/create inspections; record measurements and observations; request/draft/approve KINGA analysis; run physics reconciliation; complete inspection; view projects. | Inspections procedures are wired. Upload Evidence gives only a claim-uploader toast rather than a persisted inspection-evidence action. | AUD-005; E1. |
| Insurer Administration / Executive | Navigate claims triage, inspect portfolio/KPI intelligence, run authorised overrides, inspect operational and audit views. | Analytics, claims override, portfolio, team-audit, and platform observability procedures are wired. Executive claim drill-down is reachable but displays mock records. | AUD-017; E1. |
| Platform administration | Inspect platform observability, operations, security, users, tenant/audit/workflow controls, and test all domains. | Platform overview and operations queries are registered. Explicit admin-only route and backend comparisons can exclude platform-super-admin. | AUD-008, AUD-009, AUD-023; E1. |
| Reports Centre | Search/select claim; choose a catalogue report; generate/poll/download; schedule/toggle/delete report; administer re-generation. | Catalogue, generation, job-status, download, schedule, and regeneration procedures are wired. P0 tenant-boundary failures and Excel mismatch invalidate operational readiness. | AUD-010 to AUD-013, AUD-024, AUD-025; E1/E2/E3. |
| Notification Centre | Filter, read, archive, mark-all-read, archive-all, configure delivery preferences, and return to portal context. | All visible read/archive controls use user-scoped notification procedures. Product-wide delivery policy still allows email pathways. | AUD-021; E1. |

### Action completeness interpretation

The matrix confirms that much of the platform is **wired beyond a static prototype**: most central pages declare data queries and state-changing procedures rather than simple visual placeholders. However, the required functional chain is broken at several control points, and major areas are only source-traced. Accordingly, every row marked E1 remains **UNTESTED — ENVIRONMENTAL LIMITATION** for actual user outcome until the listed persona, data, and external-service acceptance evidence is captured.

[^app-routes]: `client/src/App.tsx`, route registry inspected 12 August 2026.
