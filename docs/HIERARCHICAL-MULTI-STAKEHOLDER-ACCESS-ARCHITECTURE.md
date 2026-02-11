# Hierarchical Multi-Stakeholder Access Architecture

**Document ID:** KINGA-HMSAA-2026-012  
**Author:** Tavonga Shoko  
**Date:** February 11, 2026  
**Version:** 1.0  
**Classification:** Internal - Technical Specification

---

## Executive Summary

This document specifies the hierarchical multi-stakeholder access architecture for the KINGA AutoVerify platform, supporting five distinct stakeholder types with complex tenant relationships, attribute-based access control (ABAC), and strict data isolation. The architecture enables insurers, fleet operators, brokers, panel beaters, and internal governance users to access platform resources based on hierarchical relationships, claim assignments, and policy-based permissions while maintaining comprehensive audit trails and regulatory compliance.

The design implements a three-tier identity hierarchy (Organization → Tenant → User), attribute-based access control with resource tagging, JWT-based authentication with embedded ABAC claims, and enforcement at API, event bus, and database layers. The architecture supports scalable onboarding of new stakeholders while ensuring POPIA and GDPR compliance through data minimization, purpose limitation, and full access audit logging.

---

## 1. Identity Hierarchy Model

### 1.1 Three-Tier Hierarchy Structure

The KINGA platform implements a three-tier identity hierarchy to model complex organizational relationships:

**Tier 1: Organization**  
The top-level entity representing a business organization (insurer, fleet operator, broker, panel beater network). Organizations can own multiple tenants and define organization-wide policies.

**Tier 2: Tenant**  
A logical isolation boundary representing a specific business unit, brand, or operational division within an organization. Tenants inherit organization-level policies and can define tenant-specific policies.

**Tier 3: User**  
Individual users with roles and attributes assigned within a tenant context. Users inherit both organization and tenant policies, with additional user-level attributes for fine-grained access control.

### 1.2 Stakeholder-Specific Hierarchy Models

#### Insurers
```
Organization: ABC Insurance Group
├── Tenant: ABC Motor Insurance (Brand A)
│   ├── User: Claims Manager (role: claims_manager)
│   ├── User: Assessor (role: assessor)
│   └── User: Fraud Analyst (role: fraud_analyst)
└── Tenant: ABC Commercial Fleet Insurance (Brand B)
    ├── User: Fleet Claims Manager
    └── User: Commercial Assessor
```

#### Fleet Operators
```
Organization: XYZ Logistics Holdings
├── Tenant: XYZ Express Delivery
│   ├── User: Fleet Manager (role: fleet_manager)
│   ├── User: Driver (role: driver)
│   └── User: Safety Officer (role: safety_officer)
└── Tenant: XYZ Long Haul Transport
    └── User: Regional Fleet Manager
```

#### Brokers / Agents
```
Organization: Premium Brokers Network
├── Tenant: Premium Brokers Cape Town
│   ├── User: Senior Broker (role: broker)
│   └── User: Junior Agent (role: agent)
└── Tenant: Premium Brokers Johannesburg
    └── User: Branch Manager (role: broker_manager)
```

#### Panel Beaters / Repairers
```
Organization: National Auto Repair Network
├── Tenant: Quick Fix Auto Body Shop - Sandton
│   ├── User: Shop Manager (role: shop_manager)
│   ├── User: Estimator (role: estimator)
│   └── User: Technician (role: technician)
└── Tenant: Quick Fix Auto Body Shop - Pretoria
    └── User: Shop Manager
```

#### KINGA Internal Governance
```
Organization: KINGA Platform Operations
├── Tenant: KINGA Engineering
│   ├── User: Platform Admin (role: platform_admin)
│   └── User: DevOps Engineer (role: devops)
├── Tenant: KINGA Compliance
│   └── User: Compliance Officer (role: compliance_officer)
└── Tenant: KINGA Customer Success
    └── User: Support Agent (role: support_agent)
```

### 1.3 Relationship Modeling

The architecture supports four types of relationships that govern access control:

**Ownership Relationship**  
Direct ownership of resources (e.g., insurer owns claims, fleet operator owns vehicles).

**Assignment Relationship**  
Temporary assignment of resources for work (e.g., panel beater assigned to repair claim, assessor assigned to evaluate claim).

**Representation Relationship**  
Broker represents policyholder or fleet operator for claim submission and management.

**Supervision Relationship**  
Internal governance users supervise platform operations across all stakeholders for compliance and support.

---

## 2. Attribute-Based Access Control (ABAC) Policy Design

### 2.1 ABAC Policy Framework

The KINGA platform implements attribute-based access control using a policy decision engine that evaluates access requests based on four attribute categories:

**Subject Attributes** (Who is requesting access)
- `subject.organization_id`: Organization identifier
- `subject.tenant_id`: Tenant identifier
- `subject.user_id`: User identifier
- `subject.role`: User role (e.g., claims_manager, assessor, broker)
- `subject.stakeholder_type`: Stakeholder category (insurer, fleet_operator, broker, panel_beater, internal)
- `subject.permissions`: Explicit permissions granted to user
- `subject.location`: Geographic location of user (for geo-fencing)

