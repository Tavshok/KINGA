# KINGA AutoVerify AI Platform
# Continuous Stability Gates

**Author:** Tavonga Shoko
**Date:** February 11, 2026
**Document Reference:** KINGA-CSG-2026-004
**Classification:** Internal Engineering — Release Governance
**Parent Document:** KINGA-ESP-2026-003 (Engineering Sprint Plan)
**Scope:** Stability, regression, and release governance overlay for Sprints 1–4

---

## Executive Summary

This document defines the Continuous Stability Gates that overlay the existing four-sprint engineering plan (KINGA-ESP-2026-003) without modifying sprint objectives. Each sprint inherits a structured gate comprising seven governance dimensions: regression testing, performance baseline comparison, AI model output validation, database integrity verification, rollback and disaster recovery preparation, deployment safety validation, and monitoring and alert activation. The gates are designed to ensure that each sprint produces a release-safe build, that new fixes do not introduce regressions, that AI models maintain prediction consistency, that system performance does not degrade, and that data integrity remains preserved throughout the remediation programme. A sprint build may only be promoted to the next environment (staging or production) after passing every mandatory gate criterion. Conditional criteria are flagged as such and may be deferred with documented justification.

---

## 1. Gate Architecture

The Continuous Stability Gate operates as a mandatory checkpoint between sprint completion and build promotion. No sprint deliverable may be merged to the release branch or deployed to staging until the gate is satisfied. The gate is structured into seven dimensions, each with specific pass/fail criteria that are evaluated through automated tests, manual verification, or observational evidence.

| Dimension | Gate ID | Evaluation Method | Blocking |
|---|---|---|---|
| Regression Testing | G1 | Automated (`pnpm test`) | Yes — zero regressions permitted |
| Performance Baseline Comparison | G2 | Automated + manual benchmark | Yes — no degradation beyond threshold |
| AI Model Output Validation | G3 | Automated (deterministic test vectors) | Yes — output drift beyond tolerance blocks release |
| Database Integrity Verification | G4 | Automated (constraint checks + data audits) | Yes — any orphan or corruption blocks release |
| Rollback and Disaster Recovery | G5 | Manual (procedure verification) | Yes — untested rollback blocks release |
| Deployment Safety Validation | G6 | Automated (build + health check) | Yes — failed health check blocks release |
| Monitoring and Alert Activation | G7 | Manual (dashboard + alert verification) | Conditional — required from Sprint 2 onward |

The following diagram illustrates the gate position within the sprint lifecycle:

```
Sprint Work → Code Complete → Peer Review → Stability Gate [G1–G7] → Build Promotion → Next Sprint
                                                    ↓ (fail)
                                              Fix → Re-evaluate Gate
```

A gate failure triggers a remediation loop. The failing dimension must be resolved and the gate re-evaluated before the build is promoted. Gate re-evaluation does not require re-running all seven dimensions; only the failing dimension and G1 (regression) must be re-executed.

---

## 2. Sprint 1 Stability Gate — Security Hardening and Core Workflow Repair

Sprint 1 addresses failures F-001, F-005, F-007, F-008, F-011, F-013, and F-019. The primary risk domains are security regression (new middleware may break existing functionality), data corruption (encryption migration may damage PII), and workflow regression (approval fix may affect adjacent claim procedures).

### 2.1 Stability Gate Checklist

| Gate | Check | Pass Criterion | Tool / Command |
|---|---|---|---|
| G1-S1-01 | Baseline regression suite | All 212 previously passing tests remain green | `pnpm test` — 0 failures in baseline files |
| G1-S1-02 | New test coverage for Sprint 1 fixes | All new tests for F-001, F-005, F-007, F-008, F-011, F-013, F-019 pass | `pnpm test` — new test files show 0 failures |
| G1-S1-03 | Cross-fix interaction regression | File scanner does not reject legitimate uploads; Helmet CSP does not block application resources; encryption does not break API responses | Manual smoke test: submit claim with images, verify dashboard loads, verify API returns decrypted PII |
| G2-S1-01 | API response time baseline | All tRPC endpoints respond within 500ms at p95 under single-user load | `autocannon -c 1 -d 30 http://localhost:3000/api/trpc/claims.list` |
| G2-S1-02 | Encryption overhead measurement | Encrypt/decrypt cycle adds no more than 50ms per field at p99 | Benchmark: 1000 encrypt-decrypt cycles, measure mean and p99 |
| G2-S1-03 | Upload endpoint latency | File upload with scanner adds no more than 200ms compared to pre-scanner baseline | Benchmark: upload 5MB image with and without scanner, compare |
| G3-S1-01 | Fraud detection output stability | Fraud risk scores for 5 reference claims remain unchanged (within 0.01 tolerance) | Run fraud scoring on reference dataset, compare to baseline snapshot |
| G3-S1-02 | AI assessment output stability | LLM-based damage assessment for 3 reference images produces consistent cost estimates (within 10% tolerance) | Invoke assessment procedure with reference images, compare to baseline |
| G4-S1-01 | PII encryption migration integrity | All migrated PII fields decrypt to their original plaintext values | Select 50 random records, decrypt, compare to pre-migration backup |
| G4-S1-02 | Foreign key integrity | Zero orphaned records across all tables with foreign key relationships | `SELECT COUNT(*) FROM claims WHERE userId NOT IN (SELECT id FROM users)` — returns 0 |
| G4-S1-03 | Audit trail completeness | Every claim approval creates exactly one audit trail entry | `SELECT c.id FROM claims c LEFT JOIN audit_trail a ON c.id = a.claimId AND a.action = 'approved' WHERE c.status = 'approved' AND a.id IS NULL` — returns 0 rows |
| G5-S1-01 | Database backup verified | Full database backup created and restoration tested on staging | Backup created, restored to staging, row counts match |
| G5-S1-02 | Encryption rollback procedure documented | Procedure to decrypt all PII and remove encryption layer exists and has been tested | Execute rollback on staging, verify plaintext restoration |
| G5-S1-03 | Git checkpoint created | `webdev_save_checkpoint` executed with Sprint 1 completion tag | Checkpoint version ID recorded |
| G6-S1-01 | TypeScript compilation | Zero TypeScript errors | `pnpm tsc --noEmit` exits with code 0 |
| G6-S1-02 | Server startup health | Server starts and responds to health check within 10 seconds | `curl -f http://localhost:3000/api/trpc/auth.me` returns 200 or 401 (not 500) |
| G6-S1-03 | Security header verification | All Helmet headers present in HTTP responses | `curl -I http://localhost:3000/` includes `Content-Security-Policy`, `X-Frame-Options`, `Strict-Transport-Security` |
| G7-S1-01 | Error logging operational | Application errors are captured in structured logs | Trigger deliberate error, verify log output contains error details |

