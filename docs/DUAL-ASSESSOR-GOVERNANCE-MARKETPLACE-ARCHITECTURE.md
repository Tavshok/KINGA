# KINGA Dual Assessor Governance and Marketplace Architecture

**Document ID:** KINGA-DAGMA-2026-015
**Version:** 1.0
**Date:** February 11, 2026
**Author:** Tavonga Shoko
**Status:** Architecture Design
**Classification:** Internal - Strategic Architecture
**Supersedes:** KINGA-AIA-2026-013, KINGA-HAEA-2026-014

---

## Executive Summary

The KINGA AutoVerify AI platform operates within a complex insurance ecosystem where vehicle damage assessors serve as critical verification stakeholders. These assessors fall into two fundamentally distinct categories: **insurer-owned assessors** who operate under the governance of a specific insurer tenant, and **KINGA marketplace assessors** who function as independent professionals available to multiple insurers through a centralized marketplace. This document specifies the comprehensive governance, identity, routing, scoring, and security architecture that enables both assessor types to coexist within the KINGA platform while maintaining strict data isolation, performance accountability, and regulatory compliance.

The dual-model approach addresses a strategic market reality. Many South African insurers have established relationships with assessor firms and require the flexibility to onboard their existing assessors into the KINGA workflow. Simultaneously, smaller insurers and those experiencing capacity constraints benefit from access to a pre-vetted marketplace of independent assessors. By supporting both models within a unified governance framework, KINGA eliminates the forced-choice constraint that limits competing platforms, while creating a sustainable revenue stream through marketplace commissions projected to reach R8.4 million annually by year three.

The architecture implements assignment-based scoped access with claim-level JWT tokens, a weighted performance intelligence scoring engine with six evaluation dimensions, an AI-powered recommendation engine for marketplace matching, cryptographic evidence immutability using SHA-256 hashing with S3 Object Lock, cross-insurer isolation enforced at the database query layer, automated assignment lifecycle management with configurable expiry policies, a tiered certification framework aligned with SAQA NQF Level 4 standards, and comprehensive audit logging with seven-year retention to satisfy FSCA regulatory requirements.

---

## 1. Assessor Identity and Classification Model

### 1.1 Dual-Type Identity Architecture

The KINGA assessor identity model establishes a clear separation between insurer-governed and platform-governed assessors while enabling controlled interaction through the marketplace. The identity hierarchy positions assessors differently depending on their classification, with insurer-owned assessors existing within a tenant boundary and marketplace assessors existing in a cross-tenant global pool.

The following diagram illustrates the identity hierarchy:

```
KINGA Platform (Organization Level)
│
├── Tenant: Insurer A (e.g., Santam Motor)
│   ├── Users: Claims Managers, Fraud Analysts
│   ├── Insurer-Owned Assessors
│   │   ├── Assessor IO-001 (employed by Insurer A)
│   │   └── Assessor IO-002 (contracted to Insurer A)
│   └── Claims
│       ├── Claim C-101 → Assigned to IO-001
│       └── Claim C-102 → Assigned to MP-005 (marketplace)
│
├── Tenant: Insurer B (e.g., OUTsurance)
│   ├── Users: Claims Managers
│   ├── Insurer-Owned Assessors
│   │   └── Assessor IO-003 (employed by Insurer B)
│   └── Claims
│       └── Claim C-201 → Assigned to MP-005 (marketplace)
│
└── KINGA Marketplace Pool (Cross-Tenant)
    ├── Assessor MP-005 (independent, works for A and B)
    ├── Assessor MP-006 (independent, available to all)
    └── Assessor MP-007 (hybrid: primary with Insurer A, marketplace-enabled)
```

### 1.2 Classification Taxonomy

The platform recognizes three assessor classifications, each with distinct governance rules, access patterns, and commercial arrangements. The classification determines how an assessor is onboarded, how assignments are routed, and how performance is measured and compensated.

| Attribute | Insurer-Owned | Marketplace | Hybrid |
|-----------|--------------|-------------|--------|
| **Governance Authority** | Insurer tenant administrator | KINGA platform governance | Dual: insurer primary, KINGA secondary |
| **Tenant Binding** | Bound to single tenant | No tenant binding | Primary tenant + marketplace access |
| **Onboarding Authority** | Insurer claims manager | KINGA vetting committee | Insurer onboards, KINGA approves marketplace |
| **Assignment Source** | Insurer direct assignment only | Marketplace discovery + insurer request | Both direct and marketplace |
| **Data Access Scope** | Assigned claims within own tenant | Assigned claims only, cross-tenant isolated | Tenant claims (direct) + assigned marketplace claims |
| **Performance Oversight** | Insurer internal metrics | KINGA platform-wide scoring | Dual scoring: insurer + platform |
| **Compensation Model** | Insurer payroll or contract | KINGA marketplace commission (15-20%) | Salary (insurer) + commission (marketplace) |
| **Certification Requirement** | Insurer's internal standards | KINGA marketplace certification (NQF Level 4 aligned) | Both standards apply |
| **Audit Authority** | Insurer + KINGA platform | KINGA platform | Insurer + KINGA platform |
| **Suspension Authority** | Insurer administrator | KINGA governance committee | Either authority can suspend |

### 1.3 Identity Data Model

The assessor identity is stored in a dedicated `assessors` table that serves as the canonical registry for all assessor types. This table is intentionally positioned outside the tenant boundary to support cross-tenant marketplace operations, while insurer-owned assessors maintain a foreign key relationship to their governing tenant through the `assessor_insurer_relationships` table.

