# KINGA AutoVerify AI Platform
# Engineering Sprint Plan

**Author:** Tavonga Shoko
**Date:** February 11, 2026
**Document Reference:** KINGA-ESP-2026-003
**Classification:** Internal Engineering Document
**Source Document:** KINGA-FDRP-2026-002 (Failure Decomposition and Risk Prioritisation Report)
**Planning Horizon:** 8 weeks (4 sprints of 2 weeks each)
**Team Assumption:** 2 engineers, 8 productive hours per day, 10 working days per sprint

---

## Executive Summary

This sprint plan translates the 22 failures identified in the Failure Decomposition and Risk Prioritisation Report (KINGA-FDRP-2026-002) into a structured, dependency-aware engineering execution plan. The 230 total engineering hours have been organised into four two-week sprints, each with a clear theme, defined entry and exit criteria, a testing strategy, and a measurable readiness progression target. The plan is designed for a two-person engineering team and accounts for dependency chains between failures, ensuring that no task is scheduled before its prerequisites are complete. Upon completion of all four sprints, the platform is projected to reach 97% production readiness, with insurer onboarding eligibility achieved at the end of Sprint 2 (84% readiness) and public launch readiness at the end of Sprint 3 (94% readiness).

---

## 1. Dependency Map

Before allocating tasks to sprints, it is essential to understand the dependency relationships between failures. The following table documents every dependency chain that constrains the execution sequence. Tasks not listed here are independent and can be parallelised freely.

| Upstream Task | Downstream Task | Dependency Reason |
|---|---|---|
| F-019: Fix claims approval workflow | F-011: Fix analytics approved_amount pipeline | The analytics queries depend on `approved_amount` being populated, which only occurs through the approval workflow |
| F-019: Fix claims approval workflow | F-022: Create E2E test suite | The E2E test suite must validate the complete claim lifecycle including approval, which must be functional first |
| F-002: Deploy Kafka event bus | F-015: Enable notification delivery | The notification microservice consumes events from Kafka; it cannot start without the event bus |
| F-002: Deploy Kafka event bus | Event integration re-enablement | The commented-out event integration in `server/routers.ts` line 56 requires a running Kafka cluster |
| F-004: Implement /metrics endpoint | F-018: Configure connection pooling | Connection pool metrics should be exposed through the /metrics endpoint for observability |
| F-005: Implement encryption at rest | F-014: Implement POPIA data subject rights | Data export and deletion procedures must handle encrypted fields correctly |

The following tasks are fully independent and can be executed in any order or in parallel: F-001, F-003, F-006, F-007, F-008, F-009, F-010, F-012, F-013, F-016, F-017, F-020, F-021.

---

## 2. Sprint Breakdown

### Sprint 1: Security Hardening and Core Workflow Repair

**Duration:** Weeks 1–2 (10 working days)
**Theme:** Eliminate all Critical and High-severity security vulnerabilities and repair the financially critical approval workflow.
**Sprint Goal:** Achieve a security posture that would pass a basic penetration test and ensure the most financially significant operation (claim approval) functions correctly.

#### Sprint 1 — Task Schedule

| Day | Engineer A | Engineer B |
|---|---|---|
| Day 1 | **P1-03: Helmet security headers** (F-007, 2h) — Install `helmet`, configure CSP directives, test resource loading | **P1-01: File scanner integration** (F-001, 4h) — Import `scanFile` into `server/routers.ts`, integrate at all 4 upload points |
| Day 2 | **P1-04: Input sanitisation** (F-008, 8h) — Install `xss` package, create `sanitizeInput()` utility, implement Zod `.transform()` on all string inputs | **P1-01: File scanner integration** (F-001, continued) — Write integration tests, verify rejection of malicious files |
| Day 3 | **P1-04: Input sanitisation** (F-008, continued) — Apply DOMPurify on frontend rendering of user-generated content, test XSS vectors | **P1-07: Claims approval workflow** (F-019, 8h) — Debug `claims.approveClaim.test.ts`, trace the approval procedure |
| Day 4 | **P1-05: WebSocket authentication** (F-013, 8h) — Implement JWT verification on WebSocket connection, extract user identity | **P1-07: Claims approval workflow** (F-019, continued) — Fix `approved_amount` update, status transition, and audit trail creation |
| Day 5 | **P1-05: WebSocket authentication** (F-013, continued) — Add role-based message filtering, reject unauthenticated connections, write tests | **P1-06: Analytics data pipeline** (F-011, 8h) — Restore `SUM(approved_amount)` in analytics queries, verify with test data |
| Day 6–8 | **P1-02: Encryption at rest** (F-005, 16h) — Create `server/encryption.ts` with AES-256-GCM, identify PII columns, implement encrypt-on-write/decrypt-on-read | **P1-06: Analytics data pipeline** (F-011, continued) — Update all 4 analytics dashboard queries, fix 5 failing analytics tests |
| Day 9 | **P1-02: Encryption at rest** (F-005, continued) — Create migration script for existing plaintext data, add encryption key to environment variables | Sprint 1 integration testing and regression verification |
| Day 10 | Sprint 1 integration testing and regression verification | Sprint 1 integration testing and regression verification |