### 2.2 Automated Testing Requirements

The following test commands must execute successfully as a single CI pipeline step. Failure of any command blocks the gate.

| Step | Command | Expected Result | Timeout |
|---|---|---|---|
| 1 | `pnpm tsc --noEmit` | Exit code 0 | 60s |
| 2 | `pnpm test` | 0 failures, 0 unexpected skips | 120s |
| 3 | `curl -I http://localhost:3000/ 2>&1 \| grep -c "Content-Security-Policy"` | Output: 1 | 10s |
| 4 | Upload `eicar.com` test file via tRPC upload procedure | Response: 400 BAD_REQUEST | 15s |
| 5 | Submit `<script>alert(1)</script>` in claim description field | Stored value contains escaped HTML, not raw script tag | 10s |
| 6 | Connect WebSocket without Authorization header | Connection rejected (close code 4001) | 10s |
| 7 | Query encrypted PII field via tRPC, verify plaintext returned | Response contains readable name/email, not ciphertext | 10s |
| 8 | Inspect same field directly in database | Column value is base64-encoded ciphertext | 10s |

### 2.3 Release Readiness Criteria

| Criterion | Threshold | Status Required |
|---|---|---|
| Test pass rate | ≥ 94.5% (260/275 tests) | Mandatory |
| Zero regressions in baseline 212 tests | 212/212 pass | Mandatory |
| Security headers present on all responses | 100% coverage | Mandatory |
| Encryption migration: zero data loss | 100% field-level verification | Mandatory |
| Approval workflow: `claims.approveClaim.test.ts` all pass | 8/8 assertions | Mandatory |
| Analytics queries return non-zero `approved_amount` | Verified on test dataset | Mandatory |
| TypeScript compilation: zero errors | 0 errors | Mandatory |
| Peer review completed for all Sprint 1 PRs | All PRs approved | Mandatory |

### 2.4 Rollback Procedure

Sprint 1 introduces encryption at rest, which is the highest-risk change requiring a specific rollback strategy.

| Scenario | Trigger | Rollback Action | Recovery Time Objective |
|---|---|---|---|
| Encryption migration corrupts PII | Post-migration data audit (G4-S1-01) fails | Restore database from pre-migration backup. Remove encryption middleware from `server/routers.ts`. Redeploy with `webdev_rollback_checkpoint` to pre-Sprint 1 version. | 30 minutes |
| Helmet CSP blocks critical resources | Application pages fail to load after Helmet deployment | Remove Helmet middleware or switch to `contentSecurityPolicy: false` in Helmet config. Restart server. | 5 minutes |
| File scanner rejects legitimate files | Users report inability to upload valid images/PDFs | Set `SKIP_FILE_SCAN=true` environment variable (feature flag). Scanner bypasses validation when flag is set. Investigate MIME type mapping. | 2 minutes |
| Approval workflow fix breaks claim creation | `claims.create` tests fail after F-019 fix | `webdev_rollback_checkpoint` to pre-Sprint 1 version. Isolate approval fix from creation procedure. | 15 minutes |

The rollback procedure for encryption is the most complex and must be rehearsed on staging before Sprint 1 is declared complete. The rehearsal involves: (1) creating a backup, (2) running the encryption migration, (3) verifying encrypted data, (4) executing the rollback, and (5) verifying restored plaintext. This rehearsal must be documented with timestamps and outcomes.

### 2.5 Risk Containment Strategy

| Risk | Containment Measure |
|---|---|
| Encryption key exposure | Store encryption key exclusively in environment variables via `webdev_request_secrets`. Never commit to source control. Rotate key immediately if exposure is suspected. Implement key versioning to support rotation without re-encrypting all data. |
| XSS bypass via novel vector | Deploy sanitisation as a tRPC middleware (applied globally) rather than per-procedure, ensuring no procedure is missed. Add a `Content-Type: application/json` enforcement header to prevent MIME sniffing attacks. |
| Rate limiter bypass via IPv6 | Accept the known IPv6 warning (F-017 deferred to Sprint 4) but document the risk. Monitor rate limiter effectiveness via server logs. |
| Approval workflow partial fix | If the approval procedure passes tests but analytics still show zero `approved_amount`, the dependency chain (F-019 → F-011) has a gap. Escalate to Sprint 2 if not resolved by Day 8. |

---

## 3. Sprint 2 Stability Gate — AI Model Corrections and Observability Foundation

Sprint 2 addresses failures F-003, F-004, F-006, F-009, F-010, and F-012. The primary risk domains are AI model output drift (formula corrections may change fraud scoring behaviour), performance regression (new indexes and logging may affect query times), and observability blind spots (metrics endpoint must not expose sensitive data).

### 3.1 Stability Gate Checklist

