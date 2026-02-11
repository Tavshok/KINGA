# KINGA Workflow Orchestration Engine - Implementation

**Author:** Tavonga Shoko  
**Version:** 1.0.0  
**Date:** February 11, 2026

---

## Executive Summary

This document provides complete specifications for the KINGA Workflow Orchestration Engine, which automates the claim lifecycle from submission through approval or rejection. The engine implements a state machine pattern with configurable business rules, integrates fraud detection and cost optimization services for automated decision-making, supports insurer-specific approval workflows, and maintains comprehensive audit logs for regulatory compliance. The system processes claims through defined states (Submitted, Under Review, Fraud Check, Cost Analysis, Pending Approval, Approved, Rejected) with automatic transitions based on configured thresholds and manual interventions when required.

---

## Architecture Overview

### Design Principles

The workflow orchestration engine follows these core architectural principles to ensure reliability, flexibility, and maintainability.

**State Machine Pattern** provides deterministic claim lifecycle management with well-defined states and transitions. Each claim exists in exactly one state at any time, and transitions occur only through defined rules or manual actions. This prevents invalid state combinations and ensures audit trail completeness.

**Rule-Based Decision Making** enables insurer-specific customization without code changes. Business rules are stored as configuration and evaluated by the rules engine at decision points. This allows insurers to define approval thresholds, fraud score limits, cost variance tolerances, and escalation criteria through administrative interfaces.

**Event-Driven Integration** decouples the workflow engine from AI services through asynchronous events. When a claim requires fraud scoring or cost analysis, the engine publishes events to Kafka and subscribes to response events. This architecture enables independent scaling and prevents cascading failures.

**Audit-First Design** logs every state transition, rule evaluation, and decision with complete context including user identity, timestamp, input data, and reasoning. Audit logs are immutable and stored in append-only tables for regulatory compliance and dispute resolution.

**Idempotent Operations** ensure workflow actions can be safely retried without side effects. Each transition is assigned a unique idempotency key, and duplicate requests are detected and ignored. This enables reliable processing in distributed systems with potential message duplication.

### System Components

The workflow orchestration engine consists of five primary components that work together to automate claim processing.

**Workflow Engine Core** manages claim state, evaluates transition conditions, executes state change logic, and coordinates with external services. The engine runs as a stateless microservice that loads claim state from the database, applies business logic, and persists updated state atomically.

**Rules Engine** evaluates configurable business rules against claim data to make automated decisions. Rules are expressed in a domain-specific language (DSL) that supports conditions, thresholds, and actions. The engine supports complex rules like "Auto-approve if fraud_score < 0.3 AND cost_variance < 10% AND claim_amount < $5000".

**Integration Layer** publishes events to Kafka for fraud detection and cost optimization requests, subscribes to response events from AI services, calls external APIs for policy verification and payment processing, and handles retries and circuit breaking for resilience.

**Audit Logger** captures all workflow events in structured format, stores audit records in PostgreSQL with partitioning by month, provides query APIs for audit trail retrieval, and generates compliance reports for regulatory submissions.

**Configuration Service** stores insurer-specific workflow rules and thresholds, provides APIs for rule management by administrators, validates rule syntax and semantics before activation, and supports rule versioning with effective dates for controlled rollouts.

---

## Claim Lifecycle States

The workflow engine manages claims through a defined set of states with specific entry/exit conditions and allowed transitions.

### State Definitions

**Submitted** is the initial state when a claim is created. Entry occurs when a claimant or insurer submits a new claim through the web portal or API. Exit conditions include automatic transition to Under Review after basic validation passes, or transition to Rejected if validation fails (missing required fields, invalid policy number).

**Under Review** indicates the claim is being processed by the system. Entry occurs after successful validation. The system retrieves policy details, verifies coverage, extracts documents, and prepares for automated analysis. Exit conditions include transition to Fraud Check if fraud detection is required per insurer rules, transition to Cost Analysis if fraud check is not required or passes, or transition to Rejected if policy is invalid or claim is outside coverage.

**Fraud Check** indicates the claim is being analyzed for fraud risk. Entry occurs when insurer rules require fraud scoring. The system publishes FraudDetectionRequest event to Kafka and waits for FraudDetectionResponse. Exit conditions include transition to Cost Analysis if fraud score is below threshold (e.g., < 0.5), transition to Pending Approval if fraud score is moderate (0.5-0.7) requiring manual review, or transition to Rejected if fraud score is high (> 0.7) per insurer policy.

**Cost Analysis** indicates the claim cost is being validated against market rates. Entry occurs after fraud check passes or is skipped. The system publishes CostOptimizationRequest event and waits for response with optimal cost estimate. Exit conditions include transition to Approved if cost variance is acceptable (e.g., < 15%) and amount is below auto-approval threshold, transition to Pending Approval if cost variance is high or amount exceeds threshold, or transition to Rejected if cost is excessively inflated (e.g., > 50% above market rate).

