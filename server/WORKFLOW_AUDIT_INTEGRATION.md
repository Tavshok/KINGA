# Workflow Audit Trail Integration Guide

## Overview

This guide explains how to integrate workflow audit logging into all claim state mutation procedures to ensure complete audit trail coverage.

## Core Principle

**Every claim workflow state change MUST be logged to the `workflow_audit_trail` table.**

This ensures:
- Complete audit trail for compliance
- Analytics data for processing metrics
- Transparency for all stakeholders
- Ability to track claim lifecycle

---

## Integration Pattern

### Option 1: Use `updateClaimStateWithAudit` (Recommended)

For procedures that ONLY update workflow state, use the atomic helper:

```typescript
import { updateClaimStateWithAudit } from "../utils/workflow-audit";

// Inside your mutation procedure
const result = await updateClaimStateWithAudit({
  claimId: input.claimId,
  userId: ctx.user.id,
  userRole: (ctx.user.insurerRole || "claims_processor") as UserRole,
  previousState: null, // Will be fetched automatically
  newState: "assigned", // Target state
  comments: "Claim assigned to assessor",
  metadata: {
    assessorId: input.assessorId,
    assignedBy: ctx.user.name,
  },
});

return {
  success: true,
  claim: result.claim,
  auditRecord: result.auditRecord,
};
```

### Option 2: Use `logWorkflowTransition` (For Complex Updates)

For procedures that update multiple fields along with workflow state:

```typescript
import { logWorkflowTransition } from "../utils/workflow-audit";
import { getDb } from "../db";
import { claims } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

// Inside your mutation procedure
const db = await getDb();

// Get current state
const [currentClaim] = await db
  .select()
  .from(claims)
  .where(eq(claims.id, input.claimId))
  .limit(1);

// Update claim with multiple fields
const [updatedClaim] = await db
  .update(claims)
  .set({
    workflowState: "financial_decision",
    approvedAmount: input.approvedAmount,
    approvedBy: ctx.user.id,
    updatedAt: new Date(),
  })
  .where(eq(claims.id, input.claimId))
  .returning();

// Log the transition
await logWorkflowTransition({
  claimId: input.claimId,
  userId: ctx.user.id,
  userRole: (ctx.user.insurerRole || "claims_processor") as UserRole,
  previousState: currentClaim.workflowState as WorkflowState,
  newState: "financial_decision",
  comments: `Financial decision: ${input.decision}`,
  decisionValue: input.approvedAmount,
  confidenceScore: input.confidenceScore,
  metadata: {
    decision: input.decision,
    approvedBy: ctx.user.name,
  },
});

return {
  success: true,
  claim: updatedClaim,
};
```

### Option 3: Use tRPC `workflowAudit.updateClaimState`

For frontend-initiated state changes:

```typescript
// Frontend code
const updateState = trpc.workflowAudit.updateClaimState.useMutation();

await updateState.mutateAsync({
  claimId: 123,
  newState: "closed",
  comments: "Claim resolved and closed",
  metadata: {
    resolution: "approved",
    finalAmount: 50000,
  },
});
```

---

## Workflow States

Valid workflow states (must match schema enum):

- `created` - Initial claim creation
- `intake_verified` - Claim intake verified
- `assigned` - Assigned to processor/assessor
- `under_assessment` - Being assessed
- `internal_review` - Internal review in progress
- `technical_approval` - Technical approval stage
- `financial_decision` - Financial decision made
- `payment_authorized` - Payment authorized
- `closed` - Claim closed
- `disputed` - Claim disputed

---

## User Roles

Valid user roles (must match schema enum):

- `claims_processor`
- `assessor_internal`
- `assessor_external`
- `risk_manager`
- `claims_manager`
- `executive`
- `insurer_admin`

---

## Procedures Requiring Integration

The following procedures in `server/routers.ts` update claim workflow state and MUST be updated:

### High Priority (Critical Workflow Transitions)

1. **assignClaimToAssessor** (Line ~810)
   - Updates state to `assigned`
   - Should log assessor assignment

2. **approveFinancialDecision** (Line ~1192)
   - Updates state to `financial_decision` or `payment_authorized`
   - Should log financial approval with decision value

3. **submitAssessorEvaluation** (Line ~1479)
   - May update state to `under_assessment` or `internal_review`
   - Should log assessment completion

4. **selectQuoteAndApprove** (Line ~1061)
   - Updates state to `technical_approval`
   - Should log quote selection and approval

