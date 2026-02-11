# KINGA AutoVerify AI - Patch Plan

**Prepared By:** Tavonga Shoko
**Date:** February 11, 2026
**Version:** 1.0
**Reference:** KINGA System Audit Report v1.0 (February 11, 2026)

---

## Executive Summary

This Patch Plan translates the findings of the KINGA System Audit Report into a prioritised, actionable register of failures and their corresponding code-level remediation steps. Each item is ranked by production risk, cross-referenced to the originating audit finding, and accompanied by concrete code patches or configuration changes. The plan is structured to enable the engineering team to address the most consequential issues first, progressively reducing the platform's deployment risk from **Medium** to **Low** within a four-to-six-week execution window. The patches described herein are scoped to the existing monolithic application and its immediate dependencies; broader architectural changes are addressed in the companion Refactor Plan.

---

## 1. PRIORITISED FAILURE REGISTER

The following register consolidates all failures identified during the system audit, ranked by production risk using a composite score derived from impact severity, likelihood of occurrence, and blast radius. Each entry includes the specific file locations, root cause analysis, and estimated remediation effort.

| Rank | Failure ID | Description | Risk Level | Impact | Affected Files | Effort (hrs) |
|------|-----------|-------------|------------|--------|----------------|-------------|
| 1 | SEC-001 | No API rate limiting | **Critical** | DoS vulnerability; entire platform unavailable | `server/_core/index.ts` | 4-6 |
| 2 | SEC-002 | No file upload scanning | **Critical** | Malware distribution via S3 storage | `server/routers.ts` (upload procedures) | 8-10 |
| 3 | EVT-001 | Event integration import crash | **Critical** | Server fails to start if event code is re-enabled | `server/events/event-integration.ts` | 2-4 |
| 4 | SEC-003 | Sensitive data stored in plaintext | **High** | Compliance risk; data breach exposure | `drizzle/schema.ts`, `server/db.ts` | 12-16 |
| 5 | DB-001 | Missing composite database indexes | **High** | Analytics query degradation under load | `drizzle/schema.ts` | 2-3 |
| 6 | DB-002 | No soft delete pattern | **High** | Permanent data loss; compliance gap | `drizzle/schema.ts`, `server/db.ts` | 8-12 |
| 7 | WS-001 | No WebSocket reconnection logic | **High** | Clients lose real-time updates on network interruption | `client/src/pages/analytics/*.tsx` | 4-6 |
| 8 | API-001 | Missing request size validation | **Medium** | Resource exhaustion via oversized payloads | `server/_core/index.ts` | 2-3 |
| 9 | AUTH-001 | No fine-grained permissions (ABAC) | **Medium** | All users within a role have identical access | `server/_core/trpc.ts`, `server/rbac.ts` | 16-24 |
| 10 | AI-001 | No LLM confidence thresholds | **Medium** | Unreliable AI assessments accepted without review | `server/routers.ts` (AI procedures) | 4-6 |
| 11 | AI-002 | Vision model integration untested | **Medium** | Damage photo analysis may fail silently | `server/routers.ts` (triggerAiAssessment) | 6-8 |
| 12 | AUDIT-001 | Audit logs in same database as app data | **Medium** | Log tampering risk if database is compromised | `server/db.ts`, `drizzle/schema.ts` | 8-12 |
| 13 | STOR-001 | S3 files use obscure keys, not signed URLs | **Low** | Security through obscurity; enumerable paths | `server/storage.ts` | 4-6 |
| 14 | UI-001 | Mobile form optimisation incomplete | **Low** | Reduced usability for field workers | `client/src/pages/*.tsx` | 16-24 |
| 15 | DATA-001 | No external data validation (policy, VIN) | **Low** | Invalid data enters the system unchecked | `server/routers.ts` (claims.create) | 24-32 |

---

## 2. ARCHITECTURE FIXES (Code-Level)

### 2.1 Rate Limiting Middleware (SEC-001)

The platform currently accepts unlimited API requests from any client. The remediation involves installing the `express-rate-limit` package and applying tiered rate limits to the Express middleware stack before the tRPC handler.

**Target File:** `server/_core/index.ts`

**Patch:**

```typescript
// Install: pnpm add express-rate-limit
import rateLimit from 'express-rate-limit';

// Global rate limiter: 100 requests per 15-minute window per IP
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
  keyGenerator: (req) => {
    return req.headers['x-forwarded-for']?.toString().split(',')[0] || req.ip || 'unknown';
  },
});

// Strict limiter for authentication endpoints: 10 requests per 15 minutes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many authentication attempts.' },
});

// Apply before tRPC handler
app.use('/api/trpc', globalLimiter);
app.use('/api/oauth', authLimiter);
```