| Gate | Check | Pass Criterion | Tool / Command |
|---|---|---|---|
| G1-S2-01 | Full regression suite | All Sprint 1 tests + baseline tests pass (≥ 275 tests, 0 failures) | `pnpm test` |
| G1-S2-02 | Sprint 1 security gates still pass | Helmet headers present, file scanner rejects malicious files, WebSocket auth enforced, encryption intact | Re-run G6-S1-03, Step 4, Step 6, Step 7 from Sprint 1 gate |
| G2-S2-01 | Query performance with new indexes | Analytics aggregate queries execute in < 200ms | `EXPLAIN ANALYZE` on claims cost trend, fraud heatmap, fleet risk, panel beater performance queries |
| G2-S2-02 | Logging overhead | Pino structured logging adds no more than 5ms per request at p99 | Benchmark: 1000 requests with and without Pino, compare response times |
| G2-S2-03 | Metrics endpoint performance | `/metrics` endpoint responds in < 100ms | `autocannon -c 5 -d 10 http://localhost:3000/metrics` |
| G3-S2-01 | Physics formula accuracy — momentum | Conservation of momentum: 1500kg at 60km/h rear-ends 1200kg stationary → post-collision velocities within 5% of analytical solution | `pnpm test server/advancedPhysics.test.ts` — momentum tests pass |
| G3-S2-02 | Physics formula accuracy — friction | Skid mark analysis: 30m on dry asphalt (f=0.7) → speed estimate 64.3 km/h ± 2% | `pnpm test server/advancedPhysics.test.ts` — friction tests pass |
| G3-S2-03 | Physics formula accuracy — rollover | Sedan (T=1.5m, h_cg=0.55m) at 80km/h → no rollover (SSF=1.36) | `pnpm test server/advancedPhysics.test.ts` — rollover tests pass |
| G3-S2-04 | Vehicle valuation accuracy | Market value $20,000 → salvage $3,000, payout $17,000. Mileage adjustment within 5% of reference. | `pnpm test server/vehicleValuation.test.ts` — all 7 tests pass |
| G3-S2-05 | Fraud scoring consistency | Run fraud scoring on 5 reference claims. Scores must match Sprint 1 baseline within 0.05 tolerance, OR documented justification for score change due to corrected formulas. | Compare fraud scores pre/post Sprint 2 for reference dataset |
| G3-S2-06 | AI assessment consistency | LLM damage assessment for 3 reference images produces cost estimates within 10% of Sprint 1 baseline | Invoke assessment, compare to Sprint 1 snapshot |
| G4-S2-01 | Index creation verification | All composite indexes exist and are used by query planner | `SHOW INDEX FROM claims` confirms new indexes; `EXPLAIN` confirms index usage |
| G4-S2-02 | Encryption still intact | PII columns remain encrypted after schema migration for indexes | Spot-check 10 records: database shows ciphertext, API returns plaintext |
| G4-S2-03 | No data loss from index migration | Row counts unchanged across all tables before and after `pnpm db:push` | Compare `SELECT COUNT(*)` for all 28 tables pre/post migration |
| G5-S2-01 | Checkpoint created | Sprint 2 completion checkpoint saved | Version ID recorded |
| G5-S2-02 | Sprint 1 rollback still viable | Pre-Sprint 1 checkpoint can still be restored | Verify checkpoint exists in version history |
| G6-S2-01 | TypeScript compilation | Zero errors | `pnpm tsc --noEmit` |
| G6-S2-02 | Server startup with metrics | Server starts, `/metrics` endpoint responds, no sensitive data exposed | `curl localhost:3000/metrics` returns metrics; grep for PII patterns returns 0 matches |
| G6-S2-03 | WebSocket URL dynamic | WebSocket connects in non-localhost environment | Test WebSocket connection with production-like URL |
| G7-S2-01 | Prometheus scraping | Prometheus successfully scrapes `/metrics` at 15-second intervals | Prometheus targets page shows `UP` status for application target |
| G7-S2-02 | Key metrics present | `http_request_duration_seconds`, `http_requests_total`, `db_query_duration_seconds`, `claims_created_total`, `fraud_detections_total` all present | `curl localhost:3000/metrics \| grep -c "# HELP"` ≥ 5 |
| G7-S2-03 | Structured logs operational | All server log output is valid JSON with correlation IDs | `grep -c "console.log" server/*.ts` returns 0 (excluding test files) |

### 3.2 Automated Testing Requirements

| Step | Command | Expected Result | Timeout |
|---|---|---|---|
| 1 | `pnpm tsc --noEmit` | Exit code 0 | 60s |
| 2 | `pnpm test` | 0 failures across all test files | 180s |
| 3 | `pnpm test server/advancedPhysics.test.ts` | 15/15 pass | 30s |
| 4 | `pnpm test server/accidentPhysics.test.ts` | 11/11 pass | 30s |
| 5 | `pnpm test server/vehicleValuation.test.ts` | 7/7 pass | 30s |
| 6 | `curl -s localhost:3000/metrics \| head -1` | Starts with `# HELP` or `# TYPE` | 10s |
| 7 | `curl -s localhost:3000/metrics \| grep -i "password\|email\|name\|phone"` | Empty output (no PII in metrics) | 10s |
| 8 | `grep -rn "console.log" server/*.ts \| grep -v test \| grep -v node_modules` | Empty output | 10s |
| 9 | Re-run Sprint 1 security gate steps 3–8 | All pass | 60s |

### 3.3 Release Readiness Criteria

| Criterion | Threshold | Status Required |
|---|---|---|
| Test pass rate | ≥ 98.3% (285/290 tests) | Mandatory |
| Zero regressions in Sprint 1 deliverables | All Sprint 1 gate checks pass | Mandatory |
| All physics formula tests pass | 15/15 advanced, 11/11 accident | Mandatory |
| All vehicle valuation tests pass | 7/7 | Mandatory |
| Fraud score drift documented | Drift report for 5 reference claims | Mandatory |
| Prometheus scraping confirmed | Target status: UP | Mandatory |
| No PII in metrics endpoint | Grep verification | Mandatory |
| Structured logging: zero console.log | Grep verification | Mandatory |
| TypeScript compilation: zero errors | 0 errors | Mandatory |

### 3.4 Rollback Procedure

