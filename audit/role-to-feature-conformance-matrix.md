# KINGA Role-to-Feature Conformance Matrix

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 11 August 2026  
**Purpose:** Define which features, data, actions, routes, and empty states belong in each KINGA portal. This matrix is the control document for removal of cross-role leakage and orphaned states.

> **Boundary rule:** A portal may expose a cross-role link only where it leads to the user’s own role-correct context. It must not render another role’s operational queue, mutation controls, or tenant-wide records.

| Portal / role | Intended operating purpose | Required workspace tabs / actions | Data boundary | Explicit exclusions | Current source status | Live acceptance evidence |
|---|---|---|---|---|---|---|
| **My Portal** | Unified personal client experience: claimant, policyholder, valuation customer, and company-fleet contact. | Dashboard; personal vehicles; valuations; insurance requests/quotes/policies; claims; company context where authorised. | Current user’s own records; company visibility only through authorised client/company relationship. | Agency operational inbox; insurer processing; fleet manager controls; repairer tools. | Client routes and client-scoped insurance query ownership are implemented. | Client can open only own quote/policy; company link does not open Fleet Manager workspace. |
| **Insurer** | Insurer staff process claims, underwriting, approvals, portfolio and operations according to their assigned insurer sub-role. | Assigned sub-role workspace; claims and approvals appropriate to that role; portfolio and governance where authorised. | Assigned insurer tenant and assigned sub-role. | Agency client servicing; client-only valuation self-service; fleet driver workspace. | Sub-role selection and direct routing are implemented; super-admin testing bypass remains explicit. | Each insurer sub-role enters only its assigned workspace. |
| **Assessor** | Professional assessment workbench that turns KINGA intelligence into a documented human decision. | Queue; assessment workspace; KINGA toolkit; appointments; performance; calibration. | Assigned claims or role-authorised tenant claims. | Claim payment authority; agency quote dispatch; repairer quote submission. | Toolkit/data panels and claim detail workspace are implemented. | Assessor can open assigned claim, review evidence, record assessment, and see a useful empty state if no work is assigned. |
| **Panel Beater** | Repair partner workspace for allocated repairs and competitive quote submission. | Quote requests; direct line-item/VAT quote builder; quote history; repair evidence upload; repair completion; documents; performance. | Panel beater profile’s invitations and allocated repairs only. | Client claim initiation; insurer approval controls; agency client book. | Direct quote builder, allocation visibility, and profile-linking guidance are implemented. | Linked repairer receives allocation, submits VAT quote, uploads evidence, and marks repair complete. |
| **Agency** | Broker/agent service workspace for clients and insurer-market dispatch. | Client management; service request; selected-insurer dispatch; responses; policies; documents; commissions; comparison; performance. | Agency-managed clients and associated insurer responses. | Client’s personal self-service dashboard; bulk client valuation upload; insurer claim processing. | Client service request and selected-insurer dispatch implemented; valuation moved to My Portal. | Agent creates client request, selects insurers, receives response, and sends client document/quote. |
| **Fleet Manager** | Corporate fleet operations, governance, cost/risk visibility, and driver assignment. | Vehicles; drivers; maintenance; claims; compliance; analytics; bulk actions; period/custom-period report export. | Manager’s fleet(s), assigned drivers, fleet vehicles, and corporate claims. | Personal My Portal records; unrelated tenant fleet; Fleet Driver’s individual worklist. | Driver onboarding, cost/risk intelligence, custom periods, PDF export are implemented. | Manager assigns driver and sees fleet-only vehicles, claims, exposure, and risk. |
| **Fleet Driver** | Restricted operational workspace for an assigned company driver. | Assigned vehicles/work; claim/incident submission; own claim status; safety/compliance information. | Driver’s active fleet assignment, vehicles, and own claims only. | Fleet-wide analytics; driver onboarding; fleet manager mutations; other drivers’ claims. | Dedicated `/fleet/driver` route and scoped worklist implemented; route precedence fixed. | Driver cannot reach manager workspace through `/fleet/driver`; sees only assigned work. |
| **KINGA Engineers** | Engineering inspection and asset-risk workspace. | Projects; inspections; asset passports; engineering intelligence; engineering reports; inspection-to-claim linkage. | Assigned or role-authorised projects, inspections, assets, and linked claims. | Motor claims approval; agency commission; repairer quotes. | Inspection route correction, creation flow, and error states implemented. | Engineer creates inspection, links to project/claim where authorised, and accesses a report/export path. |
| **Platform Administration** | Control tower for cross-tenant governance, monitoring, access administration, and audit. | Platform overview; tenants; users; audit; system health; intelligence/queue monitoring; security; controlled view-as. | Platform-super-admin authorised cross-tenant view; audit identity must be retained. | Routine claims processing; repairs; agency service submission; daily fleet operations. | Control-tower navigation and super-admin access model exist. | View-as works with banner/audit; operations pages monitor rather than perform business work. |

## Current Proven Route Corrections

| Correction | Status | Evidence |
|---|---|---|
| Fleet Driver route precedes Fleet Manager wildcard | Implemented; live test pending | `/fleet/driver` is registered before `/fleet/:rest*`; portal regression test checks order. |
| Legacy claimant fleet routes open My Portal company context | Implemented; live test pending | Redirect target is `/client?tab=company`; `ClientPortal` consumes the tab query. |
| Legacy Agency valuation routes do not retain client self-service experience | Implemented; live test pending | Legacy Agency valuation paths redirect to client valuation context. |
| Panel Beater quote queue has a role-appropriate unlinked-profile state | Implemented; live test pending | Dashboard distinguishes no allocated work from missing repairer profile linkage. |
| Engineers inspection action resolves to a real route/dialog flow | Implemented; live test pending | Singular/plural route mismatch removed and creation action uses inspection register. |

## Orphan-State Standard

Every portal state must be one of the following:

1. **Loading** — tells the user what is loading and does not navigate away.
2. **Empty but configured** — explains that no current work exists and gives only a role-appropriate next action.
3. **Configuration required** — explains the missing profile, tenant linkage, or assignment and gives an administrator/role-appropriate remedy.
4. **Access denied** — preserves the attempted route, explains the required role, and provides a safe role-correct return route.
5. **Operational error** — exposes a human-readable error and a retry/safe return action; it must never silently render a blank page.

## Controlled Correction Process

Each future correction batch must identify the affected role, route, tab, backend procedure, visible action, and acceptance evidence before implementation. A batch is not considered complete until its source tests/builds pass **and** the relevant real role has performed the listed live acceptance check.
