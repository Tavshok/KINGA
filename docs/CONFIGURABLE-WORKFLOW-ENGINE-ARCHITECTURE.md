# Configurable Standard Claims Workflow Engine Architecture

**Document ID:** KINGA-CWEA-2026-016  
**Version:** 1.0  
**Date:** February 11, 2026  
**Author:** Tavonga Shoko  
**Classification:** Technical Architecture Specification

---

## Executive Summary

This document specifies the architecture for KINGA's configurable standard claims workflow engine, a state machine-based orchestration system that balances industry-standard claims lifecycle processes with insurer-specific customization. The engine enforces a fixed sequence of core workflow stages while allowing tenant-level configuration of service level agreements (SLAs), assignment rules, validation requirements, and notification triggers. The architecture draws from proven workflow engine patterns employed by systems such as Temporal [1] and adapts industry-standard insurance claims lifecycle models [2] to create a scalable, auditable, and governance-compliant workflow orchestration platform.

The workflow engine operates on the principle that **KINGA provides a standard claims lifecycle that insurers can configure but not structurally alter**. This approach ensures consistency across the platform while accommodating insurer-specific business rules, regulatory requirements, and operational preferences. The architecture supports workflow versioning, comprehensive audit logging, analytics tracking, and multi-stakeholder access control across all lifecycle stages.

---

## 1. Core Design Principles

### 1.1 Standardization with Configurability

KINGA's workflow engine implements a **fixed-stage, configurable-behavior** model. The core claim lifecycle stages are immutable and enforced at the platform level, ensuring consistency, interoperability, and regulatory compliance. Insurers cannot add, remove, or reorder these stages. However, within each stage, insurers can configure timing rules, assignment logic, validation criteria, and notification triggers to match their operational requirements.

This design principle addresses a fundamental tension in multi-tenant insurance platforms: the need for standardization (to enable cross-insurer analytics, marketplace assessor assignment, and regulatory reporting) versus the need for customization (to accommodate diverse business models, regulatory jurisdictions, and operational workflows). By fixing the stage structure while allowing behavioral configuration, KINGA achieves both objectives.

### 1.2 State Machine Foundation

The workflow engine models claims as **finite state machines** (FSMs), where each claim exists in exactly one state at any given time and transitions between states are governed by explicit rules [3]. This approach provides several advantages. First, state machines enforce deterministic behavior—given a claim in state A and an event E, the resulting state is always predictable. Second, state transitions are atomic and durable, ensuring that claims cannot exist in ambiguous or inconsistent states. Third, the state machine model naturally supports audit logging, as every transition represents a discrete, traceable event.

The state machine architecture also enables **idempotent operations**. If a transition request is processed multiple times (due to network retries, for example), the system can detect duplicate requests and avoid unintended state changes. This property is critical for distributed systems where exactly-once semantics are difficult to achieve.

### 1.3 Event-Driven Architecture

The workflow engine operates as an event-driven system, where state transitions are triggered by events rather than direct API calls. Events include user actions (e.g., "assessor submits evaluation"), system actions (e.g., "SLA deadline reached"), and external integrations (e.g., "payment gateway confirms settlement"). This decoupling between event producers and the workflow engine improves scalability, testability, and extensibility.

Events are persisted in an **event log** before being processed, ensuring durability and enabling event replay for debugging, analytics, and disaster recovery. The event log also serves as the foundation for audit trails, as it captures the complete history of actions affecting each claim.

### 1.4 Multi-Tenancy and Isolation

Each insurer operates as a **tenant** with isolated configuration, data, and workflow state. Tenant isolation is enforced at multiple levels: database (via `tenant_id` partitioning), configuration (tenant-specific workflow rules), and access control (role-based permissions scoped to tenant). This architecture ensures that one insurer's configuration changes, data access, or system load cannot affect other tenants.

Marketplace assessors represent a special case in the multi-tenancy model. Unlike insurer-owned assessors (who belong to a single tenant), marketplace assessors can be assigned to claims across multiple tenants. The workflow engine enforces **claim-scoped access** for marketplace assessors, ensuring they can only access data and perform actions related to their assigned claims, not the broader tenant context.

---

## 2. Standard Claims Lifecycle Stages

### 2.1 Stage Definitions

KINGA defines **nine immutable lifecycle stages** that every claim must traverse. These stages are based on industry-standard insurance claims processing models [2] and adapted to support KINGA's AI-augmented, multi-stakeholder workflow.