**Total Sprint 1 Effort: 62 hours** (31 hours per engineer)

#### Sprint 1 — Entry Criteria

The following conditions must be satisfied before Sprint 1 begins:

| Criterion | Status |
|---|---|
| Development environment operational (server running on port 3000) | Verified |
| All 8 passing test files remain green (212 tests) | Verified |
| Rate limiting middleware already installed and configured | Completed in prior sprint |
| File scanner module (`server/file-scanner.ts`) already created | Completed in prior sprint |
| Access to environment variable management for encryption key | Available via `webdev_request_secrets` |

#### Sprint 1 — Exit Criteria

| Criterion | Verification Method |
|---|---|
| `helmet` middleware active with CSP, X-Frame-Options, HSTS headers | `curl -I` response header inspection |
| All upload procedures call `scanFile()` before `storagePut()` | Code review + malicious file upload test |
| All string inputs sanitised via Zod transform or tRPC middleware | XSS payload test across claim description, damage notes, assessment comments |
| WebSocket connections require valid JWT; unauthenticated connections rejected | WebSocket connection test without token returns 401 |
| PII columns encrypted at rest (claimant name, email, phone, ID, vehicle registration) | Database inspection shows ciphertext, API returns plaintext |
| `claims.approveClaim.test.ts` passes (all 8 assertions) | `pnpm test server/claims.approveClaim.test.ts` |
| All 5 analytics tests pass with real `approved_amount` data | `pnpm test server/analytics.test.ts` |
| No regression in existing 212 passing tests | `pnpm test` full suite |

#### Sprint 1 — Testing Strategy

Sprint 1 employs a layered testing approach that validates each fix at the unit, integration, and security levels.

**Unit Tests:** Each fix includes dedicated unit tests. The file scanner integration requires tests that submit valid images (JPEG, PNG), valid PDFs, and malicious payloads (executable with image extension, polyglot PDF). The encryption module requires round-trip tests (encrypt then decrypt) for each PII field type. The WebSocket authentication requires tests for valid token acceptance, expired token rejection, and missing token rejection.

**Integration Tests:** After all Sprint 1 fixes are applied, run the complete approval workflow test: submit a claim, trigger assessment, submit quotes, approve with quote selection, and verify that `approved_amount` is populated, the audit trail entry exists, and the analytics queries return correct values.

**Security Tests:** Conduct a focused security validation using the following test vectors:

| Test Vector | Target | Expected Result |
|---|---|---|
| Upload `eicar.com` test file disguised as `.jpg` | File scanner (F-001) | Rejected with 400 BAD_REQUEST |
| Submit `<script>alert('xss')</script>` in claim description | Input sanitisation (F-008) | Stored as escaped text, rendered without execution |
| Connect to WebSocket without Authorization header | WebSocket auth (F-013) | Connection rejected |
| Inspect `claims.claimantName` column in database | Encryption (F-005) | Column contains AES-256-GCM ciphertext, not plaintext |
| Request any page and inspect response headers | Helmet (F-007) | CSP, X-Frame-Options, HSTS headers present |

**Regression Suite:** Run the full `pnpm test` suite at the end of Sprint 1. The baseline is 212 passing tests. The target is 212 + new tests from Sprint 1 fixes, with zero regressions in existing tests.

---

### Sprint 2: AI Model Corrections and Observability Foundation

**Duration:** Weeks 3–4 (10 working days)
**Theme:** Restore accuracy in the AI-powered fraud detection and vehicle valuation modules, and establish production observability with metrics collection and structured logging.
**Sprint Goal:** All physics-based fraud detection formulas produce correct results, vehicle valuations are financially accurate, and the platform exposes Prometheus metrics for operational monitoring.

#### Sprint 2 — Task Schedule

