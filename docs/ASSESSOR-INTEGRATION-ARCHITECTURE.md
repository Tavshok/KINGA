# KINGA Assessor Integration Architecture

**Document ID:** KINGA-AIA-2026-013  
**Version:** 1.0  
**Date:** February 11, 2026  
**Author:** Tavonga Shoko  
**Status:** Architecture Design  
**Classification:** Internal - Technical Architecture

---

## Executive Summary

This document specifies the **Assessor Integration Architecture** for the KINGA AutoVerify AI platform. Assessors are independent verification stakeholders who operate across multiple insurers, providing expert damage assessment and cost validation services. Unlike other stakeholders who are bound to a single tenant (insurer), assessors require **assignment-based access** with strict **claim-scoped permissions** that prevent access to insurer-wide analytics while maintaining evidence integrity and performance accountability.

The architecture implements **time-limited access tokens**, **immutable evidence storage**, **assessor report versioning**, **AI vs assessor comparison analytics**, and **comprehensive audit logging** to ensure security, compliance, and quality assurance.

### Key Architectural Principles

1. **Independent Multi-Insurer Operation** — Assessors work across multiple insurers without tenant affiliation
2. **Assignment-Based Access Control** — Access granted only to specifically assigned claims with automatic expiry
3. **Claim-Scoped Permissions** — Zero access to insurer-wide data, analytics, or other claims
4. **Evidence Integrity Protection** — Immutable storage with cryptographic verification
5. **Performance Accountability** — AI vs assessor comparison analytics and scoring
6. **Full Audit Transparency** — Complete logging of all assessor activity

---

## 1. Assessor Identity Model

### 1.1 Identity Architecture

Assessors exist as **cross-tenant entities** in the KINGA identity hierarchy:

```
Organization (KINGA Platform)
├── Tenant (Insurer A)
│   ├── Users (Insurer Staff)
│   └── Claims
│       └── Assessor Assignments → [Assessor X, Assessor Y]
├── Tenant (Insurer B)
│   ├── Users (Insurer Staff)
│   └── Claims
│       └── Assessor Assignments → [Assessor X, Assessor Z]
└── Assessor Pool (Cross-Tenant)
    ├── Assessor X (works for Insurer A, B, C)
    ├── Assessor Y (works for Insurer A, D)
    └── Assessor Z (works for Insurer B, E)
```

**Key Characteristics:**
- Assessors are **not members** of any tenant
- Assessors are registered in a **global assessor pool**
- Access is granted via **claim assignments**, not tenant membership
- Each assignment creates a **time-limited access relationship** between assessor and claim

### 1.2 Database Schema Extensions

```sql
-- Assessor registry table (cross-tenant)
CREATE TABLE assessors (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL UNIQUE, -- Links to users table
  professional_license_number VARCHAR(100) NOT NULL UNIQUE,
  license_expiry_date DATE NOT NULL,
  specializations JSON, -- ["vehicle", "property", "marine"]
  certification_level ENUM('junior', 'senior', 'expert') NOT NULL,
  active_status BOOLEAN DEFAULT TRUE,
  performance_score DECIMAL(5,2), -- 0.00 to 100.00
  total_assessments_completed INT DEFAULT 0,
  average_accuracy_score DECIMAL(5,2), -- Compared to AI baseline
  average_turnaround_hours DECIMAL(8,2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_license (professional_license_number),
  INDEX idx_active (active_status),
  INDEX idx_performance (performance_score DESC),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Assessor-insurer relationships (which insurers an assessor works with)
CREATE TABLE assessor_insurer_relationships (
  id VARCHAR(36) PRIMARY KEY,
  assessor_id VARCHAR(36) NOT NULL,
  tenant_id VARCHAR(36) NOT NULL,
  relationship_status ENUM('active', 'suspended', 'terminated') DEFAULT 'active',
  contracted_rate_per_assessment DECIMAL(10,2),
  contract_start_date DATE NOT NULL,
  contract_end_date DATE,
  performance_rating DECIMAL(3,2), -- Insurer-specific rating 0.00 to 5.00
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_assessor_tenant (assessor_id, tenant_id),
  INDEX idx_tenant (tenant_id),
  INDEX idx_status (relationship_status),
  FOREIGN KEY (assessor_id) REFERENCES assessors(id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- Claim assignments (assignment-based access control)
CREATE TABLE assessor_claim_assignments (
  id VARCHAR(36) PRIMARY KEY,
  claim_id VARCHAR(36) NOT NULL,
  assessor_id VARCHAR(36) NOT NULL,
  tenant_id VARCHAR(36) NOT NULL, -- Claim owner tenant
  assigned_by_user_id VARCHAR(36) NOT NULL, -- Insurer user who assigned
  assignment_status ENUM('pending', 'accepted', 'in_progress', 'completed', 'expired', 'revoked') DEFAULT 'pending',
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  accepted_at TIMESTAMP NULL,
  expires_at TIMESTAMP NOT NULL, -- Auto-expiry for security
  completed_at TIMESTAMP NULL,
  revoked_at TIMESTAMP NULL,
  revoked_by_user_id VARCHAR(36) NULL,
  revocation_reason TEXT NULL,
  access_token_hash VARCHAR(255), -- SHA-256 hash of claim-scoped access token
  token_issued_at TIMESTAMP NULL,
  token_expires_at TIMESTAMP NULL,
  UNIQUE KEY unique_claim_assessor (claim_id, assessor_id),
  INDEX idx_claim (claim_id),
  INDEX idx_assessor (assessor_id),
  INDEX idx_status (assignment_status),
  INDEX idx_expires (expires_at),
  INDEX idx_tenant (tenant_id),
  FOREIGN KEY (claim_id) REFERENCES claims(id) ON DELETE CASCADE,
  FOREIGN KEY (assessor_id) REFERENCES assessors(id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (revoked_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);
```

### 1.3 User Account Structure

Assessors have **dual identity**:

1. **User Account** (`users` table) — Standard authentication credentials
   - `role = 'assessor'`
   - Email, password hash, OAuth tokens
   - Standard user attributes

2. **Assessor Profile** (`assessors` table) — Professional credentials
   - Professional license number
   - Certifications and specializations
   - Performance metrics
   - Cross-insurer relationships

**Authentication Flow:**
1. Assessor logs in via standard OAuth or username/password
2. System identifies user as assessor (role check)
3. System loads assessor profile and active assignments
4. Dashboard displays only assigned claims (no tenant-wide data)

---

## 2. Assignment Workflow Design