| Stage ID | Stage Name | Description | Entry Condition | Exit Condition |
|----------|-----------|-------------|-----------------|----------------|
| `SUBMITTED` | Claim Submission | Claimant submits FNOL with incident details, photos, and policy information | User initiates claim submission | All required fields validated and claim record created |
| `TRIAGE` | Initial Triage | Insurer reviews claim for completeness, policy validity, and coverage | Claim submitted | Insurer assigns claim to AI assessment or human assessor |
| `AI_ASSESSMENT` | AI Damage Assessment | KINGA's AI analyzes damage photos, estimates repair costs, and flags fraud indicators | Insurer triggers AI assessment | AI generates assessment report with confidence scores |
| `ASSESSOR_ASSIGNMENT` | Assessor Assignment | Insurer assigns claim to human assessor (insurer-owned or marketplace) | Insurer selects assessor | Assessor accepts assignment |
| `ASSESSOR_EVALUATION` | Assessor Evaluation | Assessor inspects vehicle, validates AI assessment, and provides professional opinion | Assessor accepts assignment | Assessor submits evaluation report |
| `QUOTE_COLLECTION` | Panel Beater Quote Collection | Panel beaters submit repair quotes based on damage assessment | Assessor evaluation complete | All requested quotes received or deadline reached |
| `COMPARISON_REVIEW` | Insurer Comparison Review | Insurer reviews AI assessment, assessor evaluation, and panel beater quotes side-by-side | Quote collection complete | Insurer approves or denies claim |
| `SETTLEMENT` | Settlement & Payment | Approved claims are settled, payment issued, and repair assigned | Claim approved | Payment confirmed and repair scheduled |
| `CLOSED` | Claim Closure | Final stage for completed or denied claims | Settlement complete or claim denied | Claim archived |

### 2.2 Stage Immutability and Ordering

The nine stages listed above are **immutable** and **ordered**. Insurers cannot skip stages, add custom stages, or reorder the sequence. This constraint is enforced at the database level (via state transition validation) and the application level (via workflow engine guards). Attempts to perform invalid transitions (e.g., moving directly from `SUBMITTED` to `SETTLEMENT`) are rejected with detailed error messages.

However, not all claims traverse all stages. For example, a claim denied during `TRIAGE` moves directly to `CLOSED` without passing through assessment or quote collection. The workflow engine supports **conditional branching** within the fixed stage sequence, allowing claims to skip stages based on business rules (e.g., total loss claims may bypass panel beater quotes).

### 2.3 Substates and Granular Tracking

Within each stage, claims can have **substates** that provide finer-grained status tracking without violating stage immutability. For example, the `ASSESSOR_EVALUATION` stage might have substates such as `AWAITING_INSPECTION`, `INSPECTION_SCHEDULED`, `INSPECTION_COMPLETE`, and `REPORT_PENDING`. Substates are visible to users and used for SLA tracking, but they do not constitute separate workflow stages.

Substates are tenant-configurable, allowing insurers to define custom status labels that match their internal terminology and reporting requirements. However, substates cannot alter the core stage transition logic—they are purely informational.

---

## 3. Workflow State Machine Design

### 3.1 State Transition Model

The workflow engine implements a **guarded transition model**, where each state transition is governed by a set of preconditions (guards) that must be satisfied before the transition is allowed. Guards can check claim attributes (e.g., "Is policy active?"), user permissions (e.g., "Does user have role `insurer`?"), external system state (e.g., "Has payment been confirmed?"), and tenant-specific rules (e.g., "Does claim amount exceed threshold requiring manager approval?").

The state transition model is defined as a directed graph where nodes represent states and edges represent allowed transitions. Each edge is labeled with the event that triggers the transition and the guards that must pass. The graph is acyclic (except for self-loops representing retries or corrections), ensuring that claims always progress toward closure.

```
State Transition Graph (Simplified):

SUBMITTED --[insurer_assigns_to_ai]--> AI_ASSESSMENT
SUBMITTED --[insurer_assigns_to_assessor]--> ASSESSOR_ASSIGNMENT
AI_ASSESSMENT --[ai_completes_assessment]--> ASSESSOR_ASSIGNMENT
AI_ASSESSMENT --[ai_completes_assessment]--> QUOTE_COLLECTION
ASSESSOR_ASSIGNMENT --[assessor_accepts]--> ASSESSOR_EVALUATION
ASSESSOR_EVALUATION --[assessor_submits_report]--> QUOTE_COLLECTION
QUOTE_COLLECTION --[quotes_received]--> COMPARISON_REVIEW
COMPARISON_REVIEW --[insurer_approves]--> SETTLEMENT
COMPARISON_REVIEW --[insurer_denies]--> CLOSED
SETTLEMENT --[payment_confirmed]--> CLOSED
```

### 3.2 Transition Guards and Validation

Each transition edge in the state machine graph has an associated **guard function** that evaluates whether the transition is permitted. Guards are implemented as composable predicates that can be combined using logical operators (AND, OR, NOT). Common guard types include:

**Permission Guards:** Verify that the user initiating the transition has the required role and permissions. For example, only users with role `insurer` can approve claims in the `COMPARISON_REVIEW` stage.

**Data Validation Guards:** Ensure that required data fields are present and valid before allowing a transition. For example, the transition from `ASSESSOR_EVALUATION` to `QUOTE_COLLECTION` requires that the assessor has uploaded at least one damage photo and provided a cost estimate.

**Business Rule Guards:** Enforce tenant-specific business logic. For example, an insurer might configure a rule that claims exceeding $50,000 require manager approval before moving to `SETTLEMENT`.