### Medium Priority (Supporting Workflows)

5. **updateClaimPolicyVerification** (Line ~913)
   - May update state to `intake_verified`
   - Should log policy verification

6. **createClaim** (Line ~689)
   - Sets initial state to `created`
   - Should log claim creation

### Low Priority (Administrative)

7. Any procedure that calls `updateClaimStatus` or directly updates `workflowState`

---

## Implementation Checklist

For each procedure that updates `workflowState`:

- [ ] Import `logWorkflowTransition` or `updateClaimStateWithAudit`
- [ ] Import `WorkflowState` and `UserRole` types
- [ ] Capture previous state before update (if using `logWorkflowTransition`)
- [ ] Call logging function with all required parameters
- [ ] Include meaningful `comments` describing the transition
- [ ] Add `metadata` with relevant context (IDs, amounts, decisions)
- [ ] Test the procedure to verify audit logs are created
- [ ] Update procedure documentation

---

## Testing Workflow Audit Trail

After integrating audit logging, test with:

```typescript
// 1. Perform a claim state transition
const result = await trpc.claims.assignClaimToAssessor.mutate({
  claimId: 123,
  assessorId: 456,
});

// 2. Verify audit log was created
const history = await trpc.workflowAudit.getClaimHistory.query({
  claimId: 123,
});

console.log(history); // Should show the transition
```

Or run the workflow simulation test:

```bash
cd /home/ubuntu/kinga-replit
npx tsx run-simulation.mjs
```

Expected output should show:
- ✅ Audit Logging: PASS
- ✅ Analytics Data Availability: PASS

---

## Common Pitfalls

### ❌ Don't: Update state without logging

```typescript
// BAD - No audit trail
await db.update(claims)
  .set({ workflowState: "assigned" })
  .where(eq(claims.id, claimId));
```

### ✅ Do: Always log transitions

```typescript
// GOOD - Atomic update with audit
await updateClaimStateWithAudit({
  claimId,
  userId: ctx.user.id,
  userRole: ctx.user.insurerRole as UserRole,
  previousState: null,
  newState: "assigned",
  comments: "Claim assigned",
});
```

### ❌ Don't: Use hardcoded user roles

```typescript
// BAD - Hardcoded role
userRole: "claims_processor"
```

### ✅ Do: Use actual user role from context

```typescript
// GOOD - Dynamic role from auth context
userRole: (ctx.user.insurerRole || "claims_processor") as UserRole
```

### ❌ Don't: Skip metadata

```typescript
// BAD - No context
await logWorkflowTransition({
  claimId,
  userId: ctx.user.id,
  userRole: "claims_processor",
  previousState: "created",
  newState: "assigned",
});
```

### ✅ Do: Include relevant metadata

```typescript
// GOOD - Rich context for audit trail
await logWorkflowTransition({
  claimId,
  userId: ctx.user.id,
  userRole: "claims_processor",
  previousState: "created",
  newState: "assigned",
  comments: `Assigned to ${assessorName}`,
  metadata: {
    assessorId: input.assessorId,
    assignedBy: ctx.user.name,
    assignmentReason: input.reason,
  },
});
```

---

## Analytics Integration

Once workflow audit trail is complete, analytics queries can calculate:

- **Average processing time** per workflow stage
- **Bottleneck identification** (stages with longest duration)
- **User productivity metrics** (transitions per user)
- **Fraud pattern detection** (unusual state sequences)
- **SLA compliance** (time-to-resolution metrics)

Example analytics query:

```sql
SELECT 
  previous_state,
  new_state,
  AVG(TIMESTAMPDIFF(HOUR, created_at, 
    LEAD(created_at) OVER (PARTITION BY claim_id ORDER BY created_at)
  )) as avg_hours_in_state
FROM workflow_audit_trail
WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
GROUP BY previous_state, new_state;
```

---

## Support

For questions or issues with workflow audit integration:

1. Review this guide
2. Check `/server/utils/workflow-audit.ts` for implementation details
3. Run the workflow simulation test to verify integration
4. Consult the workflow simulation report for debugging

---

## Version History

- **v1.0** (2026-02-17): Initial workflow audit trail implementation
  - Created `workflow_audit_trail` table
  - Implemented `logWorkflowTransition` helper
  - Implemented `updateClaimStateWithAudit` atomic helper
  - Created tRPC procedures for audit operations
  - Documented integration patterns
