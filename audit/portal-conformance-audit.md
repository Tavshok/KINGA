# KINGA Portal Conformance Audit

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 11 August 2026  
**Scope:** Live-user screenshots, route inventory, principal portal pages, and their corresponding tRPC capability surfaces.

## Executive Finding

The platform currently contains significant underlying capability, but several operational workspaces do not yet expose that capability through the correct role-specific workflow. The principal pattern is **functional backend capability coupled with client-style or placeholder frontend behaviour**. This is why the Agency Portal still presents “My Quotations” and permits quote acceptance, while the separate `agencyBroker` router already supports client records, agency-sourced claims, multi-insurer quote dispatch, commission summaries, and performance metrics.

The root landing-page failure was also confirmed as a real regression: `Home.tsx` called `useAuth()` after its import had been removed. The import has now been restored. Two reusable static checks have been added for hook-import and lazy-page export regressions.

| Portal | Required operating role | Current conformance | Priority finding |
|---|---|---:|---|
| My Portal | Client self-service for claims, insurance, valuation, personal/company fleet visibility, and documents | Partial | Correct destination for self-service valuation; needs a clearer single customer journey and client-owned request status views. |
| Insurer | Tenant insurer operations with sub-role workspaces | Partial | Broad route and feature coverage exists; operational routes need systematic role-action verification. |
| Assessor | Professional claim assessment workspace powered by KINGA engines | Partial | Rich assessment data exists, but dashboard discoverability and direct tool actions remain limited. |
| Panel Beater | Repair-partner workspace for allocated work, direct itemised quotations, repair evidence, and completion | Partial | Quote builder is now professional, but the dashboard links to a non-existent claim-detail route instead of the quote builder. |
| Agency | Broker/agent service workspace operating on behalf of agency-managed clients | Fail | UI remains tied to self-service `myQuotations`, policy acceptance, and personal quotation language, while the broker-service backend is unused. |
| Fleet | Fleet operator workspace with manager control and a driver experience assigned by the manager | Partial | Vehicle/maintenance features exist, but driver-specific route is redirected away and no manager-facing driver assignment workflow is exposed. |
| KINGA Engineers | Risk-engineering workspace for inspection projects, field evidence, asset passports, and technical intelligence | Partial | Project and inspection procedures exist, but dashboard buttons target the missing `/engineer/new-inspection` route. |
| Platform Administration | Governance, monitoring, security, and configuration control tower | Partial | Principal monitoring/admin routes exist; should remain excluded from day-to-day operational work. |

## P0 Runtime and Route Findings

| Reference | Evidence | Effect | Correction |
|---|---|---|---|
| P0-1 | `Home.tsx` called `useAuth()` without importing it. | Landing page can fail before portal navigation renders. | Restored the import and added a static hook-import audit. |
| P0-2 | User supplied a production error boundary showing minified React error #130. | Production application renders an unexpected-error page. | The fixed root import must be published; new static lazy-page audit verifies 130 page exports. |
| P0-3 | `PanelBeaterDashboard.tsx` navigates to `/panel-beater/claims/:id`, but App only defines `/panel-beater/claims/:id/quote`. | Repair partner encounters a dead route when selecting a quote request. | Change navigation to the quote builder or add a proper allocation-detail route. |
| P0-4 | `EngineerDashboard.tsx` links to `/engineer/new-inspection`; App has no such route. | New Inspection control is a dead route. | Direct the action to `/engineer/inspections`, where the existing create dialog is implemented. |
| P0-5 | `KingaAgency.tsx` calls `setLocation('/agency/commissions')` during render. | Render-side navigation risks loops and unstable behaviour. | Move navigation into an event handler or render a commission workspace inline. |

## Role Conformance Findings

### Agency Portal — Must Be Rewired First

The visible screenshot is accurate: this portal says “Professional Insurance Service Portal” but displays **“My Quotations,” “Request New Quote,” and acceptance of a quote**. Those are client actions. The implementation calls `agency.myQuotations`, `agency.myPolicies`, and `agency.submitQuotation`, despite an existing dedicated `agencyBroker` router that supports the intended operational model.

The corrected Agency workflow must be:

> Create or select agency client → maintain client profile and evidence → create agency-sourced request/claim → request pricing from selected insurers → compare insurer responses → capture client instruction → issue/follow policy → track commission and renewal.

Legacy Agency valuation routes must be redirected to My Portal or replaced with **“request valuation for an existing client”** under the agency client record. They must not offer bulk client-self-service valuation directly from an Agency homepage.

### Panel Beater Portal

The screenshot shows an operationally valid empty state: no repairs have been allocated to the current panel-beater account. However, the portal is incomplete because the allocated quote row currently routes to a URL that does not exist. The complete workflow is:

> Allocated repair request → review vehicle/evidence/damage scope → build direct itemised quote → VAT and terms → submit → approval/revision → upload repair evidence → mark repair complete.

The direct quote builder exists after the latest implementation but must be wired from the queue and the queue requires a deliberate insurer/allocation mechanism.

### Fleet Management

The current Fleet workspace has vehicle, import/export, maintenance, compliance, analytics, and driver-list capability. The manager-to-driver entry points have now been restored:

> Fleet manager: register fleet, add a driver account, assign driver to fleet/vehicle, manage compliance and claims.  
> Assigned driver: see assigned vehicle, submit an incident/claim, upload evidence, read repair/claim status, complete vehicle checks.

`/fleet/driver` now renders the dedicated driver workspace instead of redirecting into the manager workspace. Fleet managers can assign an existing `fleet_driver` account by registered email from the Drivers tab. The server validates manager authority, tenant consistency, driver role, and duplicate assignments, then records the assignment in the audit trail. The driver workspace receives only active fleet assignments, fleet vehicles, and claims submitted by that driver.

**Remaining limitation:** The current schema models a driver-to-fleet assignment, not a driver-to-single-vehicle history. The next fleet enhancement should add a dedicated assignment-history table if operations require a manager to designate a particular vehicle for a particular driver over a date range.

### KINGA Engineers

The core workspace architecture is appropriate: projects, inspections, asset passports, intelligence, and reports. The current failure is route integrity, not missing engine capability. The existing inspection register already contains a create-inspection dialog; dashboard controls must route there rather than to the non-existent new-inspection page.

## Implementation Sequence

1. Publish the root crash fix and then verify the landing page in the user's live browser.
2. Remove the two P0 dead routes and the Agency render-side navigation side effect.
3. Rewire Agency to the `agencyBroker` service procedures; change all client-self-service wording and actions.
4. Wire Panel Beater quote request rows directly into the professional quote builder.
5. Provide manager onboarding/assignment and a true driver worklist for Fleet.
6. Run a role-by-role route test matrix before each future portal checkpoint.