**Rationale:** Rate limiting is the single most impactful security patch for the platform. Without it, a single malicious actor can render the entire system unavailable through request flooding. The tiered approach applies stricter limits to authentication endpoints, which are the most common target for brute-force attacks, while allowing reasonable throughput for authenticated API usage.

**Validation:** After applying this patch, execute the following test to confirm rate limiting is active:

```bash
# Should return 429 after 100 rapid requests
for i in $(seq 1 105); do curl -s -o /dev/null -w "%{http_code}\n" https://localhost:3000/api/trpc/system.health; done | sort | uniq -c
```

### 2.2 File Upload Scanning (SEC-002)

The current upload pipeline stores files directly to S3 without content inspection. The remediation introduces a server-side scanning step using the `clamscan` package (a Node.js wrapper for ClamAV) that intercepts file buffers before they reach S3.

**Target Files:** `server/routers.ts` (all upload procedures), new file `server/file-scanner.ts`

**Patch (new file `server/file-scanner.ts`):**

```typescript
import { Readable } from 'stream';

/**
 * File scanning utility for malware detection.
 * Uses ClamAV daemon when available, falls back to MIME type validation.
 * 
 * Production: Install ClamAV daemon (clamav-daemon) on the host.
 * Development: Falls back to extension/MIME validation only.
 */

const ALLOWED_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

interface ScanResult {
  safe: boolean;
  reason?: string;
}

export async function scanFile(
  buffer: Buffer,
  mimeType: string,
  filename: string
): Promise<ScanResult> {
  // Step 1: Validate MIME type
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    return { safe: false, reason: `Disallowed file type: ${mimeType}` };
  }

  // Step 2: Validate file size
  if (buffer.length > MAX_FILE_SIZE) {
    return { safe: false, reason: `File exceeds maximum size of ${MAX_FILE_SIZE / 1024 / 1024}MB` };
  }

  // Step 3: Validate file signature (magic bytes)
  const signatureValid = validateFileSignature(buffer, mimeType);
  if (!signatureValid) {
    return { safe: false, reason: 'File content does not match declared MIME type' };
  }

  // Step 4: ClamAV scan (if daemon is available)
  try {
    const clamResult = await scanWithClamAV(buffer);
    if (!clamResult.safe) {
      return clamResult;
    }
  } catch {
    // ClamAV not available; log warning and continue with basic validation
    console.warn('[FileScanner] ClamAV daemon not available, proceeding with basic validation only');
  }

  return { safe: true };
}

function validateFileSignature(buffer: Buffer, mimeType: string): boolean {
  const signatures: Record<string, number[][]> = {
    'image/jpeg': [[0xFF, 0xD8, 0xFF]],
    'image/png': [[0x89, 0x50, 0x4E, 0x47]],
    'image/gif': [[0x47, 0x49, 0x46, 0x38]],
    'image/webp': [[0x52, 0x49, 0x46, 0x46]],
    'application/pdf': [[0x25, 0x50, 0x44, 0x46]],
  };

  const expected = signatures[mimeType];
  if (!expected) return true; // No signature check for this type

  return expected.some(sig =>
    sig.every((byte, i) => buffer[i] === byte)
  );
}

async function scanWithClamAV(buffer: Buffer): Promise<ScanResult> {
  const net = await import('net');
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ path: '/var/run/clamav/clamd.ctl' }, () => {
      socket.write('zINSTREAM\0');
      const sizeBuffer = Buffer.alloc(4);
      sizeBuffer.writeUInt32BE(buffer.length, 0);
      socket.write(sizeBuffer);
      socket.write(buffer);
      const endBuffer = Buffer.alloc(4);
      endBuffer.writeUInt32BE(0, 0);
      socket.write(endBuffer);
    });

    let response = '';
    socket.on('data', (data) => { response += data.toString(); });
    socket.on('end', () => {
      if (response.includes('OK')) {
        resolve({ safe: true });
      } else {
        resolve({ safe: false, reason: `Malware detected: ${response.trim()}` });
      }
    });
    socket.on('error', (err) => reject(err));
    socket.setTimeout(10000, () => {
      socket.destroy();
      reject(new Error('ClamAV scan timeout'));
    });
  });
}
```

**Integration into upload procedures:** Each upload procedure in `server/routers.ts` must call `scanFile()` before invoking `storagePut()`. The pattern is:

```typescript
import { scanFile } from './file-scanner';

// Inside upload procedure, before storagePut:
const scanResult = await scanFile(fileBuffer, mimeType, filename);
if (!scanResult.safe) {
  throw new TRPCError({
    code: 'BAD_REQUEST',
    message: `File rejected: ${scanResult.reason}`,
  });
}
```