| Scenario | Trigger | Rollback Action | Recovery Time Objective |
|---|---|---|---|
| Physics formula corrections produce worse fraud detection accuracy | Fraud score drift exceeds 0.10 for reference claims without documented justification | Revert `server/advancedPhysics.ts` to Sprint 1 version. Keep all other Sprint 2 changes. Re-run gate G3. | 15 minutes |
| Database indexes cause query performance degradation | `EXPLAIN ANALYZE` shows full table scans or increased query time | Drop new indexes via `ALTER TABLE ... DROP INDEX`. Re-run gate G2. | 10 minutes |
| Pino logging causes memory leak or excessive disk usage | Server memory exceeds 512MB or log files exceed 1GB/day | Revert to `console.log` temporarily. Set Pino log level to `error` only. Investigate buffer configuration. | 5 minutes |
| Metrics endpoint exposes sensitive data | PII patterns detected in `/metrics` output | Disable `/metrics` endpoint immediately. Review custom metric labels for PII leakage. Redeploy with sanitised labels. | 2 minutes |
| Full Sprint 2 rollback required | Multiple gate failures that cannot be resolved within 2 days | `webdev_rollback_checkpoint` to Sprint 1 completion version. All Sprint 2 work re-enters backlog. | 30 minutes |

### 3.5 Risk Containment Strategy

| Risk | Containment Measure |
|---|---|
| Physics formula corrections change fraud scoring behaviour | Create a "fraud score baseline snapshot" before Sprint 2 begins. After formula corrections, compare new scores against baseline. Document every score change with the mathematical justification (corrected formula, reference standard, expected delta). Accept score changes only when the corrected formula is demonstrably more accurate than the original. |
| Prometheus metrics cardinality explosion | Limit custom metric labels to low-cardinality values (status codes, claim statuses, user roles). Never use user IDs, claim IDs, or timestamps as metric labels. Set `prom-client` default label limit to prevent unbounded label growth. |
| Structured logging performance impact | Configure Pino with `level: 'info'` in production and `level: 'debug'` in development. Use asynchronous transport (`pino.destination()`) to prevent logging from blocking the event loop. Set log rotation at 100MB per file. |
| Index migration on production database | Run `EXPLAIN` on all affected queries before and after index creation. Create indexes with `CREATE INDEX IF NOT EXISTS` to prevent duplicate index errors. Schedule index creation during low-traffic window. |

---

## 4. Sprint 3 Stability Gate — Scalability Infrastructure and Regulatory Compliance

Sprint 3 addresses failures F-002, F-014, F-015, and F-022. The primary risk domains are infrastructure instability (Kafka deployment may fail or cause resource contention), data privacy regression (POPIA deletion may corrupt related records), and test reliability (E2E tests may be brittle due to asynchronous event propagation).

### 4.1 Stability Gate Checklist

| Gate | Check | Pass Criterion | Tool / Command |
|---|---|---|---|
| G1-S3-01 | Full regression suite | All Sprint 1 + Sprint 2 tests pass (≥ 290 tests, 0 failures) | `pnpm test` |
| G1-S3-02 | Sprint 1 and Sprint 2 gates still pass | Security headers, encryption, file scanner, physics formulas, metrics endpoint all functional | Re-run G1-S2-02 and Sprint 2 automated steps |
| G2-S3-01 | Kafka resource consumption | Kafka cluster uses < 2GB RAM total across all containers | `docker stats --no-stream` for Kafka containers |
| G2-S3-02 | Event propagation latency | Claim submission event reaches Kafka topic within 500ms | Timestamp comparison: claim creation time vs Kafka message timestamp |
| G2-S3-03 | Application performance under event load | API response times do not degrade by more than 10% with Kafka event emission enabled | Benchmark: 100 claim list queries with event integration enabled vs disabled |
| G2-S3-04 | Notification delivery latency | Notification appears in user's notification list within 5 seconds of triggering event | Submit claim, poll notifications endpoint, measure time to first notification |
| G3-S3-01 | Fraud scoring unaffected by Kafka | Fraud risk scores for 5 reference claims match Sprint 2 baseline (within 0.01) | Run fraud scoring with event integration enabled, compare to Sprint 2 snapshot |
| G3-S3-02 | AI assessment unaffected by Kafka | LLM assessment cost estimates for 3 reference images match Sprint 2 baseline (within 10%) | Invoke assessment with event integration enabled, compare to Sprint 2 snapshot |
| G4-S3-01 | POPIA deletion integrity | Soft-deleted user's PII is anonymised; related claims and documents are soft-deleted; no orphaned records created | Execute deletion for test user, verify: PII fields = `[REDACTED]`, `deletedAt` populated, foreign key integrity preserved |
| G4-S3-02 | POPIA export completeness | Data export includes all user PII, claims, documents, audit trail entries, and notifications | Execute export for test user with known data, verify all records present |
| G4-S3-03 | POPIA export decrypts encrypted fields | Exported data contains readable plaintext, not AES-256-GCM ciphertext | Verify export JSON fields are human-readable |
| G4-S3-04 | Kafka does not corrupt claim data | Claims created with event integration enabled have identical database records to claims created without | Compare field-by-field: claim created with events vs claim created without events |
| G4-S3-05 | Notification table integrity | No duplicate notifications for single events; no notifications for non-existent users | `SELECT claimId, userId, type, COUNT(*) FROM notifications GROUP BY claimId, userId, type HAVING COUNT(*) > 1` returns 0 rows |
| G5-S3-01 | Kafka disaster recovery | Kafka cluster can be stopped and restarted without data loss | Stop Kafka, restart, verify pending events are still in topics |
| G5-S3-02 | Application resilience without Kafka | Application continues to function (without events) when Kafka is unavailable | Stop Kafka containers, verify API endpoints still respond, verify synchronous fallback activates |
| G5-S3-03 | Checkpoint created | Sprint 3 completion checkpoint saved | Version ID recorded |
| G5-S3-04 | POPIA deletion rollback | Soft-deleted data can be restored within retention window | Execute deletion, then restore by clearing `deletedAt` and restoring PII from audit log |
| G6-S3-01 | TypeScript compilation | Zero errors | `pnpm tsc --noEmit` |
| G6-S3-02 | Server startup with Kafka | Server starts and connects to Kafka within 30 seconds | Server logs show `[EventIntegration] Connected to Kafka` |
| G6-S3-03 | Server startup without Kafka | Server starts and operates in degraded mode when Kafka is unavailable | Server logs show `[EventIntegration] Kafka unavailable, falling back to synchronous mode` |
| G6-S3-04 | E2E test suite passes | Complete claim lifecycle test passes end-to-end | `pnpm test tests/e2e-claim-lifecycle.test.ts` |
| G7-S3-01 | Kafka metrics in Prometheus | Kafka-related metrics (event emission count, event latency) appear in `/metrics` | `curl localhost:3000/metrics \| grep "kafka"` returns results |
| G7-S3-02 | Notification delivery metrics | Notification success/failure counts appear in `/metrics` | `curl localhost:3000/metrics \| grep "notification"` returns results |
| G7-S3-03 | Alert rules configured | Prometheus alert rules fire for: Kafka disconnection, notification delivery failure, API error rate > 5% | Simulate Kafka disconnection, verify alert fires within 60 seconds |

