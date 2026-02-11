# Hybrid Multi-Tenant Data Architecture

**Document ID:** KINGA-HMTDA-2026-011  
**Author:** Tavonga Shoko  
**Date:** February 11, 2026  
**Version:** 1.0  
**Classification:** Internal - Technical Specification

---

## Executive Summary

This document specifies the hybrid multi-tenant data architecture for the KINGA AutoVerify AI platform, designed to support multiple insurance companies (tenants) on a shared infrastructure while maintaining strict data isolation, security, and compliance with POPIA and GDPR requirements. The architecture balances operational efficiency through shared AI and analytics infrastructure with tenant-specific isolation through schema-per-insurer database design, tenant-specific encryption keys, and segregated file storage. The design enables cross-tenant anonymized analytics for platform-wide insights while ensuring no tenant can access another tenant's identifiable data. Automated onboarding and offboarding workflows ensure scalable tenant lifecycle management with comprehensive data deletion capabilities.

---

## 1. Architecture Overview

### 1.1 Hybrid Multi-Tenancy Model

The KINGA platform implements a **hybrid multi-tenancy model** that combines shared and isolated resources:

| Resource Layer | Isolation Strategy | Rationale |
|---|---|---|
| **Application Layer** | Shared (single codebase) | Cost efficiency, consistent feature deployment |
| **Database - Transactional** | Schema-per-tenant (PostgreSQL) | Strong isolation, regulatory compliance, tenant-specific backup/restore |
| **Database - Analytics** | Instance-per-tenant (ClickHouse) | Performance isolation, tenant-specific query optimization |
| **AI/ML Models** | Shared models, tenant-filtered data | Cost efficiency, model quality through aggregated training data |
| **File Storage** | Bucket-per-tenant (S3) | Complete isolation, tenant-specific encryption keys, independent lifecycle |
| **Caching Layer** | Shared Redis with tenant-prefixed keys | Performance, cost efficiency with logical isolation |
| **Message Queue** | Shared Kafka with tenant-tagged messages | Scalability, cost efficiency with message-level isolation |

### 1.2 Tenant Isolation Principles

The architecture enforces tenant isolation through multiple defense layers:

**Layer 1: Application-Level Filtering** — Every database query automatically includes `WHERE tenant_id = ?` through middleware injection.

**Layer 2: Database-Level RLS (Row-Level Security)** — PostgreSQL RLS policies enforce tenant isolation even if application logic fails.

**Layer 3: Encryption-at-Rest** — Each tenant's data encrypted with tenant-specific KMS keys, preventing cross-tenant data access even with database compromise.

**Layer 4: Network-Level Segmentation** — Tenant-specific VPCs for analytics instances prevent network-level cross-tenant access.

**Layer 5: Audit Logging** — All cross-tenant data access attempts logged to immutable audit trail for forensic analysis.

---

## 2. Database Schema Strategy

### 2.1 Schema-Per-Tenant Design (PostgreSQL)

The transactional database uses a **schema-per-tenant** approach where each insurer receives a dedicated PostgreSQL schema within a shared database instance.

**Schema Naming Convention:**
```
tenant_{tenant_id}_{tenant_slug}
```

**Example:**
- `tenant_1_demo_insurance`
- `tenant_2_liberty_holdings`
- `tenant_3_santam_insurance`

**Schema Structure:**

Each tenant schema contains identical table structures but isolated data:

```sql
-- Tenant 1 Schema
CREATE SCHEMA tenant_1_demo_insurance;

CREATE TABLE tenant_1_demo_insurance.claims (
  id BIGSERIAL PRIMARY KEY,
  claim_number VARCHAR(50) UNIQUE NOT NULL,
  policy_number VARCHAR(50) NOT NULL,
  claimant_id BIGINT NOT NULL,
  incident_date TIMESTAMP NOT NULL,
  claim_amount DECIMAL(12,2),
  status VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tenant_1_demo_insurance.users (
  id BIGSERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  role VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Repeat for all 28 tables in the schema
```

**Shared Tables (Global Schema):**

Certain platform-level tables remain in a global `public` schema:

```sql
CREATE TABLE public.tenants (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  schema_name VARCHAR(100) UNIQUE NOT NULL,
  encryption_key_id VARCHAR(255) NOT NULL,
  s3_bucket_name VARCHAR(255) NOT NULL,
  clickhouse_instance_url VARCHAR(255),
  status VARCHAR(50) DEFAULT 'active',
  config_json JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE public.platform_admins (
  id BIGSERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  role VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE public.audit_log (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT,
  user_id BIGINT,
  action VARCHAR(255) NOT NULL,
  resource_type VARCHAR(100),
  resource_id VARCHAR(100),
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 2.2 Row-Level Security (RLS) Policies

PostgreSQL RLS policies enforce tenant isolation at the database level:

```sql
-- Enable RLS on tenant schema tables
ALTER TABLE tenant_1_demo_insurance.claims ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access claims in their tenant schema
CREATE POLICY tenant_isolation_policy ON tenant_1_demo_insurance.claims
  USING (current_setting('app.current_tenant_id')::BIGINT = 1);

-- Policy: Platform admins can access all tenants (with audit logging)
CREATE POLICY platform_admin_policy ON tenant_1_demo_insurance.claims
  TO platform_admin_role
  USING (true);
```

**Setting Tenant Context:**

Before executing queries, the application sets the tenant context:

```sql
SET app.current_tenant_id = '1';
SET app.current_user_id = '42';
SET app.current_role = 'insurer_admin';
```

### 2.3 Analytics Database (ClickHouse)

Each tenant receives a dedicated ClickHouse instance for analytics workloads:

**Instance Naming Convention:**
```
kinga-analytics-tenant-{tenant_id}
```

**Materialized Views for Real-Time Analytics:**

```sql
-- Claims cost trend materialized view
CREATE MATERIALIZED VIEW tenant_1_claims_cost_trend_mv
ENGINE = SummingMergeTree()
ORDER BY (year, month, claim_type)
AS SELECT
  toYear(incident_date) AS year,
  toMonth(incident_date) AS month,
  claim_type,
  count() AS claim_count,
  sum(claim_amount) AS total_amount,
  avg(claim_amount) AS avg_amount
FROM tenant_1_claims
GROUP BY year, month, claim_type;
```

**Data Replication:**

PostgreSQL → ClickHouse replication via Kafka Connect:

```
PostgreSQL (tenant schema) 
  → Debezium CDC 
  → Kafka (tenant-tagged messages) 
  → ClickHouse Kafka Engine 
  → Tenant ClickHouse Instance
```

---

## 3. Data Isolation Enforcement Design

### 3.1 Application-Level Enforcement

**Tenant Context Middleware:**

```typescript
// server/_core/tenant-middleware.ts
export async function extractTenantContext(req: Request): Promise<TenantContext> {
  // Extract tenant ID from JWT
  const token = req.headers.authorization?.replace('Bearer ', '');
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  
  // Fetch tenant details
  const tenant = await db.select()
    .from(tenants)
    .where(eq(tenants.id, decoded.tenantId))
    .limit(1);
  
  if (!tenant[0]) {
    throw new Error('Tenant not found');
  }
  
  // Set PostgreSQL session variables
  await db.execute(sql`SET app.current_tenant_id = ${tenant[0].id}`);
  await db.execute(sql`SET app.current_schema = ${tenant[0].schema_name}`);
  
  return {
    id: tenant[0].id,
    name: tenant[0].name,
    schema: tenant[0].schema_name,
    encryptionKeyId: tenant[0].encryption_key_id,
    s3Bucket: tenant[0].s3_bucket_name
  };
}
```

**Automatic Query Filtering:**

```typescript
// All queries automatically scoped to tenant schema
const claims = await db.select()
  .from(claims) // Resolves to tenant_1_demo_insurance.claims
  .where(eq(claims.status, 'pending'));
```

### 3.2 Database-Level Enforcement

**RLS Policy Enforcement:**

Even if application logic bypasses tenant filtering, RLS policies prevent cross-tenant access:

```sql
-- Attempt to access another tenant's data
SET app.current_tenant_id = '1';
SELECT * FROM tenant_2_liberty_holdings.claims; -- Returns 0 rows due to RLS
```

**Foreign Key Constraints:**

Cross-tenant foreign keys are prohibited:

```sql
-- This constraint prevents cross-tenant references
ALTER TABLE tenant_1_demo_insurance.claims
ADD CONSTRAINT fk_claimant
FOREIGN KEY (claimant_id) 
REFERENCES tenant_1_demo_insurance.users(id);
```

### 3.3 File Storage Isolation

**S3 Bucket-Per-Tenant:**

Each tenant receives a dedicated S3 bucket:

```
kinga-tenant-1-demo-insurance
kinga-tenant-2-liberty-holdings
kinga-tenant-3-santam-insurance
```

**Bucket Policy (Deny Cross-Tenant Access):**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::kinga-tenant-1-demo-insurance/*"
      ],
      "Condition": {
        "StringNotEquals": {
          "aws:userid": "tenant-1-service-account"
        }
      }
    }
  ]
}
```