| Day | Engineer A | Engineer B |
|---|---|---|
| Day 1–2 | **P1-08: Advanced physics formulas** (F-003, 16h) — Audit momentum conservation against published references, fix mass-velocity product calculation | **P2-01: Prometheus /metrics endpoint** (F-004, 12h) — Install `prom-client`, create `server/metrics.ts` with default metrics |
| Day 3–4 | **P1-08: Advanced physics formulas** (F-003, continued) — Recalibrate friction coefficient lookup tables against AASHTO standards, fix rollover threshold centre-of-gravity calculation | **P2-01: Prometheus /metrics endpoint** (F-004, continued) — Add HTTP request duration histogram, database query counter, business metrics (claims created, fraud detections). Register `/metrics` GET endpoint |
| Day 5–6 | **P2-02: Vehicle valuation fixes** (F-012, 12h) — Fix cents-to-dollars conversion in salvage value, debug mileage adjustment timeout (likely unresolved promise) | **P2-04: Structured logging** (F-010, 12h) — Install `pino`, create `server/logger.ts` with JSON output, log levels, correlation IDs |
| Day 7–8 | **P2-02: Vehicle valuation fixes** (F-012, continued) — Add timeout guards to external API calls, verify condition adjustment multiplier table, fix valuation expiry calculation | **P2-04: Structured logging** (F-010, continued) — Replace all `console.log()` calls with structured logger, add request-level logging middleware |
| Day 9 | **P2-05: Database indexes** (F-009, 4h) — Add composite indexes to schema, run `pnpm db:push` | **P2-06: WebSocket URL fix** (F-006, 2h) — Replace hardcoded `ws://localhost:8080` with dynamic URL construction |
| Day 10 | Sprint 2 integration testing and regression verification | Sprint 2 integration testing and regression verification |

**Total Sprint 2 Effort: 58 hours** (32h Engineer A, 26h Engineer B)

#### Sprint 2 — Entry Criteria

| Criterion | Status |
|---|---|
| Sprint 1 exit criteria fully satisfied | Required |
| Claims approval workflow functional (F-019 resolved) | Required (Sprint 1 deliverable) |
| Analytics data pipeline populated with real `approved_amount` values | Required (Sprint 1 deliverable) |
| Prometheus Docker container available for local testing | Available via `deployment/monitoring/docker-compose.yml` |

#### Sprint 2 — Exit Criteria

| Criterion | Verification Method |
|---|---|
| All 15 advanced physics tests pass (13 currently failing) | `pnpm test server/advancedPhysics.test.ts` — 15/15 pass |
| All 2 accident physics tests pass | `pnpm test server/accidentPhysics.test.ts` — 11/11 pass |
| All 7 vehicle valuation tests pass (4 currently failing) | `pnpm test server/vehicleValuation.test.ts` — 7/7 pass |
| `/metrics` endpoint returns Prometheus-format metrics | `curl localhost:3000/metrics` returns `# HELP` lines |
| All `console.log()` replaced with structured Pino logger | `grep -rn "console.log" server/` returns zero results (excluding test files) |
| Composite indexes applied to database | `SHOW INDEX FROM claims` confirms `status_createdAt` index |
| WebSocket connects in deployed environment | Panel Beater Performance dashboard shows "Connected" in non-localhost environment |
| No regression in Sprint 1 fixes or baseline tests | Full `pnpm test` suite passes |

#### Sprint 2 — Testing Strategy

**Formula Validation:** Each physics formula correction must be validated against published reference values. The momentum conservation function should be tested with known collision scenarios from NHTSA crash test data. Friction coefficients should match AASHTO Green Book values for dry asphalt (0.7), wet asphalt (0.5), and ice (0.15). Rollover threshold calculations should be validated against known vehicle centre-of-gravity heights.

| Formula | Reference Standard | Test Scenario | Expected Output |
|---|---|---|---|
| Momentum conservation | Newton's Third Law: m1v1 + m2v2 = m1v1' + m2v2' | 1500kg at 60km/h rear-ends 1200kg stationary | Post-collision velocities within 5% of analytical solution |
| Friction/skid marks | AASHTO: v = sqrt(2 * g * f * d) | 30m skid on dry asphalt (f=0.7) | Speed estimate: 64.3 km/h (within 2%) |
| Rollover threshold | Static stability factor: SSF = T / (2 * h_cg) | Sedan (T=1.5m, h_cg=0.55m) at 80km/h on flat road | No rollover (SSF = 1.36 > threshold) |
| Salvage value | Industry standard: 15% of market value | Vehicle market value $20,000 | Salvage: $3,000; Payout: $17,000 |

