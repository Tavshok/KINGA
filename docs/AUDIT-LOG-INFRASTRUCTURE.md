# Audit Log Infrastructure Setup

**Prepared by:** Tavonga Shoko, Platform Architect  
**Date:** February 11, 2026  
**Document Reference:** KINGA-ALI-2026-007  
**Classification:** Internal — DevOps Operations

---

## Overview

This document provides step-by-step instructions for initializing the audit log storage infrastructure as specified in the CI/CD Governance Policy (KINGA-CICD-2026-006, Section 6). The infrastructure consists of three storage layers:

1. **Local Filesystem** - Immediate logging with 90-day retention
2. **Centralized Log Aggregation (Loki)** - Searchable logs with 365-day retention
3. **Immutable Audit Archive (S3)** - Compliance-grade storage with 7-year retention and WORM protection

---

## 1. Local Filesystem Audit Logs

### 1.1 Directory Structure

Create the audit log directory structure:

```bash
sudo mkdir -p /var/log/kinga/audit
sudo chown -R ubuntu:ubuntu /var/log/kinga
chmod 750 /var/log/kinga/audit
```

### 1.2 Log Rotation Configuration

Create logrotate configuration for audit logs:

```bash
sudo tee /etc/logrotate.d/kinga-audit <<EOF
/var/log/kinga/audit/*.log {
    daily
    rotate 90
    compress
    delaycompress
    notifempty
    create 0640 ubuntu ubuntu
    sharedscripts
    postrotate
        # Upload rotated logs to S3
        /home/ubuntu/kinga-replit/scripts/audit/upload-to-s3.sh
    endscript
}
EOF
```

### 1.3 Audit Logger Module

Create the audit logger module in the application:

```typescript
// server/_core/audit-logger.ts

import fs from 'fs';
import path from 'path';

export interface AuditEvent {
  event_id: string;
  timestamp: string;
  event_type: 'pipeline_stage' | 'approval' | 'deployment' | 'rollback' | 'gate_validation' | 'alert';
  actor: {
    user_id: string;
    email: string;
    role: string;
    ip_address: string;
  };
  resource: {
    type: 'code' | 'database' | 'configuration' | 'infrastructure';
    identifier: string;
    version: string;
  };
  action: string;
  status: 'success' | 'failure' | 'pending';
  metadata: Record<string, any>;
  correlation_id: string;
}

const AUDIT_LOG_DIR = '/var/log/kinga/audit';
const AUDIT_LOG_FILE = path.join(AUDIT_LOG_DIR, `audit-${new Date().toISOString().split('T')[0]}.log`);

export function logAuditEvent(event: AuditEvent): void {
  // Ensure directory exists
  if (!fs.existsSync(AUDIT_LOG_DIR)) {
    fs.mkdirSync(AUDIT_LOG_DIR, { recursive: true, mode: 0o750 });
  }
  
  // Append event to log file
  const logLine = JSON.stringify(event) + '\n';
  fs.appendFileSync(AUDIT_LOG_FILE, logLine, { mode: 0o640 });
  
  // Also log to console for centralized aggregation
  console.log(`[AUDIT] ${logLine.trim()}`);
}

export function createAuditEvent(
  eventType: AuditEvent['event_type'],
  actor: AuditEvent['actor'],
  resource: AuditEvent['resource'],
  action: string,
  status: AuditEvent['status'],
  metadata: Record<string, any> = {},
  correlationId?: string
): AuditEvent {
  return {
    event_id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    event_type: eventType,
    actor,
    resource,
    action,
    status,
    metadata,
    correlation_id: correlationId || crypto.randomUUID()
  };
}
```

---

## 2. Centralized Log Aggregation (Loki)

### 2.1 Loki Installation

Loki is already configured in the Docker Compose monitoring stack. Start it:

```bash
cd /home/ubuntu/kinga-replit/deployment/monitoring
docker-compose up -d loki
```

### 2.2 Promtail Configuration