**Resource Attributes** (What is being accessed)
- `resource.type`: Resource type (claim, vehicle, quote, assessment)
- `resource.id`: Resource identifier
- `resource.owner_tenant_id`: Tenant that owns the resource
- `resource.owner_organization_id`: Organization that owns the resource
- `resource.assigned_to_tenant_id`: Tenant assigned to work on resource
- `resource.assigned_to_user_id`: User assigned to work on resource
- `resource.sensitivity_level`: Data sensitivity classification (public, internal, confidential, restricted)
- `resource.tags`: Resource tags for policy matching

**Action Attributes** (What action is being performed)
- `action.operation`: Operation type (read, write, update, delete, approve, assign)
- `action.scope`: Scope of operation (own, assigned, supervised, all)

**Environment Attributes** (Context of access)
- `environment.time`: Timestamp of access request
- `environment.ip_address`: Source IP address
- `environment.device_type`: Device type (web, mobile, api)
- `environment.mfa_verified`: Whether MFA was verified

### 2.2 Policy Evaluation Logic

Access decisions follow this evaluation sequence:

1. **Explicit Deny Check**: If any policy explicitly denies access, request is denied immediately
2. **Ownership Check**: If subject owns the resource (subject.tenant_id == resource.owner_tenant_id), evaluate ownership policies
3. **Assignment Check**: If resource is assigned to subject (resource.assigned_to_user_id == subject.user_id OR resource.assigned_to_tenant_id == subject.tenant_id), evaluate assignment policies
4. **Relationship Check**: If subject has relationship with resource owner (broker represents fleet, internal supervises insurer), evaluate relationship policies
5. **Role-Based Check**: Evaluate role-based permissions for the action
6. **Default Deny**: If no policy grants access, request is denied

### 2.3 Policy Examples

#### Policy 1: Insurer Claims Manager Access
```json
{
  "policy_id": "insurer_claims_manager_read_own_claims",
  "effect": "allow",
  "subject": {
    "stakeholder_type": "insurer",
    "role": "claims_manager"
  },
  "resource": {
    "type": "claim",
    "owner_tenant_id": "${subject.tenant_id}"
  },
  "action": {
    "operation": ["read", "update", "approve"]
  },
  "conditions": []
}
```

#### Policy 2: Panel Beater Access to Assigned Claims
```json
{
  "policy_id": "panel_beater_read_assigned_claims",
  "effect": "allow",
  "subject": {
    "stakeholder_type": "panel_beater",
    "role": ["shop_manager", "estimator"]
  },
  "resource": {
    "type": "claim",
    "assigned_to_tenant_id": "${subject.tenant_id}"
  },
  "action": {
    "operation": ["read"]
  },
  "conditions": [
    {
      "attribute": "resource.status",
      "operator": "in",
      "value": ["assigned_to_panel_beater", "quote_submitted", "repair_in_progress"]
    }
  ]
}
```

#### Policy 3: Broker Access to Represented Fleet Claims
```json
{
  "policy_id": "broker_read_represented_fleet_claims",
  "effect": "allow",
  "subject": {
    "stakeholder_type": "broker",
    "role": "broker"
  },
  "resource": {
    "type": "claim"
  },
  "action": {
    "operation": ["read", "submit"]
  },
  "conditions": [
    {
      "attribute": "relationship.broker_represents_fleet",
      "operator": "exists",
      "value": true
    },
    {
      "attribute": "resource.fleet_operator_id",
      "operator": "in",
      "value": "${subject.represented_fleet_ids}"
    }
  ]
}
```

#### Policy 4: Internal Compliance Officer Supervision
```json
{
  "policy_id": "internal_compliance_read_all_claims",
  "effect": "allow",
  "subject": {
    "stakeholder_type": "internal",
    "role": "compliance_officer"
  },
  "resource": {
    "type": "claim"
  },
  "action": {
    "operation": ["read"]
  },
  "conditions": [
    {
      "attribute": "environment.mfa_verified",
      "operator": "equals",
      "value": true
    }
  ]
}
```

---

## 3. Access Evaluation Flow

### 3.1 Request Flow Diagram

```
User Request
     ↓
API Gateway (Authentication)
     ↓
Extract JWT Token
     ↓
Validate Token Signature
     ↓
Extract Subject Attributes from Token
     ↓
Policy Decision Point (PDP)
     ├→ Load Resource Attributes from Database
     ├→ Extract Action Attributes from Request
     ├→ Extract Environment Attributes from Context
     ├→ Evaluate ABAC Policies
     └→ Return Decision (Allow / Deny + Reason)
     ↓
Policy Enforcement Point (PEP)
     ├→ If Allow: Execute Request + Log Access
     └→ If Deny: Return 403 Forbidden + Log Denial
     ↓
Response to User
```

### 3.2 Policy Decision Point (PDP) Implementation

The PDP is implemented as a Node.js service (`server/_core/policy-engine.ts`) that evaluates access requests against the policy database.

**Key Functions:**
- `evaluateAccess(subject, resource, action, environment)`: Main evaluation function
- `loadPolicies(subject, resource)`: Load applicable policies from database
- `evaluatePolicy(policy, context)`: Evaluate single policy against context
- `resolveConflicts(decisions)`: Resolve conflicting policy decisions (deny-override)

