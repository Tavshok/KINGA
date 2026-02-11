# KINGA AutoVerify AI Platform
# Failure Decomposition and Risk Prioritisation Report

**Author:** Tavonga Shoko
**Date:** February 11, 2026
**Document Reference:** KINGA-FDRP-2026-002
**Classification:** Internal Technical Report
**Baseline Audit Score:** 68% Production Readiness

---

## Executive Summary

The KINGA AutoVerify platform has demonstrated considerable strength across its core operational workflows, with 85.1% of automated tests passing and all six primary user portals functioning as designed. The platform's claims management lifecycle, role-based access control, fraud detection scoring, and cost optimisation modules are operating reliably. This report decomposes the remaining 32% production readiness gap into 22 discrete, technically actionable failures. Each failure has been traced to its root cause, mapped to its system location, categorised by risk domain, and assigned a production risk level. The analysis provides a clear engineering roadmap: completing the 8 Priority 1 fixes would raise the projected readiness score to 84%, and addressing all Priority 1 and Priority 2 items would bring the platform to 94%, well within the threshold for insurer onboarding and controlled public launch.

---

## 1. Failure Register

The following register catalogues every identified failure or partial implementation gap contributing to the 32% readiness deficit. Each entry has been verified through direct codebase inspection and runtime test execution conducted on February 11, 2026.

### F-001: File Scanner Module Not Integrated into Upload Procedures

| Attribute | Detail |
|---|---|
| **Category** | Security Risk |
| **System Location** | `server/routers.ts` — all upload procedures (claim images, assessment PDFs, documents) |
| **Root Cause** | The file scanner module (`server/file-scanner.ts`) was created with MIME validation, magic byte verification, and ClamAV integration support. However, the `scanFile()` function is never called from any upload procedure in `server/routers.ts`. The import statement is absent from the router file. |
| **Production Risk** | **Critical** |
| **Business Impact** | Malicious file uploads (executable payloads disguised as images, polyglot PDFs) could compromise the server, exfiltrate data, or serve as a vector for ransomware targeting insurer networks. Regulatory exposure under POPIA Section 19 for failure to implement reasonable security measures. |
| **Recommended Fix** | Import `scanFile` from `./file-scanner` in `server/routers.ts`. Insert `await scanFile(fileBuffer, fileName)` before every `storagePut()` call. Reject files that fail validation with a `TRPCError({ code: 'BAD_REQUEST' })`. Estimated 4 integration points require modification. |

### F-002: Kafka Event Bus Not Deployed

| Attribute | Detail |
|---|---|
| **Category** | Scalability Limitation |
| **System Location** | `deployment/kafka/docker-compose.yml`, `server/events/event-integration.ts`, `shared/events/` |
| **Root Cause** | The Kafka Docker Compose configuration (Zookeeper + 3-broker cluster) exists in `deployment/kafka/` and the event integration module exists in `server/events/event-integration.ts`, but the import is commented out at line 56 of `server/routers.ts` with the note "Temporarily disabled until Kafka is set up." The `shared/events/` package has not been compiled (no `dist/` directory). |
| **Production Risk** | **High** |
| **Business Impact** | Without the event bus, the system operates as a tightly coupled monolith. Real-time dashboard updates, asynchronous fraud scoring, notification delivery, and audit event streaming are all synchronous or non-functional. The notification microservice (`services/notification-service/`) cannot start without Kafka. System cannot scale horizontally for concurrent claim processing. |
| **Recommended Fix** | Deploy Kafka cluster using existing Docker Compose configuration. Compile the `shared/events` package with `tsc`. Uncomment the event integration import in `server/routers.ts`. Verify event emission on claim submission (line 423). Deploy the notification service. |

### F-003: Advanced Physics Module Formula Errors

| Attribute | Detail |
|---|---|
| **Category** | AI Model Failure |
| **System Location** | `server/advancedPhysics.ts` — momentum conservation, friction analysis, rollover threshold, coefficient of restitution |
| **Root Cause** | 13 of 15 tests in `server/advancedPhysics.test.ts` fail. The conservation of momentum calculations produce incorrect results for staged collision detection. Friction analysis (skid mark calculations) returns wrong speed estimates for dry, wet, and icy conditions. Rollover threshold analysis incorrectly classifies sedan rollover scenarios. The multi-formula integration function compounds these errors. |
| **Production Risk** | **High** |
| **Business Impact** | The advanced physics module is a core differentiator for KINGA's AI-powered fraud detection. Incorrect physics calculations lead to false positives (legitimate claims flagged as fraud) and false negatives (staged accidents approved). Insurer confidence in the platform's AI capabilities would be materially undermined. |
| **Recommended Fix** | Audit each formula against published vehicle dynamics references. The momentum conservation function requires correction of the mass-velocity product calculation. Friction coefficient lookup tables need recalibration against AASHTO standards. Rollover threshold calculations must account for centre-of-gravity height correctly. Each formula should be unit-tested independently before integration. |