```sql
CREATE TABLE assessors (
  id                          VARCHAR(36) PRIMARY KEY,
  user_id                     VARCHAR(36) NOT NULL UNIQUE,
  
  -- Professional Identity
  professional_license_number VARCHAR(100) NOT NULL UNIQUE,
  license_expiry_date         DATE NOT NULL,
  saqa_nqf_level              TINYINT DEFAULT 4,
  years_experience            INT DEFAULT 0,
  
  -- Classification
  assessor_type               ENUM('insurer_owned', 'marketplace', 'hybrid') NOT NULL,
  primary_tenant_id           VARCHAR(36),
  marketplace_enabled         BOOLEAN DEFAULT FALSE,
  
  -- Marketplace Profile
  marketplace_status          ENUM('pending_vetting', 'active', 'probation',
                                   'suspended', 'inactive') DEFAULT 'pending_vetting',
  marketplace_bio             TEXT,
  marketplace_hourly_rate     DECIMAL(10,2),
  marketplace_availability    ENUM('full_time', 'part_time', 'weekends_only',
                                   'on_demand') DEFAULT 'on_demand',
  
  -- Specializations
  specializations             JSON,  -- ["motor_vehicle", "heavy_commercial", "motorcycle"]
  certifications              JSON,  -- ["SAQA-99668", "I-CAR-PLATINUM", "ASE-B2"]
  service_regions             JSON,  -- ["gauteng", "western_cape", "kwazulu_natal"]
  
  -- Performance Metrics (Aggregated)
  composite_score             DECIMAL(5,2) DEFAULT 0.00,
  total_assignments_completed INT DEFAULT 0,
  average_turnaround_hours    DECIMAL(8,2) DEFAULT 0.00,
  ai_agreement_rate           DECIMAL(5,2) DEFAULT 0.00,
  
  -- Lifecycle
  onboarded_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_active_at              TIMESTAMP NULL,
  suspended_at                TIMESTAMP NULL,
  suspension_reason           TEXT NULL,
  
  created_at                  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at                  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_assessor_type (assessor_type),
  INDEX idx_marketplace_status (marketplace_status),
  INDEX idx_composite_score (composite_score DESC),
  INDEX idx_service_regions ((CAST(service_regions AS CHAR(500))))
);
```

The `assessor_insurer_relationships` table manages the many-to-many relationship between assessors and insurer tenants, capturing the contractual terms, access permissions, and relationship lifecycle for each pairing.

```sql
CREATE TABLE assessor_insurer_relationships (
  id                  VARCHAR(36) PRIMARY KEY,
  assessor_id         VARCHAR(36) NOT NULL,
  tenant_id           VARCHAR(36) NOT NULL,
  
  -- Relationship Classification
  relationship_type   ENUM('employed', 'contracted', 'marketplace', 'hybrid') NOT NULL,
  contract_start_date DATE NOT NULL,
  contract_end_date   DATE NULL,
  
  -- Access and Assignment Limits
  max_concurrent_claims INT DEFAULT 10,
  allowed_claim_types   JSON,  -- ["motor_vehicle", "commercial_fleet"]
  allowed_regions       JSON,  -- ["gauteng", "western_cape"]
  
  -- Commercial Terms (Marketplace)
  commission_rate       DECIMAL(5,2) DEFAULT 15.00,
  payment_terms_days    INT DEFAULT 14,
  
  -- Relationship Status
  status              ENUM('active', 'paused', 'terminated') DEFAULT 'active',
  
  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  UNIQUE KEY uk_assessor_tenant (assessor_id, tenant_id),
  FOREIGN KEY (assessor_id) REFERENCES assessors(id),
  INDEX idx_tenant_status (tenant_id, status)
);
```

---

## 2. Assignment Routing Workflow

### 2.1 Unified Assignment Pipeline

The assignment routing workflow provides a single pipeline that handles both insurer-owned and marketplace assessor assignments. The pipeline consists of five stages: **claim intake**, **eligibility filtering**, **scoring and ranking**, **assignment execution**, and **lifecycle management**. Each stage applies different logic depending on whether the insurer is using their own assessors or requesting marketplace assessors.