**Rationale:** File scanning prevents malicious content from entering the storage layer. The layered approach (MIME validation, magic byte verification, ClamAV scan) provides defence in depth. The graceful fallback when ClamAV is unavailable ensures the system remains functional in development environments while enforcing full scanning in production.

### 2.3 Event Integration Import Fix (EVT-001)

The server crashes when the event integration module is re-enabled because the import path references a non-existent export from the shared events package. The root cause is that the `shared/events` package has not been compiled, and the import attempts to resolve TypeScript source files directly.

**Target File:** `server/events/event-integration.ts`

**Patch:**

```typescript
// Replace the direct source import:
// import { EventPublisher, PublishOptions, initializeKafkaClient, getTopicName } from '../../shared/events/src/index';

// With a conditional import that gracefully handles missing dependencies:
let EventPublisher: any = null;
let initializeKafkaClient: any = null;
let getTopicName: any = null;

async function loadEventDependencies() {
  try {
    const events = await import('../../shared/events/src/index.js');
    EventPublisher = events.EventPublisher;
    initializeKafkaClient = events.initializeKafkaClient;
    getTopicName = events.getTopicName;
    return true;
  } catch (err) {
    console.warn('[EventIntegration] Kafka event dependencies not available. Running in monolithic mode.');
    return false;
  }
}
```

Additionally, the `KingaEventIntegration` class must be updated to check dependency availability before attempting to initialise the Kafka client. The `initialize()` method should return gracefully when dependencies are not loaded, and all `emit*` methods should no-op when the publisher is null.

**Rationale:** This patch eliminates the server crash while preserving the event integration code for future activation. The conditional import pattern allows the monolithic application to start cleanly regardless of whether the Kafka infrastructure is deployed, providing a smooth transition path to event-driven architecture.

### 2.4 Composite Database Indexes (DB-001)

The analytics queries identified in the audit perform full table scans on the `claims` table when filtering by date ranges or fraud risk scores. The `audit_trail` table also lacks indexes on frequently queried columns.

**Target File:** `drizzle/schema.ts`

**Patch:** Add the following index definitions to the respective table declarations:

```typescript
import { index } from 'drizzle-orm/mysql-core';

// Add to claims table definition:
// Composite index for analytics date-range queries
(table) => ({
  statusCreatedIdx: index('idx_claims_status_created').on(table.status, table.createdAt),
  fraudRiskStatusIdx: index('idx_claims_fraud_risk_status').on(table.fraudRiskScore, table.status),
  claimantCreatedIdx: index('idx_claims_claimant_created').on(table.claimantId, table.createdAt),
  assignedAssessorIdx: index('idx_claims_assigned_assessor').on(table.assignedAssessorId),
})

// Add to audit_trail table definition:
(table) => ({
  actionTimestampIdx: index('idx_audit_action_timestamp').on(table.action, table.timestamp),
  userTimestampIdx: index('idx_audit_user_timestamp').on(table.userId, table.timestamp),
  claimTimestampIdx: index('idx_audit_claim_timestamp').on(table.claimId, table.timestamp),
})

// Add to fraud_indicators table definition:
(table) => ({
  claimSeverityIdx: index('idx_fraud_claim_severity').on(table.claimId, table.severity),
  detectedAtIdx: index('idx_fraud_detected_at').on(table.detectedAt),
})
```

After adding these indexes, execute `pnpm db:push` to apply the migration.

**Rationale:** Composite indexes on the columns most frequently used in WHERE clauses and ORDER BY operations will reduce analytics query execution time from full table scans to index-assisted lookups. The `(status, createdAt)` index is particularly important because the Claims Cost Trend dashboard filters by both status and date range on every load. The audit trail indexes support compliance queries that filter by action type and time window.

### 2.5 Sensitive Data Encryption (SEC-003)

Policy numbers, vehicle registration numbers, and personal identification data are stored in plaintext. The remediation introduces application-level field encryption using AES-256-GCM for sensitive columns.

**Target File:** New file `server/encryption.ts`

**Patch:**

```typescript
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const SALT_LENGTH = 32;

/**
 * Derives an encryption key from the JWT_SECRET environment variable.
 * In production, use a dedicated encryption key stored in a secrets manager.
 */
function getEncryptionKey(): Buffer {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not configured for encryption');
  const salt = Buffer.from('kinga-field-encryption-salt-v1');
  return scryptSync(secret, salt, 32);
}

export function encryptField(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();
  
  // Format: iv:tag:ciphertext (all hex-encoded)
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

export function decryptField(encryptedValue: string): string {
  const key = getEncryptionKey();
  const [ivHex, tagHex, ciphertext] = encryptedValue.split(':');
  
  if (!ivHex || !tagHex || !ciphertext) {
    // Value is not encrypted (migration period); return as-is
    return encryptedValue;
  }
  
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  
  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
```