**Pending Approval** indicates manual review is required. Entry occurs when automated rules cannot make a decision (moderate fraud risk, high cost variance, large claim amount, or special circumstances). The system assigns the claim to an adjuster based on workload and expertise. Exit conditions include transition to Approved when adjuster approves, transition to Rejected when adjuster rejects, or transition back to Under Review if adjuster requests additional information.

**Approved** is the terminal state for successful claims. Entry occurs when all checks pass and approval is granted (automated or manual). The system triggers payment processing, sends approval notification to claimant, and updates insurer systems. No exit transitions are allowed except for rare cases of reversal requiring special permissions.

**Rejected** is the terminal state for denied claims. Entry occurs when validation fails, fraud is detected, cost is excessive, or adjuster denies. The system sends rejection notification with reason to claimant and logs decision rationale. No exit transitions are allowed except for appeals which create new claim records.

### State Transition Diagram

```
Submitted
    ↓
Under Review
    ↓
    ├─→ Fraud Check
    │       ↓
    │   Cost Analysis
    │       ↓
    └─→ Pending Approval
            ↓
        Approved / Rejected
```

---

## Business Rules Configuration

Insurers configure workflow behavior through business rules expressed in a structured format.

### Rule Structure

Each rule consists of a unique rule ID, rule name and description, rule type (auto_approve, auto_reject, require_manual_review, escalate), conditions (boolean expressions evaluated against claim data), actions (state transitions or notifications), priority (for conflict resolution when multiple rules match), and effective date range (for time-bound rules).

### Rule Examples

**Auto-Approval Rule** for low-risk claims:

```json
{
  "rule_id": "auto_approve_low_risk",
  "rule_name": "Auto-approve low-risk claims",
  "rule_type": "auto_approve",
  "conditions": {
    "all": [
      {"field": "fraud_score", "operator": "<", "value": 0.3},
      {"field": "cost_variance_pct", "operator": "<", "value": 10},
      {"field": "claim_amount", "operator": "<", "value": 5000},
      {"field": "claimant_history_clean", "operator": "==", "value": true}
    ]
  },
  "actions": [
    {"type": "transition", "to_state": "Approved"},
    {"type": "notify", "recipient": "claimant", "template": "approval_notification"}
  ],
  "priority": 10,
  "effective_from": "2026-01-01",
  "effective_to": null
}
```

**Fraud Rejection Rule** for high-risk claims:

```json
{
  "rule_id": "reject_high_fraud",
  "rule_name": "Reject claims with high fraud score",
  "rule_type": "auto_reject",
  "conditions": {
    "any": [
      {"field": "fraud_score", "operator": ">", "value": 0.8},
      {"field": "fraud_ring_detected", "operator": "==", "value": true},
      {"field": "physics_consistency_score", "operator": "<", "value": 30}
    ]
  },
  "actions": [
    {"type": "transition", "to_state": "Rejected"},
    {"type": "notify", "recipient": "claimant", "template": "fraud_rejection"},
    {"type": "notify", "recipient": "fraud_team", "template": "fraud_alert"}
  ],
  "priority": 100,
  "effective_from": "2026-01-01",
  "effective_to": null
}
```

**Manual Review Rule** for moderate risk:

```json
{
  "rule_id": "manual_review_moderate_risk",
  "rule_name": "Require manual review for moderate fraud risk",
  "rule_type": "require_manual_review",
  "conditions": {
    "all": [
      {"field": "fraud_score", "operator": ">=", "value": 0.5},
      {"field": "fraud_score", "operator": "<=", "value": 0.8},
      {"field": "claim_amount", "operator": ">", "value": 10000}
    ]
  },
  "actions": [
    {"type": "transition", "to_state": "Pending Approval"},
    {"type": "assign", "to": "fraud_specialist"},
    {"type": "notify", "recipient": "assigned_adjuster", "template": "review_required"}
  ],
  "priority": 50,
  "effective_from": "2026-01-01",
  "effective_to": null
}
```

### Rule Evaluation Logic

When a claim reaches a decision point, the rules engine follows this evaluation process. First, it loads all active rules for the insurer where the current date is between effective_from and effective_to. Then it filters rules applicable to the current state and claim type. Next, it evaluates conditions for each rule against claim data, collecting all matching rules. It sorts matching rules by priority (higher priority first) and selects the highest priority rule. If multiple rules have the same priority, it logs a conflict warning and selects the first rule. Finally, it executes the rule's actions (state transition, assignment, notification) and logs the rule evaluation result to the audit trail.

---

