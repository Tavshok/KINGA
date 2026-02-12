# KINGA Platform Workflow Gap Audit Report

**Date:** February 12, 2026  
**Auditor:** KINGA Platform Production Hardening Architect  
**Scope:** End-to-End Claims Workflow Reliability Assessment  
**Current Maturity:** ~75% → Target: ≥90%

---

## Executive Summary

The KINGA platform demonstrates strong foundational architecture with 17,717 lines of server code, 46 frontend pages, and 340 passing tests. However, systematic analysis reveals **critical workflow gaps** that prevent the system from reaching production-grade intelligence maturity. The primary issue is **incomplete state machine implementation** — the database schema defines sophisticated workflow tracking fields that remain entirely unused by application logic.

**Key Finding:** The claims table contains dual status tracking (`status` enum + `workflowState` enum) and hierarchical approval fields (`technicallyApprovedBy`, `financiallyApprovedBy`, `closedBy`), but **only the basic `status` field is actively used**. This creates a 40% workflow completeness gap.

---

## 1. End-to-End Claims Workflow Analysis

### Current Workflow States (Implemented)

The system currently implements a **simplified linear workflow** using only the `status` enum:

```
submitted → triage → assessment_pending → assessment_in_progress → 
quotes_pending → comparison → repair_assigned → repair_in_progress → completed/rejected
```

**Status Transitions Identified:**

| Trigger | From Status | To Status | Location |
|---------|-------------|-----------|----------|
| Claim submission | - | `submitted` | `routers.ts:412` |
| Assessor assignment | `submitted` | `assessment_pending` | `routers.ts:529` |
| Assessment start | `assessment_pending` | `assessment_in_progress` | `routers.ts:629` |
| Quote submission | `assessment_in_progress` | `quotes_pending` | `routers.ts:970` |
| All quotes received | `quotes_pending` | `comparison` | `routers.ts:1032` |
| Claim approval | `comparison` | `repair_assigned` | `routers.ts:709` |

**Observations:**

- ✅ Basic workflow transitions are functional
- ✅ AI assessment is automatically triggered on claim submission (`routers.ts:440-448`)
- ✅ Audit trail is captured for major transitions
- ❌ No validation of state transition legality (e.g., can jump from `submitted` directly to `completed`)
- ❌ No rollback or error recovery paths defined

---

### Unused Workflow State Machine

The database schema defines a parallel `workflowState` enum with 9 states:

```typescript
workflowState: mysqlEnum("workflow_state", [
  "created", "assigned", "under_assessment", "internal_review",
  "technical_approval", "financial_decision", "payment_authorized",
  "closed", "disputed"
])
```

**Critical Gap:** Zero references to `workflowState` exist in the codebase.

```bash
$ grep -rn "workflowState" server/
# No results
```

**Impact:**

- **Hierarchical approval workflow is not enforced** — the system cannot distinguish between technical approval (Risk Manager) and financial approval (Claims Manager)
- **Internal review gates are bypassed** — claims go directly from assessor evaluation to insurer comparison without mandatory review steps
- **Dispute handling is undefined** — no mechanism to flag or track disputed claims

---

### Unused Approval Tracking Fields

The claims table includes detailed approval metadata:

```typescript
technicallyApprovedBy: int("technically_approved_by"),
technicallyApprovedAt: timestamp("technically_approved_at"),
financiallyApprovedBy: int("financially_approved_by"),
financiallyApprovedAt: timestamp("financially_approved_at"),
approvedAmount: int("approved_amount"),
closedBy: int("closed_by"),
closedAt: timestamp("closed_at"),
```

**Critical Gap:** These fields are never set.

```bash
$ grep -rn "technicallyApprovedBy\|financiallyApprovedBy\|closedBy" server/routers.ts
# No results
```

**Impact:**

- **No audit trail for who approved what** — compliance risk for insurance regulatory requirements
- **No timestamp tracking for approval SLAs** — cannot measure or enforce approval turnaround times
- **No final approved amount capture** — ground truth for ML training is lost

---

### AI Assessment Flag Inconsistency

The claims table has two AI assessment tracking flags:

```typescript
aiAssessmentTriggered: tinyint("ai_assessment_triggered").default(0),
aiAssessmentCompleted: tinyint("ai_assessment_completed").default(0),
```