**IAM Role Per Tenant:**

Each tenant's application instances assume a tenant-specific IAM role with access only to their bucket:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::kinga-tenant-1-demo-insurance/*"
    }
  ]
}
```

---

## 4. Encryption Key Lifecycle Design

### 4.1 Tenant-Specific Encryption Keys

Each tenant receives a dedicated AWS KMS Customer Master Key (CMK):

**Key Naming Convention:**
```
kinga-tenant-{tenant_id}-{tenant_slug}-cmk
```

**Key Metadata:**

```json
{
  "KeyId": "arn:aws:kms:us-east-1:123456789012:key/abc123",
  "Alias": "alias/kinga-tenant-1-demo-insurance-cmk",
  "Description": "Encryption key for Demo Insurance Company (Tenant ID: 1)",
  "KeyState": "Enabled",
  "KeyUsage": "ENCRYPT_DECRYPT",
  "Origin": "AWS_KMS",
  "KeyManager": "CUSTOMER",
  "CreationDate": "2026-02-11T10:00:00Z",
  "Tags": [
    {"Key": "TenantId", "Value": "1"},
    {"Key": "TenantName", "Value": "Demo Insurance Company"},
    {"Key": "Environment", "Value": "production"}
  ]
}
```

### 4.2 Encryption-at-Rest

**Database Encryption:**

PostgreSQL uses Transparent Data Encryption (TDE) with tenant-specific keys:

```sql
-- Enable TDE for tenant schema
ALTER DATABASE kinga_production 
SET ENCRYPTION KEY 'arn:aws:kms:us-east-1:123456789012:key/abc123'
FOR SCHEMA tenant_1_demo_insurance;
```

**S3 Encryption:**

All objects in tenant S3 buckets encrypted with tenant CMK:

```bash
aws s3api put-object \
  --bucket kinga-tenant-1-demo-insurance \
  --key claims/claim-123/photo.jpg \
  --body photo.jpg \
  --server-side-encryption aws:kms \
  --ssekms-key-id arn:aws:kms:us-east-1:123456789012:key/abc123
```

**ClickHouse Encryption:**

ClickHouse data encrypted at rest using tenant CMK via EBS volume encryption:

```bash
aws ec2 create-volume \
  --size 500 \
  --volume-type gp3 \
  --encrypted \
  --kms-key-id arn:aws:kms:us-east-1:123456789012:key/abc123 \
  --tag-specifications 'ResourceType=volume,Tags=[{Key=TenantId,Value=1}]'
```

### 4.3 Key Rotation Policy

**Automatic Key Rotation:**

KMS keys automatically rotate annually:

```bash
aws kms enable-key-rotation \
  --key-id arn:aws:kms:us-east-1:123456789012:key/abc123
```

**Manual Key Rotation (Emergency):**

In case of key compromise:

```bash
# 1. Create new key
aws kms create-key \
  --description "Emergency rotation for Tenant 1" \
  --tags TagKey=TenantId,TagValue=1

# 2. Re-encrypt all data with new key
aws s3 cp s3://kinga-tenant-1-demo-insurance/ s3://kinga-tenant-1-demo-insurance/ \
  --recursive \
  --sse aws:kms \
  --sse-kms-key-id arn:aws:kms:us-east-1:123456789012:key/new-key-id \
  --metadata-directive REPLACE

# 3. Update tenant record
UPDATE public.tenants 
SET encryption_key_id = 'arn:aws:kms:us-east-1:123456789012:key/new-key-id'
WHERE id = 1;

# 4. Schedule old key deletion (30-day waiting period)
aws kms schedule-key-deletion \
  --key-id arn:aws:kms:us-east-1:123456789012:key/abc123 \
  --pending-window-in-days 30
```

### 4.4 Key Access Auditing

All key usage logged to CloudTrail:

```sql
-- Query key access audit log
SELECT 
  eventTime,
  userIdentity.principalId,
  eventName,
  requestParameters.keyId,
  sourceIPAddress
FROM cloudtrail_logs
WHERE eventName IN ('Encrypt', 'Decrypt', 'GenerateDataKey')
  AND requestParameters.keyId LIKE '%tenant-1%'