## Service Integrations

The workflow engine integrates with AI services and external systems through well-defined interfaces.

### Fraud Detection Integration

**Request Flow:** When a claim enters Fraud Check state, the workflow engine publishes a FraudDetectionRequest event to Kafka topic `kinga.fraud-detection.inference-requests`. The event payload includes claim_id, claim_amount, claimant_id, vehicle_id, damage_description, assessor_id, and all 45 fraud features. The fraud detection service consumes the event, executes model inference, and publishes FraudDetectionResponse to `kinga.fraud-detection.inference-responses`.

**Response Handling:** The workflow engine subscribes to the response topic and matches responses to pending claims by claim_id. Upon receiving a response, it extracts fraud_probability, fraud_risk_level, fraud_indicators, and fraud_ring_detected. It evaluates business rules against the fraud score to determine the next state (Cost Analysis, Pending Approval, or Rejected). Finally, it logs the fraud check result to the audit trail with complete response data.

**Timeout Handling:** If no response is received within 60 seconds, the workflow engine publishes a retry request up to 3 times. After 3 failed attempts, it transitions the claim to Pending Approval for manual review and alerts the operations team.

### Cost Optimization Integration

**Request Flow:** When a claim enters Cost Analysis state, the workflow engine publishes a CostOptimizationRequest event to `kinga.cost-optimization.inference-requests`. The payload includes claim_id, damaged_components, quote_amount, parts_cost, labor_cost, panel_beater_id, vehicle_make_model_year, and market_rate_data. The cost optimization service analyzes the quote and publishes CostOptimizationResponse to the response topic.

**Response Handling:** The engine receives the response containing optimal_cost, cost_variance_pct, negotiation_potential, and recommendations. It calculates cost_variance_pct = (quote_amount - optimal_cost) / optimal_cost * 100. It evaluates rules based on cost_variance_pct and claim_amount to determine approval or manual review. If variance is acceptable, it transitions to Approved. If variance is high but negotiable, it transitions to Pending Approval with negotiation recommendations. If variance is excessive, it transitions to Rejected with cost inflation reason.

**Timeout Handling:** Similar to fraud detection, the engine retries up to 3 times with 60-second timeout. On failure, it transitions to Pending Approval for manual cost review.

### External System Integrations

**Policy Verification:** The engine calls the insurer's policy management API to verify coverage, check policy status (active, lapsed, cancelled), retrieve policy limits and deductibles, and validate claim is within coverage period. If the API is unavailable, the engine caches policy data and uses stale data with a warning flag.

**Payment Processing:** Upon approval, the engine calls the payment gateway API to initiate payment to the claimant or panel beater. It provides claim_id, payee_id, amount, and payment_method. It receives payment_transaction_id and stores it in the claim record. If payment fails, it transitions the claim to a Payment Failed state and alerts finance team.

**Notification Service:** The engine publishes notification events to `kinga.notifications.send-requests` for email, SMS, and in-app notifications. Events include recipient_id, notification_type, template_id, and template_variables. The notification service handles delivery and tracks read receipts.

---

## Audit Logging

Comprehensive audit logging ensures regulatory compliance and enables dispute resolution.

### Audit Record Structure

Each audit record captures timestamp (ISO 8601 with millisecond precision), claim_id (UUID), workflow_state_from and workflow_state_to, transition_trigger (automatic_rule, manual_action, system_event), rule_id (if triggered by rule), user_id (if manual action), action_type (state_transition, assignment, notification, comment), action_details (JSON with complete context), fraud_score and cost_variance (if applicable), and decision_rationale (human-readable explanation).

### Audit Trail Queries

The audit service provides APIs for retrieving audit trails with various filters. Administrators can query by claim_id to get complete history for a specific claim, by user_id to track all actions by an adjuster, by date_range to generate compliance reports, by state_transition to analyze workflow patterns, and by rule_id to measure rule effectiveness.

### Compliance Reporting

The system generates automated compliance reports including monthly claim processing statistics (total claims, auto-approved, manually reviewed, rejected), average processing time by state, fraud detection effectiveness (true positives, false positives), cost optimization savings, and adjuster performance metrics (claims reviewed, approval rate, average review time).

---

## Implementation Architecture

### Technology Stack

**Workflow Engine:** Node.js with TypeScript for type safety, tRPC for API endpoints, Drizzle ORM for database access, and Bull queue for background job processing.

**Rules Engine:** JSON-based rule definitions stored in PostgreSQL, JavaScript expression evaluation using `vm2` sandbox, and rule validation using JSON Schema.

**Event Processing:** Kafka for event streaming, KafkaJS client library, consumer groups for parallel processing, and idempotency using message deduplication.