**External System Guards:** Check the state of external systems before allowing a transition. For example, the transition from `SETTLEMENT` to `CLOSED` might require confirmation from the payment gateway that funds have been disbursed.

**SLA Guards:** Prevent transitions that would violate SLA commitments. For example, if an insurer has committed to completing triage within 24 hours, the workflow engine might block manual closure of a claim during `TRIAGE` if the SLA has not been met (to force investigation of the delay).

Guards are evaluated atomically within a database transaction, ensuring that the claim state, guard evaluation, and transition execution are consistent. If any guard fails, the transition is rejected, and the claim remains in its current state.

### 3.3 Idempotency and Retry Handling

The workflow engine ensures that state transitions are **idempotent**, meaning that processing the same transition request multiple times produces the same result as processing it once. This property is critical for distributed systems where network failures, timeouts, and retries are common.

Idempotency is achieved through **transition deduplication**. Each transition request includes a unique `idempotency_key` (typically a UUID generated by the client). The workflow engine stores completed transitions in a `workflow_transitions` table with the `idempotency_key` as a unique constraint. If a transition request arrives with a key that already exists, the engine returns the result of the original transition without re-executing it.

For long-running transitions (e.g., triggering an AI assessment that takes 30 seconds), the workflow engine uses **asynchronous processing**. The transition request is acknowledged immediately, and the actual work is performed by a background worker. The client can poll for completion or receive a webhook notification when the transition completes.

---

## 4. Configuration Schema Design

### 4.1 Tenant-Level Configuration Model

Each tenant has a **workflow configuration** stored in the `tenant_workflow_configs` table. The configuration is a JSON document that specifies tenant-specific rules, SLAs, assignment logic, validation requirements, and notification triggers. The schema is versioned to support backward compatibility as the configuration model evolves.

```sql
CREATE TABLE tenant_workflow_configs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  tenant_id INT NOT NULL,
  config_version VARCHAR(10) NOT NULL DEFAULT '1.0',
  config_json JSON NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by INT, -- user_id who created config
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  UNIQUE KEY unique_tenant_config (tenant_id, config_version)
);
```

The `config_json` field contains the full configuration document. Example structure:

```json
{
  "version": "1.0",
  "stages": {
    "TRIAGE": {
      "sla_hours": 24,
      "assignment_rules": {
        "auto_assign_to_ai": true,
        "ai_confidence_threshold": 0.85,
        "fallback_to_assessor": true
      },
      "validation_requirements": {
        "require_policy_verification": true,
        "require_photos_minimum": 3
      },
      "notifications": {
        "on_entry": ["insurer_claims_team"],
        "on_sla_warning": ["insurer_manager"],
        "on_sla_breach": ["insurer_manager", "compliance_team"]
      }
    },
    "ASSESSOR_ASSIGNMENT": {
      "sla_hours": 48,
      "assignment_rules": {
        "prefer_insurer_owned": true,
        "allow_marketplace": true,
        "marketplace_min_rating": 4.0,
        "auto_assign_algorithm": "weighted_score"
      },
      "notifications": {
        "on_assignment": ["assigned_assessor"],
        "on_acceptance": ["insurer_claims_team"]
      }
    }
  },
  "global_rules": {
    "max_claim_duration_days": 90,
    "require_manager_approval_threshold": 50000,
    "fraud_score_escalation_threshold": 0.7
  }
}
```

### 4.2 SLA Timing Rules

Service Level Agreements (SLAs) define the maximum time allowed for each workflow stage. SLAs are configured per-stage and measured in hours from stage entry. The workflow engine tracks SLA compliance and triggers warnings and breach notifications.

**SLA Configuration Fields:**
- `sla_hours`: Maximum hours allowed in this stage before SLA breach
- `sla_warning_threshold`: Percentage of SLA time remaining when warning is triggered (e.g., 0.8 = warning at 80% of SLA time elapsed)
- `sla_breach_action`: Action to take on SLA breach (`notify_only`, `escalate_to_manager`, `auto_close_with_denial`)

**SLA Tracking Implementation:**
The workflow engine uses a **timer queue** to track SLA deadlines. When a claim enters a stage, the engine calculates the SLA deadline (`entry_timestamp + sla_hours`) and inserts a timer event into the queue. A background worker polls the timer queue and triggers SLA warning/breach actions when deadlines are reached.

### 4.3 Assignment Rules Configuration

Assignment rules determine how claims are routed to assessors, panel beaters, and other stakeholders. Rules can be simple (e.g., "always assign to insurer-owned assessors") or complex (e.g., "use weighted scoring algorithm considering assessor specialization, proximity, workload, and performance history").

**Assignment Rule Types:**
- **Manual Assignment:** Insurer selects assessor from a list
- **Auto-Assignment (Round Robin):** Distribute claims evenly across available assessors
- **Auto-Assignment (Weighted Score):** Use recommendation engine to select best-fit assessor
- **Hybrid:** Auto-assign if confidence score > threshold, otherwise manual

