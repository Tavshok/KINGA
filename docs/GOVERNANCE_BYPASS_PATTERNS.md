# Governance Bypass Patterns

This document defines approved patterns for bypassing governance enforcement rules in specific, justified scenarios.

## Overview

KINGA's governance enforcement system uses custom ESLint rules to prevent:
1. Direct claim status updates outside WorkflowEngine
2. Direct role updates outside roleAssignmentService
3. Missing tenant filters in multi-tenant queries

However, certain system-level operations require bypassing these rules. This document catalogs all approved bypass patterns.

---

## 1. Direct Claim Status Updates

### Rule: `no-direct-claim-status-update`

**Policy:** All workflow state changes MUST go through `WorkflowEngine.transition()` to ensure audit logging, segregation-of-duties enforcement, and state machine validation.

### Approved Bypass Patterns

#### Pattern 1: Workflow Engine Internals
**Location:** `server/workflow/` directory  
**Justification:** The workflow engine itself must directly manipulate status fields to implement state transitions.  
**Implementation:** Files in `server/workflow/` are automatically exempted from this rule.

```typescript
// server/workflow/state-machine.ts
// ✓ ALLOWED: Workflow engine internal implementation
await db.update(claims)
  .set({ workflowState: newState })
  .where(eq(claims.id, claimId));
```

#### Pattern 2: Test Files
**Location:** `*.test.ts`, `test-helpers/` directory  
**Justification:** Test setup requires direct database manipulation to create specific test scenarios.  
**Implementation:** All test files are automatically exempted.

```typescript
// server/workflow-integration.test.ts
// ✓ ALLOWED: Test setup
await db.update(claims)
  .set({ status: "pending_assessment" })
  .where(eq(claims.id, testClaimId));
```

#### Pattern 3: Migration Scripts
**Location:** `server/migrations/` directory  
**Justification:** Data migrations require direct database access to fix historical data or perform schema migrations.  
**Implementation:** Migration scripts are automatically exempted.

```typescript
// server/migrations/fix-legacy-statuses.mjs
// ✓ ALLOWED: Data migration
await db.update(claims)
  .set({ workflowState: mapLegacyStatus(claim.status) })
  .where(eq(claims.id, claim.id));
```

### Violation Examples

```typescript
// ✗ FORBIDDEN: Direct status update in router
await db.update(claims)
  .set({ status: "approved" })
  .where(eq(claims.id, claimId));

// ✓ CORRECT: Use WorkflowEngine
await workflowEngine.transition({
  claimId,
  targetState: "approved",
  actorId: ctx.user.id,
  justification: "Claim approved after review",
});
```

---

## 2. Direct Role Updates

### Rule: `no-direct-role-update`

**Policy:** All role changes MUST go through `assignUserRole()` from `user-management.ts` to ensure audit trail logging and tenant isolation.

### Approved Bypass Patterns

#### Pattern 1: Role Assignment Service
**Location:** `server/services/user-management.ts`  
**Justification:** The role assignment service itself must directly update roles to implement the assignment logic.  
**Implementation:** This file is automatically exempted.

```typescript
// server/services/user-management.ts
// ✓ ALLOWED: Role assignment service implementation
await db.update(users)
  .set({ role: request.newRole, insurerRole: request.newInsurerRole })
  .where(eq(users.id, request.userId));
```

#### Pattern 2: Audit Service Internals
**Location:** `server/services/role-assignment-audit.ts`  
**Justification:** Audit service may need to read role values for logging purposes.  
**Implementation:** This file is automatically exempted.

#### Pattern 3: Initial User Creation
**Location:** Any file  
**Justification:** INSERT operations (user registration) are allowed; only UPDATE operations are restricted.  
**Implementation:** Rule only triggers on `db.update(users).set({ role: ... })`

```typescript
// ✓ ALLOWED: Initial user creation
await db.insert(users).values({
  openId: newUser.openId,
  name: newUser.name,
  email: newUser.email,
  role: "claimant", // Initial role assignment is allowed
  tenantId: newUser.tenantId,
});
```

#### Pattern 4: Test Files & Migrations
**Location:** `*.test.ts`, `test-helpers/`, `server/migrations/`  
**Justification:** Same as claim status bypass patterns.  
**Implementation:** Automatically exempted.