ORDER BY eventTime DESC;
```

---

## 5. Access Control Enforcement Design

### 5.1 Role-Based Access Control (RBAC) Matrix

| Role | Tenant Scope | Database Access | File Storage Access | Analytics Access | AI Model Access | Platform Admin Access |
|---|---|---|---|---|---|---|
| **Claimant** | Single tenant | Own claims only | Own uploaded files | No | No | No |
| **Assessor** | Single tenant | Assigned claims | Assigned claim files | No | AI assessment results | No |
| **Panel Beater** | Single tenant | Assigned quotes | Assigned quote files | No | No | No |
| **Insurer Admin** | Single tenant | All tenant data | All tenant files | Full tenant analytics | Model performance metrics | No |
| **Insurer Analyst** | Single tenant | Read-only tenant data | Read-only tenant files | Full tenant analytics | Model performance metrics | No |
| **Platform Admin** | All tenants | All data (audited) | All files (audited) | All analytics | Full model access | Full |
| **Platform Analyst** | All tenants | Anonymized data only | No | Cross-tenant anonymized analytics | Aggregate model metrics | No |

### 5.2 Permission Enforcement

**Database Permissions:**

```sql
-- Insurer Admin role (tenant-scoped)
CREATE ROLE tenant_1_insurer_admin;
GRANT USAGE ON SCHEMA tenant_1_demo_insurance TO tenant_1_insurer_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA tenant_1_demo_insurance TO tenant_1_insurer_admin;

-- Insurer Analyst role (read-only)
CREATE ROLE tenant_1_insurer_analyst;
GRANT USAGE ON SCHEMA tenant_1_demo_insurance TO tenant_1_insurer_analyst;
GRANT SELECT ON ALL TABLES IN SCHEMA tenant_1_demo_insurance TO tenant_1_insurer_analyst;

-- Platform Admin role (cross-tenant with audit)
CREATE ROLE platform_admin;
GRANT USAGE ON ALL SCHEMAS TO platform_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN ALL SCHEMAS TO platform_admin;
```

**S3 Bucket Permissions:**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "InsurerAdminFullAccess",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::123456789012:role/tenant-1-insurer-admin"
      },
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"],
      "Resource": [
        "arn:aws:s3:::kinga-tenant-1-demo-insurance",
        "arn:aws:s3:::kinga-tenant-1-demo-insurance/*"
      ]
    },
    {
      "Sid": "InsurerAnalystReadOnly",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::123456789012:role/tenant-1-insurer-analyst"
      },
      "Action": ["s3:GetObject", "s3:ListBucket"],
      "Resource": [
        "arn:aws:s3:::kinga-tenant-1-demo-insurance",
        "arn:aws:s3:::kinga-tenant-1-demo-insurance/*"
      ]
    }
  ]
}
```

### 5.3 API-Level Authorization

**tRPC Procedure Authorization:**

```typescript
// Insurer admin procedure (tenant-scoped)
insurerAdminProcedure: protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'insurer_admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Insurer admin access required' });
  }
  if (ctx.user.tenantId !== ctx.tenant.id) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Cross-tenant access denied' });
  }
  return next({ ctx });
}),

// Platform admin procedure (cross-tenant with audit)
platformAdminProcedure: protectedProcedure.use(async ({ ctx, next }) => {
  if (ctx.user.role !== 'platform_admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Platform admin access required' });
  }
  
  // Log cross-tenant access
  await auditLogger.log({
    tenantId: ctx.tenant.id,
    userId: ctx.user.id,
    action: 'CROSS_TENANT_ACCESS',
    resourceType: 'tenant_data',
    resourceId: ctx.tenant.id.toString(),
    ipAddress: ctx.req.ip,
    userAgent: ctx.req.headers['user-agent']
  });
  
  return next({ ctx });
}),
```

---

## 6. Cross-Tenant Anonymized Analytics

### 6.1 Anonymization Strategy

Platform analysts can access cross-tenant analytics for platform-wide insights, but all personally identifiable information (PII) and tenant-identifying information is anonymized.

**Anonymization Rules:**

| Field Type | Anonymization Method |
|---|---|
| Names (claimant, assessor, panel beater) | Replaced with `REDACTED` |
| Email addresses | Replaced with `redacted@example.com` |
| Phone numbers | Replaced with `+00 000 000 0000` |
| Addresses | Replaced with city/province only |
| Policy numbers | Hashed with SHA-256 |
| Claim numbers | Hashed with SHA-256 |
| Vehicle VINs | Hashed with SHA-256 |
| Tenant names | Replaced with `Tenant A`, `Tenant B`, etc. |
| Claim amounts | Rounded to nearest R1000 |
| Dates | Truncated to month/year only |

### 6.2 Anonymized Analytics Database

A separate PostgreSQL database (`kinga_anonymized_analytics`) contains anonymized data from all tenants:

```sql
CREATE TABLE anonymized_claims (
  id BIGSERIAL PRIMARY KEY,
  tenant_label VARCHAR(50) NOT NULL, -- 'Tenant A', 'Tenant B', etc.
  claim_hash VARCHAR(64) NOT NULL, -- SHA-256 hash of claim_number
  policy_hash VARCHAR(64) NOT NULL,
  incident_month DATE NOT NULL, -- Truncated to first day of month
  claim_amount_rounded DECIMAL(12,2), -- Rounded to nearest R1000
  claim_type VARCHAR(50),
  vehicle_make VARCHAR(50),
  vehicle_model VARCHAR(50),
  province VARCHAR(50),
  fraud_risk_score DECIMAL(5,2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Data Replication Pipeline:**

```
PostgreSQL (tenant schemas) 
  → Anonymization ETL (Python/Airflow) 
  → PostgreSQL (anonymized_analytics database)
```

**Anonymization ETL Script:**

```python
# scripts/etl/anonymize-tenant-data.py
import hashlib
import math

def anonymize_claim(claim):
    return {
        'tenant_label': f"Tenant {chr(65 + claim['tenant_id'] % 26)}", # A, B, C, ...
        'claim_hash': hashlib.sha256(claim['claim_number'].encode()).hexdigest(),
        'policy_hash': hashlib.sha256(claim['policy_number'].encode()).hexdigest(),
        'incident_month': claim['incident_date'].replace(day=1),
        'claim_amount_rounded': math.ceil(claim['claim_amount'] / 1000) * 1000,
        'claim_type': claim['claim_type'],
        'vehicle_make': claim['vehicle_make'],
        'vehicle_model': claim['vehicle_model'],
        'province': claim['address_province'],
        'fraud_risk_score': claim['fraud_risk_score']
    }
```

### 6.3 Platform Analyst Access

Platform analysts can query the anonymized database:

```sql
-- Cross-tenant fraud trend analysis
SELECT 
  tenant_label,
  DATE_TRUNC('month', incident_month) AS month,
  COUNT(*) AS claim_count,
  AVG(fraud_risk_score) AS avg_fraud_risk,
  SUM(claim_amount_rounded) AS total_amount
FROM anonymized_claims
WHERE incident_month >= '2025-01-01'
GROUP BY tenant_label, month
ORDER BY month DESC, avg_fraud_risk DESC;
```

**Access Control:**

```sql
CREATE ROLE platform_analyst;
GRANT CONNECT ON DATABASE kinga_anonymized_analytics TO platform_analyst;
GRANT USAGE ON SCHEMA public TO platform_analyst;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO platform_analyst;
REVOKE ALL ON DATABASE kinga_production FROM platform_analyst; -- No access to identifiable data
```

---

## 7. Tenant Onboarding Automation Workflow

### 7.1 Onboarding Steps

The tenant onboarding process is fully automated via the CLI tool:

```bash
pnpm tsx scripts/tenant-onboarding/cli.ts onboard \
  --name "Liberty Holdings" \
  --slug "liberty-holdings" \
  --admin-email "admin@liberty.co.za" \
  --admin-name "John Smith"
