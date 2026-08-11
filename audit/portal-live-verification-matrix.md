# KINGA Portal Live Verification Matrix

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 11 August 2026  
**Purpose:** Provide a repeatable, evidence-led live acceptance check for the portal corrections recorded in `audit/portal-conformance-audit.md`.

## Execution Rules

Run the scenarios against the currently published version in a normal browser session. Use a distinct role-appropriate account for each scenario; a `platform_super_admin` may validate navigation and visual access but must not be treated as evidence that a role-restricted workflow works. Record the browser URL, timestamp, account role, input claim/request identifier, expected outcome, actual outcome, and screenshot/reference for each result.

| Result | Meaning | Required follow-up |
|---|---|---|
| **Pass** | The stated outcome occurs without a console, server, or UI error. | Retain the evidence with the release record. |
| **Fail** | A control is absent, route is broken, mutation fails, or incorrect data is visible. | Capture the exact error and stop promotion of the affected portal. |
| **Blocked** | Required test account, allocation, or record does not exist. | Create the minimum legitimate operational record; do not substitute mock UI data. |

## P0 Route and Landing Verification

| ID | Role | Starting URL | Action | Expected result | Evidence |
|---|---|---|---|---|---|
| P0-01 | Signed-out user | `/` | Load and hard refresh the landing page. | The KINGA landing page renders; no React error boundary, blank screen, or redirect loop occurs. | Screenshot and browser console export. |
| P0-02 | Authenticated user | `/` | Select **Go to My Portal**. | The user reaches the canonical workspace for their primary role. | Final URL and screenshot. |
| P0-03 | Any role | `/portal-hub` | Navigate directly to the retired Portal Hub route. | The browser returns to `/`; no role grid or loop is rendered. | Final URL. |
| P0-04 | Platform super admin | `/` | Select each professional portal card. | Each destination route loads without a runtime exception; administrative override remains visibly indicated where applicable. | Route list and screenshots. |

## Agency Broker-Service Workflow

| ID | Role | Preconditions | Action | Expected result |
|---|---|---|---|---|
| AG-01 | Agency staff | Agency account and at least one client record. | Open `/agency`. | The page headline is **Agency Service Workspace** and begins on **Client Management**. No client self-service valuation or generic “My Quotations” experience is shown. |
| AG-02 | Agency staff | A client is available. | Select a client and start a service request. | The agency can record the client requirement against the agency client record. |
| AG-03 | Agency staff | At least one active insurer recipient is available. | Select one or more insurers and dispatch quote requests. | Requests are sent only to the selected insurers; the client does not act as the requester. |
| AG-04 | Agency staff | One or more insurer responses exist. | Open **Client Requests & Quotes** and record the client instruction. | Responses are visible as an insurer-response worklist; client instruction is captured without the agency accepting a policy for itself. |
| AG-05 | Agency staff | Issued policy/commission test data. | Review Policies and Commissions. | Policy and commission data is visible only for the agency’s managed business. |

## Insurer Role and Workspace Routing

| ID | Role | Preconditions | Action | Expected result |
|---|---|---|---|---|
| IN-01 | Insurer user with a configured sub-role | Account has `insurerRole` set. | Sign in from the landing page. | The user lands in the workspace for that insurer sub-role, not the generic selection screen. |
| IN-02 | Insurer user without a configured sub-role | No `insurerRole` is set. | Open `/insurer-portal`. | The user sees the role-selection/access guidance and cannot enter every insurer workspace. |
| IN-03 | Platform super admin | Admin account. | Open `/insurer-portal`. | All insurer testing roles are selectable under the visible administrative override. |

## Assessor Professional Toolkit

| ID | Role | Preconditions | Action | Expected result |
|---|---|---|---|---|
| AS-01 | Assessor | At least one assigned claim. | Open `/assessor/dashboard` and select an assigned claim. | The queue opens the assessment workspace; no broken route occurs. |
| AS-02 | Assessor | Claim has an assessment. | Review the KINGA evidence, damage, physics, fraud, cost, and decision-support views. | The assessor can interpret engine outputs and record an informed decision rather than only view a task list. |
| AS-03 | Assessor | No assigned claims. | Open the dashboard. | A clear empty state appears without a runtime error. |

## Panel Beater Repair-Partner Workflow

| ID | Role | Preconditions | Action | Expected result |
|---|---|---|---|---|
| PB-01 | Panel beater | User account is linked to a repairer profile. | Open `/panel-beater/dashboard`. | A profile-linked operational queue is shown. If no work is allocated, the empty state says so; it does not imply a product failure. |
| PB-02 | Panel beater | Claim has an invitation or final allocation to this repairer. | Open the queue row and select **Build Quote**. | The professional quote builder opens on `/panel-beater/claims/:id/quote`. |
| PB-03 | Panel beater | Quote scope available. | Add labour, parts, consumables, and sublet line items; enable/disable VAT; submit. | The quote total and VAT are calculated and persisted; quote history reflects tenant currency. |
| PB-04 | Panel beater | Repair is allocated/in progress. | Upload repair evidence photos and mark the repair complete. | Photos upload successfully; completion changes the repair workflow without exposing other repairers’ claims. |

## Fleet Manager and Assigned Driver Workflow

| ID | Role | Preconditions | Action | Expected result |
|---|---|---|---|---|
| FL-01 | Fleet manager | Existing user with `fleet_driver` role. | Open `/fleet` → Drivers → **Assign Driver**. | The manager can assign the driver by registered email only within an authorised tenant/fleet. |
| FL-02 | Fleet manager | Driver assignment exists. | Review Vehicles, Maintenance, Claims, Compliance, and Analytics. | The manager sees fleet-level operational data and can navigate to company-claim visibility. |
| FL-03 | Fleet driver | Active assignment exists. | Sign in and open `/fleet/driver`. | The dedicated driver workspace loads; it is not redirected to the manager workspace. |
| FL-04 | Fleet driver | Assigned vehicle and a new incident. | Review assigned vehicle, submit an incident/claim, and check status. | The driver sees only authorised assignments and own submitted claims. |

## KINGA Engineers Workflow

| ID | Role | Preconditions | Action | Expected result |
|---|---|---|---|---|
| EN-01 | Engineer | Engineer account. | Open `/engineer/dashboard`. | The dashboard renders projects, inspections, assets, intelligence, and reports without a runtime error. |
| EN-02 | Engineer | Project available. | Select **New Inspection** from the dashboard. | The existing inspection-register creation dialog opens; no navigation to `/engineer/new-inspection` occurs. |
| EN-03 | Engineer | Inspection/project data. | Create/open an inspection and review technical intelligence. | The inspection, asset passport, evidence, and reporting route are accessible and show actionable errors if a backend query fails. |

## Platform Administration Boundary Check

| ID | Role | Action | Expected result |
|---|---|---|---|
| AD-01 | Platform super admin | Open `/platform/overview`. | The control tower exposes governance, monitoring, security, and configuration—not operational claim repair or quoting work. |
| AD-02 | Platform super admin | Use View As for Agency, Fleet Driver, Panel Beater, Assessor, Engineer, and Insurer sub-roles. | The banner remains visible, expiry is clear, and exit restores the original identity. |

## Release Gate

The portal release is acceptable only when **P0-01 through P0-04 all pass**, and every workflow with an available test account has a passing route, read, mutation, and error-state result. Any P0 failure is a **No-Go** for further pilot demonstration. Any blocked role scenario must be completed before a role-specific production sign-off is claimed.