### 4.2 Automated Testing Requirements

| Step | Command | Expected Result | Timeout |
|---|---|---|---|
| 1 | `pnpm tsc --noEmit` | Exit code 0 | 60s |
| 2 | `pnpm test` | 0 failures across all test files | 240s |
| 3 | `pnpm test tests/e2e-claim-lifecycle.test.ts` | All lifecycle tests pass | 120s |
| 4 | `docker-compose -f deployment/kafka/docker-compose.yml ps` | 3 brokers + 1 zookeeper showing `healthy` | 10s |
| 5 | Submit claim via tRPC, wait 5s, query Kafka topic | Event present in `claim.submitted` topic | 15s |
| 6 | Submit claim via tRPC, wait 5s, query notifications | Notification present for assigned insurer | 15s |
| 7 | Execute `dataSubject.exportData` for test user | JSON response contains all expected records | 30s |
| 8 | Execute `dataSubject.requestDeletion` for test user | PII anonymised, `deletedAt` populated | 30s |
| 9 | Stop Kafka containers, submit claim via tRPC | Claim created successfully (degraded mode) | 30s |
| 10 | Re-run Sprint 1 and Sprint 2 gate automated steps | All pass | 120s |

### 4.3 Release Readiness Criteria

| Criterion | Threshold | Status Required |
|---|---|---|
| Test pass rate | ≥ 98.5% (325/330 tests) | Mandatory |
| Zero regressions in Sprint 1 and Sprint 2 deliverables | All prior gate checks pass | Mandatory |
| E2E lifecycle test passes | All 7 status transitions validated | Mandatory |
| Kafka cluster operational | 3 brokers healthy | Mandatory |
| Application resilient to Kafka failure | Degraded mode functional | Mandatory |
| POPIA export verified | Complete data package returned | Mandatory |
| POPIA deletion verified | PII anonymised, integrity preserved | Mandatory |
| Notification delivery verified | All event types trigger notifications | Mandatory |
| Fraud score consistency maintained | Drift within 0.01 of Sprint 2 baseline | Mandatory |
| TypeScript compilation: zero errors | 0 errors | Mandatory |

### 4.4 Rollback Procedure

| Scenario | Trigger | Rollback Action | Recovery Time Objective |
|---|---|---|---|
| Kafka deployment destabilises application | API error rate exceeds 5% after Kafka deployment | Stop Kafka containers. Set `KAFKA_ENABLED=false` environment variable. Restart application in synchronous mode. | 5 minutes |
| POPIA deletion corrupts related records | Foreign key violations or orphaned records detected after deletion | Restore database from pre-Sprint 3 backup. Revert POPIA procedures. Investigate cascade logic. | 30 minutes |
| E2E tests are unreliable (flaky) | E2E tests pass/fail inconsistently across 3 consecutive runs | Quarantine flaky tests (move to `tests/quarantine/`). Do not block gate on quarantined tests. Investigate timing dependencies. | 10 minutes |
| Notification service creates duplicate notifications | Duplicate notification records detected (G4-S3-05 fails) | Stop notification service. Deduplicate notifications via SQL. Add idempotency key to notification creation. Restart service. | 15 minutes |
| Full Sprint 3 rollback required | Multiple gate failures unresolvable within 2 days | `webdev_rollback_checkpoint` to Sprint 2 completion version. Stop Kafka containers. Remove POPIA procedures. | 45 minutes |

### 4.5 Risk Containment Strategy

| Risk | Containment Measure |
|---|---|
| Kafka broker failure causes event loss | Configure Kafka with `replication.factor=3` and `min.insync.replicas=2` to ensure events survive single-broker failure. Implement dead-letter queue for events that fail processing after 3 retries. |
| POPIA deletion cascade deletes too much data | Implement soft-delete only (set `deletedAt`, anonymise PII) rather than hard-delete. Retain anonymised records for audit trail compliance. Add a 30-day grace period before anonymisation is irreversible. |
| Event integration introduces latency | Emit events asynchronously (fire-and-forget) from the main request path. The tRPC procedure should return to the client before the event is confirmed in Kafka. Use a background worker for event emission. |
| E2E test environment contamination | Create isolated test fixtures that generate unique test data for each E2E run. Use database transactions that roll back after each test. Never share test data between E2E test scenarios. |

---

## 5. Sprint 4 Stability Gate — Optimisation and Post-Launch Hardening

Sprint 4 addresses failures F-016, F-017, F-018, F-020, and F-021. The primary risk domains are functional regression (PDF extraction library change may produce different output), performance regression (connection pooling changes may cause intermittent failures), and data lifecycle risk (retention policy may accidentally delete active data).

### 5.1 Stability Gate Checklist

