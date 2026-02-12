# KINGA Hybrid Intelligence Governance Layer

**Date:** February 12, 2026  
**Purpose:** Multi-tier data intelligence architecture with privacy-preserving anonymization and federated learning readiness  
**Compliance:** POPIA (South Africa), GDPR (EU), PAIA (Promotion of Access to Information Act)

---

## 1. Executive Summary

The **Hybrid Intelligence Governance Layer** enables KINGA to build increasingly accurate AI models by leveraging cross-tenant anonymized data while maintaining strict tenant privacy boundaries and regulatory compliance. The system implements a three-tier data intelligence architecture that balances the competing needs of model accuracy, tenant confidentiality, and regulatory obligations.

**Core Problem Solved:**

Single-tenant ML models trained on isolated datasets suffer from:
- **Limited training data** (small insurers may process <1000 claims/year)
- **Geographic bias** (regional vehicle types, repair costs, fraud patterns)
- **Temporal drift** (models degrade as market conditions change)
- **Cold start problem** (new tenants have zero historical data)

**Solution:**

A governed data-sharing framework where:
1. **Tenant Private Dataset** — Full-fidelity data accessible only to the owning tenant
2. **Tenant Feature Dataset** — De-identified features shared within tenant's control
3. **Global Anonymized Dataset** — Aggregated, anonymized data pooled across all tenants for collective model improvement

**Key Benefits:**

- **10x training data volume** for small/medium insurers via global dataset
- **Cross-market intelligence** (fraud patterns, cost benchmarks, damage correlations)
- **Privacy-by-design** (PII removed before global dataset inclusion)
- **Regulatory compliance** (POPIA/GDPR-compliant anonymization)
- **Federated learning readiness** (future: train models without raw data sharing)

---

## 2. Three-Tier Data Intelligence Architecture

### 2.1 Tier 1: Tenant Private Dataset

**Definition:** Full-fidelity claim intelligence records accessible only to the owning tenant.

**Data Scope:**
- All 57 columns from `claim_intelligence_dataset`
- Includes PII: vehicle registration, claimant identifiers (via claim_id FK)
- Exact timestamps, GPS coordinates, assessor names
- Unredacted damage descriptions and fraud explanations

**Access Control:**
- **Who:** Tenant admin, tenant data analysts, tenant ML engineers
- **Authentication:** OAuth + tenant_id isolation
- **Authorization:** `data_scope = 'tenant_private'` filter enforced at query level

**Use Cases:**
- Internal fraud investigation
- Assessor performance review
- Custom ML model training for large insurers
- Regulatory audit compliance (POPIA data subject access requests)

**Retention:**
- **7 years** (standard insurance industry practice)
- After 7 years: archive or anonymize per tenant's data retention policy

---

### 2.2 Tier 2: Tenant Feature Dataset

**Definition:** De-identified feature vectors shared within tenant's control, suitable for collaborative ML projects or third-party analytics.

**Transformations Applied:**
- Remove direct identifiers: `claim_id`, `assessor_id`, `tenant_id` (replaced with anonymized IDs)
- Generalize timestamps: exact datetime → month/year
- Generalize location: city → province/region
- Preserve feature distributions: all numeric features (costs, scores, variances) retained

**Data Scope:**
- 45 of 57 columns (12 columns removed/generalized)
- Vehicle make/model/year retained (not PII under POPIA)
- Damage components, severity scores, physics analysis retained
- Cost variances, fraud scores, turnaround times retained

**Access Control:**
- **Who:** Tenant admin (explicit opt-in required)
- **Sharing:** Tenant can grant access to:
  - Third-party analytics vendors (e.g., actuarial consultants)
  - Research institutions (academic partnerships)
  - Reinsurers (for risk assessment)
- **Audit:** All access grants logged in `dataset_access_grants` table

**Use Cases:**
- Actuarial modeling by external consultants
- Academic research partnerships
- Reinsurer risk assessment
- Benchmarking against industry averages

**Retention:**
- **Indefinite** (no PII, no POPIA retention limits apply)
- Tenant can revoke access at any time

---

### 2.3 Tier 3: Global Anonymized Dataset

**Definition:** Aggregated, anonymized dataset pooled across all KINGA tenants for collective model improvement. No single claim can be re-identified.

**Anonymization Transformations:**