**Configuration Example:**
```json
{
  "assignment_rules": {
    "mode": "auto_weighted",
    "weights": {
      "specialization_match": 0.3,
      "proximity_km": 0.25,
      "current_workload": 0.2,
      "performance_score": 0.15,
      "availability_hours": 0.1
    },
    "fallback_to_manual": true,
    "marketplace_enabled": true,
    "marketplace_min_rating": 4.0
  }
}
```

### 4.4 Validation Requirements Configuration

Validation requirements define the data quality checks that must pass before a claim can transition out of a stage. Validation rules are declarative and enforced by the workflow engine's guard functions.

**Common Validation Types:**
- **Required Fields:** Specific fields must be non-null and non-empty
- **File Uploads:** Minimum number of photos, documents, or reports required
- **Numeric Ranges:** Values must fall within acceptable ranges (e.g., repair cost < $100,000)
- **Cross-Field Logic:** Relationships between fields must be consistent (e.g., if total loss, salvage value must be provided)
- **External Verification:** Third-party systems must confirm data (e.g., policy is active, VIN is valid)

**Configuration Example:**
```json
{
  "validation_requirements": {
    "SUBMITTED": {
      "required_fields": ["policy_number", "incident_date", "vehicle_vin", "claimant_name"],
      "min_photos": 3,
      "max_incident_age_days": 30
    },
    "ASSESSOR_EVALUATION": {
      "required_fields": ["damage_description", "estimated_repair_cost", "labor_cost", "parts_cost"],
      "min_photos": 5,
      "require_assessor_signature": true
    }
  }
}
```

### 4.5 Notification Triggers Configuration

Notification triggers define when and to whom notifications are sent during the workflow lifecycle. Notifications can be triggered by stage transitions, SLA events, fraud alerts, and user actions.

**Notification Trigger Types:**
- `on_entry`: Sent when claim enters a stage
- `on_exit`: Sent when claim exits a stage
- `on_sla_warning`: Sent when SLA warning threshold is reached
- `on_sla_breach`: Sent when SLA deadline is exceeded
- `on_fraud_alert`: Sent when fraud score exceeds threshold
- `on_assignment`: Sent when claim is assigned to a user
- `on_approval`: Sent when claim is approved
- `on_denial`: Sent when claim is denied

**Recipient Types:**
- `claimant`: The person who submitted the claim
- `insurer_claims_team`: All users with role `insurer` in the tenant
- `insurer_manager`: Users with role `insurer_manager`
- `assigned_assessor`: The assessor assigned to the claim
- `assigned_panel_beaters`: Panel beaters invited to quote
- `compliance_team`: Compliance officers (for fraud alerts)

**Configuration Example:**
```json
{
  "notifications": {
    "TRIAGE": {
      "on_entry": ["insurer_claims_team"],
      "on_sla_warning": ["insurer_manager"],
      "on_sla_breach": ["insurer_manager", "compliance_team"]
    },
    "COMPARISON_REVIEW": {
      "on_entry": ["insurer_claims_team"],
      "on_approval": ["claimant", "assigned_panel_beaters"],
      "on_denial": ["claimant"],
      "on_fraud_alert": ["compliance_team", "insurer_manager"]
    }
  }
}
```

---

## 5. Workflow Version Control Strategy

### 5.1 Configuration Versioning

Workflow configurations are **versioned** to support evolution of business rules without breaking existing claims. Each configuration version is immutable once created. When an insurer updates their workflow configuration, a new version is created, and the old version is retained for historical claims.

**Versioning Strategy:**
- **Semantic Versioning:** Configuration versions follow semantic versioning (MAJOR.MINOR.PATCH)
- **Backward Compatibility:** Minor and patch version changes must be backward compatible
- **Major Version Changes:** Breaking changes (e.g., adding new required fields) require a major version increment

**Version Application:**
- **New Claims:** Use the latest configuration version at the time of claim submission
- **In-Flight Claims:** Continue using the configuration version that was active when the claim was submitted
- **Version Migration:** Insurers can optionally migrate in-flight claims to a new configuration version (with approval workflow)

### 5.2 Workflow State Versioning

The workflow engine supports **workflow state versioning** to handle changes to the core stage definitions. While the nine core stages are immutable in version 1.0, future versions of KINGA might introduce new stages (e.g., `MEDIATION` for disputed claims) or split existing stages into finer-grained steps.

**State Version Compatibility:**
- Each claim stores the `workflow_version` it was created under
- The workflow engine maintains compatibility layers to translate between workflow versions
- Claims created under older workflow versions can complete their lifecycle using the old state machine definition

### 5.3 Audit Trail and Change Tracking

All configuration changes are logged in the `workflow_config_audit` table, capturing who made the change, when, and what was modified. This audit trail supports compliance, debugging, and rollback scenarios.

```sql
CREATE TABLE workflow_config_audit (
  id INT PRIMARY KEY AUTO_INCREMENT,
  tenant_id INT NOT NULL,
  config_version VARCHAR(10) NOT NULL,
  changed_by INT NOT NULL, -- user_id
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  change_type ENUM('created', 'updated', 'deprecated') NOT NULL,
  change_description TEXT,
  config_diff JSON, -- JSON diff showing what changed
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (changed_by) REFERENCES users(id)
);
```

