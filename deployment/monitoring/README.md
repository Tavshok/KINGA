# KINGA Monitoring Stack

Comprehensive monitoring solution for KINGA's event-driven microservices architecture using Prometheus and Grafana.

## Overview

The monitoring stack provides:

- **Prometheus**: Metrics collection and alerting
- **Grafana**: Visualization and dashboards
- **Alertmanager**: Alert routing and notification
- **Pre-configured Dashboards**: Event metrics, service health, Kafka cluster
- **Pre-configured Alerts**: Event failures, consumer lag, service health

## Architecture

```
┌─────────────────┐
│  KINGA Services │
│  (Monolith +    │
│   Microservices)│
└────────┬────────┘
         │ /metrics
         ▼
┌─────────────────┐
│   Prometheus    │
│  (Scrapes &     │
│   Stores)       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│    Grafana      │
│  (Visualizes)   │
└─────────────────┘
```

## Quick Start

### Prerequisites

- Kubernetes cluster
- kubectl configured
- Helm 3.8+
- KINGA services deployed

### Deploy Monitoring Stack

```bash
# Create monitoring namespace
kubectl create namespace monitoring

# Deploy Prometheus
kubectl apply -f prometheus-config.yaml
kubectl apply -f prometheus-deployment.yaml

# Deploy Grafana
kubectl apply -f grafana-deployment.yaml

# Create Grafana dashboards ConfigMap
kubectl create configmap grafana-dashboards \
  --from-file=grafana-dashboards.json \
  -n monitoring

# Verify deployment
kubectl get pods -n monitoring
kubectl get svc -n monitoring
```

### Access Dashboards

```bash
# Port-forward Grafana
kubectl port-forward -n monitoring svc/grafana 3000:80

# Open browser
open http://localhost:3000

# Login credentials
# Username: admin
# Password: admin123 (change in production)
```

## Dashboards

### 1. KINGA Event-Driven Architecture

**Metrics:**
- Event throughput (published/consumed)
- Event failure rate
- Consumer lag
- Event processing duration (p95)
- Dead letter queue size
- Total events processed (24h)
- Event success rate
- Active consumers

**Use Cases:**
- Monitor event flow health
- Identify processing bottlenecks
- Track consumer lag
- Investigate failed events

### 2. KINGA Services Health

**Metrics:**
- Service uptime
- CPU usage
- Memory usage
- HTTP request rate
- HTTP error rate
- HTTP response time (p95)

**Use Cases:**
- Monitor service availability
- Track resource utilization
- Identify performance issues
- Investigate errors

### 3. Kafka Cluster Health

**Metrics:**
- Active brokers
- Total topics
- Under-replicated partitions
- Offline partitions
- Messages in per second
- Bytes in per second
- Consumer group lag by topic

**Use Cases:**
- Monitor Kafka cluster health
- Track message throughput
- Identify replication issues
- Monitor consumer groups

## Alerts

### Event Processing Alerts

| Alert | Threshold | Severity | Description |
|-------|-----------|----------|-------------|
| HighEventFailureRate | >5% for 5min | Warning | Event failure rate exceeds 5% |
| CriticalEventFailureRate | >10% for 2min | Critical | Event failure rate exceeds 10% |
| HighConsumerLag | >1000 for 10min | Warning | Consumer lag exceeds 1000 messages |
| CriticalConsumerLag | >10000 for 5min | Critical | Consumer lag exceeds 10000 messages |
| MessagesInDLQ | >0 for 5min | Warning | Messages in dead letter queue |
| SlowEventProcessing | >5s p95 for 10min | Warning | Event processing is slow |

### Service Health Alerts

| Alert | Threshold | Severity | Description |
|-------|-----------|----------|-------------|
| ServiceDown | Down for 2min | Critical | Service is unavailable |
| HighCPUUsage | >80% for 10min | Warning | High CPU usage |
| HighMemoryUsage | >1.5GB for 10min | Warning | High memory usage |
| HighErrorRate | >5% for 5min | Warning | High HTTP error rate |