| Original Field | Transformation | Rationale |
|----------------|----------------|-----------|
| `claim_id` | **Removed** | Direct identifier |
| `tenant_id` | **Removed** | Prevents tenant attribution |
| `assessor_id` | **Removed** | Prevents assessor identification |
| `vehicle_registration` | **Removed** (not in dataset, but enforced) | Direct identifier |
| `accident_description_text` | **Removed** | May contain identifying details |
| `llm_damage_reasoning` | **Removed** | May contain identifying details |
| `fraud_explanation` | **Removed** | May contain identifying details |
| `captured_at` | **Generalized** to month (e.g., "2026-02") | Temporal aggregation |
| `incident_location` | **Generalized** to province (e.g., "Gauteng") | Geographic aggregation |
| `vehicle_make` + `vehicle_model` | **Retained** | Not PII (publicly observable) |
| `vehicle_year` | **Generalized** to 5-year bracket (e.g., "2020-2024") | Reduce uniqueness |
| `vehicle_mass` | **Retained** | Numeric feature, not identifying |
| `accident_type` | **Retained** | Categorical feature |
| `detected_damage_components` | **Retained** | JSON array, no PII |
| `damage_severity_scores` | **Retained** | Numeric scores, no PII |
| `physics_plausibility_score` | **Retained** | Numeric feature |
| `ai_estimated_cost` | **Retained** | Numeric feature |
| `assessor_adjusted_cost` | **Retained** | Numeric feature |
| `insurer_approved_cost` | **Retained** | Numeric feature (ground truth) |
| `cost_variance_*` | **Retained** | Derived numeric features |
| `ai_fraud_score` | **Retained** | Numeric feature |
| `final_fraud_outcome` | **Retained** | Categorical feature |
| `assessor_tier` | **Retained** | Categorical feature (not identifying) |
| `assessment_turnaround_hours` | **Retained** | Numeric feature |
| `reassignment_count` | **Retained** | Numeric feature |
| `approval_timeline_hours` | **Retained** | Numeric feature |

**K-Anonymity Enforcement:**

Before a record enters the global dataset, the system validates that **at least k=5 other records** share the same quasi-identifier combination:

```
Quasi-identifiers: [vehicle_make, vehicle_model, vehicle_year_bracket, accident_type, province]
```

If k<5, the record is **withheld** from the global dataset until sufficient similar records accumulate.

**Access Control:**
- **Who:** KINGA ML engineering team, KINGA data science team
- **Purpose:** Train global AI models, fraud detection algorithms, cost estimation models
- **Restrictions:** No reverse-engineering of tenant identities permitted
- **Audit:** All queries logged with user_id, timestamp, query_hash

**Use Cases:**
- Train global fraud detection model (benefits all tenants)
- Train global cost estimation model
- Identify emerging fraud patterns across South Africa
- Benchmark regional repair cost trends

**Retention:**
- **Indefinite** (fully anonymized, no POPIA retention limits)

---

## 3. Data Scope Tagging Taxonomy

Every record in `claim_intelligence_dataset` receives a `data_scope` tag at creation time:

```typescript
enum DataScope {
  TENANT_PRIVATE = "tenant_private",       // Tier 1: Full-fidelity, tenant-only
  TENANT_FEATURE = "tenant_feature",       // Tier 2: De-identified, tenant-controlled sharing
  GLOBAL_ANONYMIZED = "global_anonymized", // Tier 3: Anonymized, cross-tenant pooled
}
```

**Tagging Logic:**

1. **At capture time** (`captureClaimIntelligenceDataset`):
   - All records initially tagged as `tenant_private`
   - Tenant can opt-in to `tenant_feature` sharing via admin settings

2. **Anonymization pipeline** (nightly batch job):
   - Selects `tenant_private` or `tenant_feature` records where tenant has enabled global sharing
   - Applies anonymization transformations
   - Validates k-anonymity
   - Inserts into `global_anonymized_dataset` table (separate table, not a tag)

**Database Schema Addition:**

```sql
ALTER TABLE claim_intelligence_dataset
  ADD COLUMN data_scope ENUM('tenant_private', 'tenant_feature') DEFAULT 'tenant_private' NOT NULL,
  ADD COLUMN global_sharing_enabled TINYINT DEFAULT 0, -- Boolean flag set by tenant admin
  ADD COLUMN anonymized_at TIMESTAMP NULL, -- When record was anonymized for global dataset
  ADD INDEX idx_data_scope (data_scope),
  ADD INDEX idx_global_sharing (global_sharing_enabled);
```

---

## 4. Anonymization Transformation Pipeline