**Performance Optimization:**
- Policy caching with 5-minute TTL
- Pre-compiled policy conditions for fast evaluation
- Parallel policy evaluation for independent policies
- Database indexes on policy lookup fields (stakeholder_type, role, resource_type)

### 3.3 Policy Enforcement Point (PEP) Integration

The PEP is integrated at three layers:

**API Layer** (`server/_core/abac-middleware.ts`)  
Intercepts all tRPC procedure calls, extracts subject/resource/action attributes, calls PDP, and enforces decision.

**Event Bus Layer** (`server/events/abac-filter.ts`)  
Filters Kafka events before delivery to consumers based on subscriber's access rights.

**Database Layer** (`server/_core/abac-query-builder.ts`)  
Injects WHERE clauses into database queries to filter results based on access policies (query-level enforcement).

---

## 4. Token and Authentication Strategy

### 4.1 JWT Token Structure

The platform uses JSON Web Tokens (JWT) with embedded ABAC claims for stateless authentication and authorization.

**Token Header:**
```json
{
  "alg": "RS256",
  "typ": "JWT",
  "kid": "kinga-signing-key-2026-02"
}
```

**Token Payload:**
```json
{
  "iss": "https://auth.kinga.io",
  "sub": "user_abc123",
  "aud": "https://api.kinga.io",
  "exp": 1739289600,
  "iat": 1739203200,
  "jti": "token_xyz789",
  
  "organization_id": "org_ins_001",
  "organization_name": "ABC Insurance Group",
  "tenant_id": "tenant_abc_motor",
  "tenant_name": "ABC Motor Insurance",
  "user_id": "user_abc123",
  "email": "claims.manager@abcinsurance.com",
  "name": "Jane Smith",
  
  "stakeholder_type": "insurer",
  "role": "claims_manager",
  "permissions": ["claims:read", "claims:update", "claims:approve"],
  
  "represented_fleet_ids": [],
  "assigned_claim_ids": [],
  
  "mfa_verified": true,
  "session_id": "session_def456"
}
```

### 4.2 Authentication Flow

**Step 1: User Login**  
User authenticates via OAuth 2.0 (Manus OAuth) or username/password. Multi-factor authentication (MFA) is required for internal governance users and optional for other stakeholders.

**Step 2: Token Issuance**  
Authentication server issues JWT token with subject attributes, role, permissions, and relationships. Token is signed with RS256 using platform private key.

**Step 3: Token Validation**  
API gateway validates token signature using platform public key, checks expiration, and extracts subject attributes for policy evaluation.

**Step 4: Token Refresh**  
Tokens expire after 1 hour. Refresh tokens (valid for 30 days) are used to obtain new access tokens without re-authentication.

### 4.3 Token Security Controls

**Signing Algorithm:** RS256 (RSA with SHA-256) for asymmetric signing  
**Token Expiration:** 1 hour for access tokens, 30 days for refresh tokens  
**Token Revocation:** Maintain revocation list in Redis for immediate token invalidation  
**Token Rotation:** Signing keys rotated every 90 days  
**Token Binding:** Bind tokens to client IP address and device fingerprint to prevent token theft  
**MFA Enforcement:** Require MFA for sensitive operations (approve claims, access PII, modify policies)

---

## 5. Data Tagging Strategy

### 5.1 Resource Tagging Schema

All resources in the KINGA platform are tagged with attributes that enable policy-based access control.

**Core Tags** (Applied to all resources):
- `owner_organization_id`: Organization that owns the resource
- `owner_tenant_id`: Tenant that owns the resource
- `sensitivity_level`: Data sensitivity classification (public, internal, confidential, restricted)
- `data_classification`: POPIA data classification (personal_information, special_personal_information, non_personal)

**Relationship Tags** (Applied based on relationships):
- `assigned_to_tenant_id`: Tenant assigned to work on resource
- `assigned_to_user_id`: User assigned to work on resource
- `represented_by_broker_id`: Broker representing the resource owner
- `insurer_id`: Insurer associated with the resource
- `fleet_operator_id`: Fleet operator associated with the resource

**Lifecycle Tags** (Track resource state):
- `status`: Current status of resource (draft, submitted, under_review, approved, rejected)
- `created_at`: Resource creation timestamp
- `updated_at`: Resource last update timestamp
- `archived`: Whether resource is archived

**Geographic Tags** (For geo-fencing):
- `country`: Country code (ZA, BW, NA)
- `province`: Province/state code
- `city`: City name

### 5.2 Tag Propagation Rules

Tags are automatically propagated to related resources:

**Claim → Assessments:** When an assessment is created for a claim, it inherits `owner_tenant_id`, `insurer_id`, and `sensitivity_level` from the claim.

**Claim → Quotes:** When a panel beater submits a quote, it inherits `owner_tenant_id` and `insurer_id` from the claim, and adds `assigned_to_tenant_id` for the panel beater.

**Claim → Documents:** All documents uploaded to a claim inherit all tags from the claim.

