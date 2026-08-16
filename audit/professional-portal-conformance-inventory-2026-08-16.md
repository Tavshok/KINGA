# Professional Portal Conformance Inventory

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Route-admission findings corrected or qualified; broader procedure/data-authority audit remains open

## Initial Route Findings

The application route registry uses a combination of `ProtectedRoute` domain admission and insurer sub-role `RoleGuard` checks. The insurer sub-role dashboard routes generally enforce both boundaries, while several older direct routes remain protected only by a broad insurer/platform admission. These require procedure and navigation tracing before they can be classified as a defect.

| Area | Initial route observation | Audit status |
|---|---|---|
| Insurer role dashboards | Executive, claims processor, internal assessor, risk manager, claims manager, and insurer admin routes use both insurer admission and sub-role guard. | Trace navigation/actions next |
| Direct insurer claim routes | Some legacy/direct insurer claim and comparison routes use broad insurer admission without an explicit sub-role guard. | Verify intended role/data authority |
| Fleet | Fleet uses the `fleet` domain shell; driver route is separately admitted for fleet roles. | Trace portal actions and server authority |
| Agency | Agency shell is domain-admitted and legacy valuation URLs redirect to the service shell. | Trace navigation/actions next |
| Assessor | Assessor dashboard, claim, performance, leaderboard, and external routes use assessor admission and assessor layout. | Trace report lifecycle and action authority |
| Panel beater | Dashboard and direct quote submission use panel-beater admission and layout. | Trace quote action authority |
| Platform | Most platform routes use `domain="platform"`; some historical admin-only routes use `allowedRoles=["admin"]` and require platform-super-admin conformance verification. | Verify platform testing access |
| Cross-workflow documents | The document route admits several workflow roles; object-level authority is stated as server-side. | Verify actual procedure boundaries |

## Scope Boundary

This inventory does not change routes, permissions, records, or workflows. Each observed route must be traced through its visible navigation, procedure, data scope, and failure state before a conformance finding is recorded.

## Initial Navigation-to-Route Mismatches

| Finding | Evidence | Preliminary classification |
|---|---|---|
| Shared-route registry is broader than actual route guard | `PORTAL_ROUTE_ROLES` declares exception intelligence and team members shared for all insurer roles, while `App.tsx` applies narrower `RoleGuard` rules. Navigation pre-check can therefore permit a route that later renders an unauthorised state. | P1 conformance candidate |
| Insurer-admin navigation points to administration domain | Insurer-admin sidebar links Workflow Settings to `/admin/workflows`; that destination belongs to the administration domain rather than insurer tenant administration. | P1 broken/incorrect-domain navigation candidate |
| Insurer external assessor sub-role has no dedicated landing | The role taxonomy includes `assessor_external`, but the canonical insurer sub-role route map has no matching landing entry. | P1 role-landing conformance candidate |
| Assessor tool navigation has no distinct destinations | Assessment Form and Documents both link to `/assessor`, the same assigned-claims dashboard route, while the actual authorised claim work surface is `/assessor/claims/:id`. | P1 orphaned-navigation candidate |
| Panel-beater navigation has no distinct destinations | Quote Requests, Quote History, Performance, and Documents all link to `/panel-beater/dashboard`; the direct authorised quote work route is `/panel-beater/claims/:id/quote`. | P1 orphaned-navigation candidate |
| Fleet driver sees manager registration action | Fleet management defines `isManager`, but the hero Register Vehicle control is rendered without that guard. Driver assignment and intelligence are conditionally guarded in the same component. | P1 role-action leakage candidate |
| Engineer sidebar can render an undefined icon | Projects and Asset Passport entries omit `icon`, while layout unconditionally renders `<Icon>`. | P0 professional portal render-risk candidate |
| Engineer work navigation reuses generic inspection destination | Evidence, Measurements, Observations, KINGA Analysis, Physics Check, and Sign-off all link to `/engineer/inspections` rather than a selected inspection work state. | P1 orphaned-navigation candidate |

These are route-contract observations only. Procedure authority and actual user-visible outcomes remain to be tested before any correction is proposed.

## Navigation-Correction Evidence

The current assessor and panel-beater sidebars confirm the recorded repeated-destination issue. Assessor Assessment Form and Documents both route to `/assessor`, while the actionable claim surface is selected only after navigating to `/assessor/claims/:id`. Panel-beater Quote Requests, Quote History, My Performance, and Documents all route to `/panel-beater/dashboard`, while direct authorised quoting occurs within `/panel-beater/claims/:id/quote`. The correction must make this in-context dependency explicit rather than imply separate destinations that do not exist.

## Insurer Parameterised Route Follow-up

The route scan identified several insurer sidebar destinations containing query strings or fragment identifiers, such as claims-manager queue filters and recovery/report status filters. Their base destinations are registered insurer routes; the scan classified the full parameterised strings as unregistered because it compares exact paths. These entries are therefore parameter-contract follow-ups, not missing-page destinations. A page-level tab or fragment behaviour check is required only if a specific user action fails.

## 16 August Correction Closeout

| Initial route/navigation finding | Current position |
|---|---|
| Shared registry broader than route guards | Corrected: Exception Intelligence and Team Members now use the same insurer-sub-role map as `App.tsx`; navigation rejects unauthorised roles before route entry. |
| Workflow Settings leaves insurer domain | Corrected: explicit platform-managed unavailable state. |
| External assessor lacks a landing | Corrected: assignment-governed external-assessor workspace and route admission. |
| Assessor and panel-beater repeated dashboard tools | Corrected: explicit context-only states direct the user to assigned claim work. |
| Fleet driver registration leakage | Corrected: manager-only control with driver explanation. |
| Engineer sidebar icon and repeated inspection destinations | Corrected: safe icon fallback and context-only inspection tasks. |
| Platform nested anchors and Claim Trace missing claim ID | Corrected: valid direct links and explicit in-context Claim Trace state. |
| Legacy platform admin-only route admission | Corrected: platform-super-admin shell testing admission added without object-authority expansion. |

The inventory's remaining scope is the documented role-to-feature procedure/data-source/mutation audit. Parameterised insurer route strings remain page-level behaviour follow-ups rather than route-admission defects.
