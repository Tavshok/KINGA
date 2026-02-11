# CI/CD Governance Policy

**Prepared by:** Tavonga Shoko, Platform Architect  
**Date:** February 11, 2026  
**Document Reference:** KINGA-CICD-2026-006  
**Classification:** Internal — Engineering Operations  
**Version:** 1.0 (Automated Release Governance)

---

## Executive Summary

This CI/CD Governance Policy translates the KINGA AutoVerify AI Sprint Release Pipeline into an automated, enforceable governance framework. The policy defines mandatory checkpoints, executable gate validation scripts, failure escalation rules, approval workflow enforcement, deployment rollback logic, monitoring trigger activation, and comprehensive audit logging requirements. Each of the seven Stability Gates (G1–G7) is equipped with measurable pass criteria, automated validation scripts, and clear failure remediation paths. The governance framework ensures that every code change progresses through a standardized 12-stage pipeline from Sprint Planning to Post-Release Monitoring, with automated quality gates preventing defective code from reaching production. The policy supports continuous delivery while maintaining production stability through layered validation, role-based approval workflows, and automated rollback capabilities. All pipeline executions are audited with immutable logs stored for compliance and incident investigation purposes.

---

## 1. Pipeline Architecture Overview

The CI/CD pipeline implements a 12-stage release workflow with automated quality gates and manual approval checkpoints. Each stage has defined entry criteria, automated validation logic, exit criteria, and failure escalation paths.

### 1.1 Pipeline Stages

The complete pipeline flow is as follows:

```
Sprint Planning
      ↓
Risk & Dependency Review
      ↓
Sprint Work (Development)
      ↓
Code Complete
      ↓
Peer Review
      ↓
Automated Test Execution
      ↓
Stability Gate [G1–G7]
      ↓
Release Candidate Build
      ↓
Deployment Approval Review
      ↓
Build Promotion / Production Release
      ↓
Post-Release Monitoring
      ↓
Next Sprint
```

### 1.2 Stage Classification

Stages are classified into three categories based on automation level:

**Automated Stages:** Automated Test Execution, Stability Gate [G1–G7], Release Candidate Build, Build Promotion, Post-Release Monitoring. These stages execute without human intervention and automatically block progression on failure.

**Manual Approval Stages:** Peer Review, Deployment Approval Review. These stages require explicit human approval from authorized roles before progression.

**Planning Stages:** Sprint Planning, Risk & Dependency Review, Sprint Work, Code Complete, Next Sprint. These stages involve human coordination and decision-making but are supported by automated tooling and checklists.

### 1.3 Checkpoint Definitions

Checkpoints are immutable snapshots of the codebase, database schema, configuration, and test results at specific pipeline stages. Checkpoints enable rollback, audit trails, and compliance verification.

**Mandatory Checkpoint Locations:**

| Checkpoint ID | Stage | Trigger | Retention | Purpose |
|---|---|---|---|
| CP-01 | Sprint Planning | Sprint kickoff | 90 days | Baseline for sprint scope and dependencies |
| CP-02 | Code Complete | All tasks marked [x] in todo.md | 90 days | Code freeze before peer review |
| CP-03 | Peer Review Approved | All PR approvals received | 180 days | Reviewed code ready for testing |
| CP-04 | Automated Tests Passed | All test suites pass | 180 days | Validated code ready for stability gates |
| CP-05 | Stability Gate Passed | All G1–G7 gates pass | 365 days | Release candidate eligible for deployment |
| CP-06 | Release Candidate Build | Build artifact created | 365 days | Deployable artifact with version tag |
| CP-07 | Production Deployment | Deployment completed | 730 days | Production snapshot for rollback and audit |

**Checkpoint Metadata:**

Each checkpoint stores the following metadata in JSON format:

```json
{
  "checkpoint_id": "CP-05-sprint1-20260211",
  "stage": "Stability Gate Passed",
  "timestamp": "2026-02-11T16:45:32Z",
  "git_commit": "a3f9b2e4c1d8f7e6a5b4c3d2e1f0a9b8",
  "version_tag": "v1.0.0-rc1",
  "author": "tavonga.shoko@kinga.ai",
  "sprint": "Sprint 1",
  "test_results": {
    "unit_tests": {"passed": 249, "failed": 0, "skipped": 0},
    "integration_tests": {"passed": 42, "failed": 0, "skipped": 0},
    "e2e_tests": {"passed": 18, "failed": 0, "skipped": 0}
  },
  "stability_gates": {
    "G1_regression": "PASS",
    "G2_performance": "PASS",
    "G3_ai_model": "PASS",
    "G4_database": "PASS",
    "G5_rollback": "PASS",
    "G6_deployment": "PASS",
    "G7_monitoring": "PASS"
  },
  "approval_chain": [
    {"role": "peer_reviewer", "email": "reviewer@kinga.ai", "timestamp": "2026-02-11T14:23:10Z"},
    {"role": "tech_lead", "email": "lead@kinga.ai", "timestamp": "2026-02-11T16:30:45Z"}
  ]
}
```

---

## 2. Stability Gate Definitions (G1–G7)

Each stability gate has measurable pass criteria, automated validation scripts, and failure remediation paths. Gates execute sequentially and any gate failure blocks pipeline progression.

### 2.1 G1: Regression Testing Gate

**Purpose:** Ensure that new code changes do not break existing functionality.

**Pass Criteria:**

| Criterion | Measurement | Threshold | Validation Method |
|---|---|---|---|
| Unit test pass rate | Passed tests / Total tests | 100% | `pnpm test` exit code 0 |
| Integration test pass rate | Passed tests / Total tests | 100% | `pnpm test:integration` exit code 0 |
| E2E test pass rate | Passed tests / Total tests | 100% | `pnpm test:e2e` exit code 0 |
| Test coverage | Covered lines / Total lines | ≥ 80% | `pnpm test:coverage` report |
| No new TypeScript errors | tsc error count | 0 | `pnpm tsc --noEmit` exit code 0 |
| No new ESLint errors | eslint error count | 0 | `pnpm lint` exit code 0 |

**Automated Validation Script:**

```bash
#!/bin/bash
# scripts/gates/g1-regression.sh

set -e

echo "=== G1: Regression Testing Gate ==="
echo "Timestamp: $(date -Iseconds)"

# Run unit tests
echo "[G1.1] Running unit tests..."
pnpm test 2>&1 | tee logs/g1-unit-tests.log
UNIT_EXIT=$?

# Run integration tests
echo "[G1.2] Running integration tests..."
pnpm test:integration 2>&1 | tee logs/g1-integration-tests.log
INTEGRATION_EXIT=$?

# Run E2E tests
echo "[G1.3] Running E2E tests..."
pnpm test:e2e 2>&1 | tee logs/g1-e2e-tests.log
E2E_EXIT=$?

# Check test coverage
echo "[G1.4] Checking test coverage..."
pnpm test:coverage 2>&1 | tee logs/g1-coverage.log
COVERAGE=$(grep -oP 'All files\s+\|\s+\K[\d.]+' logs/g1-coverage.log | head -1)
if (( $(echo "$COVERAGE < 80" | bc -l) )); then
  echo "FAIL: Test coverage $COVERAGE% is below 80% threshold"
  exit 1
fi

# Check TypeScript compilation
echo "[G1.5] Checking TypeScript compilation..."
pnpm tsc --noEmit 2>&1 | tee logs/g1-typescript.log
TSC_EXIT=$?

# Check ESLint
echo "[G1.6] Running ESLint..."
pnpm lint 2>&1 | tee logs/g1-eslint.log
LINT_EXIT=$?

# Aggregate results
if [ $UNIT_EXIT -ne 0 ] || [ $INTEGRATION_EXIT -ne 0 ] || [ $E2E_EXIT -ne 0 ] || [ $TSC_EXIT -ne 0 ] || [ $LINT_EXIT -ne 0 ]; then
  echo "FAIL: G1 Regression Testing Gate"
  echo "Unit: $UNIT_EXIT | Integration: $INTEGRATION_EXIT | E2E: $E2E_EXIT | TSC: $TSC_EXIT | Lint: $LINT_EXIT"
  exit 1
fi

echo "PASS: G1 Regression Testing Gate"
exit 0
```