| Gate | Check | Pass Criterion | Tool / Command |
|---|---|---|---|
| G1-S4-01 | Full regression suite | All tests from Sprints 1–3 pass (≥ 330 tests, 0 failures) | `pnpm test` |
| G1-S4-02 | All prior sprint gates pass | Security, AI model, database integrity, Kafka, POPIA all functional | Re-run automated steps from Sprints 1–3 |
| G1-S4-03 | New Sprint 4 tests pass | Data retention, police report, PDF extraction, connection pool tests all pass | `pnpm test` — Sprint 4 test files show 0 failures |
| G2-S4-01 | Connection pool stability | Zero connection drops over 1-hour sustained load test (50 concurrent users) | `autocannon -c 50 -d 3600 http://localhost:3000/api/trpc/claims.list` — zero socket errors |
| G2-S4-02 | Connection pool metrics | Pool utilisation, wait time, and active connections visible in Prometheus | `curl localhost:3000/metrics \| grep "db_pool"` returns utilisation metrics |
| G2-S4-03 | PDF extraction performance | Node.js PDF extraction completes within 120% of Python baseline time | Benchmark: extract photos from 10 reference PDFs, compare to Python timing |
| G2-S4-04 | Rate limiter IPv6 compliance | No `ERR_ERL_KEY_GEN_IPV6` warning in server startup logs | `grep "ERR_ERL_KEY_GEN_IPV6" server.log` returns 0 matches |
| G2-S4-05 | Data retention job performance | Nightly retention job completes within 5 minutes for current dataset size | Execute retention job manually, measure execution time |
| G3-S4-01 | Fraud scoring final validation | Fraud risk scores for 10 reference claims (expanded set) match Sprint 3 baseline within 0.01 | Run fraud scoring on expanded reference dataset |
| G3-S4-02 | AI assessment final validation | LLM assessment for 5 reference images (expanded set) produces consistent results within 10% | Invoke assessment on expanded reference set |
| G3-S4-03 | Physics formula final validation | All 15 advanced physics + 11 accident physics tests pass | `pnpm test server/advancedPhysics.test.ts server/accidentPhysics.test.ts` |
| G3-S4-04 | Police report parsing accuracy | ZRP report parser extracts correct accident location, date, parties, and officer details from 5 reference reports | `pnpm test server/policeReport.test.ts` — 13/13 pass |
| G4-S4-01 | Data retention does not delete active records | Retention job only archives records beyond defined retention period; active claims, users, and documents are untouched | Execute retention job, verify: no active claims deleted, no users with recent activity deleted |
| G4-S4-02 | Archived data is recoverable | Archived records can be restored from archive table within retention window | Execute archive, then restore, verify data integrity |
| G4-S4-03 | Session purge correctness | Only expired sessions (> 30 days) are purged; active sessions remain | Execute session purge, verify: active sessions intact, expired sessions removed |
| G4-S4-04 | Full database integrity audit | Zero orphaned records, zero constraint violations, all foreign keys valid across all 28 tables | Comprehensive foreign key audit query across all tables |
| G5-S4-01 | Final production checkpoint | Sprint 4 completion checkpoint saved as release candidate | Version ID recorded and tagged as `v1.0-rc` |
| G5-S4-02 | Complete rollback chain verified | Checkpoints for Sprints 1, 2, 3, and 4 all exist and can be restored | Verify all 4 checkpoint version IDs in version history |
| G5-S4-03 | Disaster recovery drill | Full application recovery from checkpoint: restore code, restart server, verify health | Execute full recovery, measure time from checkpoint restore to healthy server |
| G6-S4-01 | TypeScript compilation | Zero errors | `pnpm tsc --noEmit` |
| G6-S4-02 | Full application health check | All endpoints respond, WebSocket connects, Kafka events flow, notifications deliver | Comprehensive health check script covering all subsystems |
| G6-S4-03 | No Python runtime dependency | Application starts and operates without Python installed | `which python3` may exist but no application code invokes it |
| G6-S4-04 | Production configuration validated | All environment variables set, no hardcoded localhost URLs, no debug flags enabled | Configuration audit script |
| G7-S4-01 | Complete monitoring dashboard | Grafana dashboard displays: request rate, error rate, response time, database connections, Kafka lag, fraud detection rate | Visual inspection of Grafana dashboard with all panels populated |
| G7-S4-02 | Alert rules comprehensive | Alerts configured for: server down, error rate > 5%, response time p95 > 1s, database connection exhaustion, Kafka lag > 1000, disk usage > 80% | Simulate each condition, verify alert fires |
| G7-S4-03 | On-call runbook complete | Documented procedures for each alert: diagnosis steps, remediation actions, escalation path | Runbook document exists at `docs/RUNBOOK.md` |

### 5.2 Automated Testing Requirements

| Step | Command | Expected Result | Timeout |
|---|---|---|---|
| 1 | `pnpm tsc --noEmit` | Exit code 0 | 60s |
| 2 | `pnpm test` | 0 failures, ≥ 340 passing tests | 300s |
| 3 | `pnpm test server/policeReport.test.ts` | 13/13 pass | 30s |
| 4 | `pnpm test server/advancedPhysics.test.ts` | 15/15 pass | 30s |
| 5 | `pnpm test server/vehicleValuation.test.ts` | 7/7 pass | 30s |
| 6 | `pnpm test server/accidentPhysics.test.ts` | 11/11 pass | 30s |
| 7 | `grep "ERR_ERL" server.log` | Empty output | 10s |
| 8 | `grep -rn "spawn.*python" server/*.ts` | Empty output (no Python dependencies) | 10s |
| 9 | Execute data retention job, verify no active records deleted | Active record count unchanged | 60s |
| 10 | `autocannon -c 50 -d 60 http://localhost:3000/api/trpc/claims.list` | Zero errors, p95 < 500ms | 90s |
| 11 | Re-run all Sprint 1, 2, 3 gate automated steps | All pass | 180s |

### 5.3 Release Readiness Criteria

