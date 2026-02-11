# KINGA AutoVerify AI - Refactor Plan

**Prepared By:** Tavonga Shoko
**Date:** February 11, 2026
**Version:** 1.0
**Reference:** KINGA System Audit Report v1.0, Patch Plan v1.0

---

## Executive Summary

This Refactor Plan addresses the structural and architectural improvements required to evolve the KINGA AutoVerify platform from its current monolithic architecture into a scalable, resilient, and maintainable system suitable for production insurance workloads. While the companion Patch Plan focuses on immediate code-level fixes, this document describes the medium-to-long-term architectural transformations that will enable the platform to handle growing claim volumes, support multi-tenant insurer deployments, and maintain operational excellence under production conditions. The refactoring work is organised into six domains, each with a clear rationale, target architecture, migration strategy, and risk assessment. The plan is designed for incremental execution, ensuring the platform remains operational throughout the transition period.

---

## 1. CURRENT ARCHITECTURE ASSESSMENT

### 1.1 Monolithic Baseline

The KINGA platform currently operates as a single Node.js process serving all functions: HTTP API (Express + tRPC), WebSocket server, AI assessment orchestration, fraud detection, analytics aggregation, and document management. The application connects to a single MySQL/TiDB database for all data persistence and an S3-compatible storage service for file management.

| Component | Current State | Target State | Gap |
|-----------|--------------|-------------|-----|
| **Application Server** | Single Express process, port 3000 | Load-balanced cluster with auto-scaling | No horizontal scaling |
| **WebSocket Server** | Separate process, port 8080 | Dedicated real-time service with Redis pub/sub | No cross-instance messaging |
| **Database** | Single MySQL/TiDB instance | Read replicas + analytics separation | Single point of failure |
| **Event Bus** | Kafka config exists, not deployed | 3-broker Kafka cluster with Schema Registry | No async processing |
| **Fraud Detection** | Inline in monolith (`server/fraud-detection-enhanced.ts`) | Independent microservice with dedicated scaling | Cannot scale independently |
| **Analytics** | Inline in monolith (`server/analytics-db.ts`, `server/executive-analytics.ts`) | Dedicated analytics service with PostgreSQL | Competes with transactions |
| **AI Assessment** | Inline LLM calls in tRPC procedures | Queued assessment service with retry logic | No retry on LLM failure |
| **File Storage** | Direct S3 calls from procedures | Storage service with scanning and lifecycle | No scanning, no lifecycle |
| **Monitoring** | Console logging only | Prometheus + Grafana with alerting | No observability |
| **CI/CD** | Manual deployment | GitHub Actions with staging environment | No automated pipeline |

### 1.2 Codebase Complexity

The `server/routers.ts` file has grown to over 2,000 lines, containing 138+ procedures across 19 logical routers. This concentration of business logic in a single file creates maintenance challenges, increases merge conflict frequency, and makes it difficult for multiple developers to work concurrently on different features.

The database schema in `drizzle/schema.ts` defines 28 tables in a single file, which is manageable but approaching the threshold where domain-based schema splitting improves maintainability.

---

## 2. ROUTER DECOMPOSITION

### 2.1 Rationale

The monolithic `server/routers.ts` file violates the single responsibility principle and creates a maintenance bottleneck. Decomposing the router into domain-specific modules improves code organisation, enables independent testing, and prepares the codebase for eventual microservice extraction.

### 2.2 Target Structure

```
server/
  routers/
    index.ts              ← Re-exports merged appRouter
    claims.router.ts      ← Claims CRUD, status transitions
    insurers.router.ts    ← Triage, policy verification, comparison
    assessors.router.ts   ← Assignments, evaluations, performance
    panelBeaters.router.ts ← Quotes, approvals, job management
    quotes.router.ts      ← Quote CRUD, comparison engine
    aiAssessments.router.ts ← AI triggers, physics validation
    documents.router.ts   ← Upload, metadata, lifecycle
    notifications.router.ts ← Alerts, preferences, delivery
    workflow.router.ts    ← State machine, approvals, escalation
    executive.router.ts   ← KPIs, strategic analytics
    analytics.router.ts   ← Dashboard data, aggregations
    admin.router.ts       ← Configuration, user management
    fraud.router.ts       ← Detection, scoring, alerts
    appointments.router.ts ← Scheduling, coordination
    audit.router.ts       ← Compliance logging, queries
    policeReports.router.ts ← OCR, validation, management
    vehicleValuation.router.ts ← Market values, depreciation
  routers.ts              ← Deprecated, redirects to routers/index.ts
```

