# P0 Package 4 — Direct Administrative Check Inventory

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 13 August 2026  
**Scope:** Active server admission checks and related portal-shell controls reviewed under P0 Package 4.

## Canonical Rule

All active server checks that determine administrative admission use `isAdminRole()` from `shared/role-permissions.ts`. The helper treats `admin` and `platform_super_admin` as administrative shell roles. It does **not** grant data, tenant, claim, document, financial, settlement, or workflow authority; those boundaries remain enforced by the relevant procedure and tenant/object controls.

## Active Check Classification

| File | Previous pattern | Classification | P0 Package 4 outcome |
|---|---|---|---|
| `server/_core/trpc.ts` | Direct `admin` admission / manual admin-or-super-admin branch | Canonical administrative guard | Replaced with `isAdminRole()` for protected administrative procedure admission and administrative tenant-selection branch. |
| `server/_core/domain-middleware.ts` | Direct `admin` tenant-presence exception | Canonical administrative shell admission | Replaced with `isAdminRole()`; downstream tenant and object checks remain required. |
| `server/_core/tenant-middleware.ts` | Direct `admin` tenant-context exception | Canonical administrative shell admission | Replaced with `isAdminRole()`; no data retrieval or object authorization was broadened. |
| `shared/role-permissions.ts` | Explicit `admin` / `platform_super_admin` comparison | Canonical helper implementation | Retained as the only direct role comparison for defining the helper itself. |
| `server/routers/**` business-role checks | Insurer, agency, fleet, assessor, claimant, or workflow-role predicates | Intentional business-role / object-security controls | Not converted. These checks are not generic administrative admission and remain required for workflow authority. |

## Client Shell Boundary

`ProtectedRoute`, `RoleGuard`, and `roleRouting.ts` now use the shared administrative role semantics for shell admission. The Client Portal is protected through the `customer` domain. Legacy route redirects use `useEffect` rather than render-phase navigation, and the unauthorized page sends a denied user to a validated internal canonical workspace route rather than browser history or the retired portal hub.

## Non-Claims

This inventory does not assert that a platform-super-admin may access any foreign tenant object. It records only portal-shell and generic administrative admission semantics. Tenant selection, report access, claims, documents, evidence, settlement, payment, policy, premium, and workflow procedures retain their pre-existing object-level authorization requirements.
