# KINGA Architecture Freeze Report — Epic 1: Role Enum Expansion

**Date:** 2026-07-30  
**Status:** FINAL — No code changes made  
**Reviewer:** Chief Software Architect  
**Scope:** Epic P1-E1 as defined in KINGA Implementation Specification v1.0  
**Method:** Read-only codebase inspection across `drizzle/schema.ts`, `server/_core/domain-middleware.ts`, `server/routers/agency-broker.ts`, `server/routers/admin.ts`, `server/services/user-management.ts`, `client/src/components/ProtectedRoute.tsx`, `client/src/pages/Login.tsx`, and all related test files.

---

## 1. What Epic 1 Proposes

The backlog item P1-E1 proposes the following changes to activate the `agency` role:

1. Add `'agency'` to the `users.role` mysqlEnum in `drizzle/schema.ts`
2. Add `'agency'` to `roleAssignmentAudit.previousRole` and `roleAssignmentAudit.newRole` enums in `drizzle/schema.ts`
3. Update the `agencyProcedure` guard in `server/routers/agency-broker.ts` to permit `role === 'agency'`
4. Update `admin.updateUserRole` procedure input schema to include `'agency'` in the allowed role enum
5. Update `assignUserRole` service type union to include `'agency'`
6. Add `'agency'` case to `getDashboardPath()` in `client/src/pages/Login.tsx`
7. Write a Vitest regression test confirming the guard change

---

## 2. Architecture Freeze Review — Seven-Question Challenge

Each proposed change is challenged against the seven mandatory questions.

---

### Change 1 — Add `'agency'` to `users.role` mysqlEnum

**1. Is this genuinely required?**  
Yes. The `users.role` column is a MySQL ENUM. MySQL enforces ENUM values at the storage layer. A user cannot be assigned `role='agency'` until the value exists in the column definition. This is a hard database constraint, not a code preference.

**2. Does an existing KINGA implementation already satisfy this requirement?**  
No. The comment block at `schema.ts:3282` (R-INF-09, 2026-07-09) explicitly documents that `'agency'` is intentionally absent and lists this exact change as step 1 of the activation checklist. The absence is deliberate and documented.

**3. Can an existing component simply be exposed instead?**  
No. The database column definition must change. There is no workaround that avoids this migration.

**4. Is there a smaller change that achieves the same result?**  
No. Adding one value to one ENUM column is already the smallest possible change.

**5. Does this introduce unnecessary architectural complexity?**  
No. MySQL ENUM expansion is additive and non-destructive. Existing rows retain their current values. No data migration is required.

**6. Does this duplicate an existing KINGA capability?**  
No. The `agency` role is distinct from all ten existing roles. The Agency portal (`/agency`, `/agency/quotes`) is built and waiting for this role to exist.

**7. Does this violate any platform principles?**  
No. The R-INF-09 comment explicitly states this change requires product sign-off before proceeding. That sign-off is the current instruction.

**Classification: APPROVED**

---

### Change 2 — Add `'agency'` to `roleAssignmentAudit.previousRole` and `roleAssignmentAudit.newRole` enums

**1. Is this genuinely required?**  
Yes. The `roleAssignmentAudit` table records every role transition. If a user is assigned `role='agency'`, the audit record must store `'agency'` in `newRole`. Without this change, the `logRoleAssignment` call inside `assignUserRole` will fail at the database layer with an ENUM constraint violation.

**2. Does an existing KINGA implementation already satisfy this requirement?**  
No. The current `roleAssignmentAudit.newRole` enum at `schema.ts:2777` lists ten values — `'agency'` is absent, matching the users table intentionally.

**3. Can an existing component simply be exposed instead?**  
No. This is a database column definition change.

**4. Is there a smaller change that achieves the same result?**  
No. Adding one value to two ENUM columns is already the minimal change.

**5. Does this introduce unnecessary architectural complexity?**  
No. The audit table already handles all other role transitions. This is a direct extension of existing behaviour.

**6. Does this duplicate an existing KINGA capability?**  
No.

**7. Does this violate any platform principles?**  
No. The audit trail is a platform requirement. Extending it to cover the new role is mandatory.

**Classification: APPROVED**

---

### Change 3 — Update `agencyProcedure` guard in `agency-broker.ts`