```
┌─────────────────────────────────────────────────────────────────────┐
│                    ASSIGNMENT ROUTING PIPELINE                      │
│                                                                     │
│  ┌──────────┐   ┌──────────────┐   ┌─────────────┐   ┌──────────┐ │
│  │  Claim    │──▶│  Eligibility │──▶│  Scoring &  │──▶│Assignment│ │
│  │  Intake   │   │  Filtering   │   │  Ranking    │   │Execution │ │
│  └──────────┘   └──────────────┘   └─────────────┘   └──────────┘ │
│       │               │                   │                │       │
│       ▼               ▼                   ▼                ▼       │
│  Parse claim     Filter by:          Rank by:         Create       │
│  metadata,       - License valid     - Composite      assignment   │
│  determine       - Region match        score          record,      │
│  complexity,     - Specialization    - Availability   issue        │
│  extract         - Capacity          - Proximity      scoped       │
│  requirements    - Certification     - Turnaround     JWT token    │
│                  - Not suspended     - AI agreement                │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                  LIFECYCLE MANAGEMENT                         │   │
│  │  Monitor → Remind → Escalate → Expire → Reassign            │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Assignment Routing Logic

The routing logic diverges based on the assignment source. When an insurer assigns one of their own assessors, the pipeline performs a simplified eligibility check (license validity, capacity, region) and proceeds directly to assignment execution. When an insurer requests a marketplace assessor, the pipeline engages the full scoring and ranking engine to identify the optimal match.

**Insurer-Owned Assignment Flow:**

```typescript
async function assignInsurerOwnedAssessor(
  claimId: string,
  assessorId: string,
  tenantId: string
): Promise<AssignmentResult> {
  // Step 1: Verify assessor belongs to this tenant
  const relationship = await getAssessorTenantRelationship(assessorId, tenantId);
  if (!relationship || relationship.status !== 'active') {
    throw new AccessDeniedError('Assessor not authorized for this tenant');
  }
  
  // Step 2: Verify eligibility
  const assessor = await getAssessorById(assessorId);
  if (assessor.license_expiry_date < new Date()) {
    throw new EligibilityError('Assessor license has expired');
  }
  
  const activeCount = await getActiveAssignmentCount(assessorId);
  if (activeCount >= relationship.max_concurrent_claims) {
    throw new CapacityError('Assessor at maximum concurrent claim capacity');
  }
  
  // Step 3: Create assignment with scoped token
  const assignment = await createAssignment({
    claimId,
    assessorId,
    tenantId,
    assignmentType: 'insurer_direct',
    expiresAt: addDays(new Date(), 30),
  });
  
  // Step 4: Issue claim-scoped JWT
  const scopedToken = await issueClaimScopedToken(assessorId, claimId, tenantId);
  
  // Step 5: Audit log
  await logAuditEvent('ASSIGNMENT_CREATED', {
    assessorId, claimId, tenantId,
    assignmentType: 'insurer_direct',
    assignedBy: ctx.user.id,
  });
  
  return { assignment, scopedToken };
}
```

**Marketplace Assignment Flow:**

```typescript
async function assignMarketplaceAssessor(
  claimId: string,
  tenantId: string,
  preferences?: MarketplacePreferences
): Promise<AssignmentResult> {
  // Step 1: Extract claim requirements
  const claim = await getClaimById(claimId);
  const requirements = extractAssessmentRequirements(claim);
  
  // Step 2: Query eligible marketplace assessors
  const candidates = await searchMarketplaceAssessors({
    specializations: requirements.vehicleTypes,
    regions: [claim.incident_region],
    minCompositeScore: preferences?.minScore ?? 70,
    availability: ['full_time', 'part_time', 'on_demand'],
    excludeAssessors: await getConflictedAssessors(claimId, tenantId),
  });
  
  // Step 3: Score and rank candidates
  const rankedCandidates = await scoreAndRankCandidates(candidates, {
    claimComplexity: requirements.complexity,
    urgency: claim.priority,
    location: claim.incident_location,
    weights: preferences?.weights ?? DEFAULT_RANKING_WEIGHTS,
  });
  
  // Step 4: Select top candidate (or return ranked list for manual selection)
  if (preferences?.autoAssign) {
    const selected = rankedCandidates[0];
    return await executeMarketplaceAssignment(selected, claimId, tenantId);
  }
  
  return { candidates: rankedCandidates.slice(0, 10) };
}
```

### 2.3 Conflict Detection

Marketplace assessors who work across multiple insurers introduce the risk of conflict of interest. The routing engine implements a conflict detection layer that prevents an assessor from being assigned to claims where a conflict exists. The following conflict rules are enforced:

| Conflict Type | Detection Rule | Action |
|--------------|---------------|--------|
| **Same-Incident Conflict** | Assessor already assigned to another claim from the same accident | Block assignment |
| **Opposing-Party Conflict** | Assessor has active assignment from the opposing insurer in a liability dispute | Block assignment |
| **Recent Insurer Conflict** | Assessor completed an assignment for a competing insurer within the last 90 days on a related policy | Flag for manual review |
| **Volume Concentration** | More than 60% of assessor's assignments in the last 6 months are from a single insurer | Flag for review (independence concern) |
| **Financial Interest** | Assessor has a declared financial interest in the panel beater or repair facility | Block assignment |

---

## 3. Marketplace Onboarding Architecture

### 3.1 Insurer-Owned Assessor Onboarding

Insurer-owned assessors are onboarded through a streamlined process managed by the insurer's claims manager or administrator. The insurer retains full governance authority over their assessors, and KINGA serves as the workflow platform without imposing marketplace certification requirements.

The onboarding process follows four stages:

**Stage 1: Registration.** The insurer administrator creates the assessor profile within their tenant, providing professional license details, specialization areas, and service regions. The system validates the license number format and checks for duplicates across the platform.

**Stage 2: Credential Verification.** The platform verifies the assessor's professional license against the SAQA database (where available) and confirms the license expiry date. For insurer-owned assessors, the insurer attests to the assessor's qualifications, and KINGA records this attestation in the audit log.

**Stage 3: Access Provisioning.** The system creates the assessor's user account, establishes the tenant relationship, configures access permissions based on the insurer's policies (allowed claim types, regions, concurrent claim limits), and generates authentication credentials.

**Stage 4: Activation.** The assessor receives an invitation to complete their profile, set up two-factor authentication, and acknowledge the platform's terms of service and data processing agreement. Upon completion, the assessor's status transitions to `active` and they become eligible for assignments.

### 3.2 Marketplace Assessor Onboarding

Marketplace assessors undergo a more rigorous onboarding process because KINGA assumes governance responsibility for their professional conduct and quality standards. The marketplace onboarding pipeline implements a five-stage vetting process designed to ensure that only qualified, reliable assessors enter the marketplace.

**Stage 1: Application.** Independent assessors submit their application through the public-facing `/join-as-assessor` page, providing personal details, professional license information, qualifications, specialization areas, service regions, and availability preferences. The application requires upload of supporting documents including license certificates, proof of professional indemnity insurance, and a portfolio of previous assessment reports (anonymized).

**Stage 2: Automated Screening.** The platform performs automated checks including license number validation, duplicate detection (preventing assessors from creating multiple marketplace profiles), sanctions list screening, and basic document verification using OCR and AI-powered document analysis.

**Stage 3: Professional Vetting.** A KINGA vetting committee reviews the application, evaluating the assessor's qualifications against the SAQA NQF Level 4 Insurance Claims Administrator standard (SAQA ID: 99668) [1]. The committee assesses the applicant's experience depth, specialization breadth, and professional references. This stage includes a structured interview conducted via video call.

**Stage 4: Probationary Period.** Approved assessors enter a 90-day probationary period during which they are assigned to lower-complexity claims with mandatory peer review of their first five assessment reports. The probationary assessor's composite score must reach a minimum threshold of 65 out of 100 to achieve full marketplace status.

**Stage 5: Full Activation.** Upon successful completion of the probationary period, the assessor's marketplace status transitions to `active`, their profile becomes visible in marketplace search results, and they become eligible for all claim types matching their specializations.

### 3.3 Onboarding Comparison

| Dimension | Insurer-Owned | Marketplace |
|-----------|--------------|-------------|
| **Application Channel** | Insurer admin portal | Public `/join-as-assessor` page |
| **Vetting Authority** | Insurer (self-attested) | KINGA vetting committee |
| **Document Requirements** | License + insurer attestation | License + PI insurance + portfolio + references |
| **Automated Screening** | License validation only | Full screening (sanctions, duplicates, OCR) |
| **Interview Required** | No | Yes (structured video interview) |
| **Probationary Period** | None (insurer's responsibility) | 90 days with peer review |
| **Minimum Score Threshold** | None (insurer's discretion) | 65/100 composite score |
| **Time to Activation** | 1-2 business days | 10-15 business days |
| **Ongoing Certification** | Insurer manages | KINGA annual recertification |

---

## 4. Performance Intelligence Scoring Framework

### 4.1 Composite Score Architecture

The performance intelligence scoring framework evaluates assessors across six weighted dimensions to produce a composite score on a 0-100 scale. The scoring engine operates continuously, recalculating scores after each completed assignment to provide real-time performance visibility. The framework applies to both insurer-owned and marketplace assessors, though the weights and thresholds differ based on the governance context.

| Dimension | Weight (Marketplace) | Weight (Insurer-Owned) | Measurement Method |
|-----------|---------------------|----------------------|-------------------|
| **Accuracy** | 30% | 25% | AI agreement rate + peer review variance |
| **Timeliness** | 20% | 25% | Assignment completion vs SLA target |
| **Thoroughness** | 20% | 20% | Report completeness score (checklist coverage) |
| **Professionalism** | 10% | 10% | Insurer satisfaction ratings (1-5 scale) |
| **Compliance** | 10% | 15% | Audit finding rate + evidence integrity |
| **Consistency** | 10% | 5% | Standard deviation of accuracy across assignments |

### 4.2 Scoring Formulas

The composite score is calculated using a weighted sum of normalized dimension scores, with each dimension score derived from specific measurement inputs.

**Accuracy Score (0-100):**

The accuracy dimension measures how closely the assessor's damage assessment aligns with the KINGA AI engine's independent assessment and, where available, peer review assessments. The formula applies a tolerance band to account for legitimate professional judgment differences.

```
accuracy_score = (
  (ai_agreement_weight * ai_agreement_rate) +
  (peer_review_weight * peer_review_alignment) +
  (final_outcome_weight * final_outcome_accuracy)
)

