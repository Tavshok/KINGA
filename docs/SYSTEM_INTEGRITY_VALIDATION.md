# KINGA AutoVerify AI - System Integrity Validation Guide

## Overview

This document provides a comprehensive guide to validating the integrity of the KINGA AutoVerify AI platform across all critical dimensions: data persistence, governance enforcement, workflow compliance, and system observability.

---

## 1. Historical Claim Upload Validation

### Validation Points

**PDF Upload & AI Extraction:**
- Raw extracted text length logged
- Structured AI extraction JSON stored in `aiAssessments` table
- Missing fields detected and logged
- Parsing confidence score calculated and stored
- Extraction timestamp recorded in `createdAt` field

**Database Persistence:**
```sql
-- Verify AI assessment stored
SELECT * FROM aiAssessments WHERE claimId = ?;

-- Check extraction completeness
SELECT 
  claimId,
  fraudRiskLevel,
  estimatedCost,
  damageDescription,
  detectedDamageTypes,
  createdAt
FROM aiAssessments
WHERE claimId = ?;
```

**Expected Behavior:**
- All extracted fields persist in database
- Timestamps are immutable once created
- No silent failures during extraction

---

## 2. Confidence Scoring Validation

### Validation Points

**Immutable Score Calculation:**
- Confidence score calculated once at ingestion
- Score stored immutably per claim version
- Component breakdown includes:
  * Fraud risk contribution (30% weight)
  * Quote variance contribution (20% weight)
  * Claim completeness score (20% weight)
  * AI certainty (20% weight)
  * Claimant history impact (10% weight)

**Calculation Inputs Snapshot:**
```typescript
interface ConfidenceComponents {
  fraudRisk: number;        // 0-100
  quoteVariance: number;    // 0-100
  completeness: number;     // 0-100
  aiCertainty: number;      // 0-100
  claimantHistory: number;  // 0-100
}

// Weighted calculation
const overallConfidence = 
  fraudRisk * 0.3 +
  quoteVariance * 0.2 +
  completeness * 0.2 +
  aiCertainty * 0.2 +
  claimantHistory * 0.1;
```

**Database Verification:**
```sql
-- Verify confidence score unchanged after server restart
SELECT 
  id,
  claimId,
  estimatedCost AS confidenceScore,
  createdAt,
  updatedAt
FROM aiAssessments
WHERE claimId = ?;

-- Confidence score should remain constant
-- updatedAt should not change after initial calculation
```

---

## 3. Routing Engine Validation

### Validation Points

**Routing Decision Logging:**
- Routing category stored (HIGH/MEDIUM/LOW)
- Threshold values used at time of routing
- Routing reasoning documented
- Decision logged in `routingHistory` table
- Audit trail entry created in `auditTrail`

**Database Schema:**
```sql
-- routingHistory table
CREATE TABLE routingHistory (
  id INT AUTO_INCREMENT PRIMARY KEY,
  claimId INT NOT NULL,
  decision VARCHAR(50) NOT NULL,  -- 'fast_track', 'manual_review', 'escalate'
  reason TEXT,
  confidence INT,                 -- Threshold value at routing time
  timestamp DATETIME NOT NULL,
  FOREIGN KEY (claimId) REFERENCES claims(id)
);
```

**Verification Queries:**
```sql
-- Check routing decision persists
SELECT * FROM routingHistory WHERE claimId = ?;

-- Verify audit trail entry
SELECT * FROM auditTrail 
WHERE resourceId = ? 
AND action = 'routing_decision';
```

**Expected Behavior:**
- Routing decision immutable once made
- Threshold values snapshot preserved
- No routing changes after server restart

---

## 4. Workflow Engine Validation

### Validation Points

**State Transition Enforcement:**
- All transitions executed via `WorkflowEngine.transition()`
- Role validation passed before transition
- Segregation of duties validated
- Audit log written for every transition
- Direct DB updates detected and failed

**Workflow Audit Trail:**
```sql
-- Verify state transition logged
SELECT 
  userId,
  action,
  resourceType,
  resourceId,
  metadata,
  timestamp
FROM auditTrail
WHERE resourceId = ?
AND action = 'workflow_transition'
ORDER BY timestamp DESC;
```

**Segregation Validation:**
```sql
-- Check claim involvement tracking
SELECT 
  claimId,
  userId,
  role,
  actionType,
  timestamp
FROM claimInvolvementTracking
WHERE claimId = ?
ORDER BY timestamp;

-- Detect segregation violations
-- Same user should not perform conflicting roles
```