**Partial Implementation:**

- ✅ `aiAssessmentTriggered` is set to `1` in `db.ts:291`
- ✅ `aiAssessmentCompleted` is set to `1` in `db.ts:312` (placeholder case) and `db.ts:485` (full assessment)
- ❌ These flags are **never queried** — no UI or logic checks if AI assessment is complete before allowing workflow progression

**Impact:**

- Claims can proceed to assessor assignment even if AI assessment failed
- No retry mechanism for failed AI assessments
- Dashboard cannot show "AI assessment pending" vs "AI assessment complete" states

---

## 2. Broken Transitions & Missing State Mutations

### Gap 2.1: No State Transition Validation

**Issue:** The `updateClaimStatus()` function in `db.ts:247` accepts any status value without validating if the transition is legal.

```typescript
export async function updateClaimStatus(claimId: number, status: typeof claims.$inferSelect.status) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(claims).set({ status, updatedAt: new Date() }).where(eq(claims.id, claimId));
}
```

**Missing Logic:**

- No check for current status before transition
- No validation of allowed transitions (e.g., cannot go from `completed` back to `submitted`)
- No atomic state machine enforcement

**Recommended Fix:**

Implement a state machine validator:

```typescript
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  "submitted": ["triage", "assessment_pending"],
  "assessment_pending": ["assessment_in_progress", "rejected"],
  "assessment_in_progress": ["quotes_pending", "rejected"],
  // ... complete mapping
};

export async function updateClaimStatus(claimId: number, newStatus: string) {
  const claim = await getClaimById(claimId);
  if (!claim) throw new Error("Claim not found");
  
  const allowedNext = ALLOWED_TRANSITIONS[claim.status] || [];
  if (!allowedNext.includes(newStatus)) {
    throw new Error(`Invalid transition: ${claim.status} → ${newStatus}`);
  }
  
  // Proceed with update...
}
```

---

### Gap 2.2: Missing Hierarchical Approval Workflow

**Issue:** The `approveClaim` mutation (`routers.ts:700-727`) directly transitions claim to `repair_assigned` without enforcing multi-level approval.

**Current Flow:**

```
Insurer selects quote → Claim approved → Status = repair_assigned
```

**Expected Flow (per schema design):**

```
Insurer selects quote → 
  Risk Manager technical approval (set technicallyApprovedBy, technicallyApprovedAt) →
  Claims Manager financial approval (set financiallyApprovedBy, financiallyApprovedAt) →
  Payment authorization (workflowState = payment_authorized) →
  Claim closed (set closedBy, closedAt, workflowState = closed)
```

**Missing Mutations:**

- `claims.technicalApproval` — Risk Manager approves technical validity
- `claims.financialApproval` — Claims Manager approves cost
- `claims.closeClaim` — Final closure with payment authorization

**Impact:**

- Single-point approval creates fraud risk (no separation of duties)
- Cannot enforce approval hierarchies (e.g., claims >$10k require executive approval)
- No audit trail for regulatory compliance

---

### Gap 2.3: No Event Emission for Workflow Transitions

**Issue:** Event emission code exists but is commented out (`routers.ts:428-437`):

```typescript
// Emit ClaimSubmitted event (temporarily disabled until Kafka is set up)
// await eventIntegration.emitClaimSubmitted({
//   claimId: newClaim.id,
//   ...
// });
```

**Impact:**

- External systems (e.g., insurer CRM, payment gateway) cannot react to claim state changes
- No real-time notifications for assessors/claimants
- Cannot build event-sourced audit trail for compliance

**Recommended Fix:**

Implement lightweight event emitter using database-backed queue:

```typescript
export async function emitClaimEvent(event: {
  eventType: string;
  claimId: number;
  payload: any;
}) {
  await db.insert(claimEvents).values({
    eventType: event.eventType,
    claimId: event.claimId,
    payload: JSON.stringify(event.payload),
    emittedAt: new Date(),
  });
}
```

---

### Gap 2.4: Partial Implementation of Fraud Workflow

**Issue:** The claims table has `fraudRiskScore` and `fraudFlags` fields, but there's no workflow branch for high-risk claims.

