# KINGA Workflow Governance Architecture

## Executive Summary

The KINGA workflow engine implements a standardized, governance-first architecture for insurance claim processing. This document describes the architectural design, core principles, and implementation patterns that ensure regulatory compliance, segregation of duties, and audit trail integrity.

**Target Audience:** Future developers, system architects, compliance officers, and technical auditors.

---

## 1. Architectural Principles

### 1.1 Core Design Tenets

1. **Immutable State Machine** - The core workflow states are fixed and cannot be modified by configuration
2. **Segregation by Design** - Role permissions are enforced at the type system level, not just runtime
3. **Audit-First** - Every state transition creates an immutable audit record before execution
4. **Configuration Without Compromise** - Insurer-level customization within governance boundaries
5. **Fail-Safe Defaults** - System defaults to most restrictive permissions when configuration is ambiguous

### 1.2 Layered Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Presentation Layer                       │
│              (tRPC Procedures, UI Components)                │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                   Application Layer                          │
│         (Business Logic, Claim Processing Flows)             │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│              Workflow Governance Layer ★                     │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────┐  │
│  │ State Machine  │  │  Segregation   │  │   Routing    │  │
│  │    Engine      │  │   Validator    │  │   Engine     │  │
│  └────────────────┘  └────────────────┘  └──────────────┘  │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────┐  │
│  │ Audit Logger   │  │  Executive     │  │ Configuration│  │
│  │                │  │   Oversight    │  │   Manager    │  │
│  └────────────────┘  └────────────────┘  └──────────────┘  │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                      Data Layer                              │
│         (Database, ORM, Audit Trail Storage)                 │
└─────────────────────────────────────────────────────────────┘
```

**★ Workflow Governance Layer** - This is the architectural innovation. All claim state transitions must pass through this layer, which enforces:
- Valid state transitions
- Role permissions
- Segregation of duties
- Audit logging
- Configuration compliance

---

## 2. Core State Machine

### 2.1 Immutable Workflow States

The following states form the backbone of the claim lifecycle and **CANNOT** be modified:

```typescript
type WorkflowState =
  | "created"              // Initial claim submission
  | "intake_verified"      // Claims Processor verified documentation
  | "assigned"             // Assigned to assessor
  | "under_assessment"     // Assessor conducting evaluation
  | "internal_review"      // Risk Manager technical review
  | "technical_approval"   // Risk Manager approved technical basis
  | "financial_decision"   // Claims Manager reviewing for payment
  | "payment_authorized"   // Payment approved and authorized
  | "closed"               // Claim fully resolved
  | "disputed";            // Claim in dispute resolution
```

### 2.2 State Transition Rules

Valid transitions are defined in a state transition matrix:

```
FROM                  → TO                      | REQUIRED ROLE
──────────────────────────────────────────────────────────────────
created               → intake_verified         | claims_processor
intake_verified       → assigned                | claims_processor
assigned              → under_assessment        | assessor_*
under_assessment      → internal_review         | assessor_*
internal_review       → technical_approval      | risk_manager
technical_approval    → financial_decision      | (automatic)
financial_decision    → payment_authorized      | claims_manager
payment_authorized    → closed                  | claims_manager
<any>                 → disputed                | executive (override)
disputed              → <previous_state>        | executive (redirect)
```

**Illegal Transitions** (automatically blocked):
- `created` → `financial_decision` (skips assessment)
- `assigned` → `payment_authorized` (skips reviews)
- Any backward transition except executive redirect

### 2.3 State Machine Implementation

Located in: `server/workflow/state-machine.ts`

```typescript
export class WorkflowStateMachine {
  /**
   * Validates if a state transition is legal
   * @throws WorkflowViolationError if transition is invalid
   */
  validateTransition(
    from: WorkflowState,
    to: WorkflowState,
    role: InsurerRole,
    context: TransitionContext
  ): ValidationResult;

  /**
   * Executes a state transition with full governance checks
   * Creates audit trail, validates permissions, checks segregation
   */
  async executeTransition(
    claimId: number,
    to: WorkflowState,
    userId: number,
    metadata: TransitionMetadata
  ): Promise<TransitionResult>;
}
```

---

## 3. Role-Based Access Control (RBAC)

### 3.1 Standard Roles

```typescript
type InsurerRole =
  | "claims_processor"      // Intake and assignment
  | "assessor_internal"     // In-house damage assessment
  | "assessor_external"     // Third-party assessment
  | "risk_manager"          // Technical approval
  | "claims_manager"        // Financial decision
  | "executive"             // Oversight and redirection
  | "insurer_admin";        // Configuration management
