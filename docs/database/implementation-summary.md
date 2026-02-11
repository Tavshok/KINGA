# KINGA PostgreSQL Database Implementation Summary

**Author:** Tavonga Shoko  
**Version:** 1.0.0  
**Date:** February 11, 2026

---

## Overview

This document summarizes the complete PostgreSQL database architecture implementation for KINGA's microservices migration. The implementation includes **11 separate PostgreSQL databases**, comprehensive Drizzle ORM schemas, migration scripts, indexing strategies, and performance optimization.

---

## Database Architecture

### Database-per-Service Pattern

Each microservice owns its dedicated PostgreSQL database:

| Database | Service | Tables | Purpose |
|----------|---------|--------|---------|
| `identity_db` | identity-access-service | 11 | User accounts, organizations, API keys, permissions, roles |
| `claim_intake_db` | claim-intake-service | 6 | Claims, documents, comments, appointments, police reports |
| `ai_damage_db` | ai-damage-service | 5 | AI assessments, damaged components, physics analysis |
| `fraud_detect_db` | fraud-detection-service | 8 | Fraud alerts, rules, entity relationships, claimant/vehicle history |
| `cost_optim_db` | cost-optimization-service | 6 | Quotes, panel beaters, parts pricing, labor rates |
| `workflow_db` | workflow-engine-service | 5 | Approval workflows, state transitions, SLA tracking |
| `fleet_risk_db` | fleet-risk-service | 4 | Fleet profiles, driver profiles, telematics data |
| `insurer_integ_db` | insurer-integration-service | 4 | External integrations, API adapters, webhooks |
| `notification_db` | notification-service | 4 | Notifications, templates, preferences, delivery logs |
| `ml_features_db` | (Shared) | 3 | TimescaleDB hypertables for ML features and model metrics |
| `event_store_db` | (Shared) | 2 | Event sourcing with append-only event log |

**Total:** 11 databases, 58 tables

---

## Key PostgreSQL Features Implemented

### 1. JSONB Columns

Used extensively for flexible schema evolution and complex data structures:

```typescript
// Example: Claims damage photos
damagePhotos: jsonb("damage_photos"), // Array of S3 URLs with metadata

// Example: Fraud collusion evidence
collusionEvidence: jsonb("collusion_evidence"), // Complex fraud evidence graph
```

**Benefits:**
- Schema flexibility without migrations
- Efficient indexing with GIN indexes
- Native JSON query support

### 2. Enums

Type-safe enums for categorical data:

```typescript
export const claimStatusEnum = pgEnum("claim_status", [
  "submitted",
  "triage",
  "assessment_pending",
  // ... 10 total statuses
]);
```

**Benefits:**
- Database-level constraint enforcement
- Type safety in TypeScript
- Efficient storage (integer internally)

### 3. Timestamp with Timezone

All timestamps use `timestamp with timezone` for global consistency:

```typescript
createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
```

**Benefits:**
- Automatic timezone conversion
- Accurate temporal queries
- Global deployment support

### 4. Full-Text Search

Implemented for claims and documents:

```sql
-- Full-text search on claim descriptions
CREATE INDEX idx_claims_description_fts ON claims
  USING GIN(to_tsvector('english', incident_description));

-- Query example
SELECT * FROM claims
WHERE to_tsvector('english', incident_description) @@ to_tsquery('collision & damage');
```

### 5. Table Partitioning

Monthly partitioning for high-volume tables:

```sql
-- Claims partitioned by created_at
CREATE TABLE claims (
  -- columns
) PARTITION BY RANGE (created_at);

CREATE TABLE claims_2026_01 PARTITION OF claims
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
```

**Benefits:**
- Improved query performance
- Efficient data archival
- Faster maintenance operations

### 6. GIN Indexes

Generalized Inverted Indexes for JSONB and arrays:

```sql
-- JSONB index for fraud evidence
CREATE INDEX idx_entity_rel_evidence ON entity_relationships
  USING GIN(collusion_evidence);

-- Array index for selected panel beaters
CREATE INDEX idx_claims_selected_beaters ON claims
  USING GIN(selected_panel_beater_ids);
```