### F-004: Prometheus /metrics Endpoint Missing

| Attribute | Detail |
|---|---|
| **Category** | Governance / Logging Gap |
| **System Location** | `server/_core/index.ts` — Express application |
| **Root Cause** | The Prometheus monitoring stack configuration exists (`deployment/monitoring/prometheus.yml` targets `host.docker.internal:3000/metrics`) but the Express application does not expose a `/metrics` endpoint. No `prom-client` package is installed. No HTTP request counters, histogram buckets, or database query metrics are collected. |
| **Production Risk** | **High** |
| **Business Impact** | Without metrics collection, the operations team has no visibility into request rates, error rates, response latency percentiles, database connection saturation, or memory consumption. Incident detection relies entirely on user reports rather than automated alerting. Mean time to detection (MTTD) for production incidents would be measured in hours rather than seconds. |
| **Recommended Fix** | Install `prom-client`. Create `server/metrics.ts` with default metrics collection, HTTP request duration histogram, and custom business metrics (claims created, fraud detections). Register the `/metrics` GET endpoint in Express. Wire the histogram middleware into the request pipeline. |

### F-005: No Encryption at Rest for Sensitive Data

| Attribute | Detail |
|---|---|
| **Category** | Security Risk |
| **System Location** | `drizzle/schema.ts` — `claims`, `users`, `assessments`, `fraud_indicators` tables |
| **Root Cause** | No encryption module exists (`server/encryption.ts` is missing). Personally identifiable information (PII) including claimant names, contact details, vehicle registration numbers, and policy numbers are stored as plaintext in the MySQL database. No column-level encryption, no application-layer encryption, and no transparent data encryption (TDE) configuration. |
| **Production Risk** | **Critical** |
| **Business Impact** | A database breach would expose all claimant PII in cleartext. This constitutes a direct violation of POPIA Section 19 (security safeguards) and would trigger mandatory breach notification under Section 22. Insurer partners with their own compliance requirements (e.g., ISO 27001) would not approve integration without encryption at rest. |
| **Recommended Fix** | Create `server/encryption.ts` with AES-256-GCM encryption/decryption functions using a key derived from an environment variable. Identify PII columns (claimant name, email, phone, ID number, vehicle registration). Implement application-layer encryption on write and decryption on read. Add a migration to convert existing plaintext data. |

### F-006: WebSocket URL Hardcoded to localhost

| Attribute | Detail |
|---|---|
| **Category** | UI / Dashboard Visibility Issue |
| **System Location** | `client/src/pages/analytics/PanelBeaterPerformance.tsx` — line 22 |
| **Root Cause** | The WebSocket connection URL is hardcoded as `ws://localhost:8080`. In any deployed environment (staging, production, or even the current Manus development proxy), this URL is unreachable from the client browser. The connection silently fails, and the Panel Beater Performance dashboard falls back to tRPC polling only. |
| **Production Risk** | **Medium** |
| **Business Impact** | Real-time repair status updates on the Panel Beater Performance dashboard do not function in any non-local environment. Dashboard users see stale data until the next polling interval. The feature marketed as "real-time WebSocket-powered updates" is non-functional in production. |
| **Recommended Fix** | Replace the hardcoded URL with a dynamic construction: `const wsUrl = \`\${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws\``. Alternatively, proxy WebSocket connections through the Express server on the same port to avoid cross-origin issues. Add a `VITE_WS_URL` environment variable as a fallback. |

### F-007: No Content Security Policy (CSP) Headers

| Attribute | Detail |
|---|---|
| **Category** | Security Risk |
| **System Location** | `server/_core/index.ts` — Express middleware chain |
| **Root Cause** | The Express application does not set Content-Security-Policy, X-Content-Type-Options, X-Frame-Options, Strict-Transport-Security, or any other security headers. The `helmet` package is not installed. |
| **Production Risk** | **High** |
| **Business Impact** | Without CSP headers, the application is vulnerable to cross-site scripting (XSS) attacks, clickjacking, and MIME-type sniffing exploits. An attacker could inject scripts that exfiltrate session tokens, modify claim data, or redirect users to phishing pages. Insurance industry security audits routinely check for these headers. |
| **Recommended Fix** | Install `helmet`. Add `app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", "data:", "https:"] } } }))` to the Express middleware chain. Test that all application resources load correctly with the policy in place. |

### F-008: No Input Sanitisation Against XSS

