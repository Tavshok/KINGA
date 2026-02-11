# KINGA Event-Driven Architecture Implementation Guide

**Author:** Tavonga Shoko  
**Date:** February 11, 2026  
**Version:** 1.0

---

## Executive Summary

This document provides a comprehensive implementation guide for the KINGA event-driven architecture built on Apache Kafka. The implementation includes a production-ready events library (`@kinga/events`) with publisher/subscriber patterns, retry logic, dead-letter queues, event versioning, and schema validation. This guide covers the technical implementation, integration patterns, deployment strategies, and operational procedures required to successfully deploy and maintain the event-driven system across all KINGA microservices.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Implementation Components](#implementation-components)
3. [Event Catalog](#event-catalog)
4. [Integration Patterns](#integration-patterns)
5. [Deployment Guide](#deployment-guide)
6. [Operational Procedures](#operational-procedures)
7. [Monitoring and Observability](#monitoring-and-observability)
8. [Security Considerations](#security-considerations)
9. [Performance Tuning](#performance-tuning)
10. [Migration Strategy](#migration-strategy)

---

## Architecture Overview

The KINGA event-driven architecture enables asynchronous communication between microservices through a centralized Apache Kafka cluster. This architecture provides loose coupling, scalability, and fault tolerance while maintaining strong consistency guarantees through event sourcing and the saga pattern.

### Core Components

The event system consists of four primary layers:

**Infrastructure Layer** provides the underlying Kafka cluster with three brokers configured for high availability. The cluster uses Zookeeper for coordination and implements topic replication with a factor of three to ensure no data loss during broker failures. Topics are organized by service domain and follow a strict naming convention to enable clear ownership and routing.

**Library Layer** contains the `@kinga/events` shared library that abstracts Kafka complexity and provides a consistent interface for all services. The library includes an event publisher with automatic retry logic and exponential backoff, an event subscriber with consumer group management, comprehensive event schemas with Zod validation, and utilities for graceful shutdown and performance monitoring.

**Integration Layer** bridges the existing monolithic application with the new event-driven architecture during the migration period. The event integration module provides backward-compatible wrappers that emit events from existing business logic without requiring immediate refactoring. This layer ensures gradual migration with zero downtime and allows services to be extracted incrementally.

**Service Layer** represents the individual microservices that publish and consume domain events. Each service owns specific event types and maintains its own event handlers. Services communicate exclusively through events, eliminating direct service-to-service HTTP calls and reducing coupling.

### Event Flow

A typical event flow proceeds through several stages. When a business action occurs in a service, such as claim submission, the service creates a domain event with a unique identifier, timestamp, version, payload, and metadata. The event publisher validates the event against its schema and publishes it to the appropriate Kafka topic using the partition key for ordering guarantees.

Kafka stores the event durably across multiple brokers with configurable retention periods. The event remains available for consumption by multiple subscribers, enabling the publish-subscribe pattern. Interested services consume the event through their subscriber instances, which are organized into consumer groups for load balancing.

Upon receiving an event, the subscriber invokes the registered event handler with automatic retry logic. If the handler succeeds, the consumer commits the offset to track progress. If the handler fails after exhausting retries, the event moves to the dead-letter queue for manual investigation. Throughout this process, the system emits metrics and logs for observability.

### Topic Organization

Topics follow the naming convention `{service}.{entity}.{event}` to provide clear ownership and routing. For example, `claim-intake.claim.submitted` indicates the claim-intake service owns this topic, it relates to the claim entity, and represents a submitted event.

Each topic is configured with three partitions for parallelism and a replication factor of three for durability. Messages within a partition maintain strict ordering, while messages across partitions may be processed concurrently. The partition key, typically the claim ID or user ID, ensures related events are routed to the same partition for ordering guarantees.

---

## Implementation Components

### Event Publisher

The event publisher provides a high-level interface for publishing events with built-in reliability features. Publishers are initialized once per service and reused throughout the application lifecycle.

**Key Features:**

The publisher implements automatic retry logic with exponential backoff. When a publish operation fails due to network issues or broker unavailability, the publisher retries up to three times by default with increasing delays (1s, 2s, 4s). This handles transient failures without manual intervention.

Event validation ensures all published events conform to their schema definitions. The publisher validates the event structure, required fields, and data types before sending to Kafka. Invalid events are rejected immediately with detailed error messages.

The dead-letter queue captures events that fail after exhausting retries. These events are published to a dedicated DLQ topic with metadata about the original topic, error message, and retry count. Operations teams monitor the DLQ and investigate failures.

Idempotency guarantees prevent duplicate events from causing inconsistent state. The publisher configures the Kafka producer with idempotent mode enabled, ensuring exactly-once semantics within a single partition.

Performance monitoring tracks key metrics including total events published, failed events, dead-lettered events, and average processing time. Services expose these metrics through a `/metrics` endpoint for Prometheus scraping.

**Configuration:**

Publishers accept a configuration object specifying the service name for event metadata, default retry settings including max retries, initial delay, and backoff multiplier, the DLQ topic name, and whether to enable event validation.

**Usage Example:**

```typescript
import { createEventPublisher } from '@kinga/events';

const publisher = createEventPublisher({
  serviceName: 'claim-intake-service',
  defaultRetry: {
    maxRetries: 3,
    initialDelay: 1000,
    backoffMultiplier: 2,
  },
  dlqTopic: 'kinga.dead-letter-queue',
  validateEvents: true,
});

await publisher.initialize();

await publisher.publish(
  'ClaimSubmitted',
  {
    claimId: 123,
    claimNumber: 'CLM-ABC123',
    claimantId: 456,
    policyNumber: 'POL-789',
    incidentDate: new Date(),
    vehicleId: 101,
    damageDescription: 'Front bumper damage',
  },
  {
    topic: 'claim-intake.claim.submitted',
    key: '123',
  }
);
```

### Event Subscriber

The event subscriber manages event consumption with consumer groups, concurrent processing, and automatic error handling. Subscribers register event handlers for specific event types and process messages as they arrive.

**Key Features:**

Consumer groups enable horizontal scaling by distributing partitions across multiple consumer instances. When a new instance joins the group, Kafka rebalances partitions automatically. This allows services to scale consumption capacity by adding more instances.

Concurrent processing allows subscribers to process multiple messages simultaneously within a single instance. The concurrency level is configurable and defaults to one message at a time. Higher concurrency improves throughput but requires thread-safe event handlers.

Automatic retry logic handles transient failures in event handlers. When a handler throws an error, the subscriber retries the event up to the configured maximum with exponential backoff. This handles temporary issues like database connection failures without losing events.

Graceful shutdown ensures no message loss during deployment. When the subscriber receives a shutdown signal, it stops consuming new messages, waits for in-flight messages to complete, commits offsets, and disconnects from Kafka. This guarantees at-least-once delivery semantics.

Pause and resume capabilities allow services to temporarily stop consumption during maintenance or high load. Paused consumers remain in the consumer group but stop fetching new messages. Resuming consumption continues from the last committed offset.

**Configuration:**

Subscribers accept a configuration object specifying the service name, default subscription options, DLQ topic, maximum retry attempts, initial retry delay, and backoff multiplier.

**Usage Example:**

```typescript
import { createEventSubscriber } from '@kinga/events';

const subscriber = createEventSubscriber({
  serviceName: 'notification-service',
  maxRetries: 3,
  initialRetryDelay: 1000,
  backoffMultiplier: 2,
});

await subscriber.initialize({
  topics: ['claim-intake.claim.submitted'],
  groupId: 'notification-service-group',
  fromBeginning: false,
});

subscriber.on('ClaimSubmitted', async (event) => {
  await sendEmail(event.payload.claimantId, {
    subject: 'Claim Submitted',
    body: `Your claim ${event.payload.claimNumber} has been submitted.`,
  });
});

await subscriber.start(5); // Process 5 messages concurrently
```

### Event Schemas

Event schemas define the structure and validation rules for all domain events using Zod. Schemas provide runtime type safety, automatic validation, and clear documentation of event contracts.

**Schema Structure:**

Every event schema extends the base `DomainEventSchema` which defines common fields including event ID (UUID), event type (string literal), timestamp (Date), version (semver string), payload (domain-specific data), and metadata (correlation ID, causation ID, user ID, source service).

Domain-specific payload schemas define the business data for each event type. For example, the `ClaimSubmittedPayloadSchema` includes claim ID, claim number, claimant ID, policy number, incident date, vehicle ID, and damage description.

**Versioning:**

Event schemas include a version field following semantic versioning. Breaking changes increment the major version, backward-compatible additions increment the minor version, and bug fixes increment the patch version.

Services handle multiple event versions simultaneously during migration periods. Event handlers check the version field and apply version-specific logic. Older versions are deprecated gradually with sufficient notice to consuming services.

**Schema Registry:**

The `EventSchemaRegistry` object maps event type names to their schema definitions. This enables dynamic schema lookup and validation. Services can validate incoming events against the registry before processing.

**Usage Example:**

```typescript
import { ClaimSubmittedEventSchema, validateEvent } from '@kinga/events';

// Validate event
const event = {
  eventId: 'evt_123',
  eventType: 'ClaimSubmitted',
  timestamp: new Date(),
  version: '1.0.0',
  payload: {
    claimId: 123,
    claimNumber: 'CLM-ABC123',
    claimantId: 456,
    policyNumber: 'POL-789',
    incidentDate: new Date(),
    vehicleId: 101,
    damageDescription: 'Front bumper damage',
  },
  metadata: {
    source: 'claim-intake-service',
    correlationId: 'corr_456',
  },
};

// Throws EventValidationError if invalid
ClaimSubmittedEventSchema.parse(event);

// Or use helper function
validateEvent(event);
```

### Kafka Client

The Kafka client provides a singleton instance managing connections to the Kafka cluster. The client handles producer and consumer lifecycle, connection pooling, health checks, and graceful shutdown.

**Features:**

Connection management maintains a single producer instance and multiple consumer instances per consumer group. The client reuses connections across the application to minimize overhead.

Health checks verify Kafka connectivity by listing topics periodically. Services expose health check endpoints that query the Kafka client status. Load balancers use health checks to route traffic only to healthy instances.

Topic management ensures required topics exist before publishing or consuming. The client creates topics automatically with configurable partition count and replication factor. This simplifies deployment and reduces manual operations.

Graceful shutdown disconnects all producers and consumers cleanly when the application terminates. The client flushes pending messages, commits offsets, and closes connections. Signal handlers (SIGTERM, SIGINT) trigger graceful shutdown automatically.

**Configuration:**

The client reads configuration from environment variables including Kafka broker URLs, client ID, SASL authentication credentials, SSL/TLS settings, connection timeout, request timeout, and log level.

**Usage Example:**

```typescript
import { initializeKafkaClient, setupGracefulShutdown } from '@kinga/events';

// Initialize from environment variables
const client = initializeKafkaClient();

// Setup graceful shutdown handlers
setupGracefulShutdown();

// Health check
const isHealthy = await client.healthCheck();

// Ensure topic exists
await client.ensureTopic('claim-intake.claim.submitted', 3, 3);
```

---

## Event Catalog

The KINGA system defines 20+ domain events across 10 microservices. Each event represents a significant business occurrence and triggers downstream processing.

### Claim Intake Service Events

**ClaimSubmitted (v1.0.0)**

Published when a claimant submits a new insurance claim. This event initiates the claims processing workflow and triggers AI damage assessment, fraud detection, and notification services.

Payload fields include claim ID (number), claim number (string), claimant ID (number), policy number (string), incident date (Date), vehicle ID (number), damage description (string), and estimated cost (number, optional).

Topic: `claim-intake.claim.submitted`

**DocumentUploaded (v1.0.0)**

Published when a document is uploaded to a claim. Documents include damage photos, police reports, invoices, and other supporting materials.

Payload fields include document ID (number), claim ID (number), document type (enum: damage_photo, police_report, invoice, other), file URL (string), and uploaded by (number).

Topic: `claim-intake.document.uploaded`

**ClaimStatusChanged (v1.0.0)**

Published when a claim status changes. Status transitions include submitted to under_review, under_review to approved, and approved to settled.

Payload fields include claim ID (number), previous status (string), new status (string), changed by (number), and reason (string, optional).

Topic: `claim-intake.claim.status-changed`

### AI Damage Service Events

**AssessmentStarted (v1.0.0)**

Published when an AI damage assessment begins. This event tracks assessment progress and enables monitoring of processing times.

Payload fields include assessment ID (number), claim ID (number), assessment type (enum: ai, human, hybrid), and started at (Date).

Topic: `ai-damage.assessment.started`

**AssessmentCompleted (v1.0.0)**

Published when an AI damage assessment completes. This event contains the full assessment results including cost breakdown and confidence scores.

Payload fields include assessment ID (number), claim ID (number), total cost (number), labor cost (number), parts cost (number), paint cost (number), confidence (number), damage areas (string array), and completed at (Date).

Topic: `ai-damage.assessment.completed`

**DamageDetected (v1.0.0)**

Published when the AI detects specific damage in uploaded photos. Multiple damage detection events may be published for a single assessment.

Payload fields include assessment ID (number), claim ID (number), damage type (string), severity (enum: minor, moderate, severe, total_loss), affected parts (string array), confidence (number), and image URL (string, optional).

Topic: `ai-damage.damage.detected`

### Fraud Detection Service Events

**FraudAlertRaised (v1.0.0)**

Published when the fraud detection system identifies suspicious activity. This event triggers investigation workflows and notifies risk managers.

Payload fields include alert ID (number), claim ID (number), fraud score (number), risk level (enum: low, medium, high, critical), indicators (string array), assigned to (number, optional), and requires investigation (boolean).

Topic: `fraud-detection.alert.raised`

**FraudInvestigationCompleted (v1.0.0)**

Published when a fraud investigation concludes. The outcome determines whether the claim proceeds or is rejected.

Payload fields include investigation ID (number), claim ID (number), outcome (enum: cleared, suspicious, confirmed_fraud), investigated by (number), findings (string), and completed at (Date).

Topic: `fraud-detection.investigation.completed`

### Physics Simulation Service Events

**PhysicsValidationCompleted (v1.0.0)**

Published when physics simulation validates claim consistency. The simulation compares reported damage with expected damage based on collision dynamics.

Payload fields include validation ID (number), claim ID (number), is consistent (boolean), confidence (number), inconsistencies (string array), and simulation data (object).

Topic: `physics-simulation.validation.completed`

### Cost Optimisation Service Events

**QuoteReceived (v1.0.0)**

Published when a panel beater submits a repair quote. Multiple quotes are collected for comparison and negotiation.

Payload fields include quote ID (number), claim ID (number), panel beater ID (number), total cost (number), labor cost (number), parts cost (number), estimated days (number), and received at (Date).

Topic: `cost-optimisation.quote.received`

**QuoteComparisonCompleted (v1.0.0)**

Published when the cost optimization engine completes quote comparison. This event identifies the recommended quote and potential savings.

Payload fields include claim ID (number), quotes array (quote ID, panel beater ID, total cost, score), recommended quote ID (number), and potential savings (number).

Topic: `cost-optimisation.comparison.completed`

### Workflow Engine Service Events

**ApprovalRequested (v1.0.0)**

Published when a claim requires management approval. Approval triggers include cost thresholds, fraud alerts, policy exceptions, and total loss determinations.

Payload fields include approval ID (number), claim ID (number), approval type (enum: cost_threshold, fraud_alert, policy_exception, total_loss), required approvers (number array), requested by (number), and deadline (Date, optional).

Topic: `workflow-engine.approval.requested`

**ApprovalDecisionMade (v1.0.0)**

Published when an approver makes a decision. The decision determines whether the claim proceeds, is rejected, or escalates to higher authority.

Payload fields include approval ID (number), claim ID (number), decision (enum: approved, rejected, escalated), decided by (number), comments (string, optional), and decided at (Date).

Topic: `workflow-engine.approval.decision-made`

**WorkflowStateChanged (v1.0.0)**

Published when a workflow transitions between states. This event tracks claim progress through the processing pipeline.

Payload fields include workflow ID (number), claim ID (number), previous state (string), new state (string), and triggered by (string).

Topic: `workflow-engine.workflow.state-changed`

### Fleet Risk Service Events

**FleetRiskScoreUpdated (v1.0.0)**

Published when a fleet risk score changes. Risk scores aggregate claims history, driver behavior, and vehicle condition.

Payload fields include fleet ID (number), risk score (number), previous score (number, optional), factors (string array), and updated at (Date).

Topic: `fleet-risk.risk-score.updated`

### Insurer Integration Service Events

**ExternalSystemSynced (v1.0.0)**

Published when data synchronizes with external insurer systems. This event tracks integration health and data consistency.

Payload fields include sync ID (number), system name (string), entity type (string), entity ID (number), sync status (enum: success, failed, partial), and synced at (Date).

Topic: `insurer-integration.sync.completed`

### Identity Access Service Events

**UserCreated (v1.0.0)**

Published when a new user account is created. This event triggers onboarding workflows and notification services.

Payload fields include user ID (number), email (string), role (string), and organization ID (number, optional).

Topic: `identity-access.user.created`

**UserLoggedIn (v1.0.0)**

Published when a user successfully authenticates. This event enables security monitoring and audit logging.

Payload fields include user ID (number), IP address (string), and user agent (string).

Topic: `identity-access.user.logged-in`

**RoleAssigned (v1.0.0)**

Published when a user receives a new role. This event triggers permission updates and access control changes.

Payload fields include user ID (number), role ID (number), role name (string), and assigned by (number).

Topic: `identity-access.role.assigned`

### Notification Service Events

**NotificationSent (v1.0.0)**

Published when a notification is successfully sent. This event tracks notification delivery for audit and analytics.

Payload fields include notification ID (number), user ID (number), channel (enum: email, sms, push, in_app), and template ID (string).

Topic: `notification.notification.sent`

---

## Integration Patterns

### Monolith Integration

During the migration from monolith to microservices, the event integration module enables gradual adoption of event-driven architecture without requiring immediate refactoring of existing code.

**Pattern:**

The integration module provides a singleton instance that initializes once at application startup. Existing business logic calls integration methods to emit events after performing database operations. The integration layer handles event creation, validation, and publishing transparently.

**Implementation:**

```typescript
import { eventIntegration } from './server/events/event-integration';

// Initialize at startup
await eventIntegration.initialize();

// Existing claim submission logic
async function submitClaim(claimData) {
  // Existing database logic
  const claim = await createClaim(claimData);
  
  // Emit event (non-blocking, graceful degradation)
  await eventIntegration.emitClaimSubmitted({
    claimId: claim.id,
    claimNumber: claim.claimNumber,
    claimantId: claim.claimantId,
    policyNumber: claim.policyNumber,
    incidentDate: claim.incidentDate,
    vehicleId: claim.vehicleId,
    damageDescription: claim.damageDescription,
  });
  
  return claim;
}
```

**Benefits:**

This pattern enables incremental migration by allowing the monolith to emit events while services are gradually extracted. It provides graceful degradation where event publishing failures do not break existing functionality. The integration layer is backward compatible and requires minimal code changes. Services can subscribe to events immediately even before extraction from the monolith.

### Saga Pattern

The saga pattern coordinates distributed transactions across multiple services using compensating actions. When a multi-step process fails, the saga executes compensation logic to restore consistency.

**Pattern:**

A saga coordinator orchestrates the workflow by publishing command events to participating services. Each service processes its step and publishes a success or failure event. The coordinator tracks progress and triggers compensation if any step fails.

**Implementation:**

```typescript
// Saga coordinator
class ClaimApprovalSaga {
  async execute(claimId: number) {
    const sagaId = nanoid();
    
    try {
      // Step 1: AI Assessment
      await publisher.publish('AssessmentRequested', {
        sagaId,
        claimId,
      }, { topic: 'saga.assessment.requested' });
      
      await this.waitForEvent('AssessmentCompleted', sagaId);
      
      // Step 2: Fraud Check
      await publisher.publish('FraudCheckRequested', {
        sagaId,
        claimId,
      }, { topic: 'saga.fraud-check.requested' });
      
      await this.waitForEvent('FraudCheckCompleted', sagaId);
      
      // Step 3: Quote Comparison
      await publisher.publish('QuoteComparisonRequested', {
        sagaId,
        claimId,
      }, { topic: 'saga.quote-comparison.requested' });
      
      await this.waitForEvent('QuoteComparisonCompleted', sagaId);
      
      // Step 4: Approval
      await publisher.publish('ApprovalRequested', {
        sagaId,
        claimId,
      }, { topic: 'saga.approval.requested' });
      
    } catch (error) {
      // Compensate in reverse order
      await this.compensate(sagaId, claimId);
      throw error;
    }
  }
  
  async compensate(sagaId: string, claimId: number) {
    await publisher.publish('QuoteComparisonCancelled', {
      sagaId,
      claimId,
    }, { topic: 'saga.quote-comparison.cancelled' });
    
    await publisher.publish('FraudCheckCancelled', {
      sagaId,
      claimId,
    }, { topic: 'saga.fraud-check.cancelled' });
    
    await publisher.publish('AssessmentCancelled', {
      sagaId,
      claimId,
    }, { topic: 'saga.assessment.cancelled' });
  }
}
```

**Benefits:**

The saga pattern maintains consistency across distributed services without requiring distributed transactions. It provides clear compensation logic for failure scenarios and enables complex multi-step workflows. The pattern is resilient to service failures and network partitions.

### Event Sourcing

Event sourcing stores all state changes as a sequence of events rather than updating current state directly. The current state is derived by replaying events from the event store.

**Pattern:**

Services append events to an append-only event log when state changes occur. The event log serves as the source of truth. Services rebuild state by replaying events from the beginning or from a snapshot.

**Implementation:**

```typescript
// Event store
class ClaimEventStore {
  async appendEvent(claimId: number, event: DomainEvent) {
    // Store event in database
    await db.insert(claimEvents).values({
      claimId,
      eventId: event.eventId,
      eventType: event.eventType,
      eventData: JSON.stringify(event),
      timestamp: event.timestamp,
    });
    
    // Publish to Kafka for subscribers
    await publisher.publish(event.eventType, event.payload, {
      topic: getTopicName('claim-intake', 'claim', event.eventType.toLowerCase()),
      key: claimId.toString(),
    });
  }
  
  async getEvents(claimId: number): Promise<DomainEvent[]> {
    const rows = await db
      .select()
      .from(claimEvents)
      .where(eq(claimEvents.claimId, claimId))
      .orderBy(claimEvents.timestamp);
    
    return rows.map(row => JSON.parse(row.eventData));
  }
  
  async rebuildState(claimId: number): Promise<Claim> {
    const events = await this.getEvents(claimId);
    
    let claim: Partial<Claim> = {};
    
    for (const event of events) {
      switch (event.eventType) {
        case 'ClaimSubmitted':
          claim = {
            id: event.payload.claimId,
            claimNumber: event.payload.claimNumber,
            status: 'submitted',
            // ... other fields
          };
          break;
        
        case 'ClaimStatusChanged':
          claim.status = event.payload.newStatus;
          break;
        
        // ... other event types
      }
    }
    
    return claim as Claim;
  }
}
```

**Benefits:**

Event sourcing provides a complete audit trail of all state changes with timestamps and user attribution. It enables time travel debugging by replaying events to any point in history. The pattern supports CQRS by separating write models (event store) from read models (projections). Event sourcing facilitates analytics and reporting by providing raw event data.

### CQRS (Command Query Responsibility Segregation)

CQRS separates write operations (commands) from read operations (queries) using different models optimized for each purpose.

**Pattern:**

Commands modify state and publish events. Event handlers update read models optimized for specific query patterns. Queries read from denormalized read models without touching the write model.

**Implementation:**

```typescript
// Command side (write model)
async function submitClaim(command: SubmitClaimCommand) {
  // Validate command
  validateSubmitClaimCommand(command);
  
  // Create claim in write model
  const claim = await createClaim(command);
  
  // Publish event
  await eventIntegration.emitClaimSubmitted({
    claimId: claim.id,
    claimNumber: claim.claimNumber,
    // ... other fields
  });
  
  return { claimId: claim.id };
}

// Query side (read model)
subscriber.on('ClaimSubmitted', async (event) => {
  // Update denormalized read model
  await db.insert(claimSummaryView).values({
    claimId: event.payload.claimId,
    claimNumber: event.payload.claimNumber,
    claimantName: await getClaimantName(event.payload.claimantId),
    status: 'submitted',
    submittedAt: event.timestamp,
  });
});

subscriber.on('AssessmentCompleted', async (event) => {
  // Update read model with assessment data
  await db
    .update(claimSummaryView)
    .set({
      assessmentCost: event.payload.totalCost,
      assessmentConfidence: event.payload.confidence,
    })
    .where(eq(claimSummaryView.claimId, event.payload.claimId));
});

// Query handler
async function getClaimSummary(claimId: number) {
  // Read from denormalized view
  return await db
    .select()
    .from(claimSummaryView)
    .where(eq(claimSummaryView.claimId, claimId))
    .limit(1);
}
```

**Benefits:**

CQRS enables independent scaling of read and write workloads. Read models can be optimized for specific query patterns without compromising write model design. The pattern supports multiple read models for different use cases (dashboards, reports, APIs). CQRS reduces contention by separating read and write databases.

---

## Deployment Guide

### Prerequisites

Before deploying the event-driven architecture, ensure the following prerequisites are met:

**Infrastructure:**
- Kubernetes cluster (version 1.24+) with at least 6 nodes
- Persistent volume provisioner for Kafka data storage
- Load balancer for external access
- Container registry for Docker images

**Software:**
- Docker (version 20.10+)
- kubectl (version 1.24+)
- Helm (version 3.8+)
- Node.js (version 18+)

**Access:**
- Kubernetes cluster admin access
- Container registry push permissions
- DNS management for custom domains

### Kafka Cluster Deployment

Deploy a production-ready Kafka cluster using the Strimzi Kubernetes operator.

**Step 1: Install Strimzi Operator**

```bash
# Add Strimzi Helm repository
helm repo add strimzi https://strimzi.io/charts/
helm repo update

# Install Strimzi operator
helm install strimzi-kafka-operator strimzi/strimzi-kafka-operator \
  --namespace kafka \
  --create-namespace \
  --set watchNamespaces="{kafka}"
```

**Step 2: Deploy Kafka Cluster**

Create a Kafka cluster manifest:

```yaml
# kafka-cluster.yaml
apiVersion: kafka.strimzi.io/v1beta2
kind: Kafka
metadata:
  name: kinga-kafka
  namespace: kafka
spec:
  kafka:
    version: 3.5.0
    replicas: 3
    listeners:
      - name: plain
        port: 9092
        type: internal
        tls: false
      - name: tls
        port: 9093
        type: internal
        tls: true
        authentication:
          type: scram-sha-512
    config:
      offsets.topic.replication.factor: 3
      transaction.state.log.replication.factor: 3
      transaction.state.log.min.isr: 2
      default.replication.factor: 3
      min.insync.replicas: 2
      inter.broker.protocol.version: "3.5"
    storage:
      type: persistent-claim
      size: 100Gi
      class: fast-ssd
    resources:
      requests:
        memory: 4Gi
        cpu: 2
      limits:
        memory: 8Gi
        cpu: 4
  zookeeper:
    replicas: 3
    storage:
      type: persistent-claim
      size: 10Gi
      class: fast-ssd
    resources:
      requests:
        memory: 1Gi
        cpu: 500m
      limits:
        memory: 2Gi
        cpu: 1
  entityOperator:
    topicOperator: {}
    userOperator: {}
```

Apply the manifest:

```bash
kubectl apply -f kafka-cluster.yaml

# Wait for Kafka to be ready
kubectl wait kafka/kinga-kafka --for=condition=Ready --timeout=300s -n kafka
```

**Step 3: Create Kafka Users**

Create SCRAM-SHA-512 users for each service:

```yaml
# kafka-users.yaml
apiVersion: kafka.strimzi.io/v1beta2
kind: KafkaUser
metadata:
  name: claim-intake-service
  namespace: kafka
  labels:
    strimzi.io/cluster: kinga-kafka
spec:
  authentication:
    type: scram-sha-512
  authorization:
    type: simple
    acls:
      - resource:
          type: topic
          name: claim-intake
          patternType: prefix
        operations: [Read, Write, Create, Describe]
      - resource:
          type: group
          name: claim-intake-service
          patternType: prefix
        operations: [Read]
---
# Repeat for other services
```

Apply the users:

```bash
kubectl apply -f kafka-users.yaml

# Extract credentials
kubectl get secret claim-intake-service -n kafka -o jsonpath='{.data.password}' | base64 -d
```

### Service Deployment

Deploy KINGA services with event integration enabled.

**Step 1: Build Docker Images**

```bash
# Build events library
cd shared/events
npm run build

# Build service image
cd ../../
docker build -t kinga/claim-intake-service:latest \
  -f services/claim-intake/Dockerfile .

# Push to registry
docker push kinga/claim-intake-service:latest
```

**Step 2: Create Kubernetes Secrets**

```bash
# Create Kafka credentials secret
kubectl create secret generic kafka-credentials \
  --from-literal=username=claim-intake-service \
  --from-literal=password='<password-from-kafka-user>' \
  -n kinga-services
```

**Step 3: Deploy Service**

```yaml
# claim-intake-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: claim-intake-service
  namespace: kinga-services
spec:
  replicas: 3
  selector:
    matchLabels:
      app: claim-intake-service
  template:
    metadata:
      labels:
        app: claim-intake-service
    spec:
      containers:
      - name: app
        image: kinga/claim-intake-service:latest
        ports:
        - containerPort: 3000
          name: http
        env:
        - name: KAFKA_BROKERS
          value: "kinga-kafka-kafka-bootstrap.kafka:9093"
        - name: KAFKA_CLIENT_ID
          value: "claim-intake-service"
        - name: KAFKA_SASL_MECHANISM
          value: "scram-sha-512"
        - name: KAFKA_SASL_USERNAME
          valueFrom:
            secretKeyRef:
              name: kafka-credentials
              key: username
        - name: KAFKA_SASL_PASSWORD
          valueFrom:
            secretKeyRef:
              name: kafka-credentials
              key: password
        - name: KAFKA_SSL
          value: "true"
        - name: KAFKA_ENABLED
          value: "true"
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "1Gi"
            cpu: "1"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: claim-intake-service
  namespace: kinga-services
spec:
  selector:
    app: claim-intake-service
  ports:
  - port: 80
    targetPort: 3000
  type: ClusterIP
```

Apply the deployment:

```bash
kubectl apply -f claim-intake-deployment.yaml

# Verify deployment
kubectl get pods -n kinga-services
kubectl logs -f deployment/claim-intake-service -n kinga-services
```

### Topic Creation

Create Kafka topics for all event types:

```yaml
# kafka-topics.yaml
apiVersion: kafka.strimzi.io/v1beta2
kind: KafkaTopic
metadata:
  name: claim-intake.claim.submitted
  namespace: kafka
  labels:
    strimzi.io/cluster: kinga-kafka
spec:
  partitions: 3
  replicas: 3
  config:
    retention.ms: 604800000  # 7 days
    compression.type: snappy
    min.insync.replicas: 2
---
# Repeat for other topics
```

Apply topics:

```bash
kubectl apply -f kafka-topics.yaml

# Verify topics
kubectl get kafkatopics -n kafka
```

### Monitoring Setup

Deploy Prometheus and Grafana for monitoring:

```bash
# Install Prometheus Operator
helm install prometheus-operator prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace

# Install Kafka Exporter
helm install kafka-exporter prometheus-community/prometheus-kafka-exporter \
  --namespace monitoring \
  --set kafkaServer="{kinga-kafka-kafka-bootstrap.kafka:9092}"
```

Import Grafana dashboards for Kafka monitoring.

---

## Operational Procedures

### Monitoring Events

Monitor event flow and system health using Prometheus metrics and Grafana dashboards.

**Key Metrics:**

Publisher metrics include total events published, events failed, events dead-lettered, average publishing time, and publishing rate (events per second).

Subscriber metrics include total events consumed, events failed, average processing time, consumer lag (messages behind), and consumption rate (events per second).

Kafka metrics include broker availability, under-replicated partitions, offline partitions, consumer group lag, and disk usage.

**Alerting Rules:**

Configure alerts for critical conditions:

```yaml
# prometheus-rules.yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: kinga-events-alerts
  namespace: monitoring
spec:
  groups:
  - name: events
    interval: 30s
    rules:
    - alert: HighEventFailureRate
      expr: rate(kinga_events_failed_total[5m]) > 0.05
      for: 5m
      labels:
        severity: warning
      annotations:
        summary: "High event failure rate"
        description: "{{ $labels.service }} has {{ $value }} event failures per second"
    
    - alert: HighConsumerLag
      expr: kafka_consumergroup_lag > 1000
      for: 10m
      labels:
        severity: warning
      annotations:
        summary: "High consumer lag"
        description: "Consumer group {{ $labels.consumergroup }} is {{ $value }} messages behind"
    
    - alert: DeadLetterQueueGrowing
      expr: rate(kinga_events_deadlettered_total[10m]) > 0.01
      for: 15m
      labels:
        severity: critical
      annotations:
        summary: "Dead letter queue growing"
        description: "DLQ is receiving {{ $value }} events per second"
```

### Handling Failed Events

Investigate and recover events from the dead-letter queue.

**Procedure:**

Monitor the DLQ topic for new events using a dedicated consumer. When events appear in the DLQ, extract the event data, original topic, and error message. Investigate the root cause by examining error messages, checking service logs, and validating event schemas.

Fix the underlying issue by deploying code fixes, correcting data issues, or adjusting configuration. Replay the event by republishing it to the original topic with the same payload. Verify successful processing by checking consumer logs and application state.

**DLQ Consumer Example:**

```typescript
const dlqSubscriber = createEventSubscriber({
  serviceName: 'dlq-monitor',
});

await dlqSubscriber.initialize({
  topics: ['kinga.dead-letter-queue'],
  groupId: 'dlq-monitor-group',
});

dlqSubscriber.on('*', async (dlqMessage: DeadLetterMessage) => {
  console.error('Dead letter event:', {
    eventId: dlqMessage.event.eventId,
    eventType: dlqMessage.event.eventType,
    originalTopic: dlqMessage.originalTopic,
    error: dlqMessage.error.message,
    retryCount: dlqMessage.retryCount,
  });
  
  // Send alert
  await alertOps({
    title: 'Event in Dead Letter Queue',
    message: `Event ${dlqMessage.event.eventId} failed after ${dlqMessage.retryCount} retries`,
    severity: 'high',
  });
  
  // Store for investigation
  await db.insert(deadLetterEvents).values({
    eventId: dlqMessage.event.eventId,
    eventType: dlqMessage.event.eventType,
    eventData: JSON.stringify(dlqMessage.event),
    originalTopic: dlqMessage.originalTopic,
    errorMessage: dlqMessage.error.message,
    errorStack: dlqMessage.error.stack,
    retryCount: dlqMessage.retryCount,
    deadLetteredAt: dlqMessage.deadLetterTimestamp,
  });
});
```

### Scaling Consumers

Scale event consumption to handle increased load.

**Horizontal Scaling:**

Add more consumer instances to the consumer group. Kafka automatically rebalances partitions across instances. Each instance processes a subset of partitions.

```bash
# Scale deployment
kubectl scale deployment notification-service --replicas=5 -n kinga-services

# Verify rebalance
kubectl logs -f deployment/notification-service -n kinga-services | grep "Rebalance"
```

**Vertical Scaling:**

Increase concurrency within each consumer instance to process more messages simultaneously.

```typescript
// Increase concurrency from 1 to 10
await subscriber.start(10);
```

**Partition Scaling:**

Increase the number of partitions for high-throughput topics. Note that this requires rebalancing and cannot be reversed.

```yaml
apiVersion: kafka.strimzi.io/v1beta2
kind: KafkaTopic
metadata:
  name: claim-intake.claim.submitted
spec:
  partitions: 6  # Increased from 3
  replicas: 3
```

### Topic Management

Manage topic lifecycle including creation, configuration updates, and deletion.

**Creating Topics:**

Topics are created automatically by the Kafka client when first accessed, or manually using Kubernetes manifests for production control.

**Updating Configuration:**

Update topic configuration such as retention period, compression type, and replication settings.

```yaml
apiVersion: kafka.strimzi.io/v1beta2
kind: KafkaTopic
metadata:
  name: claim-intake.claim.submitted
spec:
  config:
    retention.ms: 1209600000  # Increased to 14 days
    compression.type: lz4      # Changed from snappy
```

**Deleting Topics:**

Delete topics that are no longer needed. Ensure no consumers are subscribed before deletion.

```bash
kubectl delete kafkatopic claim-intake.claim.submitted -n kafka
```

### Backup and Recovery

Implement backup strategies for event data and Kafka configuration.

**Event Store Backup:**

If using event sourcing, backup the event store database regularly using database-native tools.

```bash
# MySQL backup
mysqldump -u root -p kinga_events > events_backup_$(date +%Y%m%d).sql

# Upload to S3
aws s3 cp events_backup_$(date +%Y%m%d).sql s3://kinga-backups/events/
```

**Kafka Data Backup:**

Use Kafka MirrorMaker 2 to replicate topics to a backup cluster.

```yaml
apiVersion: kafka.strimzi.io/v1beta2
kind: KafkaMirrorMaker2
metadata:
  name: kinga-mirror
  namespace: kafka
spec:
  version: 3.5.0
  replicas: 1
  connectCluster: "backup-cluster"
  clusters:
  - alias: "source-cluster"
    bootstrapServers: kinga-kafka-kafka-bootstrap:9092
  - alias: "backup-cluster"
    bootstrapServers: backup-kafka:9092
  mirrors:
  - sourceCluster: "source-cluster"
    targetCluster: "backup-cluster"
    sourceConnector:
      config:
        replication.factor: 3
    topicsPattern: ".*"
```

**Configuration Backup:**

Export Kubernetes manifests and store in version control.

```bash
# Export all Kafka resources
kubectl get kafka,kafkatopic,kafkauser -n kafka -o yaml > kafka-backup.yaml

# Commit to Git
git add kafka-backup.yaml
git commit -m "Backup Kafka configuration"
git push
```

---

## Monitoring and Observability

### Metrics Collection

Collect and expose metrics from all event system components.

**Application Metrics:**

Services expose Prometheus metrics at `/metrics` endpoint:

```typescript
import { register, Counter, Histogram } from 'prom-client';

// Event publishing metrics
const eventsPublished = new Counter({
  name: 'kinga_events_published_total',
  help: 'Total number of events published',
  labelNames: ['service', 'event_type', 'topic'],
});

const eventsFailed = new Counter({
  name: 'kinga_events_failed_total',
  help: 'Total number of failed events',
  labelNames: ['service', 'event_type', 'error'],
});

const publishingDuration = new Histogram({
  name: 'kinga_events_publishing_duration_seconds',
  help: 'Event publishing duration in seconds',
  labelNames: ['service', 'event_type'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
});

// Event consumption metrics
const eventsConsumed = new Counter({
  name: 'kinga_events_consumed_total',
  help: 'Total number of events consumed',
  labelNames: ['service', 'event_type', 'topic'],
});

const processingDuration = new Histogram({
  name: 'kinga_events_processing_duration_seconds',
  help: 'Event processing duration in seconds',
  labelNames: ['service', 'event_type'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5, 10, 30],
});

// Expose metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
```

**Kafka Metrics:**

Kafka Exporter scrapes metrics from Kafka brokers and exposes them to Prometheus.

**ServiceMonitor:**

Configure Prometheus to scrape service metrics:

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: kinga-services
  namespace: monitoring
spec:
  selector:
    matchLabels:
      monitoring: enabled
  endpoints:
  - port: metrics
    interval: 30s
    path: /metrics
```

### Distributed Tracing

Implement distributed tracing to track event flow across services.

**Trace Context Propagation:**

Include trace context in event metadata:

```typescript
import { trace, context } from '@opentelemetry/api';

// When publishing
const span = trace.getActiveSpan();
const traceId = span?.spanContext().traceId;

await publisher.publish(
  'ClaimSubmitted',
  payload,
  {
    topic: 'claim-intake.claim.submitted',
    headers: {
      'trace-id': traceId || '',
    },
  }
);

// When consuming
subscriber.on('ClaimSubmitted', async (event) => {
  const traceId = event.metadata.traceId;
  
  // Create child span
  const tracer = trace.getTracer('notification-service');
  const span = tracer.startSpan('process-claim-submitted', {
    attributes: {
      'event.id': event.eventId,
      'event.type': event.eventType,
      'trace.id': traceId,
    },
  });
  
  try {
    await processEvent(event);
    span.setStatus({ code: SpanStatusCode.OK });
  } catch (error) {
    span.setStatus({ code: SpanStatusCode.ERROR });
    span.recordException(error);
    throw error;
  } finally {
    span.end();
  }
});
```

**Jaeger Deployment:**

Deploy Jaeger for trace visualization:

```bash
helm install jaeger jaegertracing/jaeger \
  --namespace monitoring \
  --set provisionDataStore.cassandra=false \
  --set allInOne.enabled=true \
  --set storage.type=memory
```

### Logging

Implement structured logging with correlation IDs.

**Log Format:**

```typescript
import winston from 'winston';

const logger = winston.createLogger({
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
  ],
});

// Log with correlation ID
logger.info('Event published', {
  service: 'claim-intake-service',
  eventId: event.eventId,
  eventType: event.eventType,
  correlationId: event.metadata.correlationId,
  userId: event.metadata.userId,
});
```

**Log Aggregation:**

Deploy ELK Stack for centralized logging:

```bash
helm install elasticsearch elastic/elasticsearch \
  --namespace logging \
  --create-namespace

helm install kibana elastic/kibana \
  --namespace logging

helm install filebeat elastic/filebeat \
  --namespace logging
```

### Dashboards

Create Grafana dashboards for event system monitoring.

**Event Flow Dashboard:**

Visualize event throughput, latency, and error rates across all services.

**Consumer Lag Dashboard:**

Monitor consumer lag to identify processing bottlenecks.

**Dead Letter Queue Dashboard:**

Track DLQ volume and investigate failed events.

**Kafka Cluster Dashboard:**

Monitor broker health, disk usage, and replication status.

---

## Security Considerations

### Authentication

Implement SASL/SCRAM-SHA-512 authentication for Kafka connections.

**Configuration:**

```bash
# Create Kafka user with SCRAM-SHA-512
kubectl apply -f - <<EOF
apiVersion: kafka.strimzi.io/v1beta2
kind: KafkaUser
metadata:
  name: claim-intake-service
  namespace: kafka
  labels:
    strimzi.io/cluster: kinga-kafka
spec:
  authentication:
    type: scram-sha-512
EOF

# Extract credentials
kubectl get secret claim-intake-service -n kafka -o jsonpath='{.data.password}' | base64 -d
```

**Service Configuration:**

```typescript
// Environment variables
KAFKA_SASL_MECHANISM=scram-sha-512
KAFKA_SASL_USERNAME=claim-intake-service
KAFKA_SASL_PASSWORD=<password>
```

### Authorization

Implement fine-grained ACLs to restrict topic access.

**ACL Configuration:**

```yaml
apiVersion: kafka.strimzi.io/v1beta2
kind: KafkaUser
metadata:
  name: claim-intake-service
spec:
  authorization:
    type: simple
    acls:
      # Allow publishing to claim-intake topics
      - resource:
          type: topic
          name: claim-intake
          patternType: prefix
        operations: [Write, Create, Describe]
      
      # Allow consuming from all topics
      - resource:
          type: topic
          name: "*"
          patternType: literal
        operations: [Read, Describe]
      
      # Allow consumer group management
      - resource:
          type: group
          name: claim-intake-service
          patternType: prefix
        operations: [Read]
```

### Encryption

Enable TLS encryption for data in transit.

**Kafka TLS Configuration:**

```yaml
apiVersion: kafka.strimzi.io/v1beta2
kind: Kafka
metadata:
  name: kinga-kafka
spec:
  kafka:
    listeners:
      - name: tls
        port: 9093
        type: internal
        tls: true
        authentication:
          type: scram-sha-512
```

**Service TLS Configuration:**

```typescript
// Environment variables
KAFKA_SSL=true
```

### Secrets Management

Store sensitive credentials in Kubernetes secrets.

**Secret Creation:**

```bash
kubectl create secret generic kafka-credentials \
  --from-literal=username=claim-intake-service \
  --from-literal=password='<password>' \
  -n kinga-services
```

**Secret Rotation:**

Rotate credentials regularly using automated scripts:

```bash
#!/bin/bash
# rotate-kafka-credentials.sh

SERVICE_NAME=$1
NAMESPACE=$2

# Generate new password
NEW_PASSWORD=$(openssl rand -base64 32)

# Update Kafka user
kubectl patch kafkauser $SERVICE_NAME -n kafka --type merge -p "{\"spec\":{\"authentication\":{\"password\":\"$NEW_PASSWORD\"}}}"

# Update Kubernetes secret
kubectl create secret generic kafka-credentials \
  --from-literal=username=$SERVICE_NAME \
  --from-literal=password=$NEW_PASSWORD \
  --dry-run=client -o yaml | kubectl apply -n $NAMESPACE -f -

# Restart deployment
kubectl rollout restart deployment/$SERVICE_NAME -n $NAMESPACE
```

### Network Policies

Restrict network access between services using Kubernetes network policies.

**Policy Configuration:**

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: kafka-access
  namespace: kinga-services
spec:
  podSelector:
    matchLabels:
      app: claim-intake-service
  policyTypes:
  - Egress
  egress:
  - to:
    - namespaceSelector:
        matchLabels:
          name: kafka
    ports:
    - protocol: TCP
      port: 9093
```

---

## Performance Tuning

### Producer Tuning

Optimize event publishing performance.

**Batching:**

Configure batch size and linger time to balance latency and throughput:

```typescript
const producer = kafka.producer({
  maxInFlightRequests: 5,
  idempotent: true,
  transactionTimeout: 30000,
  
  // Batching configuration
  compression: CompressionTypes.Snappy,
  batch: {
    size: 16384,        // 16KB batch size
    maxBytes: 1048576,  // 1MB max batch
  },
  linger: {
    ms: 10,  // Wait 10ms for more messages
  },
});
```

**Compression:**

Enable compression to reduce network bandwidth:

```typescript
// Snappy: Fast compression, moderate ratio
// LZ4: Faster compression, lower ratio
// GZIP: Slower compression, higher ratio

compression: CompressionTypes.Snappy
```

**Partitioning:**

Use partition keys to distribute load evenly:

```typescript
await publisher.publish(
  'ClaimSubmitted',
  payload,
  {
    topic: 'claim-intake.claim.submitted',
    key: payload.claimId.toString(),  // Consistent hashing
  }
);
```

### Consumer Tuning

Optimize event consumption performance.

**Fetch Size:**

Configure fetch size to balance memory usage and throughput:

```typescript
const consumer = kafka.consumer({
  groupId: 'notification-service-group',
  maxBytesPerPartition: 1048576,  // 1MB per partition
  minBytes: 1024,                  // Wait for 1KB minimum
  maxWaitTimeInMs: 500,            // Wait 500ms max
});
```

**Concurrency:**

Process multiple messages concurrently:

```typescript
await subscriber.start(10);  // Process 10 messages concurrently
```

**Session Timeout:**

Configure session timeout to balance responsiveness and stability:

```typescript
const consumer = kafka.consumer({
  groupId: 'notification-service-group',
  sessionTimeout: 30000,     // 30 seconds
  heartbeatInterval: 3000,   // 3 seconds
});
```

### Kafka Broker Tuning

Optimize Kafka broker configuration.

**Replication:**

Configure replication settings for durability:

```yaml
config:
  default.replication.factor: 3
  min.insync.replicas: 2
  unclean.leader.election.enable: false
```

**Log Retention:**

Configure retention based on storage capacity and compliance requirements:

```yaml
config:
  log.retention.ms: 604800000      # 7 days
  log.retention.bytes: 1073741824  # 1GB per partition
  log.segment.bytes: 1073741824    # 1GB segment size
```

**Memory:**

Allocate sufficient heap memory for brokers:

```yaml
resources:
  requests:
    memory: "4Gi"
  limits:
    memory: "8Gi"
```

---

## Migration Strategy

### Phase 1: Infrastructure Setup (Week 1)

Deploy Kafka cluster and monitoring infrastructure.

**Tasks:**
- Deploy Strimzi operator
- Create Kafka cluster with 3 brokers
- Configure authentication and authorization
- Deploy Prometheus and Grafana
- Create initial topics

**Success Criteria:**
- Kafka cluster healthy with all brokers running
- Authentication working for test users
- Metrics visible in Grafana

### Phase 2: Library Integration (Week 2)

Integrate events library into existing monolith.

**Tasks:**
- Build and publish `@kinga/events` library
- Add event integration module to monolith
- Emit events from claim submission logic
- Deploy DLQ monitor
- Verify events published successfully

**Success Criteria:**
- Events published when claims submitted
- No errors in application logs
- Events visible in Kafka topics

### Phase 3: Service Extraction (Weeks 3-8)

Extract services incrementally while maintaining monolith.

**Tasks:**
- Extract notification service
- Extract fraud detection service
- Extract cost optimization service
- Migrate consumers to new services
- Implement saga pattern for workflows

**Success Criteria:**
- Services deployed and consuming events
- Monolith continues functioning
- No data loss or inconsistencies

### Phase 4: Monolith Decommission (Weeks 9-12)

Gradually reduce monolith responsibilities.

**Tasks:**
- Migrate remaining event publishers
- Route traffic to microservices
- Monitor for issues
- Decommission monolith services
- Archive monolith codebase

**Success Criteria:**
- All traffic routed to microservices
- Monolith no longer receiving requests
- System stability maintained

---

## Document Control

| Version | Date | Author | Description |
|---------|------|--------|-------------|
| 1.0 | 2026-02-11 | Tavonga Shoko | Initial implementation guide |

---

**End of Document**