### Kafka Cluster Alerts

| Alert | Threshold | Severity | Description |
|-------|-----------|----------|-------------|
| KafkaBrokerDown | <3 brokers for 2min | Critical | Kafka broker is down |
| UnderReplicatedPartitions | >0 for 5min | Warning | Partitions are under-replicated |
| OfflinePartitions | >0 for 2min | Critical | Partitions are offline |

## Metrics Reference

### Event Metrics

```promql
# Total events consumed
kinga_events_consumed_total{service="notification-service"}

# Total events published
kinga_events_published_total{service="kinga-monolith"}

# Total events failed
kinga_events_failed_total{service="notification-service"}

# Event processing duration (histogram)
kinga_events_processing_duration_seconds_bucket{service="notification-service"}

# Event processing duration (p95)
histogram_quantile(0.95, rate(kinga_events_processing_duration_seconds_bucket[5m]))
```

### Service Metrics

```promql
# Service uptime
up{job="notification-service"}

# CPU usage
rate(process_cpu_seconds_total{job="notification-service"}[5m])

# Memory usage (MB)
process_resident_memory_bytes{job="notification-service"} / 1024 / 1024

# HTTP request rate
rate(http_requests_total{job="kinga-monolith"}[5m])

# HTTP error rate
rate(http_requests_total{status=~"5..",job="kinga-monolith"}[5m])
```

### Kafka Metrics

```promql
# Active brokers
kafka_brokers

# Consumer lag
kafka_consumergroup_lag{consumergroup="notification-service-group"}

# Messages in per second
rate(kafka_server_brokertopicmetrics_messagesin_total[5m])

# Under-replicated partitions
kafka_topic_partition_under_replicated_partition
```

## Alerting

### Configure Alertmanager

```bash
# Create Alertmanager configuration
kubectl apply -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: alertmanager-config
  namespace: monitoring
data:
  alertmanager.yml: |
    global:
      resolve_timeout: 5m
      slack_api_url: 'https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK'
    
    route:
      group_by: ['alertname', 'cluster', 'service']
      group_wait: 10s
      group_interval: 10s
      repeat_interval: 12h
      receiver: 'slack-notifications'
      routes:
      - match:
          severity: critical
        receiver: 'pagerduty'
    
    receivers:
    - name: 'slack-notifications'
      slack_configs:
      - channel: '#kinga-alerts'
        title: '{{ .GroupLabels.alertname }}'
        text: '{{ range .Alerts }}{{ .Annotations.description }}{{ end }}'
    
    - name: 'pagerduty'
      pagerduty_configs:
      - service_key: 'YOUR_PAGERDUTY_KEY'
EOF

# Deploy Alertmanager
kubectl apply -f alertmanager-deployment.yaml
```

### Test Alerts

```bash
# Trigger test alert
kubectl exec -it -n monitoring prometheus-0 -- \
  curl -X POST http://localhost:9090/api/v1/alerts

# View active alerts
kubectl port-forward -n monitoring svc/prometheus 9090:9090
open http://localhost:9090/alerts
```

## Troubleshooting

### Prometheus Not Scraping Targets

```bash
# Check Prometheus targets
kubectl port-forward -n monitoring svc/prometheus 9090:9090
open http://localhost:9090/targets

# Check service annotations
kubectl get pods -n kinga-services -o yaml | grep prometheus

# Verify metrics endpoint
kubectl exec -it -n kinga-services <pod-name> -- curl http://localhost:3001/metrics
```

### Grafana Dashboards Not Loading

```bash
# Check Grafana logs
kubectl logs -f -n monitoring deployment/grafana

# Verify datasource connection
kubectl exec -it -n monitoring <grafana-pod> -- \
  curl http://prometheus:9090/api/v1/query?query=up

# Recreate dashboards ConfigMap
kubectl delete configmap grafana-dashboards -n monitoring
kubectl create configmap grafana-dashboards \
  --from-file=grafana-dashboards.json \
  -n monitoring

# Restart Grafana
kubectl rollout restart deployment/grafana -n monitoring
```