**Failure Escalation:**

| Failure Type | Escalation Path | SLA |
|---|---|---|
| Unit test failure | Block merge, notify developer via Slack, create Jira ticket | Fix within 4 hours |
| Integration test failure | Block merge, notify tech lead via PagerDuty, create Jira ticket | Fix within 8 hours |
| E2E test failure | Block merge, notify tech lead + QA lead via PagerDuty, create Jira ticket | Fix within 12 hours |
| Coverage drop below 80% | Block merge, notify developer via Slack, require additional tests | Fix within 4 hours |
| TypeScript errors | Block merge, notify developer via Slack, require fix | Fix within 2 hours |
| ESLint errors | Block merge, notify developer via Slack, require fix | Fix within 2 hours |

### 2.2 G2: Performance Baseline Gate

**Purpose:** Ensure that new code changes do not degrade system performance.

**Pass Criteria:**

| Criterion | Measurement | Threshold | Validation Method |
|---|---|---|---|
| API response time (p95) | 95th percentile latency | ≤ 500ms | Load test with k6 |
| Database query time (p95) | 95th percentile query latency | ≤ 100ms | Query profiling |
| Memory usage | Peak RSS memory | ≤ 2GB | Process monitoring |
| CPU usage | Peak CPU utilization | ≤ 80% | Process monitoring |
| WebSocket latency (p95) | 95th percentile message latency | ≤ 200ms | WebSocket load test |

**Automated Validation Script:**

```bash
#!/bin/bash
# scripts/gates/g2-performance.sh

set -e

echo "=== G2: Performance Baseline Gate ==="
echo "Timestamp: $(date -Iseconds)"

# Start dev server in background
echo "[G2.1] Starting development server..."
pnpm dev > logs/g2-server.log 2>&1 &
SERVER_PID=$!
sleep 10

# Run API load test with k6
echo "[G2.2] Running API load test..."
k6 run --out json=logs/g2-k6-results.json tests/performance/api-load-test.js
API_P95=$(jq '.metrics.http_req_duration.values.p95' logs/g2-k6-results.json)
if (( $(echo "$API_P95 > 500" | bc -l) )); then
  echo "FAIL: API p95 latency ${API_P95}ms exceeds 500ms threshold"
  kill $SERVER_PID
  exit 1
fi

# Run database query profiling
echo "[G2.3] Running database query profiling..."
node scripts/performance/db-query-profiler.js > logs/g2-db-queries.json
DB_P95=$(jq '.p95_latency' logs/g2-db-queries.json)
if (( $(echo "$DB_P95 > 100" | bc -l) )); then
  echo "FAIL: Database p95 latency ${DB_P95}ms exceeds 100ms threshold"
  kill $SERVER_PID
  exit 1
fi

# Monitor memory and CPU usage
echo "[G2.4] Monitoring resource usage..."
MEMORY_MB=$(ps -o rss= -p $SERVER_PID | awk '{print $1/1024}')
CPU_PERCENT=$(ps -o %cpu= -p $SERVER_PID)
if (( $(echo "$MEMORY_MB > 2048" | bc -l) )); then
  echo "FAIL: Memory usage ${MEMORY_MB}MB exceeds 2GB threshold"
  kill $SERVER_PID
  exit 1
fi
if (( $(echo "$CPU_PERCENT > 80" | bc -l) )); then
  echo "FAIL: CPU usage ${CPU_PERCENT}% exceeds 80% threshold"
  kill $SERVER_PID
  exit 1
fi

# Run WebSocket load test
echo "[G2.5] Running WebSocket load test..."
node tests/performance/websocket-load-test.js > logs/g2-websocket.json
WS_P95=$(jq '.p95_latency' logs/g2-websocket.json)
if (( $(echo "$WS_P95 > 200" | bc -l) )); then
  echo "FAIL: WebSocket p95 latency ${WS_P95}ms exceeds 200ms threshold"
  kill $SERVER_PID
  exit 1
fi

# Stop server
kill $SERVER_PID

echo "PASS: G2 Performance Baseline Gate"
echo "API p95: ${API_P95}ms | DB p95: ${DB_P95}ms | Memory: ${MEMORY_MB}MB | CPU: ${CPU_PERCENT}% | WS p95: ${WS_P95}ms"
exit 0
```

**Failure Escalation:**

| Failure Type | Escalation Path | SLA |
|---|---|---|
| API latency regression | Block merge, notify tech lead via PagerDuty, create performance investigation ticket | Fix within 24 hours |
| Database query regression | Block merge, notify database engineer via PagerDuty, require query optimization | Fix within 12 hours |
| Memory leak detected | Block merge, notify tech lead via PagerDuty, require memory profiling | Fix within 24 hours |
| CPU spike detected | Block merge, notify developer via Slack, require profiling | Fix within 12 hours |
| WebSocket latency regression | Block merge, notify backend engineer via Slack, require investigation | Fix within 12 hours |

### 2.3 G3: AI Model Validation Gate

**Purpose:** Ensure that AI model outputs remain consistent and accurate after code changes.

**Pass Criteria:**

| Criterion | Measurement | Threshold | Validation Method |
|---|---|---|---|
| Fraud detection accuracy | Correct predictions / Total predictions | ≥ 92% | Validation dataset (500 claims) |
| Fraud detection precision | True positives / (True positives + False positives) | ≥ 85% | Validation dataset |
| Fraud detection recall | True positives / (True positives + False negatives) | ≥ 90% | Validation dataset |
| AI assessment consistency | Identical outputs for identical inputs | 100% | Reference snapshot comparison |
| Model inference latency (p95) | 95th percentile inference time | ≤ 2000ms | Load test with 100 concurrent requests |
| No model drift detected | Statistical distribution comparison | KS test p-value > 0.05 | Kolmogorov-Smirnov test |

**Automated Validation Script:**

```bash
#!/bin/bash
# scripts/gates/g3-ai-model.sh

set -e

echo "=== G3: AI Model Validation Gate ==="
echo "Timestamp: $(date -Iseconds)"

# Run fraud detection validation
echo "[G3.1] Running fraud detection validation..."
node scripts/ai-validation/fraud-detection-validator.js > logs/g3-fraud-detection.json
ACCURACY=$(jq '.accuracy' logs/g3-fraud-detection.json)
PRECISION=$(jq '.precision' logs/g3-fraud-detection.json)
RECALL=$(jq '.recall' logs/g3-fraud-detection.json)

if (( $(echo "$ACCURACY < 0.92" | bc -l) )); then
  echo "FAIL: Fraud detection accuracy ${ACCURACY} is below 92% threshold"
  exit 1
fi
if (( $(echo "$PRECISION < 0.85" | bc -l) )); then
  echo "FAIL: Fraud detection precision ${PRECISION} is below 85% threshold"
  exit 1
fi
if (( $(echo "$RECALL < 0.90" | bc -l) )); then
  echo "FAIL: Fraud detection recall ${RECALL} is below 90% threshold"
  exit 1
fi

# Run AI assessment consistency check
echo "[G3.2] Running AI assessment consistency check..."
node scripts/ai-validation/assessment-consistency-checker.js > logs/g3-assessment-consistency.json
CONSISTENCY=$(jq '.consistency_rate' logs/g3-assessment-consistency.json)
if (( $(echo "$CONSISTENCY < 1.0" | bc -l) )); then
  echo "FAIL: AI assessment consistency ${CONSISTENCY} is below 100% threshold"
  exit 1
fi

# Run model inference latency test
echo "[G3.3] Running model inference latency test..."
node scripts/ai-validation/inference-latency-tester.js > logs/g3-inference-latency.json
LATENCY_P95=$(jq '.p95_latency' logs/g3-inference-latency.json)
if (( $(echo "$LATENCY_P95 > 2000" | bc -l) )); then
  echo "FAIL: Model inference p95 latency ${LATENCY_P95}ms exceeds 2000ms threshold"
  exit 1
fi

# Run model drift detection
echo "[G3.4] Running model drift detection..."
node scripts/ai-validation/drift-detector.js > logs/g3-drift-detection.json
KS_PVALUE=$(jq '.ks_test_pvalue' logs/g3-drift-detection.json)
if (( $(echo "$KS_PVALUE < 0.05" | bc -l) )); then
  echo "FAIL: Model drift detected (KS test p-value ${KS_PVALUE} < 0.05)"
  exit 1
fi

echo "PASS: G3 AI Model Validation Gate"
echo "Accuracy: ${ACCURACY} | Precision: ${PRECISION} | Recall: ${RECALL} | Consistency: ${CONSISTENCY} | Latency p95: ${LATENCY_P95}ms | KS p-value: ${KS_PVALUE}"
exit 0
```