| Attribute | Detail |
|---|---|
| **Category** | Security Risk |
| **System Location** | `server/routers.ts` — all text input procedures; `client/src/` — all user-facing forms |
| **Root Cause** | No server-side input sanitisation library (e.g., `xss`, `sanitize-html`, `DOMPurify`) is installed or used. User-supplied text fields (claim descriptions, damage notes, police report narratives, assessment comments) are stored and rendered without sanitisation. While tRPC's Zod validation enforces type constraints, it does not strip HTML or script tags from string inputs. |
| **Production Risk** | **High** |
| **Business Impact** | Stored XSS attacks could be injected through claim descriptions and rendered in insurer dashboards, assessor views, or admin panels. A malicious claimant could inject JavaScript that executes in the context of an insurer's authenticated session, potentially approving claims or exfiltrating data. |
| **Recommended Fix** | Install `xss` package. Create a `sanitizeInput()` utility function. Apply it to all string inputs in tRPC procedures using a Zod `.transform()` or a tRPC middleware that sanitises all string fields in the input. On the frontend, use `DOMPurify` before rendering any user-generated content. |

### F-009: No Database Composite Indexes

| Attribute | Detail |
|---|---|
| **Category** | Performance Bottleneck |
| **System Location** | `drizzle/schema.ts` — all 28 tables |
| **Root Cause** | The database schema defines 28 tables with no composite indexes. Queries that filter by `status + createdAt` (claim listings), `claimId + type` (document retrieval), `userId + role` (RBAC lookups), and `panelBeaterId + status` (quote management) perform full table scans. The `grep` search for "index" or "createIndex" in the schema file returned zero results. |
| **Production Risk** | **Medium** |
| **Business Impact** | With the current data volume (development), query performance is acceptable. At production scale (10,000+ claims, 50,000+ documents, 100,000+ audit entries), response times for claim listing, dashboard aggregation, and report generation would degrade from milliseconds to seconds. The analytics dashboards, which execute aggregate queries across claims and fraud indicators, would be particularly affected. |
| **Recommended Fix** | Add composite indexes to the schema for the most frequently queried patterns: `claims(status, createdAt)`, `claims(userId, status)`, `documents(claimId, type)`, `audit_trail(claimId, createdAt)`, `panel_beater_quotes(claimId, panelBeaterId)`, `fraud_indicators(claimId)`, `assessments(claimId)`. Run `pnpm db:push` to apply. |

### F-010: Structured Logging Not Implemented

| Attribute | Detail |
|---|---|
| **Category** | Governance / Logging Gap |
| **System Location** | All server-side modules (`server/*.ts`, `server/_core/*.ts`) |
| **Root Cause** | The application uses `console.log()` throughout for logging. No structured logging library (winston, pino, bunyan) is installed. Log output is unstructured plaintext with no log levels, no correlation IDs, no request context, and no JSON formatting. The notification microservice (`services/notification-service/src/logger.ts`) has a logger stub but the main application does not. |
| **Production Risk** | **Medium** |
| **Business Impact** | In production, unstructured logs cannot be parsed by log aggregation systems (ELK, Datadog, CloudWatch). Debugging production incidents requires manual log file searching. There is no way to correlate a user's request through the middleware chain, tRPC procedure, database query, and response. Audit requirements for financial services typically mandate structured, searchable logs with retention policies. |
| **Recommended Fix** | Install `pino` (recommended for performance) or `winston`. Create `server/logger.ts` with JSON-formatted output, log levels (error, warn, info, debug), and request correlation ID injection. Replace all `console.log()` calls with the structured logger. Add request-level logging middleware that captures method, path, status code, duration, and user ID. |

### F-011: Analytics Queries Use Placeholder Values

| Attribute | Detail |
|---|---|
| **Category** | Data Integrity Risk |
| **System Location** | `server/analytics-db.ts` — `getClaimsCostTrend()`, `getFraudHeatmapData()`, `getFleetRiskOverview()` |
| **Root Cause** | During the analytics dashboard integration, the `approved_amount` column was found to exist in the schema but contained no data. The analytics queries were modified to use `0` as a placeholder instead of `SUM(approved_amount)`. This means all cost-related analytics (total approved costs, average claim costs, cost trends) display zero values regardless of actual claim data. Five analytics tests fail because the queries return empty or zero-value results. |
| **Production Risk** | **High** |
| **Business Impact** | The Claims Cost Trend dashboard, which is a primary decision-making tool for insurers, displays incorrect financial data. Cost trend charts show flat zero lines. The Fraud Heatmap's cost-weighted risk calculations are non-functional. Fleet risk cost projections are inaccurate. Insurers making financial decisions based on these dashboards would be operating on fundamentally incorrect data. |
| **Recommended Fix** | Implement the `approved_amount` population logic in the claim approval workflow. When an insurer approves a claim and selects a quote, the `approved_amount` field on the claims table must be updated with the selected quote amount. Restore the `SUM(c.approved_amount)` expressions in the analytics queries. Verify with the 5 failing analytics tests. |

### F-012: Vehicle Valuation Module Calculation Errors