### Alerts Not Firing

```bash
# Check Prometheus rules
kubectl exec -it -n monitoring prometheus-0 -- \
  promtool check rules /etc/prometheus/rules/*.yml

# View alert evaluation
kubectl port-forward -n monitoring svc/prometheus 9090:9090
open http://localhost:9090/alerts

# Check Alertmanager
kubectl logs -f -n monitoring deployment/alertmanager
```

## Performance Tuning

### Prometheus Retention

```yaml
# Increase retention period
args:
  - '--storage.tsdb.retention.time=90d'  # Default: 30d
  - '--storage.tsdb.retention.size=100GB'
```

### Prometheus Resources

```yaml
# For high-volume environments
resources:
  requests:
    memory: "8Gi"
    cpu: "4"
  limits:
    memory: "16Gi"
    cpu: "8"
```

### Scrape Interval

```yaml
# Reduce scrape interval for more granular data
global:
  scrape_interval: 10s  # Default: 15s
  evaluation_interval: 10s
```

## Security

### Secure Grafana

```bash
# Change admin password
kubectl create secret generic grafana-admin \
  --from-literal=password='<strong-password>' \
  -n monitoring \
  --dry-run=client -o yaml | kubectl apply -f -

# Restart Grafana
kubectl rollout restart deployment/grafana -n monitoring
```

### Enable TLS

```yaml
# Add TLS to Grafana service
spec:
  tls:
  - hosts:
    - grafana.kinga.ai
    secretName: grafana-tls
```

### RBAC for Prometheus

```yaml
# Restrict Prometheus access
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: prometheus
  namespace: kinga-services
rules:
- apiGroups: [""]
  resources: ["pods", "services", "endpoints"]
  verbs: ["get", "list", "watch"]
```

## Backup and Recovery

### Backup Prometheus Data

```bash
# Create snapshot
kubectl exec -it -n monitoring prometheus-0 -- \
  curl -X POST http://localhost:9090/api/v1/admin/tsdb/snapshot

# Copy snapshot
kubectl cp monitoring/prometheus-0:/prometheus/snapshots/<snapshot-name> ./prometheus-backup
```

### Backup Grafana Dashboards

```bash
# Export dashboards
kubectl get configmap grafana-dashboards -n monitoring -o yaml > grafana-dashboards-backup.yaml

# Commit to Git
git add grafana-dashboards-backup.yaml
git commit -m "Backup Grafana dashboards"
```

## Maintenance

### Update Prometheus

```bash
# Update image version
kubectl set image deployment/prometheus \
  prometheus=prom/prometheus:v2.49.0 \
  -n monitoring

# Verify update
kubectl rollout status deployment/prometheus -n monitoring
```

### Update Grafana

```bash
# Update image version
kubectl set image deployment/grafana \
  grafana=grafana/grafana:10.3.0 \
  -n monitoring

# Verify update
kubectl rollout status deployment/grafana -n monitoring
```

## Best Practices

### Metric Naming

- Use `kinga_` prefix for all KINGA metrics
- Use `_total` suffix for counters
- Use `_seconds` suffix for durations
- Use snake_case for metric names

### Dashboard Design

- Group related metrics together
- Use consistent color schemes
- Add annotations for deployments
- Set appropriate time ranges
- Use variables for filtering

### Alert Design

- Set appropriate thresholds
- Include runbook links
- Use severity levels correctly
- Avoid alert fatigue
- Test alerts regularly

## References

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
- [PromQL Cheat Sheet](https://promlabs.com/promql-cheat-sheet/)
- [Grafana Best Practices](https://grafana.com/docs/grafana/latest/best-practices/)

## Support

For issues and questions:
- GitHub Issues: [kinga-replit/issues](https://github.com/tavonga/kinga-replit/issues)
- Email: support@kinga.ai