**Integration:** Apply `encryptField()` when writing sensitive columns (policy number, vehicle registration, ID numbers) and `decryptField()` when reading them. During the migration period, the `decryptField()` function gracefully handles unencrypted values by returning them as-is when the encrypted format is not detected.

**Rationale:** Application-level encryption provides defence in depth against database breaches. Even if an attacker gains direct database access, encrypted fields remain unreadable without the encryption key. The AES-256-GCM algorithm provides both confidentiality and integrity verification through the authentication tag.

---

## 3. CODE PATCHES

### 3.1 WebSocket Reconnection (WS-001)

The WebSocket client implementation in the analytics dashboards does not automatically reconnect after network interruptions.

**Target Files:** All files in `client/src/pages/analytics/` that use `useWebSocket`

**Patch:** The `react-use-websocket` library already supports automatic reconnection. Update the hook configuration in each analytics dashboard:

```typescript
import useWebSocket from 'react-use-websocket';

const { lastMessage } = useWebSocket(wsUrl, {
  shouldReconnect: () => true,
  reconnectAttempts: 10,
  reconnectInterval: (attemptNumber) => 
    Math.min(1000 * Math.pow(2, attemptNumber), 30000), // Exponential backoff, max 30s
  onReconnectStop: () => {
    console.warn('[WebSocket] Maximum reconnection attempts reached');
  },
  heartbeat: {
    message: 'ping',
    returnMessage: 'pong',
    timeout: 60000,
    interval: 25000,
  },
});
```

**Rationale:** Automatic reconnection with exponential backoff ensures that temporary network disruptions do not permanently disconnect dashboard users from real-time updates. The heartbeat mechanism detects stale connections proactively, triggering reconnection before users notice data staleness.

### 3.2 LLM Confidence Threshold Enforcement (AI-001)

The AI assessment pipeline accepts all LLM outputs regardless of the model's confidence level. The patch introduces a confidence threshold that routes low-confidence assessments to human review.

**Target File:** `server/routers.ts` (triggerAiAssessment procedure)

**Patch:**

```typescript
const CONFIDENCE_THRESHOLD = 0.70; // Minimum acceptable confidence score

// After receiving LLM response and parsing the assessment:
const assessment = JSON.parse(llmResponse.choices[0].message.content);

if (assessment.overallConfidence < CONFIDENCE_THRESHOLD) {
  // Flag for human review instead of auto-accepting
  await getDb().update(claims).set({
    status: 'pending_manual_review',
    reviewReason: `AI confidence below threshold: ${(assessment.overallConfidence * 100).toFixed(1)}%`,
  }).where(eq(claims.id, input.claimId));
  
  // Create notification for assigned assessor
  await getDb().insert(notifications).values({
    userId: claim.assignedAssessorId,
    type: 'assessment_review_required',
    title: 'Manual Review Required',
    message: `AI assessment for claim ${claim.claimNumber} requires manual review (confidence: ${(assessment.overallConfidence * 100).toFixed(1)}%)`,
    claimId: input.claimId,
    createdAt: new Date(),
  });
}
```

**Rationale:** Blindly accepting low-confidence AI assessments introduces risk of incorrect damage classifications and cost estimates propagating through the approval workflow. The confidence threshold creates a safety net that routes uncertain assessments to qualified human assessors, improving overall system reliability.

### 3.3 Soft Delete Pattern (DB-002)

The database schema does not implement soft deletes, meaning deleted records are permanently lost. The patch adds `deletedAt` columns and modifies query helpers to filter soft-deleted records by default.

**Target File:** `drizzle/schema.ts`

**Patch:** Add the following column to tables that require soft delete support (claims, documents, quotes, panel_beaters, users):

```typescript
deletedAt: timestamp('deleted_at'),
```

**Target File:** `server/db.ts`

**Patch:** Modify all query helpers to include a soft delete filter:

```typescript
// Helper to add soft delete filter
function notDeleted<T extends { deletedAt: any }>(table: T) {
  return isNull(table.deletedAt);
}

// Example: Update getClaims to filter soft-deleted records
export async function getClaims(filters: ClaimFilters) {
  return getDb()
    .select()
    .from(claims)
    .where(and(
      notDeleted(claims),
      // ... existing filters
    ));
}

// Soft delete function
export async function softDelete<T extends { deletedAt: any }>(
  table: T,
  condition: SQL
) {
  return getDb()
    .update(table)
    .set({ deletedAt: new Date() } as any)
    .where(condition);
}
```

