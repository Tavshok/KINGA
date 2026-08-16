# Insurer Shared-Route Navigation Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

## Finding

The shared insurer route registry treated Exception Intelligence and Team Members as available to every insurer sub-role. The registered `App.tsx` routes already applied narrower guards. A claims processor could therefore pass the navigation pre-check, enter an unauthorised route, and receive the route-level denial state. That was an avoidable role-navigation mismatch.

## Correction

`PORTAL_ROUTE_ROLES` now mirrors the authoritative route guard contract:

| Route | Allowed insurer sub-roles |
|---|---|
| `/insurer-portal/exception-intelligence` | Risk Manager, Claims Manager, Executive, Insurer Admin |
| `/insurer-portal/team-members` | Insurer Admin |

The navigation helper now rejects an unauthorised insurer sub-role before navigation while retaining the existing `App.tsx` guard as defence in depth. Administrative shell users retain their existing explicit override behaviour. This is a navigation-boundary correction only; it does not alter server-side tenant, relationship, or object authority.

## Verification

The professional portal conformance suite passed **10/10**. It proves that a Claims Processor is blocked from both routes, an authorised Risk Manager can open Exception Intelligence, and an Insurer Admin can open Team Members. It also proves that the actual route guards remain aligned with the registry.

No claims, policies, quotes, costs, payments, settlements, assignments, workflows, or user records changed.

## References

1. [Shared insurer routing contract](../client/src/lib/roleRouting.ts)
2. [Application route guards](../client/src/App.tsx)
3. [Professional portal conformance regression](../server/professionalPortalConformance.p1.test.ts)
