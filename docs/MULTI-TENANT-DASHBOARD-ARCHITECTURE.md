# KINGA Multi-Tenant Dashboard Architecture

**Prepared by:** Tavonga Shoko, Platform Architect  
**Date:** February 11, 2026  
**Document Reference:** KINGA-MTDA-2026-008  
**Classification:** Internal — Architecture & Security

---

## Executive Summary

This document specifies a comprehensive secure multi-tenant dashboard architecture for the KINGA AutoVerify platform. The architecture ensures strict insurer data isolation through a combination of logical and physical segregation strategies, implements granular role-based access control (RBAC) across six user personas, provides comprehensive audit logging of all dashboard access, enforces data masking and anonymization controls, supports tenant-level encryption keys, enables scalable tenant onboarding, segregates real-time analytics processing, and establishes a secure API access layer. The design aligns with POPIA (Protection of Personal Information Act) and GDPR-style data protection requirements while maintaining high performance and operational efficiency.

---

## 1. Architecture Overview

### 1.1 Multi-Tenancy Model

KINGA employs a **hybrid multi-tenancy model** combining logical and physical isolation strategies:

| Isolation Layer | Strategy | Implementation |
|---|---|---|
| **Application Layer** | Logical isolation | Tenant ID filtering in all queries, middleware-enforced context |
| **Database Layer** | Schema-per-tenant | Dedicated PostgreSQL schemas for each insurer with row-level security (RLS) |
| **Analytics Layer** | Physical isolation | Separate ClickHouse instances per insurer for real-time analytics |
| **Storage Layer** | Bucket-per-tenant | Dedicated S3 buckets with tenant-specific encryption keys |
| **Compute Layer** | Shared with resource limits | Kubernetes namespaces with resource quotas and network policies |

### 1.2 Tenant Hierarchy

```
Platform (KINGA)
├── Tenant (Insurer A)
│   ├── Organizational Units
│   │   ├── Claims Department
│   │   ├── Fraud Investigation Unit
│   │   └── Finance Department
│   ├── Users
│   │   ├── Claimants (external)
│   │   ├── Assessors (internal)
│   │   ├── Fraud Analysts (internal)
│   │   └── Administrators (internal)
│   └── Data Domains
│       ├── Claims Data
│       ├── Fraud Indicators
│       ├── Financial Records
│       └── Audit Logs
├── Tenant (Insurer B)
│   └── [Same structure]
└── Platform Administrator (KINGA Operations)
    └── Cross-tenant monitoring (anonymized)
```

### 1.3 Architecture Diagram Description

**Layer 1: Edge Security**
- **API Gateway** (Kong/AWS API Gateway): Rate limiting, IP whitelisting, DDoS protection, JWT validation
- **WAF** (Web Application Firewall): SQL injection prevention, XSS filtering, bot detection
- **CDN** (CloudFlare): Static asset caching, geographic distribution, TLS termination

**Layer 2: Application Layer**
- **Load Balancer** (NGINX/ALB): Distributes traffic across application pods
- **Web Application Pods** (Node.js/Express): Stateless application servers with tenant context middleware
- **Tenant Context Middleware**: Extracts tenant ID from JWT, validates tenant access, injects tenant context into request
- **RBAC Enforcement Layer**: Validates user roles and permissions before route execution

**Layer 3: Data Access Layer**
- **tRPC API Layer**: Type-safe API procedures with tenant-scoped queries
- **Database Connection Pool**: Per-tenant connection pools with schema isolation
- **Cache Layer** (Redis): Tenant-partitioned cache with TTL-based invalidation
- **Search Index** (Elasticsearch): Tenant-scoped indexes for full-text search

**Layer 4: Data Storage Layer**
- **Primary Database** (PostgreSQL): Schema-per-tenant with row-level security policies
- **Analytics Database** (ClickHouse): Separate instances per tenant for real-time analytics
- **Object Storage** (S3): Bucket-per-tenant with server-side encryption using tenant-specific KMS keys
- **Audit Log Storage** (S3 + Loki): Immutable append-only logs with 7-year retention

**Layer 5: Processing Layer**
- **Event Bus** (Kafka): Tenant-partitioned topics for asynchronous processing
- **Worker Pods** (Node.js): Background job processors with tenant context
- **AI/ML Services**: Tenant-isolated model inference with dedicated compute resources
- **Analytics Engine**: Real-time aggregation and dashboard data generation

**Layer 6: Monitoring & Observability**
- **Metrics** (Prometheus): Tenant-labeled metrics with aggregation rules
- **Logs** (Loki): Tenant-tagged logs with access control
- **Traces** (Jaeger): Distributed tracing with tenant correlation IDs
- **Dashboards** (Grafana): Tenant-specific dashboards with data source isolation

---

## 2. Data Isolation Strategy

### 2.1 Database Isolation (Schema-per-Tenant)

**Implementation:**

Each insurer tenant receives a dedicated PostgreSQL schema:

```sql
-- Tenant schema creation
CREATE SCHEMA tenant_insurer_a;
CREATE SCHEMA tenant_insurer_b;

-- Grant permissions
GRANT USAGE ON SCHEMA tenant_insurer_a TO app_user_insurer_a;
GRANT ALL ON ALL TABLES IN SCHEMA tenant_insurer_a TO app_user_insurer_a;

-- Row-level security policy
ALTER TABLE tenant_insurer_a.claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON tenant_insurer_a.claims
  USING (tenant_id = current_setting('app.current_tenant')::uuid);
```

**Advantages:**
- Strong logical isolation with PostgreSQL's native schema boundaries
- Simplified backup and restore (schema-level dumps)
- Independent schema migrations per tenant
- Performance isolation through dedicated indexes

**Query Pattern:**

```typescript
// Tenant context middleware sets search_path
await db.execute(`SET search_path TO tenant_${tenantId}, public`);

// All subsequent queries automatically scoped to tenant schema
const claims = await db.select().from(claims).where(eq(claims.status, 'pending'));
```

### 2.2 Analytics Isolation (Instance-per-Tenant)

**Implementation:**

Each insurer receives a dedicated ClickHouse instance for real-time analytics:

```yaml
# Kubernetes StatefulSet per tenant
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: clickhouse-insurer-a
  namespace: analytics-insurer-a
spec:
  serviceName: clickhouse-insurer-a
  replicas: 3
  selector:
    matchLabels:
      app: clickhouse
      tenant: insurer-a
  template:
    spec:
      containers:
      - name: clickhouse
        image: clickhouse/clickhouse-server:latest
        resources:
          requests:
            memory: "16Gi"
            cpu: "4"
          limits:
            memory: "32Gi"
            cpu: "8"
        volumeMounts:
        - name: data
          mountPath: /var/lib/clickhouse
  volumeClaimTemplates:
  - metadata:
      name: data
    spec:
      accessModes: ["ReadWriteOnce"]
      resources:
        requests:
          storage: 500Gi
```

**Advantages:**
- Complete physical isolation of analytics workloads
- Independent scaling based on tenant usage patterns
- No cross-tenant query interference
- Tenant-specific performance tuning

### 2.3 Storage Isolation (Bucket-per-Tenant)

**Implementation:**

Each insurer receives dedicated S3 buckets with tenant-specific KMS keys:

```typescript
// S3 bucket naming convention
const bucketName = `kinga-${tenantId}-claims-documents`;

// Tenant-specific KMS key
const kmsKeyId = `arn:aws:kms:us-east-1:ACCOUNT_ID:key/${tenantId}-encryption-key`;

// Upload with server-side encryption
await s3.putObject({
  Bucket: bucketName,
  Key: `claims/${claimId}/image.jpg`,
  Body: fileBuffer,
  ServerSideEncryption: 'aws:kms',
  SSEKMSKeyId: kmsKeyId,
  Metadata: {
    'tenant-id': tenantId,
    'uploaded-by': userId,
    'upload-timestamp': new Date().toISOString()
  }
});
```