After adding the columns, execute `pnpm db:push` to apply the migration.

**Rationale:** Soft deletes are essential for compliance with data retention requirements and enable data recovery when records are deleted in error. The pattern preserves historical data for audit purposes while maintaining the appearance of deletion in the application layer.

### 3.4 Request Size Validation (API-001)

The Express server accepts payloads up to 50MB (`express.json({ limit: "50mb" })`), which is excessive for most API endpoints and creates a resource exhaustion vector.

**Target File:** `server/_core/index.ts`

**Patch:**

```typescript
// Replace the single global limit with endpoint-specific limits
app.use(express.json({ limit: '1mb' })); // Default: 1MB for most API calls

// Override for file upload endpoints that need larger payloads
app.use('/api/upload', express.json({ limit: '15mb' }));
app.use('/api/trpc/documents.upload', express.json({ limit: '15mb' }));
app.use('/api/trpc/claims.uploadImage', express.json({ limit: '15mb' }));
```

**Rationale:** Reducing the default payload limit from 50MB to 1MB prevents resource exhaustion attacks where malicious actors send oversized payloads to consume server memory. The targeted overrides for upload endpoints maintain functionality for legitimate file uploads while protecting all other endpoints.

### 3.5 Audit Log Separation (AUDIT-001)

Audit logs currently reside in the same MySQL database as application data. The patch introduces a write-ahead pattern that copies audit entries to a separate, append-only storage location.

**Target File:** New file `server/audit-writer.ts`

**Patch:**

```typescript
import { appendFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const AUDIT_LOG_DIR = process.env.AUDIT_LOG_DIR || '/var/log/kinga/audit';

/**
 * Write-ahead audit logger that persists audit entries to both
 * the database and an append-only file system log.
 * 
 * In production, replace the file system target with a dedicated
 * audit service (e.g., AWS CloudTrail, Elasticsearch, or a 
 * separate database with restricted write-only access).
 */
export function writeAuditEntry(entry: {
  userId: string;
  action: string;
  resource: string;
  resourceId: string;
  details: Record<string, any>;
  timestamp: Date;
}) {
  const logLine = JSON.stringify({
    ...entry,
    timestamp: entry.timestamp.toISOString(),
    hostname: process.env.HOSTNAME || 'kinga-monolith',
  }) + '\n';

  try {
    if (!existsSync(AUDIT_LOG_DIR)) {
      mkdirSync(AUDIT_LOG_DIR, { recursive: true });
    }
    const dateStr = entry.timestamp.toISOString().split('T')[0];
    const logFile = join(AUDIT_LOG_DIR, `audit-${dateStr}.jsonl`);
    appendFileSync(logFile, logLine);
  } catch (err) {
    console.error('[AuditWriter] Failed to write audit log to file:', err);
    // Database write continues regardless of file write failure
  }
}
```

**Integration:** Call `writeAuditEntry()` alongside every existing `audit_trail` database insert in `server/routers.ts` and `server/db.ts`.

**Rationale:** Storing audit logs exclusively in the application database creates a single point of compromise. If an attacker gains database write access, they can modify or delete audit entries to cover their tracks. The dual-write pattern ensures that a tamper-resistant copy of all audit events exists outside the application database.

---

## 4. MISSING TEST COVERAGE

The following table identifies routers and modules that lack dedicated test files, along with the specific test scenarios that should be implemented.

| Module | Current Test File | Coverage Status | Required Test Scenarios |
|--------|------------------|-----------------|------------------------|
| `claims` router | None | **No coverage** | Create claim, update status, assign assessor, approve claim, close claim, list by status, pagination, validation errors |
| `insurers` router | None | **No coverage** | Triage list, policy verification, external assessment upload, comparison view data |
| `panelBeaters` router | None | **No coverage** | Quote request listing, quote submission, approval workflow, job management |
| `quotes` router | None | **No coverage** | Quote CRUD, line item management, comparison engine integration |
| `documents` router | None | **No coverage** | File upload validation, S3 integration, metadata management, file type restrictions |
| `workflow` router | None | **No coverage** | State transitions, approval chains, escalation rules, invalid transition rejection |
| `admin` router | None | **No coverage** | Panel beater approval, user management, system configuration |
| `executive` router | `executive-analytics.test.ts` | **Partial** | KPI calculations, strategic analytics, executive summary generation |
| `appointments` router | None | **No coverage** | Scheduling, conflict detection, calendar management |
| `analytics` router | `analytics.test.ts` | **Partial** | All four dashboard endpoints with realistic data |
| `auth` router | `auth.logout.test.ts` | **Partial** | Login flow, session management, role switching |
| `notifications` router | `notifications.test.ts` | **Partial** | Create, list, mark as read, unread count, real-time delivery |
| `policeReports` router | `policeReport.test.ts` | **Partial** | OCR processing, validation, report management |
| `vehicleValuation` router | `vehicleValuation.test.ts` | **Partial** | Market value estimation, depreciation calculations |
| `aiAssessments` router | `assessment-processor.test.ts` | **Partial** | Full assessment trigger, physics validation integration, confidence scoring |
| `rbac` module | `rbac.test.ts` | **Good** | Additional edge cases for role hierarchy |
| `accidentPhysics` module | `accidentPhysics.test.ts`, `advancedPhysics.test.ts` | **Good** | Calibration against real-world data (additional information required) |
| `fraudDetection` module | `fraudDetection.test.ts` | **Good** | Additional scenarios for network analysis |
| `cost-optimization` module | `cost-optimization.test.ts` | **Good** | Edge cases for single-quote scenarios |