Where:
  ai_agreement_rate = COUNT(assessments WHERE |assessor_estimate - ai_estimate| < tolerance)
                      / COUNT(total_assessments) * 100
  tolerance = MAX(claim_value * 0.10, R5000)  -- 10% or R5,000 minimum
  ai_agreement_weight = 0.50
  peer_review_weight = 0.30
  final_outcome_weight = 0.20
```

**Timeliness Score (0-100):**

```
timeliness_score = CASE
  WHEN avg_completion_hours <= sla_target_hours * 0.75 THEN 100
  WHEN avg_completion_hours <= sla_target_hours THEN 85 + (15 * (1 - (avg_completion_hours - sla_target_hours * 0.75) / (sla_target_hours * 0.25)))
  WHEN avg_completion_hours <= sla_target_hours * 1.25 THEN 70 - (30 * (avg_completion_hours - sla_target_hours) / (sla_target_hours * 0.25))
  ELSE MAX(0, 40 - (avg_completion_hours - sla_target_hours * 1.25))
END
```

**Thoroughness Score (0-100):**

The thoroughness dimension evaluates report completeness against a standardized checklist of required assessment elements. Each element is weighted based on its importance to the claim decision.

| Report Element | Weight | Description |
|---------------|--------|-------------|
| Damage photographs (minimum 12) | 15% | Comprehensive photographic evidence |
| Structural damage assessment | 20% | Detailed structural integrity evaluation |
| Parts identification and pricing | 20% | Itemized parts list with market pricing |
| Labour hour estimation | 15% | Repair labour hours with justification |
| Paint and materials assessment | 10% | Paint code, materials, and finish requirements |
| Safety system evaluation | 10% | Airbags, ABS, structural safety assessment |
| Total loss determination (if applicable) | 10% | Salvage value, write-off threshold analysis |

### 4.3 Assessor Recommendation Engine

The recommendation engine uses the composite score as a primary ranking signal, augmented by contextual factors specific to each claim. The engine produces a ranked list of recommended assessors for marketplace assignments, with each recommendation accompanied by a confidence score and match explanation.

**Recommendation Algorithm:**

```
recommendation_score = (
  composite_score * 0.40 +
  specialization_match * 0.20 +
  proximity_score * 0.15 +
  availability_score * 0.10 +
  historical_insurer_satisfaction * 0.10 +
  workload_balance * 0.05
)

Where:
  specialization_match = 100 if assessor specializations contain all claim requirements, else partial match percentage
  proximity_score = MAX(0, 100 - (distance_km * 2))  -- Decreases 2 points per km
  availability_score = 100 if available within 24h, 75 if within 48h, 50 if within 72h, 25 otherwise
  historical_insurer_satisfaction = average rating from this specific insurer (if exists), else platform average
  workload_balance = 100 - (current_active_assignments / max_concurrent_claims * 100)
