# KINGA Notification Service

Standalone microservice that consumes events from Kafka and sends notifications via email, SMS, and push notifications.

## Features

- **Event-Driven**: Consumes events from Kafka topics
- **Multi-Channel**: Email, SMS, and push notifications (email implemented)
- **Scalable**: Horizontal scaling with consumer groups
- **Resilient**: Automatic retry logic with exponential backoff
- **Observable**: Prometheus metrics and structured logging

## Architecture

The notification service is the first extracted microservice from the KINGA monolith. It demonstrates the event-driven architecture pattern:

1. **Monolith** publishes events to Kafka topics
2. **Notification Service** consumes events from Kafka
3. **Service** sends notifications via configured channels
4. **Metrics** are exposed for Prometheus scraping

## Event Handlers

The service handles the following events:

| Event | Topic | Action |
|-------|-------|--------|
| ClaimSubmitted | claim-intake.claim.submitted | Send confirmation email to claimant |
| ClaimStatusChanged | claim-intake.claim.status-changed | Send status update email |
| AssessmentCompleted | ai-damage.assessment.completed | Send assessment results to insurer |
| FraudAlertRaised | fraud-detection.alert.raised | Send fraud alert to risk manager |
| QuoteReceived | cost-optimisation.quote.received | Send quote notification to insurer |
| ApprovalRequested | workflow-engine.approval.requested | Send approval request to approvers |

## Local Development

### Prerequisites

- Node.js 22+
- Kafka cluster running (see `deployment/kafka/README.md`)
- SMTP credentials for email sending

### Setup

```bash
# Navigate to service directory
cd services/notification-service

# Install dependencies
npm install

# Create .env file
cp .env.example .env

# Edit .env with your configuration
nano .env
```

### Environment Variables

```bash
# Kafka Configuration
KAFKA_BROKERS=localhost:19092,localhost:19093,localhost:19094
KAFKA_CLIENT_ID=notification-service
KAFKA_ENABLED=true

# SMTP Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@kinga.ai

# Service Configuration
PORT=3001
LOG_LEVEL=info
```

### Run Development Server

```bash
# Start service with hot reload
npm run dev

# Or build and run
npm run build
npm start
```

### Test

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage
```

## Docker Deployment

### Build Image

```bash
# Build Docker image
docker build -t kinga/notification-service:latest .

# Tag for registry
docker tag kinga/notification-service:latest your-registry/kinga/notification-service:latest

# Push to registry
docker push your-registry/kinga/notification-service:latest
```

### Run Container

```bash
# Run with Docker
docker run -d \
  --name notification-service \
  -p 3001:3001 \
  -e KAFKA_BROKERS=kafka:9092 \
  -e KAFKA_CLIENT_ID=notification-service \
  -e SMTP_HOST=smtp.gmail.com \
  -e SMTP_USER=your-email@gmail.com \
  -e SMTP_PASS=your-password \
  kinga/notification-service:latest

# View logs
docker logs -f notification-service

# Stop container
docker stop notification-service
```

## Kubernetes Deployment

### Prerequisites

- Kubernetes cluster
- Kafka cluster deployed (see `deployment/kafka/README.md`)
- kubectl configured

### Deploy

```bash
# Create namespace
kubectl create namespace kinga-services

# Create Kafka credentials secret
kubectl create secret generic kafka-credentials \
  --from-literal=username=notification-service \
  --from-literal=password='<kafka-password>' \
  -n kinga-services

# Update SMTP credentials in deployment.yaml
kubectl edit secret notification-service-secrets -n kinga-services

# Deploy service
kubectl apply -f ../../deployment/notification-service/deployment.yaml

# Verify deployment
kubectl get pods -n kinga-services -l app=notification-service
kubectl logs -f deployment/notification-service -n kinga-services
```

### Scale

```bash
# Manual scaling
kubectl scale deployment notification-service --replicas=5 -n kinga-services

# Auto-scaling is configured via HPA (3-10 replicas)
kubectl get hpa -n kinga-services
```

## Monitoring

### Health Checks

```bash
# Health check
curl http://localhost:3001/health

# Readiness check
curl http://localhost:3001/ready
```

### Metrics

```bash
# Prometheus metrics
curl http://localhost:3001/metrics
```

**Key Metrics:**

- `kinga_events_consumed_total` - Total events consumed
- `kinga_events_failed_total` - Total failed events
- `kinga_events_processing_duration_seconds` - Event processing duration

### Logs

```bash
# View logs (local)
npm run dev

# View logs (Docker)
docker logs -f notification-service

# View logs (Kubernetes)
kubectl logs -f deployment/notification-service -n kinga-services