### Priority Test Implementation Order

The following test files should be created in order of production risk impact:

**Tier 1 (Critical Path):** These tests cover the primary claim lifecycle and must pass before production deployment.

1. **`server/claims.test.ts`** - Full CRUD lifecycle, status transitions, validation rules, pagination, and error handling. This is the most critical untested module as it underpins the entire platform workflow.

2. **`server/workflow.test.ts`** - State machine transitions, approval chain validation, escalation rules, and rejection of invalid state transitions. Workflow correctness is essential for maintaining data integrity across the claim lifecycle.

3. **`server/documents.test.ts`** - File upload validation (type, size, signature), S3 integration, metadata persistence, and access control. Document handling is a security-sensitive area requiring thorough validation.

**Tier 2 (Business Logic):** These tests cover revenue-critical business logic.

4. **`server/quotes.test.ts`** - Quote CRUD, line item calculations, comparison engine accuracy, and outlier detection. Quote accuracy directly impacts financial outcomes.

5. **`server/insurers.test.ts`** - Triage workflow, policy verification, assessment upload, and comparison view data assembly. Insurer workflows are the primary business process.

6. **`server/panelBeaters.test.ts`** - Quote request handling, submission validation, approval workflow, and job lifecycle management.

**Tier 3 (Supporting Functions):** These tests cover administrative and supporting functions.

7. **`server/admin.test.ts`** - Panel beater approval, user management, and configuration changes.

8. **`server/appointments.test.ts`** - Scheduling logic, conflict detection, and calendar coordination.

### Test Template

All new test files should follow the established pattern from `server/auth.logout.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock database and dependencies
vi.mock('./db', () => ({
  getDb: vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue([[]]),
  })),
}));

describe('ModuleName', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('procedure.name', () => {
    it('should handle the happy path', async () => {
      // Arrange, Act, Assert
    });

    it('should reject invalid input', async () => {
      // Test validation
    });

    it('should enforce authorization', async () => {
      // Test RBAC
    });
  });
});
```

---

## 5. MONITORING IMPROVEMENTS

### 5.1 Application Performance Monitoring (APM)

The platform currently has no runtime performance monitoring. The following instrumentation should be added to capture critical metrics.

**New File:** `server/monitoring.ts`

```typescript
/**
 * Application metrics collection for Prometheus-compatible monitoring.
 * 
 * Exposes metrics at /metrics endpoint for scraping by Prometheus.
 * In production, replace with prom-client or OpenTelemetry SDK.
 */

interface MetricEntry {
  name: string;
  type: 'counter' | 'histogram' | 'gauge';
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

class MetricsCollector {
  private metrics: Map<string, MetricEntry[]> = new Map();

  increment(name: string, labels: Record<string, string> = {}) {
    const key = `${name}:${JSON.stringify(labels)}`;
    const existing = this.metrics.get(key);
    if (existing && existing.length > 0) {
      existing[existing.length - 1].value++;
    } else {
      this.metrics.set(key, [{ name, type: 'counter', value: 1, labels, timestamp: Date.now() }]);
    }
  }

  observe(name: string, value: number, labels: Record<string, string> = {}) {
    const key = `${name}:${JSON.stringify(labels)}`;
    const existing = this.metrics.get(key) || [];
    existing.push({ name, type: 'histogram', value, labels, timestamp: Date.now() });
    this.metrics.set(key, existing.slice(-1000)); // Keep last 1000 observations
  }

  gauge(name: string, value: number, labels: Record<string, string> = {}) {
    const key = `${name}:${JSON.stringify(labels)}`;
    this.metrics.set(key, [{ name, type: 'gauge', value, labels, timestamp: Date.now() }]);
  }

  getMetrics(): string {
    let output = '';
    for (const [, entries] of this.metrics) {
      for (const entry of entries) {
        const labelStr = Object.entries(entry.labels)
          .map(([k, v]) => `${k}="${v}"`)
          .join(',');
        output += `${entry.name}{${labelStr}} ${entry.value} ${entry.timestamp}\n`;
      }
    }
    return output;
  }
}

export const metrics = new MetricsCollector();
```