---

## Domain Ownership Model

### Identity & Access Management (`identity_db`)

**Schema:** `/drizzle/postgresql/identity/schema.ts`

**Tables:**
- `users` - User accounts with role-based access
- `organizations` - Multi-tenant organizations
- `user_invitations` - Team member invites
- `email_verification_tokens` - Email verification
- `api_keys` - Service-to-service authentication
- `sessions` - Active user sessions
- `permissions` - Fine-grained permissions
- `roles` - Custom role definitions
- `user_roles` - User-role assignments
- `registration_requests` - Assessor registration

**Key Features:**
- Fine-grained RBAC with custom roles
- API key management for service-to-service auth
- Session tracking with device fingerprinting
- Multi-tenant organization support

### Claim Intake (`claim_intake_db`)

**Schema:** `/drizzle/postgresql/claim-intake/schema.ts`

**Tables:**
- `claims` - Insurance claims (partitioned monthly)
- `claim_documents` - Document attachments with OCR
- `claim_comments` - Workflow collaboration with threading
- `appointments` - Assessment appointments
- `police_reports` - Police report integration
- `third_party_vehicles` - Third-party vehicle data

**Key Features:**
- Monthly partitioning for scalability
- Full-text search on incident descriptions
- JSONB for damage photos and metadata
- Geographic coordinates for incident locations

### AI Damage Assessment (`ai_damage_db`)

**Schema:** `/drizzle/postgresql/ai-damage/schema.ts`

**Tables:**
- `ai_assessments` - AI damage assessments
- `damaged_components` - Component-level damage details
- `physics_analysis` - Physics-based accident analysis
- `total_loss_analysis` - Total loss determination
- `assessment_graphs` - Generated visualizations

**Key Features:**
- Component-level damage tracking
- Physics validation results
- Total loss probability scoring
- Model versioning and performance tracking

### Fraud Detection (`fraud_detect_db`)

**Schema:** `/drizzle/postgresql/fraud-detection/schema.ts`

**Tables:**
- `fraud_alerts` - Real-time fraud alerts (partitioned)
- `fraud_indicators` - Detected fraud patterns
- `fraud_rules` - Configurable detection rules
- `claimant_history` - Claimant fraud profiles
- `vehicle_history` - Vehicle fraud patterns
- `entity_relationships` - Graph-based collusion detection
- `pre_accident_damage` - Pre-existing damage tracking
- `fraud_investigations` - Investigation tracking

**Key Features:**
- Graph-based entity relationship tracking
- Configurable fraud rules engine
- Historical pattern analysis
- Real-time alert system with severity levels

### Cost Optimization (`cost_optim_db`)

**Schema:** `/drizzle/postgresql/cost-optimization/schema.ts`

**Tables:**
- `panel_beater_quotes` - Repair quotes
- `quote_line_items` - Itemized quote breakdowns
- `panel_beaters` - Approved repair shops
- `parts_pricing` - Market parts pricing database
- `labor_rates` - Geographic labor rate benchmarks
- `negotiation_history` - Quote negotiation tracking

**Key Features:**
- Market rate benchmarking
- Quote comparison analytics
- Geographic labor rate tracking
- Negotiation history for AI optimization

---

## ML Feature Storage (TimescaleDB)

### Database: `ml_features_db`

**Extension:** TimescaleDB for time-series data

**Hypertables:**

#### 1. Claim Features Time-Series

```sql
CREATE TABLE claim_features (
  time TIMESTAMPTZ NOT NULL,
  claim_id INTEGER NOT NULL,
  
  -- Temporal features
  hour_of_day INTEGER,
  day_of_week INTEGER,
  days_since_policy_start INTEGER,
  
  -- Claimant features
  claimant_claim_count INTEGER,
  claimant_avg_claim_amount DECIMAL(10,2),
  claimant_fraud_score INTEGER,
  
  -- Vehicle features
  vehicle_age INTEGER,
  vehicle_claim_count INTEGER,
  
  -- Network features
  entity_relationship_strength INTEGER,
  
  -- Model predictions
  fraud_prediction_score DECIMAL(5,4),
  fraud_prediction_label BOOLEAN,
  
  PRIMARY KEY (time, claim_id)
);

SELECT create_hypertable('claim_features', 'time');
```