**Failure Escalation:**

| Failure Type | Escalation Path | SLA |
|---|---|---|
| Accuracy drop | Block merge, notify AI/ML engineer via PagerDuty, require model retraining or rollback | Fix within 48 hours |
| Precision drop | Block merge, notify AI/ML engineer via Slack, require threshold tuning | Fix within 24 hours |
| Recall drop | Block merge, notify AI/ML engineer via Slack, require threshold tuning | Fix within 24 hours |
| Consistency failure | Block merge, notify backend engineer via PagerDuty, require determinism fix | Fix within 12 hours |
| Latency regression | Block merge, notify backend engineer via Slack, require optimization | Fix within 24 hours |
| Model drift detected | Block merge, notify AI/ML engineer via PagerDuty, require investigation and potential retraining | Fix within 72 hours |

### 2.4 G4: Database Integrity Gate

**Purpose:** Ensure that database schema changes and data migrations preserve data integrity.

**Pass Criteria:**

| Criterion | Measurement | Threshold | Validation Method |
|---|---|---|---|
| Schema migration success | Migration exit code | 0 | `pnpm db:push` exit code |
| Foreign key constraints valid | Constraint violation count | 0 | SQL integrity check query |
| No orphaned records | Orphaned record count | 0 | SQL orphan detection query |
| Data type consistency | Type mismatch count | 0 | Schema validation script |
| Index integrity | Missing index count | 0 | Index validation script |
| Backup restoration success | Restore exit code | 0 | Backup restore test |

**Automated Validation Script:**

```bash
#!/bin/bash
# scripts/gates/g4-database.sh

set -e

echo "=== G4: Database Integrity Gate ==="
echo "Timestamp: $(date -Iseconds)"

# Run schema migration
echo "[G4.1] Running schema migration..."
pnpm db:push 2>&1 | tee logs/g4-migration.log
MIGRATION_EXIT=$?
if [ $MIGRATION_EXIT -ne 0 ]; then
  echo "FAIL: Schema migration failed with exit code $MIGRATION_EXIT"
  exit 1
fi

# Check foreign key constraints
echo "[G4.2] Checking foreign key constraints..."
node scripts/db-validation/check-foreign-keys.js > logs/g4-foreign-keys.json
FK_VIOLATIONS=$(jq '.violation_count' logs/g4-foreign-keys.json)
if [ $FK_VIOLATIONS -ne 0 ]; then
  echo "FAIL: Found $FK_VIOLATIONS foreign key constraint violations"
  exit 1
fi

# Check for orphaned records
echo "[G4.3] Checking for orphaned records..."
node scripts/db-validation/check-orphans.js > logs/g4-orphans.json
ORPHAN_COUNT=$(jq '.orphan_count' logs/g4-orphans.json)
if [ $ORPHAN_COUNT -ne 0 ]; then
  echo "FAIL: Found $ORPHAN_COUNT orphaned records"
  exit 1
fi

# Validate data types
echo "[G4.4] Validating data types..."
node scripts/db-validation/check-data-types.js > logs/g4-data-types.json
TYPE_MISMATCHES=$(jq '.mismatch_count' logs/g4-data-types.json)
if [ $TYPE_MISMATCHES -ne 0 ]; then
  echo "FAIL: Found $TYPE_MISMATCHES data type mismatches"
  exit 1
fi

# Validate indexes
echo "[G4.5] Validating indexes..."
node scripts/db-validation/check-indexes.js > logs/g4-indexes.json
MISSING_INDEXES=$(jq '.missing_count' logs/g4-indexes.json)
if [ $MISSING_INDEXES -ne 0 ]; then
  echo "FAIL: Found $MISSING_INDEXES missing indexes"
  exit 1
fi

# Test backup restoration
echo "[G4.6] Testing backup restoration..."
node scripts/db-validation/test-backup-restore.js > logs/g4-backup-restore.log
RESTORE_EXIT=$?
if [ $RESTORE_EXIT -ne 0 ]; then
  echo "FAIL: Backup restoration test failed with exit code $RESTORE_EXIT"
  exit 1
fi

echo "PASS: G4 Database Integrity Gate"
exit 0
```

**Failure Escalation:**

| Failure Type | Escalation Path | SLA |
|---|---|---|
| Migration failure | Block merge, notify database engineer via PagerDuty, require migration fix | Fix within 4 hours |
| Foreign key violations | Block merge, notify backend engineer via PagerDuty, require data fix | Fix within 8 hours |
| Orphaned records | Block merge, notify backend engineer via Slack, require cleanup script | Fix within 12 hours |
| Data type mismatches | Block merge, notify backend engineer via Slack, require schema fix | Fix within 8 hours |
| Missing indexes | Block merge, notify database engineer via Slack, require index creation | Fix within 4 hours |
| Backup restore failure | Block merge, notify database engineer + tech lead via PagerDuty, require investigation | Fix within 2 hours |

### 2.5 G5: Rollback Preparation Gate

**Purpose:** Ensure that rollback procedures are tested and ready before production deployment.

**Pass Criteria:**

| Criterion | Measurement | Threshold | Validation Method |
|---|---|---|---|
| Rollback script execution success | Script exit code | 0 | Execute rollback script in staging |
| Database rollback success | Rollback exit code | 0 | Execute database rollback in staging |
| Configuration rollback success | Rollback exit code | 0 | Execute config rollback in staging |
| Rollback time | Total rollback duration | ≤ 5 minutes | Measure rollback execution time |
| Post-rollback health check | Health check pass rate | 100% | Execute health checks after rollback |
| Rollback documentation complete | Documentation checklist | 100% | Automated checklist validation |

**Automated Validation Script:**

```bash
#!/bin/bash
# scripts/gates/g5-rollback.sh

set -e

echo "=== G5: Rollback Preparation Gate ==="
echo "Timestamp: $(date -Iseconds)"

# Deploy current version to staging
echo "[G5.1] Deploying current version to staging..."
./scripts/deploy/deploy-staging.sh 2>&1 | tee logs/g5-deploy-staging.log

# Execute rollback script
echo "[G5.2] Executing rollback script..."
START_TIME=$(date +%s)
./scripts/rollback/rollback-staging.sh 2>&1 | tee logs/g5-rollback-execution.log
ROLLBACK_EXIT=$?
END_TIME=$(date +%s)
ROLLBACK_DURATION=$((END_TIME - START_TIME))

if [ $ROLLBACK_EXIT -ne 0 ]; then
  echo "FAIL: Rollback script failed with exit code $ROLLBACK_EXIT"
  exit 1
fi

if [ $ROLLBACK_DURATION -gt 300 ]; then
  echo "FAIL: Rollback duration ${ROLLBACK_DURATION}s exceeds 5-minute threshold"
  exit 1
fi

# Execute database rollback
echo "[G5.3] Executing database rollback..."
./scripts/rollback/rollback-database-staging.sh 2>&1 | tee logs/g5-db-rollback.log
DB_ROLLBACK_EXIT=$?
if [ $DB_ROLLBACK_EXIT -ne 0 ]; then
  echo "FAIL: Database rollback failed with exit code $DB_ROLLBACK_EXIT"
  exit 1
fi

# Execute configuration rollback
echo "[G5.4] Executing configuration rollback..."
./scripts/rollback/rollback-config-staging.sh 2>&1 | tee logs/g5-config-rollback.log
CONFIG_ROLLBACK_EXIT=$?
if [ $CONFIG_ROLLBACK_EXIT -ne 0 ]; then
  echo "FAIL: Configuration rollback failed with exit code $CONFIG_ROLLBACK_EXIT"
  exit 1
fi

# Execute post-rollback health checks
echo "[G5.5] Executing post-rollback health checks..."
./scripts/health-check/check-staging.sh > logs/g5-health-check.json
HEALTH_PASS_RATE=$(jq '.pass_rate' logs/g5-health-check.json)
if (( $(echo "$HEALTH_PASS_RATE < 1.0" | bc -l) )); then
  echo "FAIL: Post-rollback health check pass rate ${HEALTH_PASS_RATE} is below 100%"
  exit 1
fi

# Validate rollback documentation
echo "[G5.6] Validating rollback documentation..."
node scripts/validation/check-rollback-docs.js > logs/g5-docs-validation.json
DOCS_COMPLETE=$(jq '.completeness' logs/g5-docs-validation.json)
if (( $(echo "$DOCS_COMPLETE < 1.0" | bc -l) )); then
  echo "FAIL: Rollback documentation completeness ${DOCS_COMPLETE} is below 100%"
  exit 1
fi

echo "PASS: G5 Rollback Preparation Gate"
echo "Rollback duration: ${ROLLBACK_DURATION}s | Health check pass rate: ${HEALTH_PASS_RATE} | Docs complete: ${DOCS_COMPLETE}"
exit 0
```