```

The recommendation engine also implements **diversity promotion** to prevent assignment concentration. If a single assessor receives more than 40% of a specific insurer's marketplace assignments in a rolling 30-day window, the engine applies a 20% score penalty to promote distribution across the assessor pool.

---

## 5. Access Control Enforcement

### 5.1 Claim-Scoped JWT Architecture

Access control for assessors is enforced through claim-scoped JWT tokens that encode the precise boundaries of the assessor's access. Unlike standard user JWTs that grant tenant-wide access, assessor JWTs contain an explicit list of authorized claim identifiers and the permitted operations for each claim.

**Token Structure:**

```json
{
  "sub": "assessor-MP-005",
  "iss": "kinga-platform",
  "iat": 1739280000,
  "exp": 1741872000,
  "type": "assessor_scoped",
  "assessor_type": "marketplace",
  "assignments": [
    {
      "claim_id": "CLM-2026-001234",
      "tenant_id": "tenant-santam",
      "permissions": ["read_claim", "read_evidence", "submit_report", "upload_evidence"],
      "assignment_expires": "2026-03-11T00:00:00Z"
    }
  ],
  "denied_scopes": [
    "read_analytics",
    "read_tenant_data",
    "read_other_claims",
    "manage_users",
    "manage_settings"
  ]
}
```

### 5.2 Enforcement Layers

Access control is enforced at three layers to provide defence in depth. Each layer independently validates the assessor's authorization, ensuring that a failure at one layer does not compromise data isolation.

**Layer 1: API Gateway (tRPC Middleware)**

Every tRPC procedure that handles assessor-accessible data includes middleware that validates the claim-scoped token and verifies that the requested resource falls within the token's authorized scope.

```typescript
const assessorScopedProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (ctx.user.role !== 'assessor') {
    return next({ ctx });  // Non-assessors use standard RBAC
  }
  
  const token = ctx.assessorToken;
  if (!token || token.type !== 'assessor_scoped') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Assessor scoped token required' });
  }
  
  // Verify token has not been revoked
  const isRevoked = await checkTokenRevocation(token.jti);
  if (isRevoked) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Token has been revoked' });
  }
  
  // Inject authorized claim IDs into context for downstream use
  const authorizedClaims = token.assignments
    .filter(a => new Date(a.assignment_expires) > new Date())
    .map(a => a.claim_id);
  
  return next({
    ctx: { ...ctx, authorizedClaims, assessorType: token.assessor_type }
  });
});
```

**Layer 2: Database Query Filtering**

All database queries executed in the context of an assessor request include a mandatory `WHERE` clause that restricts results to the assessor's authorized claims. This filtering is applied at the query helper level, making it impossible for application code to accidentally bypass the restriction.

```typescript
async function getClaimForAssessor(
  claimId: string,
  authorizedClaims: string[]
): Promise<Claim | null> {
  if (!authorizedClaims.includes(claimId)) {
    return null;  // Silently deny access to unauthorized claims
  }
  
  const [claim] = await db
    .select()
    .from(claims)
    .where(
      and(
        eq(claims.id, claimId),
        inArray(claims.id, authorizedClaims)
      )
    );
  
  return claim ?? null;
}
```

**Layer 3: Response Sanitization**

Even after query-level filtering, the response sanitization layer removes sensitive fields that assessors should not see, such as internal fraud scores, insurer-specific notes, and financial settlement details.

| Field Category | Insurer-Owned Access | Marketplace Access |
|---------------|---------------------|-------------------|
| Claim details (damage, vehicle, incident) | Full access | Full access |
| Claimant personal information | Name + contact only | Name only |
| Previous assessment reports | Own reports + AI summary | Own reports only |
| Fraud indicators | Visible (if authorized) | Never visible |
| Settlement amounts | Never visible | Never visible |
| Insurer internal notes | Never visible | Never visible |
| Other assessor reports | Visible (insurer policy) | Never visible |
| Analytics and dashboards | Never visible | Never visible |

### 5.3 Cross-Insurer Isolation for Marketplace Assessors

Marketplace assessors who work across multiple insurers present a unique data isolation challenge. The platform must ensure that an assessor working on Claim A for Insurer X cannot access any data belonging to Insurer Y, even if the assessor also has active assignments from Insurer Y. The isolation is enforced through the claim-scoped token architecture described above, combined with tenant-aware query filtering.

The critical isolation rule is: **a marketplace assessor's session context is always bound to a single claim at a time**. When the assessor switches between claims (even claims from the same insurer), the system requires re-authentication against the specific claim's scoped token. This prevents session-level data leakage between assignments.

---

## 6. Evidence Immutability and Report Versioning

### 6.1 Evidence Integrity Protection

All evidence uploaded by assessors (photographs, documents, measurement data) is stored with cryptographic integrity protection to ensure that evidence cannot be altered after submission. The integrity protection system uses a three-layer approach: content hashing, storage immutability, and chain-of-custody logging.

**Content Hashing:** Upon upload, each evidence file is hashed using SHA-256. The hash is stored in the database alongside the evidence metadata, and a separate copy of the hash is written to an append-only audit log. Any subsequent access to the evidence file includes a hash verification step that compares the stored hash against a freshly computed hash of the retrieved file.

**Storage Immutability:** Evidence files are stored in S3 with Object Lock enabled in compliance mode, preventing deletion or modification for a configurable retention period (default: seven years, aligned with FSCA record retention requirements). The Object Lock configuration uses a governance mode that allows authorized platform administrators to extend (but not reduce) the retention period.

**Chain-of-Custody Logging:** Every interaction with evidence (upload, view, download, hash verification) is recorded in the audit log with the acting user's identity, timestamp, IP address, and the evidence file's hash at the time of access.

```sql
CREATE TABLE evidence_integrity_log (
  id              VARCHAR(36) PRIMARY KEY,
  evidence_id     VARCHAR(36) NOT NULL,
  claim_id        VARCHAR(36) NOT NULL,
  action          ENUM('uploaded', 'viewed', 'downloaded', 'verified',
                       'hash_mismatch_detected') NOT NULL,
  actor_id        VARCHAR(36) NOT NULL,
  actor_type      ENUM('assessor', 'insurer_user', 'system') NOT NULL,
  sha256_hash     VARCHAR(64) NOT NULL,
  ip_address      VARCHAR(45),
  user_agent      TEXT,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_evidence_id (evidence_id),
  INDEX idx_claim_id (claim_id),
  INDEX idx_actor (actor_id, actor_type)
);
```

### 6.2 Assessor Report Versioning

Assessor reports support full version history to track how an assessment evolves through the review process. Each version is immutable once submitted, and the system maintains a complete diff history between versions. The versioning system supports three version states: `draft` (editable by the assessor), `submitted` (immutable, under review), and `final` (accepted by the insurer).

```sql
CREATE TABLE assessor_report_versions (
  id                  VARCHAR(36) PRIMARY KEY,
  assignment_id       VARCHAR(36) NOT NULL,
  assessor_id         VARCHAR(36) NOT NULL,
  claim_id            VARCHAR(36) NOT NULL,
  
  version_number      INT NOT NULL,
  version_status      ENUM('draft', 'submitted', 'revision_requested',
                           'final', 'superseded') NOT NULL,
  
  -- Report Content (Immutable once submitted)
  report_content      JSON NOT NULL,
  damage_estimate     DECIMAL(12,2) NOT NULL,
  repair_hours        DECIMAL(8,2),
  parts_cost          DECIMAL(12,2),
  labour_cost         DECIMAL(12,2),
  
  -- AI Comparison
  ai_estimate         DECIMAL(12,2),
  ai_variance_pct     DECIMAL(5,2),
  
  -- Integrity
  content_hash        VARCHAR(64) NOT NULL,
  
  -- Review
  reviewed_by         VARCHAR(36) NULL,
  review_notes        TEXT NULL,
  reviewed_at         TIMESTAMP NULL,
  
  submitted_at        TIMESTAMP NULL,
  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE KEY uk_assignment_version (assignment_id, version_number),
  INDEX idx_assessor_claim (assessor_id, claim_id)
);
```

---

## 7. Assignment Lifecycle Automation

### 7.1 Lifecycle State Machine

Each assignment follows a deterministic lifecycle managed by an automated state machine. The state machine enforces valid transitions, triggers notifications at each stage, and automatically escalates or expires assignments that exceed their configured time limits.

```
┌──────────┐    Accept     ┌───────────┐   Submit    ┌───────────┐
│ ASSIGNED │──────────────▶│ ACCEPTED  │────────────▶│ SUBMITTED │
│          │               │           │             │           │
└────┬─────┘               └─────┬─────┘             └─────┬─────┘
     │                           │                         │
     │ Decline/Expire            │ Expire                  │ Approve
     ▼                           ▼                         ▼
┌──────────┐               ┌───────────┐             ┌───────────┐
│ DECLINED │               │ ESCALATED │             │ COMPLETED │
│          │               │           │             │           │
└──────────┘               └─────┬─────┘             └───────────┘
                                 │                         │
                                 │ Reassign                │ Request Revision
                                 ▼                         ▼
                           ┌───────────┐             ┌───────────┐
                           │REASSIGNED │             │ REVISION  │
                           │           │             │ REQUESTED │
                           └───────────┘             └───────────┘
