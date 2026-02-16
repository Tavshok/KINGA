# updateClaimStatus() Callers Analysis

**Total Callers Found:** 14 locations (excluding function definition)  
**Files Affected:** 2 production files + 1 test file

---

## Production Code Callers (11 locations)

### server/routers.ts (10 locations)

1. **Line 612** - `submitAssessorEvaluation` procedure
   - Context: After assessor submits evaluation
   - Current status: "assessment_pending"
   - User context: Available (ctx.user)
   - Tenant context: Available (from claim)

2. **Line 735** - `requestQuotes` procedure  
   - Context: Triage → Assessment pending
   - Current status: "triage"
   - User context: Available (ctx.user)
   - Tenant context: Available (from claim)

3. **Line 736** - `requestQuotes` procedure
   - Context: Assessment pending → Assessment in progress
   - Current status: "assessment_pending"
   - User context: Available (ctx.user)
   - Tenant context: Available (from claim)

4. **Line 737** - `requestQuotes` procedure
   - Context: Assessment in progress → (continuation)
   - Current status: "assessment_in_progress"
   - User context: Available (ctx.user)
   - Tenant context: Available (from claim)

5. **Line 739** - `requestQuotes` procedure
   - Context: Assessment pending → Assessment in progress (branch 2)
   - Current status: "assessment_pending"
   - User context: Available (ctx.user)
   - Tenant context: Available (from claim)

6. **Line 740** - `requestQuotes` procedure
   - Context: Assessment in progress → (continuation, branch 2)
   - Current status: "assessment_in_progress"
   - User context: Available (ctx.user)
   - Tenant context: Available (from claim)

7. **Line 742** - `requestQuotes` procedure
   - Context: Assessment in progress → (branch 3)
   - Current status: "assessment_in_progress"
   - User context: Available (ctx.user)
   - Tenant context: Available (from claim)

8. **Line 747** - `requestQuotes` procedure
   - Context: Assessment in progress → (final branch)
   - Current status: "assessment_in_progress"
   - User context: Available (ctx.user)
   - Tenant context: Available (from claim)

9. **Line 1274** - `submitPanelBeaterQuote` procedure
   - Context: After panel beater submits quote
   - Current status: "quotes_pending"
   - User context: Available (ctx.user)
   - Tenant context: Available (from claim)

10. **Line 1363** - `compareCosts` procedure
    - Context: After cost comparison complete
    - Current status: "comparison"
    - User context: Available (ctx.user)
    - Tenant context: Available (from claim)

---

## Test Code Callers (4 locations)

### server/claims.approveClaim.test.ts (4 locations)

11. **Line 54** - Test setup
    - Context: Setting up test claim state
    - Current status: "assessment_pending"
    - User context: NOT available (test environment)

12. **Line 55** - Test setup
    - Context: Setting up test claim state
    - Current status: "assessment_in_progress"
    - User context: NOT available (test environment)

13. **Line 56** - Test setup
    - Context: Setting up test claim state
    - Current status: "quotes_pending"
    - User context: NOT available (test environment)

14. **Line 57** - Test setup
    - Context: Setting up test claim state
    - Current status: "comparison"
    - User context: NOT available (test environment)

---

## Migration Strategy

### Production Code (10 callers)
All production callers have access to:
- `ctx.user.id` (userId)
- `ctx.user.role` (userRole)  
- `claim.tenantId` (tenantId)
- Current workflow state (from claim)

**Migration Pattern:**
```typescript
// BEFORE
await updateClaimStatus(claimId, "new_status");

// AFTER
const claim = await db.query.claims.findFirst({ where: eq(claims.id, claimId) });
await workflowEngine.transition({
  claimId,
  fromState: claim.workflowState,
  toState: mapStatusToWorkflowState("new_status"),
  userId: ctx.user.id,
  userRole: ctx.user.role as InsurerRole,
  tenantId: claim.tenantId,
  decisionData: {},
  aiSnapshot: null
});
```

### Test Code (4 callers)
Test callers need special handling since they don't have real user context.

**Migration Pattern:**
```typescript
// BEFORE
await updateClaimStatus(testClaimId, "assessment_pending");

// AFTER
// Option 1: Create test user context
const testUserId = 999;
const testUserRole = "claims_processor";
await workflowEngine.transition({
  claimId: testClaimId,
  fromState: "created",
  toState: "assessment_pending",
  userId: testUserId,
  userRole: testUserRole,
  tenantId: "test-tenant",
  decisionData: {},
  aiSnapshot: null
});

// Option 2: Use test helper function
await setupTestClaimState(testClaimId, "assessment_pending");
```

---

## Status → WorkflowState Mapping

The callers use old `status` enum values. Need to map to new `workflowState`:

| Old Status | New WorkflowState |
|-----------|------------------|
| triage | created |
| assessment_pending | assigned |
| assessment_in_progress | under_assessment |
| quotes_pending | internal_review |
| comparison | technical_approval |

---

## Implementation Order

1. **Create test helper** - `setupTestClaimState()` for test file migration
2. **Migrate test callers** (4 locations) - Validate tests still pass
3. **Migrate production callers** (10 locations) - One procedure at a time
4. **Remove legacy fallback** - Delete fallback path in `updateClaimStatus()`
5. **Add enforcement tests** - Ensure direct updates throw errors

---

## Risk Assessment

**Low Risk Callers (6):**
- Lines 735-747 in `requestQuotes` - Sequential state changes, clear user context

**Medium Risk Callers (4):**
- Lines 612, 1274, 1363 - Single state changes after user actions
- Need to verify state transition is legal according to workflow rules

**Test Callers (4):**
- Need test helper to avoid code duplication
- Must preserve test intent while adding governance

---

## Expected Outcome

After migration:
- ✅ 100% of state transitions route through WorkflowEngine
- ✅ All transitions have explicit userId, userRole, tenantId
- ✅ Automatic audit trail logging for every transition
- ✅ Segregation of duties validation enforced
- ✅ Role permission validation enforced
- ✅ Configuration constraints validated
- ✅ Tests confirm direct state updates are blocked