### 2.1 Assignment Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│                    ASSESSOR ASSIGNMENT LIFECYCLE                 │
└─────────────────────────────────────────────────────────────────┘

1. ASSIGNMENT CREATION
   ├── Insurer creates claim
   ├── Insurer triggers assessor assignment
   ├── System checks assessor-insurer relationship
   ├── System creates assignment record (status: pending)
   └── System generates claim-scoped access token

2. NOTIFICATION & ACCEPTANCE
   ├── Assessor receives notification (email + in-app)
   ├── Assessor reviews claim summary
   ├── Assessor accepts or rejects assignment
   └── Status: pending → accepted (or expired if no response)

3. ACTIVE ASSESSMENT
   ├── Assessor accesses claim details (read-only evidence)
   ├── Assessor schedules appointment with claimant
   ├── Assessor conducts physical inspection
   ├── Assessor uploads inspection photos (timestamped)
   ├── Assessor creates assessment report (versioned)
   └── Status: accepted → in_progress

4. REPORT SUBMISSION
   ├── Assessor submits final assessment report
   ├── System locks report (immutable)
   ├── System triggers AI comparison analytics
   ├── System calculates performance metrics
   └── Status: in_progress → completed

5. EXPIRY & REVOCATION
   ├── Auto-expiry: Assignment expires after X days (configurable)
   ├── Manual revocation: Insurer revokes assignment
   └── Status: * → expired/revoked (access immediately terminated)
```

### 2.2 Automated Assignment Workflow

**Trigger:** Insurer clicks "Assign Assessor" on claim triage page

**Process:**

```typescript
// Pseudo-code for assignment workflow
async function assignAssessorToClaim(
  claimId: string,
  assessorId: string,
  assignedByUserId: string,
  tenantId: string
) {
  // 1. Validate assessor-insurer relationship
  const relationship = await db.query(
    `SELECT * FROM assessor_insurer_relationships 
     WHERE assessor_id = ? AND tenant_id = ? AND relationship_status = 'active'`,
    [assessorId, tenantId]
  );
  
  if (!relationship) {
    throw new Error('Assessor not authorized for this insurer');
  }

  // 2. Check for existing assignment
  const existingAssignment = await db.query(
    `SELECT * FROM assessor_claim_assignments 
     WHERE claim_id = ? AND assessor_id = ? AND assignment_status IN ('pending', 'accepted', 'in_progress')`,
    [claimId, assessorId]
  );
  
  if (existingAssignment) {
    throw new Error('Assessor already assigned to this claim');
  }

  // 3. Generate claim-scoped access token
  const accessToken = generateClaimScopedToken({
    assessorId,
    claimId,
    tenantId,
    expiresIn: '30d' // 30 days from assignment
  });
  
  const tokenHash = sha256(accessToken);

  // 4. Create assignment record
  const assignmentId = uuidv4();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
  
  await db.insert('assessor_claim_assignments', {
    id: assignmentId,
    claim_id: claimId,
    assessor_id: assessorId,
    tenant_id: tenantId,
    assigned_by_user_id: assignedByUserId,
    assignment_status: 'pending',
    assigned_at: new Date(),
    expires_at: expiresAt,
    access_token_hash: tokenHash,
    token_issued_at: new Date(),
    token_expires_at: expiresAt
  });

  // 5. Send notification to assessor
  await sendNotification({
    recipientId: assessorId,
    type: 'assessor_assignment',
    title: 'New Claim Assignment',
    message: `You have been assigned to assess claim ${claimId}`,
    claimId,
    assignmentId
  });

  // 6. Log audit trail
  await logAuditEvent({
    eventType: 'assessor_assigned',
    userId: assignedByUserId,
    tenantId,
    claimId,
    assessorId,
    metadata: { assignmentId, expiresAt }
  });

  return { assignmentId, accessToken };
}
```

### 2.3 Assignment Expiry Mechanism

**Automatic Expiry:**
- Assignments expire after **30 days** (configurable per insurer)
- Cron job runs every hour to check for expired assignments
- Expired assignments: access immediately revoked, status set to `expired`

**Expiry Cron Job:**

```typescript
// Runs every hour
async function expireAssignments() {
  const now = new Date();
  
  const expiredAssignments = await db.query(
    `SELECT * FROM assessor_claim_assignments 
     WHERE expires_at < ? AND assignment_status IN ('pending', 'accepted', 'in_progress')`,
    [now]
  );

  for (const assignment of expiredAssignments) {
    await db.update('assessor_claim_assignments', assignment.id, {
      assignment_status: 'expired'
    });

    await logAuditEvent({
      eventType: 'assignment_expired',
      assessorId: assignment.assessor_id,
      claimId: assignment.claim_id,
      tenantId: assignment.tenant_id,
      metadata: { assignmentId: assignment.id, expiredAt: now }
    });

    await sendNotification({
      recipientId: assignment.assessor_id,
      type: 'assignment_expired',
      title: 'Assignment Expired',
      message: `Your assignment for claim ${assignment.claim_id} has expired`,
      claimId: assignment.claim_id
    });
  }
}
```

---

## 3. Access Control Enforcement

### 3.1 Claim-Scoped Access Tokens

**Token Structure (JWT):**

```json
{
  "sub": "assessor-user-id",
  "assessor_id": "assessor-profile-id",
  "role": "assessor",
  "scope": "claim:read claim:assess",
  "claim_id": "claim-abc-123",
  "tenant_id": "tenant-xyz-789",
  "assignment_id": "assignment-def-456",
  "iat": 1707667200,
  "exp": 1710259200
}
```

**Key Characteristics:**
- **Single-claim scope** — Token grants access to ONE claim only
- **Time-limited** — Expires with assignment (30 days default)
- **Non-renewable** — Cannot be refreshed; new assignment required
- **Revocable** — Token hash stored in DB for revocation checks

### 3.2 API-Layer Access Control

**Middleware: Assessor Access Validator**

```typescript
// server/_core/assessor-access-middleware.ts

export async function validateAssessorAccess(
  ctx: Context,
  claimId: string
) {
  // 1. Verify user is assessor
  if (ctx.user.role !== 'assessor') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Access restricted to assessors'
    });
  }

  // 2. Load assessor profile
  const assessor = await db.query(
    `SELECT * FROM assessors WHERE user_id = ?`,
    [ctx.user.id]
  );

  if (!assessor || !assessor.active_status) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Assessor account inactive'
    });
  }

  // 3. Verify assignment exists and is active
  const assignment = await db.query(
    `SELECT * FROM assessor_claim_assignments 
     WHERE claim_id = ? AND assessor_id = ? 
     AND assignment_status IN ('accepted', 'in_progress')
     AND expires_at > NOW()`,
    [claimId, assessor.id]
  );

  if (!assignment) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'No active assignment for this claim'
    });
  }

  // 4. Return validated context
  return {
    assessor,
    assignment,
    tenantId: assignment.tenant_id
  };
}
```

**Example tRPC Procedure:**

```typescript
// server/routers/assessor.ts