---

## 6. Governance Enforcement Model

### 6.1 Stage Immutability Enforcement

The workflow engine enforces stage immutability at multiple levels to prevent insurers from altering the core workflow structure:

**Database Level:** The `claims` table has a `status` column with an ENUM type that restricts values to the nine predefined stages. Attempts to insert invalid statuses are rejected by the database.

**Application Level:** The workflow engine's state transition logic validates all transition requests against the allowed transition graph. Invalid transitions (e.g., skipping stages, moving backward) are rejected with error messages.

**API Level:** The tRPC API exposes only the allowed transition operations (e.g., `assignToAssessor`, `submitEvaluation`, `approveClaim`). There is no generic "set claim status" endpoint that would allow arbitrary state changes.

**UI Level:** The frontend UI only displays actions that are valid for the claim's current state. For example, the "Approve Claim" button is only visible when the claim is in `COMPARISON_REVIEW` stage.

### 6.2 Configuration Validation

When insurers update their workflow configuration, the workflow engine validates the configuration against a **JSON schema** that defines allowed fields, data types, and value ranges. Invalid configurations are rejected before being saved.

**Validation Rules:**
- SLA hours must be positive integers
- Assignment rule weights must sum to 1.0
- Notification recipients must be valid role names
- Validation requirements must reference existing fields in the claim schema

**Configuration Approval Workflow:**
For high-risk configuration changes (e.g., reducing SLA times, disabling fraud checks), the workflow engine can require approval from a tenant administrator or KINGA platform administrator before the change takes effect.

### 6.3 Role-Based Access Control (RBAC)

The workflow engine integrates with KINGA's RBAC system to enforce permissions at each stage. Users can only perform actions that are allowed for their role and the claim's current state.

**Permission Matrix Example:**

| Role | TRIAGE | ASSESSOR_ASSIGNMENT | ASSESSOR_EVALUATION | COMPARISON_REVIEW | SETTLEMENT |
|------|--------|---------------------|---------------------|-------------------|------------|
| Claimant | View | View | View | View | View |
| Insurer | Assign to AI/Assessor | Assign Assessor | View | Approve/Deny | View |
| Assessor | View | Accept Assignment | Submit Evaluation | View | View |
| Panel Beater | - | - | View | Submit Quote | View |
| Manager | All | All | All | All | All |

### 6.4 Compliance and Regulatory Alignment

The workflow engine supports compliance with insurance regulations by enforcing mandatory stages (e.g., all claims must be assessed before settlement) and providing audit trails for regulatory reporting.

**Compliance Features:**
- **Immutable Audit Log:** All state transitions, configuration changes, and user actions are logged with timestamps and user attribution
- **Data Retention:** Claims and audit logs are retained for the legally required period (typically 7 years)
- **Regulatory Reporting:** The workflow engine can generate reports showing claim processing times, SLA compliance, fraud detection rates, and other metrics required by regulators
- **POPIA/GDPR Compliance:** Personal data (claimant names, contact information) is encrypted at rest and in transit, with access controls enforcing need-to-know principles

---

## 7. Scalability Architecture Design

### 7.1 Sharding Strategy

The workflow engine uses **sharding by claim ID** to distribute workflow state across multiple database partitions. Each claim is assigned to a shard based on a hash of its `claim_id`, ensuring even distribution and enabling horizontal scaling.

**Sharding Benefits:**
- **Horizontal Scalability:** Add more shards (database partitions) as claim volume grows
- **Isolation:** Each shard operates independently, reducing contention and improving throughput
- **Fault Tolerance:** Failure of one shard does not affect claims in other shards

**Sharding Implementation:**
- Use consistent hashing to map claim IDs to shards
- Over-allocate shards (e.g., 1,000 logical shards for 10 physical database servers) to enable fine-grained rebalancing
- Store shard-to-server mapping in a distributed configuration service (e.g., etcd, Consul)

### 7.2 Transfer Queue Pattern for Eventual Consistency

The workflow engine uses the **transfer queue pattern** (also known as the transactional outbox pattern) [1] to ensure that workflow state changes, audit log entries, and notification events are eventually consistent without requiring distributed transactions.

**How It Works:**
1. When a claim transitions to a new state, the workflow engine writes the new state to the `claims` table and an event record to the `workflow_events` table within a single database transaction.
2. A background worker polls the `workflow_events` table and transfers events to external systems (notification service, analytics pipeline, audit log storage).
3. If the transfer fails, the worker retries until successful, ensuring eventual consistency.

**Benefits:**
- **Atomicity:** State change and event creation are atomic (same transaction)
- **No Distributed Transactions:** Avoids complex two-phase commit protocols
- **Guaranteed Delivery:** Events are eventually delivered even if external systems are temporarily unavailable

### 7.3 Task Queue Architecture