### 4.1 Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Anonymization Pipeline                        │
│                  (Runs nightly at 02:00 SAST)                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 1: Source Selection                                         │
│ - Query claim_intelligence_dataset WHERE:                        │
│   * global_sharing_enabled = 1                                   │
│   * anonymized_at IS NULL                                        │
│   * captured_at < NOW() - INTERVAL 7 DAYS (cooling period)      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 2: PII Removal                                              │
│ - Remove: claim_id, tenant_id, assessor_id                      │
│ - Remove: accident_description_text, llm_damage_reasoning       │
│ - Remove: fraud_explanation                                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 3: Generalization                                           │
│ - captured_at → month (e.g., "2026-02")                         │
│ - vehicle_year → 5-year bracket (e.g., "2020-2024")            │
│ - incident_location → province (via lookup table)               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 4: K-Anonymity Validation                                   │
│ - Group by quasi-identifiers:                                    │
│   [vehicle_make, vehicle_model, year_bracket, accident_type,    │
│    province]                                                     │
│ - Count group size                                               │
│ - If count < 5: WITHHOLD from global dataset                    │
│ - If count >= 5: PROCEED to insertion                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 5: Global Dataset Insertion                                 │
│ - Insert into global_anonymized_dataset                          │
│ - Assign new anonymous_record_id (UUID)                         │
│ - Log anonymization event in anonymization_audit_log            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 6: Source Record Update                                     │
│ - UPDATE claim_intelligence_dataset                              │
│   SET anonymized_at = NOW()                                      │
│   WHERE id IN (processed_ids)                                    │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 K-Anonymity Validation Algorithm

**Objective:** Ensure no record in the global dataset can be uniquely identified by combining quasi-identifiers.

**Implementation:**

```typescript
async function validateKAnonymity(
  records: AnonymizedRecord[],
  k: number = 5
): Promise<{ valid: AnonymizedRecord[], withheld: AnonymizedRecord[] }> {
  // Group records by quasi-identifier combination
  const groups = new Map<string, AnonymizedRecord[]>();
  
  for (const record of records) {
    const quasiId = [
      record.vehicle_make,
      record.vehicle_model,
      record.vehicle_year_bracket,
      record.accident_type,
      record.province,
    ].join("|");
    
    if (!groups.has(quasiId)) {
      groups.set(quasiId, []);
    }
    groups.get(quasiId)!.push(record);
  }
  
  // Separate valid (k>=5) from withheld (k<5)
  const valid: AnonymizedRecord[] = [];
  const withheld: AnonymizedRecord[] = [];
  
  for (const [quasiId, groupRecords] of groups.entries()) {
    if (groupRecords.length >= k) {
      valid.push(...groupRecords);
    } else {
      withheld.push(...groupRecords);
      console.warn(`K-anonymity violation: group ${quasiId} has only ${groupRecords.length} records (k=${k} required)`);
    }
  }
  
  return { valid, withheld };
}
```

**Handling Withheld Records:**

Records that fail k-anonymity validation are:
1. **Not inserted** into the global dataset
2. **Logged** in `anonymization_audit_log` with status `withheld_k_anonymity`
3. **Re-evaluated** in the next pipeline run (7 days later) when more similar records may have accumulated

---

### 4.3 Geographic Aggregation

**City → Province Mapping:**

```typescript
const CITY_TO_PROVINCE: Record<string, string> = {
  // Gauteng
  "Johannesburg": "Gauteng",
  "Pretoria": "Gauteng",
  "Sandton": "Gauteng",
  "Midrand": "Gauteng",
  "Centurion": "Gauteng",
  
  // Western Cape
  "Cape Town": "Western Cape",
  "Stellenbosch": "Western Cape",
  "Paarl": "Western Cape",
  "George": "Western Cape",
  
  // KwaZulu-Natal
  "Durban": "KwaZulu-Natal",
  "Pietermaritzburg": "KwaZulu-Natal",
  "Richards Bay": "KwaZulu-Natal",
  
  // ... (full mapping for all 9 provinces)
};

function generalizeLocation(city: string): string {
  return CITY_TO_PROVINCE[city] || "Unknown";
}
```

**Rationale:** Province-level aggregation prevents re-identification via rare city combinations (e.g., "2023 BMW X5 accident in Graaff-Reinet" → unique).

---

### 4.4 Temporal Aggregation

**Exact Timestamp → Month:**

```typescript
function generalizeTimestamp(capturedAt: Date): string {
  return capturedAt.toISOString().slice(0, 7); // "2026-02-12T10:30:00Z" → "2026-02"
}
```

**Rationale:** Exact timestamps combined with other features can enable re-identification (e.g., "claim captured at 2026-02-12 14:37:22 for 2022 Toyota Corolla in Bloemfontein" → likely unique).

---

## 5. Database Schema Extensions

### 5.1 Modifications to `claim_intelligence_dataset`

```sql
ALTER TABLE claim_intelligence_dataset
  ADD COLUMN data_scope ENUM('tenant_private', 'tenant_feature') DEFAULT 'tenant_private' NOT NULL,
  ADD COLUMN global_sharing_enabled TINYINT DEFAULT 0 COMMENT 'Tenant opt-in for global dataset inclusion',
  ADD COLUMN anonymized_at TIMESTAMP NULL COMMENT 'When record was anonymized for global dataset',
  ADD INDEX idx_data_scope (data_scope),
  ADD INDEX idx_global_sharing (global_sharing_enabled),
  ADD INDEX idx_anonymized_at (anonymized_at);
```