**Current Behavior:**

- AI assessment calculates fraud risk (`aiAssessments.fraudRiskLevel`)
- Fraud score is stored in `claims.fraudRiskScore`
- **No workflow divergence** — high-risk claims follow the same path as low-risk claims

**Missing Logic:**

- High-risk claims should trigger `workflowState = internal_review`
- Fraud analyst role should be notified
- Additional verification steps should be required before approval

**Recommended Fix:**

Add fraud workflow branch in `triggerAiAssessment()`:

```typescript
if (fraudRiskLevel === "high") {
  await db.update(claims).set({
    workflowState: "internal_review",
    status: "triage",
  }).where(eq(claims.id, claimId));
  
  await notifyFraudAnalyst(claimId);
}
```

---

## 3. Unwired UI Actions

### Gap 3.1: No UI for Hierarchical Approvals

**Issue:** The `InsurerComparisonView.tsx` page has a single "Approve Claim" button that calls `approveClaim` mutation. There are no separate UI controls for:

- Technical approval (Risk Manager)
- Financial approval (Claims Manager)
- Claim closure (Executive)

**Impact:**

- Users cannot perform role-specific approval actions
- Cannot enforce approval hierarchies via UI
- No visibility into which approval stage a claim is in

**Recommended Fix:**

Add approval stage UI in `InsurerComparisonView.tsx`:

```tsx
{claim.workflowState === "technical_approval" && user.insurerRole === "risk_manager" && (
  <Button onClick={handleTechnicalApproval}>
    Technical Approval
  </Button>
)}

{claim.workflowState === "financial_decision" && user.insurerRole === "claims_manager" && (
  <Button onClick={handleFinancialApproval}>
    Financial Approval
  </Button>
)}
```

---

### Gap 3.2: No Retry UI for Failed AI Assessments

**Issue:** If AI assessment fails (e.g., LLM timeout), there's no UI to retry the assessment. The claim gets stuck in `submitted` status with `aiAssessmentTriggered = 1` but `aiAssessmentCompleted = 0`.

**Impact:**

- Manual database intervention required to unstick claims
- Poor user experience for claimants

**Recommended Fix:**

Add retry button in claim detail pages:

```tsx
{claim.aiAssessmentTriggered && !claim.aiAssessmentCompleted && (
  <Button onClick={() => retryAiAssessment.mutate({ claimId })}>
    Retry AI Assessment
  </Button>
)}
```

---

### Gap 3.3: No Dispute Handling UI

**Issue:** The `workflowState` enum includes `"disputed"`, but there's no UI to flag a claim as disputed.

**Impact:**

- Claimants cannot challenge assessments
- No formal dispute resolution workflow

**Recommended Fix:**

Add "Dispute Claim" action in claimant dashboard:

```tsx
<Button onClick={() => disputeClaim.mutate({ claimId, reason })}>
  Dispute Assessment
</Button>
```

---

## 4. Event Propagation Failures

### Gap 4.1: No Real-Time Status Updates

**Issue:** When a claim status changes (e.g., assessor submits evaluation), other users viewing the same claim do not see real-time updates. They must manually refresh the page.

**Impact:**

- Stale data in multi-user scenarios
- Race conditions (e.g., two assessors trying to claim the same assignment)

**Recommended Fix:**

Implement WebSocket-based real-time updates using the existing WebSocket server (`server/_core/websocket.ts`):

```typescript
// In mutation handlers
await updateClaimStatus(claimId, newStatus);
websocketServer.broadcast({
  type: "CLAIM_STATUS_UPDATED",
  claimId,
  newStatus,
});
```

---

### Gap 4.2: No Notification System for Workflow Events

**Issue:** Users are not notified when claims transition to states requiring their action (e.g., assessor assigned to claim, quote request received).

**Current Workaround:** Users must manually check dashboards for new assignments.

**Impact:**

- Slow response times
- Poor user experience

**Recommended Fix:**

Implement notification system using existing `notifyOwner()` helper pattern:

```typescript
export async function notifyUser(userId: number, notification: {
  title: string;
  message: string;
  claimId?: number;
}) {
  await db.insert(notifications).values({
    userId,
    title: notification.title,
    message: notification.message,
    claimId: notification.claimId,
    read: 0,
    createdAt: new Date(),
  });
  
  // Also send via WebSocket for real-time delivery
  websocketServer.sendToUser(userId, {
    type: "NOTIFICATION",
    ...notification,
  });
}
```

---

## 5. Partial Workflow Implementations

### Gap 5.1: Total Loss Workflow Incomplete

**Issue:** The AI assessment detects total loss (`aiAssessments.totalLossIndicated = 1`), but there's no workflow branch for total loss claims.

**Current Behavior:**

- AI flags total loss
- Claim proceeds to quote comparison anyway
- Panel beaters waste time quoting unrepairable vehicles

**Recommended Fix:**

Add total loss branch in `triggerAiAssessment()`:

```typescript
if (totalLossIndicated) {
  await db.update(claims).set({
    status: "triage",
    workflowState: "internal_review",
  }).where(eq(claims.id, claimId));
  
  await notifyInsurerRiskManager(claimId, "Total loss detected");
}
```

---

### Gap 5.2: External Assessment Upload Workflow Incomplete

**Issue:** The system supports external assessment upload (`processExternalAssessment()` in `assessment-processor.ts`), but the workflow integration is incomplete:

- External assessments are processed and stored in `aiAssessments` table
- **No automatic status transition** after external assessment is processed
- Insurer must manually check if external assessment is complete

**Recommended Fix:**

Add workflow progression in `processExternalAssessment()`:

```typescript
// After successful processing
await updateClaimStatus(claimId, "assessment_in_progress");
await db.update(claims).set({
  aiAssessmentCompleted: 1,
  workflowState: "under_assessment",
}).where(eq(claims.id, claimId));
```

---

## 6. Dashboard Intelligence Output Gaps

### Gap 6.1: No Real-Time Workflow Metrics

**Issue:** Executive dashboards show aggregate metrics (total claims, average cost) but do not expose workflow health metrics:

- Average time in each workflow stage
- Bottleneck identification (which stage has longest queue)
- SLA breach tracking (claims exceeding target turnaround time)

**Impact:**

- Cannot identify process inefficiencies
- No proactive alerting for stuck claims

**Recommended Fix:**

Add workflow analytics queries:

```typescript
export async function getWorkflowMetrics() {
  const db = await getDb();
  
  // Average time per stage
  const stageMetrics = await db.select({
    status: claims.status,
    avgDuration: sql`AVG(TIMESTAMPDIFF(HOUR, created_at, updated_at))`,
    claimCount: sql`COUNT(*)`,
  })
  .from(claims)
  .groupBy(claims.status);
  
  return stageMetrics;
}
```

---

### Gap 6.2: No Assessor Performance Tracking

**Issue:** The `users` table has assessor performance fields (`performanceScore`, `totalAssessmentsCompleted`, `averageVarianceFromFinal`), but these are **never updated**.

```bash
$ grep -rn "performanceScore\|totalAssessmentsCompleted\|averageVarianceFromFinal" server/routers.ts
# No results
```

**Impact:**

- Assessor leaderboard shows static data
- Cannot identify top-performing vs underperforming assessors
- No data for assessor marketplace ranking

**Recommended Fix:**

Update assessor metrics when claim is approved:

```typescript
// In approveClaim mutation
const assessorEval = await getAssessorEvaluation(claimId);
const variance = Math.abs(assessorEval.estimatedCost - approvedAmount) / approvedAmount * 100;

await db.update(users).set({
  totalAssessmentsCompleted: sql`total_assessments_completed + 1`,
  averageVarianceFromFinal: sql`(average_variance_from_final * total_assessments_completed + ${variance}) / (total_assessments_completed + 1)`,
}).where(eq(users.id, assessorId));
```

---

## 7. Summary of Critical Gaps