#### 2. Fraud Model Performance Metrics

```sql
CREATE TABLE fraud_model_metrics (
  time TIMESTAMPTZ NOT NULL,
  model_version VARCHAR(50) NOT NULL,
  
  -- Performance metrics
  accuracy DECIMAL(5,4),
  precision_score DECIMAL(5,4),
  recall DECIMAL(5,4),
  f1_score DECIMAL(5,4),
  auc_roc DECIMAL(5,4),
  
  -- Confusion matrix
  true_positives INTEGER,
  false_positives INTEGER,
  
  PRIMARY KEY (time, model_version)
);

SELECT create_hypertable('fraud_model_metrics', 'time');
```

#### 3. Continuous Aggregates

```sql
-- Hourly claim feature aggregates
CREATE MATERIALIZED VIEW claim_features_hourly
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 hour', time) AS bucket,
  COUNT(*) AS claim_count,
  AVG(fraud_prediction_score) AS avg_fraud_score,
  AVG(estimated_repair_cost) AS avg_repair_cost
FROM claim_features
GROUP BY bucket;
```

**Benefits:**
- Automatic data compression
- Fast time-series queries
- Continuous aggregates for real-time analytics
- Efficient data retention policies

---

## Event Sourcing (`event_store_db`)

### Append-Only Event Log

```sql
CREATE TABLE events (
  id BIGSERIAL PRIMARY KEY,
  event_id UUID UNIQUE NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  event_version VARCHAR(20) NOT NULL,
  
  -- Event source
  aggregate_type VARCHAR(100) NOT NULL,
  aggregate_id VARCHAR(255) NOT NULL,
  
  -- Event data
  payload JSONB NOT NULL,
  metadata JSONB,
  
  -- Causation tracking
  correlation_id UUID,
  causation_id UUID,
  
  -- Timestamp
  occurred_at TIMESTAMPTZ NOT NULL,
  recorded_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- Partitioning by occurred_at (monthly)
) PARTITION BY RANGE (occurred_at);

-- Indexes
CREATE INDEX idx_events_aggregate ON events(aggregate_type, aggregate_id, occurred_at DESC);
CREATE INDEX idx_events_type ON events(event_type, occurred_at DESC);
CREATE INDEX idx_events_correlation ON events(correlation_id);
CREATE INDEX idx_events_payload ON events USING GIN(payload);
```

### Event Snapshots

```sql
CREATE TABLE event_snapshots (
  id SERIAL PRIMARY KEY,
  aggregate_type VARCHAR(100) NOT NULL,
  aggregate_id VARCHAR(255) NOT NULL,
  
  -- Snapshot data
  snapshot_version INTEGER NOT NULL,
  snapshot_data JSONB NOT NULL,
  
  -- Event position
  last_event_id BIGINT NOT NULL,
  last_event_version VARCHAR(20) NOT NULL,
  
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  UNIQUE(aggregate_type, aggregate_id, snapshot_version)
);
```

---

## Indexing Strategy

### Primary Indexes

All tables include:
- **Primary key index** (auto-created)
- **Foreign key indexes** for all references
- **Unique indexes** for natural keys (claim_number, email, etc.)

### Query-Specific Indexes

#### Composite Indexes

```sql
-- Claims by status and date (most common query)
CREATE INDEX idx_claims_status_created ON claims(status, created_at DESC);

-- Fraud alerts by severity and date
CREATE INDEX idx_fraud_alerts_severity_created ON fraud_alerts(alert_severity, created_at DESC);
```

#### Partial Indexes

```sql
-- Active claims only
CREATE INDEX idx_claims_active ON claims(status, created_at)
  WHERE status NOT IN ('completed', 'rejected');

-- Unread notifications
CREATE INDEX idx_notifications_unread ON notifications(user_id, created_at DESC)
  WHERE is_read = FALSE;

-- High-risk fraud alerts
CREATE INDEX idx_fraud_alerts_high_risk ON fraud_alerts(claim_id, created_at DESC)
  WHERE alert_severity IN ('high', 'critical');
```