**Bucket Policy (Tenant-Scoped):**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyAccessFromOtherTenants",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::kinga-insurer-a-claims-documents",
        "arn:aws:s3:::kinga-insurer-a-claims-documents/*"
      ],
      "Condition": {
        "StringNotEquals": {
          "aws:PrincipalTag/tenant-id": "insurer-a"
        }
      }
    }
  ]
}
```

### 2.4 Cache Isolation (Tenant-Partitioned Redis)

**Implementation:**

Redis keys are prefixed with tenant IDs to ensure logical isolation:

```typescript
// Cache key naming convention
const cacheKey = `tenant:${tenantId}:claims:${claimId}`;

// Set with tenant-scoped TTL
await redis.setex(cacheKey, 3600, JSON.stringify(claimData));

// Flush tenant cache
await redis.del(await redis.keys(`tenant:${tenantId}:*`));
```

### 2.5 Event Stream Isolation (Tenant-Partitioned Kafka)

**Implementation:**

Kafka topics are partitioned by tenant ID:

```typescript
// Topic naming convention
const topic = `claims-events-${tenantId}`;

// Produce event with tenant context
await kafka.producer.send({
  topic,
  messages: [
    {
      key: claimId,
      value: JSON.stringify({
        event_type: 'claim_submitted',
        tenant_id: tenantId,
        claim_id: claimId,
        timestamp: new Date().toISOString(),
        payload: claimData
      }),
      headers: {
        'tenant-id': tenantId,
        'correlation-id': correlationId
      }
    }
  ]
});
```

---

## 3. Role-Based Access Control (RBAC)

### 3.1 Access Control Matrix

| Role | Claimant | Assessor | Panel Beater | Insurer Admin | Fraud Analyst | Platform Admin |
|---|---|---|---|---|---|---|
| **Scope** | Own claims | Assigned claims | Own quotes | Tenant-wide | Tenant-wide | Platform-wide |
| **View Claims** | Own only | Assigned | Related | All | All | All (anonymized) |
| **Submit Claims** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Assess Claims** | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ |
| **Submit Quotes** | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| **Approve Quotes** | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ |
| **View Fraud Scores** | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ (anonymized) |
| **Flag Fraud** | ❌ | ✅ | ❌ | ✅ | ✅ | ❌ |
| **View Analytics** | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ (aggregated) |
| **Manage Users** | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ |
| **Configure Workflows** | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ |
| **Access Audit Logs** | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| **Export Data** | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |
| **Tenant Onboarding** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

### 3.2 Permission Model

**Hierarchical Permission Structure:**

```typescript
// Permission definition
interface Permission {
  resource: string;        // e.g., 'claims', 'users', 'analytics'
  action: string;          // e.g., 'read', 'write', 'delete', 'export'
  scope: 'own' | 'assigned' | 'tenant' | 'platform';
  conditions?: {
    field: string;
    operator: 'eq' | 'ne' | 'in' | 'not_in';
    value: any;
  }[];
}

// Role definition
interface Role {
  id: string;
  name: string;
  tenant_id: string | null;  // null for platform-wide roles
  permissions: Permission[];
  inherits_from?: string[];  // Role inheritance
}

// Example: Assessor role
const assessorRole: Role = {
  id: 'assessor',
  name: 'Claims Assessor',
  tenant_id: 'insurer-a',
  permissions: [
    {
      resource: 'claims',
      action: 'read',
      scope: 'assigned',
      conditions: [
        { field: 'assessor_id', operator: 'eq', value: '{{user.id}}' }
      ]
    },
    {
      resource: 'claims',
      action: 'write',
      scope: 'assigned',
      conditions: [
        { field: 'assessor_id', operator: 'eq', value: '{{user.id}}' },
        { field: 'status', operator: 'in', value: ['pending_assessment', 'under_review'] }
      ]
    },
    {
      resource: 'fraud_indicators',
      action: 'read',
      scope: 'assigned'
    }
  ]
};
```

### 3.3 RBAC Enforcement Middleware

```typescript
// server/_core/rbac-middleware.ts

import { TRPCError } from '@trpc/server';
import { Context } from './context';

export function requirePermission(
  resource: string,
  action: string,
  scope: 'own' | 'assigned' | 'tenant' | 'platform'
) {
  return async (ctx: Context) => {
    const { user, tenant } = ctx;
    
    if (!user) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Authentication required' });
    }
    
    // Check if user has required permission
    const hasPermission = await checkUserPermission(user.id, tenant?.id, resource, action, scope);
    
    if (!hasPermission) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `Insufficient permissions: ${action} on ${resource}`
      });
    }
    
    return ctx;
  };
}

async function checkUserPermission(
  userId: string,
  tenantId: string | undefined,
  resource: string,
  action: string,
  scope: string
): Promise<boolean> {
  // Get user roles
  const userRoles = await db.select()
    .from(userRoles)
    .where(eq(userRoles.userId, userId));
  
  // Check each role's permissions
  for (const userRole of userRoles) {
    const role = await db.select()
      .from(roles)
      .where(eq(roles.id, userRole.roleId))
      .limit(1);
    
    if (!role[0]) continue;
    
    // Verify tenant context matches
    if (role[0].tenantId && role[0].tenantId !== tenantId) {
      continue;
    }
    
    // Check permissions
    const permissions = role[0].permissions as Permission[];
    const hasPermission = permissions.some(p =>
      p.resource === resource &&
      p.action === action &&
      (p.scope === scope || p.scope === 'platform')
    );
    
    if (hasPermission) {
      return true;
    }
  }
  
  return false;
}
```

### 3.4 Row-Level Security (RLS) Integration

**PostgreSQL RLS Policies:**

```sql
-- Enable RLS on claims table
ALTER TABLE tenant_insurer_a.claims ENABLE ROW LEVEL SECURITY;

-- Policy: Claimants can only see their own claims
CREATE POLICY claimant_own_claims ON tenant_insurer_a.claims
  FOR SELECT
  USING (
    claimant_id = current_setting('app.current_user_id')::uuid
    AND current_setting('app.current_user_role') = 'claimant'
  );

-- Policy: Assessors can see assigned claims
CREATE POLICY assessor_assigned_claims ON tenant_insurer_a.claims
  FOR SELECT
  USING (
    assessor_id = current_setting('app.current_user_id')::uuid
    AND current_setting('app.current_user_role') = 'assessor'
  );

-- Policy: Insurer admins can see all claims
CREATE POLICY admin_all_claims ON tenant_insurer_a.claims
  FOR ALL
  USING (
    current_setting('app.current_user_role') IN ('insurer_admin', 'fraud_analyst')
  );
```

**Application Integration:**

```typescript
// Set RLS context before queries
await db.execute(`
  SET app.current_user_id = '${userId}';
  SET app.current_user_role = '${userRole}';
  SET app.current_tenant = '${tenantId}';
`);

// Query automatically filtered by RLS policies
const claims = await db.select().from(claims);
```

---

## 4. Audit Logging

### 4.1 Audit Event Schema

```typescript
interface DashboardAuditEvent {
  event_id: string;
  timestamp: string;
  tenant_id: string;
  user_id: string;
  user_email: string;
  user_role: string;
  ip_address: string;
  user_agent: string;
  session_id: string;
  event_type: 'dashboard_access' | 'data_export' | 'configuration_change' | 'permission_change';
  resource_type: 'claim' | 'user' | 'analytics' | 'configuration';
  resource_id: string;
  action: 'view' | 'create' | 'update' | 'delete' | 'export';
  status: 'success' | 'failure' | 'denied';
  failure_reason?: string;
  request_payload?: Record<string, any>;
  response_summary?: Record<string, any>;
  data_accessed?: {
    table: string;
    row_count: number;
    columns: string[];
    filters: Record<string, any>;
  };
  correlation_id: string;
}
```

### 4.2 Dashboard Access Logging

**Automatic Logging Middleware:**

```typescript
// server/_core/audit-middleware.ts

import { logAuditEvent, createAuditEvent } from './audit-logger';