**1. Is this genuinely required?**  
Yes. The current guard at `agency-broker.ts:38–44` permits only `'admin'` and `'platform_super_admin'`. The comment at line 30 (R-INF-09) explicitly documents the required change: add `'agency'` to the role check. Without this change, a user with `role='agency'` will receive a `FORBIDDEN` error on every agency procedure call.

**2. Does an existing KINGA implementation already satisfy this requirement?**  
Partially. The `domain-middleware.ts` file already defines `AGENCY_ROLES = ["agency", "admin"]` and `agencyDomainProcedure` using that constant. However, `agency-broker.ts` defines its own local `agencyProcedure` that does **not** use `domain-middleware.ts`. The two guards are independent.

**3. Can an existing component simply be exposed instead?**  
**Yes — and this is a simplification opportunity.** The `agencyDomainProcedure` exported from `domain-middleware.ts` already implements the correct role check (`AGENCY_ROLES = ["agency", "admin"]`). The local `agencyProcedure` in `agency-broker.ts` is a duplicate guard that was written before `domain-middleware.ts` was built. The correct fix is to **replace the local `agencyProcedure` with the imported `agencyDomainProcedure`** from `domain-middleware.ts`, eliminating the duplicate guard entirely.

**4. Is there a smaller change that achieves the same result?**  
The smallest correct change is to add `role !== 'agency'` to the existing guard condition. However, the architecturally correct change is to remove the duplicate guard and use the existing `agencyDomainProcedure`. Both achieve the same runtime result; the latter removes technical debt.

**5. Does this introduce unnecessary architectural complexity?**  
The proposed change (add one string to the condition) does not introduce complexity. The architecturally preferred change (use existing middleware) reduces complexity.

**6. Does this duplicate an existing KINGA capability?**  
The local `agencyProcedure` in `agency-broker.ts` duplicates `agencyDomainProcedure` from `domain-middleware.ts`. This is the duplication to remove, not introduce.

**7. Does this violate any platform principles?**  
No. The R-INF-09 comment documents this exact change as step 3 of the activation checklist.

**Classification: SIMPLIFY** — Replace local `agencyProcedure` with imported `agencyDomainProcedure` from `domain-middleware.ts` rather than patching the local guard. This removes a duplicate guard and uses the existing infrastructure.

---

### Change 4 — Update `admin.updateUserRole` input schema to include `'agency'`

**1. Is this genuinely required?**  
Yes. The `updateUserRole` procedure at `admin.ts:851` uses a `z.enum([...])` validator. If `'agency'` is not in the list, an admin attempting to assign the agency role via this procedure will receive a Zod validation error before the database is touched.

**2. Does an existing KINGA implementation already satisfy this requirement?**  
No. The current enum at line 851 lists ten values without `'agency'`.

**3. Can an existing component simply be exposed instead?**  
No. The Zod schema must be updated to match the new database enum.

**4. Is there a smaller change that achieves the same result?**  
No. Adding one string to one `z.enum([...])` call is already the smallest change.

**5. Does this introduce unnecessary architectural complexity?**  
No.

**6. Does this duplicate an existing KINGA capability?**  
No.

**7. Does this violate any platform principles?**  
No. The admin procedure is the correct mechanism for role assignment.

**Classification: APPROVED**

---

### Change 5 — Update `assignUserRole` service type union to include `'agency'`

**1. Is this genuinely required?**  
Yes. The `RoleAssignmentRequest.newRole` TypeScript union type at `user-management.ts:17` does not include `'agency'`. Without this change, TypeScript will reject any call to `assignUserRole` with `newRole: 'agency'` at compile time.

**2. Does an existing KINGA implementation already satisfy this requirement?**  
No. The type union is narrower than the database enum.

**3. Can an existing component simply be exposed instead?**  
No. The type definition must be updated.

**4. Is there a smaller change that achieves the same result?**  
No. Adding one string to one union type is already the smallest change.

**5. Does this introduce unnecessary architectural complexity?**  
No.

**6. Does this duplicate an existing KINGA capability?**  
No.

**7. Does this violate any platform principles?**  
No.

**Classification: APPROVED**

---

### Change 6 — Add `'agency'` case to `getDashboardPath()` in `Login.tsx`

**1. Is this genuinely required?**  
Yes. The `getDashboardPath` function at `Login.tsx:28` maps user roles to their post-login dashboard routes. Without an `'agency'` case, a user with `role='agency'` will fall through to the `default` case and be redirected to `/`, which is the public landing page — not the Agency portal.