Create Promtail configuration to ship logs from local filesystem to Loki:

```yaml
# deployment/monitoring/promtail-config.yml

server:
  http_listen_port: 9080
  grpc_listen_port: 0

positions:
  filename: /tmp/positions.yaml

clients:
  - url: http://localhost:3100/loki/api/v1/push

scrape_configs:
  - job_name: kinga-audit-logs
    static_configs:
      - targets:
          - localhost
        labels:
          job: kinga-audit
          __path__: /var/log/kinga/audit/*.log
    pipeline_stages:
      - json:
          expressions:
            event_id: event_id
            timestamp: timestamp
            event_type: event_type
            actor_email: actor.email
            action: action
            status: status
      - labels:
          event_type:
          actor_email:
          action:
          status:
      - timestamp:
          source: timestamp
          format: RFC3339
```

### 2.3 Start Promtail

```bash
docker run -d \
  --name promtail \
  -v /var/log/kinga:/var/log/kinga:ro \
  -v $(pwd)/promtail-config.yml:/etc/promtail/config.yml \
  grafana/promtail:latest \
  -config.file=/etc/promtail/config.yml
```

### 2.4 Verify Loki Ingestion

```bash
# Check Loki is receiving logs
curl -G -s "http://localhost:3100/loki/api/v1/query" \
  --data-urlencode 'query={job="kinga-audit"}' | jq
```

---

## 3. Immutable Audit Archive (S3)

### 3.1 S3 Bucket Creation

The Manus platform provides S3 storage via the `storagePut` helper. For audit logs, we need a dedicated bucket with WORM (Write-Once-Read-Many) compliance.

**Note:** S3 WORM compliance requires AWS S3 Object Lock, which is not available in the Manus-provided S3 storage. For full compliance, you'll need to create a dedicated AWS S3 bucket.

#### Option A: Using Manus S3 (No WORM)

Use the existing `storagePut` helper to upload audit logs:

```typescript
// scripts/audit/upload-to-s3.ts

import { storagePut } from '../../server/storage';
import fs from 'fs';
import path from 'path';

async function uploadAuditLogsToS3() {
  const auditLogDir = '/var/log/kinga/audit';
  const files = fs.readdirSync(auditLogDir).filter(f => f.endsWith('.log.gz'));
  
  for (const file of files) {
    const filePath = path.join(auditLogDir, file);
    const fileContent = fs.readFileSync(filePath);
    const s3Key = `audit-logs/${new Date().toISOString().split('T')[0]}/${file}`;
    
    try {
      const { url } = await storagePut(s3Key, fileContent, 'application/gzip');
      console.log(`Uploaded ${file} to S3: ${url}`);
      
      // Move uploaded file to archive directory
      fs.renameSync(filePath, path.join(auditLogDir, 'archived', file));
    } catch (error) {
      console.error(`Failed to upload ${file}:`, error);
    }
  }
}

uploadAuditLogsToS3();
```

#### Option B: Using AWS S3 with WORM Compliance

For full compliance with 7-year retention and WORM protection:

1. **Create S3 Bucket with Object Lock:**

```bash
aws s3api create-bucket \
  --bucket kinga-audit-logs \
  --region us-east-1 \
  --object-lock-enabled-for-bucket
```

2. **Configure Object Lock Retention:**

```bash
aws s3api put-object-lock-configuration \
  --bucket kinga-audit-logs \
  --object-lock-configuration '{
    "ObjectLockEnabled": "Enabled",
    "Rule": {
      "DefaultRetention": {
        "Mode": "COMPLIANCE",
        "Days": 2555
      }
    }
  }'
```

3. **Configure Lifecycle Policy:**

```bash
aws s3api put-bucket-lifecycle-configuration \
  --bucket kinga-audit-logs \
  --lifecycle-configuration file://audit-lifecycle-policy.json
```

**audit-lifecycle-policy.json:**