```

**Automated Steps:**

1. **Create Tenant Record** — Insert into `public.tenants` table
2. **Generate Encryption Key** — Create AWS KMS CMK for tenant
3. **Create Database Schema** — Create `tenant_{id}_{slug}` schema with all tables
4. **Apply RLS Policies** — Enable row-level security on all tables
5. **Create S3 Bucket** — Create `kinga-tenant-{id}-{slug}` bucket with encryption
6. **Provision ClickHouse Instance** — Launch dedicated ClickHouse instance
7. **Create IAM Roles** — Create tenant-specific IAM roles for S3/KMS access
8. **Create Admin User** — Create first admin user with credentials
9. **Send Welcome Email** — Email admin with login credentials and onboarding guide
10. **Audit Log Entry** — Log tenant creation event

### 7.2 Onboarding Script

```typescript
// scripts/tenant-onboarding/cli.ts
async function onboardTenant(options: OnboardOptions) {
  console.log(`[1/10] Creating tenant record for ${options.name}...`);
  const tenant = await createTenantRecord(options);
  
  console.log(`[2/10] Generating encryption key...`);
  const encryptionKey = await generateEncryptionKey(tenant);
  
  console.log(`[3/10] Creating database schema...`);
  await createDatabaseSchema(tenant);
  
  console.log(`[4/10] Applying RLS policies...`);
  await applyRLSPolicies(tenant);
  
  console.log(`[5/10] Creating S3 bucket...`);
  await createS3Bucket(tenant, encryptionKey);
  
  console.log(`[6/10] Provisioning ClickHouse instance...`);
  await provisionClickHouseInstance(tenant, encryptionKey);
  
  console.log(`[7/10] Creating IAM roles...`);
  await createIAMRoles(tenant);
  
  console.log(`[8/10] Creating admin user...`);
  const adminUser = await createAdminUser(tenant, options);
  
  console.log(`[9/10] Sending welcome email...`);
  await sendWelcomeEmail(adminUser, tenant);
  
  console.log(`[10/10] Logging audit entry...`);
  await logAuditEntry('TENANT_ONBOARDED', tenant.id);
  
  console.log(`✅ Tenant ${options.name} successfully onboarded!`);
  console.log(`Tenant ID: ${tenant.id}`);
  console.log(`Schema: ${tenant.schema_name}`);
  console.log(`S3 Bucket: ${tenant.s3_bucket_name}`);
  console.log(`Admin Email: ${options.adminEmail}`);
}
```

### 7.3 Onboarding Validation

After onboarding, the system runs validation checks:

```typescript
async function validateTenantOnboarding(tenantId: number) {
  const checks = [
    { name: 'Tenant record exists', fn: () => checkTenantRecord(tenantId) },
    { name: 'Database schema created', fn: () => checkDatabaseSchema(tenantId) },
    { name: 'RLS policies applied', fn: () => checkRLSPolicies(tenantId) },
    { name: 'S3 bucket accessible', fn: () => checkS3Bucket(tenantId) },
    { name: 'ClickHouse instance running', fn: () => checkClickHouseInstance(tenantId) },
    { name: 'Encryption key active', fn: () => checkEncryptionKey(tenantId) },
    { name: 'Admin user can login', fn: () => checkAdminLogin(tenantId) }
  ];
  
  for (const check of checks) {
    const result = await check.fn();
    console.log(`${result ? '✅' : '❌'} ${check.name}`);
  }
}
```

---

## 8. Tenant Offboarding and Data Deletion Workflow

### 8.1 Offboarding Steps

Tenant offboarding ensures complete data deletion in compliance with POPIA/GDPR "right to erasure":

```bash
pnpm tsx scripts/tenant-onboarding/cli.ts offboard \
  --tenant-id 1 \
  --confirm-deletion
```

**Automated Steps:**

1. **Mark Tenant Inactive** — Set `status = 'offboarding'` in `public.tenants`
2. **Disable User Access** — Revoke all user sessions and API keys
3. **Export Data Archive** — Create encrypted backup for legal retention (7 years)
4. **Delete S3 Bucket** — Delete all objects and bucket
5. **Delete ClickHouse Instance** — Terminate instance and delete volumes
6. **Drop Database Schema** — Drop tenant schema and all tables
7. **Delete Encryption Key** — Schedule KMS key deletion (30-day waiting period)
8. **Delete IAM Roles** — Delete tenant-specific IAM roles
9. **Purge Anonymized Data** — Remove tenant's anonymized records
10. **Audit Log Entry** — Log tenant deletion event with data retention proof

### 8.2 Offboarding Script

```typescript
// scripts/tenant-onboarding/offboard.ts
async function offboardTenant(tenantId: number, confirmDeletion: boolean) {
  if (!confirmDeletion) {
    throw new Error('Must confirm deletion with --confirm-deletion flag');
  }
  
  console.log(`[1/10] Marking tenant ${tenantId} as inactive...`);
  await markTenantInactive(tenantId);
  
  console.log(`[2/10] Disabling user access...`);
  await disableUserAccess(tenantId);
  
  console.log(`[3/10] Exporting data archive for legal retention...`);
  const archivePath = await exportDataArchive(tenantId);
  
  console.log(`[4/10] Deleting S3 bucket...`);
  await deleteS3Bucket(tenantId);
  
  console.log(`[5/10] Deleting ClickHouse instance...`);
  await deleteClickHouseInstance(tenantId);
  
  console.log(`[6/10] Dropping database schema...`);
  await dropDatabaseSchema(tenantId);
  
  console.log(`[7/10] Scheduling encryption key deletion...`);
  await scheduleKeyDeletion(tenantId);
  
  console.log(`[8/10] Deleting IAM roles...`);
  await deleteIAMRoles(tenantId);
  
  console.log(`[9/10] Purging anonymized data...`);
  await purgeAnonymizedData(tenantId);
  
  console.log(`[10/10] Logging audit entry...`);
  await logAuditEntry('TENANT_OFFBOARDED', tenantId, { archivePath });
  
  console.log(`✅ Tenant ${tenantId} successfully offboarded!`);
  console.log(`Data archive: ${archivePath}`);
}
```

### 8.3 Data Retention Policy

**Legal Retention Requirements:**

- **Claims Data:** 7 years (insurance industry standard)
- **Audit Logs:** 10 years (POPIA compliance)
- **Financial Records:** 7 years (tax compliance)

**Archive Storage:**

Deleted tenant data archived to Glacier Deep Archive:

```bash
aws s3 cp /tmp/tenant-1-archive.tar.gz.enc \
  s3://kinga-tenant-archives/tenant-1-2026-02-11.tar.gz.enc \
  --storage-class DEEP_ARCHIVE \
  --metadata "TenantId=1,DeletionDate=2026-02-11,RetentionYears=7"