### 5.3 Tag-Based Query Filtering

Database queries are automatically filtered based on subject attributes and resource tags:

```sql
-- Example: Claims Manager querying claims
SELECT * FROM claims
WHERE owner_tenant_id = :subject_tenant_id
  AND sensitivity_level IN ('public', 'internal', 'confidential')
  AND archived = false;

-- Example: Panel Beater querying assigned claims
SELECT * FROM claims
WHERE assigned_to_tenant_id = :subject_tenant_id
  AND status IN ('assigned_to_panel_beater', 'quote_submitted', 'repair_in_progress')
  AND archived = false;

-- Example: Broker querying represented fleet claims
SELECT * FROM claims
WHERE fleet_operator_id IN (:subject_represented_fleet_ids)
  AND archived = false;
```

---

## 6. Claim Assignment-Based Access for Repairers

### 6.1 Assignment Workflow

Panel beaters gain access to claims through an explicit assignment workflow:

**Step 1: Claim Assignment**  
Insurer claims manager assigns claim to panel beater tenant. System creates assignment record with `claim_id`, `assigned_to_tenant_id`, `assigned_at`, and `assignment_expires_at`.

**Step 2: Tag Update**  
System updates claim tags to include `assigned_to_tenant_id` for the panel beater.

**Step 3: Access Grant**  
Panel beater users within the assigned tenant gain read access to claim details, vehicle information, and damage photos. They can submit quotes and update repair status.

**Step 4: Assignment Expiration**  
Assignment expires after 30 days if no quote is submitted. System automatically removes `assigned_to_tenant_id` tag and revokes access.

**Step 5: Assignment Completion**  
When repair is completed and claim is closed, system archives assignment and revokes access.

### 6.2 Access Scope for Panel Beaters

Panel beaters have limited access to assigned claims:

**Allowed Operations:**
- Read claim details (claim number, incident date, incident description)
- Read vehicle information (make, model, year, VIN)
- Read damage photos and assessor notes
- Submit repair quotes with line items
- Update repair status (quote_submitted, repair_in_progress, repair_completed)
- Upload repair completion photos

**Denied Operations:**
- Read claimant personal information (name, ID number, contact details) - masked
- Read insurer internal notes and fraud indicators
- Read other panel beaters' quotes (until claim is closed)
- Approve or reject claims
- Assign claims to other panel beaters
- Access claims not assigned to their tenant

### 6.3 Data Masking for Panel Beaters

Personal information is automatically masked when panel beaters access claims:

**Claimant Name:** Masked to initials (e.g., "John Smith" → "J. S.")  
**ID Number:** Masked to last 4 digits (e.g., "8501015800080" → "****5800080")  
**Contact Number:** Masked to last 3 digits (e.g., "+27821234567" → "+2782123****")  
**Email Address:** Masked domain (e.g., "john@example.com" → "j***@example.com")  
**Physical Address:** Masked to suburb and city only (e.g., "123 Main St, Sandton, Johannesburg" → "Sandton, Johannesburg")

---

## 7. Policyholder/Fleet Relationship-Based Access

### 7.1 Fleet Operator Access Model

Fleet operators access claims related to their vehicles through ownership relationships:

**Vehicle Ownership Relationship:**  
Fleet operators own vehicles registered in the system. Each vehicle has `fleet_operator_id` tag linking it to the fleet operator tenant.

**Claim Access:**  
When a claim is created for a vehicle owned by a fleet operator, the claim inherits `fleet_operator_id` tag. Fleet operator users can access all claims for their vehicles.

**Access Scope:**
- Read all claims for owned vehicles
- Submit new claims for owned vehicles
- View claim status and updates
- View assessor evaluations and repair quotes
- Download claim documents and reports
- View driver information for incidents involving their vehicles

**Data Restrictions:**
- Cannot access insurer internal notes or fraud indicators
- Cannot approve or reject claims
- Cannot assign panel beaters
- Cannot modify assessor evaluations

### 7.2 Broker Representation Model

Brokers access claims on behalf of fleet operators or individual policyholders through representation relationships:

**Representation Relationship:**  
Brokers establish representation relationships with fleet operators or policyholders. System creates `broker_representation` records with `broker_tenant_id`, `represented_entity_id`, `represented_entity_type` (fleet_operator, individual), and `representation_expires_at`.

**Claim Access:**  
Brokers can access claims for represented entities. System checks `broker_representation` table and grants access if relationship exists and is active.

**Access Scope:**
- Submit claims on behalf of represented entities
- View claim status and updates for represented entities
- Communicate with insurers on behalf of represented entities
- Download claim documents for represented entities

**Data Restrictions:**
- Cannot access insurer internal notes or fraud indicators
- Cannot approve or reject claims
- Cannot assign panel beaters
- Cannot modify assessor evaluations
- Cannot access claims for non-represented entities

### 7.3 Relationship Lifecycle Management

**Relationship Creation:**  
Fleet operators or policyholders authorize brokers to represent them. System creates representation record with start date and optional expiration date.

**Relationship Renewal:**  
Representation relationships expire after 1 year by default. System sends renewal notifications 30 days before expiration. Fleet operators can renew or terminate relationships.