export const assessorRouter = router({
  getClaimDetails: protectedProcedure
    .input(z.object({ claimId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Validate assessor access
      const { assignment, tenantId } = await validateAssessorAccess(
        ctx,
        input.claimId
      );

      // Fetch claim data (tenant-scoped)
      const claim = await db.query(
        `SELECT * FROM claims WHERE id = ? AND tenant_id = ?`,
        [input.claimId, tenantId]
      );

      // Fetch evidence (read-only)
      const evidence = await db.query(
        `SELECT * FROM claim_documents WHERE claim_id = ?`,
        [input.claimId]
      );

      // Log access
      await logAuditEvent({
        eventType: 'assessor_claim_access',
        userId: ctx.user.id,
        assessorId: assignment.assessor_id,
        claimId: input.claimId,
        tenantId
      });

      return { claim, evidence };
    }),

  submitAssessment: protectedProcedure
    .input(z.object({
      claimId: z.string(),
      assessmentData: z.object({
        damage_description: z.string(),
        estimated_repair_cost: z.number(),
        recommended_action: z.enum(['approve', 'reject', 'investigate']),
        inspection_photos: z.array(z.string()), // S3 URLs
        notes: z.string()
      })
    }))
    .mutation(async ({ ctx, input }) => {
      // Validate assessor access
      const { assessor, assignment, tenantId } = await validateAssessorAccess(
        ctx,
        input.claimId
      );

      // Create assessment record
      const assessmentId = uuidv4();
      await db.insert('assessor_evaluations', {
        id: assessmentId,
        claim_id: input.claimId,
        assessor_id: assessor.id,
        tenant_id: tenantId,
        ...input.assessmentData,
        submitted_at: new Date(),
        version: 1 // Initial version
      });

      // Update assignment status
      await db.update('assessor_claim_assignments', assignment.id, {
        assignment_status: 'completed',
        completed_at: new Date()
      });

      // Trigger AI comparison analytics
      await triggerAIComparison(input.claimId, assessmentId);

      // Log audit trail
      await logAuditEvent({
        eventType: 'assessor_assessment_submitted',
        userId: ctx.user.id,
        assessorId: assessor.id,
        claimId: input.claimId,
        tenantId,
        metadata: { assessmentId }
      });

      return { assessmentId };
    })
});
```

### 3.3 Database-Layer Access Control

**Row-Level Security (RLS) Policies:**

```sql
-- Assessors can only read claims they are assigned to
CREATE POLICY assessor_claim_read ON claims
  FOR SELECT
  USING (
    id IN (
      SELECT claim_id FROM assessor_claim_assignments
      WHERE assessor_id = current_assessor_id()
      AND assignment_status IN ('accepted', 'in_progress')
      AND expires_at > NOW()
    )
  );

-- Assessors can only read evidence for assigned claims
CREATE POLICY assessor_evidence_read ON claim_documents
  FOR SELECT
  USING (
    claim_id IN (
      SELECT claim_id FROM assessor_claim_assignments
      WHERE assessor_id = current_assessor_id()
      AND assignment_status IN ('accepted', 'in_progress')
      AND expires_at > NOW()
    )
  );

-- Assessors can only insert assessment reports for assigned claims
CREATE POLICY assessor_assessment_insert ON assessor_evaluations
  FOR INSERT
  WITH CHECK (
    claim_id IN (
      SELECT claim_id FROM assessor_claim_assignments
      WHERE assessor_id = current_assessor_id()
      AND assignment_status IN ('accepted', 'in_progress')
      AND expires_at > NOW()
    )
  );
```

**Note:** `current_assessor_id()` is a custom PostgreSQL function that extracts the assessor ID from the session context.

---

## 4. Evidence Integrity Protection

### 4.1 Immutable Evidence Storage

**Principle:** All accident evidence (photos, documents, claimant statements) must be **immutable** and **tamper-proof** to ensure forensic integrity.

**Implementation Strategy:**

1. **Write-Once Storage** — Evidence files stored in S3 with **Object Lock** enabled
2. **Cryptographic Verification** — SHA-256 hash computed for each file on upload
3. **Blockchain Anchoring** (Future) — Evidence hashes anchored to blockchain for timestamping
4. **Access Logging** — Every evidence access logged with timestamp and accessor identity

### 4.2 Evidence Upload Workflow

```typescript
// Evidence upload with cryptographic verification
async function uploadEvidence(
  claimId: string,
  file: Buffer,
  metadata: {
    uploadedBy: string,
    fileType: string,
    description: string
  }
) {
  // 1. Compute SHA-256 hash
  const fileHash = crypto.createHash('sha256').update(file).digest('hex');

  // 2. Generate unique file key
  const fileKey = `evidence/${claimId}/${uuidv4()}-${metadata.fileType}`;

  // 3. Upload to S3 with Object Lock (immutable)
  const { url } = await storagePut(fileKey, file, metadata.fileType, {
    ObjectLockMode: 'COMPLIANCE', // Cannot be deleted or modified
    ObjectLockRetainUntilDate: new Date(Date.now() + 7 * 365 * 24 * 60 * 60 * 1000) // 7 years
  });

  // 4. Store metadata in database
  const documentId = uuidv4();
  await db.insert('claim_documents', {
    id: documentId,
    claim_id: claimId,
    file_url: url,
    file_key: fileKey,
    file_hash: fileHash,
    file_type: metadata.fileType,
    uploaded_by: metadata.uploadedBy,
    description: metadata.description,
    uploaded_at: new Date(),
    is_immutable: true
  });

  // 5. Log audit trail
  await logAuditEvent({
    eventType: 'evidence_uploaded',
    userId: metadata.uploadedBy,
    claimId,
    metadata: { documentId, fileHash, fileKey }
  });

  return { documentId, url, fileHash };
}
```

### 4.3 Evidence Verification

**Verification Process:**

```typescript
// Verify evidence integrity
async function verifyEvidenceIntegrity(documentId: string) {
  // 1. Fetch document metadata
  const document = await db.query(
    `SELECT * FROM claim_documents WHERE id = ?`,
    [documentId]
  );

  // 2. Download file from S3
  const fileBuffer = await storageGet(document.file_key);

  // 3. Compute current hash
  const currentHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

  // 4. Compare with stored hash
  const isValid = currentHash === document.file_hash;

  // 5. Log verification attempt
  await logAuditEvent({
    eventType: 'evidence_verification',
    documentId,
    claimId: document.claim_id,
    metadata: {
      storedHash: document.file_hash,
      currentHash,
      isValid
    }
  });

  return { isValid, storedHash: document.file_hash, currentHash };
}
```

### 4.4 Evidence Access Control

**Access Rules:**

| Stakeholder | Read Evidence | Upload Evidence | Modify Evidence | Delete Evidence |
|-------------|---------------|-----------------|-----------------|-----------------|
| Claimant | Own claims only | Own claims only | ❌ Never | ❌ Never |
| Insurer | Tenant claims | Tenant claims | ❌ Never | ❌ Never |
| Assessor | Assigned claims only | Assigned claims only | ❌ Never | ❌ Never |
| Panel Beater | Assigned claims only | Assigned claims only | ❌ Never | ❌ Never |
| Admin | All claims | All claims | ❌ Never | ❌ Never |

**Key Principle:** Evidence is **append-only**. No stakeholder can modify or delete evidence once uploaded.

---

## 5. Assessor Report Versioning

### 5.1 Versioning Strategy

**Principle:** Assessor reports must be **versioned** to track changes, enable rollback, and maintain audit trail.

**Database Schema:**

```sql
CREATE TABLE assessor_evaluation_versions (
  id VARCHAR(36) PRIMARY KEY,
  evaluation_id VARCHAR(36) NOT NULL, -- Parent assessment
  version_number INT NOT NULL,
  claim_id VARCHAR(36) NOT NULL,
  assessor_id VARCHAR(36) NOT NULL,
  tenant_id VARCHAR(36) NOT NULL,
  
  -- Assessment data (versioned)
  damage_description TEXT,
  estimated_repair_cost DECIMAL(10,2),
  recommended_action ENUM('approve', 'reject', 'investigate'),
  inspection_photos JSON, -- Array of S3 URLs
  notes TEXT,
  
  -- Version metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by_user_id VARCHAR(36) NOT NULL,
  change_reason TEXT,
  is_current_version BOOLEAN DEFAULT FALSE,
  
  UNIQUE KEY unique_evaluation_version (evaluation_id, version_number),
  INDEX idx_evaluation (evaluation_id),
  INDEX idx_current (is_current_version),
  FOREIGN KEY (evaluation_id) REFERENCES assessor_evaluations(id) ON DELETE CASCADE,
  FOREIGN KEY (assessor_id) REFERENCES assessors(id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
```

### 5.2 Version Creation Workflow

```typescript
// Create new version of assessment
async function updateAssessment(
  evaluationId: string,
  assessorId: string,
  updates: Partial<AssessmentData>,
  changeReason: string
) {
  // 1. Fetch current version
  const currentVersion = await db.query(
    `SELECT * FROM assessor_evaluation_versions 
     WHERE evaluation_id = ? AND is_current_version = TRUE`,
    [evaluationId]
  );

  // 2. Mark current version as non-current
  await db.update('assessor_evaluation_versions', currentVersion.id, {
    is_current_version: false
  });

  // 3. Create new version
  const newVersionNumber = currentVersion.version_number + 1;
  const newVersionId = uuidv4();
  
  await db.insert('assessor_evaluation_versions', {
    id: newVersionId,
    evaluation_id: evaluationId,
    version_number: newVersionNumber,
    claim_id: currentVersion.claim_id,
    assessor_id: assessorId,
    tenant_id: currentVersion.tenant_id,
    ...currentVersion, // Copy all fields
    ...updates, // Apply updates
    created_at: new Date(),
    created_by_user_id: assessorId,
    change_reason: changeReason,
    is_current_version: true
  });

  // 4. Log audit trail
  await logAuditEvent({
    eventType: 'assessment_version_created',
    userId: assessorId,
    evaluationId,
    metadata: {
      versionNumber: newVersionNumber,
      changeReason,
      changes: updates
    }
  });

  return { versionId: newVersionId, versionNumber: newVersionNumber };
}
```

### 5.3 Version History View

**UI Component:** Assessment version history timeline

```typescript
// Fetch version history
async function getAssessmentVersionHistory(evaluationId: string) {
  const versions = await db.query(
    `SELECT 
      v.*,
      u.name as created_by_name
     FROM assessor_evaluation_versions v
     JOIN users u ON v.created_by_user_id = u.id
     WHERE v.evaluation_id = ?
     ORDER BY v.version_number DESC`,
    [evaluationId]
  );

  return versions.map(v => ({
    versionNumber: v.version_number,
    createdAt: v.created_at,
    createdBy: v.created_by_name,
    changeReason: v.change_reason,
    isCurrent: v.is_current_version,
    data: {
      damageDescription: v.damage_description,
      estimatedCost: v.estimated_repair_cost,
      recommendedAction: v.recommended_action
    }
  }));
}
```

---

## 6. AI vs Assessor Comparison Analytics

### 6.1 Comparison Framework

**Objective:** Measure assessor accuracy, identify discrepancies, and improve AI model training.

**Comparison Dimensions:**

| Dimension | AI Output | Assessor Output | Comparison Metric |
|-----------|-----------|-----------------|-------------------|
| Damage Severity | Severity score (0-100) | Severity assessment | Absolute difference |
| Repair Cost | Estimated cost | Assessed cost | Percentage difference |
| Fraud Risk | Fraud probability (0-1) | Fraud indicators | Binary match/mismatch |
| Recommended Action | approve/reject/investigate | approve/reject/investigate | Exact match |
| Turnaround Time | Instant | Hours/days | Time delta |

### 6.2 Comparison Analytics Database Schema

```sql
CREATE TABLE ai_assessor_comparisons (
  id VARCHAR(36) PRIMARY KEY,
  claim_id VARCHAR(36) NOT NULL,
  ai_assessment_id VARCHAR(36) NOT NULL,
  assessor_evaluation_id VARCHAR(36) NOT NULL,
  tenant_id VARCHAR(36) NOT NULL,
  
  -- Cost comparison
  ai_estimated_cost DECIMAL(10,2),
  assessor_estimated_cost DECIMAL(10,2),
  cost_difference_amount DECIMAL(10,2), -- assessor - ai
  cost_difference_percentage DECIMAL(5,2), -- (assessor - ai) / ai * 100
  
  -- Severity comparison
  ai_severity_score INT, -- 0-100
  assessor_severity_score INT, -- 0-100
  severity_difference INT, -- assessor - ai
  
  -- Fraud detection comparison
  ai_fraud_probability DECIMAL(5,4), -- 0.0000 to 1.0000
  assessor_fraud_indicators JSON, -- Array of detected indicators
  fraud_assessment_match BOOLEAN, -- Do both agree on fraud risk?
  
  -- Recommendation comparison
  ai_recommendation ENUM('approve', 'reject', 'investigate'),
  assessor_recommendation ENUM('approve', 'reject', 'investigate'),
  recommendation_match BOOLEAN,
  
  -- Turnaround time
  ai_processing_seconds INT,
  assessor_turnaround_hours DECIMAL(8,2),
  
  -- Overall accuracy score
  overall_accuracy_score DECIMAL(5,2), -- 0.00 to 100.00
  
  -- Metadata
  compared_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_claim (claim_id),
  INDEX idx_accuracy (overall_accuracy_score DESC),
  INDEX idx_tenant (tenant_id),
  FOREIGN KEY (claim_id) REFERENCES claims(id) ON DELETE CASCADE,
  FOREIGN KEY (ai_assessment_id) REFERENCES ai_assessments(id) ON DELETE CASCADE,
  FOREIGN KEY (assessor_evaluation_id) REFERENCES assessor_evaluations(id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
```

### 6.3 Comparison Calculation Algorithm

```typescript
// Calculate AI vs Assessor comparison metrics
async function calculateComparison(
  claimId: string,
  aiAssessmentId: string,
  assessorEvaluationId: string
) {
  // 1. Fetch AI assessment
  const aiAssessment = await db.query(
    `SELECT * FROM ai_assessments WHERE id = ?`,
    [aiAssessmentId]
  );

  // 2. Fetch assessor evaluation
  const assessorEval = await db.query(
    `SELECT * FROM assessor_evaluations WHERE id = ?`,
    [assessorEvaluationId]
  );

  // 3. Calculate cost difference
  const costDifferenceAmount = assessorEval.estimated_repair_cost - aiAssessment.estimated_cost;
  const costDifferencePercentage = (costDifferenceAmount / aiAssessment.estimated_cost) * 100;

  // 4. Calculate severity difference
  const severityDifference = assessorEval.severity_score - aiAssessment.severity_score;

  // 5. Compare fraud assessments
  const fraudAssessmentMatch = (
    (aiAssessment.fraud_probability > 0.5 && assessorEval.fraud_indicators.length > 0) ||
    (aiAssessment.fraud_probability <= 0.5 && assessorEval.fraud_indicators.length === 0)
  );

  // 6. Compare recommendations
  const recommendationMatch = aiAssessment.recommendation === assessorEval.recommended_action;

  // 7. Calculate overall accuracy score (weighted)
  const weights = {
    cost: 0.4,
    severity: 0.2,
    fraud: 0.2,
    recommendation: 0.2
  };

  const costAccuracy = 100 - Math.min(Math.abs(costDifferencePercentage), 100);
  const severityAccuracy = 100 - Math.abs(severityDifference);
  const fraudAccuracy = fraudAssessmentMatch ? 100 : 0;
  const recommendationAccuracy = recommendationMatch ? 100 : 0;

  const overallAccuracyScore = (
    costAccuracy * weights.cost +
    severityAccuracy * weights.severity +
    fraudAccuracy * weights.fraud +
    recommendationAccuracy * weights.recommendation
  );

  // 8. Store comparison
  const comparisonId = uuidv4();
  await db.insert('ai_assessor_comparisons', {
    id: comparisonId,
    claim_id: claimId,
    ai_assessment_id: aiAssessmentId,
    assessor_evaluation_id: assessorEvaluationId,
    tenant_id: aiAssessment.tenant_id,
    ai_estimated_cost: aiAssessment.estimated_cost,
    assessor_estimated_cost: assessorEval.estimated_repair_cost,
    cost_difference_amount: costDifferenceAmount,
    cost_difference_percentage: costDifferencePercentage,
    ai_severity_score: aiAssessment.severity_score,
    assessor_severity_score: assessorEval.severity_score,
    severity_difference: severityDifference,
    ai_fraud_probability: aiAssessment.fraud_probability,
    assessor_fraud_indicators: assessorEval.fraud_indicators,
    fraud_assessment_match: fraudAssessmentMatch,
    ai_recommendation: aiAssessment.recommendation,
    assessor_recommendation: assessorEval.recommended_action,
    recommendation_match: recommendationMatch,
    overall_accuracy_score: overallAccuracyScore,
    compared_at: new Date()
  });

  return { comparisonId, overallAccuracyScore };
}
```

### 6.4 Assessor Performance Scoring

**Performance Metrics:**

```typescript
// Calculate assessor performance score
async function calculateAssessorPerformanceScore(assessorId: string) {
  // 1. Fetch all comparisons for assessor
  const comparisons = await db.query(
    `SELECT * FROM ai_assessor_comparisons 
     WHERE assessor_evaluation_id IN (
       SELECT id FROM assessor_evaluations WHERE assessor_id = ?
     )`,
    [assessorId]
  );

  // 2. Calculate average accuracy
  const avgAccuracy = comparisons.reduce((sum, c) => sum + c.overall_accuracy_score, 0) / comparisons.length;

  // 3. Calculate average turnaround time
  const avgTurnaround = comparisons.reduce((sum, c) => sum + c.assessor_turnaround_hours, 0) / comparisons.length;

  // 4. Calculate recommendation match rate
  const recommendationMatchRate = (
    comparisons.filter(c => c.recommendation_match).length / comparisons.length
  ) * 100;

  // 5. Calculate fraud detection accuracy
  const fraudAccuracy = (
    comparisons.filter(c => c.fraud_assessment_match).length / comparisons.length
  ) * 100;

  // 6. Calculate overall performance score (weighted)
  const performanceScore = (
    avgAccuracy * 0.5 +
    recommendationMatchRate * 0.3 +
    fraudAccuracy * 0.2
  );

  // 7. Update assessor profile
  await db.update('assessors', assessorId, {
    performance_score: performanceScore,
    average_accuracy_score: avgAccuracy,
    average_turnaround_hours: avgTurnaround,
    total_assessments_completed: comparisons.length
  });

  return {
    performanceScore,
    avgAccuracy,
    avgTurnaround,
    recommendationMatchRate,
    fraudAccuracy,
    totalAssessments: comparisons.length
  };
}
```

---

## 7. Assessor Dashboard Blueprint

### 7.1 Dashboard Overview

**Purpose:** Provide assessors with a focused, claim-centric dashboard showing only assigned claims and performance metrics.

**Key Principles:**
- **Zero tenant-wide data** — No insurer analytics or other claims
- **Assignment-centric** — All data filtered by active assignments
- **Performance transparency** — Show personal performance metrics
- **Action-oriented** — Clear CTAs for pending assignments

### 7.2 Dashboard Sections

#### 7.2.1 Active Assignments Panel

**Data Displayed:**

| Field | Description | Source |
|-------|-------------|--------|
| Claim ID | Unique claim identifier | `claims.id` |
| Insurer Name | Name of insurer (tenant) | `tenants.name` |
| Claimant Name | Claimant identity | `claims.claimant_name` |
| Vehicle Details | Make, model, year | `claims.vehicle_*` |
| Incident Date | Date of accident | `claims.incident_date` |
| Assigned Date | When assignment was created | `assessor_claim_assignments.assigned_at` |
| Expires In | Days until assignment expires | `assessor_claim_assignments.expires_at` |
| Status | Assignment status | `assessor_claim_assignments.assignment_status` |
| Actions | View, Accept, Assess | Buttons |

**Filtering:**
- Active assignments only (`status IN ('pending', 'accepted', 'in_progress')`)
- Not expired (`expires_at > NOW()`)
- Sorted by urgency (expiring soonest first)

#### 7.2.2 Performance Metrics Panel

**KPIs Displayed:**

```typescript
interface AssessorPerformanceKPIs {
  overallPerformanceScore: number; // 0-100
  totalAssessmentsCompleted: number;
  averageAccuracyScore: number; // 0-100 (vs AI baseline)
  averageTurnaroundHours: number;
  recommendationMatchRate: number; // Percentage
  fraudDetectionAccuracy: number; // Percentage
  currentMonthAssessments: number;
  pendingAssignments: number;
}
```

**Visualization:**
- Performance score: Circular progress bar (0-100)
- Accuracy trend: Line chart (last 12 months)
- Turnaround time: Bar chart (last 10 assessments)
- Recommendation match rate: Gauge chart

#### 7.2.3 Recent Activity Feed

**Activity Types:**
- New assignment received
- Assignment accepted
- Assessment submitted
- Assignment expired
- Performance score updated

**Data Structure:**

```typescript
interface ActivityFeedItem {
  id: string;
  type: 'assignment_received' | 'assessment_submitted' | 'assignment_expired' | 'performance_updated';
  timestamp: Date;
  claimId?: string;
  insurerName?: string;
  message: string;
}
```

### 7.3 Claim Details View

**Sections:**

1. **Claim Summary**
   - Claimant details (name, contact, policy number)
   - Vehicle details (make, model, year, VIN)
   - Incident details (date, location, description)

2. **Evidence Gallery** (Read-Only)
   - Damage photos uploaded by claimant
   - Police report (if available)
   - Witness statements
   - **Immutable indicator** — Badge showing "Evidence Locked"

3. **AI Assessment Results** (Reference)
   - AI estimated cost
   - AI severity score
   - AI fraud probability
   - AI recommended action
   - **Note:** "For reference only. Your independent assessment is required."

4. **Assessment Form**
   - Damage description (rich text editor)
   - Estimated repair cost (currency input)
   - Severity score (0-100 slider)
   - Fraud indicators (multi-select checkbox)
   - Recommended action (radio buttons: approve/reject/investigate)
   - Inspection photos upload (assessor's own photos)
   - Notes (text area)

5. **Submission Actions**
   - Save Draft (versioned)
   - Submit Assessment (locks report)
   - Request Extension (extends assignment expiry)

### 7.4 Dashboard Data Filtering

**tRPC Procedure Example:**

```typescript
// server/routers/assessor-dashboard.ts

export const assessorDashboardRouter = router({
  getActiveAssignments: protectedProcedure
    .query(async ({ ctx }) => {
      // 1. Verify user is assessor
      if (ctx.user.role !== 'assessor') {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }

      // 2. Fetch assessor profile
      const assessor = await db.query(
        `SELECT * FROM assessors WHERE user_id = ?`,
        [ctx.user.id]
      );

      // 3. Fetch active assignments (claim-scoped only)
      const assignments = await db.query(
        `SELECT 
          a.*,
          c.claimant_name,
          c.vehicle_make,
          c.vehicle_model,
          c.incident_date,
          t.name as insurer_name
         FROM assessor_claim_assignments a
         JOIN claims c ON a.claim_id = c.id
         JOIN tenants t ON a.tenant_id = t.id
         WHERE a.assessor_id = ?
         AND a.assignment_status IN ('pending', 'accepted', 'in_progress')
         AND a.expires_at > NOW()
         ORDER BY a.expires_at ASC`,
        [assessor.id]
      );

      return assignments;
    }),

  getPerformanceMetrics: protectedProcedure
    .query(async ({ ctx }) => {
      // Fetch assessor performance metrics
      const assessor = await db.query(
        `SELECT * FROM assessors WHERE user_id = ?`,
        [ctx.user.id]
      );

      return {
        overallPerformanceScore: assessor.performance_score,
        totalAssessmentsCompleted: assessor.total_assessments_completed,
        averageAccuracyScore: assessor.average_accuracy_score,
        averageTurnaroundHours: assessor.average_turnaround_hours
      };
    })
});
```

**Key Enforcement:**
- All queries filtered by `assessor_id`
- No access to other assessors' data
- No access to tenant-wide analytics
- No access to claims without active assignments

---

## 8. Audit Logging

### 8.1 Assessor Activity Logging

**Logged Events:**

| Event Type | Description | Metadata |
|------------|-------------|----------|
| `assessor_login` | Assessor logs into platform | IP address, device |
| `assessor_assignment_viewed` | Assessor views assignment notification | Assignment ID |
| `assessor_assignment_accepted` | Assessor accepts assignment | Assignment ID, claim ID |
| `assessor_assignment_rejected` | Assessor rejects assignment | Assignment ID, reason |
| `assessor_claim_accessed` | Assessor views claim details | Claim ID, tenant ID |
| `assessor_evidence_viewed` | Assessor views evidence file | Document ID, file key |
| `assessor_evidence_uploaded` | Assessor uploads inspection photo | Document ID, file hash |
| `assessor_assessment_draft_saved` | Assessor saves draft assessment | Evaluation ID, version |
| `assessor_assessment_submitted` | Assessor submits final assessment | Evaluation ID, version |
| `assessor_assignment_expired` | Assignment auto-expired | Assignment ID, expiry date |
| `assessor_assignment_revoked` | Insurer revokes assignment | Assignment ID, revoked by |

### 8.2 Audit Log Schema

```sql
CREATE TABLE assessor_audit_log (
  id VARCHAR(36) PRIMARY KEY,
  event_type VARCHAR(100) NOT NULL,
  assessor_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  claim_id VARCHAR(36),
  tenant_id VARCHAR(36),
  assignment_id VARCHAR(36),
  
  -- Event metadata (JSON)
  metadata JSON,
  
  -- Request context
  ip_address VARCHAR(45),
  user_agent TEXT,
  request_path VARCHAR(500),
  
  -- Timestamp
  event_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Retention
  retention_expires_at TIMESTAMP, -- 7 years from event
  
  INDEX idx_assessor (assessor_id),
  INDEX idx_claim (claim_id),
  INDEX idx_event_type (event_type),
  INDEX idx_timestamp (event_timestamp DESC),
  INDEX idx_tenant (tenant_id),
  FOREIGN KEY (assessor_id) REFERENCES assessors(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

### 8.3 Audit Logging Middleware

```typescript
// server/_core/assessor-audit-middleware.ts

export async function logAssessorActivity(
  eventType: string,
  assessorId: string,
  userId: string,
  metadata: Record<string, any>,
  ctx: Context
) {
  const auditLogId = uuidv4();
  const retentionExpiresAt = new Date(Date.now() + 7 * 365 * 24 * 60 * 60 * 1000); // 7 years

  await db.insert('assessor_audit_log', {
    id: auditLogId,
    event_type: eventType,
    assessor_id: assessorId,
    user_id: userId,
    claim_id: metadata.claimId || null,
    tenant_id: metadata.tenantId || null,
    assignment_id: metadata.assignmentId || null,
    metadata: JSON.stringify(metadata),
    ip_address: ctx.req.ip,
    user_agent: ctx.req.headers['user-agent'],
    request_path: ctx.req.path,
    event_timestamp: new Date(),
    retention_expires_at: retentionExpiresAt
  });

  // Also log to centralized audit system (Loki/S3)
  await logToCentralizedAudit({
    logType: 'assessor_activity',
    eventType,
    assessorId,
    userId,
    metadata,
    timestamp: new Date()
  });
}
```

### 8.4 Audit Log Retention

**Retention Policy:**
- **Minimum retention:** 7 years (POPIA compliance)
- **Storage:** Database (hot) + S3 (cold archive)
- **Archival:** After 1 year, move to S3 cold storage
- **Deletion:** After 7 years, permanently delete (with audit trail of deletion)

---

## 9. Security Threat Model

### 9.1 Threat Scenarios

#### Threat 1: Unauthorized Claim Access

**Scenario:** Assessor attempts to access claims they are not assigned to.

**Attack Vectors:**
- Direct API calls with manipulated claim IDs
- SQL injection to bypass access control
- Token replay attacks

**Mitigations:**
- ✅ API-layer access validation (middleware checks assignment)
- ✅ Database RLS policies (row-level security)
- ✅ Claim-scoped JWT tokens (single-claim access only)
- ✅ Audit logging of all access attempts (failed attempts flagged)

**Detection:**
- Monitor for repeated failed access attempts
- Alert on access attempts to non-assigned claims
- Flag assessors with high failure rates

#### Threat 2: Evidence Tampering

**Scenario:** Assessor modifies or deletes accident evidence to hide fraud.

**Attack Vectors:**
- Direct S3 API calls to modify files
- Database manipulation to change file hashes
- Replay attacks with old evidence

**Mitigations:**
- ✅ Immutable S3 storage (Object Lock enabled)
- ✅ Cryptographic verification (SHA-256 hashes)
- ✅ Write-once policy (no delete/modify permissions)
- ✅ Audit logging of all evidence access

**Detection:**
- Hash mismatch alerts (evidence verification)
- S3 access logs monitoring
- Blockchain anchoring (future) for tamper-proof timestamps

#### Threat 3: Assignment Expiry Bypass

**Scenario:** Assessor continues accessing claim after assignment expires.

**Attack Vectors:**
- Token reuse after expiry
- System clock manipulation
- Database timestamp tampering

**Mitigations:**
- ✅ Server-side expiry validation (not client-side)
- ✅ Token expiry checks on every request
- ✅ Automatic expiry cron job (hourly)
- ✅ Revocation checks (token hash validation)

**Detection:**
- Monitor for expired token usage attempts
- Alert on assignment status mismatches
- Flag assessors with expired access attempts

#### Threat 4: Collusion with Claimants/Panel Beaters

**Scenario:** Assessor colludes with claimants or panel beaters to inflate costs.

**Attack Vectors:**
- Consistently inflated cost estimates
- Approval of fraudulent claims
- Bias toward specific panel beaters

**Mitigations:**
- ✅ AI vs assessor comparison analytics (detect outliers)
- ✅ Performance scoring (flag low accuracy)
- ✅ Relationship detection (assessor-panel beater patterns)
- ✅ Audit logging (full activity trail)

**Detection:**
- Statistical outlier detection (cost inflation patterns)
- Relationship graph analysis (collusion networks)
- Performance score degradation alerts

#### Threat 5: Data Exfiltration

**Scenario:** Assessor exfiltrates sensitive claim data for competitors.

**Attack Vectors:**
- Bulk API requests to download claims
- Screenshot/screen recording of dashboard
- Copying evidence files to external storage

**Mitigations:**
- ✅ Rate limiting (prevent bulk downloads)
- ✅ Watermarking (evidence files tagged with assessor ID)
- ✅ Audit logging (track all data access)
- ✅ DLP policies (future: detect abnormal download patterns)

**Detection:**
- Monitor for high-volume API requests
- Alert on unusual access patterns
- Flag assessors with excessive evidence downloads

### 9.2 Risk Matrix

| Threat | Likelihood | Impact | Risk Level | Mitigation Priority |
|--------|------------|--------|------------|---------------------|
| Unauthorized claim access | Medium | High | **High** | P1 |
| Evidence tampering | Low | Critical | **High** | P1 |
| Assignment expiry bypass | Low | Medium | Medium | P2 |
| Collusion | Medium | High | **High** | P1 |
| Data exfiltration | Low | High | Medium | P2 |

---

## 10. Governance & Compliance

### 10.1 POPIA Compliance

**Relevant POPIA Requirements:**

| Requirement | Implementation |
|-------------|----------------|
| **Lawful Processing** | Assessors access data only for legitimate assessment purposes (assignment-based) |
| **Purpose Specification** | Claim data accessed solely for damage assessment and cost estimation |
| **Data Minimization** | Assessors see only assigned claims, no tenant-wide data |
| **Consent** | Claimants consent to assessor access during claim submission |
| **Security Safeguards** | Encryption, access control, audit logging, evidence immutability |
| **Accountability** | Full audit trail of assessor activity with 7-year retention |
| **Data Subject Rights** | Claimants can request access logs showing assessor activity |

### 10.2 GDPR Alignment

**GDPR Principles:**

| Principle | Implementation |
|-----------|----------------|
| **Lawfulness, Fairness, Transparency** | Assessors informed of access restrictions and audit logging |
| **Purpose Limitation** | Claim data used only for assessment, not marketing or other purposes |
| **Data Minimization** | Claim-scoped access only, no unnecessary data exposure |
| **Accuracy** | Assessor reports versioned to track corrections and updates |
| **Storage Limitation** | Audit logs retained for 7 years, then deleted |
| **Integrity & Confidentiality** | Encryption, access control, evidence immutability |
| **Accountability** | Full audit trail demonstrating compliance |

### 10.3 Audit & Compliance Reporting

**Compliance Reports:**

1. **Assessor Access Report** — Shows all claims accessed by each assessor
2. **Assignment Expiry Report** — Lists expired assignments and revocations
3. **Evidence Integrity Report** — Verification status of all evidence files
4. **Performance Comparison Report** — AI vs assessor accuracy metrics
5. **Audit Log Export** — Full audit trail for regulatory review

**Report Generation:**

```typescript
// Generate assessor access report for compliance
async function generateAssessorAccessReport(
  assessorId: string,
  startDate: Date,
  endDate: Date
) {
  const accessLogs = await db.query(
    `SELECT 
      l.*,
      c.claimant_name,
      t.name as insurer_name
     FROM assessor_audit_log l
     LEFT JOIN claims c ON l.claim_id = c.id
     LEFT JOIN tenants t ON l.tenant_id = t.id
     WHERE l.assessor_id = ?
     AND l.event_timestamp BETWEEN ? AND ?
     ORDER BY l.event_timestamp DESC`,
    [assessorId, startDate, endDate]
  );

  return {
    assessorId,
    reportPeriod: { startDate, endDate },
    totalEvents: accessLogs.length,
    claimsAccessed: [...new Set(accessLogs.map(l => l.claim_id))].length,
    insurersWorkedWith: [...new Set(accessLogs.map(l => l.tenant_id))].length,
    events: accessLogs
  };
}
```

---

## 11. Implementation Roadmap

### Phase 1: Foundation (Weeks 1-4)

**Deliverables:**
- ✅ Assessor identity model (database schema)
- ✅ Assessor-insurer relationship management
- ✅ Assignment workflow (create, accept, expire)
- ✅ Claim-scoped access tokens (JWT)
- ✅ API-layer access control middleware

**Tasks:**
1. Create database tables (`assessors`, `assessor_insurer_relationships`, `assessor_claim_assignments`)
2. Implement assignment creation workflow
3. Build claim-scoped JWT token generation
4. Create access validation middleware
5. Build assignment expiry cron job

### Phase 2: Evidence Integrity (Weeks 5-6)

**Deliverables:**
- ✅ Immutable evidence storage (S3 Object Lock)
- ✅ Cryptographic verification (SHA-256 hashing)
- ✅ Evidence upload/download workflows
- ✅ Evidence access control enforcement

**Tasks:**
1. Configure S3 bucket with Object Lock
2. Implement evidence upload with hash computation
3. Build evidence verification API
4. Create evidence access logging

### Phase 3: Report Versioning (Weeks 7-8)

**Deliverables:**
- ✅ Assessor report versioning schema
- ✅ Version creation workflow
- ✅ Version history UI
- ✅ Change tracking and audit trail

**Tasks:**
1. Create `assessor_evaluation_versions` table
2. Implement version creation logic
3. Build version history API
4. Create UI for version timeline

### Phase 4: Analytics & Scoring (Weeks 9-12)

**Deliverables:**
- ✅ AI vs assessor comparison analytics
- ✅ Performance scoring algorithm
- ✅ Assessor dashboard with KPIs
- ✅ Comparison visualization UI

**Tasks:**
1. Create `ai_assessor_comparisons` table
2. Implement comparison calculation algorithm
3. Build performance scoring logic
4. Create assessor dashboard UI
5. Build comparison analytics charts

### Phase 5: Audit & Compliance (Weeks 13-14)

**Deliverables:**
- ✅ Assessor audit logging infrastructure
- ✅ Compliance reporting APIs
- ✅ Audit log retention policies
- ✅ POPIA/GDPR compliance documentation

**Tasks:**
1. Create `assessor_audit_log` table
2. Implement audit logging middleware
3. Build compliance report generators
4. Configure log retention and archival

### Phase 6: Security Hardening (Weeks 15-16)

**Deliverables:**
- ✅ Security threat model validation
- ✅ Penetration testing
- ✅ Rate limiting and DLP policies
- ✅ Security incident response procedures

**Tasks:**
1. Conduct security audit
2. Implement rate limiting
3. Add anomaly detection
4. Create incident response playbook

---

## 12. Conclusion

The **KINGA Assessor Integration Architecture** establishes a secure, scalable, and compliant framework for integrating independent assessors into the claims management workflow. By implementing **assignment-based access control**, **immutable evidence storage**, **comprehensive audit logging**, and **AI comparison analytics**, the architecture ensures:

1. **Security** — Claim-scoped access prevents unauthorized data exposure
2. **Integrity** — Evidence immutability ensures forensic reliability
3. **Accountability** — Full audit trail enables compliance and quality assurance
4. **Performance** — AI comparison analytics drive continuous improvement
5. **Compliance** — POPIA/GDPR alignment protects data subject rights

This architecture positions KINGA as a **trusted, auditable, and high-quality** claims management platform that balances automation with expert human verification.

---

**Document Control:**
- **Next Review Date:** March 11, 2026
- **Approval Required From:** CTO, Security Lead, Compliance Officer
- **Related Documents:** 
  - KINGA-HMSAA-2026-012 (Hierarchical Multi-Stakeholder Access Architecture)
  - KINGA-MTDA-2026-008 (Multi-Tenant Dashboard Architecture)
  - KINGA-AIMGP-2026-010 (AI Model Governance Policies)

---

*End of Document*