```

**Archive Encryption:**

Archives encrypted with a separate long-term retention key:

```bash
# Encrypt archive with retention key
openssl enc -aes-256-cbc \
  -in tenant-1-archive.tar.gz \
  -out tenant-1-archive.tar.gz.enc \
  -pass pass:$(aws kms decrypt --ciphertext-blob fileb://retention-key.enc --query Plaintext --output text | base64 -d)
```

---

## 9. Compliance Alignment

### 9.1 POPIA Compliance

The architecture aligns with South Africa's Protection of Personal Information Act (POPIA):

| POPIA Principle | Architectural Control |
|---|---|
| **Accountability** | Tenant-specific audit logs, data processing agreements |
| **Processing Limitation** | Purpose-specific data collection, consent management |
| **Purpose Specification** | Data usage policies per tenant, role-based access |
| **Further Processing Limitation** | Cross-tenant analytics only with anonymization |
| **Information Quality** | Data validation, integrity checks |
| **Openness** | Tenant admin dashboards, data access logs |
| **Security Safeguards** | Encryption-at-rest, encryption-in-transit, tenant isolation |
| **Data Subject Participation** | Claimant data access, correction, deletion workflows |

**POPIA Compliance Evidence:**

```sql
-- Data processing audit trail
SELECT 
  tenant_id,
  user_id,
  action,
  resource_type,
  created_at
FROM public.audit_log
WHERE tenant_id = 1
  AND action IN ('DATA_ACCESSED', 'DATA_MODIFIED', 'DATA_DELETED')
ORDER BY created_at DESC;
```

### 9.2 GDPR Compliance

For international insurers, the architecture supports GDPR requirements:

| GDPR Principle | Architectural Control |
|---|---|
| **Lawfulness, Fairness, Transparency** | Consent management, privacy notices |
| **Purpose Limitation** | Data minimization, purpose-specific processing |
| **Data Minimization** | Only collect necessary fields, anonymize analytics |
| **Accuracy** | Data validation, correction workflows |
| **Storage Limitation** | Automated data deletion, retention policies |
| **Integrity and Confidentiality** | Encryption, access controls, audit logging |
| **Accountability** | Data protection impact assessments, audit trails |

**GDPR Rights Implementation:**

- **Right to Access:** Tenant admin dashboard with data export
- **Right to Rectification:** Data correction workflows
- **Right to Erasure:** Automated offboarding with complete deletion
- **Right to Data Portability:** JSON/CSV export functionality
- **Right to Object:** Opt-out mechanisms for analytics

---

## 10. Deployment Strategy

### 10.1 Infrastructure as Code (Terraform)

All tenant infrastructure provisioned via Terraform:

```hcl
# terraform/modules/tenant/main.tf
module "tenant" {
  source = "./modules/tenant"
  
  tenant_id   = var.tenant_id
  tenant_name = var.tenant_name
  tenant_slug = var.tenant_slug
  
  # Database
  postgres_instance_class = "db.r6g.xlarge"
  postgres_storage_gb     = 500
  
  # Analytics
  clickhouse_instance_type = "m6i.2xlarge"
  clickhouse_storage_gb    = 1000
  
  # Storage
  s3_bucket_name = "kinga-tenant-${var.tenant_id}-${var.tenant_slug}"
  
  # Encryption
  kms_key_alias = "alias/kinga-tenant-${var.tenant_id}-${var.tenant_slug}-cmk"
  
  # Networking
  vpc_id     = var.vpc_id
  subnet_ids = var.subnet_ids
  
  tags = {
    TenantId   = var.tenant_id
    TenantName = var.tenant_name
    Environment = "production"
  }
}
```

### 10.2 Kubernetes Deployment

Application layer deployed on Kubernetes with tenant-aware routing:

```yaml
# kubernetes/tenant-routing.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: kinga-tenant-routing
spec:
  rules:
  - host: tenant-1.kinga.io
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: kinga-app
            port:
              number: 3000
  - host: tenant-2.kinga.io
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: kinga-app
            port:
              number: 3000
```

### 10.3 Monitoring and Alerting

Tenant-specific monitoring dashboards:

```yaml
# prometheus/tenant-alerts.yaml
groups:
- name: tenant_isolation
  rules:
  - alert: CrossTenantAccessAttempt
    expr: rate(cross_tenant_access_attempts_total[5m]) > 0
    for: 1m
    labels:
      severity: critical
    annotations:
      summary: "Cross-tenant access attempt detected"
      description: "Tenant {{ $labels.tenant_id }} attempted to access data from tenant {{ $labels.target_tenant_id }}"
  
  - alert: TenantEncryptionKeyUnauthorizedAccess
    expr: rate(kms_unauthorized_access_total[5m]) > 0
    for: 1m
    labels:
      severity: critical
    annotations:
      summary: "Unauthorized encryption key access"
      description: "Unauthorized access to encryption key for tenant {{ $labels.tenant_id }}"
```

---

## 11. Implementation Roadmap

### Phase 1: Database Multi-Tenancy (Week 1-2)
- [ ] Implement schema-per-tenant provisioning
- [ ] Apply RLS policies to all tables
- [ ] Create tenant context middleware
- [ ] Update all tRPC routers for tenant filtering
- [ ] Test tenant isolation with penetration testing

### Phase 2: Encryption and Key Management (Week 3)
- [ ] Provision KMS keys per tenant
- [ ] Enable database encryption with tenant keys
- [ ] Enable S3 encryption with tenant keys
- [ ] Implement key rotation automation
- [ ] Test key access auditing

### Phase 3: Analytics and Storage Isolation (Week 4-5)
- [ ] Provision ClickHouse instances per tenant
- [ ] Implement Kafka-based data replication
- [ ] Create S3 buckets per tenant with IAM policies
- [ ] Implement anonymized analytics database
- [ ] Test cross-tenant analytics with anonymization

### Phase 4: Onboarding/Offboarding Automation (Week 6)
- [ ] Build tenant onboarding CLI tool
- [ ] Build tenant offboarding CLI tool
- [ ] Implement data export for legal retention
- [ ] Test complete onboarding/offboarding workflow
- [ ] Document tenant lifecycle procedures

### Phase 5: Compliance and Audit (Week 7-8)
- [ ] Implement POPIA compliance controls
- [ ] Implement GDPR compliance controls
- [ ] Build tenant admin compliance dashboard
- [ ] Conduct third-party security audit
- [ ] Generate compliance certification

---

## 12. Security Considerations

### 12.1 Threat Model

| Threat | Mitigation |
|---|---|
| **Cross-Tenant Data Access** | RLS policies, application-level filtering, audit logging |
| **Encryption Key Compromise** | KMS key rotation, access auditing, IAM policies |
| **SQL Injection** | Parameterized queries, ORM usage, input validation |
| **Privilege Escalation** | RBAC enforcement, least privilege principle |
| **Data Exfiltration** | S3 bucket policies, network segmentation, DLP controls |
| **Insider Threat** | Audit logging, separation of duties, background checks |

### 12.2 Penetration Testing

Quarterly penetration testing focused on tenant isolation:

```bash
# Test cross-tenant access via SQL injection
curl -X POST https://api.kinga.io/trpc/claims.list \
  -H "Authorization: Bearer TENANT_1_TOKEN" \
  -d '{"tenantId": "2 OR 1=1"}' # Should be blocked

# Test cross-tenant file access
curl https://s3.amazonaws.com/kinga-tenant-2-liberty-holdings/claim-123.jpg \
  -H "Authorization: Bearer TENANT_1_TOKEN" # Should return 403 Forbidden
```

---

## 13. Conclusion

The hybrid multi-tenant data architecture for KINGA balances operational efficiency through shared infrastructure with strict tenant isolation through schema-per-insurer databases, tenant-specific encryption keys, and segregated file storage. The architecture enables cross-tenant anonymized analytics for platform-wide insights while ensuring compliance with POPIA and GDPR requirements. Automated onboarding and offboarding workflows ensure scalable tenant lifecycle management with comprehensive data deletion capabilities. The architecture is production-ready and can scale to support hundreds of insurance companies on a single platform instance.

---

**Document Control:**
- **Next Review Date:** August 11, 2026
- **Approval Required:** CTO, CISO, Legal Counsel
- **Related Documents:** 
  - KINGA-MTDA-2026-008 (Multi-Tenant Dashboard Architecture)
  - KINGA-ITAP-2026-005 (Insurer Technical Assurance Pack)
  - KINGA-AIMGP-2026-010 (AI Model Governance Policies)