```

### 3.2 Role Permission Matrix

| Permission                    | Processor | Assessor | Risk Mgr | Claims Mgr | Executive | Admin |
|-------------------------------|-----------|----------|----------|------------|-----------|-------|
| Create Claim                  | ✓         | ✗        | ✗        | ✓          | ✗         | ✗     |
| Assign Assessor               | ✓         | ✗        | ✗        | ✓          | ✗         | ✗     |
| Conduct Assessment            | ✗         | ✓        | ✗        | ✗          | ✗         | ✗     |
| Approve Technical             | ✗         | ✗        | ✓        | ✗          | ✗         | ✗     |
| Authorize Payment             | ✗         | ✗        | ✗        | ✓          | ✗         | ✗     |
| Close Claim                   | ✗         | ✗        | ✗        | ✓          | ✗         | ✗     |
| View All Claims               | ✓         | ✗        | ✓        | ✓          | ✓         | ✓     |
| Redirect Claim                | ✗         | ✗        | ✗        | ✗          | ✓         | ✗     |
| Configure Workflow            | ✗         | ✗        | ✗        | ✗          | ✗         | ✓     |

### 3.3 RBAC Implementation

Located in: `server/workflow/rbac.ts`

```typescript
export class RBACEngine {
  /**
   * Check if role has permission for action
   */
  hasPermission(
    role: InsurerRole,
    permission: Permission,
    context?: PermissionContext
  ): boolean;

  /**
   * Get all allowed state transitions for a role
   */
  getAllowedTransitions(
    role: InsurerRole,
    currentState: WorkflowState
  ): WorkflowState[];
}
```

---

## 4. Segregation of Duties

### 4.1 Mandatory Rules

1. **No End-to-End Control** - Same user cannot perform more than 2 sequential critical stages
2. **Assessment Isolation** - Assessor cannot authorize payment
3. **Financial Isolation** - Claims Manager cannot perform assessment
4. **Technical Isolation** - Risk Manager cannot authorize payment
5. **Processor Boundaries** - Claims Processor cannot approve technical or financial decisions

### 4.2 Critical Stage Definition

Critical stages requiring segregation tracking:
1. Assessment (`under_assessment`)
2. Technical Approval (`technical_approval`)
3. Financial Decision (`financial_decision`)
4. Payment Authorization (`payment_authorized`)

### 4.3 Segregation Validator

Located in: `server/workflow/segregation-validator.ts`

```typescript
export class SegregationValidator {
  /**
   * Validates segregation of duties for a proposed action
   * Checks claim history to ensure same user hasn't performed
   * too many sequential critical stages
   */
  async validateSegregation(
    claimId: number,
    userId: number,
    proposedAction: WorkflowAction
  ): Promise<SegregationResult>;

  /**
   * Get user's involvement history in a claim
   */
  async getUserInvolvement(
    claimId: number,
    userId: number
  ): Promise<InvolvementHistory>;
}
```

---

## 5. Configurable Routing Engine

### 5.1 Configuration Scope

Insurers can configure:
- Enable/disable `risk_manager` role (direct assessor → claims_manager)
- High-value escalation threshold (e.g., >$10,000 requires executive review)
- AI-only fast track for low-risk claims
- Internal vs external assessor workflow
- Executive mandatory review thresholds

### 5.2 Configuration Constraints

**Allowed:**
- Threshold values
- Role enablement
- Routing preferences

**NOT Allowed:**
- Modifying core states
- Skipping mandatory segregation
- Bypassing audit trail
- Removing executive oversight capability

### 5.3 Routing Engine Implementation

Located in: `server/workflow/routing-engine.ts`

```typescript
export class RoutingEngine {
  /**
   * Determine next state based on configuration and claim attributes
   */
  async determineNextState(
    claim: Claim,
    currentState: WorkflowState,
    config: WorkflowConfiguration
  ): Promise<WorkflowState>;