The workflow engine uses **task queues** to decouple workflow orchestration from task execution. Tasks include AI assessment requests, assessor assignment notifications, SLA deadline checks, and payment processing.

**Task Queue Design:**
- **Separate Queues per Task Type:** AI assessment tasks, notification tasks, SLA timer tasks, and payment tasks use separate queues to enable independent scaling and prioritization.
- **Worker Pools:** Each task type has a dedicated pool of workers that poll the queue and execute tasks.
- **Priority Queues:** High-priority tasks (e.g., fraud alerts, SLA breaches) are processed before low-priority tasks (e.g., routine notifications).

**Task Queue Implementation:**
- Use a distributed queue system (e.g., Redis, RabbitMQ, AWS SQS) to store task messages
- Workers poll the queue, execute tasks, and acknowledge completion
- Failed tasks are retried with exponential backoff

### 7.4 Caching and Performance Optimization

The workflow engine uses **caching** to reduce database load and improve response times for frequently accessed data.

**Cached Data:**
- **Workflow Configuration:** Tenant workflow configurations are cached in memory (with TTL and invalidation on updates)
- **State Transition Graph:** The allowed transition graph is cached globally (shared across all tenants)
- **User Permissions:** Role-based permissions are cached per user session

**Cache Invalidation:**
- Configuration changes trigger cache invalidation for the affected tenant
- User permission changes trigger cache invalidation for the affected user
- Use a distributed cache (e.g., Redis) to share cached data across multiple application servers

---

## 8. Analytics Tracking and Observability

### 8.1 Workflow Performance Metrics

The workflow engine tracks key performance indicators (KPIs) for each claim and aggregates them at the tenant and platform levels.

**Claim-Level Metrics:**
- **Stage Duration:** Time spent in each workflow stage
- **Total Processing Time:** Time from submission to closure
- **SLA Compliance:** Whether each stage completed within SLA
- **Transition Count:** Number of state transitions (indicates complexity or rework)

**Tenant-Level Metrics:**
- **Average Processing Time:** Mean time from submission to closure
- **SLA Compliance Rate:** Percentage of claims meeting SLA targets
- **Stage Bottlenecks:** Stages with longest average duration
- **Fraud Detection Rate:** Percentage of claims flagged for fraud
- **Approval Rate:** Percentage of claims approved vs. denied

**Platform-Level Metrics:**
- **Total Claims Processed:** Volume of claims across all tenants
- **Throughput:** Claims processed per hour/day
- **System Load:** Database query times, API response times, queue depths

### 8.2 Event Logging and Audit Trail

Every workflow event is logged in the `workflow_events` table, creating a complete audit trail for each claim.

```sql
CREATE TABLE workflow_events (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  claim_id INT NOT NULL,
  tenant_id INT NOT NULL,
  event_type VARCHAR(50) NOT NULL, -- e.g., 'state_transition', 'sla_warning', 'fraud_alert'
  from_state VARCHAR(50),
  to_state VARCHAR(50),
  triggered_by INT, -- user_id or NULL for system events
  triggered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  event_data JSON, -- additional context (e.g., guard results, configuration used)
  FOREIGN KEY (claim_id) REFERENCES claims(id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  INDEX idx_claim_events (claim_id, triggered_at),
  INDEX idx_tenant_events (tenant_id, triggered_at)
);
```

**Event Types:**
- `state_transition`: Claim moved from one stage to another
- `sla_warning`: SLA warning threshold reached
- `sla_breach`: SLA deadline exceeded
- `fraud_alert`: Fraud score exceeded threshold
- `assignment_created`: Claim assigned to assessor/panel beater
- `payment_confirmed`: Settlement payment confirmed
- `config_updated`: Tenant workflow configuration changed

### 8.3 Real-Time Dashboards and Reporting

The workflow engine provides real-time dashboards for insurers to monitor claim processing performance, SLA compliance, and workflow bottlenecks.

**Dashboard Views:**
- **Claims Pipeline:** Visual representation of claims in each stage (funnel chart)
- **SLA Compliance:** Real-time SLA compliance rate with trend over time
- **Stage Duration Heatmap:** Identify stages with longest processing times
- **Fraud Detection Dashboard:** Claims flagged for fraud, fraud score distribution
- **Assessor Performance:** Average evaluation time, accuracy score, claim volume per assessor

**Reporting Capabilities:**
- **Custom Date Ranges:** Filter metrics by date range (last 7 days, last month, custom)
- **Export to CSV/Excel:** Download raw data for offline analysis
- **Scheduled Reports:** Automatically email reports to stakeholders (daily, weekly, monthly)

---

## 9. Multi-Stakeholder Access Control

### 9.1 Stakeholder Roles and Permissions

The workflow engine supports multiple stakeholder roles, each with specific permissions at different workflow stages.