**Expected Behavior:**
- Zero direct DB updates outside WorkflowEngine
- All state changes have corresponding audit entries
- Segregation violations blocked before execution

---

## 5. Dashboard Integrity

### Validation Points

**Role-Based Visibility:**
- Claims appear in correct dashboard after ingestion
- Tenant isolation enforced (users only see own tenant's claims)
- Executive dashboard metrics updated in real-time
- Role-specific data filtering applied

**Verification:**
```sql
-- Claims visible to correct tenant
SELECT * FROM claims WHERE tenantId = ?;

-- Executive dashboard metrics
SELECT 
  COUNT(*) AS totalClaims,
  AVG(processingTime) AS avgProcessingTime,
  SUM(CASE WHEN status = 'fast_tracked' THEN 1 ELSE 0 END) AS fastTrackedCount
FROM claims
WHERE tenantId = ?;
```

**Expected Behavior:**
- Cross-tenant data leakage prevented
- Dashboard updates reflect latest claim status
- Metrics calculations accurate

---

## 6. Data Persistence Verification

### Validation Points

**Server Restart Validation:**
After restarting the dev server, verify:

1. **AI Extraction Still Present:**
```sql
SELECT * FROM aiAssessments WHERE claimId = ?;
```

2. **Confidence Score Unchanged:**
```sql
SELECT estimatedCost, createdAt, updatedAt 
FROM aiAssessments 
WHERE claimId = ?;
-- updatedAt should equal createdAt (no modifications)
```

3. **Routing Unchanged:**
```sql
SELECT * FROM routingHistory WHERE claimId = ?;
```

4. **Audit Trail Intact:**
```sql
SELECT COUNT(*) FROM auditTrail WHERE resourceId = ?;
-- Count should match pre-restart count
```

**Expected Behavior:**
- Zero data loss after server restart
- All timestamps preserved
- Audit trail continuity maintained

---

## 7. Integrity Report Structure

### Report Format

```typescript
interface IntegrityReport {
  modules: {
    [moduleName: string]: {
      status: "PASS" | "FAIL";
      checks: Array<{
        name: string;
        passed: boolean;
        message?: string;
        timing?: number;  // milliseconds
      }>;
      timing: number;  // total module timing
    };
  };
  overallStatus: "PASS" | "FAIL";
  totalTiming: number;
  silentFailures: string[];
  missingPersistence: string[];
}
```

### Example Report Output

```
========================================
SYSTEM INTEGRITY REPORT
========================================

[PASS] Historical Claim Upload (45.23ms)
────────────────────────────────────────────────────────────
  ✓ Upload PDF and extract structured data (12.45ms)
  ✓ Log extraction metadata (8.67ms)
  ✓ Detect missing fields (3.21ms)

[PASS] Confidence Scoring (32.15ms)
────────────────────────────────────────────────────────────
  ✓ Calculate confidence score once at ingestion (15.32ms)
  ✓ Store confidence score immutably (8.91ms)

[PASS] Routing Engine (28.47ms)
────────────────────────────────────────────────────────────
  ✓ Store routing decision with metadata (12.34ms)
  ✓ Log routing decision in audit trail (9.87ms)

[PASS] Workflow Engine (41.89ms)
────────────────────────────────────────────────────────────
  ✓ Execute state transition via WorkflowEngine (18.92ms)
  ✓ Validate role and segregation of duties (11.45ms)
  ✓ Write audit log for state transition (7.62ms)

[PASS] Dashboard Integrity (19.34ms)
────────────────────────────────────────────────────────────
  ✓ Display claim in correct dashboard (8.23ms)
  ✓ Enforce role-based visibility (6.45ms)

[PASS] Data Persistence (52.67ms)
────────────────────────────────────────────────────────────
  ✓ Persist AI extraction after server restart (15.67ms)
  ✓ Persist confidence score unchanged (12.34ms)
  ✓ Persist routing decision (10.89ms)
  ✓ Persist audit trail intact (13.77ms)

========================================
OVERALL STATUS: PASS
TOTAL TIMING: 219.75ms
========================================
```

---

## 8. Automated Test Suite

### Test File Location
`server/e2e-integrity.test.ts`

### Running Tests

```bash
# Run full integrity test suite
pnpm test server/e2e-integrity.test.ts

# Run with verbose output
pnpm test server/e2e-integrity.test.ts --reporter=verbose

# Run specific test module
pnpm test server/e2e-integrity.test.ts -t "Routing Engine Validation"
```

### Test Coverage

- **Historical Claim Upload:** 3 tests
- **Confidence Scoring:** 2 tests
- **Routing Engine:** 2 tests
- **Workflow Engine:** 3 tests
- **Dashboard Integrity:** 2 tests
- **Data Persistence:** 4 tests

**Total:** 16 comprehensive validation tests

---

## 9. Governance Enforcement Checks

### Zero Governance Bypass

**Validation:**
- All claim state transitions go through WorkflowEngine
- No direct DB updates outside approved services
- Segregation of duties enforced at code level
- Role-based access control validated before every action

**Monitoring:**
```sql
-- Detect direct DB updates (should be zero)
SELECT * FROM auditTrail 
WHERE action NOT IN ('workflow_transition', 'routing_decision', 'ai_assessment')
AND resourceType = 'claim'
AND timestamp > NOW() - INTERVAL 1 DAY;
```

### Audit Trail Completeness

**Validation:**
- Every claim action has audit entry
- Timestamps are sequential
- User attribution is complete
- Metadata includes before/after state

**Verification:**
```sql
-- Check audit trail completeness
SELECT 
  claimId,
  COUNT(*) AS auditEntryCount,
  MIN(timestamp) AS firstAction,
  MAX(timestamp) AS lastAction
FROM auditTrail
WHERE resourceType = 'claim'
GROUP BY claimId;
```

---

## 10. Performance Benchmarks

### Expected Timing Thresholds

| Module | Target (ms) | Warning (ms) | Critical (ms) |
|--------|-------------|--------------|---------------|
| Claim Upload | < 50 | 50-100 | > 100 |
| Confidence Scoring | < 30 | 30-60 | > 60 |
| Routing Decision | < 25 | 25-50 | > 50 |
| Workflow Transition | < 40 | 40-80 | > 80 |
| Dashboard Query | < 20 | 20-40 | > 40 |
| Data Persistence | < 60 | 60-120 | > 120 |

### Performance Monitoring

```sql
-- Average processing time per module
SELECT 
  action,
  AVG(TIMESTAMPDIFF(MICROSECOND, timestamp, LEAD(timestamp) OVER (ORDER BY timestamp))) / 1000 AS avgTimeMs
FROM auditTrail
WHERE resourceType = 'claim'
GROUP BY action;
```

---

## 11. Silent Failure Detection

### Common Silent Failures

1. **Missing Audit Entries:** State changes without audit logs
2. **Incomplete Extractions:** AI assessments with null fields
3. **Orphaned Records:** Claims without assessments or routing decisions
4. **Stale Timestamps:** `updatedAt` not reflecting actual changes
5. **Cross-Tenant Leakage:** Claims visible to wrong tenants

### Detection Queries

```sql
-- Claims without AI assessments
SELECT c.id, c.claimNumber 
FROM claims c
LEFT JOIN aiAssessments a ON c.id = a.claimId
WHERE a.id IS NULL;

-- Claims without routing decisions
SELECT c.id, c.claimNumber
FROM claims c
LEFT JOIN routingHistory r ON c.id = r.claimId
WHERE r.id IS NULL;

-- Audit trail gaps
SELECT 
  claimId,
  COUNT(*) AS actionCount
FROM auditTrail
WHERE resourceType = 'claim'
GROUP BY claimId
HAVING actionCount < 3;  -- Expect at least: ingestion, routing, workflow
```

---

## 12. Continuous Monitoring

### Health Checks

**Daily Integrity Scan:**
1. Run automated test suite
2. Generate integrity report
3. Check for silent failures
4. Verify data persistence
5. Validate governance enforcement

**Alerting Thresholds:**
- Any test failure → Immediate alert
- Performance degradation > 50% → Warning
- Silent failures detected → Investigation required
- Audit trail gaps → Critical alert

### Operational Readiness Dashboard

Access at: `/admin/operational-health`

**Metrics Monitored:**
- Governance Health (workflow compliance, segregation violations)
- Data Integrity (missing documents, incomplete states, orphaned records)
- Performance (load times, processing times, query efficiency)
- AI Stability (confidence scores, escalation rates, variance distribution)

---

## Conclusion

The KINGA AutoVerify AI platform implements comprehensive integrity validation across all critical dimensions. The automated test suite provides continuous verification of data persistence, governance enforcement, and system reliability. Regular monitoring and alerting ensure operational excellence and regulatory compliance.

For questions or issues, refer to the Platform Super Admin Observability Mode at `/platform/overview`.
