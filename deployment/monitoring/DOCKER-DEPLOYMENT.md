# KINGA Monitoring Stack - Docker Deployment

Local development deployment of Prometheus and Grafana using Docker Compose.

## Prerequisites

- Docker Engine 20.10+
- Docker Compose v2.0+
- KINGA application running on localhost:3000

## Quick Start

```bash
# Navigate to monitoring directory
cd /home/ubuntu/kinga-replit/deployment/monitoring

# Start monitoring stack
docker-compose up -d

# Verify containers are running
docker-compose ps

# View logs
docker-compose logs -f
```

## Access Dashboards

### Prometheus
- URL: http://localhost:9090
- Metrics: http://localhost:9090/metrics
- Targets: http://localhost:9090/targets
- Alerts: http://localhost:9090/alerts

### Grafana
- URL: http://localhost:3001
- Username: `admin`
- Password: `admin123`
- Dashboards: Pre-configured KINGA dashboard available

### Alertmanager
- URL: http://localhost:9093
- Alerts: http://localhost:9093/#/alerts

## Configuration

### Prometheus

Edit `prometheus.yml` to configure:
- Scrape intervals
- Target endpoints
- Alert rules

Edit `alert-rules.yml` to configure:
- Alert thresholds
- Alert conditions
- Severity levels

### Grafana

Dashboards are auto-provisioned from `grafana-dashboards.json`.

To add custom dashboards:
1. Create dashboard in Grafana UI
2. Export JSON
3. Place in `grafana-provisioning/dashboards/`
4. Restart Grafana: `docker-compose restart grafana`

### Alertmanager

Edit `alertmanager.yml` to configure:
- Notification channels
- Routing rules
- Inhibition rules

## Monitoring Endpoints

The KINGA application must expose a `/metrics` endpoint for Prometheus scraping.

### Required Metrics

**HTTP Metrics:**
- `http_requests_total{method, path, status}` - Counter
- `http_request_duration_ms_bucket{method, path}` - Histogram

**Database Metrics:**
- `db_query_duration_ms_bucket{operation}` - Histogram
- `db_connections_active` - Gauge
- `db_connections_idle` - Gauge

**Event Metrics:**
- `events_published_total{topic}` - Counter
- `events_consumed_total{topic, consumer_group}` - Counter
- `events_failed_total{topic, reason}` - Counter
- `kafka_consumer_lag{topic, consumer_group}` - Gauge
- `dlq_messages_total{topic}` - Gauge

**Business Metrics:**
- `claims_created_total` - Counter
- `claims_approved_total` - Counter
- `claims_rejected_total` - Counter
- `fraud_detections_total{risk_level}` - Counter

## Troubleshooting

### Prometheus cannot scrape KINGA app

**Symptom:** Target shows as "DOWN" in Prometheus

**Solution:**
1. Verify KINGA app is running: `curl http://localhost:3000/metrics`
2. Check Docker network: `docker network inspect monitoring_kinga-monitoring`
3. Use `host.docker.internal` instead of `localhost` in prometheus.yml

### Grafana cannot connect to Prometheus

**Symptom:** "Bad Gateway" error in Grafana

**Solution:**
1. Verify Prometheus is running: `docker-compose ps prometheus`
2. Check datasource URL: Should be `http://prometheus:9090`
3. Restart Grafana: `docker-compose restart grafana`

### Alerts not firing

**Symptom:** No alerts in Alertmanager

**Solution:**
1. Check alert rules: http://localhost:9090/rules
2. Verify alert conditions are met
3. Check Alertmanager logs: `docker-compose logs alertmanager`

## Stopping the Stack

```bash
# Stop containers (keep data)
docker-compose stop

# Stop and remove containers (keep data)
docker-compose down

# Stop and remove everything including data
docker-compose down -v
```

## Production Deployment

For production deployment, use the Kubernetes configurations:
- `prometheus-deployment.yaml`
- `grafana-deployment.yaml`

See `README.md` for Kubernetes deployment instructions.

## Metrics Implementation

To implement the `/metrics` endpoint in the KINGA application, see the Patch Plan document (SEC-001) for the monitoring module implementation.