---

### 5.2 New Table: `global_anonymized_dataset`

```sql
CREATE TABLE global_anonymized_dataset (
  id INT AUTO_INCREMENT PRIMARY KEY,
  anonymous_record_id VARCHAR(36) NOT NULL UNIQUE COMMENT 'UUID to prevent correlation',
  
  -- Temporal (generalized)
  capture_month VARCHAR(7) NOT NULL COMMENT 'YYYY-MM format',
  
  -- Vehicle context (partially generalized)
  vehicle_make VARCHAR(100),
  vehicle_model VARCHAR(100),
  vehicle_year_bracket VARCHAR(20) COMMENT '5-year brackets: 2020-2024, 2015-2019, etc.',
  vehicle_mass INT,
  
  -- Accident context
  accident_type VARCHAR(50),
  province VARCHAR(50) COMMENT 'Generalized from city',
  
  -- Damage features (retained)
  detected_damage_components JSON,
  damage_severity_scores JSON,
  physics_plausibility_score INT,
  
  -- Assessment features (retained)
  ai_estimated_cost INT,
  assessor_adjusted_cost INT,
  insurer_approved_cost INT,
  cost_variance_ai_vs_assessor INT,
  cost_variance_assessor_vs_final INT,
  cost_variance_ai_vs_final INT,
  
  -- Fraud features (retained)
  ai_fraud_score INT,
  final_fraud_outcome VARCHAR(50),
  
  -- Workflow features (retained)
  assessor_tier VARCHAR(50),
  assessment_turnaround_hours DECIMAL(10, 2),
  reassignment_count INT,
  approval_timeline_hours DECIMAL(10, 2),
  
  -- Metadata
  anonymized_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  schema_version INT NOT NULL DEFAULT 1,
  
  INDEX idx_capture_month (capture_month),
  INDEX idx_vehicle_make (vehicle_make),
  INDEX idx_province (province),
  INDEX idx_accident_type (accident_type),
  INDEX idx_anonymized_at (anonymized_at)
);
```

**Key Design Decisions:**

- **Separate table** (not a view) to enforce physical isolation from tenant data
- **anonymous_record_id** (UUID) prevents correlation with original `claim_id`
- **No foreign keys** to tenant data (prevents accidental joins)
- **Indexes** optimized for ML training queries (e.g., "all frontal accidents in Gauteng")

---

### 5.3 New Table: `anonymization_audit_log`

```sql
CREATE TABLE anonymization_audit_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  source_record_id INT NOT NULL COMMENT 'FK to claim_intelligence_dataset.id',
  anonymous_record_id VARCHAR(36) COMMENT 'UUID in global_anonymized_dataset (NULL if withheld)',
  
  -- Anonymization status
  status ENUM(
    'success',                  -- Successfully anonymized and inserted
    'withheld_k_anonymity',     -- Failed k-anonymity validation
    'withheld_pii_detected',    -- PII detected in free-text fields
    'withheld_tenant_opt_out'   -- Tenant disabled global sharing
  ) NOT NULL,
  
  -- Quasi-identifier hash (for k-anonymity debugging)
  quasi_identifier_hash VARCHAR(64) COMMENT 'SHA256 hash of [make, model, year_bracket, type, province]',
  group_size INT COMMENT 'Number of records sharing same quasi-identifier',
  
  -- Transformation details
  transformations_applied JSON COMMENT 'List of transformations: ["pii_removal", "temporal_generalization", ...]',
  
  -- Audit metadata
  anonymized_by_user_id INT COMMENT 'System user ID (for manual anonymization)',
  anonymized_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  
  INDEX idx_source_record (source_record_id),
  INDEX idx_status (status),
  INDEX idx_anonymized_at (anonymized_at)
);
```

**Purpose:**
- **Compliance audit trail** (prove POPIA/GDPR anonymization was performed)
- **Debugging** (identify why records were withheld)
- **Transparency** (tenants can query to see if their data was anonymized)

---

### 5.4 New Table: `dataset_access_grants`