**Relationship Termination:**  
Fleet operators can terminate representation relationships at any time. System immediately revokes broker access to future claims. Historical claims remain accessible for audit purposes.

**Audit Trail:**  
All representation relationship changes are logged in audit trail with timestamps, initiating user, and reason for change.

---

## 8. API and Event Bus Access Filtering Enforcement

### 8.1 API Layer Enforcement

**tRPC Middleware Integration:**  
ABAC middleware (`server/_core/abac-middleware.ts`) is integrated into all tRPC procedures. Middleware intercepts requests, extracts subject/resource/action attributes, calls PDP, and enforces decision.

**Procedure-Level Enforcement:**
```typescript
// Example: Claims router with ABAC enforcement
export const claimsRouter = router({
  getById: protectedProcedure
    .input(z.object({ claimId: z.string() }))
    .use(abacMiddleware({ resource: 'claim', action: 'read' }))
    .query(async ({ ctx, input }) => {
      // ABAC middleware has already verified access
      // Query is automatically filtered by tenant_id
      const claim = await ctx.db
        .select()
        .from(claims)
        .where(eq(claims.id, input.claimId))
        .where(eq(claims.tenantId, ctx.tenant.id));
      
      // Apply data masking based on stakeholder type
      return maskClaimData(claim, ctx.user.stakeholderType);
    }),
});
```

**Query-Level Filtering:**  
Database queries are automatically filtered using query builder (`server/_core/abac-query-builder.ts`) that injects WHERE clauses based on subject attributes.

**Response Filtering:**  
API responses are filtered to remove fields that the subject is not authorized to access. Field-level access control is defined in policy database.

### 8.2 Event Bus Layer Enforcement

**Kafka Consumer Filtering:**  
Event consumers subscribe to Kafka topics with ABAC filters. System evaluates subscriber's access rights before delivering events.

**Event Filtering Logic:**
```typescript
// Example: Kafka consumer with ABAC filtering
kafkaConsumer.subscribe('claim.status.changed', {
  filter: (event, subscriber) => {
    const subject = {
      tenant_id: subscriber.tenant_id,
      role: subscriber.role,
      stakeholder_type: subscriber.stakeholder_type,
    };
    
    const resource = {
      type: 'claim',
      owner_tenant_id: event.payload.claim.owner_tenant_id,
      assigned_to_tenant_id: event.payload.claim.assigned_to_tenant_id,
    };
    
    const action = { operation: 'read' };
    
    return policyEngine.evaluateAccess(subject, resource, action);
  },
});
```

**Event Masking:**  
Events are masked before delivery to remove fields that the subscriber is not authorized to access. Masking rules are defined in policy database.

**Event Audit Logging:**  
All event deliveries are logged in audit trail with subscriber details, event type, and access decision.

### 8.3 Database Layer Enforcement

**Row-Level Security (RLS):**  
PostgreSQL Row-Level Security policies are applied to all tables to enforce tenant isolation at the database level.

**Example RLS Policy:**
```sql
-- Claims table RLS policy for insurers
CREATE POLICY claims_insurer_access ON claims
  FOR SELECT
  TO insurer_role
  USING (
    owner_tenant_id = current_setting('app.current_tenant_id')::uuid
  );

-- Claims table RLS policy for panel beaters
CREATE POLICY claims_panel_beater_access ON claims
  FOR SELECT
  TO panel_beater_role
  USING (
    assigned_to_tenant_id = current_setting('app.current_tenant_id')::uuid
    AND status IN ('assigned_to_panel_beater', 'quote_submitted', 'repair_in_progress')
  );
```

**Query Builder Integration:**  
Application-level query builder automatically sets `app.current_tenant_id` session variable before executing queries. RLS policies enforce access control at the database level.

**Performance Optimization:**  
RLS policies are optimized with indexes on `owner_tenant_id` and `assigned_to_tenant_id` columns for fast filtering.

---

## 9. Full Audit Logging of Access Activity

### 9.1 Audit Log Schema

All access activity is logged in the `access_audit_log` table:

```sql
CREATE TABLE access_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  
  -- Subject attributes
  user_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  role VARCHAR(50) NOT NULL,
  stakeholder_type VARCHAR(50) NOT NULL,
  
  -- Resource attributes
  resource_type VARCHAR(50) NOT NULL,
  resource_id UUID NOT NULL,
  resource_owner_tenant_id UUID,
  
  -- Action attributes
  action_operation VARCHAR(50) NOT NULL,
  action_scope VARCHAR(50),
  
  -- Access decision
  decision VARCHAR(10) NOT NULL, -- 'allow' or 'deny'
  decision_reason TEXT,
  policy_id VARCHAR(100),
  
  -- Environment attributes
  ip_address VARCHAR(45),
  user_agent TEXT,
  device_type VARCHAR(50),
  mfa_verified BOOLEAN,
  
  -- Request/response details
  request_method VARCHAR(10),
  request_path TEXT,
  request_params JSONB,
  response_status INTEGER,
  response_time_ms INTEGER,
  
  -- Indexes
  INDEX idx_access_audit_user (user_id, timestamp DESC),
  INDEX idx_access_audit_resource (resource_type, resource_id, timestamp DESC),
  INDEX idx_access_audit_tenant (tenant_id, timestamp DESC),
  INDEX idx_access_audit_decision (decision, timestamp DESC)
);
```