**2. Does an existing KINGA implementation already satisfy this requirement?**  
No. The switch statement has no `'agency'` case.

**3. Can an existing component simply be exposed instead?**  
No. The route mapping must be updated.

**4. Is there a smaller change that achieves the same result?**  
No. Adding one `case` to one `switch` statement is already the smallest change.

**5. Does this introduce unnecessary architectural complexity?**  
No.

**6. Does this duplicate an existing KINGA capability?**  
No. The Agency portal routes (`/agency`, `/agency/quotes`) already exist in `App.tsx`. This change simply ensures the login redirect points to them.

**7. Does this violate any platform principles?**  
No.

**Classification: APPROVED**

---

### Change 7 — Write Vitest regression test

**1. Is this genuinely required?**  
Yes. The platform rules require test coverage for every change. The existing `agency.test.ts` tests quotation schema validation but does not test the role guard behaviour.

**2. Does an existing KINGA implementation already satisfy this requirement?**  
Partially. `auth.switchRole.test.ts` tests role assignment governance but does not test the `agencyProcedure` guard specifically.

**3. Can an existing component simply be exposed instead?**  
No. A new test targeting the guard change is required.

**4. Is there a smaller change that achieves the same result?**  
The test should be added to the existing `agency.test.ts` file rather than creating a new file, to keep related tests co-located.

**5. Does this introduce unnecessary architectural complexity?**  
No.

**6. Does this duplicate an existing KINGA capability?**  
No.

**7. Does this violate any platform principles?**  
No.

**Classification: APPROVED** — Add to existing `agency.test.ts`, do not create a new file.

---

## 3. Items Challenged and Rejected

The following items were considered during the review and rejected before reaching the classification stage.

**Rejected: New admin UI for role assignment.** The backlog item P1-E1 includes a sub-task to build a new admin UI page for assigning the `agency` role. The existing `admin.updateUserRole` tRPC procedure already supports role assignment. The existing admin panel at `/admin/tenants/:tenantId/roles` already provides a role management interface. No new UI is required. The `'agency'` value simply needs to be added to the existing role dropdown in that page. **Classification: REUSE EXISTING.**

**Rejected: New `agencyRoleAssignment` audit table.** The backlog considered whether a separate audit table was needed for agency role assignments. The existing `roleAssignmentAudit` table already records every role transition with `previousRole`, `newRole`, `changedByUserId`, `justification`, and `timestamp`. Extending its enums (Change 2 above) is sufficient. **Classification: REUSE EXISTING.**

**Rejected: New `agencyOnboarding` workflow.** The backlog item included an onboarding workflow for new agency users. No such workflow exists in the specification. The Agency portal pages (`KingaAgency.tsx`, `AgencyFleetQuotes.tsx`) are self-contained. An agency user with the correct role can access them immediately after login. No onboarding workflow is required for Epic 1. **Classification: REJECT — out of scope for Epic 1.**

---

## 4. Final Classification Summary

| # | Proposed Change | Classification | Justification |
|---|---|---|---|
| 1 | Add `'agency'` to `users.role` mysqlEnum | **APPROVED** | Hard database requirement; smallest possible change |
| 2 | Add `'agency'` to `roleAssignmentAudit` enums | **APPROVED** | Required for audit trail integrity |
| 3 | Update `agencyProcedure` guard | **SIMPLIFY** | Replace local duplicate guard with existing `agencyDomainProcedure` from `domain-middleware.ts` |
| 4 | Update `admin.updateUserRole` Zod schema | **APPROVED** | Required for admin role assignment to work |
| 5 | Update `assignUserRole` TypeScript type | **APPROVED** | Required for TypeScript compilation |
| 6 | Add `'agency'` case to `getDashboardPath()` | **APPROVED** | Required for correct post-login redirect |
| 7 | Write Vitest regression test | **APPROVED** | Add to existing `agency.test.ts` |
| R1 | New admin UI for role assignment | **REUSE EXISTING** | Existing admin panel already handles this |
| R2 | New `agencyRoleAssignment` audit table | **REUSE EXISTING** | Existing `roleAssignmentAudit` table is sufficient |
| R3 | New agency onboarding workflow | **REJECT** | Out of scope for Epic 1; not in specification |

