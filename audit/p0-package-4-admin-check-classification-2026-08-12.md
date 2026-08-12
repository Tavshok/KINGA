# P0 Package 4 Administrative Check Classification

**Author:** Tavonga Shoko, Lead Engineer  
**Status:** Pre-change classification for approved P0 Package 4

## Decision rule

Direct role checks are being changed only where they answer the question, **“is this user an administrator?”** Workflow roles, insurer sub-roles, ownership checks, and tenant/object predicates remain distinct controls.

| File or control group | Current pattern | Classification | Package 4 action |
|---|---|---|---|
| `server/routers/tenant.ts` | Repeated `ctx.user.role !== 'admin'` and `=== 'admin'` around tenant administration | Genuine platform administration | Replace with `isAdminRole()` while retaining explicit tenant/object predicates. |
| `server/routers/vehicle-valuation-core.ts` | Direct admin comparisons for cross-tenant/global valuation administration | Genuine administration mixed with tenant scoping | Use `isAdminRole()` only for administrative/global branch; preserve valuation-owner/tenant checks. |
| `server/routers/workflow-queries.ts` | `insurer` or `admin` access admission | Administrative fallback around insurer operation | Use canonical admin check while retaining insurer and insurer-sub-role workflow control. |
| `server/services/user-management.ts` | `actor.role === 'admin'` in management authorization | Genuine administration | Use canonical helper; do not alter user-target or tenant restrictions. |
| `client/src/components/ProtectedRoute.tsx` | Domain role lists exclude platform-super-admin from `portal` | Route admission defect | Add bounded platform-super-admin admission to the client-detail portal domain only; object procedures remain authoritative. |
| `client/src/components/RoleGuard.tsx` | Direct admin/platform-super-admin UI override | UI portal-shell testing decision | Preserve the bounded override behavior, refactor to shared canonical helper if available to client, and retain visible testing indicator. |
| `client/src/App.tsx` explicit `allowedRoles` | Portal and admin route lists | Route admission policy | Add platform-super-admin only to intended testing shells; retain insurer sub-role `RoleGuard` and underlying backend controls. |
| Insurer sub-role `allowedRoles` arrays | `claims_manager`, `executive`, `insurer_admin`, etc. | Intentional workflow permission | **Retain.** Do not convert to generic administration. |
| Workflow state machines and transition matrices | Specific role arrays | Intentional workflow permission | **Retain.** Do not broaden with platform-super-admin. |
| Package 1 report, agency, intelligence scope helpers | Tenant/object checks and explicit cross-tenant audit | Security boundary | **Retain unchanged.** Package 4 must prove no regression. |

## Remaining direct `admin` comparisons deliberately retained

The server-wide scan found further direct checks in claim, report, valuation, quote, marketplace, analytics, approval, onboarding, and workflow procedures. These are **not** mechanically converted in this package because the compared `admin` branch currently changes tenant scoping, grants an object-owner bypass, or combines an insurer workflow role with a platform role. Replacing any of them with `isAdminRole()` without an explicit Package 1 selection and object predicate would create the precise cross-tenant bypass Package 4 must avoid.

| Control pattern | Example families | Reason retained in Package 4 | Required future treatment |
|---|---|---|---|
| `admin ? undefined : sessionTenantId` | claims, quotes, valuations, assessment and analytics tenant filters | Converts a role comparison into a cross-tenant data-scope decision. | Refactor procedure-by-procedure to `resolveP0TenantScope`, validate selected tenant, and audit cross-tenant use. |
| `claimantId === user.id || role === 'admin'` | claim detail/download/edit paths | An object-owner bypass cannot become a generic platform-shell privilege. | Add explicit object-scope selection/audit and foreign-object negative tests before altering. |
| `insurerRole === X || role === 'admin'` | approval, compliance, workflow/query routes | Combines business workflow permission with platform administration. | Define a dedicated platform-testing path; retain underlying workflow decision permission. |
| `admin` global operation without tenant input | auth/bootstrap, seed, marketplace/valuation administration | Has no explicit target tenant to validate or audit. | Introduce an explicit platform-operation contract and audit event in a separately approved package. |

This retained set is not dead work: it is the bounded outcome required by `ADM-02` and `ADM-03`. P0 Package 4 changes only administrative checks that can be made canonical without silently broadening tenant or object access.

## Route-admission classification

| Route family | Current intended platform-super-admin result | Package 4 route treatment |
|---|---|---|
| `/claims/:id` client claim detail | Allow route/testing shell; claim object stays tenant/object constrained | Add platform-super-admin to `portal` domain admission. |
| `/client/*` customer experience | Existing customer domain already allows platform-super-admin | Preserve. |
| `/insurer-portal/*` professional insurer shells | Outer admission already allows platform-super-admin; `RoleGuard` contains override | Preserve and test deterministic admission. |
| `/agency`, `/fleet`, `/engineer`, `/marketplace` | Existing domains already include platform-super-admin | Preserve and test admission only. |
| `/platform/*` | Existing platform domain is platform-super-admin only | Preserve. |
| `/admin/*` explicit admin-only entries | Intended platform testing surfaces, subject to backend authorization | Add only the approved platform-super-admin testing admission; do not grant tenant-object ownership. |

## Deliberately retained role distinctions

The following are not generic administrative checks and must not be mechanically replaced: insurer sub-roles, claim workflow transitions, policy/recovery/valuation business permissions, panel-beater and assessor assignments, fleet role selection, agency commercial controls, and tenant/object ownership predicates.