### 9.2 Audit Log Retention Policy

**Retention Period:** 7 years (to comply with POPIA and insurance industry regulations)  
**Storage:** Hot storage (PostgreSQL) for 90 days, warm storage (S3) for 7 years  
**Archival:** Daily batch job archives logs older than 90 days to S3 with WORM compliance  
**Deletion:** Logs are permanently deleted after 7 years

### 9.3 Audit Log Analysis and Alerting

**Real-Time Alerting:**  
System monitors audit logs for suspicious activity and triggers alerts:

- Multiple failed access attempts (5+ denials in 5 minutes) → Alert security team
- Access to restricted resources by unauthorized users → Alert compliance team
- Unusual access patterns (access outside normal hours, access from new location) → Alert user and security team
- Bulk data access (100+ records accessed in 1 minute) → Alert compliance team

**Periodic Audit Reports:**  
System generates weekly audit reports for compliance team:

- Access activity by stakeholder type
- Most accessed resources
- Denied access attempts by reason
- Users with highest access volume
- Unusual access patterns

**Compliance Audits:**  
Audit logs are made available to external auditors for POPIA and GDPR compliance audits. Logs are exported to read-only S3 buckets with auditor access.

---

## 10. Scalable Stakeholder Onboarding Workflow

### 10.1 Automated Onboarding Process

The platform supports automated onboarding of new stakeholders through a self-service portal and CLI tool.

**Step 1: Organization Registration**  
New stakeholder registers organization through self-service portal. System collects organization name, stakeholder type, contact details, and business registration documents.

**Step 2: Identity Verification**  
System verifies organization identity using third-party KYC/KYB service (e.g., Trulioo, Onfido). Verification includes business registration check, director identity verification, and sanctions screening.

**Step 3: Tenant Provisioning**  
Upon successful verification, system provisions tenant resources:
- PostgreSQL schema with RLS policies
- ClickHouse analytics instance
- S3 bucket with KMS encryption key
- Kafka topics for event streaming
- Initial admin user account

**Step 4: Policy Assignment**  
System assigns default ABAC policies based on stakeholder type. Policies can be customized by organization admin.

**Step 5: Integration Setup**  
System provides API credentials, webhook URLs, and integration documentation. Stakeholder can integrate with KINGA platform using tRPC API or Kafka event bus.

**Step 6: Onboarding Completion**  
System sends welcome email with login credentials, integration guide, and support contact. Organization admin can invite additional users.

### 10.2 Onboarding Workflow Diagram

```
Stakeholder Registration
     ↓
Identity Verification (KYC/KYB)
     ↓
Tenant Provisioning
     ├→ PostgreSQL Schema
     ├→ ClickHouse Instance
     ├→ S3 Bucket + KMS Key
     └→ Kafka Topics
     ↓
Policy Assignment (ABAC Policies)
     ↓
Integration Setup (API Credentials)
     ↓
Welcome Email + Documentation
     ↓
Onboarding Complete
```

### 10.3 Onboarding Time and Cost

**Automated Onboarding Time:** 15 minutes (excluding identity verification)  
**Identity Verification Time:** 24-48 hours (third-party service)  
**Total Onboarding Time:** 1-2 business days  
**Onboarding Cost:** $50 per organization (KYC/KYB verification cost)

---

## 11. Security Threat Model

### 11.1 Threat Scenarios

**Threat 1: Unauthorized Cross-Tenant Access**  
**Description:** Attacker attempts to access resources belonging to another tenant by manipulating API requests or exploiting vulnerabilities in access control logic.  
**Mitigation:** Multi-layer enforcement (API, event bus, database) with RLS policies, query-level filtering, and response filtering. All access decisions logged in audit trail.  
**Residual Risk:** Low

**Threat 2: Token Theft and Replay**  
**Description:** Attacker steals JWT token and uses it to impersonate legitimate user.  
**Mitigation:** Token binding to IP address and device fingerprint, short token expiration (1 hour), token revocation list, MFA for sensitive operations.  
**Residual Risk:** Low

**Threat 3: Privilege Escalation**  
**Description:** Attacker with low-privilege account attempts to escalate privileges by modifying token claims or exploiting policy evaluation logic.  
**Mitigation:** Token signature verification with RS256, immutable token claims, policy evaluation with deny-override conflict resolution, audit logging of all access decisions.  
**Residual Risk:** Low

**Threat 4: Data Exfiltration by Malicious Insider**  
**Description:** Malicious insider with legitimate access attempts to exfiltrate large volumes of data.  
**Mitigation:** Rate limiting on API requests, bulk access alerting, audit logging of all data access, data masking for non-owners, DLP monitoring on S3 buckets.  
**Residual Risk:** Medium

**Threat 5: Policy Manipulation**  
**Description:** Attacker with admin access attempts to modify ABAC policies to grant unauthorized access.  
**Mitigation:** Policy changes require MFA, policy change audit logging, policy version control with rollback capability, separation of duties (policy admin ≠ data owner).  
**Residual Risk:** Low