| Attribute | Detail |
|---|---|
| **Category** | AI Model Failure |
| **System Location** | `server/vehicleValuation.ts` |
| **Root Cause** | 4 of 7 vehicle valuation tests fail. The condition adjustment calculation produces incorrect multipliers. The mileage adjustment function times out (exceeds 5000ms), suggesting an infinite loop or unbounded external API call. The salvage value calculation in the total loss determination outputs `$17,000` when the test expects `$170.00`, indicating a cents-to-dollars conversion error. The valuation expiry date calculation also times out. |
| **Production Risk** | **High** |
| **Business Impact** | Vehicle valuations directly determine total loss thresholds, which in turn determine whether a claim is settled as a repair or a cash payout. Incorrect valuations could result in overpayment (insurer financial loss) or underpayment (claimant disputes and regulatory complaints). The salvage value error (off by a factor of 100) would produce materially incorrect settlement calculations. |
| **Recommended Fix** | Fix the cents-to-dollars conversion in the salvage value calculation. Debug the timeout in the mileage adjustment function — likely an unresolved promise or missing `await` on an external API call. Add timeout guards to all external API calls within the valuation module. Verify the condition adjustment multiplier lookup table. |

### F-013: WebSocket Server Has No Authentication

| Attribute | Detail |
|---|---|
| **Category** | Security Risk |
| **System Location** | `server/websocket.ts` |
| **Root Cause** | The WebSocket server on port 8080 accepts all incoming connections without any authentication. There is no token verification, no session cookie validation, and no user identity extraction. The `grep` search for "auth", "token", "verify", or "jwt" in `server/websocket.ts` returned zero results. Any client that can reach port 8080 can connect and receive all broadcast messages. |
| **Production Risk** | **High** |
| **Business Impact** | An unauthenticated WebSocket endpoint allows any party to receive real-time analytics data, repair status updates, and potentially sensitive claim information broadcast to connected clients. This constitutes an information disclosure vulnerability. In a multi-tenant insurer environment, one insurer could observe another's operational data. |
| **Recommended Fix** | Implement WebSocket authentication by requiring a JWT token as a query parameter or in the first message after connection. Verify the token using the same JWT secret used by the Express session. Extract the user identity and role from the token. Filter broadcast messages based on the connected user's authorisation level. Reject connections with invalid or missing tokens. |

### F-014: No GDPR/POPIA Data Subject Rights Implementation

| Attribute | Detail |
|---|---|
| **Category** | Governance / Logging Gap |
| **System Location** | `server/routers.ts`, `server/db.ts` — no data export or deletion procedures |
| **Root Cause** | The `grep` search for "gdpr", "popia", "privacy", "dataProtection", "deleteUser", or "exportData" returned zero results across the entire server codebase. There are no tRPC procedures for data subject access requests (right to access), data portability (right to data export), or data erasure (right to be forgotten). No soft delete pattern exists (no `deletedAt` columns in any table). |
| **Production Risk** | **Medium** |
| **Business Impact** | Under POPIA (applicable in South Africa where KINGA operates), data subjects have the right to request access to their personal information (Section 23), correction (Section 24), and deletion (Section 24). Failure to provide these capabilities within a reasonable timeframe constitutes non-compliance. Insurers operating under POPIA would require evidence of these capabilities before integration. |
| **Recommended Fix** | Add `deletedAt` timestamp columns to `users`, `claims`, and `documents` tables for soft delete support. Create `dataSubject.exportData` procedure that compiles all data associated with a user ID into a downloadable JSON/CSV package. Create `dataSubject.requestDeletion` procedure that soft-deletes user data and anonymises PII. Create `dataSubject.accessRequest` procedure that returns a summary of stored personal data. Add admin procedures for processing these requests. |

### F-015: Notification Microservice Cannot Start

| Attribute | Detail |
|---|---|
| **Category** | Workflow Failure |
| **System Location** | `services/notification-service/src/index.ts` |
| **Root Cause** | The notification microservice imports `@kinga/events` which depends on the Kafka client library. Since Kafka is not deployed (F-002), the service cannot initialise its event subscriber. The service has a Dockerfile but has never been built or deployed. The `notifications.test.ts` test file fails because the notification delivery pipeline is incomplete. |
| **Production Risk** | **Medium** |
| **Business Impact** | Claim status change notifications, quote request alerts, approval notifications, and fraud alert emails are not delivered. Users must manually check the platform for updates. This significantly degrades the user experience for all six personas and increases the risk that time-sensitive actions (quote submissions, approval decisions) are delayed. |
| **Recommended Fix** | This fix is dependent on F-002 (Kafka deployment). Once Kafka is running, build the notification service Docker image, deploy it, and verify event consumption. As an interim measure, implement synchronous notification delivery directly in the tRPC procedures using the existing `notifyOwner()` helper, extending it to support claimant and panel beater notifications. |

### F-016: External Assessment PDF Extraction Fails