```sql
CREATE TABLE dataset_access_grants (
  id INT AUTO_INCREMENT PRIMARY KEY,
  
  -- Access grant details
  tenant_id VARCHAR(255) NOT NULL,
  data_scope ENUM('tenant_private', 'tenant_feature', 'global_anonymized') NOT NULL,
  granted_to_user_id INT COMMENT 'User receiving access (NULL for role-based grants)',
  granted_to_role VARCHAR(50) COMMENT 'Role receiving access (e.g., "data_analyst")',
  granted_to_organization VARCHAR(255) COMMENT 'External organization (e.g., "XYZ Actuarial Consultants")',
  
  -- Access restrictions
  purpose TEXT NOT NULL COMMENT 'Business justification for access',
  expiry_date DATE COMMENT 'Access automatically revoked after this date',
  max_records INT COMMENT 'Maximum number of records that can be queried',
  
  -- Audit metadata
  granted_by_user_id INT NOT NULL,
  granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  revoked_at TIMESTAMP NULL,
  revoked_by_user_id INT,
  
  INDEX idx_tenant_id (tenant_id),
  INDEX idx_data_scope (data_scope),
  INDEX idx_granted_to_user (granted_to_user_id),
  INDEX idx_expiry_date (expiry_date)
);
```

**Purpose:**
- **RBAC enforcement** (who can access which dataset tier)
- **External sharing audit** (track third-party access to Tier 2 data)
- **Compliance** (POPIA requires logging of data access grants)

---

### 5.5 New Table: `federated_learning_metadata`

```sql
CREATE TABLE federated_learning_metadata (
  id INT AUTO_INCREMENT PRIMARY KEY,
  
  -- Training round details
  round_number INT NOT NULL,
  model_type VARCHAR(100) NOT NULL COMMENT 'fraud_detection, cost_estimation, etc.',
  
  -- Participating tenants (anonymized)
  participant_count INT NOT NULL,
  participant_tenant_ids JSON COMMENT 'Array of tenant_ids (encrypted or hashed)',
  
  -- Model aggregation
  global_model_version VARCHAR(50) NOT NULL,
  local_model_contributions JSON COMMENT 'Array of {tenant_id_hash, gradient_norm, data_count}',
  aggregation_method VARCHAR(50) DEFAULT 'federated_averaging',
  
  -- Performance metrics
  global_model_accuracy DECIMAL(5, 4) COMMENT 'Accuracy on global test set',
  convergence_status ENUM('converging', 'converged', 'diverged') DEFAULT 'converging',
  
  -- Metadata
  training_started_at TIMESTAMP NOT NULL,
  training_completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  
  INDEX idx_round_number (round_number),
  INDEX idx_model_type (model_type),
  INDEX idx_training_started_at (training_started_at)
);
```

**Purpose:**
- **Federated learning coordination** (track multi-tenant model training rounds)
- **Transparency** (tenants can see how many participants contributed to global model)
- **Audit trail** (prove model updates were derived from aggregated gradients, not raw data)

---

## 6. RBAC Access Control Matrix

### 6.1 Role Definitions

| Role | Description | Dataset Access |
|------|-------------|----------------|
| `tenant_admin` | Tenant administrator | Tier 1 (own tenant), Tier 2 (own tenant, can grant external access) |
| `tenant_data_analyst` | Tenant data analyst | Tier 1 (own tenant, read-only) |
| `tenant_ml_engineer` | Tenant ML engineer | Tier 1 (own tenant), Tier 2 (own tenant) |
| `kinga_data_scientist` | KINGA data science team | Tier 3 (global anonymized, read-only) |
| `kinga_ml_engineer` | KINGA ML engineering team | Tier 3 (global anonymized, read-only) |
| `external_analyst` | Third-party analyst (e.g., actuary) | Tier 2 (specific tenant, requires grant) |
| `regulator` | POPIA/GDPR regulator | Tier 1 (specific tenant, audit access only, requires legal request) |

---

### 6.2 Access Control Enforcement

**Query-Level Filtering:**

Every dataset query must pass through an access control layer:

```typescript
async function enforceDatasetAccess(
  userId: number,
  userRole: string,
  tenantId: string,
  requestedScope: DataScope
): Promise<boolean> {
  // Rule 1: Tenant Private data requires tenant membership
  if (requestedScope === "tenant_private") {
    const user = await getUserById(userId);
    if (user.tenantId !== tenantId) {
      await logAccessDenial(userId, tenantId, requestedScope, "tenant_mismatch");
      return false;
    }
  }
  
  // Rule 2: Tenant Feature data requires explicit grant
  if (requestedScope === "tenant_feature") {
    const grant = await getActiveAccessGrant(userId, tenantId, requestedScope);
    if (!grant) {
      await logAccessDenial(userId, tenantId, requestedScope, "no_grant");
      return false;
    }
  }
  
  // Rule 3: Global Anonymized data requires KINGA role
  if (requestedScope === "global_anonymized") {
    if (!["kinga_data_scientist", "kinga_ml_engineer"].includes(userRole)) {
      await logAccessDenial(userId, tenantId, requestedScope, "insufficient_role");
      return false;
    }
  }
  
  return true;
}
```

**tRPC Procedure Protection:**