**Threat 6: Event Bus Eavesdropping**  
**Description:** Attacker intercepts Kafka events to access sensitive data.  
**Mitigation:** Kafka TLS encryption in transit, event payload encryption at rest, ABAC filtering before event delivery, event access audit logging.  
**Residual Risk:** Low

**Threat 7: Relationship Exploitation**  
**Description:** Attacker exploits broker representation relationship to access claims without authorization.  
**Mitigation:** Relationship expiration (1 year), relationship renewal workflow, relationship termination by fleet operator, relationship change audit logging.  
**Residual Risk:** Medium

**Threat 8: Assignment Abuse**  
**Description:** Panel beater retains access to claims after assignment expiration or completion.  
**Mitigation:** Automatic assignment expiration (30 days), assignment completion workflow, access revocation on assignment end, assignment status audit logging.  
**Residual Risk:** Low

### 11.2 Security Controls Summary

| Control Category | Control | Implementation |
|-----------------|---------|----------------|
| Authentication | Multi-Factor Authentication | Required for internal users, optional for others |
| Authentication | Token Expiration | 1 hour for access tokens, 30 days for refresh tokens |
| Authentication | Token Revocation | Redis-based revocation list |
| Authorization | Attribute-Based Access Control | Policy decision engine with deny-override |
| Authorization | Multi-Layer Enforcement | API, event bus, database (RLS) |
| Authorization | Data Masking | Field-level masking based on stakeholder type |
| Data Protection | Encryption in Transit | TLS 1.3 for all API and event bus traffic |
| Data Protection | Encryption at Rest | KMS-encrypted S3 buckets, encrypted database volumes |
| Data Protection | Data Minimization | Access limited to necessary fields only |
| Monitoring | Audit Logging | All access decisions logged with 7-year retention |
| Monitoring | Real-Time Alerting | Suspicious activity alerts to security team |
| Monitoring | Bulk Access Detection | Alert on 100+ records accessed in 1 minute |
| Incident Response | Token Revocation | Immediate revocation on compromise detection |
| Incident Response | Policy Rollback | Rollback to previous policy version |
| Incident Response | Access Suspension | Suspend user/tenant access on security incident |

---

## 12. Governance Compliance Alignment

### 12.1 POPIA Compliance

The hierarchical multi-stakeholder access architecture aligns with the Protection of Personal Information Act (POPIA) requirements:

**Accountability (Section 8):**  
KINGA acts as the responsible party for personal information processing. Each stakeholder (insurer, fleet operator, broker) is an operator processing personal information on behalf of KINGA. Written agreements define processing obligations and data protection responsibilities.

**Processing Limitation (Section 9-12):**  
Access control policies enforce purpose limitation by restricting access to personal information based on stakeholder role and business need. Panel beaters access only information necessary for repair estimation. Brokers access only information necessary for claim submission on behalf of represented entities.

**Further Processing Limitation (Section 13-14):**  
Audit logs track all access to personal information, enabling detection of unauthorized further processing. Data masking prevents panel beaters from accessing claimant personal information for purposes other than repair estimation.

**Information Quality (Section 15-17):**  
Access control policies ensure data accuracy by limiting write access to authorized users. Audit logs enable tracing of data modifications to responsible users.

**Openness (Section 18):**  
Data subjects (claimants, fleet operators) can request access logs showing who accessed their personal information. System generates access reports from audit logs.

**Security Safeguards (Section 19):**  
Multi-layer access control (API, event bus, database), encryption in transit and at rest, token-based authentication, MFA for sensitive operations, and comprehensive audit logging provide security safeguards for personal information.

**Data Subject Participation (Section 20-25):**  
Data subjects can request access, correction, or deletion of their personal information. System provides self-service portal for data subject requests. Access control policies ensure only authorized users can fulfill data subject requests.

### 12.2 GDPR Alignment

The architecture aligns with General Data Protection Regulation (GDPR) principles for insurers operating in EU markets:

**Lawfulness, Fairness, and Transparency (Article 5(1)(a)):**  
Access control policies enforce lawful processing by restricting access based on legitimate interest and consent. Audit logs provide transparency into data processing activities.

**Purpose Limitation (Article 5(1)(b)):**  
ABAC policies enforce purpose limitation by restricting access to personal data based on stakeholder role and business need.

**Data Minimization (Article 5(1)(c)):**  
Data masking and field-level access control ensure stakeholders access only the minimum personal data necessary for their role.

**Accuracy (Article 5(1)(d)):**  
Access control policies limit write access to authorized users, ensuring data accuracy.

**Storage Limitation (Article 5(1)(e)):**  
Audit log retention policy (7 years) aligns with insurance industry data retention requirements. Personal data is deleted after retention period.

**Integrity and Confidentiality (Article 5(1)(f)):**  
Multi-layer access control, encryption, token-based authentication, and audit logging ensure data integrity and confidentiality.

**Accountability (Article 5(2)):**  
Comprehensive audit logging demonstrates compliance with GDPR principles. Access reports can be provided to data protection authorities.

### 12.3 Compliance Audit Support