export function auditDashboardAccess() {
  return async (ctx: Context, next: () => Promise<void>) => {
    const startTime = Date.now();
    const correlationId = crypto.randomUUID();
    
    try {
      await next();
      
      // Log successful access
      const auditEvent = createAuditEvent(
        'dashboard_access',
        {
          user_id: ctx.user.id,
          email: ctx.user.email,
          role: ctx.user.role,
          ip_address: ctx.req.ip
        },
        {
          type: 'dashboard',
          identifier: ctx.req.path,
          version: ctx.tenant?.id || 'platform'
        },
        'view',
        'success',
        {
          duration_ms: Date.now() - startTime,
          user_agent: ctx.req.headers['user-agent'],
          session_id: ctx.session?.id
        },
        correlationId
      );
      
      logAuditEvent(auditEvent);
    } catch (error) {
      // Log failed access
      const auditEvent = createAuditEvent(
        'dashboard_access',
        {
          user_id: ctx.user?.id || 'anonymous',
          email: ctx.user?.email || 'unknown',
          role: ctx.user?.role || 'none',
          ip_address: ctx.req.ip
        },
        {
          type: 'dashboard',
          identifier: ctx.req.path,
          version: ctx.tenant?.id || 'platform'
        },
        'view',
        'failure',
        {
          duration_ms: Date.now() - startTime,
          error_message: error.message,
          error_code: error.code
        },
        correlationId
      );
      
      logAuditEvent(auditEvent);
      throw error;
    }
  };
}
```

### 4.3 Data Export Logging

```typescript
// Log all data exports with full details
export async function logDataExport(
  userId: string,
  tenantId: string,
  resourceType: string,
  filters: Record<string, any>,
  rowCount: number,
  columns: string[]
): Promise<void> {
  const auditEvent: DashboardAuditEvent = {
    event_id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    tenant_id: tenantId,
    user_id: userId,
    user_email: user.email,
    user_role: user.role,
    ip_address: req.ip,
    user_agent: req.headers['user-agent'],
    session_id: session.id,
    event_type: 'data_export',
    resource_type: resourceType as any,
    resource_id: `export-${Date.now()}`,
    action: 'export',
    status: 'success',
    data_accessed: {
      table: resourceType,
      row_count: rowCount,
      columns: columns,
      filters: filters
    },
    correlation_id: crypto.randomUUID()
  };
  
  logAuditEvent(auditEvent);
}
```

### 4.4 Audit Log Retention & Access Control

**Retention Policy:**
- **Local Filesystem**: 90 days (rotated daily)
- **Loki (Centralized)**: 365 days (searchable)
- **S3 (Immutable Archive)**: 7 years (WORM compliance)

**Access Control:**
- **Tenant Admins**: Can view audit logs for their own tenant only
- **Fraud Analysts**: Can view audit logs for fraud-related events within their tenant
- **Platform Admins**: Can view aggregated audit logs across all tenants (anonymized)
- **Compliance Officers**: Full access to all audit logs for compliance investigations

**Query Interface:**

```typescript
// Tenant-scoped audit log query
const auditLogs = await db.select()
  .from(auditLogs)
  .where(
    and(
      eq(auditLogs.tenantId, tenantId),
      gte(auditLogs.timestamp, startDate),
      lte(auditLogs.timestamp, endDate)
    )
  )
  .orderBy(desc(auditLogs.timestamp))
  .limit(1000);
```

---

## 5. Data Masking & Anonymization

### 5.1 Field-Level Masking Rules

| Field Type | Masking Strategy | Example |
|---|---|---|
| **Email Address** | Partial masking | `john.doe@example.com` → `j***@example.com` |
| **Phone Number** | Last 4 digits only | `+27 82 123 4567` → `****4567` |
| **ID Number** | First 2 and last 2 digits | `8501015800089` → `85*********89` |
| **Bank Account** | Last 4 digits only | `1234567890` → `******7890` |
| **Address** | City and postal code only | `123 Main St, Sandton, 2196` → `Sandton, 2196` |
| **Vehicle VIN** | Last 6 characters | `1HGBH41JXMN109186` → `*********109186` |
| **Claim Amount** | Rounded to nearest R1000 | `R 45,678` → `R 46,000` |

### 5.2 Role-Based Data Visibility

```typescript
// Data masking based on user role
function maskSensitiveData(data: any, userRole: string): any {
  const maskingRules = {
    claimant: ['email', 'phone'],
    assessor: [],  // Full access
    panel_beater: ['email', 'phone', 'id_number'],
    insurer_admin: [],  // Full access
    fraud_analyst: [],  // Full access
    platform_admin: ['email', 'phone', 'id_number', 'bank_account', 'address']  // Anonymized
  };
  
  const fieldsToMask = maskingRules[userRole] || [];
  
  return {
    ...data,
    email: fieldsToMask.includes('email') ? maskEmail(data.email) : data.email,
    phone: fieldsToMask.includes('phone') ? maskPhone(data.phone) : data.phone,
    id_number: fieldsToMask.includes('id_number') ? maskIdNumber(data.id_number) : data.id_number,
    bank_account: fieldsToMask.includes('bank_account') ? maskBankAccount(data.bank_account) : data.bank_account,
    address: fieldsToMask.includes('address') ? maskAddress(data.address) : data.address
  };
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  return `${local[0]}***@${domain}`;
}

function maskPhone(phone: string): string {
  return `****${phone.slice(-4)}`;
}

function maskIdNumber(idNumber: string): string {
  return `${idNumber.slice(0, 2)}*********${idNumber.slice(-2)}`;
}

function maskBankAccount(account: string): string {
  return `******${account.slice(-4)}`;
}

function maskAddress(address: string): string {
  // Extract city and postal code only
  const parts = address.split(',');
  return parts.length >= 2 ? `${parts[parts.length - 2].trim()}, ${parts[parts.length - 1].trim()}` : address;
}
```

### 5.3 Anonymization for Cross-Tenant Analytics

**Platform-level analytics use anonymized data:**

```typescript
// Anonymize data for platform-wide analytics
function anonymizeForPlatformAnalytics(claim: Claim): AnonymizedClaim {
  return {
    claim_id: hashId(claim.id),  // One-way hash
    tenant_id: hashId(claim.tenant_id),  // One-way hash
    claim_date: claim.created_at,
    claim_amount_bucket: Math.floor(claim.estimated_cost / 10000) * 10000,  // Bucket to nearest R10k
    claim_type: claim.claim_type,
    fraud_score_bucket: Math.floor(claim.fraud_score / 10) * 10,  // Bucket to nearest 10
    assessment_duration_hours: Math.floor(claim.assessment_duration / 3600),
    status: claim.status,
    region: extractRegion(claim.location),  // City-level only
    vehicle_make: claim.vehicle_make,
    vehicle_age_years: Math.floor(claim.vehicle_age / 365)
  };
}

function hashId(id: string): string {
  return crypto.createHash('sha256').update(id).digest('hex').substring(0, 16);
}
```

---

## 6. Tenant-Level Encryption

### 6.1 Encryption Key Management

**Key Hierarchy:**

```
Platform Master Key (AWS KMS)
├── Tenant A Encryption Key (DEK)
│   ├── Database Encryption Key
│   ├── S3 Bucket Encryption Key
│   └── Application-Level Encryption Key
├── Tenant B Encryption Key (DEK)
│   └── [Same structure]
└── Platform Encryption Key (for shared resources)
```

### 6.2 Tenant Key Generation

```typescript
// Generate tenant-specific encryption key
async function generateTenantEncryptionKey(tenantId: string): Promise<string> {
  // Create KMS key for tenant
  const kmsKey = await kms.createKey({
    Description: `KINGA Tenant Encryption Key - ${tenantId}`,
    KeyUsage: 'ENCRYPT_DECRYPT',
    Origin: 'AWS_KMS',
    MultiRegion: false,
    Tags: [
      { TagKey: 'tenant-id', TagValue: tenantId },
      { TagKey: 'purpose', TagValue: 'tenant-data-encryption' },
      { TagKey: 'managed-by', TagValue: 'kinga-platform' }
    ]
  }).promise();
  
  // Create alias for easy reference
  await kms.createAlias({
    AliasName: `alias/kinga-tenant-${tenantId}`,
    TargetKeyId: kmsKey.KeyMetadata.KeyId
  }).promise();
  
  // Store key ID in tenant record
  await db.update(tenants)
    .set({ encryption_key_id: kmsKey.KeyMetadata.KeyId })
    .where(eq(tenants.id, tenantId));
  
  return kmsKey.KeyMetadata.KeyId;
}
```

### 6.3 Data Encryption at Rest

**Database Encryption:**

```sql
-- Enable transparent data encryption (TDE) per schema
ALTER DATABASE kinga SET default_tablespace = encrypted_tablespace;