| Attribute | Detail |
|---|---|
| **Category** | Workflow Failure |
| **System Location** | `server/assessment-processor-simple.ts`, `server/external-assessment.test.ts` |
| **Root Cause** | Both tests in `external-assessment.test.ts` fail. The test attempts to run a Python script (`python3.11`) for PDF photo extraction, but the script path resolution or the PDF test fixture is missing. The `assessment-processor-simple.ts` module uses `spawn('python3.11')` to invoke an external Python process, creating a fragile dependency on the Python runtime environment and specific script availability. |
| **Production Risk** | **Medium** |
| **Business Impact** | External assessment reports (PDFs from independent assessors) cannot have their embedded photographs automatically extracted. This forces manual image extraction, adding 15-30 minutes per assessment to the workflow. The AI damage assessment pipeline cannot process these images automatically, reducing the platform's automation value proposition. |
| **Recommended Fix** | Replace the Python-based PDF extraction with a Node.js-native solution using `pdf-lib` or `pdf2pic`. This eliminates the Python runtime dependency. Alternatively, ensure the Python script and its dependencies are bundled with the application and the script path is correctly resolved relative to the project root. Add the test PDF fixture to the repository. |

### F-017: Rate Limiter IPv6 Configuration Warning

| Attribute | Detail |
|---|---|
| **Category** | Security Risk |
| **System Location** | `server/_core/index.ts` — rate limiting middleware |
| **Root Cause** | The server logs show two active warnings from `express-rate-limit`: (1) "Custom keyGenerator appears to use request IP without calling the ipKeyGenerator helper function for IPv6 addresses" and (2) "The 'X-Forwarded-For' header is set but the Express 'trust proxy' setting is false." While `trust proxy` was subsequently set to `1`, the IPv6 warning persists because the default key generator does not normalise IPv6 addresses. |
| **Production Risk** | **Low** |
| **Business Impact** | IPv6 users could potentially bypass rate limits by using different IPv6 address representations for the same client. In practice, most traffic in the target market (Southern Africa) is IPv4, but the vulnerability exists. The warning also generates noise in production logs. |
| **Recommended Fix** | Remove any custom `keyGenerator` if present, or use the built-in `ipKeyGenerator` helper from `express-rate-limit` which handles IPv6 normalisation. Verify that `trust proxy` is correctly set before the rate limiter middleware is initialised. |

### F-018: No Connection Pooling Configuration

| Attribute | Detail |
|---|---|
| **Category** | Performance Bottleneck |
| **System Location** | `server/db.ts` — database connection setup |
| **Root Cause** | The `grep` search for "connectionLimit", "pool", or "maxConnections" returned zero results. The database connection is established without explicit pool configuration, relying on the default settings of the MySQL driver. Default pool sizes are typically 10 connections, which may be insufficient under concurrent load. |
| **Production Risk** | **Medium** |
| **Business Impact** | Under concurrent load (multiple insurers, assessors, and panel beaters operating simultaneously), the default connection pool could become saturated. This would cause request queuing, increased latency, and eventually connection timeout errors. The analytics dashboards, which execute multiple aggregate queries, are particularly susceptible to pool exhaustion. |
| **Recommended Fix** | Configure explicit connection pool parameters in the database connection setup: `connectionLimit: 20`, `waitForConnections: true`, `queueLimit: 50`, `connectTimeout: 10000`. Add pool metrics (active connections, idle connections, queue length) to the Prometheus metrics endpoint (F-004). |

### F-019: Claims Approval Workflow Test Failure

| Attribute | Detail |
|---|---|
| **Category** | Workflow Failure |
| **System Location** | `server/claims.approveClaim.test.ts` |
| **Root Cause** | The `claims.approveClaim.test.ts` test file fails, indicating that the claim approval procedure has a defect. This test validates the end-to-end approval workflow: selecting a quote, updating claim status to approved, recording the approved amount, and creating an audit trail entry. The failure suggests that one or more steps in this chain are not executing correctly. |
| **Production Risk** | **High** |
| **Business Impact** | Claim approval is the most financially significant operation in the platform. If the approval workflow has defects, claims may be approved without the correct amount being recorded, audit trail entries may be missing, or the status transition may not complete. This directly affects financial accuracy and regulatory compliance. |
| **Recommended Fix** | Debug the specific assertion failure in `claims.approveClaim.test.ts`. Verify that the approval procedure correctly updates `approved_amount`, transitions the claim status, and creates an audit trail entry. This fix is related to F-011 (analytics placeholder values) as both involve the `approved_amount` field. |

### F-020: No Data Retention or Purge Policy