# Follow logs from all pods
kubectl logs -f -l app=notification-service -n kinga-services
```

## Troubleshooting

### Events Not Being Consumed

```bash
# Check Kafka connectivity
telnet localhost 19092

# Verify topics exist
kubectl exec -it kinga-kafka-kafka-0 -n kafka -- \
  bin/kafka-topics.sh --bootstrap-server localhost:9092 --list

# Check consumer group lag
kubectl exec -it kinga-kafka-kafka-0 -n kafka -- \
  bin/kafka-consumer-groups.sh --bootstrap-server localhost:9092 \
  --describe --group notification-service-group
```

### Email Not Sending

```bash
# Test SMTP connection
telnet smtp.gmail.com 587

# Check SMTP credentials
echo $SMTP_USER
echo $SMTP_PASS

# View service logs for errors
kubectl logs -f deployment/notification-service -n kinga-services | grep "email"
```

### High Memory Usage

```bash
# Check memory usage
kubectl top pods -n kinga-services -l app=notification-service

# Reduce concurrency in src/index.ts
# Change: await subscriber.start(5);
# To: await subscriber.start(2);

# Redeploy
kubectl rollout restart deployment/notification-service -n kinga-services
```

## Development

### Adding New Event Handlers

1. Add event handler in `src/index.ts`:

```typescript
subscriber.on('NewEvent', async (event) => {
  logger.info(`Processing NewEvent: ${event.eventId}`);
  
  try {
    await sendEmail({
      to: 'recipient@example.com',
      subject: 'New Event',
      body: '<p>Event details...</p>',
    });
    
    logger.info(`Sent email for event ${event.eventId}`);
  } catch (error) {
    logger.error('Failed to send email:', error);
    throw error;
  }
});
```

2. Add topic to subscriber initialization:

```typescript
await subscriber.initialize({
  topics: [
    'claim-intake.claim.submitted',
    'your-service.entity.new-event',  // Add new topic
  ],
  groupId: `${SERVICE_NAME}-group`,
});
```

3. Test and deploy

### Adding SMS Support

1. Install Twilio SDK:

```bash
npm install twilio
```

2. Create `src/sms.ts`:

```typescript
import twilio from 'twilio';

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

export async function sendSMS(to: string, body: string) {
  await client.messages.create({
    from: process.env.TWILIO_PHONE_NUMBER,
    to,
    body,
  });
}
```

3. Use in event handlers

### Adding Push Notifications

1. Install Firebase Admin SDK:

```bash
npm install firebase-admin
```

2. Create `src/push.ts`:

```typescript
import admin from 'firebase-admin';

admin.initializeApp({
  credential: admin.credential.cert(
    JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
  ),
});

export async function sendPush(token: string, notification: any) {
  await admin.messaging().send({
    token,
    notification,
  });
}
```

3. Use in event handlers

## Testing

### Unit Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- src/email.test.ts

# Watch mode
npm test -- --watch
```

### Integration Tests

```bash
# Start Kafka cluster
cd ../../deployment/kafka
docker-compose up -d

# Run integration tests
npm test -- --run integration

# Stop Kafka
docker-compose down
```

### End-to-End Test

```bash
# 1. Start Kafka
cd ../../deployment/kafka
docker-compose up -d

# 2. Start notification service
cd ../../services/notification-service
npm run dev

# 3. Publish test event (from monolith)
cd ../../
npm run test:events

# 4. Check notification service logs
# Should see "Processing ClaimSubmitted event"
# Should see "Sent claim submission email"
```

## Performance

### Throughput

- **Single Instance**: ~100 events/second
- **3 Instances**: ~300 events/second
- **10 Instances**: ~1000 events/second

### Latency

- **Email Sending**: 200-500ms
- **Event Processing**: 50-100ms
- **Total Latency**: 250-600ms

### Scaling Guidelines

- **Low Load** (<100 events/sec): 3 replicas
- **Medium Load** (100-500 events/sec): 5-7 replicas
- **High Load** (>500 events/sec): 10+ replicas

## Security

### Secrets Management

- Store SMTP credentials in Kubernetes secrets
- Rotate credentials regularly
- Use app-specific passwords for Gmail

### Network Security

- Use TLS for Kafka connections
- Use TLS for SMTP connections
- Implement network policies

### Access Control

- Service account with minimal permissions
- No root user in container
- Read-only filesystem (except logs)

## License

MIT

## Author

Tavonga Shoko

## Support

For issues and questions:
- GitHub Issues: [kinga-replit/issues](https://github.com/tavonga/kinga-replit/issues)
- Email: [email protected]