```

### 7.2 Automated Triggers

| Trigger | Condition | Action | Notification |
|---------|-----------|--------|-------------|
| **Acceptance Reminder** | 4 hours after assignment, no response | Send push + email reminder | Assessor |
| **Acceptance Deadline** | 24 hours after assignment, no response | Auto-decline, trigger reassignment | Assessor + Insurer |
| **Progress Check** | 50% of SLA elapsed, no report draft | Send progress reminder | Assessor |
| **SLA Warning** | 80% of SLA elapsed, no submission | Escalate to insurer claims manager | Assessor + Insurer |
| **SLA Breach** | 100% of SLA elapsed, no submission | Mark as escalated, flag for reassignment | Assessor + Insurer + KINGA ops |
| **Assignment Expiry** | 30 days after assignment (configurable) | Revoke scoped token, archive assignment | Assessor + Insurer |
| **License Expiry** | Assessor license expires during assignment | Suspend all active assignments, notify | Assessor + All affected insurers |

---

## 8. Certification and Rating Framework

### 8.1 Tiered Certification System

The marketplace certification framework establishes four tiers that assessors progress through based on their composite score, completed assignments, and continuous professional development. The tier system is aligned with the SAQA NQF Level 4 Insurance Claims Administrator qualification (SAQA ID: 99668) [1] and provides a clear progression path for marketplace assessors.

| Tier | Name | Requirements | Privileges | Badge |
|------|------|-------------|------------|-------|
| **Tier 1** | Provisional | Completed onboarding + probation | Low-complexity claims only, max 3 concurrent | Bronze |
| **Tier 2** | Certified | Composite score ≥ 70, 25+ completed assignments | Medium-complexity claims, max 7 concurrent | Silver |
| **Tier 3** | Senior | Composite score ≥ 85, 100+ completed, 1+ year active | All claim types, max 12 concurrent, priority ranking | Gold |
| **Tier 4** | Master | Composite score ≥ 95, 250+ completed, peer reviewer | All claims + peer review authority, max 15 concurrent | Platinum |

### 8.2 Insurer Rating System

After each completed assignment, insurers rate the assessor on four dimensions using a 1-5 scale. These ratings feed into the professionalism dimension of the composite score and are visible to other insurers when browsing marketplace assessors (aggregated, not individual ratings).

| Rating Dimension | Description | Weight in Professionalism Score |
|-----------------|-------------|-------------------------------|
| **Accuracy** | How closely did the assessment match the actual repair outcome? | 35% |
| **Communication** | Was the assessor responsive and clear in communications? | 25% |
| **Professionalism** | Did the assessor conduct themselves professionally on-site? | 25% |
| **Timeliness** | Was the assessment completed within the agreed timeframe? | 15% |

The rating system implements anti-gaming protections: ratings are only accepted after claim completion, each insurer can rate an assessor only once per assignment, and statistical outlier detection flags ratings that deviate significantly from the assessor's historical average for manual review.

---

## 9. Audit Logging Architecture

### 9.1 Comprehensive Event Capture

Every assessor interaction with the KINGA platform is captured in a structured audit log that provides a complete, tamper-evident record of assessor activity. The audit log serves three purposes: regulatory compliance (FSCA seven-year retention requirement), security forensics (detecting unauthorized access patterns), and performance analytics (feeding the scoring engine).

The audit log captures events across five categories:

| Category | Events | Retention |
|----------|--------|-----------|
| **Authentication** | Login, logout, token issuance, token revocation, MFA challenge | 7 years |
| **Assignment** | Created, accepted, declined, escalated, completed, expired | 7 years |
| **Evidence** | Uploaded, viewed, downloaded, hash verified, integrity alert | 7 years |
| **Report** | Draft created, submitted, revision requested, finalized | 7 years |
| **Data Access** | Claim viewed, claimant data accessed, evidence accessed | 7 years |

```sql
CREATE TABLE assessor_audit_log (
  id              VARCHAR(36) PRIMARY KEY,
  assessor_id     VARCHAR(36) NOT NULL,
  tenant_id       VARCHAR(36),
  claim_id        VARCHAR(36),
  
  event_category  ENUM('authentication', 'assignment', 'evidence',
                       'report', 'data_access') NOT NULL,
  event_type      VARCHAR(100) NOT NULL,
  event_severity  ENUM('info', 'warning', 'critical') DEFAULT 'info',
  
  -- Context
  ip_address      VARCHAR(45),
  user_agent      TEXT,
  session_id      VARCHAR(36),
  
  -- Event Data
  event_data      JSON,
  
  -- Integrity
  previous_hash   VARCHAR(64),
  event_hash      VARCHAR(64) NOT NULL,
  
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_assessor_time (assessor_id, created_at),
  INDEX idx_tenant_time (tenant_id, created_at),
  INDEX idx_claim_time (claim_id, created_at),
  INDEX idx_category_type (event_category, event_type),
  INDEX idx_severity (event_severity)
);
```

### 9.2 Tamper-Evidence Chain

Each audit log entry includes a hash of the previous entry, creating a hash chain that makes retroactive modification detectable. If any entry in the chain is altered, the hash verification of subsequent entries will fail, alerting the security monitoring system.

```
Entry N:   hash(entry_data + previous_hash_N-1) → event_hash_N
Entry N+1: hash(entry_data + event_hash_N)      → event_hash_N+1
Entry N+2: hash(entry_data + event_hash_N+1)    → event_hash_N+2
```

---

## 10. Security Threat Model

### 10.1 Threat Analysis

The dual assessor model introduces specific security threats that differ from standard multi-tenant access patterns. The following threat analysis identifies the primary attack vectors, their likelihood, potential impact, and the mitigations implemented by the architecture.

| Threat ID | Threat | Actor | Likelihood | Impact | Mitigation |
|-----------|--------|-------|-----------|--------|------------|
| **T-01** | Marketplace assessor accesses claims beyond their assignment scope | Compromised assessor account | Medium | High | Claim-scoped JWT with explicit claim ID list; database query filtering; response sanitization |
| **T-02** | Assessor exfiltrates claimant personal data across insurer boundaries | Malicious marketplace assessor | Medium | Critical | Cross-insurer isolation; single-claim session binding; data access audit logging with anomaly detection |
| **T-03** | Evidence tampering after submission to alter damage assessment | Assessor or external attacker | Low | Critical | SHA-256 content hashing; S3 Object Lock; hash chain audit log; hash verification on every access |
| **T-04** | Assessor creates multiple marketplace profiles to circumvent suspension | Suspended assessor | Medium | Medium | License number uniqueness constraint; automated duplicate detection; biometric verification (future) |
| **T-05** | Insurer-owned assessor gains marketplace access without authorization | Insurer assessor seeking additional income | Low | Medium | Classification enforcement at onboarding; marketplace enablement requires KINGA vetting committee approval |
| **T-06** | Rating manipulation through coordinated fake reviews | Colluding assessor and insurer user | Low | Medium | One rating per assignment; statistical outlier detection; minimum assignment count before ratings affect score |
| **T-07** | Token replay attack using expired or revoked scoped tokens | External attacker with intercepted token | Low | High | Token expiry enforcement; revocation list checking; assignment-level token binding |
| **T-08** | Privilege escalation from assessor role to insurer admin | Compromised assessor account | Low | Critical | Role-based access control with no elevation path; assessor tokens explicitly deny admin scopes |
| **T-09** | Denial of service through mass assignment acceptance without completion | Malicious marketplace assessor | Medium | Medium | Concurrent assignment limits; acceptance deadline enforcement; automatic reassignment on SLA breach |
| **T-10** | Data inference attack through marketplace search patterns | Marketplace assessor | Low | Medium | Search results limited to assessor profiles (no claim data); rate limiting on search API; search activity logging |

### 10.2 Security Controls Summary

The architecture implements security controls organized into four categories: preventive, detective, corrective, and deterrent.

| Control Category | Controls Implemented |
|-----------------|---------------------|
| **Preventive** | Claim-scoped JWTs, database query filtering, response sanitization, cross-insurer session isolation, concurrent assignment limits, license validation, MFA enforcement |
| **Detective** | Audit log hash chain verification, anomaly detection on data access patterns, statistical outlier detection on ratings, automated license expiry monitoring |
| **Corrective** | Automatic token revocation on anomaly detection, automatic assignment reassignment on SLA breach, automatic suspension on integrity violations |
| **Deterrent** | Comprehensive audit logging with seven-year retention, tamper-evident hash chains, performance score penalties for policy violations, marketplace suspension and delisting |

---

## 11. Governance Compliance Alignment

### 11.1 Regulatory Framework Mapping

The dual assessor architecture is designed to comply with the South African regulatory framework governing insurance operations, personal data processing, and financial services conduct. The following table maps each regulatory requirement to the specific architectural component that satisfies it.

| Regulation | Requirement | Architectural Component |
|-----------|-------------|----------------------|
| **POPIA Section 9** | Personal information must be processed lawfully and in a reasonable manner | Claim-scoped access ensures assessors only access data necessary for their assignment; purpose limitation enforced through token scopes |
| **POPIA Section 11** | Processing must be necessary for pursuing the legitimate interests of the responsible party | Assignment-based access model ensures processing is limited to the specific claim assessment purpose |
| **POPIA Section 12** | Collection must be directly from the data subject unless exceptions apply | Evidence collection by assessors is authorized through the insurer's relationship with the claimant; consent chain documented in audit log |
| **POPIA Section 19** | Security safeguards must be implemented to protect personal information | Three-layer access control (API, database, response), encryption in transit and at rest, MFA enforcement |
| **POPIA Section 22** | Notification of security compromises | Automated breach detection through audit log anomaly monitoring; notification workflow triggers within 72 hours |
| **Short-term Insurance Act** | Insurers must maintain adequate records of claims processing | Seven-year audit log retention; immutable evidence storage; complete assignment and report version history |
| **FSCA Conduct Standards** | Fair treatment of customers throughout the claims process | Performance scoring ensures assessor quality; automated SLA enforcement prevents delays; evidence immutability protects claimant interests |
| **FAIS Act** | Financial services providers must be authorized and competent | Marketplace certification framework aligned with SAQA NQF Level 4; license validation; ongoing competency monitoring through composite scoring |
| **GDPR Article 25** (for international operations) | Data protection by design and by default | Privacy-first architecture with minimal data exposure; default-deny access model; data minimization in assessor-visible fields |

### 11.2 Data Processing Agreement Framework

Each assessor (both insurer-owned and marketplace) must execute a Data Processing Agreement (DPA) that establishes the legal basis for their access to personal information within the KINGA platform. The DPA framework defines three agreement types:

**Insurer-Owned DPA:** The insurer acts as the responsible party (data controller), and the assessor processes personal information as an operator (data processor) under the insurer's instructions. KINGA acts as a further operator providing the processing infrastructure.

**Marketplace DPA:** KINGA acts as a joint responsible party with the insurer for the specific claim assignment. The marketplace assessor processes personal information as an operator under joint instructions from KINGA and the insurer. This dual-controller arrangement is necessary because KINGA governs the marketplace assessor's access and conduct.

**Hybrid DPA:** Combines elements of both agreements, with the insurer as primary controller for direct assignments and KINGA as joint controller for marketplace assignments.

---

## 12. Dashboard Blueprints

### 12.1 Insurer-Owned Assessor Dashboard

The insurer-owned assessor dashboard provides a claim-focused workspace that surfaces the assessor's active assignments, pending tasks, and performance metrics within their insurer's context. The dashboard does not expose any insurer-wide analytics, financial data, or claims beyond the assessor's assignments.

**Layout Structure:**

```
┌─────────────────────────────────────────────────────────────────┐
│  KINGA Assessor Portal          [Notifications] [Profile] [Logout]│
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  ACTIVE ASSIGNMENTS (3 of 10 capacity)                      │ │
│  │                                                             │ │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐          │ │
│  │  │ CLM-001234  │ │ CLM-001567  │ │ CLM-001890  │          │ │
│  │  │ Toyota Hilux│ │ BMW 320i    │ │ VW Polo     │          │ │
│  │  │ SLA: 3 days │ │ SLA: 1 day  │ │ SLA: 5 days │          │ │
│  │  │ [View]      │ │ [URGENT]    │ │ [View]      │          │ │
│  │  └─────────────┘ └─────────────┘ └─────────────┘          │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌──────────────────────┐  ┌──────────────────────────────────┐ │
│  │  MY PERFORMANCE       │  │  RECENT ACTIVITY                 │ │
│  │                       │  │                                  │ │
│  │  Composite: 82/100    │  │  09:15 Viewed CLM-001234         │ │
│  │  Accuracy: 85%        │  │  09:30 Uploaded 12 photos        │ │
│  │  Timeliness: 78%      │  │  10:45 Submitted draft report    │ │
│  │  Thoroughness: 88%    │  │  11:20 Revision requested        │ │
│  │  This Month: 8 claims │  │  14:00 Submitted final report    │ │
│  │                       │  │                                  │ │
│  └──────────────────────┘  └──────────────────────────────────┘ │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  ASSIGNMENT HISTORY                          [Filter] [Export]│ │
│  │  ┌──────────┬──────────┬─────────┬──────────┬────────────┐ │ │
│  │  │ Claim    │ Vehicle  │ Status  │ Score    │ Completed  │ │ │
│  │  ├──────────┼──────────┼─────────┼──────────┼────────────┤ │ │
│  │  │ CLM-0987 │ Ford Ran.│ Final   │ 92/100   │ 2026-02-08 │ │ │
│  │  │ CLM-0876 │ Hyundai  │ Final   │ 85/100   │ 2026-02-05 │ │ │
│  │  │ CLM-0765 │ Nissan   │ Final   │ 88/100   │ 2026-02-01 │ │ │
│  │  └──────────┴──────────┴─────────┴──────────┴────────────┘ │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 12.2 Marketplace Assessor Dashboard