-- Create encrypted tablespace for tenant
CREATE TABLESPACE tenant_insurer_a_encrypted
  LOCATION '/var/lib/postgresql/data/tenant_insurer_a'
  ENCRYPTION = 'aes256'
  ENCRYPTION_KEY = '{{tenant_encryption_key}}';

-- Assign tablespace to tenant schema
ALTER SCHEMA tenant_insurer_a SET default_tablespace = tenant_insurer_a_encrypted;
```

**S3 Encryption:**

```typescript
// Upload with tenant-specific KMS key
await s3.putObject({
  Bucket: `kinga-${tenantId}-claims-documents`,
  Key: fileKey,
  Body: fileBuffer,
  ServerSideEncryption: 'aws:kms',
  SSEKMSKeyId: tenantEncryptionKeyId,
  BucketKeyEnabled: true  // Reduce KMS API calls
});
```

### 6.4 Application-Level Encryption (Sensitive Fields)

```typescript
// Encrypt sensitive fields before storing
import { encrypt, decrypt } from './encryption';

async function storeSensitiveData(tenantId: string, data: any): Promise<void> {
  const encryptionKey = await getTenantEncryptionKey(tenantId);
  
  const encryptedData = {
    ...data,
    id_number: encrypt(data.id_number, encryptionKey),
    bank_account: encrypt(data.bank_account, encryptionKey),
    medical_info: encrypt(JSON.stringify(data.medical_info), encryptionKey)
  };
  
  await db.insert(sensitiveData).values(encryptedData);
}

async function retrieveSensitiveData(tenantId: string, id: string): Promise<any> {
  const encryptionKey = await getTenantEncryptionKey(tenantId);
  const data = await db.select().from(sensitiveData).where(eq(sensitiveData.id, id)).limit(1);
  
  return {
    ...data[0],
    id_number: decrypt(data[0].id_number, encryptionKey),
    bank_account: decrypt(data[0].bank_account, encryptionKey),
    medical_info: JSON.parse(decrypt(data[0].medical_info, encryptionKey))
  };
}
```

### 6.5 Key Rotation

```typescript
// Rotate tenant encryption key annually
async function rotateTenantEncryptionKey(tenantId: string): Promise<void> {
  const oldKeyId = await getTenantEncryptionKeyId(tenantId);
  const newKeyId = await generateTenantEncryptionKey(tenantId);
  
  // Re-encrypt all data with new key
  await reEncryptTenantData(tenantId, oldKeyId, newKeyId);
  
  // Schedule old key for deletion (30-day grace period)
  await kms.scheduleKeyDeletion({
    KeyId: oldKeyId,
    PendingWindowInDays: 30
  }).promise();
  
  // Log key rotation event
  logAuditEvent(createAuditEvent(
    'configuration_change',
    { user_id: 'system', email: 'system@kinga.ai', role: 'system', ip_address: 'internal' },
    { type: 'configuration', identifier: 'encryption-key', version: tenantId },
    'rotate_encryption_key',
    'success',
    { old_key_id: oldKeyId, new_key_id: newKeyId }
  ));
}
```

---

## 7. Scalable Tenant Onboarding

### 7.1 Onboarding Workflow

```
1. Tenant Registration
   ├── Collect insurer details (name, contact, industry, size)
   ├── Generate unique tenant ID
   └── Create tenant record in platform database

2. Infrastructure Provisioning
   ├── Create PostgreSQL schema
   ├── Deploy ClickHouse instance (Kubernetes StatefulSet)
   ├── Create S3 buckets (claims, documents, exports)
   ├── Generate tenant encryption keys (KMS)
   └── Configure network policies (Kubernetes)

3. Configuration
   ├── Set up RBAC roles and permissions
   ├── Configure workflow rules (approval chains, SLAs)
   ├── Set up notification channels (email, SMS, webhooks)
   └── Configure fraud detection thresholds

4. Data Migration (if applicable)
   ├── Import historical claims data
   ├── Import user accounts
   └── Validate data integrity

5. Integration Setup
   ├── Generate API keys
   ├── Configure SSO (SAML/OAuth)
   └── Set up webhooks for external systems

6. Testing & Validation
   ├── Run smoke tests
   ├── Validate data isolation
   └── Perform security scan

7. Go-Live
   ├── Enable tenant in production
   ├── Send onboarding confirmation
   └── Schedule training session
```

### 7.2 Automated Provisioning Script

```typescript
// scripts/tenant-onboarding/provision-tenant.ts

import { provisionDatabase } from './provision-database';
import { provisionAnalytics } from './provision-analytics';
import { provisionStorage } from './provision-storage';
import { provisionEncryption } from './provision-encryption';
import { provisionNetworking } from './provision-networking';

interface TenantOnboardingRequest {
  name: string;
  contact_email: string;
  industry: string;
  expected_claims_volume: number;
  regions: string[];
}

export async function provisionTenant(request: TenantOnboardingRequest): Promise<string> {
  console.log(`[Tenant Onboarding] Starting provisioning for ${request.name}...`);
  
  // 1. Generate tenant ID
  const tenantId = `tenant-${crypto.randomUUID()}`;
  console.log(`[Tenant Onboarding] Generated tenant ID: ${tenantId}`);
  
  // 2. Create tenant record
  await db.insert(tenants).values({
    id: tenantId,
    name: request.name,
    contact_email: request.contact_email,
    industry: request.industry,
    status: 'provisioning',
    created_at: new Date()
  });
  
  try {
    // 3. Provision database schema
    console.log(`[Tenant Onboarding] Provisioning database schema...`);
    await provisionDatabase(tenantId);
    
    // 4. Provision analytics instance
    console.log(`[Tenant Onboarding] Provisioning ClickHouse instance...`);
    await provisionAnalytics(tenantId, request.expected_claims_volume);
    
    // 5. Provision storage buckets
    console.log(`[Tenant Onboarding] Provisioning S3 buckets...`);
    await provisionStorage(tenantId);
    
    // 6. Generate encryption keys
    console.log(`[Tenant Onboarding] Generating encryption keys...`);
    const encryptionKeyId = await provisionEncryption(tenantId);
    
    // 7. Configure networking
    console.log(`[Tenant Onboarding] Configuring network policies...`);
    await provisionNetworking(tenantId);
    
    // 8. Update tenant status
    await db.update(tenants)
      .set({ status: 'active', provisioned_at: new Date() })
      .where(eq(tenants.id, tenantId));
    
    console.log(`[Tenant Onboarding] Provisioning complete for ${request.name}`);
    
    // 9. Send welcome email
    await sendTenantWelcomeEmail(request.contact_email, tenantId);
    
    return tenantId;
  } catch (error) {
    console.error(`[Tenant Onboarding] Provisioning failed:`, error);
    
    // Rollback
    await db.update(tenants)
      .set({ status: 'failed', error_message: error.message })
      .where(eq(tenants.id, tenantId));
    
    throw error;
  }
}
```

### 7.3 Tenant Offboarding & Data Retention

```typescript
// Offboard tenant (soft delete with data retention)
export async function offboardTenant(tenantId: string, retentionDays: number = 90): Promise<void> {
  console.log(`[Tenant Offboarding] Starting offboarding for ${tenantId}...`);
  
  // 1. Mark tenant as inactive
  await db.update(tenants)
    .set({ status: 'inactive', deactivated_at: new Date() })
    .where(eq(tenants.id, tenantId));
  
  // 2. Revoke all user access
  await db.update(users)
    .set({ status: 'deactivated' })
    .where(eq(users.tenantId, tenantId));
  
  // 3. Schedule data deletion
  const deletionDate = new Date();
  deletionDate.setDate(deletionDate.getDate() + retentionDays);
  
  await db.insert(tenantDeletionSchedule).values({
    tenant_id: tenantId,
    scheduled_deletion_date: deletionDate,
    status: 'pending'
  });
  
  console.log(`[Tenant Offboarding] Data will be deleted on ${deletionDate.toISOString()}`);
  
  // 4. Export data for tenant (compliance requirement)
  await exportTenantData(tenantId);
  
  // 5. Notify tenant admin
  await sendTenantOffboardingEmail(tenantId, deletionDate);
}
```

---

## 8. Real-Time Analytics Segregation

### 8.1 Analytics Architecture

**Per-Tenant ClickHouse Deployment:**

```yaml
# deployment/analytics/clickhouse-tenant-template.yaml