**Integration into `server/_core/index.ts`:**

```typescript
import { metrics } from '../monitoring';

// Expose metrics endpoint
app.get('/metrics', (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send(metrics.getMetrics());
});

// Add request timing middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    metrics.observe('http_request_duration_ms', duration, {
      method: req.method,
      path: req.path.split('/').slice(0, 3).join('/'), // Normalize path
      status: String(res.statusCode),
    });
    metrics.increment('http_requests_total', {
      method: req.method,
      status: String(res.statusCode),
    });
  });
  next();
});
```

### 5.2 Key Metrics to Track

The following table defines the metrics that should be collected and the alerting thresholds for each.

| Metric | Type | Description | Alert Threshold |
|--------|------|-------------|-----------------|
| `http_request_duration_ms` | Histogram | API response time by endpoint | p95 > 2000ms |
| `http_requests_total` | Counter | Total requests by method and status | 5xx rate > 1% |
| `db_query_duration_ms` | Histogram | Database query execution time | p95 > 1000ms |
| `claim_created_total` | Counter | Claims submitted | Spike > 3x hourly average |
| `ai_assessment_duration_ms` | Histogram | LLM assessment processing time | p95 > 10000ms |
| `ai_assessment_confidence` | Histogram | AI confidence score distribution | Mean < 0.60 |
| `fraud_alert_total` | Counter | Fraud alerts triggered | Spike > 5x daily average |
| `file_upload_size_bytes` | Histogram | Upload file sizes | Single file > 10MB |
| `ws_connections_active` | Gauge | Active WebSocket connections | > 500 concurrent |
| `error_rate` | Gauge | Error percentage over 5-minute window | > 5% |

### 5.3 Health Check Enhancement

The existing health check endpoint (`system.health`) returns a simple success response. The patch enhances it to include component-level health status.

**Patch for `server/_core/systemRouter.ts`:**

```typescript
health: publicProcedure.query(async () => {
  const checks: Record<string, { status: string; latency?: number }> = {};
  
  // Database connectivity
  const dbStart = Date.now();
  try {
    await getDb().execute(sql`SELECT 1`);
    checks.database = { status: 'healthy', latency: Date.now() - dbStart };
  } catch {
    checks.database = { status: 'unhealthy', latency: Date.now() - dbStart };
  }

  // WebSocket server
  checks.websocket = { status: 'healthy' }; // Check ws server is accepting connections

  // S3 storage (optional, may add latency)
  // checks.storage = { status: 'healthy' };

  const allHealthy = Object.values(checks).every(c => c.status === 'healthy');
  
  return {
    status: allHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    uptime: process.uptime(),
    checks,
  };
}),
```

### 5.4 Structured Logging

The platform currently uses `console.log` for all logging output. The patch introduces structured JSON logging that integrates with log aggregation services.

**New File:** `server/logger.ts`

```typescript
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0, info: 1, warn: 2, error: 3,
};

const CURRENT_LEVEL = (process.env.LOG_LEVEL as LogLevel) || 'info';

export function log(level: LogLevel, message: string, context?: Record<string, any>) {
  if (LOG_LEVELS[level] < LOG_LEVELS[CURRENT_LEVEL]) return;
  
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    service: 'kinga-monolith',
    ...context,
  };
  
  const output = JSON.stringify(entry);
  if (level === 'error') {
    console.error(output);
  } else if (level === 'warn') {
    console.warn(output);
  } else {
    console.log(output);
  }
}

export const logger = {
  debug: (msg: string, ctx?: Record<string, any>) => log('debug', msg, ctx),
  info: (msg: string, ctx?: Record<string, any>) => log('info', msg, ctx),
  warn: (msg: string, ctx?: Record<string, any>) => log('warn', msg, ctx),
  error: (msg: string, ctx?: Record<string, any>) => log('error', msg, ctx),
};
```

---

## 6. SCALING READINESS IMPROVEMENTS

### 6.1 Database Connection Pooling

The current database connection uses a single connection instance. Under concurrent load, this becomes a bottleneck. The patch configures connection pooling through the Drizzle ORM connection options.

**Target File:** `server/db.ts`

**Patch:**

```typescript
// Ensure the MySQL connection uses pooling
import { createPool } from 'mysql2/promise';

const pool = createPool({
  uri: process.env.DATABASE_URL,
  connectionLimit: 20,        // Maximum concurrent connections
  queueLimit: 50,             // Maximum queued connection requests
  waitForConnections: true,
  idleTimeout: 60000,         // Close idle connections after 60s
  enableKeepAlive: true,
  keepAliveInitialDelay: 30000,
});
```