| Criterion | Threshold | Status Required |
|---|---|---|
| Test pass rate | ≥ 98.6% (340/345 tests) | Mandatory |
| Zero regressions across all prior sprints | All prior gate checks pass | Mandatory |
| All 22 failures resolved | Cross-reference each F-ID against resolution evidence | Mandatory |
| Police report parser: all tests pass | 13/13 | Mandatory |
| Data retention: no active data loss | Verified | Mandatory |
| Connection pool: zero drops under load | 1-hour load test passes | Mandatory |
| No Python runtime dependency | Verified | Mandatory |
| Rate limiter: no IPv6 warnings | Verified | Mandatory |
| Monitoring dashboard: all panels populated | Visual verification | Mandatory |
| Alert rules: all conditions tested | 6/6 alert scenarios verified | Mandatory |
| On-call runbook: complete | Document exists and reviewed | Mandatory |
| Production readiness score: ≥ 97% | Weighted calculation verified | Mandatory |
| Disaster recovery drill: completed | Recovery time documented | Mandatory |

### 5.4 Rollback Procedure

| Scenario | Trigger | Rollback Action | Recovery Time Objective |
|---|---|---|---|
| Node.js PDF extraction produces lower quality output | Extracted images are visibly degraded compared to Python output | Revert to Python `spawn()` temporarily. Add Python runtime as optional dependency. Schedule library evaluation for next sprint. | 10 minutes |
| Connection pooling causes intermittent failures | Socket errors detected during load test (G2-S4-01 fails) | Revert connection pool configuration to default (no explicit limits). Monitor via Prometheus. | 5 minutes |
| Data retention job deletes active records | Active record count decreases after retention job execution (G4-S4-01 fails) | Restore from pre-retention backup. Disable retention job. Audit retention period logic. | 30 minutes |
| Rate limiter IPv6 fix breaks IPv4 rate limiting | Rate limiting no longer effective for IPv4 clients | Revert to previous `keyGenerator` configuration. Accept IPv6 warning. | 5 minutes |
| Full Sprint 4 rollback required | Multiple gate failures unresolvable | `webdev_rollback_checkpoint` to Sprint 3 completion version. All Sprint 4 work re-enters backlog. | 30 minutes |

### 5.5 Risk Containment Strategy

| Risk | Containment Measure |
|---|---|
| Data retention job runs during peak hours | Schedule retention job for 02:00 UTC (04:00 SAST) using `node-cron`. Add a configuration flag `RETENTION_ENABLED=true` to disable the job without code changes. Log every deletion with record ID and table name for audit trail. |
| Connection pool exhaustion under load | Set `connectionLimit: 20` with `queueLimit: 50` and `waitForConnections: true`. Monitor via Prometheus `db_pool_active_connections` gauge. Alert when utilisation exceeds 80%. Implement connection timeout of 10 seconds to prevent indefinite waits. |
| PDF library produces different output format | Before switching from Python to Node.js, create a reference output set from 20 representative PDFs using the Python extractor. After switching, compare Node.js output against reference set. Accept the switch only if output quality is equivalent or better. |
| Police report parser fails on edge-case report formats | Collect 10 representative ZRP report samples covering different police stations, report formats, and handwriting styles. Test parser against all 10. Document any formats that require additional information or manual processing. |

---

## 6. Cross-Sprint Stability Governance

Beyond the per-sprint gates, the following governance measures apply across the entire four-sprint programme.

### 6.1 Cumulative Gate Progression

Each sprint gate includes re-validation of all prior sprint gates. The cumulative testing burden grows as follows:

| Sprint | Own Gate Checks | Prior Gate Re-checks | Total Gate Checks | Estimated Gate Duration |
|---|---|---|---|---|
| Sprint 1 | 17 | 0 | 17 | 4 hours |
| Sprint 2 | 23 | 8 (Sprint 1 key checks) | 31 | 6 hours |
| Sprint 3 | 25 | 12 (Sprint 1+2 key checks) | 37 | 8 hours |
| Sprint 4 | 27 | 15 (Sprint 1+2+3 key checks) | 42 | 10 hours |

The gate duration is allocated within the sprint schedule (Day 9–10 of each sprint). If the gate requires more than the allocated time, the sprint extends by one day rather than skipping gate checks.

### 6.2 AI Model Consistency Tracking

AI model outputs are inherently non-deterministic (LLM-based assessments) or formula-dependent (physics calculations, fraud scoring). The following tracking mechanism ensures that model behaviour remains predictable across sprints.

| Model Component | Baseline Sprint | Reference Dataset | Tolerance | Tracking Method |
|---|---|---|---|---|
| Fraud risk scoring | Sprint 1 | 5 reference claims (expanded to 10 in Sprint 4) | ± 0.05 score points | JSON snapshot comparison |
| LLM damage assessment | Sprint 1 | 3 reference images (expanded to 5 in Sprint 4) | ± 10% cost estimate | JSON snapshot comparison |
| Advanced physics formulas | Sprint 2 (post-correction) | 5 collision scenarios from NHTSA data | ± 2% of analytical solution | Unit test assertions |
| Vehicle valuation | Sprint 2 (post-correction) | 5 vehicles with known market values | ± 5% of reference value | Unit test assertions |
| Police report parsing | Sprint 4 (post-fix) | 5 ZRP report samples | Exact field match | Unit test assertions |

The reference datasets and baseline snapshots are stored in `tests/fixtures/stability-baselines/` and version-controlled alongside the application code. Any intentional change to model behaviour (such as a formula correction) requires updating the baseline snapshot with documented justification.

### 6.3 Performance Baseline Registry

Performance baselines are captured at the end of each sprint and compared against the prior sprint's baseline. Degradation beyond the defined threshold blocks the gate.