---

## 5. Approved Work Package

After the Architecture Freeze Review, Epic 1 is reduced to the following six file changes and one test addition. No new files are created. No new tables are created. No new procedures are created.

| File | Change | Type |
|---|---|---|
| `drizzle/schema.ts` | Add `'agency'` to `users.role` mysqlEnum | DB migration |
| `drizzle/schema.ts` | Add `'agency'` to `roleAssignmentAudit.previousRole` and `.newRole` enums | DB migration |
| `server/routers/agency-broker.ts` | Replace local `agencyProcedure` with imported `agencyDomainProcedure` from `domain-middleware.ts`; remove local guard definition | Backend |
| `server/routers/admin.ts` | Add `'agency'` to `updateUserRole` input `z.enum([...])` | Backend |
| `server/services/user-management.ts` | Add `'agency'` to `RoleAssignmentRequest.newRole` union type | Backend |
| `client/src/pages/Login.tsx` | Add `case 'agency': return '/agency';` to `getDashboardPath()` | Frontend |
| `server/agency.test.ts` | Add role guard tests: agency role passes, non-agency role is rejected | Testing |

**Total: 6 file edits, 1 test addition. 0 new files. 0 new tables. 0 new procedures.**

---

## 6. Migration Risk Assessment

The two database migrations (Changes 1 and 2) are **additive ENUM expansions**. MySQL handles these as metadata-only changes in InnoDB — no row rewriting occurs. Existing rows are unaffected. The migration is reversible by removing the value from the ENUM, provided no rows have been assigned `role='agency'` (which is confirmed: 0 rows in production as of 2026-07-09 per R-INF-09).

**Rollback procedure:** If the migration must be reversed, run `pnpm db:push` after removing `'agency'` from the three ENUM definitions. No data loss occurs because no production user has `role='agency'`.

---

## 7. Regression Risk Assessment

| Risk | Likelihood | Mitigation |
|---|---|---|
| Existing Claims functionality breaks | **None** | No Claims-related files are touched |
| Existing insurer/assessor/fleet roles break | **None** | ENUM expansion is additive; existing values are unchanged |
| `agencyProcedure` replacement breaks existing agency procedures | **Low** | `agencyDomainProcedure` uses the same role list (`["agency", "admin"]`); admin access is preserved |
| `updateUserRole` Zod change breaks existing role assignments | **None** | Adding a value to a `z.enum` does not affect validation of existing values |
| Login redirect breaks for existing roles | **None** | Only a new `case` is added to the switch; existing cases are unchanged |

---

## 8. Acceptance Criteria (Frozen)

The following acceptance criteria are frozen for Epic 1. No implementation may be considered complete until all are satisfied.

1. A user with `role='agency'` can be created in the database without a constraint error.
2. A user with `role='agency'` is redirected to `/agency` after login.
3. A user with `role='agency'` can successfully call any `agencyProcedure` endpoint without receiving a `FORBIDDEN` error.
4. A user with `role='user'`, `role='insurer'`, or any other non-agency, non-admin role receives a `FORBIDDEN` error when calling an `agencyProcedure` endpoint.
5. A user with `role='admin'` continues to access agency procedures without error (backward compatibility).
6. The `admin.updateUserRole` procedure successfully assigns `role='agency'` to a target user.
7. A role assignment to `'agency'` is recorded in the `roleAssignmentAudit` table with the correct `newRole` value.
8. All existing Vitest tests pass without modification.
9. TypeScript compilation reports zero new errors.

---

## 9. Definition of Done (Frozen)

Epic 1 is complete when:

- All six file edits have been applied.
- `pnpm db:push` has been run and completed without error.
- `pnpm tsc --noEmit` reports zero new TypeScript errors.
- `pnpm test` passes all existing tests and the new agency role guard tests.
- A checkpoint has been saved and pushed to GitHub.
- The implementing engineer has confirmed each acceptance criterion above is satisfied.

---

## 10. Dependency Confirmation

Epic 1 has no dependencies on any other Epic. It is the correct starting point for Phase 1. All subsequent Epics (P1-E2 through P1-E6 and all Phase 2 work) may proceed after Epic 1 is complete and its checkpoint is merged.

---

*Architecture Freeze Report produced by read-only codebase inspection. No code was modified during this review.*