### 2.3 Migration Strategy

The decomposition follows a **strangler fig pattern** that preserves backward compatibility throughout the migration.

**Phase 1: Extract without breaking.** Create the `server/routers/` directory and move one router at a time, starting with the least coupled modules (analytics, notifications, appointments). The original `server/routers.ts` file imports from the new modules and re-exports the merged router, ensuring no client-side changes are required.

**Phase 2: Migrate remaining routers.** Extract the remaining routers in order of increasing coupling complexity: documents, policeReports, vehicleValuation, admin, audit, quotes, panelBeaters, assessors, fraud, workflow, aiAssessments, insurers, and finally claims (the most coupled module).

**Phase 3: Remove legacy file.** Once all routers are extracted, replace `server/routers.ts` with a thin re-export file that imports from `server/routers/index.ts`.

**Estimated Effort:** 16-24 hours across 2-3 sprints.

### 2.4 Router Index Pattern

The `server/routers/index.ts` file merges all domain routers into the application router:

```typescript
import { router } from '../_core/trpc';
import { claimsRouter } from './claims.router';
import { insurersRouter } from './insurers.router';
import { assessorsRouter } from './assessors.router';
// ... remaining imports

export const appRouter = router({
  auth: authRouter,
  system: systemRouter,
  claims: claimsRouter,
  insurers: insurersRouter,
  assessors: assessorsRouter,
  panelBeaters: panelBeatersRouter,
  quotes: quotesRouter,
  aiAssessments: aiAssessmentsRouter,
  documents: documentsRouter,
  notifications: notificationsRouter,
  workflow: workflowRouter,
  executive: executiveRouter,
  analytics: analyticsRouter,
  admin: adminRouter,
  fraud: fraudRouter,
  appointments: appointmentsRouter,
  audit: auditRouter,
  policeReports: policeReportsRouter,
  vehicleValuation: vehicleValuationRouter,
});

export type AppRouter = typeof appRouter;
```

---

## 3. DATABASE ARCHITECTURE REFACTORING

### 3.1 Read Replica Configuration

The current single-database architecture creates a bottleneck where analytics queries compete with transactional operations. The refactoring introduces a read replica configuration that routes read-heavy queries to a secondary database instance.

**Target Architecture:**

```
                    ┌─────────────────┐
                    │   Application   │
                    │    Server(s)    │
                    └────────┬────────┘
                             │
                    ┌────────┴────────┐
                    │                 │
              ┌─────▼─────┐    ┌─────▼─────┐
              │  Primary   │    │   Read    │
              │  MySQL DB  │───►│  Replica  │
              │  (writes)  │    │  (reads)  │
              └────────────┘    └───────────┘
```

**Implementation in `server/db.ts`:**

```typescript
import { drizzle } from 'drizzle-orm/mysql2';
import { createPool } from 'mysql2/promise';

const primaryPool = createPool({
  uri: process.env.DATABASE_URL,
  connectionLimit: 15,
});

const replicaPool = createPool({
  uri: process.env.DATABASE_REPLICA_URL || process.env.DATABASE_URL,
  connectionLimit: 25,
});

const primaryDb = drizzle(primaryPool);
const replicaDb = drizzle(replicaPool);

export function getDb() { return primaryDb; }
export function getReadDb() { return replicaDb; }
```

Analytics procedures and read-heavy queries should use `getReadDb()` while all write operations continue using `getDb()`. This separation is transparent to the application layer and requires no schema changes.

### 3.2 Analytics Database Separation

For workloads that require complex aggregations, window functions, and OLAP-style queries, the refactoring introduces a dedicated PostgreSQL analytics database. This separation prevents analytical workloads from degrading transactional performance.

**Migration Strategy:**

The migration follows a **dual-write pattern** during the transition period, where the application writes to both MySQL and PostgreSQL simultaneously. Once data consistency is verified, analytics queries are migrated to PostgreSQL, and the dual-write is replaced with a change data capture (CDC) pipeline.

