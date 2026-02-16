# Role-Based State Access Rules

**Purpose:** Define which workflow states each InsurerRole can access when querying claims.

## Access Control Matrix

| Workflow State | claims_processor | assessor_internal | assessor_external | risk_manager | claims_manager | executive | insurer_admin |
|---|---|---|---|---|---|---|---|
| `created` | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| `intake_verified` | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| `assigned` | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| `under_assessment` | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| `internal_review` | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ |
| `quotes_pending` | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ |
| `quotes_received` | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ |
| `comparison` | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ |
| `technical_approval` | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| `financial_decision` | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| `approved` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `rejected` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `payment_authorized` | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| `payment_processing` | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| `completed` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `cancelled` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

## Role Descriptions

**claims_processor:**
- Front-line claim handlers
- Access: Early workflow states (intake, assignment, assessment, quotes)
- Blocked: Technical approval, financial decision, payment states

**assessor_internal:**
- Internal technical assessors
- Access: Assessment-related states
- Blocked: Technical approval, financial decision, payment states

**assessor_external:**
- External/third-party assessors
- Access: Only assigned and assessment states
- Blocked: Internal review, quotes, approvals, payments

**risk_manager:**
- Risk assessment and approval authority
- Access: Technical approval, financial decision, final states
- Blocked: Early workflow states (intake, assignment, quotes)

**claims_manager:**
- Supervisory role with broad access
- Access: All states except external assessor-restricted
- Full visibility for management oversight

**executive:**
- C-level executives
- Access: ALL states without restriction
- Full system visibility for strategic oversight

**insurer_admin:**
- System administrators
- Access: ALL states without restriction
- Full system access for configuration and support

## Business Rules

### Segregation of Duties
1. **Processors cannot approve** - No access to `technical_approval` or `financial_decision`
2. **Assessors cannot see financials** - No access to payment states
3. **Risk managers focus on approvals** - No access to operational states (intake, quotes)

### Transparency Levels
1. **High transparency:** `approved`, `rejected`, `completed`, `cancelled` (all roles)
2. **Medium transparency:** `assigned`, `under_assessment` (most roles)
3. **Low transparency:** `technical_approval`, `financial_decision`, `payment_*` (senior roles only)

### Cross-Tenant Isolation
- **ALL roles** are restricted to their own tenant's claims
- No cross-tenant access regardless of role
- Tenant isolation enforced at database query level

## Implementation

```typescript
const ROLE_STATE_ACCESS: Record<InsurerRole, WorkflowState[]> = {
  claims_processor: [
    "created", "intake_verified", "assigned", "under_assessment",
    "internal_review", "quotes_pending", "quotes_received", "comparison",
    "approved", "rejected", "completed", "cancelled"
  ],
  assessor_internal: [
    "assigned", "under_assessment", "internal_review",
    "quotes_pending", "quotes_received", "comparison",
    "approved", "rejected", "completed", "cancelled"
  ],
  assessor_external: [
    "assigned", "under_assessment",
    "approved", "rejected", "completed", "cancelled"
  ],
  risk_manager: [
    "technical_approval", "financial_decision",
    "approved", "rejected", "completed", "cancelled"
  ],
  claims_manager: [
    // All states
    "created", "intake_verified", "assigned", "under_assessment",
    "internal_review", "quotes_pending", "quotes_received", "comparison",
    "technical_approval", "financial_decision",
    "approved", "rejected", "payment_authorized", "payment_processing",
    "completed", "cancelled"
  ],
  executive: [
    // All states (same as claims_manager + full visibility)
    "created", "intake_verified", "assigned", "under_assessment",
    "internal_review", "quotes_pending", "quotes_received", "comparison",
    "technical_approval", "financial_decision",
    "approved", "rejected", "payment_authorized", "payment_processing",
    "completed", "cancelled"
  ],
  insurer_admin: [
    // All states (administrative access)
    "created", "intake_verified", "assigned", "under_assessment",
    "internal_review", "quotes_pending", "quotes_received", "comparison",
    "technical_approval", "financial_decision",
    "approved", "rejected", "payment_authorized", "payment_processing",
    "completed", "cancelled"
  ],
};
```

## Pagination Design

**Request:**
```typescript
{
  state: WorkflowState;
  limit?: number;  // Default: 50, Max: 100
  offset?: number; // Default: 0
}
```

**Response:**
```typescript
{
  claims: Claim[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}
```

## Error Handling

**Unauthorized State Access:**
```
HTTP 403 FORBIDDEN
"Your role (claims_processor) does not have access to claims in state 'technical_approval'"
```

**Cross-Tenant Access:**
```
HTTP 403 FORBIDDEN
"Cannot access claims from other tenants"
```

**Invalid State:**
```
HTTP 400 BAD REQUEST
"Invalid workflow state: 'invalid_state'"
```
