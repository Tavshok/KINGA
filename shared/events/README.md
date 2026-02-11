# @kinga/events - Event-Driven Architecture Library

**Author:** Tavonga Shoko  
**Version:** 1.0.0  
**License:** MIT

## Overview

The `@kinga/events` library provides a production-ready event-driven architecture implementation for the KINGA insurance claims management platform. Built on Apache Kafka, it enables reliable asynchronous communication between microservices with comprehensive support for retry logic, dead-letter queues, event versioning, and schema validation.

## Features

**Core Capabilities:**
- **Event Publishing** with automatic retries and exponential backoff
- **Event Subscription** with consumer groups for load balancing
- **Dead Letter Queue** for failed event handling
- **Event Versioning** using semantic versioning (semver)
- **Schema Validation** with Zod for runtime type safety
- **Graceful Shutdown** handling for zero-downtime deployments
- **Performance Monitoring** with built-in statistics tracking
- **Idempotency Guarantees** through Kafka producer configuration

## Architecture

The library follows a layered architecture:

```
@kinga/events
├── types/          # Base types and interfaces
├── utils/          # Kafka client and utilities
├── publisher/      # Event publishing logic
├── subscriber/     # Event consumption logic
└── schemas/        # Event schema definitions
```

## Installation

```bash
# Install from local shared directory
npm install ../../shared/events

# Or install dependencies directly
npm install kafkajs zod nanoid
```

## Configuration

### Environment Variables

The library reads Kafka configuration from environment variables:

```bash
# Required
KAFKA_BROKERS=localhost:9092,localhost:9093,localhost:9094
KAFKA_CLIENT_ID=kinga-service-name

# Optional
KAFKA_CONNECTION_TIMEOUT=10000
KAFKA_REQUEST_TIMEOUT=30000
KAFKA_LOG_LEVEL=info

# SASL Authentication (optional)
KAFKA_SASL_MECHANISM=plain
KAFKA_SASL_USERNAME=your-username
KAFKA_SASL_PASSWORD=your-password

# SSL/TLS (optional)
KAFKA_SSL=true

# Feature Toggle
KAFKA_ENABLED=true  # Set to 'false' to disable events
```

### Kafka Cluster Setup

For local development, use Docker Compose:

```yaml
version: '3.8'
services:
  zookeeper:
    image: confluentinc/cp-zookeeper:7.5.0
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181
      ZOOKEEPER_TICK_TIME: 2000

  kafka:
    image: confluentinc/cp-kafka:7.5.0
    depends_on:
      - zookeeper
    ports:
      - "9092:9092"
    environment:
      KAFKA_BROKER_ID: 1
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
```

## Usage

### Publishing Events

```typescript
import { createEventPublisher, initializeKafkaClient } from '@kinga/events';

// Initialize Kafka client
initializeKafkaClient();

// Create publisher
const publisher = createEventPublisher({
  serviceName: 'claim-intake-service',
  validateEvents: true,
});

await publisher.initialize();

// Publish event
await publisher.publish(
  'ClaimSubmitted',
  {
    claimId: 123,
    claimNumber: 'CLM-ABC123',
    claimantId: 456,
    policyNumber: 'POL-789',
    incidentDate: new Date('2026-02-10'),
    vehicleId: 101,
    damageDescription: 'Front bumper damage from collision',
  },
  {
    topic: 'claim-intake.claim.submitted',
    key: '123', // Partition key for ordering
  }
);

// Get statistics
const stats = publisher.getStats();
console.log(`Published: ${stats.published}, Failed: ${stats.failed}`);

// Graceful shutdown
await publisher.shutdown();
```

### Subscribing to Events

```typescript
import { createEventSubscriber, initializeKafkaClient } from '@kinga/events';

// Initialize Kafka client
initializeKafkaClient();

// Create subscriber
const subscriber = createEventSubscriber({
  serviceName: 'notification-service',
  maxRetries: 3,
  initialRetryDelay: 1000,
});

await subscriber.initialize({
  topics: ['claim-intake.claim.submitted', 'ai-damage.assessment.completed'],
  groupId: 'notification-service-group',
  fromBeginning: false,
});

// Register event handlers
subscriber.on('ClaimSubmitted', async (event) => {
  console.log(`Processing claim submission: ${event.payload.claimNumber}`);
  
  // Send notification to claimant
  await sendEmail(event.payload.claimantId, 'Claim Submitted', {
    claimNumber: event.payload.claimNumber,
  });
});

subscriber.on('AssessmentCompleted', async (event) => {
  console.log(`Assessment completed for claim: ${event.payload.claimId}`);
  
  // Notify insurer
  await sendEmail(event.metadata.userId, 'Assessment Complete', {
    totalCost: event.payload.totalCost,
  });
});

// Start consuming
await subscriber.start(5); // Process up to 5 messages concurrently

// Pause/resume
await subscriber.pause();
await subscriber.resume();

// Graceful shutdown
await subscriber.shutdown();
```

### Integration with Existing Services

For monolithic applications transitioning to microservices, use the event integration module:

```typescript
import { eventIntegration } from './server/events/event-integration';

// Initialize once at application startup
await eventIntegration.initialize();

// Emit events from existing business logic
async function handleClaimSubmission(claimData) {
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

## Event Schemas

All events are defined with Zod schemas for runtime validation:

```typescript
import { ClaimSubmittedEventSchema } from '@kinga/events';

// Validate event
const event = {
  eventId: 'evt_123',
  eventType: 'ClaimSubmitted',
  timestamp: new Date(),
  version: '1.0.0',
  payload: {
    claimId: 123,
    claimNumber: 'CLM-ABC123',
    // ... other fields
  },
  metadata: {
    source: 'claim-intake-service',
    correlationId: 'corr_456',
  },
};

// Throws error if invalid
ClaimSubmittedEventSchema.parse(event);
```

### Available Event Types

The library includes 20+ predefined event schemas across all KINGA services:

**Claim Intake Service:**
- `ClaimSubmitted`
- `DocumentUploaded`
- `ClaimStatusChanged`

**AI Damage Service:**
- `AssessmentStarted`
- `AssessmentCompleted`
- `DamageDetected`

**Fraud Detection Service:**
- `FraudAlertRaised`
- `FraudInvestigationCompleted`

**Physics Simulation Service:**
- `PhysicsValidationCompleted`

**Cost Optimisation Service:**
- `QuoteReceived`
- `QuoteComparisonCompleted`

**Workflow Engine Service:**
- `ApprovalRequested`
- `ApprovalDecisionMade`
- `WorkflowStateChanged`

**Fleet Risk Service:**
- `FleetRiskScoreUpdated`

**Insurer Integration Service:**
- `ExternalSystemSynced`

**Identity Access Service:**
- `UserCreated`
- `UserLoggedIn`
- `RoleAssigned`

**Notification Service:**
- `NotificationSent`

## Topic Naming Convention

Topics follow the pattern: `{service}.{entity}.{event}`

Examples:
- `claim-intake.claim.submitted`
- `ai-damage.assessment.completed`
- `fraud-detection.alert.raised`
- `workflow-engine.approval.requested`

Use the helper function:

```typescript
import { getTopicName } from '@kinga/events';

const topic = getTopicName('claim-intake', 'claim', 'submitted');
// Returns: 'claim-intake.claim.submitted'
```

## Error Handling

### Retry Logic

The library implements exponential backoff for failed event publishing and consumption:

```typescript
// Publisher retry configuration
const publisher = createEventPublisher({
  serviceName: 'my-service',
  defaultRetry: {
    maxRetries: 3,
    initialDelay: 1000,      // 1 second
    backoffMultiplier: 2,    // 2x each retry
  },
});

// Retry sequence: 1s → 2s → 4s → DLQ
```

### Dead Letter Queue

Failed events are automatically sent to the dead-letter queue after exhausting retries:

```typescript
// Monitor DLQ
const dlqSubscriber = createEventSubscriber({
  serviceName: 'dlq-monitor',
});

await dlqSubscriber.initialize({
  topics: ['kinga.dead-letter-queue'],
  groupId: 'dlq-monitor-group',
});

dlqSubscriber.on('*', async (dlqMessage) => {
  console.error('Dead letter event:', {
    originalTopic: dlqMessage.originalTopic,
    eventType: dlqMessage.event.eventType,
    error: dlqMessage.error.message,
    retryCount: dlqMessage.retryCount,
  });
  
  // Alert operations team
  await alertOps(dlqMessage);
});
```

## Event Versioning

Events use semantic versioning for backward compatibility:

```typescript
// Version 1.0.0
export const ClaimSubmittedEventSchema_v1 = DomainEventSchema.extend({
  eventType: z.literal('ClaimSubmitted'),
  version: z.literal('1.0.0'),
  payload: ClaimSubmittedPayloadSchema_v1,
});

// Version 2.0.0 (breaking change)
export const ClaimSubmittedEventSchema_v2 = DomainEventSchema.extend({
  eventType: z.literal('ClaimSubmitted'),
  version: z.literal('2.0.0'),
  payload: ClaimSubmittedPayloadSchema_v2,
});

// Version-aware handler
subscriber.on('ClaimSubmitted', async (event) => {
  if (event.version === '1.0.0') {
    // Handle v1
  } else if (event.version === '2.0.0') {
    // Handle v2
  }
});
```

## Performance Monitoring

Track event throughput and latency:

```typescript
// Publisher stats
const publisherStats = publisher.getStats();
console.log({
  published: publisherStats.published,
  failed: publisherStats.failed,
  deadLettered: publisherStats.deadLettered,
  avgProcessingTime: publisherStats.avgProcessingTime,
});

// Subscriber stats
const subscriberStats = subscriber.getStats();
console.log({
  consumed: subscriberStats.consumed,
  failed: subscriberStats.failed,
  avgProcessingTime: subscriberStats.avgProcessingTime,
});

// Reset stats
publisher.resetStats();
subscriber.resetStats();
```

## Graceful Shutdown

Ensure zero message loss during deployment:

```typescript
import { setupGracefulShutdown } from '@kinga/events';