**Metrics Validation:** After the `/metrics` endpoint is deployed, start the Prometheus Docker container and verify that metrics are being scraped at the configured 15-second interval. Confirm that the following metrics are present: `http_request_duration_seconds` (histogram), `http_requests_total` (counter), `db_query_duration_seconds` (histogram), `claims_created_total` (counter), `fraud_detections_total` (counter).

**Performance Validation:** After composite indexes are applied, run the analytics dashboard queries and measure response times. The target is sub-200ms for all aggregate queries on the current dataset. Use `EXPLAIN` on the most complex queries to confirm index usage.

---

### Sprint 3: Scalability Infrastructure and Regulatory Compliance

**Duration:** Weeks 5–6 (10 working days)
**Theme:** Deploy the event-driven architecture foundation, implement POPIA data subject rights, and create the end-to-end test suite that validates the complete claim lifecycle.
**Sprint Goal:** The platform can scale horizontally via Kafka event streaming, meets POPIA regulatory requirements for data subject rights, and has automated E2E test coverage for the critical business workflow.

#### Sprint 3 — Task Schedule

| Day | Engineer A | Engineer B |
|---|---|---|
| Day 1–3 | **P2-03: Kafka deployment** (F-002, 24h) — Deploy Kafka cluster via Docker Compose, compile `shared/events` package, uncomment event integration in `server/routers.ts` | **P2-07: POPIA data subject rights** (F-014, 24h) — Add `deletedAt` columns to `users`, `claims`, `documents` tables |
| Day 4–5 | **P2-03: Kafka deployment** (F-002, continued) — Verify event emission on claim submission, test event consumption, deploy notification service | **P2-07: POPIA data subject rights** (F-014, continued) — Create `dataSubject.exportData` procedure, create `dataSubject.requestDeletion` procedure |
| Day 6 | **P2-03: Kafka deployment** (F-002, continued) — Integration test: submit claim, verify event in Kafka topic, verify notification delivery | **P2-07: POPIA data subject rights** (F-014, continued) — Create `dataSubject.accessRequest` procedure, add admin procedures for processing requests, handle encrypted fields |
| Day 7 | **P2-08: Notification delivery** (F-015, 8h) — With Kafka running, verify notification microservice starts and consumes events. Implement interim synchronous fallback for environments without Kafka | **P2-09: E2E test suite** (F-022, 24h) — Set up Playwright or `supertest` framework, create test fixtures and helper functions |
| Day 8–9 | **P2-08: Notification delivery** (F-015, continued) — Test notification delivery for all event types: claim submitted, assessment complete, quote received, claim approved, repair complete | **P2-09: E2E test suite** (F-022, continued) — Implement complete claim lifecycle test: submit → triage → assess → quote → approve → repair → close |
| Day 10 | Sprint 3 integration testing and regression verification | **P2-09: E2E test suite** (F-022, continued) — Add negative path tests: invalid submissions, unauthorised access, workflow violations |

**Total Sprint 3 Effort: 80 hours** (40h per engineer)

#### Sprint 3 — Entry Criteria

| Criterion | Status |
|---|---|
| Sprint 2 exit criteria fully satisfied | Required |
| Claims approval workflow functional with correct `approved_amount` | Required (Sprint 1 deliverable) |
| Encryption at rest implemented (F-005) | Required (Sprint 1 deliverable, needed for F-014) |
| Docker available in development environment | Required for Kafka deployment |
| Kafka Docker Compose configuration exists at `deployment/kafka/docker-compose.yml` | Verified |

#### Sprint 3 — Exit Criteria

| Criterion | Verification Method |
|---|---|
| Kafka cluster running with 3 brokers | `docker-compose ps` shows 3 healthy broker containers |
| Event integration uncommented and emitting events | Server logs show `[EventIntegration] Emitted claim.submitted` on claim creation |
| Notification service consuming events and delivering notifications | Notification service logs show event consumption; user receives notification |
| `dataSubject.exportData` returns complete user data package | API call returns JSON with all user PII, claims, documents |
| `dataSubject.requestDeletion` soft-deletes and anonymises user data | Database shows `deletedAt` populated, PII fields anonymised |
| E2E test suite covers complete claim lifecycle (7 status transitions) | `pnpm test tests/e2e-claim-lifecycle.test.ts` passes |
| E2E test suite covers negative paths (at least 5 scenarios) | Unauthorised access, invalid input, workflow violation tests pass |
| No regression in Sprint 1 and Sprint 2 fixes | Full `pnpm test` suite passes |