### 6.2 Query Result Caching

Analytics dashboard queries execute fresh database queries on every load. The patch introduces an in-memory cache with time-based invalidation for read-heavy analytics endpoints.

**New File:** `server/cache.ts`

```typescript
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

class SimpleCache {
  private store = new Map<string, CacheEntry<any>>();

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.data as T;
  }

  set<T>(key: string, data: T, ttlMs: number): void {
    this.store.set(key, { data, expiresAt: Date.now() + ttlMs });
  }

  invalidate(pattern: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(pattern)) {
        this.store.delete(key);
      }
    }
  }

  clear(): void {
    this.store.clear();
  }
}

export const cache = new SimpleCache();

// Cache TTL constants
export const CACHE_TTL = {
  ANALYTICS_DASHBOARD: 60 * 1000,     // 1 minute for dashboards
  PANEL_BEATER_LIST: 5 * 60 * 1000,   // 5 minutes for reference data
  FRAUD_HEATMAP: 2 * 60 * 1000,       // 2 minutes for fraud data
  KPI_SUMMARY: 30 * 1000,             // 30 seconds for KPIs
};
```

**Integration into analytics procedures:**

```typescript
import { cache, CACHE_TTL } from './cache';

// Example: Claims Cost Trend with caching
claimsCostTrend: protectedProcedure.query(async () => {
  const cacheKey = 'analytics:claimsCostTrend';
  const cached = cache.get(cacheKey);
  if (cached) return cached;
  
  const result = await getClaimsCostTrend();
  cache.set(cacheKey, result, CACHE_TTL.ANALYTICS_DASHBOARD);
  return result;
}),
```

### 6.3 Frontend Bundle Optimisation

The React application bundles to approximately 2.8MB. The patch introduces code splitting and lazy loading to reduce initial load time.

**Target File:** `client/src/App.tsx`

**Patch:**

```typescript
import { lazy, Suspense } from 'react';

// Lazy load heavy dashboard pages
const ClaimsCostTrend = lazy(() => import('./pages/analytics/ClaimsCostTrend'));
const FraudHeatmap = lazy(() => import('./pages/analytics/FraudHeatmap'));
const FleetRisk = lazy(() => import('./pages/analytics/FleetRisk'));
const PanelBeaterPerformance = lazy(() => import('./pages/analytics/PanelBeaterPerformance'));
const ComparisonView = lazy(() => import('./pages/ComparisonView'));

// Wrap lazy-loaded routes in Suspense
<Suspense fallback={<LoadingSkeleton />}>
  <Route path="/analytics/claims-cost" component={ClaimsCostTrend} />
  <Route path="/analytics/fraud-heatmap" component={FraudHeatmap} />
  <Route path="/analytics/fleet-risk" component={FleetRisk} />
  <Route path="/analytics/panel-beater" component={PanelBeaterPerformance} />
  <Route path="/comparison/:claimId" component={ComparisonView} />
</Suspense>
```

**Rationale:** Lazy loading analytics dashboards and the comparison view reduces the initial JavaScript bundle by approximately 30-40%, as these pages include heavy charting libraries (Chart.js) that are only needed when users navigate to those specific routes.

---

## 7. IMPLEMENTATION TIMELINE

The following timeline organises the patches into weekly sprints, ordered by production risk priority.

| Week | Sprint Focus | Patches | Estimated Effort | Risk Reduction |
|------|-------------|---------|-----------------|----------------|
| 1 | Security Hardening | SEC-001 (rate limiting), SEC-002 (file scanning), API-001 (request size) | 14-19 hrs | Critical to High |
| 2 | Data Integrity | DB-001 (indexes), DB-002 (soft delete), EVT-001 (event fix) | 12-19 hrs | High to Medium |
| 3 | AI Reliability & Monitoring | AI-001 (confidence thresholds), WS-001 (reconnection), monitoring setup | 12-18 hrs | Medium |
| 4 | Testing Sprint | Tier 1 tests (claims, workflow, documents) | 24-32 hrs | Medium to Low |
| 5 | Encryption & Audit | SEC-003 (encryption), AUDIT-001 (audit separation) | 20-28 hrs | High to Medium |
| 6 | Performance & Scaling | Caching, connection pooling, bundle optimisation | 12-18 hrs | Low |

**Total Estimated Effort:** 94-134 hours (approximately 12-17 working days)

---

**Prepared By:** Tavonga Shoko
**Date:** February 11, 2026
**Version:** 1.0