**Stakeholder Roles:**
- **Claimant:** Submits claim, views status, receives notifications
- **Insurer:** Manages triage, assigns assessors, approves/denies claims, views all data
- **Assessor (Insurer-Owned):** Accepts assignments, submits evaluations, views assigned claims within tenant
- **Assessor (Marketplace):** Accepts assignments, submits evaluations, views only assigned claims (cross-tenant)
- **Panel Beater:** Views assigned claims, submits quotes
- **Manager:** Approves high-value claims, views all claims, manages configuration
- **Compliance Officer:** Views fraud alerts, audit logs, regulatory reports

### 9.2 Claim-Scoped Access for Marketplace Assessors

Marketplace assessors present a unique access control challenge: they work across multiple tenants but should only access claims they are assigned to. The workflow engine enforces **claim-scoped access** through a combination of database-level and application-level controls.

**Database-Level Enforcement:**
- Assessor queries include a JOIN with the `assessor_claim_assignments` table to filter claims
- Queries automatically add `WHERE assessor_id = :current_user_id AND assignment_status = 'active'`

**Application-Level Enforcement:**
- API endpoints verify that the assessor is assigned to the claim before returning data
- Unauthorized access attempts are logged and trigger security alerts

**Claim-Scoped Data Access:**
- Marketplace assessors can view: claim details, damage photos, AI assessment, panel beater quotes (for their assigned claims only)
- Marketplace assessors cannot view: other claims in the tenant, tenant-wide analytics, insurer configuration

### 9.3 Audit Logging of Access Events

All data access events are logged in the `access_audit_log` table to support compliance and security monitoring.

```sql
CREATE TABLE access_audit_log (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  claim_id INT,
  tenant_id INT NOT NULL,
  access_type ENUM('read', 'write', 'delete') NOT NULL,
  resource_type VARCHAR(50) NOT NULL, -- e.g., 'claim', 'assessment', 'quote'
  resource_id INT,
  accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ip_address VARCHAR(45),
  user_agent TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (claim_id) REFERENCES claims(id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  INDEX idx_user_access (user_id, accessed_at),
  INDEX idx_claim_access (claim_id, accessed_at)
);
```

---

## 10. Implementation Roadmap

### 10.1 Phase 1: Core State Machine (Weeks 1-4)

**Deliverables:**
- Implement state transition graph and guard functions
- Create `workflow_events` and `workflow_transitions` tables
- Build state transition API endpoints
- Implement idempotency and retry handling
- Write unit tests for state machine logic

### 10.2 Phase 2: Configuration Schema (Weeks 5-8)

**Deliverables:**
- Design and implement `tenant_workflow_configs` table
- Build configuration validation logic (JSON schema)
- Create configuration management UI for insurers
- Implement SLA timing rules and timer queue
- Write integration tests for configuration application

### 10.3 Phase 3: Assignment Rules and Notifications (Weeks 9-12)

**Deliverables:**
- Implement assignment rule engine (manual, round-robin, weighted)
- Build notification trigger system
- Integrate with email/SMS notification service
- Create notification templates
- Test end-to-end assignment and notification workflows

### 10.4 Phase 4: Versioning and Audit (Weeks 13-16)

**Deliverables:**
- Implement configuration versioning
- Build workflow state versioning compatibility layer
- Create `workflow_config_audit` and `access_audit_log` tables
- Implement audit log viewer UI
- Test version migration scenarios

### 10.5 Phase 5: Scalability and Analytics (Weeks 17-20)

**Deliverables:**
- Implement sharding strategy and consistent hashing
- Build transfer queue pattern for eventual consistency
- Create task queue architecture for async processing
- Implement caching layer (Redis)
- Build real-time analytics dashboards
- Load test with 10,000+ concurrent claims

### 10.6 Phase 6: Governance and Compliance (Weeks 21-24)

**Deliverables:**
- Implement multi-stakeholder access control
- Build claim-scoped access for marketplace assessors
- Create compliance reporting tools
- Conduct security audit and penetration testing
- Document governance policies and procedures
- Obtain compliance certification (if required)

---

## 11. Security Threat Model

### 11.1 Threat: Unauthorized State Manipulation

**Description:** An attacker attempts to move a claim to an invalid state (e.g., directly from `SUBMITTED` to `SETTLED`) to bypass fraud checks or approval workflows.

**Mitigation:**
- Enforce state transition validation at database, application, and API levels
- Use guard functions to verify preconditions before allowing transitions
- Log all transition attempts (successful and failed) for audit
- Implement rate limiting to prevent brute-force attacks on state transitions

### 11.2 Threat: Configuration Tampering

**Description:** An attacker with insurer credentials modifies workflow configuration to disable fraud checks, extend SLAs indefinitely, or bypass approval requirements.

**Mitigation:**
- Require approval workflow for high-risk configuration changes
- Validate all configuration updates against JSON schema
- Log all configuration changes with user attribution
- Implement role-based access control (only managers can modify configuration)
- Alert platform administrators when critical settings are changed

### 11.3 Threat: Cross-Tenant Data Leakage

**Description:** A marketplace assessor or compromised insurer account accesses claims from other tenants.