| Phase | Duration | Activity | Rollback Strategy |
|-------|----------|----------|-------------------|
| 1 | Week 1-2 | Provision PostgreSQL, create analytics schema, implement dual-write | Disable dual-write, revert to MySQL-only |
| 2 | Week 3-4 | Backfill historical data, validate consistency | Re-run backfill from MySQL source of truth |
| 3 | Week 5-6 | Migrate analytics queries to PostgreSQL, monitor performance | Switch queries back to MySQL |
| 4 | Week 7-8 | Replace dual-write with CDC pipeline (Debezium) | Revert to dual-write |

**PostgreSQL Analytics Schema:**

The analytics schema is optimised for aggregation queries with denormalised structures, materialised views, and partitioned tables.

```sql
-- Partitioned claims fact table for time-series analytics
CREATE TABLE analytics.claims_fact (
  id BIGINT PRIMARY KEY,
  claim_number VARCHAR(50) NOT NULL,
  claimant_id VARCHAR(100) NOT NULL,
  status VARCHAR(50) NOT NULL,
  damage_severity VARCHAR(20),
  estimated_cost DECIMAL(12,2),
  approved_cost DECIMAL(12,2),
  fraud_risk_score DECIMAL(5,2),
  region VARCHAR(100),
  vehicle_make VARCHAR(100),
  vehicle_model VARCHAR(100),
  vehicle_year INT,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
) PARTITION BY RANGE (created_at);

-- Monthly partitions
CREATE TABLE analytics.claims_fact_2026_01 PARTITION OF analytics.claims_fact
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE analytics.claims_fact_2026_02 PARTITION OF analytics.claims_fact
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

-- Materialised view for dashboard KPIs
CREATE MATERIALIZED VIEW analytics.daily_kpis AS
SELECT
  DATE(created_at) AS report_date,
  COUNT(*) AS total_claims,
  AVG(estimated_cost) AS avg_estimated_cost,
  AVG(fraud_risk_score) AS avg_fraud_risk,
  COUNT(*) FILTER (WHERE fraud_risk_score > 70) AS high_risk_claims,
  COUNT(*) FILTER (WHERE status = 'approved') AS approved_claims
FROM analytics.claims_fact
GROUP BY DATE(created_at);
```

### 3.3 Schema Domain Splitting

As the schema grows beyond 28 tables, splitting the single `drizzle/schema.ts` file into domain-specific schema modules improves maintainability and aligns with the router decomposition.

**Target Structure:**

```
drizzle/
  schema/
    index.ts              ← Re-exports all tables and types
    core.ts               ← users, organizations, sessions
    claims.ts             ← claims, claim_comments, claim_documents
    assessments.ts        ← ai_assessments, assessor_evaluations, appointments
    quotes.ts             ← panel_beater_quotes, quote_line_items
    fraud.ts              ← fraud_indicators, fraud_rules, fraud_alerts, entity_relationships
    vehicles.ts           ← vehicle_history, vehicle_market_valuations, pre_accident_damage
    workflow.ts           ← approval_workflow, audit_trail, notifications
    reference.ts          ← panel_beaters, registration_requests, user_invitations
  schema.ts               ← Deprecated, re-exports from schema/index.ts
```

---

## 4. EVENT-DRIVEN ARCHITECTURE ACTIVATION

### 4.1 Kafka Deployment

The Kafka deployment configuration already exists in `deployment/kafka/docker-compose.yml` with a three-broker cluster, Zookeeper, and Schema Registry. The refactoring activates this infrastructure and integrates it with the application.

**Deployment Steps:**

The Kafka cluster should be deployed to a container orchestration platform (Docker Compose for staging, Kubernetes for production). The three-broker configuration provides fault tolerance with a replication factor of 3 and minimum in-sync replicas of 2, ensuring no data loss during single-broker failures.

**Topic Configuration:**

| Topic | Partitions | Retention | Consumer Groups | Purpose |
|-------|-----------|-----------|-----------------|---------|
| `kinga.claims.created` | 6 | 7 days | fraud-detection, ai-assessment, analytics | New claim events |
| `kinga.claims.updated` | 6 | 7 days | analytics, notifications | Claim status changes |
| `kinga.assessments.completed` | 3 | 7 days | notifications, analytics | AI assessment results |
| `kinga.quotes.submitted` | 3 | 7 days | comparison-engine, notifications | New quote events |
| `kinga.fraud.detected` | 3 | 30 days | notifications, case-management | Fraud alert events |
| `kinga.documents.uploaded` | 3 | 3 days | file-scanner, ai-assessment | Document upload events |
| `kinga.notifications.send` | 6 | 1 day | notification-service | Notification delivery |
| `kinga.dlq` | 1 | 90 days | manual-review | Dead letter queue |