**Failure Escalation:**

| Failure Type | Escalation Path | SLA |
|---|---|---|
| Rollback script failure | Block deployment, notify DevOps engineer via PagerDuty, require script fix | Fix within 4 hours |
| Database rollback failure | Block deployment, notify database engineer via PagerDuty, require procedure fix | Fix within 2 hours |
| Configuration rollback failure | Block deployment, notify DevOps engineer via Slack, require config fix | Fix within 2 hours |
| Rollback time exceeds threshold | Block deployment, notify DevOps engineer via Slack, require optimization | Fix within 8 hours |
| Health check failure | Block deployment, notify tech lead via PagerDuty, require investigation | Fix within 4 hours |
| Documentation incomplete | Block deployment, notify developer via Slack, require documentation update | Fix within 2 hours |

### 2.6 G6: Deployment Safety Gate

**Purpose:** Ensure that deployment procedures are safe and will not cause production outages.

**Pass Criteria:**

| Criterion | Measurement | Threshold | Validation Method |
|---|---|---|---|
| Deployment script dry-run success | Dry-run exit code | 0 | Execute deployment script with --dry-run flag |
| Zero-downtime deployment verified | Downtime duration | 0 seconds | Monitor staging deployment |
| Health check endpoints operational | Health check pass rate | 100% | Execute health checks pre-deployment |
| Database migration backward compatible | Compatibility check | Pass | Execute compatibility validation |
| Configuration validation success | Validation exit code | 0 | Execute config validation script |
| Deployment runbook complete | Runbook checklist | 100% | Automated checklist validation |

**Automated Validation Script:**

```bash
#!/bin/bash
# scripts/gates/g6-deployment.sh

set -e

echo "=== G6: Deployment Safety Gate ==="
echo "Timestamp: $(date -Iseconds)"

# Execute deployment dry-run
echo "[G6.1] Executing deployment dry-run..."
./scripts/deploy/deploy-production.sh --dry-run 2>&1 | tee logs/g6-dry-run.log
DRYRUN_EXIT=$?
if [ $DRYRUN_EXIT -ne 0 ]; then
  echo "FAIL: Deployment dry-run failed with exit code $DRYRUN_EXIT"
  exit 1
fi

# Verify zero-downtime deployment in staging
echo "[G6.2] Verifying zero-downtime deployment..."
./scripts/deploy/deploy-staging-with-monitoring.sh > logs/g6-zero-downtime.json
DOWNTIME=$(jq '.downtime_seconds' logs/g6-zero-downtime.json)
if [ $DOWNTIME -ne 0 ]; then
  echo "FAIL: Deployment caused ${DOWNTIME}s downtime (expected 0s)"
  exit 1
fi

# Execute pre-deployment health checks
echo "[G6.3] Executing pre-deployment health checks..."
./scripts/health-check/check-production.sh > logs/g6-health-check.json
HEALTH_PASS_RATE=$(jq '.pass_rate' logs/g6-health-check.json)
if (( $(echo "$HEALTH_PASS_RATE < 1.0" | bc -l) )); then
  echo "FAIL: Pre-deployment health check pass rate ${HEALTH_PASS_RATE} is below 100%"
  exit 1
fi

# Validate database migration backward compatibility
echo "[G6.4] Validating database migration backward compatibility..."
node scripts/db-validation/check-backward-compatibility.js > logs/g6-db-compatibility.json
COMPATIBILITY=$(jq '.compatible' logs/g6-db-compatibility.json)
if [ "$COMPATIBILITY" != "true" ]; then
  echo "FAIL: Database migration is not backward compatible"
  exit 1
fi

# Validate configuration
echo "[G6.5] Validating configuration..."
node scripts/validation/validate-config.js > logs/g6-config-validation.log
CONFIG_EXIT=$?
if [ $CONFIG_EXIT -ne 0 ]; then
  echo "FAIL: Configuration validation failed with exit code $CONFIG_EXIT"
  exit 1
fi

# Validate deployment runbook
echo "[G6.6] Validating deployment runbook..."
node scripts/validation/check-deployment-runbook.js > logs/g6-runbook-validation.json
RUNBOOK_COMPLETE=$(jq '.completeness' logs/g6-runbook-validation.json)
if (( $(echo "$RUNBOOK_COMPLETE < 1.0" | bc -l) )); then
  echo "FAIL: Deployment runbook completeness ${RUNBOOK_COMPLETE} is below 100%"
  exit 1
fi

echo "PASS: G6 Deployment Safety Gate"
exit 0
```

**Failure Escalation:**

| Failure Type | Escalation Path | SLA |
|---|---|---|
| Dry-run failure | Block deployment, notify DevOps engineer via PagerDuty, require script fix | Fix within 2 hours |
| Downtime detected | Block deployment, notify tech lead via PagerDuty, require zero-downtime strategy | Fix within 8 hours |
| Health check failure | Block deployment, notify on-call engineer via PagerDuty, require investigation | Fix within 1 hour |
| Migration incompatibility | Block deployment, notify database engineer via PagerDuty, require migration redesign | Fix within 12 hours |
| Configuration validation failure | Block deployment, notify DevOps engineer via Slack, require config fix | Fix within 2 hours |
| Runbook incomplete | Block deployment, notify developer via Slack, require documentation update | Fix within 2 hours |

### 2.7 G7: Monitoring Activation Gate

**Purpose:** Ensure that monitoring, alerting, and observability are operational before production deployment.

**Pass Criteria:**

| Criterion | Measurement | Threshold | Validation Method |
|---|---|---|---|
| Prometheus scraping operational | Scrape success rate | 100% | Query Prometheus /metrics endpoint |
| Grafana dashboards accessible | Dashboard load success rate | 100% | HTTP GET requests to all dashboards |
| Alert rules configured | Alert rule count | ≥ 15 | Query Prometheus alert rules API |
| PagerDuty integration operational | Test alert delivery | Success | Send test alert to PagerDuty |
| Log aggregation operational | Log ingestion rate | > 0 logs/second | Query log aggregation service |
| Distributed tracing operational | Trace ingestion rate | > 0 traces/second | Query tracing service |

**Automated Validation Script:**