```json
{
  "Rules": [
    {
      "Id": "Archive audit logs to Glacier after 90 days",
      "Status": "Enabled",
      "Transitions": [
        {
          "Days": 90,
          "StorageClass": "GLACIER"
        }
      ],
      "NoncurrentVersionTransitions": [
        {
          "NoncurrentDays": 30,
          "StorageClass": "GLACIER"
        }
      ]
    }
  ]
}
```

4. **Upload Script with AWS SDK:**

```typescript
// scripts/audit/upload-to-aws-s3.ts

import AWS from 'aws-sdk';
import fs from 'fs';
import path from 'path';

const s3 = new AWS.S3({
  region: 'us-east-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

async function uploadAuditLogsToAWSS3() {
  const auditLogDir = '/var/log/kinga/audit';
  const files = fs.readdirSync(auditLogDir).filter(f => f.endsWith('.log.gz'));
  
  for (const file of files) {
    const filePath = path.join(auditLogDir, file);
    const fileContent = fs.readFileSync(filePath);
    const s3Key = `audit-logs/${new Date().toISOString().split('T')[0]}/${file}`;
    
    try {
      await s3.putObject({
        Bucket: 'kinga-audit-logs',
        Key: s3Key,
        Body: fileContent,
        ContentType: 'application/gzip',
        ObjectLockMode: 'COMPLIANCE',
        ObjectLockRetainUntilDate: new Date(Date.now() + 2555 * 24 * 60 * 60 * 1000) // 7 years
      }).promise();
      
      console.log(`Uploaded ${file} to AWS S3 with WORM protection: s3://kinga-audit-logs/${s3Key}`);
      
      // Move uploaded file to archive directory
      fs.renameSync(filePath, path.join(auditLogDir, 'archived', file));
    } catch (error) {
      console.error(`Failed to upload ${file}:`, error);
    }
  }
}

uploadAuditLogsToAWSS3();
```

### 3.2 Automated Upload Schedule

Add cron job to upload logs daily:

```bash
crontab -e
```

Add this line:

```
0 2 * * * /usr/bin/node /home/ubuntu/kinga-replit/scripts/audit/upload-to-s3.ts >> /var/log/kinga/audit-upload.log 2>&1
```

---

## 4. Access Control

### 4.1 Filesystem Permissions

```bash
# Audit log directory: read/write for ubuntu user only
chmod 750 /var/log/kinga/audit
chown ubuntu:ubuntu /var/log/kinga/audit