apiVersion: v1
kind: Namespace
metadata:
  name: analytics-{{TENANT_ID}}
  labels:
    tenant-id: {{TENANT_ID}}
    managed-by: kinga-platform

---

apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: clickhouse
  namespace: analytics-{{TENANT_ID}}
spec:
  serviceName: clickhouse
  replicas: 3
  selector:
    matchLabels:
      app: clickhouse
      tenant: {{TENANT_ID}}
  template:
    metadata:
      labels:
        app: clickhouse
        tenant: {{TENANT_ID}}
    spec:
      affinity:
        podAntiAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
          - labelSelector:
              matchExpressions:
              - key: app
                operator: In
                values:
                - clickhouse
            topologyKey: kubernetes.io/hostname
      containers:
      - name: clickhouse
        image: clickhouse/clickhouse-server:23.8
        ports:
        - containerPort: 8123
          name: http
        - containerPort: 9000
          name: native
        env:
        - name: CLICKHOUSE_DB
          value: {{TENANT_ID}}
        - name: CLICKHOUSE_USER
          value: {{TENANT_ID}}_user
        - name: CLICKHOUSE_PASSWORD
          valueFrom:
            secretKeyRef:
              name: clickhouse-credentials
              key: password
        resources:
          requests:
            memory: "16Gi"
            cpu: "4"
          limits:
            memory: "32Gi"
            cpu: "8"
        volumeMounts:
        - name: data
          mountPath: /var/lib/clickhouse
        - name: config
          mountPath: /etc/clickhouse-server/config.d
      volumes:
      - name: config
        configMap:
          name: clickhouse-config
  volumeClaimTemplates:
  - metadata:
      name: data
    spec:
      accessModes: ["ReadWriteOnce"]
      storageClassName: fast-ssd
      resources:
        requests:
          storage: 500Gi

---

apiVersion: v1
kind: Service
metadata:
  name: clickhouse
  namespace: analytics-{{TENANT_ID}}
spec:
  selector:
    app: clickhouse
    tenant: {{TENANT_ID}}
  ports:
  - name: http
    port: 8123
    targetPort: 8123
  - name: native
    port: 9000
    targetPort: 9000
  clusterIP: None
```

### 8.2 Data Pipeline (Kafka → ClickHouse)

```typescript
// Real-time data ingestion from Kafka to ClickHouse
import { Kafka } from 'kafkajs';
import { ClickHouse } from 'clickhouse';

const kafka = new Kafka({
  clientId: `kinga-analytics-${tenantId}`,
  brokers: ['kafka-broker-1:9092', 'kafka-broker-2:9092']
});

const clickhouse = new ClickHouse({
  url: `http://clickhouse.analytics-${tenantId}.svc.cluster.local`,
  port: 8123,
  basicAuth: {
    username: `${tenantId}_user`,
    password: process.env.CLICKHOUSE_PASSWORD
  },
  format: 'json'
});

const consumer = kafka.consumer({ groupId: `analytics-${tenantId}` });

await consumer.connect();
await consumer.subscribe({ topic: `claims-events-${tenantId}`, fromBeginning: false });

await consumer.run({
  eachBatch: async ({ batch }) => {
    const rows = batch.messages.map(message => {
      const event = JSON.parse(message.value.toString());
      return {
        event_id: event.event_id,
        timestamp: event.timestamp,
        claim_id: event.claim_id,
        event_type: event.event_type,
        claim_amount: event.payload.estimated_cost,
        fraud_score: event.payload.fraud_score,
        status: event.payload.status,
        region: extractRegion(event.payload.location)
      };
    });
    
    // Batch insert into ClickHouse
    await clickhouse.insert('claims_events', rows).toPromise();
  }
});
```

### 8.3 Analytics Queries (Tenant-Scoped)

```sql
-- Claims cost trend (last 30 days)
SELECT
  toDate(timestamp) AS date,
  count() AS claim_count,
  sum(claim_amount) AS total_cost,
  avg(claim_amount) AS avg_cost
FROM claims_events
WHERE
  timestamp >= now() - INTERVAL 30 DAY
  AND event_type = 'claim_submitted'
GROUP BY date
ORDER BY date DESC;

-- Fraud heatmap (by region)
SELECT
  region,
  count() AS claim_count,
  avg(fraud_score) AS avg_fraud_score,
  countIf(fraud_score > 70) AS high_risk_count
FROM claims_events
WHERE
  timestamp >= now() - INTERVAL 7 DAY
GROUP BY region
ORDER BY avg_fraud_score DESC;

-- Real-time dashboard metrics (updated every 5 seconds)
SELECT
  count() AS active_claims,
  countIf(status = 'pending_assessment') AS pending_assessment,
  countIf(status = 'under_review') AS under_review,
  countIf(fraud_score > 70) AS high_risk_claims,
  sum(claim_amount) AS total_exposure
FROM claims_events
WHERE
  timestamp >= now() - INTERVAL 1 HOUR;
```

### 8.4 Analytics API Layer (tRPC)

```typescript
// server/routers/analytics.ts (tenant-scoped)

export const analyticsRouter = router({
  getClaimsCostTrend: protectedProcedure
    .input(z.object({
      days: z.number().min(1).max(365).default(30)
    }))
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenant.id;
      const clickhouse = getClickHouseClient(tenantId);
      
      const result = await clickhouse.query(`
        SELECT
          toDate(timestamp) AS date,
          count() AS claim_count,
          sum(claim_amount) AS total_cost,
          avg(claim_amount) AS avg_cost
        FROM claims_events
        WHERE
          timestamp >= now() - INTERVAL ${input.days} DAY
          AND event_type = 'claim_submitted'
        GROUP BY date
        ORDER BY date DESC
      `).toPromise();
      
      return result.data;
    }),
  
  getFraudHeatmap: protectedProcedure
    .query(async ({ ctx }) => {
      const tenantId = ctx.tenant.id;
      const clickhouse = getClickHouseClient(tenantId);
      
      const result = await clickhouse.query(`
        SELECT
          region,
          count() AS claim_count,
          avg(fraud_score) AS avg_fraud_score,
          countIf(fraud_score > 70) AS high_risk_count
        FROM claims_events
        WHERE
          timestamp >= now() - INTERVAL 7 DAY
        GROUP BY region
        ORDER BY avg_fraud_score DESC
      `).toPromise();
      
      return result.data;
    })
});
```

---

## 9. Secure API Access Layer

### 9.1 API Gateway Architecture

**Kong API Gateway Configuration:**

```yaml
# kong/kong.yml

_format_version: "3.0"

services:
  - name: kinga-api
    url: http://kinga-backend.default.svc.cluster.local:3000
    routes:
      - name: api-route
        paths:
          - /api
        strip_path: false
    plugins:
      - name: rate-limiting
        config:
          minute: 100
          hour: 5000
          policy: redis
          redis_host: redis.default.svc.cluster.local
          redis_port: 6379
      
      - name: jwt
        config:
          key_claim_name: kid
          secret_is_base64: false
          claims_to_verify:
            - exp
            - iat
      
      - name: cors
        config:
          origins:
            - https://*.kinga.ai
            - https://*.manus.space
          methods:
            - GET
            - POST
            - PUT
            - DELETE
            - OPTIONS
          headers:
            - Authorization
            - Content-Type
            - X-Tenant-ID
          credentials: true
          max_age: 3600
      
      - name: request-transformer
        config:
          add:
            headers:
              - X-Forwarded-For:$remote_addr
              - X-Request-ID:$request_id
      
      - name: response-transformer
        config:
          remove:
            headers:
              - X-Powered-By
              - Server
          add:
            headers:
              - X-Content-Type-Options:nosniff
              - X-Frame-Options:DENY
              - X-XSS-Protection:1; mode=block
      
      - name: ip-restriction
        config:
          allow:
            - 0.0.0.0/0  # Allow all by default, restrict per tenant
      
      - name: bot-detection
        config:
          allow:
            - googlebot
            - bingbot
          deny:
            - scrapy
            - curl
            - wget