```typescript
// Example: Query Tier 1 (Tenant Private) data
getTenantPrivateDataset: protectedProcedure
  .input(z.object({
    tenantId: z.string(),
    filters: z.object({ ... }),
  }))
  .query(async ({ ctx, input }) => {
    // Enforce access control
    const hasAccess = await enforceDatasetAccess(
      ctx.user.id,
      ctx.user.role,
      input.tenantId,
      "tenant_private"
    );
    
    if (!hasAccess) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Access denied to tenant private dataset" });
    }
    
    // Query with tenant isolation
    const db = await getDb();
    return await db.select()
      .from(claimIntelligenceDataset)
      .where(and(
        eq(claimIntelligenceDataset.tenantId, input.tenantId),
        eq(claimIntelligenceDataset.dataScope, "tenant_private")
      ));
  }),
```

---

## 7. Compliance Controls

### 7.1 POPIA (Protection of Personal Information Act) Compliance

**Requirement 1: Lawful Processing (Section 9)**

✅ **Compliance:** Tenant consent obtained via `global_sharing_enabled` flag  
✅ **Compliance:** Purpose limitation enforced (ML training only, no marketing)

**Requirement 2: Data Minimization (Section 10)**

✅ **Compliance:** Only necessary fields retained in global dataset  
✅ **Compliance:** PII removed before global sharing

**Requirement 3: Data Subject Rights (Section 23-25)**

✅ **Compliance:** Tenants can query `anonymization_audit_log` to see if their data was anonymized  
✅ **Compliance:** Tenants can disable `global_sharing_enabled` to opt-out  
✅ **Compliance:** Anonymized data cannot be re-identified (k-anonymity enforced)

**Requirement 4: Retention Limits (Section 14)**

✅ **Compliance:** Tier 1 (Private) data retained for 7 years, then archived/deleted  
✅ **Compliance:** Tier 3 (Global Anonymized) has no retention limit (not PII)

---

### 7.2 GDPR (General Data Protection Regulation) Compliance

**Article 5: Principles**

✅ **Lawfulness, fairness, transparency:** Anonymization process documented and auditable  
✅ **Purpose limitation:** Global dataset used only for ML training  
✅ **Data minimization:** PII removed before global sharing  
✅ **Accuracy:** Anonymization pipeline validated with k-anonymity checks

**Article 17: Right to Erasure**

✅ **Compliance:** Tenants can request deletion of Tier 1 data  
✅ **Compliance:** Tier 3 data is anonymized (GDPR does not apply to anonymized data per Recital 26)

**Article 25: Data Protection by Design**

✅ **Compliance:** K-anonymity enforced by default  
✅ **Compliance:** PII removal automated (no manual intervention required)

---

### 7.3 PAIA (Promotion of Access to Information Act) Compliance

**Section 50: Access to Personal Information**

✅ **Compliance:** Tenants can query their own Tier 1 data  
✅ **Compliance:** Regulators can request access via `dataset_access_grants` (requires legal justification)

---

## 8. Federated Learning Readiness

### 8.1 Federated Learning Overview

**Traditional ML Training (Current):**
```
Tenant A data → KINGA server → Train model → Deploy model
Tenant B data → KINGA server → Train model → Deploy model
Tenant C data → KINGA server → Train model → Deploy model
```

**Problem:** Tenants must trust KINGA with raw data.

**Federated Learning (Future):**
```
Tenant A: Train local model → Send gradients → KINGA aggregates gradients
Tenant B: Train local model → Send gradients → KINGA aggregates gradients
Tenant C: Train local model → Send gradients → KINGA aggregates gradients
                                    ↓
                            Global model update
```

**Benefit:** Tenants never send raw data to KINGA, only model updates (gradients).

---

### 8.2 Federated Learning Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                   KINGA Federated Learning Coordinator           │
│                                                                  │
│  1. Broadcast global model version to all participants          │
│  2. Wait for local model updates (gradients)                    │
│  3. Aggregate gradients using Federated Averaging               │
│  4. Update global model                                          │
│  5. Repeat until convergence                                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                ┌─────────────┼─────────────┐
                │             │             │
                ▼             ▼             ▼
┌─────────────────────┐ ┌─────────────────────┐ ┌─────────────────────┐
│  Tenant A (Local)   │ │  Tenant B (Local)   │ │  Tenant C (Local)   │
│                     │ │                     │ │                     │
│ 1. Download global  │ │ 1. Download global  │ │ 1. Download global  │
│    model            │ │    model            │ │    model            │
│ 2. Train on local   │ │ 2. Train on local   │ │ 2. Train on local   │
│    Tier 1 data      │ │    Tier 1 data      │ │    Tier 1 data      │
│ 3. Compute gradients│ │ 3. Compute gradients│ │ 3. Compute gradients│
│ 4. Send gradients   │ │ 4. Send gradients   │ │ 4. Send gradients   │
│    to coordinator   │ │    to coordinator   │ │    to coordinator   │
└─────────────────────┘ └─────────────────────┘ └─────────────────────┘
```

---

### 8.3 Federated Averaging Algorithm

**Pseudocode:**

```python
# Server (KINGA Coordinator)
global_model = initialize_model()