#### Sprint 3 — Testing Strategy

**Event-Driven Integration Tests:** The Kafka deployment requires a specific testing approach that validates the asynchronous event pipeline end-to-end. The test sequence is as follows:

| Step | Action | Verification |
|---|---|---|
| 1 | Submit a new claim via tRPC | Claim created in database with status `submitted` |
| 2 | Wait 5 seconds for event propagation | Kafka topic `claim.submitted` contains the event |
| 3 | Check notification service logs | Event consumed, notification created |
| 4 | Query user notifications via tRPC | Notification appears in user's notification list |

**POPIA Compliance Tests:** The data subject rights implementation requires tests that validate both the happy path and edge cases:

| Test Scenario | Expected Behaviour |
|---|---|
| User requests data export | Returns JSON containing all PII, claims, documents, and audit trail entries associated with the user |
| User requests deletion | All PII fields set to `[REDACTED]`, `deletedAt` timestamp populated, associated documents soft-deleted |
| Deleted user attempts login | Login succeeds but profile shows anonymised data; no access to historical claims |
| Admin processes deletion request | Admin can view request queue, approve/reject, and execute deletion |
| Export includes encrypted fields | Exported data contains decrypted plaintext (not ciphertext) |

**E2E Lifecycle Test:** The end-to-end test validates the complete claim lifecycle across all four user roles. The test uses API-level calls via `supertest` to avoid browser automation complexity while still validating the full procedure chain.

---

### Sprint 4: Optimisation and Post-Launch Hardening

**Duration:** Weeks 7–8 (10 working days)
**Theme:** Address remaining Medium and Low priority items that improve operational efficiency, long-term maintainability, and edge-case robustness.
**Sprint Goal:** All 22 identified failures are resolved, the test suite achieves 95%+ pass rate, and the platform reaches 97% production readiness.

#### Sprint 4 — Task Schedule

| Day | Engineer A | Engineer B |
|---|---|---|
| Day 1 | **P3-01: Node.js PDF extraction** (F-016, 8h) — Replace Python `spawn()` with `pdf-lib` or `pdf2pic` for photo extraction | **P3-05: Police report integration** (F-021, 8h) — Debug `policeReport.test.ts`, fix ZRP report parser |
| Day 2 | **P3-01: Node.js PDF extraction** (F-016, continued) — Write tests, verify extracted images match Python output quality | **P3-05: Police report integration** (F-021, continued) — Verify parsed data integrates with claim record, fix cross-referencing |
| Day 3 | **P3-04: Data retention policy** (F-020, 16h) — Define retention periods, create `data_retention_policy` configuration table | **P3-02: Connection pooling** (F-018, 4h) — Configure explicit pool parameters: `connectionLimit: 20`, `queueLimit: 50` |
| Day 4 | **P3-04: Data retention policy** (F-020, continued) — Implement `node-cron` scheduled job for nightly archival and session purge | **P3-03: Rate limiter IPv6 fix** (F-017, 2h) — Use built-in `ipKeyGenerator` helper, verify IPv6 normalisation |
| Day 5 | **P3-04: Data retention policy** (F-020, continued) — Write tests for retention logic, verify archival preserves data integrity | Connection pool metrics integration with Prometheus (complement to F-004 and F-018) |
| Day 6–7 | Comprehensive regression testing across all 22 fixes | Comprehensive regression testing across all 22 fixes |
| Day 8 | Performance benchmarking: load test with simulated concurrent users | Security audit: re-run all Sprint 1 security test vectors |
| Day 9 | Documentation update: update README, API documentation, deployment guides | Documentation update: update architecture diagrams, monitoring runbook |
| Day 10 | Final readiness assessment and sign-off | Final readiness assessment and sign-off |

**Total Sprint 4 Effort: 46 hours** (24h Engineer A, 22h Engineer B) plus 14 hours of testing and documentation

#### Sprint 4 — Entry Criteria

| Criterion | Status |
|---|---|
| Sprint 3 exit criteria fully satisfied | Required |
| Kafka cluster operational | Required (Sprint 3 deliverable) |
| Prometheus /metrics endpoint active | Required (Sprint 2 deliverable) |
| All Priority 1 and Priority 2 fixes verified | Required |

#### Sprint 4 — Exit Criteria