#### GIN Indexes

```sql
-- JSONB search indexes
CREATE INDEX idx_claims_damage_photos ON claims USING GIN(damage_photos);
CREATE INDEX idx_claims_fraud_flags ON claims USING GIN(fraud_flags);
CREATE INDEX idx_entity_rel_evidence ON entity_relationships USING GIN(collusion_evidence);

-- Full-text search indexes
CREATE INDEX idx_claims_description_fts ON claims
  USING GIN(to_tsvector('english', incident_description));
```

### Index Maintenance

```sql
-- Automated index maintenance (pg_cron)
SELECT cron.schedule('reindex-claims', '0 2 * * 0', 'REINDEX TABLE CONCURRENTLY claims');
SELECT cron.schedule('analyze-tables', '0 3 * * *', 'ANALYZE');
```

---

## Migration Strategy

### Phase 1: Schema Creation (Week 1)

```bash
# Create all PostgreSQL databases
createdb -U postgres identity_db
createdb -U postgres claim_intake_db
createdb -U postgres ai_damage_db
# ... create all 11 databases

# Apply Drizzle schemas
cd /home/ubuntu/kinga-replit
pnpm drizzle-kit generate:pg
pnpm drizzle-kit push:pg
```

### Phase 2: Dual-Write (Weeks 2-4)

```typescript
// Dual-write wrapper for gradual migration
async function createClaim(claimData: InsertClaim) {
  // Write to MySQL (existing)
  const mysqlClaim = await mysqlDb.insert(claims).values(claimData);
  
  // Write to PostgreSQL (new)
  try {
    await pgDb.insert(pgClaims).values(claimData);
  } catch (error) {
    logger.error('PostgreSQL write failed', { error });
    // MySQL remains source of truth
  }
  
  return mysqlClaim;
}
```

### Phase 3: Data Migration (Weeks 5-8)

```sql
-- Bulk migration script
-- 1. Export from MySQL
mysqldump -u root -p kinga_db > kinga_mysql_dump.sql

-- 2. Transform and load to PostgreSQL
-- Use custom migration scripts in /drizzle/migrations/

-- 3. Verify data integrity
SELECT
  (SELECT COUNT(*) FROM mysql_claims) AS mysql_count,
  (SELECT COUNT(*) FROM pg_claims) AS pg_count,
  (SELECT COUNT(*) FROM mysql_claims) - (SELECT COUNT(*) FROM pg_claims) AS difference;
```

### Phase 4: Read Migration (Weeks 9-12)

```typescript
// Gradual read migration with fallback
async function getClaim(claimId: number) {
  try {
    return await pgDb.select().from(pgClaims).where(eq(pgClaims.id, claimId));
  } catch (error) {
    logger.warn('PostgreSQL read failed, falling back to MySQL');
    return await mysqlDb.select().from(claims).where(eq(claims.id, claimId));
  }
}
```

### Phase 5: Cutover (Week 13)

- PostgreSQL becomes primary
- MySQL kept as backup for 30 days
- Monitoring for performance regression

---

## Performance Optimization

### Connection Pooling

```typescript
import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  database: 'claim_intake_db',
  max: 20, // Maximum pool size
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

### Query Optimization

**Prepared Statements:**

```typescript
const result = await pool.query(
  'SELECT * FROM claims WHERE claim_number = $1',
  [claimNumber]
);
```

**Materialized Views:**

```sql
-- Dashboard metrics (refreshed hourly)
CREATE MATERIALIZED VIEW dashboard_metrics AS
SELECT
  DATE_TRUNC('day', created_at) AS date,
  status,
  COUNT(*) AS claim_count,
  AVG(approved_amount) AS avg_amount
FROM claims
GROUP BY date, status;