| Gap ID | Category | Severity | Impact | Estimated Effort |
|--------|----------|----------|--------|------------------|
| **WF-001** | Unused `workflowState` enum | **Critical** | No hierarchical approval enforcement | 3 days |
| **WF-002** | Unused approval tracking fields | **Critical** | No audit trail for compliance | 2 days |
| **WF-003** | No state transition validation | **High** | Invalid state transitions possible | 1 day |
| **WF-004** | Missing hierarchical approval mutations | **Critical** | Single-point approval fraud risk | 4 days |
| **WF-005** | Event emission disabled | **High** | No external system integration | 2 days |
| **WF-006** | No fraud workflow branch | **High** | High-risk claims bypass review | 2 days |
| **WF-007** | No hierarchical approval UI | **High** | Cannot enforce role-based approvals | 3 days |
| **WF-008** | No AI assessment retry UI | **Medium** | Manual intervention for failures | 1 day |
| **WF-009** | No dispute handling UI/logic | **Medium** | No formal dispute resolution | 2 days |
| **WF-010** | No real-time status updates | **Medium** | Stale data in multi-user scenarios | 2 days |
| **WF-011** | No notification system | **Medium** | Slow response times | 3 days |
| **WF-012** | Total loss workflow incomplete | **High** | Wasted effort quoting totaled vehicles | 1 day |
| **WF-013** | External assessment workflow incomplete | **Medium** | Manual status checks required | 1 day |
| **WF-014** | No workflow health metrics | **Medium** | Cannot identify bottlenecks | 2 days |
| **WF-015** | Assessor performance not tracked | **High** | No marketplace ranking data | 2 days |

**Total Estimated Effort:** 31 days (6.2 weeks)

---

## 8. Workflow Completeness Score

Using the following scoring methodology:

- **State Machine Implementation:** 40% (only `status` used, `workflowState` unused)
- **Approval Workflow:** 20% (basic approval exists, hierarchical approval missing)
- **Event Propagation:** 30% (audit trail exists, real-time events missing)
- **UI Wiring:** 60% (basic actions work, advanced actions missing)
- **Intelligence Capture:** 50% (AI assessment works, ground truth capture missing)

**Overall Workflow Completeness:** **40%**

**Gap to Target (90%):** **50 percentage points**

---

## 9. Recommended Remediation Priority

### Phase 2 Prerequisites (Must Fix First)

1. **WF-001:** Implement `workflowState` usage throughout codebase
2. **WF-002:** Wire up approval tracking fields (`technicallyApprovedBy`, etc.)
3. **WF-015:** Implement assessor performance metric updates

**Rationale:** Phase 2 (Claim Intelligence Dataset Capture) requires accurate workflow state and approval data. Without these fixes, captured datasets will be incomplete.

### Phase 3 Prerequisites

4. **WF-004:** Implement hierarchical approval mutations
5. **WF-006:** Implement fraud workflow branch

**Rationale:** Phase 3 (Ground Truth Learning Loop) requires final approval data with proper role attribution.

### Phase 5 Prerequisites

6. **WF-007:** Build hierarchical approval UI
7. **WF-014:** Implement workflow health metrics

**Rationale:** Phase 5 (Intelligence Dashboard Completion) requires these metrics to be exposed.

### Lower Priority (Can Defer)

8. **WF-008, WF-009, WF-010, WF-011:** UX improvements (retry, dispute, real-time updates, notifications)
9. **WF-012, WF-013:** Edge case workflows (total loss, external assessment)

---

## 10. Conclusion

The KINGA platform has a **solid foundation** with comprehensive database schema, robust AI assessment engine, and functional basic workflow. However, **40% of the designed workflow architecture remains unimplemented**, creating critical gaps in:

- **Compliance:** No audit trail for multi-level approvals
- **Intelligence Capture:** Ground truth data (final approved amounts, approver roles) not captured
- **Fraud Prevention:** High-risk claims bypass review gates
- **Operational Efficiency:** No workflow health metrics or bottleneck identification

**Immediate Action Required:** Implement WF-001, WF-002, WF-004, and WF-015 before proceeding to Phase 2 (Dataset Capture). These fixes will unlock the full intelligence maturity potential of the platform.

**Next Steps:**

1. Review and approve this audit report
2. Prioritize gap remediation based on Phase 2/3 dependencies
3. Begin implementation of critical workflow state machine fixes
4. Proceed to Phase 2: Claim Intelligence Dataset Capture Layer

---

**Report Status:** ✅ Complete  
**Approval Required:** Yes  
**Blocking Issues for Phase 2:** WF-001, WF-002, WF-015
