# Security Hardening Mode - Role-Based Access Control

## PHASE 1 — Fix Role Switch SQL Error
- [x] Search entire repo for raw SQL: `update users set` (none found)
- [x] Verify setInsurerRole uses Drizzle ORM (not raw SQL)
- [ ] Test role switching (no SQL errors)

## PHASE 2 — Add Sub-Role Enforcement in ProtectedRoute
- [x] Update ProtectedRoute.tsx with allowedInsurerRoles prop
- [x] Add insurerRole checking logic
- [x] Ensure admin bypass works (admin not checked)
- [x] Ensure non-insurer roles ignore insurerRole check (only applies to role=insurer)

## PHASE 3 — Apply Sub-Role Restrictions to Critical Pages
- [x] /insurer/dashboard → claims_manager, risk_manager, executive, insurer_admin
- [ ] /insurer/internal-assessment → internal_assessor
- [x] /insurer/external-assessment → claims_manager, claims_processor, executive, insurer_admin
- [x] Governance dashboard → risk_manager, claims_manager, executive, insurer_admin
- [x] Confirm admin bypass preserved (admin not checked for insurerRole)

## PHASE 4 — Backend Enforcement (CRITICAL)
- [x] Claim assignment procedures (already enforced in intake-gate.ts)
- [x] Executive override procedures (already enforced in intake-gate.ts)
- [x] Governance analytics procedures (already enforced in governance-dashboard.ts)
- [x] Workload balancing procedures (already enforced in intake-gate.ts)
- [x] External assessment approval procedures (already enforced in policy-management.ts)

## PHASE 5 — Verify No Privilege Escalation
- [ ] Test: claims_processor → governance dashboard (denied)
- [ ] Test: internal_assessor → assign claim (denied)
- [ ] Test: claims_manager → assign claim (allowed)
- [ ] Test: admin → all insurer routes (allowed)
- [ ] Test: insurer with null insurerRole → insurer dashboard (denied)

## PHASE 6 — RoleSetup Page Audit
- [x] Change allowed roles from ["user","admin","insurer",...] to ["insurer","admin"]
- [x] Verify only insurers can configure insurer sub-role

## PHASE 7 — Regression Validation
- [ ] Switch role to internal_assessor (no SQL error)
- [ ] Switch role to claims_manager (no SQL error)
- [ ] Navigate between insurer pages (correct restrictions)
- [ ] Confirm session updates correctly
- [ ] Confirm no TypeScript errors

## FINAL CHECK
- [ ] Confirm no raw SQL remains
- [ ] List routes updated
- [ ] List backend procedures guarded
- [x] Confirm admin bypass preserved (admin not checked for insurerRole)
- [ ] Generate security hardening report