for round in range(num_rounds):
    # 1. Broadcast global model to participants
    for tenant in participating_tenants:
        send_model(tenant, global_model)
    
    # 2. Wait for local updates
    local_gradients = []
    for tenant in participating_tenants:
        gradient = receive_gradient(tenant)
        local_gradients.append(gradient)
    
    # 3. Aggregate gradients (weighted by dataset size)
    aggregated_gradient = federated_average(local_gradients)
    
    # 4. Update global model
    global_model = apply_gradient(global_model, aggregated_gradient)
    
    # 5. Log training round
    log_federated_round(round, global_model, local_gradients)

# Client (Tenant)
def train_local_model(global_model, local_data):
    local_model = copy(global_model)
    
    for epoch in range(local_epochs):
        for batch in local_data:
            loss = compute_loss(local_model, batch)
            gradient = compute_gradient(loss)
            local_model = apply_gradient(local_model, gradient)
    
    # Send only gradients, not raw data
    gradient_update = local_model - global_model
    send_gradient(coordinator, gradient_update)
```

---

### 8.4 Federated Learning API Stub

**tRPC Procedures (Future Implementation):**

```typescript
// Server-side coordinator
federatedLearning: router({
  // Broadcast global model to participants
  getGlobalModel: protectedProcedure
    .input(z.object({
      modelType: z.enum(["fraud_detection", "cost_estimation"]),
      roundNumber: z.number(),
    }))
    .query(async ({ input }) => {
      // Return serialized global model weights
      return await getGlobalModelWeights(input.modelType, input.roundNumber);
    }),
  
  // Receive local gradient update from tenant
  submitLocalGradient: protectedProcedure
    .input(z.object({
      modelType: z.enum(["fraud_detection", "cost_estimation"]),
      roundNumber: z.number(),
      gradientData: z.string(), // Base64-encoded gradient tensor
      datasetSize: z.number(), // Number of local training samples
    }))
    .mutation(async ({ ctx, input }) => {
      // Store gradient for aggregation
      await storeLocalGradient({
        tenantId: ctx.user.tenantId,
        modelType: input.modelType,
        roundNumber: input.roundNumber,
        gradientData: input.gradientData,
        datasetSize: input.datasetSize,
      });
      
      return { success: true };
    }),
  
  // Check if training round is complete
  getRoundStatus: protectedProcedure
    .input(z.object({
      modelType: z.enum(["fraud_detection", "cost_estimation"]),
      roundNumber: z.number(),
    }))
    .query(async ({ input }) => {
      return await getFederatedRoundStatus(input.modelType, input.roundNumber);
    }),
});
```

---

## 9. Implementation Roadmap

### Phase 1: Database Schema Extensions (Week 1)
- [ ] Add `data_scope`, `global_sharing_enabled`, `anonymized_at` columns to `claim_intelligence_dataset`
- [ ] Create `global_anonymized_dataset` table
- [ ] Create `anonymization_audit_log` table
- [ ] Create `dataset_access_grants` table
- [ ] Create `federated_learning_metadata` table
- [ ] Run migrations

### Phase 2: Anonymization Pipeline (Week 2)
- [ ] Implement PII removal transformer
- [ ] Implement geographic aggregation (city → province)
- [ ] Implement temporal aggregation (datetime → month)
- [ ] Implement vehicle year generalization (year → 5-year bracket)
- [ ] Implement k-anonymity validation
- [ ] Build anonymization pipeline orchestrator (cron job)

### Phase 3: RBAC Access Control (Week 3)
- [ ] Implement `enforceDatasetAccess()` function
- [ ] Add access control to all dataset query routers
- [ ] Implement `dataset_access_grants` management API
- [ ] Build access denial audit logging

### Phase 4: Audit Logging (Week 3)
- [ ] Implement anonymization event logger
- [ ] Implement access grant/revoke logger
- [ ] Build audit trail query API

### Phase 5: Federated Learning Stubs (Week 4)
- [ ] Implement `getGlobalModel` procedure
- [ ] Implement `submitLocalGradient` procedure
- [ ] Implement `getRoundStatus` procedure
- [ ] Document federated learning integration guide

### Phase 6: Testing (Week 4)
- [ ] Write tests for PII removal
- [ ] Write tests for k-anonymity validation
- [ ] Write tests for RBAC enforcement
- [ ] Write integration tests for full anonymization pipeline

---

## 10. Success Metrics

**Anonymization Quality:**
- **Target:** 100% of global dataset records pass k-anonymity validation (k≥5)
- **Measurement:** `SELECT COUNT(*) FROM global_anonymized_dataset` / `SELECT COUNT(*) FROM anonymization_audit_log WHERE status = 'success'`

**Access Control Enforcement:**
- **Target:** 0 unauthorized access attempts succeed
- **Measurement:** Monitor `access_denial_audit_log` for any `access_granted = true` where `should_deny = true`

**Tenant Participation:**
- **Target:** ≥50% of tenants opt-in to global dataset sharing
- **Measurement:** `SELECT COUNT(DISTINCT tenant_id) FROM claim_intelligence_dataset WHERE global_sharing_enabled = 1` / `SELECT COUNT(DISTINCT tenant_id) FROM claims`

**Global Dataset Growth:**
- **Target:** ≥10,000 anonymized records within 6 months
- **Measurement:** `SELECT COUNT(*) FROM global_anonymized_dataset`

**Model Accuracy Improvement:**
- **Target:** Global models trained on Tier 3 data outperform single-tenant models by ≥15% accuracy
- **Measurement:** Compare fraud detection F1 score (global model vs single-tenant model)

---

## 11. Risk Mitigation

### Risk 1: Re-identification Attack

**Threat:** Adversary combines global dataset with external data sources to re-identify individuals.

**Mitigation:**
- K-anonymity enforcement (k≥5)
- 7-day cooling period before anonymization (prevents real-time correlation)
- Removal of free-text fields (accident descriptions, fraud explanations)
- Geographic aggregation (city → province)

**Residual Risk:** Low (requires adversary to have access to external datasets with matching quasi-identifiers)

---

### Risk 2: Tenant Opt-Out

**Threat:** Tenants refuse to enable `global_sharing_enabled`, reducing global dataset size.

**Mitigation:**
- Demonstrate value: show tenants how global models improve fraud detection accuracy
- Transparency: publish anonymization audit logs so tenants can verify PII removal
- Incentives: offer premium features (e.g., benchmarking dashboards) to tenants who opt-in

**Residual Risk:** Medium (large insurers may prefer to keep data private)

---

### Risk 3: Regulatory Challenge

**Threat:** POPIA regulator challenges anonymization as insufficient.

**Mitigation:**
- K-anonymity is a recognized anonymization standard (GDPR Recital 26)
- Audit trail proves anonymization was performed
- Legal review of anonymization process by data protection officer

**Residual Risk:** Low (k-anonymity is widely accepted)

---

## 12. Future Enhancements

### 12.1 Differential Privacy

**Concept:** Add statistical noise to query results to prevent inference attacks.

**Implementation:**
```python
def query_with_differential_privacy(query, epsilon=1.0):
    true_result = execute_query(query)
    noise = laplace_noise(sensitivity=1, epsilon=epsilon)
    return true_result + noise