```

### 9.2 JWT Token Structure

```typescript
interface JWTPayload {
  // Standard claims
  iss: string;  // Issuer: 'kinga-platform'
  sub: string;  // Subject: user ID
  aud: string;  // Audience: 'kinga-api'
  exp: number;  // Expiration: Unix timestamp
  iat: number;  // Issued at: Unix timestamp
  jti: string;  // JWT ID: unique token ID
  
  // Custom claims
  tenant_id: string;
  user_email: string;
  user_role: string;
  permissions: string[];
  session_id: string;
  ip_address: string;
}

// Generate JWT
function generateJWT(user: User, tenant: Tenant): string {
  const payload: JWTPayload = {
    iss: 'kinga-platform',
    sub: user.id,
    aud: 'kinga-api',
    exp: Math.floor(Date.now() / 1000) + (60 * 60 * 8),  // 8 hours
    iat: Math.floor(Date.now() / 1000),
    jti: crypto.randomUUID(),
    tenant_id: tenant.id,
    user_email: user.email,
    user_role: user.role,
    permissions: user.permissions,
    session_id: session.id,
    ip_address: req.ip
  };
  
  return jwt.sign(payload, process.env.JWT_SECRET, { algorithm: 'HS256' });
}
```

### 9.3 API Key Management (for External Integrations)

```typescript
// Generate API key for tenant
export async function generateTenantAPIKey(
  tenantId: string,
  name: string,
  permissions: string[],
  expiresInDays: number = 365
): Promise<string> {
  const apiKey = `kinga_${tenantId}_${crypto.randomBytes(32).toString('hex')}`;
  const hashedKey = crypto.createHash('sha256').update(apiKey).digest('hex');
  
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expiresInDays);
  
  await db.insert(apiKeys).values({
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    name: name,
    key_hash: hashedKey,
    permissions: permissions,
    created_at: new Date(),
    expires_at: expiresAt,
    status: 'active'
  });
  
  // Return plain API key (only shown once)
  return apiKey;
}

// Validate API key
export async function validateAPIKey(apiKey: string): Promise<{ tenantId: string; permissions: string[] } | null> {
  const hashedKey = crypto.createHash('sha256').update(apiKey).digest('hex');
  
  const result = await db.select()
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.keyHash, hashedKey),
        eq(apiKeys.status, 'active'),
        gt(apiKeys.expiresAt, new Date())
      )
    )
    .limit(1);
  
  if (result.length === 0) {
    return null;
  }
  
  // Log API key usage
  await db.insert(apiKeyUsage).values({
    api_key_id: result[0].id,
    used_at: new Date(),
    ip_address: req.ip,
    endpoint: req.path
  });
  
  return {
    tenantId: result[0].tenantId,
    permissions: result[0].permissions
  };
}
```

### 9.4 API Rate Limiting (Tenant-Specific)

```typescript
// Tenant-specific rate limits
const rateLimits = {
  'tier-basic': {
    requests_per_minute: 60,
    requests_per_hour: 1000,
    requests_per_day: 10000
  },
  'tier-professional': {
    requests_per_minute: 300,
    requests_per_hour: 10000,
    requests_per_day: 100000
  },
  'tier-enterprise': {
    requests_per_minute: 1000,
    requests_per_hour: 50000,
    requests_per_day: 1000000
  }
};

// Rate limiting middleware
export function tenantRateLimiter() {
  return async (ctx: Context, next: () => Promise<void>) => {
    const tenantId = ctx.tenant.id;
    const tier = ctx.tenant.tier;
    const limits = rateLimits[tier];
    
    const minuteKey = `ratelimit:${tenantId}:minute:${Math.floor(Date.now() / 60000)}`;
    const hourKey = `ratelimit:${tenantId}:hour:${Math.floor(Date.now() / 3600000)}`;
    const dayKey = `ratelimit:${tenantId}:day:${Math.floor(Date.now() / 86400000)}`;
    
    const [minuteCount, hourCount, dayCount] = await Promise.all([
      redis.incr(minuteKey),
      redis.incr(hourKey),
      redis.incr(dayKey)
    ]);
    
    // Set expiry on first increment
    if (minuteCount === 1) await redis.expire(minuteKey, 60);
    if (hourCount === 1) await redis.expire(hourKey, 3600);
    if (dayCount === 1) await redis.expire(dayKey, 86400);
    
    // Check limits
    if (minuteCount > limits.requests_per_minute) {
      throw new TRPCError({
        code: 'TOO_MANY_REQUESTS',
        message: 'Rate limit exceeded: too many requests per minute'
      });
    }
    
    if (hourCount > limits.requests_per_hour) {
      throw new TRPCError({
        code: 'TOO_MANY_REQUESTS',
        message: 'Rate limit exceeded: too many requests per hour'
      });
    }
    
    if (dayCount > limits.requests_per_day) {
      throw new TRPCError({
        code: 'TOO_MANY_REQUESTS',
        message: 'Rate limit exceeded: too many requests per day'
      });
    }
    
    // Add rate limit headers
    ctx.res.setHeader('X-RateLimit-Limit-Minute', limits.requests_per_minute.toString());
    ctx.res.setHeader('X-RateLimit-Remaining-Minute', (limits.requests_per_minute - minuteCount).toString());
    ctx.res.setHeader('X-RateLimit-Reset-Minute', (Math.floor(Date.now() / 60000) * 60 + 60).toString());
    
    await next();
  };
}
```

---

## 10. Security Threat Model

### 10.1 Threat Categories

| Threat Category | Risk Level | Mitigation Strategy |
|---|---|---|
| **Cross-Tenant Data Leakage** | Critical | Schema-per-tenant, RLS policies, tenant context middleware, query validation |
| **Unauthorized Access** | High | JWT authentication, RBAC, API key validation, IP whitelisting |
| **Data Exfiltration** | High | Audit logging, data export monitoring, rate limiting, DLP controls |
| **SQL Injection** | High | Parameterized queries, ORM usage, WAF filtering, input validation |
| **XSS Attacks** | Medium | Content Security Policy, input sanitization, output encoding |
| **CSRF Attacks** | Medium | CSRF tokens, SameSite cookies, Origin validation |
| **DDoS Attacks** | Medium | Rate limiting, CDN protection, auto-scaling, traffic analysis |
| **Insider Threats** | Medium | Audit logging, least privilege access, data masking, separation of duties |
| **Encryption Key Compromise** | High | KMS key rotation, HSM storage, key access logging, multi-factor authentication |
| **Session Hijacking** | Medium | Secure cookies, session timeout, IP binding, device fingerprinting |

### 10.2 Attack Scenarios & Defenses

**Scenario 1: Cross-Tenant Data Access Attempt**

*Attack:* Malicious user from Tenant A attempts to access Tenant B's data by manipulating tenant ID in API requests.

*Defense Layers:*
1. **JWT Validation**: Tenant ID is embedded in signed JWT, cannot be tampered
2. **Middleware Enforcement**: Tenant context middleware validates JWT tenant ID matches request tenant ID
3. **Database RLS**: PostgreSQL row-level security policies enforce tenant isolation at query level
4. **Audit Logging**: All cross-tenant access attempts are logged and trigger alerts

**Scenario 2: Privilege Escalation**

*Attack:* Claimant user attempts to access assessor-only endpoints by modifying role claim in JWT.

*Defense Layers:*
1. **JWT Signature Verification**: Tampered JWTs fail signature validation
2. **RBAC Middleware**: Role-based access control validates user role against endpoint requirements
3. **Database Permissions**: User-specific database roles limit query scope
4. **Audit Logging**: All permission-denied events are logged with user details

**Scenario 3: Data Exfiltration via Bulk Export**

*Attack:* Compromised admin account attempts to export entire tenant database.

*Defense Layers:*
1. **Export Rate Limiting**: Maximum 1000 records per export, 10 exports per day
2. **Audit Logging**: All exports logged with user, timestamp, filters, row count
3. **Anomaly Detection**: Unusual export patterns trigger security alerts
4. **Data Masking**: Sensitive fields are masked in exports based on user role

**Scenario 4: SQL Injection**

*Attack:* Attacker injects SQL code via claim description field.

*Defense Layers:*
1. **Parameterized Queries**: All database queries use parameterized statements
2. **ORM Usage**: Drizzle ORM prevents direct SQL string concatenation
3. **Input Validation**: Zod schemas validate all input data types and formats
4. **WAF Filtering**: Web Application Firewall blocks common SQL injection patterns

**Scenario 5: Session Hijacking**

*Attack:* Attacker steals session token and impersonates legitimate user.

*Defense Layers:*
1. **Secure Cookies**: HttpOnly, Secure, SameSite=Strict flags prevent cookie theft
2. **IP Binding**: Session tokens are bound to originating IP address
3. **Session Timeout**: Tokens expire after 8 hours of inactivity
4. **Device Fingerprinting**: Browser fingerprint validation detects session transfer

### 10.3 Security Monitoring & Alerting

**Real-Time Threat Detection:**

```typescript
// Security event monitoring
export async function monitorSecurityEvents(): Promise<void> {
  // Monitor for cross-tenant access attempts
  const crossTenantAttempts = await db.execute(`
    SELECT
      user_id,
      tenant_id,
      COUNT(*) as attempt_count
    FROM audit_logs
    WHERE
      event_type = 'dashboard_access'
      AND status = 'denied'
      AND failure_reason LIKE '%tenant%'
      AND timestamp >= NOW() - INTERVAL 1 HOUR
    GROUP BY user_id, tenant_id
    HAVING COUNT(*) >= 5
  `);
  
  if (crossTenantAttempts.length > 0) {
    await sendSecurityAlert('cross_tenant_access_attempts', crossTenantAttempts);
  }
  
  // Monitor for privilege escalation attempts
  const privilegeEscalationAttempts = await db.execute(`
    SELECT
      user_id,
      user_role,
      resource_type,
      COUNT(*) as attempt_count
    FROM audit_logs
    WHERE
      event_type = 'dashboard_access'
      AND status = 'denied'
      AND failure_reason LIKE '%permission%'
      AND timestamp >= NOW() - INTERVAL 1 HOUR
    GROUP BY user_id, user_role, resource_type
    HAVING COUNT(*) >= 10
  `);
  
  if (privilegeEscalationAttempts.length > 0) {
    await sendSecurityAlert('privilege_escalation_attempts', privilegeEscalationAttempts);
  }
  
  // Monitor for unusual data export patterns
  const unusualExports = await db.execute(`
    SELECT
      user_id,
      tenant_id,
      COUNT(*) as export_count,
      SUM(data_accessed->>'row_count') as total_rows
    FROM audit_logs
    WHERE
      event_type = 'data_export'
      AND timestamp >= NOW() - INTERVAL 1 DAY
    GROUP BY user_id, tenant_id
    HAVING
      COUNT(*) > 10
      OR SUM((data_accessed->>'row_count')::int) > 10000
  `);
  
  if (unusualExports.length > 0) {
    await sendSecurityAlert('unusual_data_export_patterns', unusualExports);
  }
}