| Criterion | Verification Method |
|---|---|
| PDF photo extraction uses Node.js native library (no Python dependency) | `grep -rn "python\|spawn" server/assessment-processor*` returns zero results |
| Police report parser passes all tests | `pnpm test server/policeReport.test.ts` — 13/13 pass |
| Data retention scheduled job runs and archives expired data | Trigger job manually, verify archived records and purged sessions |
| Connection pool configured with explicit limits | Database connection config shows `connectionLimit: 20` |
| Rate limiter handles IPv6 correctly (no warning in logs) | Server startup logs show no `ERR_ERL_KEY_GEN_IPV6` warning |
| Full test suite: 249+ tests, 95%+ pass rate | `pnpm test` shows 0 failures |
| All 22 failures from KINGA-FDRP-2026-002 resolved | Cross-reference each F-ID against resolution evidence |

#### Sprint 4 — Testing Strategy

**Comprehensive Regression:** The final sprint dedicates two full days to regression testing. Every test file is executed, and any new failures are investigated immediately. The target is zero failures across the entire test suite.

**Performance Benchmarking:** Using `autocannon` or `k6`, simulate 50 concurrent users performing the following operations simultaneously: claim submission (10 users), claim listing with filters (20 users), analytics dashboard queries (10 users), document upload (5 users), and notification polling (5 users). The target response time is p95 < 500ms for all endpoints.

**Security Re-validation:** Re-execute all Sprint 1 security test vectors to confirm that no subsequent changes have introduced regressions in the security posture.

---

## 3. Task Allocation Suggestions

The following table provides role-based allocation guidance for each failure, considering the skill domain required and the optimal parallelisation strategy.

| Failure ID | Primary Skill Domain | Suggested Allocation | Rationale |
|---|---|---|---|
| F-001 | Backend Security | Engineer B | Straightforward integration; frees Engineer A for complex work |
| F-002 | DevOps / Infrastructure | Engineer A | Requires Docker, Kafka, and microservice deployment experience |
| F-003 | Physics / Mathematics | Engineer A | Requires domain knowledge of vehicle dynamics and collision mechanics |
| F-004 | Backend Observability | Engineer B | Standard Prometheus integration; well-documented pattern |
| F-005 | Backend Security / Cryptography | Engineer A | Requires careful implementation of AES-256-GCM and migration planning |
| F-006 | Frontend | Engineer B | Simple URL construction fix; minimal risk |
| F-007 | Backend Security | Engineer A | Quick Helmet installation; pairs well with other security work |
| F-008 | Full Stack | Engineer A | Requires both server-side sanitisation and frontend DOMPurify |
| F-009 | Database | Engineer B | Schema modification; low risk with `pnpm db:push` |
| F-010 | Backend | Engineer B | Systematic `console.log` replacement; time-consuming but straightforward |
| F-011 | Backend / Data | Engineer B | Depends on F-019; restore SQL expressions in analytics queries |
| F-012 | Backend / Mathematics | Engineer A | Requires debugging timeout and cents-to-dollars conversion |
| F-013 | Backend Security | Engineer A | Requires JWT verification and role-based filtering logic |
| F-014 | Full Stack / Compliance | Engineer B | Requires schema changes, new procedures, and understanding of POPIA |
| F-015 | Backend / Microservices | Engineer A | Depends on F-002; requires Kafka consumer verification |
| F-016 | Backend | Engineer A | Requires evaluating Node.js PDF libraries as Python replacement |
| F-017 | Backend | Engineer B | Minor configuration fix |
| F-018 | Backend / Database | Engineer B | Configuration change with metrics integration |
| F-019 | Backend | Engineer B | Critical workflow fix; debug existing test assertions |
| F-020 | Backend | Engineer A | Requires scheduled job implementation and retention policy design |
| F-021 | Backend | Engineer B | Debug existing parser; domain-specific to ZRP report format |
| F-022 | Testing / QA | Engineer B | Requires test framework setup and comprehensive scenario design |

The allocation balances workload across both engineers while grouping related skills. Engineer A handles the more complex items requiring domain expertise (physics, cryptography, infrastructure), while Engineer B handles the systematic integration work (sanitisation, logging, testing, compliance).

---

## 4. Expected Readiness Progression

The following table tracks the projected production readiness score at the end of each sprint, broken down by the eight assessment dimensions.