The marketplace assessor dashboard extends the insurer-owned dashboard with marketplace-specific features: earnings tracking, multi-insurer assignment management, marketplace profile management, and certification progress. The dashboard maintains strict cross-insurer isolation, displaying assignments from different insurers in separate sections without revealing insurer-specific data across boundaries.

**Layout Structure:**

```
┌─────────────────────────────────────────────────────────────────┐
│  KINGA Marketplace Portal       [Notifications] [Profile] [Logout]│
├───────────┬─────────────────────────────────────────────────────┤
│           │                                                       │
│ SIDEBAR   │  ┌─────────────────────────────────────────────────┐ │
│           │  │  EARNINGS OVERVIEW                               │ │
│ Dashboard │  │                                                 │ │
│ My Claims │  │  This Month: R45,200    │  Pending: R12,800    │ │
│ Earnings  │  │  Last Month: R38,900    │  Next Payout: Feb 15 │ │
│ Profile   │  │  YTD Total:  R84,100    │  Commission: 15%     │ │
│ Ratings   │  │                                                 │ │
│ Certific. │  └─────────────────────────────────────────────────┘ │
│           │                                                       │
│           │  ┌─────────────────────────────────────────────────┐ │
│           │  │  ACTIVE ASSIGNMENTS BY INSURER                   │ │
│           │  │                                                 │ │
│           │  │  ▼ Insurer A (2 active)                         │ │
│           │  │    CLM-001234 | Toyota Hilux | SLA: 3d | [View] │ │
│           │  │    CLM-001567 | BMW 320i     | SLA: 1d | [View] │ │
│           │  │                                                 │ │
│           │  │  ▼ Insurer B (1 active)                         │ │
│           │  │    CLM-002345 | VW Polo      | SLA: 5d | [View] │ │
│           │  │                                                 │ │
│           │  └─────────────────────────────────────────────────┘ │
│           │                                                       │
│           │  ┌──────────────────────┐ ┌────────────────────────┐ │
│           │  │  CERTIFICATION        │ │  MARKETPLACE PROFILE   │ │
│           │  │                       │ │                        │ │
│           │  │  Tier: Silver (Cert.) │ │  Rating: 4.6/5.0      │ │
│           │  │  Score: 82/100        │ │  Reviews: 47          │ │
│           │  │  Next: Gold at 85     │ │  Response Rate: 94%   │ │
│           │  │  Assignments: 67/100  │ │  Specializations: 3   │ │
│           │  │  [View Progress]      │ │  [Edit Profile]       │ │
│           │  └──────────────────────┘ └────────────────────────┘ │
│           │                                                       │
│           │  ┌─────────────────────────────────────────────────┐ │
│           │  │  AVAILABLE OPPORTUNITIES (Matching My Profile)   │ │
│           │  │                                                 │ │
│           │  │  3 new claims matching your specializations      │ │
│           │  │  Region: Gauteng | Type: Motor Vehicle           │ │
│           │  │  [View Opportunities]                            │ │
│           │  └─────────────────────────────────────────────────┘ │
└───────────┴─────────────────────────────────────────────────────┘
```