| Metric | Baseline Capture Method | Degradation Threshold | Escalation |
|---|---|---|---|
| API response time (p95) | `autocannon -c 10 -d 60` on `/api/trpc/claims.list` | > 20% increase | Block gate; investigate before promotion |
| Database query time (p95) | `EXPLAIN ANALYZE` on 5 representative queries | > 30% increase | Block gate; check index usage |
| Memory usage (steady state) | `process.memoryUsage()` after 5 minutes of idle | > 50% increase | Warning; investigate but do not block |
| Event propagation latency | Kafka message timestamp delta | > 100% increase (> 1 second) | Block gate; check Kafka broker health |
| File upload throughput | Upload 10 x 5MB files sequentially | > 30% decrease | Block gate; check file scanner overhead |

Baselines are recorded in `tests/fixtures/performance-baselines/sprint-{N}.json` and compared programmatically during gate evaluation.

### 6.4 Database Integrity Master Query

The following SQL query suite is executed at every sprint gate to verify database integrity across all 28 tables. Any non-zero result blocks the gate.

| Check | Query Pattern | Expected Result |
|---|---|---|
| Orphaned claims | `SELECT COUNT(*) FROM claims WHERE userId NOT IN (SELECT id FROM users)` | 0 |
| Orphaned assessments | `SELECT COUNT(*) FROM assessments WHERE claimId NOT IN (SELECT id FROM claims)` | 0 |
| Orphaned quotes | `SELECT COUNT(*) FROM panel_beater_quotes WHERE claimId NOT IN (SELECT id FROM claims)` | 0 |
| Orphaned documents | `SELECT COUNT(*) FROM claim_documents WHERE claimId NOT IN (SELECT id FROM claims)` | 0 |
| Orphaned notifications | `SELECT COUNT(*) FROM notifications WHERE userId NOT IN (SELECT id FROM users)` | 0 |
| Orphaned audit entries | `SELECT COUNT(*) FROM audit_trail WHERE claimId NOT IN (SELECT id FROM claims)` | 0 |
| Duplicate audit entries | `SELECT claimId, action, COUNT(*) c FROM audit_trail GROUP BY claimId, action, createdAt HAVING c > 1` | 0 rows |
| Status consistency | `SELECT COUNT(*) FROM claims WHERE status = 'approved' AND approvedAmount IS NULL` | 0 |
| Encryption consistency | `SELECT COUNT(*) FROM users WHERE email NOT LIKE 'aes256:%' AND email IS NOT NULL` (post-Sprint 1) | 0 (all PII encrypted) |

### 6.5 Rollback Chain Verification

At the end of each sprint, the complete rollback chain is verified to ensure that any sprint can be independently reverted without affecting subsequent work.

| Sprint | Checkpoint Version | Rollback Dependencies | Verification |
|---|---|---|---|
| Pre-Sprint 1 | Baseline (version 83ea3de1) | None | Restore, verify 212 tests pass |
| Sprint 1 | To be recorded | Encryption key must be available | Restore, verify encryption rollback procedure |
| Sprint 2 | To be recorded | Sprint 1 checkpoint must exist | Restore, verify physics formulas revert to pre-correction |
| Sprint 3 | To be recorded | Kafka containers must be stopped | Restore, verify application runs without Kafka |
| Sprint 4 | To be recorded (release candidate) | Full chain must be intact | Restore to any prior sprint, verify functionality |

---

## 7. Gate Failure Escalation Protocol

When a gate check fails, the following escalation protocol determines the response.

| Failure Severity | Definition | Response | Timeline |
|---|---|---|---|
| **Critical** | Regression in a prior sprint's deliverable (security bypass, data corruption, workflow break) | Stop all Sprint work. Both engineers focus on resolution. No build promotion until resolved. | Resolve within 4 hours or escalate to full rollback. |
| **High** | Current sprint's fix does not meet its own exit criteria (test failures, performance degradation) | Assign one engineer to resolution. Other engineer continues Sprint work. Gate re-evaluation after fix. | Resolve within 1 working day. |
| **Medium** | Monitoring or documentation gap (alert not configured, runbook incomplete) | Document the gap. Assign to next available slot. Gate may proceed with documented exception. | Resolve within current sprint. |
| **Low** | Cosmetic or non-functional issue (log format inconsistency, metric label naming) | Add to Sprint backlog. Does not block gate. | Resolve in next sprint. |

All gate failures are recorded in a Gate Failure Log maintained at `docs/gate-failure-log.md` with the following fields: date, sprint, gate ID, failure description, severity, resolution, and time to resolution.

---

## 8. Release Certification

Upon successful completion of all four sprint gates, the platform receives a Release Certification that documents the cumulative evidence of stability, security, and readiness.

| Certification Criterion | Evidence Source |
|---|---|
| All 22 failures resolved | Cross-reference F-001 through F-022 against gate pass records |
| Test pass rate ≥ 98.6% | Final `pnpm test` output (340/345 tests passing) |
| Zero regressions across all sprints | Cumulative gate re-check records |
| AI model outputs consistent | Stability baseline comparison reports for all 4 sprints |
| Performance baselines maintained | Performance baseline registry comparisons |
| Database integrity verified | Master integrity query results (all zeros) |
| Security posture validated | Sprint 1 security gate re-check at Sprint 4 |
| Monitoring operational | Grafana dashboard screenshot with all panels populated |
| Alert rules tested | Alert simulation records for all 6 conditions |
| Rollback chain intact | All 4 sprint checkpoints verified restorable |
| Disaster recovery drill completed | Recovery time and procedure documented |
| On-call runbook complete | `docs/RUNBOOK.md` exists and reviewed |

The Release Certification is signed by the engineering lead and stored at `docs/RELEASE-CERTIFICATION.md`. It serves as the formal evidence package for insurer onboarding due diligence and regulatory compliance audits.

---

*Continuous Stability Gates prepared by Tavonga Shoko. All gate criteria, testing requirements, and rollback procedures are derived from the Engineering Sprint Plan (KINGA-ESP-2026-003) and the Failure Decomposition and Risk Prioritisation Report (KINGA-FDRP-2026-002). Gate architecture follows release engineering principles aligned with the platform's progression from 68% to 97% production readiness.*