```bash
#!/bin/bash
# scripts/gates/g7-monitoring.sh

set -e

echo "=== G7: Monitoring Activation Gate ==="
echo "Timestamp: $(date -Iseconds)"

# Check Prometheus scraping
echo "[G7.1] Checking Prometheus scraping..."
SCRAPE_SUCCESS=$(curl -s http://localhost:9090/api/v1/targets | jq '[.data.activeTargets[] | select(.health=="up")] | length')
SCRAPE_TOTAL=$(curl -s http://localhost:9090/api/v1/targets | jq '.data.activeTargets | length')
if [ $SCRAPE_SUCCESS -ne $SCRAPE_TOTAL ]; then
  echo "FAIL: Prometheus scraping success rate ${SCRAPE_SUCCESS}/${SCRAPE_TOTAL} is below 100%"
  exit 1
fi

# Check Grafana dashboards
echo "[G7.2] Checking Grafana dashboards..."
DASHBOARDS=("claims-overview" "fraud-heatmap" "fleet-risk" "panel-beater-performance")
for dashboard in "${DASHBOARDS[@]}"; do
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/d/$dashboard)
  if [ $HTTP_CODE -ne 200 ]; then
    echo "FAIL: Grafana dashboard $dashboard returned HTTP $HTTP_CODE"
    exit 1
  fi
done

# Check alert rules
echo "[G7.3] Checking alert rules..."
ALERT_COUNT=$(curl -s http://localhost:9090/api/v1/rules | jq '[.data.groups[].rules[] | select(.type=="alerting")] | length')
if [ $ALERT_COUNT -lt 15 ]; then
  echo "FAIL: Alert rule count $ALERT_COUNT is below 15 threshold"
  exit 1
fi

# Test PagerDuty integration
echo "[G7.4] Testing PagerDuty integration..."
node scripts/monitoring/test-pagerduty.js > logs/g7-pagerduty.json
PAGERDUTY_SUCCESS=$(jq '.success' logs/g7-pagerduty.json)
if [ "$PAGERDUTY_SUCCESS" != "true" ]; then
  echo "FAIL: PagerDuty test alert delivery failed"
  exit 1
fi

# Check log aggregation
echo "[G7.5] Checking log aggregation..."
LOG_RATE=$(curl -s http://localhost:3100/loki/api/v1/query?query=rate%28%7Bjob%3D%22kinga%22%7D%5B1m%5D%29 | jq '.data.result[0].value[1] | tonumber')
if (( $(echo "$LOG_RATE <= 0" | bc -l) )); then
  echo "FAIL: Log ingestion rate $LOG_RATE is not greater than 0"
  exit 1
fi

# Check distributed tracing
echo "[G7.6] Checking distributed tracing..."
TRACE_RATE=$(curl -s http://localhost:16686/api/traces?service=kinga | jq '.data | length')
if [ $TRACE_RATE -le 0 ]; then
  echo "FAIL: Trace ingestion rate $TRACE_RATE is not greater than 0"
  exit 1
fi

echo "PASS: G7 Monitoring Activation Gate"
echo "Prometheus targets: ${SCRAPE_SUCCESS}/${SCRAPE_TOTAL} | Alert rules: ${ALERT_COUNT} | Log rate: ${LOG_RATE} logs/s | Trace count: ${TRACE_RATE}"
exit 0
```

**Failure Escalation:**

| Failure Type | Escalation Path | SLA |
|---|---|---|
| Prometheus scraping failure | Block deployment, notify DevOps engineer via PagerDuty, require scrape config fix | Fix within 2 hours |
| Grafana dashboard failure | Block deployment, notify DevOps engineer via Slack, require dashboard fix | Fix within 4 hours |
| Missing alert rules | Block deployment, notify DevOps engineer via Slack, require alert rule creation | Fix within 4 hours |
| PagerDuty integration failure | Block deployment, notify DevOps engineer via PagerDuty, require integration fix | Fix within 1 hour |
| Log aggregation failure | Block deployment, notify DevOps engineer via Slack, require log pipeline fix | Fix within 4 hours |
| Distributed tracing failure | Block deployment, notify DevOps engineer via Slack, require tracing config fix | Fix within 4 hours |

---

## 3. Approval Workflow Enforcement

Approval workflows ensure that authorized personnel review and approve code changes and deployments before progression to production.

### 3.1 Peer Review Approval Workflow

**Required Approvers:** Minimum 2 peer reviewers with "Developer" or "Tech Lead" role.

**Approval Criteria:**

- Code follows established coding standards and style guide
- All automated tests pass (G1 Regression Testing Gate)
- Code changes are well-documented with inline comments
- No security vulnerabilities introduced (verified via static analysis)
- Database schema changes are backward compatible
- API changes are backward compatible or properly versioned

**Automated Enforcement:**

```yaml
# .github/workflows/peer-review-enforcement.yml

name: Peer Review Enforcement

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  enforce-approvals:
    runs-on: ubuntu-latest
    steps:
      - name: Check approval count
        uses: actions/github-script@v6
        with:
          script: |
            const { data: reviews } = await github.rest.pulls.listReviews({
              owner: context.repo.owner,
              repo: context.repo.repo,
              pull_number: context.payload.pull_request.number
            });
            
            const approvals = reviews.filter(r => r.state === 'APPROVED');
            const uniqueApprovers = [...new Set(approvals.map(a => a.user.login))];
            
            if (uniqueApprovers.length < 2) {
              core.setFailed(`Only ${uniqueApprovers.length} approvals received. Minimum 2 required.`);
            }
```

**Approval Timeout:** Pull requests without 2 approvals within 48 hours are automatically escalated to Tech Lead via Slack notification.

### 3.2 Deployment Approval Workflow

**Required Approvers:** Minimum 1 Tech Lead + 1 Product Owner for production deployments.

**Approval Criteria:**

- All stability gates (G1–G7) pass
- Release notes are complete and reviewed
- Deployment runbook is complete and reviewed
- Rollback plan is tested and documented
- Stakeholders are notified of deployment window
- Post-deployment monitoring plan is defined

**Automated Enforcement:**

```yaml
# .github/workflows/deployment-approval-enforcement.yml

name: Deployment Approval Enforcement

on:
  workflow_dispatch:
    inputs:
      environment:
        description: 'Deployment environment'
        required: true
        type: choice
        options:
          - staging
          - production

jobs:
  enforce-deployment-approval:
    runs-on: ubuntu-latest
    environment:
      name: ${{ github.event.inputs.environment }}
      url: https://${{ github.event.inputs.environment }}.kinga.ai
    steps:
      - name: Check stability gates
        run: |
          ./scripts/gates/run-all-gates.sh
          if [ $? -ne 0 ]; then
            echo "FAIL: One or more stability gates failed"
            exit 1
          fi
      
      - name: Request deployment approval
        if: github.event.inputs.environment == 'production'
        uses: trstringer/manual-approval@v1
        with:
          secret: ${{ secrets.GITHUB_TOKEN }}
          approvers: tech-lead-team,product-owner-team
          minimum-approvals: 2
          issue-title: "Production Deployment Approval Required"
          issue-body: |
            **Deployment Request**
            - Environment: Production
            - Version: ${{ github.sha }}
            - Requested by: ${{ github.actor }}
            - All stability gates: PASSED
            
            Please review and approve this deployment.
```

**Approval Timeout:** Production deployment requests without approval within 4 hours are automatically canceled and require re-submission.

---

## 4. Deployment Rollback Logic

Rollback procedures enable rapid recovery from failed deployments or production incidents.

### 4.1 Automatic Rollback Triggers

The following conditions trigger automatic rollback without human intervention:

| Trigger Condition | Detection Method | Rollback Action | Notification |
|---|---|---|---|
| Health check failure rate > 10% | Prometheus alert: `health_check_failure_rate > 0.1` | Execute rollback script, restore previous version | PagerDuty alert to on-call engineer + Tech Lead |
| Error rate increase > 5x baseline | Prometheus alert: `error_rate > 5 * baseline_error_rate` | Execute rollback script, restore previous version | PagerDuty alert to on-call engineer + Tech Lead |
| API latency p95 > 2x baseline | Prometheus alert: `api_latency_p95 > 2 * baseline_latency_p95` | Execute rollback script, restore previous version | PagerDuty alert to on-call engineer |
| Database connection pool exhausted | Prometheus alert: `db_connection_pool_usage > 0.95` | Execute rollback script, restore previous version | PagerDuty alert to on-call engineer + Database Engineer |
| Memory usage > 90% | Prometheus alert: `memory_usage_percent > 0.90` | Execute rollback script, restore previous version | PagerDuty alert to on-call engineer |

### 4.2 Manual Rollback Procedure

Manual rollback is initiated by authorized personnel (Tech Lead, DevOps Engineer, On-Call Engineer) via the rollback script.

**Rollback Script:**