// Setup signal handlers
setupGracefulShutdown();

// Or manual shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  
  await publisher.shutdown();
  await subscriber.shutdown();
  
  process.exit(0);
});
```

## Testing

### Unit Tests

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createEventPublisher } from '@kinga/events';

describe('EventPublisher', () => {
  let publisher: EventPublisher;

  beforeEach(async () => {
    publisher = createEventPublisher({
      serviceName: 'test-service',
    });
    await publisher.initialize();
  });

  afterEach(async () => {
    await publisher.shutdown();
  });

  it('should publish event successfully', async () => {
    const metadata = await publisher.publish(
      'ClaimSubmitted',
      { claimId: 123, claimNumber: 'CLM-TEST' },
      { topic: 'test.claim.submitted' }
    );

    expect(metadata).toBeDefined();
    expect(metadata[0].partition).toBeGreaterThanOrEqual(0);
  });

  it('should track statistics', async () => {
    await publisher.publish(
      'ClaimSubmitted',
      { claimId: 123 },
      { topic: 'test.claim.submitted' }
    );

    const stats = publisher.getStats();
    expect(stats.published).toBe(1);
    expect(stats.failed).toBe(0);
  });
});
```

### Integration Tests

```typescript
describe('Event Integration', () => {
  it('should publish and consume event end-to-end', async () => {
    const publisher = createEventPublisher({ serviceName: 'test-pub' });
    const subscriber = createEventSubscriber({ serviceName: 'test-sub' });

    await publisher.initialize();
    await subscriber.initialize({
      topics: ['test.claim.submitted'],
      groupId: 'test-group',
    });

    let receivedEvent: any;
    subscriber.on('ClaimSubmitted', async (event) => {
      receivedEvent = event;
    });

    await subscriber.start();

    await publisher.publish(
      'ClaimSubmitted',
      { claimId: 123, claimNumber: 'CLM-TEST' },
      { topic: 'test.claim.submitted' }
    );

    // Wait for consumption
    await new Promise((resolve) => setTimeout(resolve, 2000));

    expect(receivedEvent).toBeDefined();
    expect(receivedEvent.payload.claimId).toBe(123);

    await publisher.shutdown();
    await subscriber.shutdown();
  });
});
```

## Production Deployment

### Kubernetes Configuration

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: claim-intake-service
spec:
  replicas: 3
  template:
    spec:
      containers:
      - name: app
        image: kinga/claim-intake-service:latest
        env:
        - name: KAFKA_BROKERS
          value: "kafka-0.kafka-headless:9092,kafka-1.kafka-headless:9092,kafka-2.kafka-headless:9092"
        - name: KAFKA_CLIENT_ID
          value: "claim-intake-service"
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
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
```

### Monitoring with Prometheus

```yaml
# ServiceMonitor for Prometheus Operator
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: kinga-events-metrics
spec:
  selector:
    matchLabels:
      app: kinga-service
  endpoints:
  - port: metrics
    interval: 30s
    path: /metrics
```

## Troubleshooting

### Common Issues

**Issue:** Events not being published

```bash
# Check Kafka connectivity
telnet localhost 9092

# Verify topics exist
kafka-topics --bootstrap-server localhost:9092 --list

# Check consumer lag
kafka-consumer-groups --bootstrap-server localhost:9092 --describe --group my-group
```

**Issue:** High DLQ volume

```typescript
// Increase retry attempts
const publisher = createEventPublisher({
  serviceName: 'my-service',
  defaultRetry: {
    maxRetries: 5,  // Increase from 3
    initialDelay: 2000,
    backoffMultiplier: 2,
  },
});
```

**Issue:** Slow event processing

```typescript
// Increase concurrency
await subscriber.start(10);  // Process 10 messages concurrently

// Or scale horizontally by adding more consumer instances
// with the same groupId
```

## Best Practices

**Event Design:**
- Keep events small and focused (single responsibility)
- Include all necessary context in the payload
- Use correlation IDs to trace related events
- Version events from the start

**Performance:**
- Use partition keys for ordering guarantees
- Batch related events when possible
- Monitor consumer lag regularly
- Scale consumers horizontally for high throughput

**Reliability:**
- Always implement idempotent event handlers
- Handle duplicate events gracefully
- Monitor dead-letter queue
- Set appropriate retry policies

**Security:**
- Use SASL authentication in production
- Enable SSL/TLS for encryption
- Rotate credentials regularly
- Implement fine-grained ACLs

## Contributing

Contributions are welcome. Please follow these guidelines:

1. Write comprehensive tests for new features
2. Update documentation for API changes
3. Follow TypeScript best practices
4. Ensure zero TypeScript errors
5. Add JSDoc comments for public APIs

## License

MIT License - Copyright (c) 2026 Tavonga Shoko

## Support

For issues and questions:
- GitHub Issues: [kinga-replit/issues](https://github.com/tavonga/kinga-replit/issues)
- Email: [email protected]
- Documentation: [docs.kinga.ai/events](https://docs.kinga.ai/events)

---

**Version History:**

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-02-11 | Initial release with publisher, subscriber, schemas, and DLQ support |