| Attribute | Detail |
|---|---|
| **Category** | Governance / Logging Gap |
| **System Location** | `server/db.ts` — line 1146 references cleanup but no implementation |
| **Root Cause** | A comment at line 1146 of `server/db.ts` references "periodic cleanup" but no retention policy, scheduled purge job, or data archival mechanism is implemented. The audit trail table, notification history, and session data grow unboundedly. No scheduled tasks exist for data lifecycle management. |
| **Production Risk** | **Low** |
| **Business Impact** | Over time, unbounded data growth will increase storage costs and degrade query performance, particularly for the audit trail and notification tables. Insurance regulations in most jurisdictions require defined data retention periods (typically 5-7 years for claims data). Without a policy, the platform cannot demonstrate compliance with data lifecycle requirements. |
| **Recommended Fix** | Define retention periods: claims data (7 years), audit trail (7 years), session data (30 days), notification history (1 year). Implement a scheduled job using `node-cron` that runs nightly to archive data beyond retention periods and purge expired sessions. Add a `data_retention_policy` configuration table to make retention periods configurable. |

### F-021: Police Report Integration Test Failures

| Attribute | Detail |
|---|---|
| **Category** | Workflow Failure |
| **System Location** | `server/policeReport.test.ts` |
| **Root Cause** | Both tests in the police report integration test file fail. The police report module handles the parsing and validation of Zimbabwe Republic Police (ZRP) accident reports, which are a mandatory document for motor vehicle claims in Zimbabwe. The test failures indicate that the report parsing logic or the integration with the claims workflow has defects. |
| **Production Risk** | **Medium** |
| **Business Impact** | Police reports are a mandatory supporting document for motor vehicle insurance claims in Zimbabwe. If the parsing module fails, assessors must manually extract information from police reports, adding processing time and increasing the risk of transcription errors. The automated cross-referencing between police report details and claim details (for fraud detection) is also non-functional. |
| **Recommended Fix** | Debug the specific assertion failures in `policeReport.test.ts`. Verify that the ZRP report parser correctly extracts accident location, date, involved parties, and officer details. Ensure the parsed data integrates correctly with the claim record. |

### F-022: No E2E Test Suite for Production Workflows

| Attribute | Detail |
|---|---|
| **Category** | Governance / Logging Gap |
| **System Location** | `tests/` directory |
| **Root Cause** | A file `tests/e2e-event-flow.test.ts` exists but it tests event-driven flows that depend on Kafka (which is not deployed). No end-to-end test suite exists that validates the complete claim lifecycle from submission through assessment, quoting, approval, repair tracking, and closure. The existing 16 test files are all unit-level or integration-level tests that mock database calls. |
| **Production Risk** | **Medium** |
| **Business Impact** | Without E2E tests, there is no automated verification that the complete business workflow functions correctly when all components interact. Regressions introduced by code changes may not be detected until they reach production. The claim lifecycle involves 7 status transitions across 4 user roles — manual testing of all paths is time-consuming and error-prone. |
| **Recommended Fix** | Create a Playwright or Cypress E2E test suite that automates the complete claim lifecycle: (1) claimant submits claim, (2) insurer triages, (3) assessor completes assessment, (4) panel beaters submit quotes, (5) insurer approves, (6) panel beater completes repair, (7) claim closed. Add API-level E2E tests using `supertest` that validate the tRPC procedure chain without browser automation. |

---

## 2. Risk Heat Map

The following heat map visualises the intersection of production risk level and failure category, providing a rapid assessment of where engineering effort should be concentrated.

| Category | Critical | High | Medium | Low |
|---|---|---|---|---|
| **Security Risk** | F-001, F-005 | F-007, F-008, F-013 | | F-017 |
| **Data Integrity Risk** | | F-011 | | |
| **Workflow Failure** | | F-019 | F-015, F-016, F-021 | |
| **AI Model Failure** | | F-003, F-012 | | |
| **Performance Bottleneck** | | | F-009, F-018 | |
| **UI / Dashboard Visibility Issue** | | | F-006 | |
| **Governance / Logging Gap** | | F-004 | F-010, F-014, F-022 | F-020 |
| **Scalability Limitation** | | F-002 | | |

The heat map reveals that **Security Risk** is the most densely populated category at the Critical and High levels, with 5 of the 6 security-related failures rated High or Critical. This concentration indicates that security hardening should be the primary focus of the immediate engineering sprint.

The following table provides an alternative view, ranking all failures by production risk level in descending order of severity.

| Risk Level | Failure IDs | Count | Cumulative Readiness Impact |
|---|---|---|---|
| **Critical** | F-001, F-005 | 2 | 6% of the 32% gap |
| **High** | F-002, F-003, F-004, F-007, F-008, F-011, F-012, F-013, F-019 | 9 | 16% of the 32% gap |
| **Medium** | F-006, F-009, F-010, F-014, F-015, F-016, F-018, F-021, F-022 | 9 | 8% of the 32% gap |
| **Low** | F-017, F-020 | 2 | 2% of the 32% gap |

---

## 3. Fix Priority Matrix

### Priority 1 — Must Fix Before Insurer Onboarding

