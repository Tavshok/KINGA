# KINGA Kafka Cluster Deployment

This directory contains deployment manifests for the KINGA Kafka cluster.

## Local Development (Docker Compose)

For local development, use Docker Compose to run a 3-broker Kafka cluster:

```bash
# Start Kafka cluster
cd deployment/kafka
docker-compose up -d

# Verify cluster is running
docker-compose ps

# Access Kafka UI
open http://localhost:8080

# View logs
docker-compose logs -f kafka-1

# Stop cluster
docker-compose down

# Stop and remove volumes (clean slate)
docker-compose down -v
```

**Kafka Brokers:**
- Broker 1: `localhost:19092`
- Broker 2: `localhost:19093`
- Broker 3: `localhost:19094`

**Kafka UI:** http://localhost:8080

**Environment Variables for Local Development:**

```bash
export KAFKA_BROKERS=localhost:19092,localhost:19093,localhost:19094
export KAFKA_CLIENT_ID=kinga-monolith
export KAFKA_ENABLED=true
```

## Production Deployment (Kubernetes + Strimzi)

### Prerequisites

1. Kubernetes cluster (1.24+)
2. kubectl configured
3. Helm 3.8+
4. StorageClass named `fast-ssd` for persistent volumes

### Step 1: Install Strimzi Operator

```bash
# Add Strimzi Helm repository
helm repo add strimzi https://strimzi.io/charts/
helm repo update

# Create kafka namespace
kubectl create namespace kafka

# Install Strimzi operator
helm install strimzi-kafka-operator strimzi/strimzi-kafka-operator \
  --namespace kafka \
  --set watchNamespaces="{kafka}"

# Verify operator is running
kubectl get pods -n kafka
```

### Step 2: Deploy Kafka Cluster

```bash
# Apply Kafka cluster manifest
kubectl apply -f kafka-cluster.yaml

# Wait for Kafka to be ready (this may take 5-10 minutes)
kubectl wait kafka/kinga-kafka --for=condition=Ready --timeout=600s -n kafka

# Verify all components are running
kubectl get kafka -n kafka
kubectl get kafkatopic -n kafka
kubectl get kafkauser -n kafka
kubectl get pods -n kafka
```

### Step 3: Extract Kafka Credentials

```bash
# Get kinga-monolith password
kubectl get secret kinga-monolith -n kafka -o jsonpath='{.data.password}' | base64 -d
echo

# Get notification-service password
kubectl get secret notification-service -n kafka -o jsonpath='{.data.password}' | base64 -d
echo

# Save credentials to Kubernetes secrets in application namespace
kubectl create secret generic kafka-credentials \
  --from-literal=username=kinga-monolith \
  --from-literal=password='<password-from-above>' \
  -n kinga-services
```

### Step 4: Configure Services

Update service environment variables:

```yaml
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
```

### Step 5: Verify Kafka Cluster

```bash
# Check broker status
kubectl get kafka kinga-kafka -n kafka -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}'

# List topics
kubectl get kafkatopics -n kafka

# Check topic details
kubectl describe kafkatopic claim-intake.claim.submitted -n kafka

# View Kafka logs
kubectl logs -n kafka kinga-kafka-kafka-0 -c kafka

# Port-forward to access Kafka directly
kubectl port-forward -n kafka svc/kinga-kafka-kafka-bootstrap 9092:9092
```

## Monitoring

### Kafka Metrics

Kafka exposes JMX metrics via Prometheus exporter:

```bash
# Port-forward to Kafka metrics
kubectl port-forward -n kafka kinga-kafka-kafka-0 9404:9404

# Scrape metrics
curl http://localhost:9404/metrics
```

### Kafka UI (Development)

For development, you can deploy Kafka UI to Kubernetes:

```bash
kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: kafka-ui
  namespace: kafka
spec:
  replicas: 1
  selector:
    matchLabels:
      app: kafka-ui
  template:
    metadata:
      labels:
        app: kafka-ui
    spec:
      containers:
      - name: kafka-ui
        image: provectuslabs/kafka-ui:latest
        ports:
        - containerPort: 8080
        env:
        - name: KAFKA_CLUSTERS_0_NAME
          value: kinga-kafka
        - name: KAFKA_CLUSTERS_0_BOOTSTRAPSERVERS
          value: kinga-kafka-kafka-bootstrap:9092
---
apiVersion: v1
kind: Service
metadata:
  name: kafka-ui
  namespace: kafka
spec:
  selector:
    app: kafka-ui
  ports:
  - port: 80
    targetPort: 8080
  type: LoadBalancer
EOF

# Access Kafka UI
kubectl port-forward -n kafka svc/kafka-ui 8080:80
open http://localhost:8080
```

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