CREATE UNIQUE INDEX idx_dashboard_metrics_pk ON dashboard_metrics(date, status);
REFRESH MATERIALIZED VIEW CONCURRENTLY dashboard_metrics;
```

### Partitioning

**Automated Partition Management:**

```sql
CREATE OR REPLACE FUNCTION create_monthly_partition()
RETURNS void AS $$
DECLARE
  partition_date DATE;
  partition_name TEXT;
BEGIN
  partition_date := DATE_TRUNC('month', NOW() + INTERVAL '1 month');
  partition_name := 'claims_' || TO_CHAR(partition_date, 'YYYY_MM');
  
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I PARTITION OF claims FOR VALUES FROM (%L) TO (%L)',
    partition_name,
    partition_date,
    partition_date + INTERVAL '1 month'
  );
END;
$$ LANGUAGE plpgsql;

-- Schedule monthly
SELECT cron.schedule('create-monthly-partition', '0 0 1 * *', 'SELECT create_monthly_partition()');
```

---

## Backup and Recovery

### Automated Backups

```bash
#!/bin/bash
# Daily backup script

BACKUP_DIR="/var/backups/postgresql"
DATE=$(date +%Y%m%d_%H%M%S)

# Backup all databases
for DB in identity_db claim_intake_db ai_damage_db fraud_detect_db cost_optim_db workflow_db fleet_risk_db insurer_integ_db notification_db ml_features_db event_store_db
do
  pg_dump -U postgres -Fc $DB > $BACKUP_DIR/${DB}_${DATE}.dump
done

# Upload to S3
tar -czf $BACKUP_DIR/kinga_backup_${DATE}.tar.gz $BACKUP_DIR/*.dump
aws s3 cp $BACKUP_DIR/kinga_backup_${DATE}.tar.gz s3://kinga-backups/postgresql/

# Cleanup (keep 30 days)
find $BACKUP_DIR -name "*.dump" -mtime +30 -delete
```

### Point-in-Time Recovery

```sql
-- Enable WAL archiving in postgresql.conf
wal_level = replica
archive_mode = on
archive_command = 'aws s3 cp %p s3://kinga-backups/wal/%f'

-- Recovery
restore_command = 'aws s3 cp s3://kinga-backups/wal/%f %p'
recovery_target_time = '2026-02-11 12:00:00'
```

---

## Monitoring and Maintenance

### Key Metrics

```sql
-- Database size
SELECT
  pg_database.datname,
  pg_size_pretty(pg_database_size(pg_database.datname)) AS size
FROM pg_database
ORDER BY pg_database_size(pg_database.datname) DESC;

-- Table sizes
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Index usage
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;
```

### Automated Maintenance

```sql
-- Vacuum and analyze (pg_cron)
SELECT cron.schedule('vacuum-analyze', '0 2 * * *', 'VACUUM ANALYZE');

-- Reindex (weekly)
SELECT cron.schedule('reindex-claims', '0 3 * * 0', 'REINDEX TABLE CONCURRENTLY claims');
```

---

## Summary

### Implementation Deliverables

✅ **11 PostgreSQL databases** with domain-driven design  
✅ **58 tables** with comprehensive Drizzle ORM schemas  
✅ **PostgreSQL-specific features**: JSONB, enums, full-text search, partitioning, GIN indexes  
✅ **TimescaleDB** for ML feature storage with hypertables and continuous aggregates  
✅ **Event sourcing** database with append-only event log  
✅ **Indexing strategy** with composite, partial, and GIN indexes  
✅ **Migration strategy** with dual-write pattern and gradual cutover  
✅ **Performance optimization** with connection pooling, prepared statements, materialized views  
✅ **Backup and recovery** with automated daily backups and point-in-time recovery  
✅ **Monitoring and maintenance** with automated vacuum, analyze, and reindex  

### Next Steps

1. **Deploy PostgreSQL cluster** on Kubernetes with high availability
2. **Implement dual-write** in monolith for gradual migration
3. **Run data migration** scripts to populate PostgreSQL from MySQL
4. **Test performance** with production-like data volumes
5. **Cutover to PostgreSQL** as primary database

---

**Document Version:** 1.0.0  
**Last Updated:** February 11, 2026  
**Author:** Tavonga Shoko