### 4.2 Event Schema Design

All events should follow a standardised envelope format with Avro schema registration for backward compatibility.

```typescript
interface KingaEvent<T> {
  eventId: string;          // UUID v4
  eventType: string;        // e.g., 'claim.created'
  version: string;          // Schema version, e.g., '1.0.0'
  timestamp: string;        // ISO 8601
  source: string;           // e.g., 'kinga-monolith', 'fraud-service'
  correlationId: string;    // Request trace ID
  payload: T;               // Domain-specific data
  metadata: {
    userId?: string;
    tenantId?: string;
    environment: string;
  };
}
```

### 4.3 Transitional Integration Pattern

During the migration from synchronous to event-driven processing, the application should implement a **transactional outbox pattern** to ensure reliable event publishing without distributed transactions.

The outbox pattern works as follows: when a business operation completes (e.g., claim creation), the application writes both the database change and an event record to an `outbox` table within the same database transaction. A separate polling process reads unpublished events from the outbox table and publishes them to Kafka, marking them as published upon successful delivery.

**Outbox Table Schema:**

```typescript
export const eventOutbox = mysqlTable('event_outbox', {
  id: bigint('id', { mode: 'number' }).primaryKey().autoincrement(),
  eventType: varchar('event_type', { length: 100 }).notNull(),
  aggregateId: varchar('aggregate_id', { length: 100 }).notNull(),
  payload: json('payload').notNull(),
  published: boolean('published').default(false),
  publishedAt: timestamp('published_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  retryCount: int('retry_count').default(0),
});
```

**Outbox Poller:**

```typescript
async function pollOutbox() {
  const unpublished = await getDb()
    .select()
    .from(eventOutbox)
    .where(and(
      eq(eventOutbox.published, false),
      lt(eventOutbox.retryCount, 5)
    ))
    .limit(100)
    .orderBy(asc(eventOutbox.createdAt));

  for (const event of unpublished) {
    try {
      await kafkaProducer.send({
        topic: `kinga.${event.eventType}`,
        messages: [{ key: event.aggregateId, value: JSON.stringify(event.payload) }],
      });
      await getDb().update(eventOutbox).set({
        published: true,
        publishedAt: new Date(),
      }).where(eq(eventOutbox.id, event.id));
    } catch (err) {
      await getDb().update(eventOutbox).set({
        retryCount: sql`${eventOutbox.retryCount} + 1`,
      }).where(eq(eventOutbox.id, event.id));
    }
  }
}

// Poll every 5 seconds
setInterval(pollOutbox, 5000);
```

**Rationale:** The transactional outbox pattern guarantees at-least-once event delivery without requiring distributed transactions between the database and Kafka. This is the industry-standard approach for reliable event publishing in microservices architectures [1].

---

## 5. MICROSERVICE EXTRACTION

### 5.1 Extraction Priority

The following table ranks the microservice extraction candidates by the value they deliver when operating independently.

| Service | Extraction Priority | Rationale | Dependencies | Estimated Effort |
|---------|-------------------|-----------|--------------|-----------------|
| **Fraud Detection** | 1 (Highest) | CPU-intensive analysis benefits most from independent scaling; longest-running operations block the main event loop | MySQL (read), Kafka (consume/produce) | 32-40 hrs |
| **Notification Service** | 2 | Already partially extracted (`services/notification-service/`); high-frequency, low-latency requirements | Kafka (consume), Email API, Push API | 16-24 hrs |
| **AI Assessment** | 3 | LLM API calls have variable latency (2-20s); independent scaling prevents blocking claim processing | MySQL (read/write), LLM API, S3 (read) | 24-32 hrs |
| **Analytics Aggregation** | 4 | Heavy aggregation queries benefit from dedicated resources; natural boundary with PostgreSQL separation | PostgreSQL (read/write), MySQL (read) | 24-32 hrs |
| **Document Processing** | 5 | File scanning, OCR, and thumbnail generation are CPU-intensive and benefit from independent scaling | S3 (read/write), ClamAV, OCR API | 16-24 hrs |

### 5.2 Fraud Detection Microservice Architecture