### 12.3 Insurer Assessor Management Dashboard

Insurers require a dedicated management view to oversee both their insurer-owned assessors and their marketplace assessor engagements. This dashboard provides assignment management, performance comparison, and marketplace discovery capabilities.

**Key Components:**

The management dashboard includes four primary sections. The **Assessor Roster** displays all insurer-owned assessors with their current status, active assignment count, and composite score. The **Marketplace Engagement** section shows active marketplace assessors currently working on the insurer's claims, with performance metrics and cost tracking. The **Assignment Queue** presents unassigned claims with a recommendation engine that suggests the optimal assessor (from either pool) based on the claim's requirements. The **Performance Analytics** section provides comparative analytics showing insurer-owned vs marketplace assessor performance across all scoring dimensions, enabling data-driven sourcing decisions.

---

## 13. Implementation Roadmap

The implementation is structured into four phases spanning sixteen weeks, with each phase delivering independently valuable functionality.

| Phase | Duration | Deliverables | Dependencies |
|-------|----------|-------------|-------------|
| **Phase 1: Foundation** | Weeks 1-4 | Assessor identity model, insurer-owned onboarding, basic assignment workflow, claim-scoped JWT | Existing claims infrastructure |
| **Phase 2: Marketplace** | Weeks 5-8 | Marketplace onboarding pipeline, vetting workflow, search and discovery, recommendation engine | Phase 1 complete |
| **Phase 3: Intelligence** | Weeks 9-12 | Performance scoring engine, certification tiers, rating system, AI comparison analytics | Phase 2 complete |
| **Phase 4: Governance** | Weeks 13-16 | Full audit logging, evidence immutability, compliance reporting, security hardening, dashboards | Phase 3 complete |

---

## References

[1]: https://regqs.saqa.org.za/viewQualification.php?id=99668 "SAQA Qualification: Occupational Certificate - Insurance Claims Administrator (SAQA ID: 99668)"
[2]: https://www.fsca.co.za/Regulated-Entities/ "FSCA Regulated Entities - Financial Sector Conduct Authority"
[3]: https://www.asisa.org.za/media/2f0faslu/20210801-asisa-guidelines-on-popia.pdf "ASISA Guidelines for Responsible Parties on the Protection of Personal Information"
[4]: https://www.oecd.org/content/dam/oecd/en/publications/reports/2017/12/oecd-guidelines-on-insurer-governance-2017-edition_g1g879ca/9789264190085-en.pdf "OECD Guidelines on Insurer Governance, 2017 Edition"
[5]: https://www.atlas-mag.net/en/articles/motor-assessor-training-and-requirements-0 "Atlas Magazine: Motor Assessor Training and Requirements"

---

**Document Control**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-11 | Tavonga Shoko | Initial architecture design |

**Approval**

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Chief Technology Officer | | | |
| Head of Product | | | |
| Chief Information Security Officer | | | |
| Compliance Officer | | | |
