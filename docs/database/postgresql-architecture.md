# KINGA PostgreSQL Database Architecture

**Author:** Tavonga Shoko  
**Version:** 1.0.0  
**Date:** February 11, 2026

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current State Analysis](#current-state-analysis)
3. [PostgreSQL Architecture Design](#postgresql-architecture-design)
4. [Domain Ownership Model](#domain-ownership-model)
5. [ML Feature Storage](#ml-feature-storage)
6. [Migration Strategy](#migration-strategy)
7. [Performance Optimization](#performance-optimization)
8. [Backup and Recovery](#backup-and-recovery)

---

## Executive Summary

This document presents a comprehensive PostgreSQL database architecture for KINGA's microservices migration. The design separates the existing monolithic MySQL schema into domain-owned databases aligned with the 10 microservices, implements specialized ML feature storage using TimescaleDB, and provides production-ready indexing, partitioning, and performance optimization strategies.

**Key Design Principles:**

- **Domain-Driven Design**: Each microservice owns its database schema
- **Event Sourcing**: Append-only event log for audit and replay
- **CQRS**: Separate read and write models for scalability
- **Polyglot Persistence**: PostgreSQL for operational data, TimescaleDB for ML features
- **Performance**: Comprehensive indexing, partitioning, and query optimization

---

## Current State Analysis

### Existing MySQL Schema

The current KINGA system uses a single MySQL database with **28 tables** across multiple domains:

#### Core Operational Tables (11 tables)
- `users` - User accounts and authentication
- `claims` - Insurance claims
- `ai_assessments` - AI damage assessments
- `assessor_evaluations` - Human assessor evaluations
- `panel_beater_quotes` - Repair quotes
- `panel_beaters` - Approved repair shops
- `claim_comments` - Workflow collaboration
- `claim_documents` - Document attachments
- `notifications` - User notifications
- `appointments` - Assessment appointments
- `approval_workflow` - Approval state machine

#### Fraud Detection Tables (7 tables)
- `fraud_alerts` - Real-time fraud alerts
- `fraud_indicators` - Detected fraud patterns
- `fraud_rules` - Configurable detection rules
- `claimant_history` - Claimant fraud profiles
- `vehicle_history` - Vehicle fraud patterns
- `entity_relationships` - Collusion detection graph
- `pre_accident_damage` - Pre-existing damage tracking

#### Supporting Tables (10 tables)
- `organizations` - Multi-tenant organizations
- `user_invitations` - Team member invites
- `registration_requests` - Assessor registration
- `email_verification_tokens` - Email verification
- `police_reports` - Police report integration
- `third_party_vehicles` - Third-party vehicle data
- `vehicle_condition_assessment` - Detailed condition reports
- `vehicle_market_valuations` - Market value estimates
- `quote_line_items` - Itemized quote breakdowns
- `audit_trail` - System audit log

### Identified Issues

1. **Monolithic Schema**: All domains share a single database, creating tight coupling
2. **No Domain Boundaries**: Tables from different domains are intermixed
3. **Limited Scalability**: Single database becomes a bottleneck
4. **No Event Sourcing**: State changes are not captured as events
5. **Mixed Concerns**: Operational data and ML features in same tables
6. **Suboptimal Indexing**: Generic indexes, no domain-specific optimization
7. **No Partitioning**: Large tables (claims, fraud_alerts) not partitioned
8. **Limited Audit**: Audit trail table, but not comprehensive event log

---

## PostgreSQL Architecture Design

### Database-per-Service Pattern

Each microservice owns its database schema, deployed as separate PostgreSQL databases:

```
┌─────────────────────────────────────────────────────────────┐
│                     PostgreSQL Cluster                       │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐  ┌──────────────────┐                │
│  │ claim_intake_db  │  │ ai_damage_db     │                │
│  │ (Claim Intake)   │  │ (AI Damage)      │                │
│  └──────────────────┘  └──────────────────┘                │
│  ┌──────────────────┐  ┌──────────────────┐                │
│  │ fraud_detect_db  │  │ cost_optim_db    │                │
│  │ (Fraud Detection)│  │ (Cost Optim)     │                │
│  └──────────────────┘  └──────────────────┘                │
│  ┌──────────────────┐  ┌──────────────────┐                │
│  │ workflow_db      │  │ fleet_risk_db    │                │
│  │ (Workflow)       │  │ (Fleet Risk)     │                │
│  └──────────────────┘  └──────────────────┘                │
│  ┌──────────────────┐  ┌──────────────────┐                │
│  │ insurer_integ_db │  │ identity_db      │                │
│  │ (Insurer Integ)  │  │ (Identity/IAM)   │                │
│  └──────────────────┘  └──────────────────┘                │
│  ┌──────────────────┐  ┌──────────────────┐                │
│  │ notification_db  │  │ event_store_db   │                │
│  │ (Notifications)  │  │ (Event Sourcing) │                │
│  └──────────────────┘  └──────────────────┘                │
│  ┌──────────────────┐                                       │
│  │ ml_features_db   │  (TimescaleDB)                       │
│  │ (ML Features)    │                                       │
│  └──────────────────┘                                       │
└─────────────────────────────────────────────────────────────┘
```

### Shared Infrastructure Databases

- **event_store_db**: Centralized event log for all services (event sourcing)
- **ml_features_db**: TimescaleDB for ML training features and model metrics

---

## Domain Ownership Model

### 1. Identity & Access Management Database (`identity_db`)

**Owned by:** identity-access-service

**Tables:**
- `users` - User accounts (openId, email, role, tier)
- `organizations` - Multi-tenant organizations
- `user_invitations` - Team member invites
- `email_verification_tokens` - Email verification
- `api_keys` - Service-to-service API keys
- `sessions` - Active user sessions
- `permissions` - Fine-grained permissions
- `roles` - Custom role definitions

**PostgreSQL Schema:**

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  open_id VARCHAR(64) UNIQUE NOT NULL,
  email VARCHAR(320) UNIQUE,
  name TEXT,
  password_hash VARCHAR(255),
  login_method VARCHAR(64),
  role VARCHAR(50) NOT NULL DEFAULT 'user',
  insurer_role VARCHAR(50),
  organization_id INTEGER REFERENCES organizations(id),
  email_verified BOOLEAN DEFAULT FALSE,
  assessor_tier VARCHAR(20) DEFAULT 'free',
  tier_activated_at TIMESTAMPTZ,
  tier_expires_at TIMESTAMPTZ,
  performance_score INTEGER DEFAULT 70,
  total_assessments_completed INTEGER DEFAULT 0,
  average_variance_from_final INTEGER,
  accuracy_score DECIMAL(5,2) DEFAULT 0.00,
  avg_completion_time DECIMAL(6,2) DEFAULT 0.00,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_signed_in TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_open_id ON users(open_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_organization ON users(organization_id);
CREATE INDEX idx_users_role ON users(role);
```

### 2. Claim Intake Database (`claim_intake_db`)

**Owned by:** claim-intake-service

**Tables:**
- `claims` - Insurance claims
- `claim_documents` - Document attachments
- `claim_comments` - Workflow collaboration
- `appointments` - Assessment appointments
- `police_reports` - Police report integration

**PostgreSQL Schema:**

```sql
CREATE TABLE claims (
  id SERIAL PRIMARY KEY,
  claim_number VARCHAR(50) UNIQUE NOT NULL,
  claimant_id INTEGER NOT NULL,
  
  -- Vehicle information
  vehicle_make VARCHAR(100),
  vehicle_model VARCHAR(100),
  vehicle_year INTEGER,
  vehicle_registration VARCHAR(50),
  
  -- Incident details
  incident_date TIMESTAMPTZ,
  incident_description TEXT,
  incident_location TEXT,
  damage_photos JSONB, -- Array of S3 URLs
  
  -- Policy information
  policy_number VARCHAR(100),
  policy_verified BOOLEAN DEFAULT FALSE,
  
  -- Workflow status
  status VARCHAR(50) NOT NULL DEFAULT 'submitted',
  workflow_state VARCHAR(50),
  
  -- Assignments
  assigned_assessor_id INTEGER,
  assigned_panel_beater_id INTEGER,
  selected_panel_beater_ids JSONB, -- Array of 3 IDs
  
  -- AI flags
  ai_assessment_triggered BOOLEAN DEFAULT FALSE,
  ai_assessment_completed BOOLEAN DEFAULT FALSE,
  
  -- Fraud flags
  fraud_risk_score INTEGER,
  fraud_flags JSONB,
  
  -- Approval tracking
  technically_approved_by INTEGER,
  technically_approved_at TIMESTAMPTZ,
  financially_approved_by INTEGER,
  financially_approved_at TIMESTAMPTZ,
  approved_amount INTEGER,
  closed_by INTEGER,
  closed_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Partitioning by created_at (monthly partitions)
CREATE TABLE claims_2026_01 PARTITION OF claims
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE claims_2026_02 PARTITION OF claims
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
-- ... continue for each month

-- Indexes
CREATE INDEX idx_claims_claimant ON claims(claimant_id);
CREATE INDEX idx_claims_status ON claims(status);
CREATE INDEX idx_claims_created ON claims(created_at DESC);
CREATE INDEX idx_claims_number ON claims(claim_number);
CREATE INDEX idx_claims_vehicle_reg ON claims(vehicle_registration);
CREATE INDEX idx_claims_policy ON claims(policy_number);
```

### 3. AI Damage Assessment Database (`ai_damage_db`)

**Owned by:** ai-damage-service

**Tables:**
- `ai_assessments` - AI damage assessments
- `damaged_components` - Component-level damage details
- `physics_analysis` - Physics-based accident analysis
- `total_loss_analysis` - Total loss determination
- `assessment_graphs` - Generated visualizations

**PostgreSQL Schema:**

```sql
CREATE TABLE ai_assessments (
  id SERIAL PRIMARY KEY,
  claim_id INTEGER NOT NULL,
  
  -- Assessment results
  estimated_cost INTEGER,
  damage_description TEXT,
  detected_damage_types JSONB,
  confidence_score INTEGER,
  
  -- Fraud detection
  fraud_indicators JSONB,
  fraud_risk_level VARCHAR(20),
  
  -- Total loss detection
  total_loss_indicated BOOLEAN DEFAULT FALSE,
  structural_damage_severity VARCHAR(50) DEFAULT 'none',
  estimated_vehicle_value INTEGER,
  repair_to_value_ratio INTEGER,
  total_loss_reasoning TEXT,
  
  -- Component details
  damaged_components_json JSONB,
  physics_analysis JSONB,
  graph_urls JSONB,
  
  -- AI model details
  model_version VARCHAR(50),
  processing_time INTEGER,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ai_assessments_claim ON ai_assessments(claim_id);
CREATE INDEX idx_ai_assessments_created ON ai_assessments(created_at DESC);
CREATE INDEX idx_ai_assessments_fraud_risk ON ai_assessments(fraud_risk_level);
CREATE INDEX idx_ai_assessments_total_loss ON ai_assessments(total_loss_indicated);
```

### 4. Fraud Detection Database (`fraud_detect_db`)

**Owned by:** fraud-detection-service

**Tables:**
- `fraud_alerts` - Real-time fraud alerts
- `fraud_indicators` - Detected fraud patterns
- `fraud_rules` - Configurable detection rules
- `claimant_history` - Claimant fraud profiles
- `vehicle_history` - Vehicle fraud patterns
- `entity_relationships` - Collusion detection graph
- `pre_accident_damage` - Pre-existing damage tracking
- `fraud_investigations` - Investigation tracking

**PostgreSQL Schema:**

```sql
-- Graph-based entity relationships for collusion detection
CREATE TABLE entity_relationships (
  id SERIAL PRIMARY KEY,
  
  -- Entity A
  entity_a_type VARCHAR(50) NOT NULL,
  entity_a_id INTEGER NOT NULL,
  entity_a_name VARCHAR(255),
  
  -- Entity B
  entity_b_type VARCHAR(50) NOT NULL,
  entity_b_id INTEGER NOT NULL,
  entity_b_name VARCHAR(255),
  
  -- Relationship details
  relationship_type VARCHAR(50) NOT NULL,
  relationship_strength INTEGER DEFAULT 0,
  
  -- Interaction statistics
  interaction_count INTEGER DEFAULT 0,
  first_interaction_date TIMESTAMPTZ,
  last_interaction_date TIMESTAMPTZ,
  
  -- Fraud indicators
  is_collusion_suspected BOOLEAN DEFAULT FALSE,
  collusion_score INTEGER DEFAULT 0,
  collusion_evidence JSONB,
  
  -- Investigation
  investigation_status VARCHAR(50) DEFAULT 'none',
  investigation_notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Graph traversal indexes
CREATE INDEX idx_entity_rel_a ON entity_relationships(entity_a_type, entity_a_id);
CREATE INDEX idx_entity_rel_b ON entity_relationships(entity_b_type, entity_b_id);
CREATE INDEX idx_entity_rel_type ON entity_relationships(relationship_type);
CREATE INDEX idx_entity_rel_collusion ON entity_relationships(is_collusion_suspected);

-- GIN index for JSONB collusion evidence
CREATE INDEX idx_entity_rel_evidence ON entity_relationships USING GIN(collusion_evidence);
```

### 5. Cost Optimization Database (`cost_optim_db`)

**Owned by:** cost-optimization-service

**Tables:**
- `panel_beater_quotes` - Repair quotes
- `quote_line_items` - Itemized quote breakdowns
- `panel_beaters` - Approved repair shops
- `parts_pricing` - Market parts pricing database
- `labor_rates` - Geographic labor rate benchmarks
- `negotiation_history` - Quote negotiation tracking

**PostgreSQL Schema:**

```sql
CREATE TABLE panel_beater_quotes (
  id SERIAL PRIMARY KEY,
  claim_id INTEGER NOT NULL,
  panel_beater_id INTEGER NOT NULL,
  
  -- Quote details
  quoted_amount INTEGER NOT NULL,
  labor_cost INTEGER,
  parts_cost INTEGER,
  estimated_duration INTEGER,
  
  -- Quote status
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  submitted_at TIMESTAMPTZ,
  
  -- Document attachments
  quote_document_url TEXT,
  supporting_documents JSONB,
  
  -- Comparison metrics
  variance_from_ai DECIMAL(5,2),
  market_competitiveness_score INTEGER,
  
  -- Selection tracking
  is_selected BOOLEAN DEFAULT FALSE,
  selected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_quotes_claim ON panel_beater_quotes(claim_id);
CREATE INDEX idx_quotes_panel_beater ON panel_beater_quotes(panel_beater_id);
CREATE INDEX idx_quotes_status ON panel_beater_quotes(status);
CREATE INDEX idx_quotes_selected ON panel_beater_quotes(is_selected);
```

### 6. Workflow Engine Database (`workflow_db`)

**Owned by:** workflow-engine-service

**Tables:**
- `approval_workflow` - Approval state machine
- `workflow_transitions` - State transition log
- `workflow_rules` - Configurable workflow rules
- `sla_tracking` - SLA compliance tracking
- `escalations` - Escalation tracking

**PostgreSQL Schema:**

```sql
CREATE TABLE approval_workflow (
  id SERIAL PRIMARY KEY,
  claim_id INTEGER UNIQUE NOT NULL,
  
  -- Current state
  current_state VARCHAR(50) NOT NULL,
  previous_state VARCHAR(50),
  
  -- Approval stages
  technical_approval_required BOOLEAN DEFAULT TRUE,
  technical_approval_status VARCHAR(50) DEFAULT 'pending',
  technical_approved_by INTEGER,
  technical_approved_at TIMESTAMPTZ,
  
  financial_approval_required BOOLEAN DEFAULT TRUE,
  financial_approval_status VARCHAR(50) DEFAULT 'pending',
  financial_approved_by INTEGER,
  financial_approved_at TIMESTAMPTZ,
  
  -- SLA tracking
  sla_deadline TIMESTAMPTZ,
  sla_breached BOOLEAN DEFAULT FALSE,
  escalation_level INTEGER DEFAULT 0,
  
  -- Metadata
  workflow_data JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_workflow_claim ON approval_workflow(claim_id);
CREATE INDEX idx_workflow_state ON approval_workflow(current_state);
CREATE INDEX idx_workflow_sla ON approval_workflow(sla_deadline) WHERE sla_breached = FALSE;
```

### 7. Fleet Risk Database (`fleet_risk_db`)

**Owned by:** fleet-risk-service

**Tables:**
- `fleet_profiles` - Fleet-level risk profiles
- `driver_profiles` - Driver risk profiles
- `telematics_data` - Telematics integration
- `fleet_analytics` - Aggregated fleet metrics

**PostgreSQL Schema:**

```sql
CREATE TABLE fleet_profiles (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  fleet_name VARCHAR(255) NOT NULL,
  
  -- Fleet statistics
  total_vehicles INTEGER DEFAULT 0,
  total_drivers INTEGER DEFAULT 0,
  total_claims INTEGER DEFAULT 0,
  total_claim_amount INTEGER DEFAULT 0,
  
  -- Risk metrics
  fleet_risk_score INTEGER DEFAULT 0,
  fleet_risk_level VARCHAR(20) DEFAULT 'low',
  high_risk_drivers_count INTEGER DEFAULT 0,
  high_risk_vehicles_count INTEGER DEFAULT 0,
  
  -- Temporal patterns
  claim_frequency DECIMAL(5,2),
  average_claim_severity INTEGER,
  
  -- Telematics integration
  telematics_provider VARCHAR(100),
  telematics_enabled BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_fleet_org ON fleet_profiles(organization_id);
CREATE INDEX idx_fleet_risk ON fleet_profiles(fleet_risk_level);
```

### 8. Notification Database (`notification_db`)

**Owned by:** notification-service

**Tables:**
- `notifications` - User notifications
- `notification_preferences` - User preferences
- `notification_templates` - Email/SMS templates
- `notification_delivery_log` - Delivery tracking

**PostgreSQL Schema:**

```sql
CREATE TABLE notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  
  -- Notification details
  notification_type VARCHAR(100) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  
  -- Channel
  channel VARCHAR(50) NOT NULL, -- email, sms, push, in_app
  
  -- Status
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  
  -- Delivery tracking
  sent_at TIMESTAMPTZ,
  delivery_status VARCHAR(50),
  delivery_error TEXT,
  
  -- Metadata
  metadata JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Partitioning by created_at (monthly partitions)
CREATE INDEX idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON notifications(user_id) WHERE is_read = FALSE;
CREATE INDEX idx_notifications_type ON notifications(notification_type);
```

---

## ML Feature Storage

### TimescaleDB for Time-Series ML Features

**Database:** `ml_features_db` (TimescaleDB extension)

**Purpose:** Store time-series ML training features, model predictions, and performance metrics.

**Schema:**

```sql
-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Claim features time-series
CREATE TABLE claim_features (
  time TIMESTAMPTZ NOT NULL,
  claim_id INTEGER NOT NULL,
  
  -- Temporal features
  hour_of_day INTEGER,
  day_of_week INTEGER,
  days_since_policy_start INTEGER,
  days_since_last_claim INTEGER,
  
  -- Claimant features
  claimant_claim_count INTEGER,
  claimant_avg_claim_amount DECIMAL(10,2),
  claimant_fraud_score INTEGER,
  
  -- Vehicle features
  vehicle_age INTEGER,
  vehicle_claim_count INTEGER,
  vehicle_estimated_value INTEGER,
  
  -- Damage features
  damage_severity_score INTEGER,
  total_loss_probability DECIMAL(5,4),
  estimated_repair_cost INTEGER,
  
  -- Network features
  assessor_claimant_interaction_count INTEGER,
  panel_beater_claimant_interaction_count INTEGER,
  entity_relationship_strength INTEGER,
  
  -- Model predictions
  fraud_prediction_score DECIMAL(5,4),
  fraud_prediction_label BOOLEAN,
  total_loss_prediction BOOLEAN,
  
  -- Model metadata
  model_version VARCHAR(50),
  prediction_confidence DECIMAL(5,4),
  
  PRIMARY KEY (time, claim_id)
);

-- Convert to hypertable (TimescaleDB)
SELECT create_hypertable('claim_features', 'time');

-- Create continuous aggregates for analytics
CREATE MATERIALIZED VIEW claim_features_hourly
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 hour', time) AS bucket,
  COUNT(*) AS claim_count,
  AVG(fraud_prediction_score) AS avg_fraud_score,
  AVG(total_loss_probability) AS avg_total_loss_prob,
  AVG(estimated_repair_cost) AS avg_repair_cost
FROM claim_features
GROUP BY bucket;

-- Fraud model performance tracking
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
  true_negatives INTEGER,
  false_positives INTEGER,
  false_negatives INTEGER,
  
  -- Dataset info
  training_samples INTEGER,
  validation_samples INTEGER,
  test_samples INTEGER,
  
  PRIMARY KEY (time, model_version)
);

SELECT create_hypertable('fraud_model_metrics', 'time');
```

### Feature Engineering Pipeline

**Feature Extraction:**

```sql
-- Materialized view for real-time feature extraction
CREATE MATERIALIZED VIEW claim_feature_vectors AS
SELECT
  c.id AS claim_id,
  c.created_at AS time,
  
  -- Temporal features
  EXTRACT(HOUR FROM c.created_at) AS hour_of_day,
  EXTRACT(DOW FROM c.created_at) AS day_of_week,
  
  -- Claimant features
  ch.total_claims AS claimant_claim_count,
  ch.average_claim_amount AS claimant_avg_claim_amount,
  ch.risk_score AS claimant_fraud_score,
  
  -- Vehicle features
  (2026 - c.vehicle_year) AS vehicle_age,
  vh.total_claims AS vehicle_claim_count,
  vh.total_claim_amount AS vehicle_total_amount,
  
  -- AI assessment features
  ai.estimated_cost AS estimated_repair_cost,
  ai.confidence_score AS ai_confidence,
  ai.fraud_risk_level,
  
  -- Network features
  (SELECT COUNT(*) FROM entity_relationships er
   WHERE er.entity_a_id = c.claimant_id AND er.entity_a_type = 'claimant') AS relationship_count

FROM claims c
LEFT JOIN claimant_history ch ON c.claimant_id = ch.claimant_id
LEFT JOIN vehicle_history vh ON c.vehicle_registration = vh.vehicle_registration
LEFT JOIN ai_assessments ai ON c.id = ai.claim_id;

-- Refresh strategy
CREATE INDEX idx_claim_features_refresh ON claims(updated_at);
REFRESH MATERIALIZED VIEW CONCURRENTLY claim_feature_vectors;
```

---

## Migration Strategy

### Phase 1: Dual-Write Pattern (Weeks 1-4)

**Objective:** Write to both MySQL and PostgreSQL simultaneously.

**Implementation:**

```typescript
// Dual-write wrapper
async function createClaim(claimData: InsertClaim) {
  // Write to MySQL (existing)
  const mysqlClaim = await db.insert(claims).values(claimData);
  
  // Write to PostgreSQL (new)
  try {
    await pgDb.insert(pgClaims).values(claimData);
  } catch (error) {
    logger.error('PostgreSQL write failed', { error, claimData });
    // Continue with MySQL as source of truth
  }
  
  return mysqlClaim;
}
```

### Phase 2: Data Migration (Weeks 5-8)

**Objective:** Migrate historical data from MySQL to PostgreSQL.

**Migration Script:**

```sql
-- Bulk data migration with pg_dump and pg_restore
-- 1. Export from MySQL
mysqldump -u root -p kinga_db > kinga_mysql_dump.sql

-- 2. Transform schema (MySQL → PostgreSQL)
-- Use migration tool or manual transformation

-- 3. Import to PostgreSQL
psql -U postgres -d claim_intake_db < claim_intake_migration.sql

-- 4. Verify data integrity
SELECT COUNT(*) FROM claims; -- Should match MySQL count
```

### Phase 3: Read Migration (Weeks 9-12)

**Objective:** Switch reads to PostgreSQL.

**Implementation:**

```typescript
// Read from PostgreSQL, fallback to MySQL
async function getClaim(claimId: number) {
  try {
    return await pgDb.select().from(pgClaims).where(eq(pgClaims.id, claimId));
  } catch (error) {
    logger.warn('PostgreSQL read failed, falling back to MySQL', { error });
    return await db.select().from(claims).where(eq(claims.id, claimId));
  }
}
```

### Phase 4: Cutover (Week 13)

**Objective:** PostgreSQL becomes source of truth, MySQL deprecated.

---

## Performance Optimization

### Indexing Strategy

**General Principles:**

1. **Primary Keys**: Always use `SERIAL` or `BIGSERIAL` for auto-incrementing IDs
2. **Foreign Keys**: Index all foreign key columns
3. **Query Patterns**: Index columns used in WHERE, JOIN, ORDER BY
4. **Composite Indexes**: Create for multi-column queries
5. **Partial Indexes**: Use WHERE clause for filtered indexes
6. **GIN Indexes**: Use for JSONB columns with frequent searches

**Example Indexes:**

```sql
-- Composite index for common query pattern
CREATE INDEX idx_claims_status_created ON claims(status, created_at DESC);

-- Partial index for active claims
CREATE INDEX idx_claims_active ON claims(status, created_at)
  WHERE status NOT IN ('completed', 'rejected');

-- GIN index for JSONB search
CREATE INDEX idx_claims_damage_photos ON claims USING GIN(damage_photos);

-- Full-text search index
CREATE INDEX idx_claims_description_fts ON claims
  USING GIN(to_tsvector('english', incident_description));
```

### Partitioning Strategy

**Time-Based Partitioning:**

```sql
-- Partition claims by month
CREATE TABLE claims (
  id SERIAL,
  claim_number VARCHAR(50) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- ... other columns
) PARTITION BY RANGE (created_at);

-- Create partitions
CREATE TABLE claims_2026_01 PARTITION OF claims
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE claims_2026_02 PARTITION OF claims
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
-- ... continue for each month

-- Automated partition management
CREATE OR REPLACE FUNCTION create_monthly_partition()
RETURNS void AS $$
DECLARE
  partition_date DATE;
  partition_name TEXT;
  start_date TEXT;
  end_date TEXT;
BEGIN
  partition_date := DATE_TRUNC('month', NOW() + INTERVAL '1 month');
  partition_name := 'claims_' || TO_CHAR(partition_date, 'YYYY_MM');
  start_date := partition_date::TEXT;
  end_date := (partition_date + INTERVAL '1 month')::TEXT;
  
  EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF claims FOR VALUES FROM (%L) TO (%L)',
    partition_name, start_date, end_date);
END;
$$ LANGUAGE plpgsql;

-- Schedule monthly partition creation
SELECT cron.schedule('create-monthly-partition', '0 0 1 * *', 'SELECT create_monthly_partition()');
```

### Query Optimization

**Connection Pooling:**

```typescript
import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: 5432,
  database: 'claim_intake_db',
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  max: 20, // Maximum pool size
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

**Prepared Statements:**

```typescript
// Use parameterized queries
const result = await pool.query(
  'SELECT * FROM claims WHERE claim_number = $1',
  [claimNumber]
);
```

**Materialized Views:**

```sql
-- Aggregated dashboard metrics
CREATE MATERIALIZED VIEW dashboard_metrics AS
SELECT
  DATE_TRUNC('day', created_at) AS date,
  status,
  COUNT(*) AS claim_count,
  AVG(approved_amount) AS avg_amount,
  SUM(approved_amount) AS total_amount
FROM claims
GROUP BY date, status;

-- Refresh strategy
CREATE INDEX idx_dashboard_metrics_date ON dashboard_metrics(date DESC);
REFRESH MATERIALIZED VIEW CONCURRENTLY dashboard_metrics;
```

---

## Backup and Recovery

### Backup Strategy

**Automated Daily Backups:**

```bash
#!/bin/bash
# Daily backup script

BACKUP_DIR="/var/backups/postgresql"
DATE=$(date +%Y%m%d_%H%M%S)

# Backup all databases
for DB in claim_intake_db ai_damage_db fraud_detect_db cost_optim_db workflow_db fleet_risk_db insurer_integ_db identity_db notification_db ml_features_db event_store_db
do
  pg_dump -U postgres -Fc $DB > $BACKUP_DIR/${DB}_${DATE}.dump
done

# Compress and upload to S3
tar -czf $BACKUP_DIR/kinga_backup_${DATE}.tar.gz $BACKUP_DIR/*.dump
aws s3 cp $BACKUP_DIR/kinga_backup_${DATE}.tar.gz s3://kinga-backups/postgresql/

# Cleanup old backups (keep 30 days)
find $BACKUP_DIR -name "*.dump" -mtime +30 -delete
```

### Point-in-Time Recovery

**Enable WAL Archiving:**

```sql
-- postgresql.conf
wal_level = replica
archive_mode = on
archive_command = 'aws s3 cp %p s3://kinga-backups/wal/%f'
```

**Recovery Procedure:**

```bash
# Restore from backup
pg_restore -U postgres -d claim_intake_db /var/backups/postgresql/claim_intake_db_20260211.dump

# Apply WAL logs for point-in-time recovery
restore_command = 'aws s3 cp s3://kinga-backups/wal/%f %p'
recovery_target_time = '2026-02-11 12:00:00'
```

---

## Appendices

### Appendix A: Complete Schema DDL

See `drizzle/postgresql/` directory for complete PostgreSQL schema definitions.

### Appendix B: Migration Scripts

See `drizzle/migrations/` directory for migration scripts.

### Appendix C: Performance Benchmarks

See `docs/database/performance-benchmarks.md` for detailed performance testing results.

---

**Document Version:** 1.0.0  
**Last Updated:** February 11, 2026  
**Author:** Tavonga Shoko