The fraud detection service is the highest-priority extraction candidate. The service consumes claim events from Kafka, executes the seven-module fraud analysis pipeline, and publishes fraud scoring results.

**Service Boundary:**

```
┌─────────────────────────────────────────────┐
│           Fraud Detection Service            │
│                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │Behavioral│  │  Cost    │  │ Entity   │  │
│  │ Analysis │  │ Anomaly  │  │ Network  │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  │
│       │              │              │        │
│  ┌────▼──────────────▼──────────────▼────┐  │
│  │         Scoring Aggregation           │  │
│  └───────────────────┬───────────────────┘  │
│                      │                       │
│  ┌───────────────────▼───────────────────┐  │
│  │          Alert Generation             │  │
│  └───────────────────────────────────────┘  │
│                                              │
│  Consumes: kinga.claims.created              │
│            kinga.claims.updated              │
│  Produces: kinga.fraud.detected              │
│            kinga.fraud.score-updated         │
└─────────────────────────────────────────────┘
```

**Containerisation:**

The fraud detection service should be packaged as a Docker container with the following structure:

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile --prod
COPY dist/ ./dist/
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
```

**API Contract:**

The service exposes a REST API for synchronous fraud scoring requests (used during the transition period) and consumes Kafka events for asynchronous processing.

```typescript
// REST API (transitional)
POST /api/v1/fraud/score
Request: { claimId: string, claimData: ClaimPayload }
Response: { riskScore: number, indicators: FraudIndicator[], alerts: FraudAlert[] }

// Kafka consumer (target)
Topic: kinga.claims.created
Handler: processNewClaim(event) → publishes to kinga.fraud.detected
```

### 5.3 Service Communication Patterns

During the transition from monolith to microservices, the platform should support both synchronous (REST/gRPC) and asynchronous (Kafka) communication patterns. The following decision matrix guides the choice of communication pattern for each interaction.

| Interaction | Pattern | Rationale |
|-------------|---------|-----------|
| Claim creation → Fraud scoring | **Async (Kafka)** | Fraud analysis is not blocking; results can arrive after claim submission |
| Claim creation → AI assessment | **Async (Kafka)** | LLM calls have variable latency; async prevents blocking the submission flow |
| Quote submission → Comparison engine | **Sync (tRPC/REST)** | Comparison results are needed immediately for the insurer dashboard |
| Fraud alert → Notification | **Async (Kafka)** | Notification delivery is fire-and-forget with retry semantics |
| Document upload → File scanning | **Async (Kafka)** | Scanning can occur after upload confirmation; results update document status |
| Dashboard load → Analytics query | **Sync (tRPC/REST)** | Dashboard data must be returned in the HTTP response |

---

## 6. FRONTEND ARCHITECTURE IMPROVEMENTS

### 6.1 Code Splitting Strategy

The current React application loads all 40 pages in a single bundle. The refactoring introduces route-based code splitting that loads page components on demand.

**Splitting Boundaries:**

| Bundle | Pages | Estimated Size | Load Trigger |
|--------|-------|---------------|-------------|
| **Core** | Home, Login, Portal Hub | ~200KB | Initial load |
| **Claimant** | ClaimantDashboard, SubmitClaim, ClaimDetails | ~300KB | Navigate to claimant portal |
| **Insurer** | InsurerDashboard, Triage, ComparisonView | ~400KB | Navigate to insurer portal |
| **Assessor** | AssessorDashboard, ClaimAssessment, EvaluationForm | ~350KB | Navigate to assessor portal |
| **Panel Beater** | PanelBeaterDashboard, QuoteSubmission | ~250KB | Navigate to panel beater portal |
| **Analytics** | All 4 analytics dashboards | ~500KB | Navigate to analytics section |
| **Admin** | AdminDashboard, SystemConfig | ~300KB | Navigate to admin portal |
| **Executive** | ExecutiveDashboard, StrategicAnalytics | ~350KB | Navigate to executive portal |

**Implementation:** Each bundle boundary is implemented using React `lazy()` and `Suspense` with a shared loading skeleton component. The Vite build configuration automatically creates separate chunks for each lazy-loaded module.

### 6.2 State Management Refactoring

The current application relies on tRPC query caching for state management. For complex cross-page state (e.g., claim workflow progress, notification state), the refactoring introduces a lightweight state management layer using React Context with reducer patterns.

**Target State Architecture:**

```typescript
// contexts/ClaimWorkflowContext.tsx
interface ClaimWorkflowState {
  currentClaim: Claim | null;
  workflowStep: 'submission' | 'assessment' | 'quoting' | 'comparison' | 'approval';
  pendingActions: Action[];
  validationErrors: ValidationError[];
}