// Run security monitoring every 5 minutes
setInterval(monitorSecurityEvents, 5 * 60 * 1000);
```

---

## 11. POPIA/GDPR Compliance Alignment

### 11.1 Data Protection Principles

| POPIA/GDPR Principle | KINGA Implementation |
|---|---|
| **Lawfulness, Fairness, Transparency** | Explicit consent during onboarding, privacy policy, data processing agreements |
| **Purpose Limitation** | Data collected only for claims processing, clearly stated in terms |
| **Data Minimization** | Only essential data fields collected, role-based data masking |
| **Accuracy** | Data validation, claimant verification, audit trails for corrections |
| **Storage Limitation** | 7-year retention for claims data, automated deletion after retention period |
| **Integrity & Confidentiality** | Encryption at rest and in transit, access controls, audit logging |
| **Accountability** | Data Protection Officer (DPO) assigned, regular compliance audits |

### 11.2 Data Subject Rights

**Right to Access:**

```typescript
// Generate data subject access report
export async function generateDataSubjectAccessReport(userId: string): Promise<any> {
  const userData = await db.select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  
  const claims = await db.select()
    .from(claims)
    .where(eq(claims.claimantId, userId));
  
  const auditLogs = await db.select()
    .from(auditLogs)
    .where(eq(auditLogs.userId, userId))
    .orderBy(desc(auditLogs.timestamp))
    .limit(1000);
  
  return {
    personal_information: userData[0],
    claims_data: claims,
    access_history: auditLogs,
    data_sharing: [],  // List of third parties data was shared with
    retention_period: '7 years from claim closure',
    generated_at: new Date().toISOString()
  };
}
```

**Right to Erasure (Right to be Forgotten):**

```typescript
// Anonymize user data (GDPR Article 17)
export async function anonymizeUserData(userId: string, reason: string): Promise<void> {
  // 1. Anonymize personal identifiers
  await db.update(users)
    .set({
      email: `anonymized-${crypto.randomUUID()}@deleted.kinga.ai`,
      phone: null,
      id_number: null,
      address: null,
      bank_account: null,
      first_name: 'Anonymized',
      last_name: 'User',
      status: 'anonymized'
    })
    .where(eq(users.id, userId));
  
  // 2. Anonymize claims data
  await db.update(claims)
    .set({
      claimant_email: null,
      claimant_phone: null,
      claimant_address: null
    })
    .where(eq(claims.claimantId, userId));
  
  // 3. Log anonymization event
  logAuditEvent(createAuditEvent(
    'configuration_change',
    { user_id: 'system', email: 'system@kinga.ai', role: 'system', ip_address: 'internal' },
    { type: 'database', identifier: 'user-data', version: userId },
    'anonymize_user_data',
    'success',
    { reason, anonymized_at: new Date().toISOString() }
  ));
}
```

**Right to Data Portability:**

```typescript
// Export user data in machine-readable format (GDPR Article 20)
export async function exportUserDataPortable(userId: string): Promise<string> {
  const report = await generateDataSubjectAccessReport(userId);
  
  // Convert to JSON format
  const jsonData = JSON.stringify(report, null, 2);
  
  // Upload to S3 with expiring link
  const exportKey = `data-exports/${userId}/${Date.now()}.json`;
  const { url } = await storagePut(exportKey, Buffer.from(jsonData), 'application/json');
  
  // Generate expiring download link (valid for 7 days)
  const expiringUrl = await generateExpiringDownloadLink(exportKey, 7);
  
  return expiringUrl;
}
```

### 11.3 Data Processing Agreements (DPA)

**Tenant DPA Template:**

```markdown
# Data Processing Agreement

Between: [Insurer Name] ("Data Controller")
And: KINGA AutoVerify Platform ("Data Processor")

## 1. Scope of Processing
KINGA processes personal data on behalf of the Data Controller for the purpose of:
- Claims assessment and fraud detection
- Analytics and reporting
- Workflow automation

## 2. Data Categories
- Claimant personal information (name, contact details, ID number)
- Vehicle information (VIN, registration, make, model)
- Claim details (incident description, location, estimated cost)
- Supporting documents (photos, police reports, medical records)

## 3. Data Security Measures
- Encryption at rest (AES-256) and in transit (TLS 1.3)
- Access controls (RBAC, multi-factor authentication)
- Audit logging (7-year retention)
- Regular security audits and penetration testing
- Incident response plan with 24-hour notification

## 4. Sub-Processors
- AWS (cloud infrastructure)
- Manus (platform provider)
- [List other sub-processors]

## 5. Data Subject Rights
KINGA will assist the Data Controller in responding to data subject requests within 72 hours.

## 6. Data Breach Notification
KINGA will notify the Data Controller within 24 hours of becoming aware of a data breach.

## 7. Data Retention & Deletion
- Claims data: 7 years from claim closure
- Audit logs: 7 years (immutable)
- Upon termination: Data returned or deleted within 90 days