```

**Benefit:** Stronger privacy guarantee than k-anonymity alone.

---

### 12.2 Secure Multi-Party Computation (SMPC)

**Concept:** Tenants jointly compute aggregate statistics without revealing individual data.

**Use Case:** Calculate average repair cost across all tenants without any tenant seeing others' data.

**Benefit:** Enables collaborative analytics without data sharing.

---

### 12.3 Homomorphic Encryption

**Concept:** Train ML models on encrypted data without decrypting.

**Benefit:** Tenants can send encrypted data to KINGA for training, and KINGA never sees plaintext.

---

## 13. Conclusion

The Hybrid Intelligence Governance Layer enables KINGA to build world-class AI models by leveraging cross-tenant data while maintaining strict privacy boundaries and regulatory compliance. The three-tier architecture (Tenant Private, Tenant Feature, Global Anonymized) balances the competing needs of model accuracy, tenant confidentiality, and regulatory obligations.

**Key Achievements:**

✅ **Privacy-by-design:** K-anonymity enforced, PII removed before global sharing  
✅ **Regulatory compliance:** POPIA/GDPR-compliant anonymization  
✅ **Federated learning readiness:** Infrastructure for future privacy-preserving ML  
✅ **Transparency:** Audit logs prove anonymization was performed  
✅ **Scalability:** Global dataset can grow to millions of records

**Next Steps:**

1. Implement database schema extensions (Week 1)
2. Build anonymization pipeline (Week 2)
3. Deploy RBAC access control (Week 3)
4. Launch pilot with 3-5 tenants (Week 4)
5. Measure model accuracy improvement (Month 2)

---

**Document Status:** ✅ Complete  
**Implementation Priority:** High (enables cross-tenant intelligence)  
**Estimated Implementation Time:** 4 weeks