```bash
#!/bin/bash
# scripts/rollback/rollback-production.sh

set -e

echo "=== Production Rollback Procedure ==="
echo "Timestamp: $(date -Iseconds)"
echo "Initiated by: $USER"

# Confirm rollback
read -p "Are you sure you want to rollback production? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "Rollback canceled"
  exit 0
fi

# Get previous version
CURRENT_VERSION=$(git describe --tags --abbrev=0)
PREVIOUS_VERSION=$(git describe --tags --abbrev=0 HEAD~1)
echo "Current version: $CURRENT_VERSION"
echo "Rolling back to: $PREVIOUS_VERSION"

# Create rollback checkpoint
echo "[Rollback] Creating rollback checkpoint..."
./scripts/checkpoint/create-checkpoint.sh "rollback-from-$CURRENT_VERSION-to-$PREVIOUS_VERSION"

# Stop current version
echo "[Rollback] Stopping current version..."
pm2 stop kinga-production

# Restore previous version code
echo "[Rollback] Restoring previous version code..."
git checkout tags/$PREVIOUS_VERSION

# Restore previous version dependencies
echo "[Rollback] Restoring previous version dependencies..."
pnpm install --frozen-lockfile

# Restore previous database schema
echo "[Rollback] Restoring previous database schema..."
./scripts/rollback/rollback-database-production.sh $PREVIOUS_VERSION

# Restore previous configuration
echo "[Rollback] Restoring previous configuration..."
./scripts/rollback/rollback-config-production.sh $PREVIOUS_VERSION

# Start previous version
echo "[Rollback] Starting previous version..."
pm2 start kinga-production

# Wait for health checks
echo "[Rollback] Waiting for health checks..."
sleep 30

# Verify health checks
./scripts/health-check/check-production.sh > logs/rollback-health-check.json
HEALTH_PASS_RATE=$(jq '.pass_rate' logs/rollback-health-check.json)
if (( $(echo "$HEALTH_PASS_RATE < 1.0" | bc -l) )); then
  echo "FAIL: Post-rollback health check pass rate ${HEALTH_PASS_RATE} is below 100%"
  echo "CRITICAL: Rollback may have failed. Manual intervention required."
  exit 1
fi

echo "SUCCESS: Rollback completed successfully"
echo "Previous version $PREVIOUS_VERSION is now running in production"

# Send notification
./scripts/notification/send-slack-notification.sh "Production rollback completed: $CURRENT_VERSION → $PREVIOUS_VERSION"
./scripts/notification/send-pagerduty-notification.sh "Production rollback completed: $CURRENT_VERSION → $PREVIOUS_VERSION"

exit 0
```

### 4.3 Rollback Validation

After rollback execution, the following validation steps are performed automatically:

1. **Health Check Validation:** All health check endpoints must return 200 OK with expected response payloads.
2. **Smoke Test Validation:** Critical user workflows (claim submission, AI assessment, quote generation) must complete successfully.
3. **Performance Validation:** API latency p95 must return to baseline levels within 5 minutes.
4. **Error Rate Validation:** Error rate must return to baseline levels within 5 minutes.
5. **Database Integrity Validation:** Foreign key constraints, orphaned records, and data type consistency checks must pass.

If any validation step fails, the rollback is considered incomplete and requires manual investigation.

---

## 5. Monitoring Trigger Activation

Monitoring triggers are activated automatically upon successful production deployment to ensure continuous observability.

### 5.1 Prometheus Alert Rules

The following Prometheus alert rules are activated for all production deployments:

```yaml
# deployment/monitoring/alert-rules.yml

groups:
  - name: production_alerts
    interval: 30s
    rules:
      # Health check alerts
      - alert: HealthCheckFailureRate
        expr: rate(health_check_failures_total[5m]) > 0.1
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Health check failure rate exceeds 10%"
          description: "{{ $value | humanizePercentage }} of health checks are failing"

      # Error rate alerts
      - alert: ErrorRateIncrease
        expr: rate(http_requests_errors_total[5m]) > 5 * rate(http_requests_errors_total[1h] offset 1h)
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Error rate increased by 5x baseline"
          description: "Current error rate: {{ $value | humanize }} errors/s"

      # API latency alerts
      - alert: APILatencyHigh
        expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 0.5
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "API p95 latency exceeds 500ms"
          description: "Current p95 latency: {{ $value | humanizeDuration }}"

      # Database alerts
      - alert: DatabaseConnectionPoolExhausted
        expr: db_connection_pool_usage > 0.95
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Database connection pool usage exceeds 95%"
          description: "Current usage: {{ $value | humanizePercentage }}"

      # Memory alerts
      - alert: MemoryUsageHigh
        expr: process_resident_memory_bytes / node_memory_MemTotal_bytes > 0.90
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Memory usage exceeds 90%"
          description: "Current usage: {{ $value | humanizePercentage }}"

      # AI model alerts
      - alert: FraudDetectionAccuracyDrop
        expr: fraud_detection_accuracy < 0.92
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Fraud detection accuracy below 92%"
          description: "Current accuracy: {{ $value | humanizePercentage }}"

      # WebSocket alerts
      - alert: WebSocketConnectionDropRate
        expr: rate(websocket_connections_dropped_total[5m]) > 0.05
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "WebSocket connection drop rate exceeds 5%"
          description: "Current drop rate: {{ $value | humanizePercentage }}"
```

### 5.2 Grafana Dashboard Activation

The following Grafana dashboards are automatically configured and accessible upon production deployment:

| Dashboard Name | Purpose | Refresh Interval | Retention |
|---|---|---|---|
| Production Overview | High-level system health, request rate, error rate, latency | 10 seconds | 30 days |
| Claims Processing | Claim submission rate, approval rate, processing time, workflow status | 30 seconds | 90 days |
| Fraud Detection | Fraud detection rate, accuracy, precision, recall, model inference latency | 1 minute | 90 days |
| Database Performance | Query latency, connection pool usage, slow query count, deadlock count | 30 seconds | 30 days |
| WebSocket Monitoring | Active connections, message rate, latency, connection drop rate | 10 seconds | 30 days |
| AI Model Performance | Model inference latency, accuracy, drift detection, prediction distribution | 5 minutes | 90 days |

### 5.3 PagerDuty Integration

PagerDuty integration is activated for critical alerts with the following escalation policy:

**Escalation Policy:**

1. **Level 1 (0-5 minutes):** Alert sent to on-call engineer via SMS + phone call
2. **Level 2 (5-15 minutes):** If not acknowledged, escalate to Tech Lead via SMS + phone call
3. **Level 3 (15-30 minutes):** If not acknowledged, escalate to Engineering Manager via SMS + phone call
4. **Level 4 (30+ minutes):** If not acknowledged, escalate to CTO via SMS + phone call

**Alert Routing:**

| Alert Severity | PagerDuty Priority | Escalation Policy | Notification Method |
|---|---|---|---|
| Critical | P1 (High) | Immediate escalation to on-call engineer | SMS + Phone call + Slack |
| Warning | P2 (Medium) | Escalation to on-call engineer after 5 minutes | Slack + Email |
| Info | P3 (Low) | No escalation, logged only | Slack |

---

## 6. Audit Logging Requirements

Audit logging provides immutable records of all pipeline executions, approvals, deployments, and rollbacks for compliance and incident investigation.

### 6.1 Audit Log Schema

All audit events are logged in JSON format with the following schema:

```json
{
  "event_id": "uuid-v4",
  "timestamp": "ISO-8601 datetime",
  "event_type": "pipeline_stage | approval | deployment | rollback | gate_validation | alert",
  "actor": {
    "user_id": "string",
    "email": "string",
    "role": "string",
    "ip_address": "string"
  },
  "resource": {
    "type": "code | database | configuration | infrastructure",
    "identifier": "string",
    "version": "string"
  },
  "action": "string",
  "status": "success | failure | pending",
  "metadata": {
    "key": "value"
  },
  "correlation_id": "uuid-v4"
}
```

### 6.2 Audit Log Events

The following events are logged to the audit log:

| Event Type | Trigger | Logged Fields | Retention |
|---|---|---|---|
| Pipeline Stage Execution | Any pipeline stage starts/completes | event_type, actor, resource, action, status, duration, exit_code | 365 days |
| Stability Gate Validation | Any stability gate executes | event_type, gate_id, pass_criteria, actual_values, status, failure_reason | 365 days |
| Peer Review Approval | Pull request approved/rejected | event_type, actor, resource (PR number), action (approve/reject), comment | 730 days |
| Deployment Approval | Deployment approved/rejected | event_type, actor, resource (deployment ID), action (approve/reject), environment | 730 days |
| Production Deployment | Deployment to production | event_type, actor, resource (version), action (deploy), environment, timestamp | 2555 days (7 years) |
| Rollback Execution | Rollback initiated | event_type, actor, resource (version), action (rollback), reason, timestamp | 2555 days (7 years) |
| Alert Triggered | Prometheus alert fires | event_type, alert_name, severity, threshold, actual_value, timestamp | 365 days |
| Alert Acknowledged | Alert acknowledged by engineer | event_type, actor, alert_name, acknowledgment_time, resolution_time | 365 days |

### 6.3 Audit Log Storage

Audit logs are stored in three locations for redundancy and compliance:

1. **Local Filesystem:** `/var/log/kinga/audit/` with daily rotation and 90-day retention
2. **Centralized Log Aggregation:** Loki with 365-day retention and full-text search
3. **Immutable Audit Archive:** S3 bucket with versioning enabled, 7-year retention, and write-once-read-many (WORM) compliance mode

### 6.4 Audit Log Access Control

Access to audit logs is restricted to authorized personnel with the following role-based permissions:

| Role | Read Access | Write Access | Export Access | Retention Override |
|---|---|---|---|---|
| Developer | No | No | No | No |
| Tech Lead | Yes (own team) | No | Yes (own team) | No |
| DevOps Engineer | Yes (all) | No | Yes (all) | No |
| Security Officer | Yes (all) | No | Yes (all) | Yes |
| Compliance Officer | Yes (all) | No | Yes (all) | Yes |
| CTO | Yes (all) | No | Yes (all) | Yes |

---

## 7. GitHub Actions Workflow Implementation

The complete CI/CD pipeline is implemented as a GitHub Actions workflow.

### 7.1 Main Workflow

```yaml
# .github/workflows/cicd-pipeline.yml

name: CI/CD Pipeline

on:
  push:
    branches:
      - main
      - develop
  pull_request:
    branches:
      - main
      - develop
  workflow_dispatch:
    inputs:
      environment:
        description: 'Deployment environment'
        required: true
        type: choice
        options:
          - staging
          - production

jobs:
  # Stage: Code Complete
  code-complete:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '22'
      
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      
      - name: Check todo.md for incomplete tasks
        run: |
          INCOMPLETE=$(grep -c "^- \[ \]" todo.md || true)
          if [ $INCOMPLETE -gt 0 ]; then
            echo "FAIL: Found $INCOMPLETE incomplete tasks in todo.md"
            exit 1
          fi
      
      - name: Create checkpoint
        run: ./scripts/checkpoint/create-checkpoint.sh "code-complete-${{ github.sha }}"

  # Stage: Peer Review (manual approval required)
  peer-review:
    needs: code-complete
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request'
    steps:
      - name: Check approval count
        uses: actions/github-script@v6
        with:
          script: |
            const { data: reviews } = await github.rest.pulls.listReviews({
              owner: context.repo.owner,
              repo: context.repo.repo,
              pull_number: context.payload.pull_request.number
            });
            
            const approvals = reviews.filter(r => r.state === 'APPROVED');
            const uniqueApprovers = [...new Set(approvals.map(a => a.user.login))];
            
            if (uniqueApprovers.length < 2) {
              core.setFailed(`Only ${uniqueApprovers.length} approvals received. Minimum 2 required.`);
            }

  # Stage: Automated Test Execution
  automated-tests:
    needs: [code-complete, peer-review]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '22'
      
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      
      - name: Run unit tests
        run: pnpm test
      
      - name: Run integration tests
        run: pnpm test:integration
      
      - name: Run E2E tests
        run: pnpm test:e2e
      
      - name: Generate coverage report
        run: pnpm test:coverage
      
      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v3

  # Stage: Stability Gates (G1-G7)
  stability-gates:
    needs: automated-tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '22'
      
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      
      - name: G1 - Regression Testing Gate
        run: ./scripts/gates/g1-regression.sh
      
      - name: G2 - Performance Baseline Gate
        run: ./scripts/gates/g2-performance.sh
      
      - name: G3 - AI Model Validation Gate
        run: ./scripts/gates/g3-ai-model.sh
      
      - name: G4 - Database Integrity Gate
        run: ./scripts/gates/g4-database.sh
      
      - name: G5 - Rollback Preparation Gate
        run: ./scripts/gates/g5-rollback.sh
      
      - name: G6 - Deployment Safety Gate
        run: ./scripts/gates/g6-deployment.sh
      
      - name: G7 - Monitoring Activation Gate
        run: ./scripts/gates/g7-monitoring.sh
      
      - name: Create checkpoint
        run: ./scripts/checkpoint/create-checkpoint.sh "stability-gates-passed-${{ github.sha }}"

  # Stage: Release Candidate Build
  release-candidate:
    needs: stability-gates
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '22'
      
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      
      - name: Build application
        run: pnpm build
      
      - name: Create release candidate tag
        run: |
          VERSION=$(date +%Y%m%d%H%M%S)
          git tag -a "rc-$VERSION" -m "Release candidate $VERSION"
          git push origin "rc-$VERSION"
      
      - name: Upload build artifacts
        uses: actions/upload-artifact@v3
        with:
          name: release-candidate
          path: dist/

  # Stage: Deployment Approval (manual approval required for production)
  deployment-approval:
    needs: release-candidate
    runs-on: ubuntu-latest
    if: github.event.inputs.environment == 'production'
    environment:
      name: production
      url: https://production.kinga.ai
    steps:
      - name: Request deployment approval
        uses: trstringer/manual-approval@v1
        with:
          secret: ${{ secrets.GITHUB_TOKEN }}
          approvers: tech-lead-team,product-owner-team
          minimum-approvals: 2
          issue-title: "Production Deployment Approval Required"
          issue-body: |
            **Deployment Request**
            - Environment: Production
            - Version: ${{ github.sha }}
            - Requested by: ${{ github.actor }}
            - All stability gates: PASSED
            
            Please review and approve this deployment.

  # Stage: Build Promotion / Production Release
  production-deployment:
    needs: deployment-approval
    runs-on: ubuntu-latest
    if: github.event.inputs.environment == 'production'
    steps:
      - uses: actions/checkout@v3
      
      - name: Download build artifacts
        uses: actions/download-artifact@v3
        with:
          name: release-candidate
          path: dist/
      
      - name: Deploy to production
        run: ./scripts/deploy/deploy-production.sh
        env:
          DEPLOY_KEY: ${{ secrets.PRODUCTION_DEPLOY_KEY }}
      
      - name: Create production checkpoint
        run: ./scripts/checkpoint/create-checkpoint.sh "production-deployment-${{ github.sha }}"
      
      - name: Send deployment notification
        run: |
          ./scripts/notification/send-slack-notification.sh "Production deployment completed: ${{ github.sha }}"
          ./scripts/notification/send-pagerduty-notification.sh "Production deployment completed: ${{ github.sha }}"

  # Stage: Post-Release Monitoring
  post-release-monitoring:
    needs: production-deployment
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Wait for deployment stabilization
        run: sleep 300
      
      - name: Execute post-deployment health checks
        run: ./scripts/health-check/check-production.sh
      
      - name: Validate monitoring activation
        run: ./scripts/gates/g7-monitoring.sh
      
      - name: Check alert status
        run: |
          FIRING_ALERTS=$(curl -s http://prometheus.kinga.ai/api/v1/alerts | jq '[.data.alerts[] | select(.state=="firing")] | length')
          if [ $FIRING_ALERTS -gt 0 ]; then
            echo "WARNING: $FIRING_ALERTS alerts are firing post-deployment"
          fi
      
      - name: Generate deployment report
        run: ./scripts/reporting/generate-deployment-report.sh > deployment-report.md
      
      - name: Upload deployment report
        uses: actions/upload-artifact@v3
        with:
          name: deployment-report
          path: deployment-report.md
```