The architecture provides comprehensive audit support for POPIA and GDPR compliance audits:

**Audit Log Exports:**  
System can export audit logs to CSV or JSON format for external auditors. Exports include all access activity for specified time period, stakeholder, or resource.

**Access Reports:**  
System generates access reports showing:
- Who accessed personal information
- When personal information was accessed
- What personal information was accessed
- Why personal information was accessed (policy ID and reason)

**Policy Documentation:**  
All ABAC policies are documented in policy database with policy ID, description, stakeholder type, resource type, action, and conditions. Policy documentation can be exported for auditors.

**Data Flow Diagrams:**  
System provides data flow diagrams showing how personal information flows through the platform and which stakeholders have access at each stage.

**Compliance Dashboards:**  
System provides compliance dashboards showing:
- Access activity by stakeholder type
- Denied access attempts by reason
- Data subject requests and fulfillment status
- Policy changes and approvals

---

## 13. Implementation Roadmap

### 13.1 Phase 1: Foundation (Weeks 1-4)

**Week 1-2: Identity Hierarchy and Database Schema**
- Implement three-tier identity hierarchy (Organization → Tenant → User)
- Add stakeholder_type, organization_id, tenant_id fields to users table
- Create organizations and tenants tables
- Implement relationship tables (broker_representation, claim_assignment)
- Create resource tagging schema (owner_tenant_id, assigned_to_tenant_id, sensitivity_level)

**Week 3-4: ABAC Policy Engine**
- Implement policy decision point (PDP) service
- Create policy database schema
- Implement policy evaluation logic with deny-override
- Create default policies for each stakeholder type
- Implement policy caching with 5-minute TTL

### 13.2 Phase 2: Enforcement (Weeks 5-8)

**Week 5-6: API Layer Enforcement**
- Implement ABAC middleware for tRPC procedures
- Integrate PDP into middleware
- Implement query-level filtering with query builder
- Implement response filtering and data masking
- Add audit logging to all API requests

**Week 7-8: Event Bus and Database Enforcement**
- Implement ABAC filtering for Kafka consumers
- Implement event masking before delivery
- Implement PostgreSQL Row-Level Security policies
- Integrate RLS with query builder
- Add audit logging to all event deliveries

### 13.3 Phase 3: Authentication and Authorization (Weeks 9-12)

**Week 9-10: JWT Token Implementation**
- Implement JWT token issuance with embedded ABAC claims
- Implement token validation and signature verification
- Implement token refresh workflow
- Implement token revocation list in Redis
- Implement MFA for internal users

**Week 11-12: Relationship-Based Access**
- Implement claim assignment workflow for panel beaters
- Implement broker representation workflow
- Implement fleet operator ownership relationships
- Implement relationship expiration and renewal
- Implement relationship audit logging

### 13.4 Phase 4: Audit and Compliance (Weeks 13-16)

**Week 13-14: Audit Logging**
- Implement access_audit_log table and logging logic
- Implement audit log archival to S3 with WORM compliance
- Implement real-time alerting for suspicious activity
- Implement weekly audit reports for compliance team
- Implement audit log exports for external auditors

**Week 15-16: Compliance and Onboarding**
- Implement stakeholder onboarding workflow
- Integrate KYC/KYB verification service
- Implement automated tenant provisioning
- Implement compliance dashboards
- Conduct POPIA and GDPR compliance audit

### 13.5 Testing and Validation

**Security Testing:**
- Penetration testing for cross-tenant access vulnerabilities
- Token theft and replay attack testing
- Privilege escalation testing
- Policy manipulation testing

**Performance Testing:**
- Policy evaluation performance testing (target: <10ms per request)
- Query filtering performance testing with large datasets
- Audit logging performance testing (target: <5ms overhead per request)

**Compliance Testing:**
- POPIA compliance audit with external auditor
- GDPR compliance audit with data protection officer
- Access report generation testing
- Data subject request fulfillment testing

---

## 14. Conclusion

The hierarchical multi-stakeholder access architecture provides comprehensive access control for the KINGA AutoVerify platform, supporting five distinct stakeholder types with complex tenant relationships, attribute-based access control, and strict data isolation. The architecture implements multi-layer enforcement at API, event bus, and database layers, ensuring that stakeholders access only the resources they are authorized to access based on ownership, assignment, or representation relationships.

The design balances security, usability, and scalability, enabling insurers, fleet operators, brokers, panel beaters, and internal governance users to collaborate effectively while maintaining data confidentiality and regulatory compliance. Comprehensive audit logging provides full transparency into access activity, supporting POPIA and GDPR compliance audits and enabling detection of unauthorized access attempts.

The 16-week implementation roadmap provides a structured approach to deploying the architecture, with clear milestones for identity hierarchy, policy engine, enforcement layers, authentication, audit logging, and compliance validation. Upon completion, the platform will support scalable onboarding of new stakeholders while maintaining the highest standards of data protection and access control.

---

**Document Control**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-11 | Tavonga Shoko | Initial document creation |

**Approval**

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Chief Technology Officer | | | |
| Chief Information Security Officer | | | |
| Data Protection Officer | | | |

---

**End of Document**