// contexts/NotificationContext.tsx  
interface NotificationState {
  unreadCount: number;
  recentNotifications: Notification[];
  wsConnectionStatus: 'connected' | 'disconnected' | 'reconnecting';
}
```

### 6.3 Component Library Extraction

Reusable UI components that appear across multiple portals should be extracted into a shared component library within the project. This reduces duplication and ensures visual consistency.

**Components to Extract:**

| Component | Current Locations | Shared Version |
|-----------|------------------|----------------|
| Status Badge | 6 dashboard pages | `components/shared/StatusBadge.tsx` |
| Claim Summary Card | Claimant, Insurer, Assessor dashboards | `components/shared/ClaimSummaryCard.tsx` |
| Document Gallery | ClaimDetails, Assessment, Comparison | `components/shared/DocumentGallery.tsx` |
| Fraud Risk Indicator | Comparison, Triage, Analytics | `components/shared/FraudRiskIndicator.tsx` |
| Loading Skeleton | All pages | `components/shared/PageSkeleton.tsx` |
| Data Table | Analytics, Admin, Executive | `components/shared/DataTable.tsx` |
| Cost Breakdown Chart | Comparison, Analytics, Executive | `components/shared/CostBreakdownChart.tsx` |

---

## 7. SECURITY ARCHITECTURE REFACTORING

### 7.1 Attribute-Based Access Control (ABAC)

The current role-based access control (RBAC) system provides coarse-grained authorization where all users within a role have identical permissions. The refactoring introduces ABAC to enable fine-grained permission management.

**ABAC Policy Engine:**

```typescript
interface AccessPolicy {
  subject: {
    role: string;
    department?: string;
    seniority?: string;
  };
  action: string;          // e.g., 'claims.approve', 'quotes.modify'
  resource: string;        // e.g., 'claim', 'quote', 'assessment'
  conditions?: {
    maxClaimValue?: number;
    ownRegionOnly?: boolean;
    requireSupervisorApproval?: boolean;
  };
}

function evaluatePolicy(
  user: User,
  action: string,
  resource: Resource,
  policies: AccessPolicy[]
): boolean {
  return policies.some(policy => {
    if (policy.subject.role !== user.role) return false;
    if (policy.action !== action) return false;
    if (policy.resource !== resource.type) return false;
    
    // Evaluate conditions
    if (policy.conditions?.maxClaimValue && resource.value > policy.conditions.maxClaimValue) {
      return false;
    }
    if (policy.conditions?.ownRegionOnly && resource.region !== user.region) {
      return false;
    }
    
    return true;
  });
}
```

**Migration Path:** The ABAC system is introduced alongside the existing RBAC system. During the transition period, both systems run in parallel, with ABAC logging policy decisions without enforcing them. Once the ABAC policies are validated against production traffic patterns, enforcement is enabled and RBAC is deprecated.

### 7.2 API Gateway Introduction

As the platform transitions to microservices, an API gateway provides centralised authentication, rate limiting, request routing, and observability. The refactoring introduces Kong or a lightweight custom gateway.

**Gateway Responsibilities:**

| Responsibility | Current Implementation | Target Implementation |
|---------------|----------------------|----------------------|
| Authentication | Express middleware in each service | Gateway validates JWT, injects user context |
| Rate Limiting | None (Patch Plan adds Express middleware) | Gateway enforces per-user and per-IP limits |
| Request Routing | Single Express server | Gateway routes to appropriate microservice |
| TLS Termination | Platform-managed | Gateway handles TLS certificates |
| Request Logging | Console.log in application | Gateway captures structured access logs |
| Circuit Breaking | None | Gateway implements circuit breaker for downstream services |

---

## 8. OPERATIONAL READINESS REFACTORING

### 8.1 CI/CD Pipeline

The platform currently lacks automated build, test, and deployment pipelines. The refactoring introduces a GitHub Actions workflow that automates the entire delivery pipeline.

**Pipeline Stages:**

| Stage | Trigger | Actions | Gate |
|-------|---------|---------|------|
| **Lint** | Push to any branch | ESLint, Prettier, TypeScript strict | All checks pass |
| **Unit Test** | Push to any branch | Vitest with coverage report | Coverage > 70% |
| **Build** | Push to main | Vite production build, Docker image build | Build succeeds |
| **Integration Test** | Push to main | Testcontainers with MySQL, Kafka | All tests pass |
| **Staging Deploy** | Merge to main | Deploy to staging environment | Health check passes |
| **E2E Test** | After staging deploy | Playwright test suite | All critical paths pass |
| **Production Deploy** | Manual approval | Blue-green deployment | Smoke test passes |

### 8.2 Database Migration Strategy

The current approach uses `pnpm db:push` which applies schema changes directly. For production, the refactoring introduces versioned migrations with rollback support.

**Migration Workflow:**

```bash
# Generate migration from schema changes
pnpm drizzle-kit generate

