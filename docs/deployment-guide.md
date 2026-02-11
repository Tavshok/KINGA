# KINGA Deployment Guide

Complete guide for deploying KINGA's event-driven microservices architecture.

**Author:** Tavonga Shoko  
**Version:** 1.0.0  
**Date:** February 11, 2026

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Local Development Setup](#local-development-setup)
4. [Production Deployment](#production-deployment)
5. [Monitoring Setup](#monitoring-setup)
6. [Testing](#testing)
7. [Troubleshooting](#troubleshooting)

---

## Overview

This guide covers the deployment of:

- **Kafka Cluster** (3-broker setup with Strimzi)
- **Notification Service** (first extracted microservice)
- **Monitoring Stack** (Prometheus + Grafana)
- **KINGA Monolith** (with event publishing)

### Architecture

```
┌─────────────────┐
│  KINGA Monolith │
│  (Event Source) │
└────────┬────────┘
         │ publishes
         ▼
┌─────────────────┐
│  Kafka Cluster  │
│  (Event Bus)    │
└────────┬────────┘
         │ consumes
         ▼
┌─────────────────┐
│  Notification   │
│  Service        │
└─────────────────┘

         ▲
         │ scrapes
┌─────────────────┐
│  Prometheus     │
│  + Grafana      │
└─────────────────┘
```

---

## Prerequisites

### Local Development

- **Docker** 20.10+
- **Docker Compose** 1.29+
- **Node.js** 22+
- **pnpm** 8+

### Production Deployment

- **Kubernetes** 1.24+
- **kubectl** configured
- **Helm** 3.8+
- **StorageClass** `fast-ssd` available
- **Domain** (optional, for ingress)

---

## Local Development Setup

### Step 1: Start Kafka Cluster

```bash
# Navigate to Kafka deployment directory
cd deployment/kafka

# Start 3-broker Kafka cluster
docker-compose up -d

# Verify cluster is running
docker-compose ps

# Check Kafka UI
open http://localhost:8080
```

**Kafka Brokers:**
- `localhost:19092` (broker 1)
- `localhost:19093` (broker 2)
- `localhost:19094` (broker 3)

### Step 2: Configure Environment Variables

```bash
# Create .env file in project root
cat > .env <<EOF
# Kafka Configuration
KAFKA_BROKERS=localhost:19092,localhost:19093,localhost:19094
KAFKA_CLIENT_ID=kinga-monolith
KAFKA_ENABLED=true

# SMTP Configuration (for notification service)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@kinga.ai
EOF
```

### Step 3: Start KINGA Monolith

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Verify server is running
curl http://localhost:3000/health
```

### Step 4: Start Notification Service

```bash
# Navigate to notification service
cd services/notification-service

# Install dependencies
npm install

# Create .env file
cp ../../.env .env

# Start service
npm run dev

# Verify service is running
curl http://localhost:3001/health
```

### Step 5: Test End-to-End Flow

```bash
# Run E2E tests
cd ../..
pnpm test tests/e2e-event-flow.test.ts

# Or manually test by submitting a claim
curl -X POST http://localhost:3000/api/trpc/claims.submit \
  -H "Content-Type: application/json" \
  -d '{
    "claimantId": "user-123",
    "policyNumber": "POL-123456",
    "incidentDate": "2026-02-10",
    "damageDescription": "Test damage"
  }'

# Check notification service logs
cd services/notification-service
npm run dev
# Should see: "Processing ClaimSubmitted event"
# Should see: "Sent claim submission email"
```

---

## Production Deployment

### Step 1: Create Namespaces

```bash
# Create Kubernetes namespaces
kubectl create namespace kafka
kubectl create namespace kinga-services
kubectl create namespace monitoring
```

### Step 2: Deploy Kafka Cluster

```bash
# Install Strimzi operator
helm repo add strimzi https://strimzi.io/charts/
helm repo update

helm install strimzi-kafka-operator strimzi/strimzi-kafka-operator \
  --namespace kafka \
  --set watchNamespaces="{kafka}"

# Wait for operator to be ready
kubectl wait deployment/strimzi-cluster-operator \
  --for=condition=Available \
  --timeout=300s \
  -n kafka

# Deploy Kafka cluster
kubectl apply -f deployment/kafka/kafka-cluster.yaml

# Wait for Kafka to be ready (5-10 minutes)
kubectl wait kafka/kinga-kafka \
  --for=condition=Ready \
  --timeout=600s \
  -n kafka

# Verify deployment
kubectl get kafka -n kafka
kubectl get kafkatopic -n kafka
kubectl get kafkauser -n kafka
```

### Step 3: Extract Kafka Credentials

```bash
# Get kinga-monolith password
MONOLITH_PASSWORD=$(kubectl get secret kinga-monolith -n kafka \
  -o jsonpath='{.data.password}' | base64 -d)

echo "Monolith Password: $MONOLITH_PASSWORD"

# Get notification-service password
NOTIFICATION_PASSWORD=$(kubectl get secret notification-service -n kafka \
  -o jsonpath='{.data.password}' | base64 -d)

echo "Notification Password: $NOTIFICATION_PASSWORD"

# Create secrets in kinga-services namespace
kubectl create secret generic kafka-credentials \
  --from-literal=username=kinga-monolith \
  --from-literal=password="$MONOLITH_PASSWORD" \
  -n kinga-services

kubectl create secret generic notification-kafka-credentials \
  --from-literal=username=notification-service \
  --from-literal=password="$NOTIFICATION_PASSWORD" \
  -n kinga-services
```

### Step 4: Deploy KINGA Monolith

```bash
# Update monolith deployment with Kafka config
kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: kinga-monolith
  namespace: kinga-services
spec:
  replicas: 3
  selector:
    matchLabels:
      app: kinga-monolith
  template:
    metadata:
      labels:
        app: kinga-monolith
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "3000"
        prometheus.io/path: "/api/metrics"
    spec:
      containers:
      - name: kinga-monolith
        image: your-registry/kinga-monolith:latest
        ports:
        - containerPort: 3000
        env:
        - name: KAFKA_BROKERS
          value: "kinga-kafka-kafka-bootstrap.kafka:9093"
        - name: KAFKA_CLIENT_ID
          value: "kinga-monolith"
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
EOF

# Verify deployment
kubectl get pods -n kinga-services -l app=kinga-monolith
kubectl logs -f deployment/kinga-monolith -n kinga-services
```

### Step 5: Deploy Notification Service

```bash
# Update SMTP credentials
kubectl create secret generic notification-service-secrets \
  --from-literal=SMTP_USER=your-email@gmail.com \
  --from-literal=SMTP_PASS=your-app-password \
  -n kinga-services

# Deploy notification service
kubectl apply -f deployment/notification-service/deployment.yaml

# Verify deployment
kubectl get pods -n kinga-services -l app=notification-service
kubectl logs -f deployment/notification-service -n kinga-services
```

### Step 6: Deploy Monitoring Stack

```bash
# Deploy Prometheus
kubectl apply -f deployment/monitoring/prometheus-config.yaml
kubectl apply -f deployment/monitoring/prometheus-deployment.yaml

# Wait for Prometheus to be ready
kubectl wait deployment/prometheus \
  --for=condition=Available \
  --timeout=300s \
  -n monitoring

# Create Grafana dashboards ConfigMap
kubectl create configmap grafana-dashboards \
  --from-file=deployment/monitoring/grafana-dashboards.json \
  -n monitoring

# Deploy Grafana
kubectl apply -f deployment/monitoring/grafana-deployment.yaml

# Wait for Grafana to be ready
kubectl wait deployment/grafana \
  --for=condition=Available \
  --timeout=300s \
  -n monitoring

# Get Grafana URL
kubectl get svc grafana -n monitoring
```

---

## Monitoring Setup

### Access Grafana

```bash
# Port-forward Grafana
kubectl port-forward -n monitoring svc/grafana 3000:80

# Open browser
open http://localhost:3000

# Login
# Username: admin
# Password: admin123 (change immediately)
```

### Import Dashboards

1. Navigate to **Dashboards** → **Import**
2. Upload `deployment/monitoring/grafana-dashboards.json`
3. Select **Prometheus** as datasource
4. Click **Import**

### Verify Metrics

```bash
# Check Prometheus targets
kubectl port-forward -n monitoring svc/prometheus 9090:9090
open http://localhost:9090/targets

# Verify all targets are UP:
# - kinga-monolith
# - notification-service
# - kafka brokers
```

### Configure Alerts

```bash
# View active alerts
open http://localhost:9090/alerts

# Configure Alertmanager (optional)
kubectl apply -f deployment/monitoring/alertmanager-config.yaml
kubectl apply -f deployment/monitoring/alertmanager-deployment.yaml
```

---

## Testing

### Unit Tests

```bash
# Run all tests
pnpm test

# Run specific test suite
pnpm test server/assessment-processor.test.ts

# Run with coverage
pnpm test:coverage
```

### Integration Tests

```bash
# Start Kafka cluster
cd deployment/kafka
docker-compose up -d

# Run integration tests
cd ../..
pnpm test tests/e2e-event-flow.test.ts

# Stop Kafka
cd deployment/kafka
docker-compose down
```

### End-to-End Test

```bash
# 1. Ensure all services are running
kubectl get pods -n kinga-services
kubectl get pods -n kafka
kubectl get pods -n monitoring

# 2. Submit a test claim
kubectl exec -it -n kinga-services deployment/kinga-monolith -- \
  curl -X POST http://localhost:3000/api/trpc/claims.submit \
  -H "Content-Type: application/json" \
  -d '{"claimantId":"test-user","policyNumber":"TEST-001"}'

# 3. Verify event was published
kubectl exec -it -n kafka kinga-kafka-kafka-0 -- \
  bin/kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic claim-intake.claim.submitted \
  --from-beginning \
  --max-messages 1

# 4. Verify notification service consumed event
kubectl logs -f -n kinga-services deployment/notification-service | grep "ClaimSubmitted"

# 5. Check metrics in Grafana
open http://localhost:3000/d/kinga-events
```

---

## Troubleshooting

### Kafka Not Starting

```bash
# Check operator logs
kubectl logs -n kafka deployment/strimzi-cluster-operator

# Check Kafka pod logs
kubectl logs -n kafka kinga-kafka-kafka-0 -c kafka

# Check Zookeeper logs
kubectl logs -n kafka kinga-kafka-zookeeper-0

# Describe Kafka resource
kubectl describe kafka kinga-kafka -n kafka
```

### Events Not Being Consumed

```bash
# Check consumer group lag
kubectl exec -it -n kafka kinga-kafka-kafka-0 -- \
  bin/kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 \
  --describe \
  --group notification-service-group

# Check notification service logs
kubectl logs -f -n kinga-services deployment/notification-service

# Verify topics exist
kubectl get kafkatopics -n kafka
```

### Notification Service Not Sending Emails

```bash
# Check SMTP credentials
kubectl get secret notification-service-secrets -n kinga-services -o yaml

# Test SMTP connection
kubectl exec -it -n kinga-services deployment/notification-service -- \
  telnet smtp.gmail.com 587

# Check service logs for errors
kubectl logs -f -n kinga-services deployment/notification-service | grep "email"
```

### Metrics Not Showing in Grafana

```bash
# Check Prometheus targets
kubectl port-forward -n monitoring svc/prometheus 9090:9090
open http://localhost:9090/targets

# Verify service annotations
kubectl get pods -n kinga-services -o yaml | grep prometheus

# Check Grafana datasource
kubectl exec -it -n monitoring deployment/grafana -- \
  curl http://prometheus:9090/api/v1/query?query=up

# Restart Grafana
kubectl rollout restart deployment/grafana -n monitoring
```

---

## Production Checklist

### Security

- [ ] Change Grafana admin password
- [ ] Rotate Kafka user credentials
- [ ] Enable TLS for all services
- [ ] Configure network policies
- [ ] Enable RBAC
- [ ] Scan images for vulnerabilities

### Performance

- [ ] Configure resource limits
- [ ] Enable horizontal pod autoscaling
- [ ] Configure pod disruption budgets
- [ ] Optimize Kafka partition count
- [ ] Configure consumer concurrency

### Monitoring

- [ ] Configure Alertmanager
- [ ] Set up PagerDuty/Slack integration
- [ ] Configure alert thresholds
- [ ] Test alert routing
- [ ] Set up log aggregation

### Backup

- [ ] Configure Prometheus retention
- [ ] Backup Grafana dashboards
- [ ] Backup Kafka topics (optional)
- [ ] Document recovery procedures

### Documentation

- [ ] Update runbooks
- [ ] Document incident response
- [ ] Create architecture diagrams
- [ ] Document API endpoints
- [ ] Create user guides

---

## Next Steps

1. **Extract Additional Microservices**
   - AI Damage Service
   - Fraud Detection Service
   - Cost Optimization Service

2. **Implement Advanced Features**
   - Event sourcing
   - CQRS pattern
   - Saga orchestration
   - Circuit breakers

3. **Enhance Monitoring**
   - Distributed tracing (Jaeger)
   - Log aggregation (ELK Stack)
   - APM (Application Performance Monitoring)

4. **Improve Security**
   - mTLS between services
   - OAuth2 for service-to-service auth
   - Secrets management (Vault)

---

## Support

For issues and questions:
- **GitHub Issues**: [kinga-replit/issues](https://github.com/tavonga/kinga-replit/issues)
- **Email**: support@kinga.ai
- **Documentation**: [docs.kinga.ai](https://docs.kinga.ai)

---

**Document Version:** 1.0.0  
**Last Updated:** February 11, 2026  
**Author:** Tavonga Shoko