# Audit log files: read/write for ubuntu, read for group
chmod 640 /var/log/kinga/audit/*.log
```

### 4.2 Loki Access Control

Configure Loki authentication in `deployment/monitoring/loki-config.yml`:

```yaml
auth_enabled: true

server:
  http_listen_port: 3100

ingester:
  lifecycler:
    ring:
      kvstore:
        store: inmemory
      replication_factor: 1

schema_config:
  configs:
    - from: 2020-10-24
      store: boltdb-shipper
      object_store: filesystem
      schema: v11
      index:
        prefix: index_
        period: 24h

storage_config:
  boltdb_shipper:
    active_index_directory: /loki/boltdb-shipper-active
    cache_location: /loki/boltdb-shipper-cache
    shared_store: filesystem
  filesystem:
    directory: /loki/chunks

limits_config:
  enforce_metric_name: false
  reject_old_samples: true
  reject_old_samples_max_age: 168h

chunk_store_config:
  max_look_back_period: 0s

table_manager:
  retention_deletes_enabled: true
  retention_period: 8760h  # 365 days
```

### 4.3 S3 Bucket Policy (AWS S3 Option)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyDeleteObject",
      "Effect": "Deny",
      "Principal": "*",
      "Action": [
        "s3:DeleteObject",
        "s3:DeleteObjectVersion"
      ],
      "Resource": "arn:aws:s3:::kinga-audit-logs/*"
    },
    {
      "Sid": "AllowReadAccess",
      "Effect": "Allow",
      "Principal": {
        "AWS": [
          "arn:aws:iam::ACCOUNT_ID:role/SecurityOfficer",
          "arn:aws:iam::ACCOUNT_ID:role/ComplianceOfficer"
        ]
      },
      "Action": [
        "s3:GetObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::kinga-audit-logs",
        "arn:aws:s3:::kinga-audit-logs/*"
      ]
    }
  ]
}
```

---

## 5. Verification

### 5.1 Test Audit Logging

```typescript
// Test script: scripts/audit/test-audit-logging.ts

import { logAuditEvent, createAuditEvent } from '../../server/_core/audit-logger';

const testEvent = createAuditEvent(
  'pipeline_stage',
  {
    user_id: 'test-user-123',
    email: 'test@kinga.ai',
    role: 'developer',
    ip_address: '192.168.1.100'
  },
  {
    type: 'code',
    identifier: 'main-branch',
    version: 'abc123'
  },
  'deploy',
  'success',
  { environment: 'staging' }
);

logAuditEvent(testEvent);
console.log('Test audit event logged successfully');
```

Run the test:

```bash
node scripts/audit/test-audit-logging.ts
```

Verify the log file:

```bash
tail -f /var/log/kinga/audit/audit-$(date +%Y-%m-%d).log
```

### 5.2 Test Loki Ingestion

```bash
# Query Loki for test event
curl -G -s "http://localhost:3100/loki/api/v1/query" \
  --data-urlencode 'query={job="kinga-audit"} |= "test-user-123"' | jq
```

### 5.3 Test S3 Upload

```bash
# Manually trigger upload
node scripts/audit/upload-to-s3.ts

# Verify files in S3 (Manus S3)
# Check via Manus Management UI or storage dashboard

# Verify files in AWS S3 (if using AWS)
aws s3 ls s3://kinga-audit-logs/audit-logs/
```

---

## 6. Monitoring

### 6.1 Prometheus Metrics

Add metrics for audit logging:

```typescript
// server/_core/audit-logger.ts

import { Counter, Histogram } from 'prom-client';

const auditEventsTotal = new Counter({
  name: 'audit_events_total',
  help: 'Total number of audit events logged',
  labelNames: ['event_type', 'status']
});

const auditLogWriteDuration = new Histogram({
  name: 'audit_log_write_duration_seconds',
  help: 'Duration of audit log write operations',
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1]
});

export function logAuditEvent(event: AuditEvent): void {
  const startTime = Date.now();
  
  // ... existing logging code ...
  
  auditEventsTotal.inc({ event_type: event.event_type, status: event.status });
  auditLogWriteDuration.observe((Date.now() - startTime) / 1000);
}
```

### 6.2 Grafana Dashboard

Create a Grafana dashboard for audit log monitoring:

- Total audit events by type
- Audit events by status (success/failure)
- Audit log write latency
- S3 upload success rate
- Loki ingestion rate

---

## 7. Compliance Checklist

- [ ] Local filesystem audit logs configured with 90-day retention
- [ ] Logrotate configured for daily rotation and compression
- [ ] Loki installed and receiving audit logs
- [ ] Promtail configured to ship logs from filesystem to Loki
- [ ] S3 bucket created with WORM compliance (if using AWS S3)
- [ ] Automated daily upload to S3 configured
- [ ] Access control configured (filesystem, Loki, S3)
- [ ] Audit logging integrated into application code
- [ ] Prometheus metrics configured for monitoring
- [ ] Grafana dashboard created for audit log visibility
- [ ] Test audit event logged and verified in all three storage layers

---

## References

- [CI/CD Governance Policy](./CICD-GOVERNANCE-POLICY.md) - Section 6: Audit Logging Requirements
- [Loki Documentation](https://grafana.com/docs/loki/latest/)
- [AWS S3 Object Lock](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html)
- [Logrotate Manual](https://linux.die.net/man/8/logrotate)

---

**End of Document**