**Database:** PostgreSQL 15 for transactional data, table partitioning for audit logs by month, JSONB columns for flexible claim data, and indexes on claim_id, state, created_at, and insurer_id.

**Monitoring:** Prometheus metrics for workflow throughput and latency, Grafana dashboards for real-time monitoring, CloudWatch alarms for SLA violations, and distributed tracing with Jaeger.

### Database Schema

**claims_workflow table** stores claim_id (UUID primary key), insurer_id (foreign key), current_state (enum), previous_state (enum), state_entered_at (timestamp), assigned_to_user_id (UUID nullable), fraud_score (decimal nullable), cost_variance_pct (decimal nullable), claim_data (JSONB), workflow_metadata (JSONB), created_at, and updated_at.

**workflow_rules table** stores rule_id (UUID primary key), insurer_id (foreign key), rule_name, rule_type (enum), rule_definition (JSONB), priority (integer), effective_from (date), effective_to (date nullable), created_by_user_id, and created_at.

**workflow_audit_log table** (partitioned by month) stores audit_id (UUID primary key), claim_id (foreign key), timestamp, state_from, state_to, trigger_type, rule_id (nullable), user_id (nullable), action_type, action_details (JSONB), and decision_rationale (text).

### API Endpoints

**POST /api/workflow/claims/:claimId/transition** triggers manual state transition by adjuster. Request body includes to_state, reason, and optional comment. Response includes success boolean, new_state, and audit_record_id.

**GET /api/workflow/claims/:claimId/state** retrieves current workflow state. Response includes current_state, state_entered_at, assigned_to, fraud_score, cost_variance_pct, and available_actions.

**GET /api/workflow/claims/:claimId/audit-trail** retrieves complete audit history. Response includes array of audit records sorted by timestamp descending.

**POST /api/workflow/rules** creates new workflow rule (admin only). Request body includes rule definition JSON. Response includes rule_id and validation result.

**PUT /api/workflow/rules/:ruleId** updates existing rule. Request body includes updated rule definition. Response includes success and effective_date.

**GET /api/workflow/rules** lists all active rules for insurer. Query parameters include insurer_id, rule_type, and effective_date. Response includes array of rules.

---

## Deployment and Operations

### Kubernetes Deployment

The workflow engine deploys as a Kubernetes Deployment with 5 initial replicas for high availability, resource requests of 2 CPU and 4GB memory per pod, HorizontalPodAutoscaler scaling from 5 to 30 replicas based on CPU (70%) and custom metrics (pending claims queue length), liveness probe on `/health` with 30-second interval, and readiness probe on `/ready` checking database and Kafka connectivity.

### Monitoring and Alerting

**Key Metrics:** workflow_claims_processed_total counter by state and insurer, workflow_state_transition_duration_seconds histogram, workflow_rules_evaluated_total counter by rule_id and outcome, workflow_pending_claims_gauge by state, and workflow_sla_violations_total counter by state and reason.

**Critical Alerts:** Pending claims exceeding SLA (> 24 hours in any state), fraud detection service timeout rate > 5%, cost optimization service timeout rate > 5%, database connection pool exhaustion, and Kafka consumer lag > 1000 messages.

### Performance Targets

**Throughput:** Process 10,000 claims per day (7 claims/minute average, 50 claims/minute peak). **Latency:** State transitions complete within 2 seconds for automated decisions, manual actions reflected within 1 second. **Availability:** 99.9% uptime (< 9 hours downtime per year). **Scalability:** Support up to 100,000 active claims in workflow simultaneously.

---

## Testing Strategy

### Unit Tests

Test rule evaluation logic with various condition combinations, state transition validation (allowed and disallowed transitions), event publishing and consumption with mock Kafka, and audit logging completeness.

### Integration Tests

Test end-to-end claim flow from Submitted to Approved, fraud detection integration with mock responses, cost optimization integration with mock responses, and manual intervention workflows.

### Load Tests

Simulate 50 claims/minute sustained load, measure latency at p50, p95, p99 percentiles, verify auto-scaling triggers at expected thresholds, and validate no data loss under high load.

### Chaos Tests

Kill random workflow engine pods and verify recovery, introduce Kafka broker failures and verify retry logic, simulate fraud detection service timeout and verify fallback to manual review, and test database failover scenarios.

---

## Conclusion

The KINGA Workflow Orchestration Engine provides production-ready automation of the claim lifecycle with configurable business rules, seamless AI service integration, and comprehensive audit logging. By implementing a state machine pattern with event-driven architecture, the system achieves reliability, scalability, and flexibility to accommodate diverse insurer requirements. The complete audit trail ensures regulatory compliance and enables data-driven optimization of approval processes.

---

**Document Version History**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-02-11 | Tavonga Shoko | Initial workflow orchestration implementation |