### Violation Examples

```typescript
// ✗ FORBIDDEN: Direct role update in router
await db.update(users)
  .set({ role: "admin" })
  .where(eq(users.id, userId));

// ✓ CORRECT: Use assignUserRole
await assignUserRole({
  userId,
  newRole: "admin",
  changedByUserId: ctx.user.id,
  justification: "Promoting user to admin for system management",
});
```

---

## 3. Missing Tenant Filters

### Rule: `require-tenant-filter`

**Policy:** All queries on multi-tenant tables (`claims`, `users`, `roleAssignmentAudit`, `workflowAuditTrail`) MUST include `tenantId` filtering to enforce tenant isolation.

### Approved Bypass Patterns

#### Pattern 1: System Core Operations
**Location:** `server/_core/` directory  
**Justification:** System-level operations (OAuth, authentication, session management) operate across tenants.  
**Implementation:** All files in `server/_core/` are automatically exempted.

```typescript
// server/_core/oauth.ts
// ✓ ALLOWED: System-level authentication
const user = await db.select()
  .from(users)
  .where(eq(users.openId, openId))
  .limit(1);
```

#### Pattern 2: Governance-Safe Wrappers
**Location:** Any file  
**Justification:** Functions like `getClaimsByState()` already enforce tenant filtering internally.  
**Implementation:** Queries using these wrappers are automatically exempted.

```typescript
// ✓ ALLOWED: Using governance-safe wrapper
const claims = await workflowQueries.getClaimsByState({
  tenantId: ctx.user.tenantId,
  state: "under_assessment",
});
```

#### Pattern 3: Explicit ESLint Disable Comment
**Location:** Any file  
**Justification:** Admin-only operations explicitly documented with justification comment.  
**Implementation:** Add `// eslint-disable-next-line require-tenant-filter` before the query.

```typescript
// Admin operation: System-wide user search for support purposes
// eslint-disable-next-line require-tenant-filter
const allUsers = await db.select()
  .from(users)
  .where(like(users.email, `%${searchTerm}%`));
```

**⚠️ Warning:** Use this pattern sparingly. Every usage should be documented with a justification comment explaining why tenant isolation is not required.

#### Pattern 4: Test Files & Migrations
**Location:** `*.test.ts`, `test-helpers/`, `server/migrations/`  
**Justification:** Same as previous bypass patterns.  
**Implementation:** Automatically exempted.

### Violation Examples

```typescript
// ✗ FORBIDDEN: Query without tenant filter
const claims = await db.select()
  .from(claims)
  .where(eq(claims.status, "pending"));

// ✓ CORRECT: Include tenant filter
const claims = await db.select()
  .from(claims)
  .where(and(
    eq(claims.tenantId, ctx.user.tenantId),
    eq(claims.status, "pending")
  ));

// ✓ BETTER: Use governance-safe wrapper
const claims = await workflowQueries.getClaimsByState({
  tenantId: ctx.user.tenantId,
  state: "pending",
});
```

---

## Enforcement in CI/CD

The governance check script (`scripts/governance-check.sh`) runs all three rules and fails the build if violations are detected.

### Running Governance Checks

```bash
# Run all governance checks
pnpm governance:check

# Run ESLint with governance rules only
pnpm lint:governance

# Run standard ESLint (includes governance rules)
pnpm lint
```

### CI Integration

Add to your CI pipeline (e.g., GitHub Actions, GitLab CI):

```yaml
- name: Governance Compliance Check
  run: pnpm governance:check
```

The script exits with code 1 if violations are found, failing the build.

---

## Adding New Bypass Patterns

If you need to add a new bypass pattern:

1. **Document the justification** - Explain why the bypass is necessary
2. **Update the ESLint rule** - Modify the relevant rule in `eslint-rules/`
3. **Update this document** - Add the new pattern to the appropriate section
4. **Get approval** - Security/compliance review required for new bypass patterns

---

## Audit Trail

All approved bypass patterns are logged in this document. Changes to bypass patterns require:
- Security team approval
- Compliance team review
- Update to this documentation
- Git commit with detailed justification

**Last Updated:** 2026-02-16  
**Approved By:** System Architect  
**Next Review:** 2026-05-16 (Quarterly review required)