# Review generated SQL
cat drizzle/migrations/0001_add_deleted_at.sql

# Apply migration to staging
DATABASE_URL=$STAGING_DB pnpm drizzle-kit migrate

# Validate staging
pnpm test:integration --env=staging

# Apply migration to production
DATABASE_URL=$PRODUCTION_DB pnpm drizzle-kit migrate
```

**Rollback Procedure:** Each migration should include a corresponding rollback script. For additive changes (new columns, new tables), rollback involves dropping the added elements. For destructive changes (column removal, type changes), rollback requires restoring from backup.

### 8.3 Disaster Recovery

The platform currently has no disaster recovery procedures. The refactoring introduces automated backup and recovery mechanisms.

| Component | Backup Frequency | Retention | Recovery Time Objective (RTO) | Recovery Point Objective (RPO) |
|-----------|-----------------|-----------|-------------------------------|-------------------------------|
| MySQL Database | Hourly snapshots | 30 days | 1 hour | 1 hour |
| S3 Storage | Cross-region replication | Indefinite | 15 minutes | Near-zero |
| Kafka Topics | Log compaction + snapshots | Per topic retention | 30 minutes | Per retention config |
| Application Config | Git versioned | Indefinite | 5 minutes | Near-zero |

---

## 9. IMPLEMENTATION ROADMAP

The refactoring work is organised into four phases, each building on the previous phase's foundations.

| Phase | Duration | Focus | Key Deliverables | Risk Level |
|-------|----------|-------|-----------------|------------|
| **Phase 1: Foundation** | Weeks 1-3 | Router decomposition, schema splitting, CI/CD pipeline | Modular codebase, automated testing | Low |
| **Phase 2: Data Layer** | Weeks 4-7 | Read replicas, analytics database, outbox pattern | Separated read/write paths, event foundation | Medium |
| **Phase 3: Services** | Weeks 8-13 | Kafka activation, fraud service extraction, notification service | Event-driven processing, independent scaling | Medium-High |
| **Phase 4: Maturity** | Weeks 14-18 | API gateway, ABAC, remaining service extractions, disaster recovery | Production-grade architecture | Medium |

**Total Estimated Effort:** 280-380 hours (approximately 7-10 developer-months)

### Phase Dependencies

Phase 2 depends on Phase 1 completion (router decomposition enables clean service boundaries). Phase 3 depends on Phase 2 (event outbox requires database changes). Phase 4 can partially overlap with Phase 3 (API gateway can be introduced while services are being extracted).

---

## 10. RISK ASSESSMENT

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Data inconsistency during dual-write | Medium | High | Implement reconciliation jobs, monitor write failures |
| Service extraction breaks existing workflows | Medium | High | Feature flags, canary deployments, comprehensive E2E tests |
| Kafka deployment complexity | Low | Medium | Use managed Kafka service (Confluent Cloud) for initial deployment |
| Team unfamiliarity with event-driven patterns | Medium | Medium | Conduct training sessions, pair programming, detailed documentation |
| Performance regression during migration | Low | Medium | Baseline performance metrics before migration, continuous monitoring |
| Schema migration data loss | Low | High | Automated backups before every migration, tested rollback procedures |

---

## References

[1]: M. Kleppmann, *Designing Data-Intensive Applications*, O'Reilly Media, 2017. Chapter 11: Stream Processing - Transactional Outbox Pattern.

---

**Prepared By:** Tavonga Shoko
**Date:** February 11, 2026
**Version:** 1.0