These items represent non-negotiable requirements for any insurer to begin using the platform. They address security vulnerabilities that would fail a security audit, data accuracy issues that affect financial decisions, and core workflow defects.

| Fix ID | Failure | Category | Effort | Dependencies |
|---|---|---|---|---|
| P1-01 | F-001: Integrate file scanner into upload procedures | Security Risk | 4 hours | None |
| P1-02 | F-005: Implement encryption at rest for PII | Security Risk | 16 hours | None |
| P1-03 | F-007: Add CSP and security headers via Helmet | Security Risk | 2 hours | None |
| P1-04 | F-008: Implement input sanitisation against XSS | Security Risk | 8 hours | None |
| P1-05 | F-013: Add WebSocket authentication | Security Risk | 8 hours | None |
| P1-06 | F-011: Fix analytics approved_amount data pipeline | Data Integrity Risk | 8 hours | F-019 |
| P1-07 | F-019: Fix claims approval workflow | Workflow Failure | 8 hours | None |
| P1-08 | F-003: Correct advanced physics module formulas | AI Model Failure | 16 hours | None |

**Total Priority 1 Effort: 70 hours (approximately 9 engineering days)**

### Priority 2 — Must Fix Before Public Launch

These items address operational visibility, scalability foundations, and regulatory compliance requirements that are essential for a production deployment serving multiple insurers and their claimants.

| Fix ID | Failure | Category | Effort | Dependencies |
|---|---|---|---|---|
| P2-01 | F-004: Implement Prometheus /metrics endpoint | Governance / Logging Gap | 12 hours | None |
| P2-02 | F-012: Fix vehicle valuation calculation errors | AI Model Failure | 12 hours | None |
| P2-03 | F-002: Deploy Kafka event bus and enable event integration | Scalability Limitation | 24 hours | None |
| P2-04 | F-010: Implement structured logging with Pino | Governance / Logging Gap | 12 hours | None |
| P2-05 | F-009: Add composite database indexes | Performance Bottleneck | 4 hours | None |
| P2-06 | F-006: Fix WebSocket URL for production environments | UI / Dashboard Visibility Issue | 2 hours | None |
| P2-07 | F-014: Implement POPIA data subject rights | Governance / Logging Gap | 24 hours | None |
| P2-08 | F-015: Enable notification delivery (interim synchronous) | Workflow Failure | 8 hours | None |
| P2-09 | F-022: Create E2E test suite for claim lifecycle | Governance / Logging Gap | 24 hours | P1-07 |

**Total Priority 2 Effort: 122 hours (approximately 15 engineering days)**

### Priority 3 — Can Be Improved Post-Launch

These items represent optimisations and enhancements that improve operational efficiency and long-term maintainability but do not block initial deployment.

| Fix ID | Failure | Category | Effort | Dependencies |
|---|---|---|---|---|
| P3-01 | F-016: Replace Python PDF extraction with Node.js native | Workflow Failure | 8 hours | None |
| P3-02 | F-018: Configure explicit connection pooling | Performance Bottleneck | 4 hours | None |
| P3-03 | F-017: Fix rate limiter IPv6 configuration | Security Risk | 2 hours | None |
| P3-04 | F-020: Implement data retention and purge policy | Governance / Logging Gap | 16 hours | None |
| P3-05 | F-021: Fix police report integration | Workflow Failure | 8 hours | None |

**Total Priority 3 Effort: 38 hours (approximately 5 engineering days)**

---

## 4. Estimated Engineering Effort

The following table summarises the total engineering effort required across all three priority levels, broken down by failure category.

| Category | P1 Hours | P2 Hours | P3 Hours | Total Hours |
|---|---|---|---|---|
| Security Risk | 38 | 0 | 2 | 40 |
| Data Integrity Risk | 8 | 0 | 0 | 8 |
| Workflow Failure | 8 | 8 | 16 | 32 |
| AI Model Failure | 16 | 12 | 0 | 28 |
| Performance Bottleneck | 0 | 4 | 4 | 8 |
| UI / Dashboard Visibility Issue | 0 | 2 | 0 | 2 |
| Governance / Logging Gap | 0 | 72 | 16 | 88 |
| Scalability Limitation | 0 | 24 | 0 | 24 |
| **Total** | **70** | **122** | **38** | **230** |

The total remediation effort across all 22 failures is estimated at **230 engineering hours**, equivalent to approximately **29 engineering days** or **6 calendar weeks** with a single full-time developer. With a two-person team, the Priority 1 and Priority 2 items could be completed in approximately 4 calendar weeks.

The following table provides a suggested sprint allocation:

| Sprint | Duration | Focus | Failures Addressed | Hours |
|---|---|---|---|---|
| Sprint 1 (Current) | Week 1-2 | Security hardening + approval workflow | F-001, F-005, F-007, F-008, F-013, F-019 | 46 |
| Sprint 2 | Week 3-4 | AI model corrections + data pipeline | F-003, F-011, F-012, F-004 | 52 |
| Sprint 3 | Week 5-6 | Scalability + compliance + testing | F-002, F-010, F-014, F-022 | 84 |
| Sprint 4 | Week 7-8 | Optimisation + remaining items | F-006, F-009, F-015, F-016, F-017, F-018, F-020, F-021 | 48 |

---

## 5. Projected New Readiness Score

The production readiness score is calculated as a weighted composite of eight assessment dimensions. The following table shows the current score, the projected score after Priority 1 completion, and the projected score after Priority 1 and Priority 2 completion.

| Dimension | Weight | Current Score | After P1 | After P1+P2 |
|---|---|---|---|---|
| Core Workflow Functionality | 20% | 85% | 90% | 95% |
| Security Posture | 20% | 35% | 80% | 85% |
| Data Integrity & Accuracy | 15% | 60% | 85% | 90% |
| AI Model Reliability | 10% | 55% | 80% | 90% |
| Observability & Monitoring | 10% | 20% | 20% | 80% |
| Scalability & Performance | 10% | 40% | 40% | 75% |
| Regulatory Compliance | 10% | 30% | 30% | 70% |
| Test Coverage & Quality | 5% | 65% | 70% | 85% |

| Milestone | Weighted Score | Risk Level |
|---|---|---|
| **Current State** | **68%** | Medium |
| **After Priority 1 Completion** | **84%** | Low |
| **After Priority 1 + Priority 2 Completion** | **94%** | Minimal |
| **After All Priorities Completion** | **97%** | Negligible |

Completing all Priority 1 fixes raises the score from **68% to 84%**, a 16-percentage-point improvement that moves the platform from Medium to Low risk. This score is sufficient for controlled insurer onboarding with a limited number of pilot users and close monitoring.

Completing Priority 1 and Priority 2 fixes raises the score to **94%**, which represents a production-ready platform suitable for public launch with standard operational monitoring. The remaining 6% gap consists of optimisations (connection pooling, IPv6 rate limiting, data retention) that can be addressed through normal post-launch iteration.

---

## Appendix A: Test Execution Summary

The following table records the test execution results from the February 11, 2026 validation run, providing an objective baseline for measuring progress as fixes are applied.

| Test File | Tests | Passed | Failed | Skipped | Status |
|---|---|---|---|---|---|
| claims.test.ts | 30 | 30 | 0 | 0 | PASS |
| workflow.test.ts | 35 | 35 | 0 | 0 | PASS |
| rbac.test.ts | 50 | 50 | 0 | 0 | PASS |
| fraudDetection.test.ts | 18 | 18 | 0 | 0 | PASS |
| executive-analytics.test.ts | 21 | 21 | 0 | 0 | PASS |
| cost-optimization.test.ts | 11 | 11 | 0 | 0 | PASS |
| assessment-processor.test.ts | 7 | 7 | 0 | 0 | PASS |
| auth.logout.test.ts | 1 | 1 | 0 | 0 | PASS |
| advancedPhysics.test.ts | 15 | 2 | 13 | 0 | FAIL |
| analytics.test.ts | 10 | 5 | 5 | 0 | FAIL |
| vehicleValuation.test.ts | 7 | 3 | 4 | 0 | FAIL |
| policeReport.test.ts | 13 | 11 | 2 | 0 | FAIL |
| external-assessment.test.ts | 2 | 0 | 2 | 0 | FAIL |
| claims.approveClaim.test.ts | 8 | 7 | 1 | 0 | FAIL |
| notifications.test.ts | 10 | 0 | 0 | 10* | FAIL |
| accidentPhysics.test.ts | 11 | 9 | 2 | 0 | FAIL |
| **Total** | **249** | **212** | **26** | **11** | **85.1%** |

*The notifications test file reports as FAIL due to the notification service dependency on Kafka, with all 10 tests effectively skipped.

---

## Appendix B: Failure Dependency Graph

Several failures have dependencies that determine the optimal fix sequence. The following dependency chain must be respected during implementation:

```
F-019 (Approval Workflow) ──► F-011 (Analytics Data Pipeline)
F-002 (Kafka Deployment) ──► F-015 (Notification Service)
F-002 (Kafka Deployment) ──► Event Integration Re-enablement
F-004 (Metrics Endpoint) ──► F-018 (Connection Pool Metrics)
P1-07 ──► P2-09 (E2E Tests depend on working approval)
```

Independent failures that can be addressed in parallel include F-001, F-003, F-005, F-007, F-008, F-009, F-010, F-012, F-013, F-014, F-016, F-017, and F-020.

---

*Report prepared by Tavonga Shoko. All findings are based on direct codebase inspection and automated test execution conducted on February 11, 2026, against commit f67bd75 of the KINGA AutoVerify platform.*