### Topic Creation Failures

```bash
# Check topic operator logs
kubectl logs -n kafka deployment/kinga-kafka-entity-operator -c topic-operator

# Manually create topic
kubectl apply -f - <<EOF
apiVersion: kafka.strimzi.io/v1beta2
kind: KafkaTopic
metadata:
  name: test-topic
  namespace: kafka
  labels:
    strimzi.io/cluster: kinga-kafka
spec:
  partitions: 3
  replicas: 3
EOF
```

### Authentication Issues

```bash
# Verify user exists
kubectl get kafkauser -n kafka

# Check user secret
kubectl get secret kinga-monolith -n kafka -o yaml

# Test connection with kafkacat
kafkacat -b localhost:19092 -L
```

## Scaling

### Scale Kafka Brokers

```bash
# Edit Kafka resource
kubectl edit kafka kinga-kafka -n kafka

# Change replicas from 3 to 5
spec:
  kafka:
    replicas: 5

# Wait for new brokers to join
kubectl get pods -n kafka -w
```

### Scale Topic Partitions

```bash
# Edit topic
kubectl edit kafkatopic claim-intake.claim.submitted -n kafka

# Increase partitions from 3 to 6
spec:
  partitions: 6

# Note: Partitions can only be increased, not decreased
```

## Backup and Recovery

### Backup Kafka Configuration

```bash
# Export all Kafka resources
kubectl get kafka,kafkatopic,kafkauser -n kafka -o yaml > kafka-backup.yaml

# Commit to Git
git add kafka-backup.yaml
git commit -m "Backup Kafka configuration"
```

### Restore from Backup

```bash
# Apply backup
kubectl apply -f kafka-backup.yaml

# Verify restoration
kubectl get kafka,kafkatopic,kafkauser -n kafka
```

## Maintenance

### Update Kafka Version

```bash
# Edit Kafka resource
kubectl edit kafka kinga-kafka -n kafka

# Update version
spec:
  kafka:
    version: 3.6.0

# Strimzi will perform rolling update
kubectl get pods -n kafka -w
```

### Rotate Credentials

```bash
# Delete user to trigger password regeneration
kubectl delete kafkauser kinga-monolith -n kafka

# Recreate user
kubectl apply -f kafka-cluster.yaml

# Extract new password
kubectl get secret kinga-monolith -n kafka -o jsonpath='{.data.password}' | base64 -d

# Update application secrets
kubectl create secret generic kafka-credentials \
  --from-literal=username=kinga-monolith \
  --from-literal=password='<new-password>' \
  --dry-run=client -o yaml | kubectl apply -n kinga-services -f -

# Restart applications
kubectl rollout restart deployment -n kinga-services
```

## Performance Tuning

### Increase Throughput

```yaml
spec:
  kafka:
    config:
      # Increase batch size
      batch.size: 32768
      # Increase buffer memory
      buffer.memory: 67108864
      # Increase network threads
      num.network.threads: 16
      num.io.threads: 16
```

### Reduce Latency

```yaml
spec:
  kafka:
    config:
      # Reduce linger time
      linger.ms: 0
      # Reduce batch size
      batch.size: 1024
      # Increase replication
      min.insync.replicas: 3
```

## Security

### Enable TLS for All Listeners

```yaml
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

### Enable mTLS

```yaml
spec:
  kafka:
    listeners:
      - name: tls
        port: 9093
        type: internal
        tls: true
        authentication:
          type: tls
```

### Network Policies

```bash
kubectl apply -f - <<EOF
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: kafka-access
  namespace: kinga-services
spec:
  podSelector:
    matchLabels:
      app: kinga-service
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
EOF
```

## References

- [Strimzi Documentation](https://strimzi.io/docs/operators/latest/overview.html)
- [Apache Kafka Documentation](https://kafka.apache.org/documentation/)
- [Kafka Best Practices](https://kafka.apache.org/documentation/#bestpractices)
