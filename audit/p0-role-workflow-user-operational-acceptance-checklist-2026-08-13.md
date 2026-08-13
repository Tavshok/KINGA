# P0 Role-to-Workflow and Portal Route-Conformance Operational Acceptance Checklist

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 13 August 2026  
**Purpose:** Authenticated, user-executed acceptance of the approved P0 portal route and role-conformance corrections. This checklist does not authorize policy issuance, premium changes, claim edits, repair updates, settlement, payments, or data export.

## Pre-conditions

Use non-production or deliberately non-operative test accounts where possible. Keep one authenticated session per role and do not complete financial or operational actions. The platform-super-admin may test portal shells, but must not use shell access as evidence of cross-tenant object authority.

## Acceptance matrix

| Persona | Starting action | Expected destination and outcome | Must not happen |
|---|---|---|---|
| Claimant | Sign in, open **My Portal**, then profile, claim submission, valuation, insurance request, and a claim detail | Client/fleet service pages open without a loop; own data only | Insurer, agency, assessor, panel-beater, engineer, or control-tower portal access |
| Fleet manager | Open Fleet, then a company-vehicle claim detail | Fleet shell opens; company vehicle claim detail is reachable subject to object authorization | Client profile or independent insurance self-service, unrelated fleet data, or a loop |
| Fleet driver | Open assigned driver workspace, then permitted company-vehicle claim detail | Driver workspace and assigned claim detail open subject to assignment/object rules | Fleet-management administration, unrelated claims, or a loop |
| Agency user | Sign in and open the portal; try legacy `/agency/valuation`, `/agency/valuation-requests`, and `/agency/valuation/bulk` URLs | Agency service portal opens; legacy links return there rather than client self-service | Insurer fallback, client valuation self-service, or a loop |
| Insurer user | Open insurer portal and select an authorised insurer sub-role | Insurer workspace opens only for the authorised insurer tenant | Platform administration control-tower pages or another insurer workspace |
| Assessor | Open Assessor portal | Assessor workspace opens | Agency, insurer, panel-beater, fleet, client, engineer, or administration workspace |
| Panel beater | Open Panel Beater portal | Repairer workspace opens | Agency, insurer, fleet, client, engineer, or administration workspace |
| Engineer | Open Engineers portal, intelligence, and asset passport | Engineer workspace opens consistently | Unsupported role route, insurer fallback, or administration workspace |
| Platform super-admin | Open each portal shell from the professional landing | Shell access works without a route loop; tenant selection/object controls remain explicit | Silent access to another tenant’s claim, document, report, quotation, policy, or settlement object |

## Required observations

Record each result as **Pass**, **Forbidden as expected**, **Unavailable with clear message**, or **Defect**. For each defect, capture the route, signed-in role, expected outcome, observed outcome, browser console error if any, and a timestamp. In particular, report any persistent “Verifying access” state, return to a retired portal hub, unauthorized redirect loop, blank page, or React runtime error.

## Completion boundary

This checklist validates only portal-shell navigation and role admission. It does **not** validate a financial, policy, claim, repair, payment, settlement, or external-provider action. Any route that reaches the correct shell but is denied from a foreign object remains correctly protected and should be recorded as **Forbidden as expected**.