---

## 8. Failure Escalation Rules

Failure escalation ensures that pipeline failures are promptly addressed by the appropriate personnel.

### 8.1 Escalation Matrix

| Failure Stage | Severity | Initial Notification | Escalation Level 1 (15 min) | Escalation Level 2 (1 hour) | Escalation Level 3 (4 hours) |
|---|---|---|---|---|---|
| Code Complete | Low | Developer (Slack) | - | - | - |
| Peer Review | Low | Developer (Slack) | Tech Lead (Slack) | - | - |
| Automated Tests | Medium | Developer (Slack) | Tech Lead (Slack) | Engineering Manager (Email) | - |
| G1 Regression | High | Developer (Slack) | Tech Lead (PagerDuty) | Engineering Manager (PagerDuty) | CTO (PagerDuty) |
| G2 Performance | High | Tech Lead (PagerDuty) | Engineering Manager (PagerDuty) | CTO (PagerDuty) | - |
| G3 AI Model | High | AI/ML Engineer (PagerDuty) | Tech Lead (PagerDuty) | Engineering Manager (PagerDuty) | CTO (PagerDuty) |
| G4 Database | Critical | Database Engineer (PagerDuty) | Tech Lead (PagerDuty) | Engineering Manager (PagerDuty) | CTO (PagerDuty) |
| G5 Rollback | Critical | DevOps Engineer (PagerDuty) | Tech Lead (PagerDuty) | Engineering Manager (PagerDuty) | CTO (PagerDuty) |
| G6 Deployment | Critical | DevOps Engineer (PagerDuty) | Tech Lead (PagerDuty) | Engineering Manager (PagerDuty) | CTO (PagerDuty) |
| G7 Monitoring | Critical | DevOps Engineer (PagerDuty) | Tech Lead (PagerDuty) | Engineering Manager (PagerDuty) | CTO (PagerDuty) |
| Production Deployment | Critical | On-Call Engineer (PagerDuty) | Tech Lead (PagerDuty) | Engineering Manager (PagerDuty) | CTO (PagerDuty) |
| Post-Release Monitoring | Critical | On-Call Engineer (PagerDuty) | Tech Lead (PagerDuty) | Engineering Manager (PagerDuty) | CTO (PagerDuty) |

### 8.2 Escalation Automation

Escalation is automated via PagerDuty escalation policies and Slack notifications:

```javascript
// scripts/escalation/escalate-failure.js

const axios = require('axios');

async function escalateFailure(failureStage, severity, failureDetails) {
  const escalationMatrix = {
    'Code Complete': { initial: 'developer', level1: null, level2: null, level3: null },
    'Peer Review': { initial: 'developer', level1: 'tech_lead', level2: null, level3: null },
    'Automated Tests': { initial: 'developer', level1: 'tech_lead', level2: 'engineering_manager', level3: null },
    'G1 Regression': { initial: 'developer', level1: 'tech_lead', level2: 'engineering_manager', level3: 'cto' },
    'G2 Performance': { initial: 'tech_lead', level1: 'engineering_manager', level2: 'cto', level3: null },
    'G3 AI Model': { initial: 'ai_ml_engineer', level1: 'tech_lead', level2: 'engineering_manager', level3: 'cto' },
    'G4 Database': { initial: 'database_engineer', level1: 'tech_lead', level2: 'engineering_manager', level3: 'cto' },
    'G5 Rollback': { initial: 'devops_engineer', level1: 'tech_lead', level2: 'engineering_manager', level3: 'cto' },
    'G6 Deployment': { initial: 'devops_engineer', level1: 'tech_lead', level2: 'engineering_manager', level3: 'cto' },
    'G7 Monitoring': { initial: 'devops_engineer', level1: 'tech_lead', level2: 'engineering_manager', level3: 'cto' },
    'Production Deployment': { initial: 'oncall_engineer', level1: 'tech_lead', level2: 'engineering_manager', level3: 'cto' },
    'Post-Release Monitoring': { initial: 'oncall_engineer', level1: 'tech_lead', level2: 'engineering_manager', level3: 'cto' }
  };

  const escalationPath = escalationMatrix[failureStage];
  
  // Send initial notification
  await sendNotification(escalationPath.initial, severity, failureStage, failureDetails);
  
  // Schedule escalations
  if (escalationPath.level1) {
    setTimeout(() => sendNotification(escalationPath.level1, severity, failureStage, failureDetails), 15 * 60 * 1000); // 15 minutes
  }
  if (escalationPath.level2) {
    setTimeout(() => sendNotification(escalationPath.level2, severity, failureStage, failureDetails), 60 * 60 * 1000); // 1 hour
  }
  if (escalationPath.level3) {
    setTimeout(() => sendNotification(escalationPath.level3, severity, failureStage, failureDetails), 4 * 60 * 60 * 1000); // 4 hours
  }
}

async function sendNotification(role, severity, failureStage, failureDetails) {
  const notificationChannels = {
    'developer': { slack: '#dev-alerts', pagerduty: null },
    'tech_lead': { slack: '#tech-lead-alerts', pagerduty: 'tech-lead-service' },
    'engineering_manager': { slack: '#eng-manager-alerts', pagerduty: 'eng-manager-service' },
    'cto': { slack: '#cto-alerts', pagerduty: 'cto-service' },
    'ai_ml_engineer': { slack: '#ai-ml-alerts', pagerduty: 'ai-ml-service' },
    'database_engineer': { slack: '#database-alerts', pagerduty: 'database-service' },
    'devops_engineer': { slack: '#devops-alerts', pagerduty: 'devops-service' },
    'oncall_engineer': { slack: '#oncall-alerts', pagerduty: 'oncall-service' }
  };

  const channels = notificationChannels[role];
  
  // Send Slack notification
  if (channels.slack) {
    await axios.post(process.env.SLACK_WEBHOOK_URL, {
      channel: channels.slack,
      text: `*${severity} Failure: ${failureStage}*\n${failureDetails}`
    });
  }
  
  // Send PagerDuty notification for high/critical severity
  if (channels.pagerduty && (severity === 'High' || severity === 'Critical')) {
    await axios.post('https://api.pagerduty.com/incidents', {
      incident: {
        type: 'incident',
        title: `${severity} Failure: ${failureStage}`,
        service: { id: channels.pagerduty, type: 'service_reference' },
        body: { type: 'incident_body', details: failureDetails }
      }
    }, {
      headers: {
        'Authorization': `Token token=${process.env.PAGERDUTY_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
  }
}

module.exports = { escalateFailure };
```

---

## 9. Compliance and Governance

### 9.1 Compliance Requirements

The CI/CD governance policy ensures compliance with the following standards:

| Standard | Requirement | Implementation | Verification |
|---|---|---|---|
| ISO 27001 | Change management controls | Mandatory peer review + deployment approval | Audit log review |
| SOC 2 Type II | Automated testing and monitoring | Stability gates G1-G7 + continuous monitoring | Quarterly audit |
| POPIA | Data protection in CI/CD | PII encryption in test data, audit logging | Annual compliance review |
| GDPR | Right to erasure in deployments | Database migration backward compatibility | Sprint 3 implementation |

### 9.2 Governance Metrics

The following metrics are tracked to measure CI/CD governance effectiveness:

| Metric | Target | Measurement Frequency | Reporting |
|---|---|---|---|
| Deployment success rate | ≥ 95% | Weekly | Engineering dashboard |
| Mean time to recovery (MTTR) | ≤ 30 minutes | Per incident | Incident post-mortem |
| Rollback success rate | 100% | Per rollback | Rollback validation report |
| Stability gate pass rate | ≥ 90% | Per sprint | Sprint retrospective |
| Audit log completeness | 100% | Monthly | Compliance officer review |
| Escalation response time | ≤ 15 minutes | Per escalation | PagerDuty analytics |

---

## 10. Document Maintenance

**Review Schedule:** This CI/CD Governance Policy is reviewed and updated quarterly by the Tech Lead and DevOps Engineer.

**Approval Authority:** Changes to this policy require approval from the Engineering Manager and CTO.

**Version History:**

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | February 11, 2026 | Tavonga Shoko | Initial release |

---

**End of Document**