  /**
   * Check if claim requires escalation
   */
  requiresEscalation(
    claim: Claim,
    config: WorkflowConfiguration
  ): EscalationRequirement;
}
```

---

## 6. Executive Oversight Layer

### 6.1 Executive Capabilities

Executives can:
- View all claims across the organization
- Add comments and annotations
- Redirect claims to previous states (with logging)
- Trigger re-review processes
- Compare AI vs human decisions
- Override routing (with immutable audit trail)

Executives **cannot**:
- Directly close claims without state transitions
- Bypass segregation of duties
- Modify audit trail
- Approve claims without proper workflow

### 6.2 Redirect Mechanism

When an executive redirects a claim:
1. Current state is preserved in audit trail
2. Claim moves to specified previous state
3. Redirect reason is logged
4. Original decision data is preserved
5. Notification sent to relevant roles

### 6.3 Executive Oversight Implementation

Located in: `server/workflow/executive-oversight.ts`

```typescript
export class ExecutiveOversight {
  /**
   * Redirect claim to previous state with audit logging
   */
  async redirectClaim(
    claimId: number,
    targetState: WorkflowState,
    reason: string,
    executiveId: number
  ): Promise<RedirectResult>;

  /**
   * Get decision comparison (AI vs Human)
   */
  async getDecisionComparison(
    claimId: number
  ): Promise<DecisionComparison>;
}
```

---

## 7. Audit Trail Architecture

### 7.1 Immutable Audit Requirements

Every state transition must log:
- User ID and role
- Previous state
- New state
- Timestamp (UTC)
- Decision value (if applicable)
- AI score at time of decision
- Confidence score
- Comments/reasoning

### 7.2 Audit Trail Guarantees

1. **Immutability** - Records cannot be deleted or modified
2. **Completeness** - Every transition creates a record
3. **Traceability** - Full claim lifecycle can be reconstructed
4. **Compliance** - Meets regulatory audit requirements

### 7.3 Audit Logger Implementation

Located in: `server/workflow/audit-logger.ts`

```typescript
export class AuditLogger {
  /**
   * Create immutable audit record for state transition
   * This is called automatically by WorkflowStateMachine
   */
  async logTransition(
    claimId: number,
    transition: StateTransition,
    metadata: AuditMetadata
  ): Promise<AuditRecord>;

  /**
   * Retrieve complete audit trail for a claim
   */
  async getClaimAuditTrail(
    claimId: number
  ): Promise<AuditRecord[]>;
}
```

---

## 8. Internal vs External Assessment Paths

### 8.1 Internal Assessment Path

```
claims_processor → assessor_internal → risk_manager → claims_manager
```

Standard path for in-house assessments.

### 8.2 External Assessment Path

```
claims_processor → assessor_external
                → claims_processor (validation)
                → assessor_internal (validation)
                → risk_manager
                → claims_manager