**Mitigation:**
- Enforce tenant isolation at database level (via `tenant_id` filtering)
- Implement claim-scoped access for marketplace assessors
- Log all data access events with user, claim, and tenant context
- Monitor for anomalous access patterns (e.g., assessor accessing claims outside their assignments)
- Use database views and row-level security to enforce tenant boundaries

### 11.4 Threat: SLA Deadline Manipulation

**Description:** An attacker modifies system time or timer queue to bypass SLA deadlines and avoid breach notifications.

**Mitigation:**
- Use database server time (not client time) for all SLA calculations
- Store SLA deadlines as absolute timestamps (not relative durations)
- Implement integrity checks on timer queue (detect missing or tampered entries)
- Monitor for sudden changes in SLA compliance rates (indicator of tampering)

### 11.5 Threat: Event Log Tampering

**Description:** An attacker deletes or modifies entries in the `workflow_events` table to hide fraudulent activity or compliance violations.

**Mitigation:**
- Make `workflow_events` table append-only (no UPDATE or DELETE permissions for application users)
- Use database triggers to prevent modifications
- Replicate event log to immutable storage (e.g., S3 with object lock)
- Implement cryptographic signatures on event records to detect tampering
- Monitor for gaps in event sequence numbers

---

## 12. Governance Compliance Alignment

### 12.1 POPIA (Protection of Personal Information Act) Compliance

**Requirement:** Protect personal information of claimants, assessors, and other stakeholders.

**Compliance Measures:**
- Encrypt personal data (names, contact information, ID numbers) at rest and in transit
- Implement role-based access control to enforce need-to-know principles
- Provide data subject access request (DSAR) functionality for claimants to view/export their data
- Support data deletion requests (right to be forgotten) with audit trail
- Log all access to personal data in `access_audit_log`

### 12.2 GDPR (General Data Protection Regulation) Compliance

**Requirement:** Protect personal data of EU residents (if KINGA operates in EU or processes EU data).

**Compliance Measures:**
- Obtain explicit consent before processing personal data
- Provide clear privacy notices explaining data usage
- Implement data minimization (collect only necessary data)
- Support data portability (export data in machine-readable format)
- Conduct Data Protection Impact Assessments (DPIAs) for high-risk processing
- Appoint Data Protection Officer (DPO) if required

### 12.3 FSCA (Financial Sector Conduct Authority) Compliance

**Requirement:** Comply with South African insurance regulations regarding claims processing, fraud prevention, and consumer protection.

**Compliance Measures:**
- Enforce mandatory workflow stages (all claims must be assessed before settlement)
- Provide audit trails showing compliance with claims processing timelines
- Implement fraud detection and reporting mechanisms
- Ensure transparency in claims decisions (provide reasons for denials)
- Support regulatory reporting (claims volume, fraud rates, processing times)

### 12.4 ISO 27001 (Information Security Management) Alignment

**Requirement:** Implement information security controls to protect claims data.

**Compliance Measures:**
- Implement access controls (RBAC, MFA, session management)
- Encrypt data at rest and in transit (TLS 1.3, AES-256)
- Conduct regular security audits and vulnerability assessments
- Implement incident response procedures
- Maintain security documentation (policies, procedures, risk assessments)

---

## 13. Conclusion

KINGA's configurable standard claims workflow engine provides a robust, scalable, and governance-compliant foundation for multi-tenant insurance claims processing. By implementing a fixed-stage, configurable-behavior model, the engine balances the need for standardization (to enable cross-insurer analytics, marketplace assessor assignment, and regulatory compliance) with the need for customization (to accommodate diverse business models and operational requirements).

The state machine architecture ensures deterministic, auditable, and recoverable workflow execution. The configuration schema enables insurers to tailor SLAs, assignment rules, validation requirements, and notification triggers without compromising platform integrity. The versioning strategy supports evolution of business rules while maintaining backward compatibility for in-flight claims. The governance enforcement model prevents unauthorized state manipulation and configuration tampering. The scalability architecture (sharding, transfer queues, task queues, caching) supports high-volume claims processing with low latency and high availability.

Future enhancements to the workflow engine may include machine learning-based SLA prediction, dynamic workflow optimization (automatically adjust assignment rules based on performance data), and integration with external workflow orchestration platforms (e.g., Temporal, Camunda) for complex multi-system workflows.

---

## References

[1]: Temporal. (2021). *Designing a Workflow Engine from First Principles*. Retrieved from https://temporal.io/blog/workflow-engine-principles

[2]: VCA Software. (2025). *The Life Cycle of an Insurance Claim: Step-by-Step*. Retrieved from https://vcasoftware.com/life-cycle-of-an-insurance-claim/

[3]: Wikipedia. (2026). *Finite-state machine*. Retrieved from https://en.wikipedia.org/wiki/Finite-state_machine

---

**Document Control**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-11 | Tavonga Shoko | Initial release |

**Approval**

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Technical Architect | Tavonga Shoko | _Pending_ | 2026-02-11 |
| Product Owner | _TBD_ | _Pending_ | _TBD_ |
| Compliance Officer | _TBD_ | _Pending_ | _TBD_ |

---

*End of Document*