| Dimension | Weight | Baseline (68%) | After Sprint 1 | After Sprint 2 | After Sprint 3 | After Sprint 4 |
|---|---|---|---|---|---|---|
| Core Workflow Functionality | 20% | 85% | 90% | 90% | 95% | 97% |
| Security Posture | 20% | 35% | 80% | 80% | 82% | 85% |
| Data Integrity & Accuracy | 15% | 60% | 85% | 88% | 90% | 92% |
| AI Model Reliability | 10% | 55% | 55% | 90% | 90% | 92% |
| Observability & Monitoring | 10% | 20% | 20% | 80% | 82% | 85% |
| Scalability & Performance | 10% | 40% | 40% | 45% | 75% | 80% |
| Regulatory Compliance | 10% | 30% | 30% | 30% | 70% | 75% |
| Test Coverage & Quality | 5% | 65% | 70% | 78% | 88% | 95% |

| Milestone | Weighted Score | Delta | Risk Level | Business Eligibility |
|---|---|---|---|---|
| **Baseline** | **68%** | — | Medium | Development only |
| **After Sprint 1** | **84%** | +16% | Low | Insurer onboarding (pilot) |
| **After Sprint 2** | **88%** | +4% | Low | Insurer onboarding (expanded) |
| **After Sprint 3** | **94%** | +6% | Minimal | Public launch eligible |
| **After Sprint 4** | **97%** | +3% | Negligible | Full production |

The readiness progression follows a front-loaded curve: Sprint 1 delivers the largest single improvement (+16%) because it addresses the Critical and High-severity security vulnerabilities that disproportionately suppress the security posture dimension (weighted at 20%). Sprint 3 delivers the second-largest improvement (+6%) by enabling scalability and regulatory compliance, two dimensions that were previously at their lowest scores.

The following table maps each sprint's contribution to the readiness improvement, expressed as the specific failures resolved and their impact on the weighted score.

| Sprint | Failures Resolved | Primary Dimensions Improved | Readiness Gain |
|---|---|---|---|
| Sprint 1 | F-001, F-005, F-007, F-008, F-011, F-013, F-019 | Security (+45%), Data Integrity (+25%), Workflow (+5%) | +16% |
| Sprint 2 | F-003, F-004, F-006, F-009, F-010, F-012 | AI Model (+35%), Observability (+60%), Performance (+5%) | +4% |
| Sprint 3 | F-002, F-014, F-015, F-022 | Scalability (+30%), Compliance (+40%), Testing (+10%) | +6% |
| Sprint 4 | F-016, F-017, F-018, F-020, F-021 | Workflow (+2%), Performance (+5%), Compliance (+5%) | +3% |

---

## 5. Risk Mitigation and Contingency

Each sprint carries inherent execution risks. The following table identifies the most significant risks and their mitigation strategies.

| Risk | Sprint | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Encryption migration corrupts existing PII data | Sprint 1 | Medium | Critical | Create database backup before migration. Implement migration in batches with rollback capability. Test on staging data first. |
| Advanced physics formula corrections introduce new false positives | Sprint 2 | Medium | High | Validate each formula against at least 3 published reference scenarios. Run the full fraud detection test suite after each formula change. |
| Kafka cluster deployment fails in development environment | Sprint 3 | Low | High | Fall back to single-broker configuration. If Docker is unavailable, implement in-memory event bus for development and defer Kafka to staging deployment. |
| E2E test suite is brittle due to timing dependencies | Sprint 3 | High | Medium | Use explicit waits and retry logic rather than fixed delays. Implement test data factories that create isolated test scenarios. |
| Connection pooling changes cause intermittent connection drops | Sprint 4 | Low | Medium | Apply changes during low-traffic window. Monitor connection metrics via Prometheus for 24 hours before declaring success. |

---

## 6. Sprint Ceremonies and Communication

To maintain alignment and momentum across the four-sprint execution plan, the following ceremonies are recommended.

| Ceremony | Frequency | Duration | Purpose |
|---|---|---|---|
| Sprint Planning | Start of each sprint | 2 hours | Review sprint backlog, confirm task assignments, identify blockers |
| Daily Standup | Daily | 15 minutes | Progress updates, blocker identification, pair programming coordination |
| Sprint Review | End of each sprint | 1 hour | Demonstrate completed fixes, review test results, update readiness score |
| Sprint Retrospective | End of each sprint | 30 minutes | Process improvements, tooling adjustments, estimation accuracy review |
| Stakeholder Update | End of Sprint 1 and Sprint 3 | 30 minutes | Report readiness progression to business stakeholders (insurer onboarding and public launch milestones) |

---

## 7. Definition of Done

A fix is considered "Done" when all of the following criteria are satisfied:

| Criterion | Description |
|---|---|
| **Code Complete** | Implementation merged to main branch with no TypeScript errors |
| **Unit Tested** | Dedicated unit tests written and passing for the specific fix |
| **Integration Tested** | Fix verified in the context of the complete application (no regressions) |
| **Peer Reviewed** | Code reviewed by the other engineer on the team |
| **Documentation Updated** | Relevant README sections, API documentation, or architecture diagrams updated |
| **Checkpoint Saved** | `webdev_save_checkpoint` executed with descriptive commit message |
| **Readiness Score Updated** | Dimension scores recalculated and recorded in the sprint review |

---

## Appendix A: Complete Fix-to-Sprint Mapping

The following table provides a comprehensive cross-reference between every failure ID, its fix priority, the assigned sprint, and the responsible engineer.

| Failure ID | Fix ID | Priority | Sprint | Engineer | Hours | Category |
|---|---|---|---|---|---|---|
| F-001 | P1-01 | 1 | Sprint 1 | B | 4 | Security Risk |
| F-005 | P1-02 | 1 | Sprint 1 | A | 16 | Security Risk |
| F-007 | P1-03 | 1 | Sprint 1 | A | 2 | Security Risk |
| F-008 | P1-04 | 1 | Sprint 1 | A | 8 | Security Risk |
| F-013 | P1-05 | 1 | Sprint 1 | A | 8 | Security Risk |
| F-011 | P1-06 | 1 | Sprint 1 | B | 8 | Data Integrity Risk |
| F-019 | P1-07 | 1 | Sprint 1 | B | 8 | Workflow Failure |
| F-003 | P1-08 | 1 | Sprint 2 | A | 16 | AI Model Failure |
| F-004 | P2-01 | 2 | Sprint 2 | B | 12 | Governance / Logging Gap |
| F-012 | P2-02 | 2 | Sprint 2 | A | 12 | AI Model Failure |
| F-002 | P2-03 | 2 | Sprint 3 | A | 24 | Scalability Limitation |
| F-010 | P2-04 | 2 | Sprint 2 | B | 12 | Governance / Logging Gap |
| F-009 | P2-05 | 2 | Sprint 2 | B | 4 | Performance Bottleneck |
| F-006 | P2-06 | 2 | Sprint 2 | B | 2 | UI / Dashboard Visibility |
| F-014 | P2-07 | 2 | Sprint 3 | B | 24 | Governance / Logging Gap |
| F-015 | P2-08 | 2 | Sprint 3 | A | 8 | Workflow Failure |
| F-022 | P2-09 | 2 | Sprint 3 | B | 24 | Governance / Logging Gap |
| F-016 | P3-01 | 3 | Sprint 4 | A | 8 | Workflow Failure |
| F-018 | P3-02 | 3 | Sprint 4 | B | 4 | Performance Bottleneck |
| F-017 | P3-03 | 3 | Sprint 4 | B | 2 | Security Risk |
| F-020 | P3-04 | 3 | Sprint 4 | A | 16 | Governance / Logging Gap |
| F-021 | P3-05 | 3 | Sprint 4 | B | 8 | Workflow Failure |

---

## Appendix B: Cumulative Test Suite Progression

The following table projects the expected test suite growth and pass rate at the end of each sprint.

| Metric | Baseline | After Sprint 1 | After Sprint 2 | After Sprint 3 | After Sprint 4 |
|---|---|---|---|---|---|
| Total Test Files | 16 | 18 | 18 | 20 | 20 |
| Total Test Cases | 249 | 275 | 290 | 330 | 345 |
| Passing Tests | 212 | 260 | 285 | 325 | 340 |
| Failing Tests | 26 | 5 | 0 | 0 | 0 |
| Skipped Tests | 11 | 10 | 5 | 5 | 5 |
| Pass Rate | 85.1% | 94.5% | 98.3% | 98.5% | 98.6% |

The pass rate improvement is most dramatic in Sprint 1 (+9.4%) due to the resolution of the approval workflow and analytics test failures. Sprint 2 eliminates the remaining failures in the physics and valuation modules. Sprints 3 and 4 add new test cases (E2E suite, POPIA compliance, data retention) while maintaining the zero-failure target for existing tests.

---

*Sprint plan prepared by Tavonga Shoko. All effort estimates, dependency chains, and readiness projections are derived from the Failure Decomposition and Risk Prioritisation Report (KINGA-FDRP-2026-002) and validated against the current codebase state as of February 11, 2026.*