```

External assessments require validation checkpoints to ensure quality.

### 8.3 Assessment Path Implementation

The routing engine automatically determines the path based on:
- Assessor type assigned to claim
- Insurer configuration
- Claim complexity

---

## 9. AI Integration Architecture

### 9.1 AI Role Definition

AI is **advisory only**. AI produces:
- Fraud risk score (0-100)
- Cost benchmark estimate
- Confidence score
- Variance analysis vs human assessment
- Structured assessment report

### 9.2 AI Trigger Points

AI analysis can be triggered at:
1. Initial claim intake
2. PDF document upload
3. Assessment submission
4. Executive review request

### 9.3 AI Integration Principles

1. **AI Cannot Approve** - AI scores are input to human decisions, not decisions themselves
2. **AI Cannot Change States** - Only humans can transition workflow states
3. **AI Cannot Override** - Human decisions always take precedence
4. **AI Transparency** - AI reasoning must be explainable and logged

---

## 10. Database Schema Design

### 10.1 Core Tables

**workflow_configuration**
```sql
- id (PK)
- tenant_id (FK)
- risk_manager_enabled (boolean)
- high_value_threshold (int)
- ai_fast_track_enabled (boolean)
- executive_review_threshold (int)
- external_assessor_enabled (boolean)
- created_at, updated_at
```

**workflow_audit_trail**
```sql
- id (PK)
- claim_id (FK)
- user_id (FK)
- user_role (enum)
- previous_state (enum)
- new_state (enum)
- decision_value (int, nullable)
- ai_score (int, nullable)
- confidence_score (int, nullable)
- comments (text)
- metadata (json)
- created_at (immutable timestamp)
```

**claim_involvement_tracking**
```sql
- id (PK)
- claim_id (FK)
- user_id (FK)
- workflow_stage (enum)
- action_type (enum)
- created_at
```

### 10.2 Schema Constraints

- `workflow_audit_trail` has no UPDATE or DELETE permissions
- Foreign key constraints enforce referential integrity
- Enum types match TypeScript types exactly

---

## 11. Testing Strategy

### 11.1 Test Categories

1. **Unit Tests** - Individual components (state machine, validators)
2. **Integration Tests** - Workflow engine with database
3. **Governance Tests** - Segregation rules, illegal transitions
4. **End-to-End Tests** - Complete claim lifecycle scenarios

### 11.2 Critical Test Cases

Located in: `server/workflow/__tests__/`

- `state-machine.test.ts` - State transition validation
- `segregation.test.ts` - Segregation of duties enforcement
- `routing.test.ts` - Configuration-based routing
- `executive-oversight.test.ts` - Redirect and override logging
- `audit-trail.test.ts` - Immutability and completeness
- `integration.test.ts` - Full workflow scenarios

### 11.3 Continuous Validation

All tests must pass before deployment. CI/CD pipeline enforces:
- 100% pass rate on governance tests
- No regression in segregation enforcement
- Audit trail integrity checks

---

## 12. Extension Points for Future Developers

### 12.1 Adding New Workflow States

**NOT RECOMMENDED** - Core states are intentionally fixed. If business requirements demand new states, follow this process:

1. Propose state addition with business justification
2. Update `WorkflowState` type in `server/workflow/types.ts`
3. Update state transition matrix in `state-machine.ts`
4. Add database migration for enum type
5. Update all tests
6. Document in this architecture guide

### 12.2 Adding New Roles

To add a new role:

1. Add to `InsurerRole` type in `server/workflow/types.ts`
2. Define permissions in `rbac.ts`
3. Update permission matrix documentation
4. Add segregation rules if applicable
5. Create tests for new role
6. Update database enum

### 12.3 Adding New Configuration Options

To add insurer-level configuration:

1. Add field to `workflow_configuration` table
2. Update `WorkflowConfiguration` type
3. Implement routing logic in `routing-engine.ts`
4. Add validation to ensure governance compliance
5. Document configuration option
6. Create tests

---

## 13. Deployment and Migration

### 13.1 Initial Deployment

1. Run database migrations to create new tables
2. Seed default workflow configuration for existing tenants
3. Backfill audit trail from existing claim history
4. Enable workflow engine in feature flags
5. Monitor for governance violations

### 13.2 Backward Compatibility

- Existing claims continue with current workflow
- New claims use governance engine
- Gradual migration over 30-day period
- Rollback capability maintained

---

## 14. Monitoring and Observability

### 14.1 Key Metrics

- State transition success rate
- Segregation violation attempts (should be 0)
- Average time in each workflow state
- Executive override frequency
- AI-human decision variance

### 14.2 Alerting

Alerts triggered for:
- Segregation violation attempts
- Illegal state transition attempts
- Audit trail write failures
- Configuration changes

---

## 15. Compliance and Regulatory Alignment

This architecture ensures compliance with:
- Insurance regulatory frameworks requiring segregation of duties
- Audit trail requirements for financial services
- Data protection regulations (GDPR, POPIA)
- Industry best practices for claims processing

---

## 16. Glossary

**Critical Stage** - A workflow stage requiring segregation tracking (assessment, technical approval, financial decision, payment authorization)

**Immutable Audit Trail** - Audit records that cannot be modified or deleted once created

**Segregation of Duties** - Principle that no single person should control all aspects of a critical transaction

**State Transition** - Movement of a claim from one workflow state to another

**Workflow Configuration** - Insurer-level settings that customize routing within governance boundaries

---

## Document Version

- **Version:** 1.0
- **Last Updated:** 2026-02-16
- **Authors:** KINGA Development Team
- **Review Cycle:** Quarterly

---

**END OF ARCHITECTURE DOCUMENT**