## 8. Compliance Audits
The Data Controller may audit KINGA's compliance annually with 30 days' notice.
```

### 11.4 Consent Management

```typescript
// Record user consent
export async function recordConsent(
  userId: string,
  consentType: 'data_processing' | 'marketing' | 'third_party_sharing',
  granted: boolean
): Promise<void> {
  await db.insert(userConsents).values({
    id: crypto.randomUUID(),
    user_id: userId,
    consent_type: consentType,
    granted: granted,
    granted_at: new Date(),
    ip_address: req.ip,
    user_agent: req.headers['user-agent']
  });
  
  // Log consent event
  logAuditEvent(createAuditEvent(
    'configuration_change',
    { user_id: userId, email: user.email, role: user.role, ip_address: req.ip },
    { type: 'configuration', identifier: 'user-consent', version: userId },
    `consent_${consentType}_${granted ? 'granted' : 'revoked'}`,
    'success',
    { consent_type: consentType, granted: granted }
  ));
}

// Check if user has granted consent
export async function hasConsent(userId: string, consentType: string): Promise<boolean> {
  const consent = await db.select()
    .from(userConsents)
    .where(
      and(
        eq(userConsents.userId, userId),
        eq(userConsents.consentType, consentType)
      )
    )
    .orderBy(desc(userConsents.grantedAt))
    .limit(1);
  
  return consent.length > 0 && consent[0].granted;
}
```

---

## 12. Deployment Strategy

### 12.1 Infrastructure Requirements

**Compute Resources:**

| Component | Minimum | Recommended | Scaling Strategy |
|---|---|---|---|
| **Web Application Pods** | 3 pods × 2 CPU, 4GB RAM | 6 pods × 4 CPU, 8GB RAM | Horizontal (HPA based on CPU/memory) |
| **Database (PostgreSQL)** | 4 CPU, 16GB RAM, 500GB SSD | 8 CPU, 32GB RAM, 1TB SSD | Vertical (read replicas for scaling) |
| **Analytics (ClickHouse)** | 4 CPU, 16GB RAM, 500GB SSD per tenant | 8 CPU, 32GB RAM, 1TB SSD per tenant | Vertical + per-tenant instances |
| **Cache (Redis)** | 2 CPU, 8GB RAM | 4 CPU, 16GB RAM | Vertical (Redis Cluster for scaling) |
| **Message Queue (Kafka)** | 3 brokers × 4 CPU, 16GB RAM | 5 brokers × 8 CPU, 32GB RAM | Horizontal (add brokers) |
| **Object Storage (S3)** | Unlimited | Unlimited | Auto-scaling |

**Network Requirements:**

- **Bandwidth**: 1 Gbps minimum, 10 Gbps recommended
- **Latency**: <50ms between application and database
- **CDN**: CloudFlare or AWS CloudFront for static assets
- **Load Balancer**: NGINX or AWS ALB with SSL termination

### 12.2 Kubernetes Deployment

**Namespace Structure:**

```
kinga-platform
├── default (web application, API gateway)
├── database (PostgreSQL, Redis)
├── messaging (Kafka, Zookeeper)
├── monitoring (Prometheus, Grafana, Loki)
├── analytics-tenant-a (ClickHouse for Tenant A)
├── analytics-tenant-b (ClickHouse for Tenant B)
└── [Additional tenant namespaces]
```

**Resource Quotas:**

```yaml
# Tenant namespace resource quota
apiVersion: v1
kind: ResourceQuota
metadata:
  name: tenant-quota
  namespace: analytics-tenant-a
spec:
  hard:
    requests.cpu: "16"
    requests.memory: "64Gi"
    requests.storage: "2Ti"
    limits.cpu: "32"
    limits.memory: "128Gi"
    persistentvolumeclaims: "10"
    pods: "50"
```

**Network Policies:**

```yaml
# Restrict cross-tenant traffic
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: tenant-isolation
  namespace: analytics-tenant-a
spec:
  podSelector:
    matchLabels:
      tenant: tenant-a
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: default
    - podSelector:
        matchLabels:
          app: kinga-backend
  egress:
  - to:
    - namespaceSelector:
        matchLabels:
          name: database
  - to:
    - namespaceSelector:
        matchLabels:
          name: messaging
```

### 12.3 Deployment Pipeline

```
1. Code Commit (GitHub)
   ↓
2. CI Pipeline (GitHub Actions)
   ├── Build Docker images
   ├── Run unit tests
   ├── Run security scans
   └── Push to container registry
   ↓
3. Staging Deployment (Kubernetes)
   ├── Deploy to staging namespace
   ├── Run integration tests
   ├── Run E2E tests
   └── Run performance tests
   ↓
4. Manual Approval (via GitHub UI)
   ↓
5. Production Deployment (Kubernetes)
   ├── Blue-green deployment
   ├── Health checks
   ├── Smoke tests
   └── Rollback if needed
   ↓
6. Post-Deployment Monitoring
   ├── Monitor error rates
   ├── Monitor latency
   ├── Monitor resource usage
   └── Alert on anomalies
```

### 12.4 Disaster Recovery

**Backup Strategy:**

| Component | Backup Frequency | Retention | Recovery Time Objective (RTO) | Recovery Point Objective (RPO) |
|---|---|---|---|---|
| **PostgreSQL** | Continuous (WAL archiving) + Daily snapshots | 30 days | 1 hour | 5 minutes |
| **ClickHouse** | Daily snapshots | 7 days | 4 hours | 24 hours |
| **S3 Objects** | Versioning enabled | 7 years | Immediate | 0 (versioned) |
| **Redis** | Hourly snapshots | 7 days | 15 minutes | 1 hour |
| **Kafka** | Replication (3 copies) | N/A | Immediate | 0 (replicated) |

**Disaster Recovery Procedures:**

```bash
# 1. Database Recovery (PostgreSQL)
# Restore from latest backup
pg_restore -h postgres-primary.database.svc.cluster.local \
  -U postgres -d kinga_production \
  /backups/kinga_production_2026-02-11.dump

# Apply WAL logs for point-in-time recovery
pg_receivewal -h postgres-primary.database.svc.cluster.local \
  -U replication -D /var/lib/postgresql/wal_archive

# 2. Analytics Recovery (ClickHouse)
# Restore from snapshot
clickhouse-client --query "RESTORE TABLE claims_events FROM '/backups/claims_events_2026-02-11'"

# 3. Application Recovery (Kubernetes)
# Rollback to previous deployment
kubectl rollout undo deployment/kinga-backend -n default

# 4. Data Recovery (S3)
# Restore deleted object from version
aws s3api get-object --bucket kinga-tenant-a-claims \
  --key claims/12345/image.jpg \
  --version-id abc123 \
  /tmp/restored-image.jpg
```

---

## 13. Implementation Roadmap

### Phase 1: Foundation (Weeks 1-4)

- [ ] Implement tenant context middleware
- [ ] Create schema-per-tenant database structure
- [ ] Implement RBAC middleware and permission model
- [ ] Set up audit logging infrastructure
- [ ] Implement data masking functions

### Phase 2: Isolation & Security (Weeks 5-8)

- [ ] Deploy ClickHouse instances for analytics isolation
- [ ] Implement tenant-specific S3 buckets with encryption
- [ ] Set up tenant-partitioned Redis cache
- [ ] Implement tenant-partitioned Kafka topics
- [ ] Configure API Gateway with rate limiting

### Phase 3: Onboarding & Management (Weeks 9-12)

- [ ] Build automated tenant provisioning scripts
- [ ] Create tenant onboarding workflow
- [ ] Implement tenant management dashboard
- [ ] Set up tenant-specific monitoring and alerting
- [ ] Create tenant offboarding and data retention procedures

### Phase 4: Compliance & Testing (Weeks 13-16)

- [ ] Implement GDPR/POPIA data subject rights endpoints
- [ ] Create data processing agreements and consent management
- [ ] Conduct security penetration testing
- [ ] Perform compliance audit
- [ ] Load testing and performance optimization

---

## 14. Conclusion

This multi-tenant dashboard architecture provides comprehensive security, isolation, and scalability for the KINGA AutoVerify platform. The hybrid isolation model (logical + physical) ensures strict data segregation while maintaining operational efficiency. Role-based access control, comprehensive audit logging, data masking, and tenant-level encryption provide defense-in-depth security. The architecture aligns with POPIA and GDPR requirements, enabling compliant operations across multiple insurer tenants. The scalable onboarding model and automated provisioning enable rapid tenant growth without compromising security or performance.

---

**End of Document**
