# KINGA Enterprise Cybersecurity Framework

**Prepared by:** Tavonga Shoko  
**Date:** 2026-02-11  
**Version:** 1.0  
**Classification:** Confidential

---

## Executive Summary

This document defines the comprehensive enterprise cybersecurity framework for the KINGA AutoVerify AI platform. The framework implements defense-in-depth security controls across authentication, authorization, encryption, audit logging, API security, and ML data governance to achieve compliance with ISO 27001, SOC 2 Type II, GDPR, and insurance industry regulatory requirements.

The security architecture follows zero trust principles with layered controls including JWT-based authentication with refresh tokens, fine-grained role-based access control (RBAC), AES-256 encryption at rest, TLS 1.3 encryption in transit, comprehensive audit logging, mutual TLS (mTLS) for service-to-service communication, and secure ML training data governance with differential privacy.

---

## Table of Contents

1. [Security Architecture Overview](#security-architecture-overview)
2. [Threat Model & Risk Assessment](#threat-model--risk-assessment)
3. [Authentication & Identity Management](#authentication--identity-management)
4. [Authorization & Access Control](#authorization--access-control)
5. [Data Encryption](#data-encryption)
6. [Audit Logging & Monitoring](#audit-logging--monitoring)
7. [Zero Trust API Architecture](#zero-trust-api-architecture)
8. [ML Training Data Governance](#ml-training-data-governance)
9. [Secrets Management](#secrets-management)
10. [Compliance & Standards](#compliance--standards)
11. [Security Operations](#security-operations)
12. [Incident Response](#incident-response)

---

## 1. Security Architecture Overview

### 1.1 Defense-in-Depth Layers

```
┌─────────────────────────────────────────────────────────────────┐
│ Layer 7: Security Monitoring & Incident Response               │
├─────────────────────────────────────────────────────────────────┤
│ Layer 6: Audit Logging & Compliance                            │
├─────────────────────────────────────────────────────────────────┤
│ Layer 5: Data Encryption (At Rest & In Transit)                │
├─────────────────────────────────────────────────────────────────┤
│ Layer 4: API Security (mTLS, Rate Limiting, WAF)               │
├─────────────────────────────────────────────────────────────────┤
│ Layer 3: Authorization (RBAC, Attribute-Based Access Control)  │
├─────────────────────────────────────────────────────────────────┤
│ Layer 2: Authentication (JWT, MFA, OAuth 2.0)                  │
├─────────────────────────────────────────────────────────────────┤
│ Layer 1: Network Security (VPC, Security Groups, NACLs)        │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Security Principles

- **Zero Trust**: Never trust, always verify - all requests authenticated and authorized
- **Least Privilege**: Users and services granted minimum permissions required
- **Defense in Depth**: Multiple layers of security controls
- **Secure by Default**: Security enabled out-of-the-box, not opt-in
- **Privacy by Design**: Data protection built into architecture
- **Separation of Duties**: Critical operations require multiple approvals

---

## 2. Threat Model & Risk Assessment

### 2.1 Threat Actors

| Threat Actor | Motivation | Capability | Likelihood | Impact |
|--------------|------------|------------|------------|--------|
| External Attackers | Financial gain, data theft | High | Medium | Critical |
| Malicious Insiders | Fraud, data exfiltration | Medium | Low | High |
| Compromised Accounts | Unauthorized access | Medium | Medium | High |
| Supply Chain Attacks | System compromise | High | Low | Critical |
| Nation State APTs | Espionage | Very High | Very Low | Critical |

### 2.2 Attack Vectors

**Application Layer**
- SQL injection via claim submission forms
- Cross-site scripting (XSS) in assessment results
- Authentication bypass attempts
- Session hijacking
- API abuse and scraping

**Infrastructure Layer**
- DDoS attacks on public endpoints
- Container escape vulnerabilities
- Kubernetes privilege escalation
- S3 bucket misconfiguration
- RDS database exposure

**Data Layer**
- Unauthorized access to PII
- ML model theft
- Training data poisoning
- Feature store data exfiltration
- Backup data theft

### 2.3 Risk Mitigation Strategy

| Risk | Mitigation | Residual Risk |
|------|------------|---------------|
| Credential theft | MFA + JWT refresh tokens + rate limiting | Low |
| Data breach | AES-256 encryption + field-level encryption | Low |
| Insider threat | RBAC + audit logging + data masking | Medium |
| API abuse | Rate limiting + API keys + mTLS | Low |
| ML model theft | Model encryption + access logging | Medium |

---

## 3. Authentication & Identity Management

### 3.1 JWT Authentication Architecture

**Token Structure**
```json
{
  "header": {
    "alg": "RS256",
    "typ": "JWT",
    "kid": "kinga-2026-02"
  },
  "payload": {
    "sub": "user_12345",
    "iss": "https://auth.kinga.ai",
    "aud": ["https://api.kinga.ai"],
    "exp": 1709280000,
    "iat": 1709276400,
    "jti": "550e8400-e29b-41d4-a716-446655440000",
    "role": "insurer",
    "permissions": ["claims:read", "claims:write"],
    "org_id": "org_67890",
    "mfa_verified": true
  }
}
```

**Token Lifecycle**
- **Access Token**: 15 minutes expiry, RS256 signed
- **Refresh Token**: 7 days expiry, stored in HTTP-only cookie
- **Rotation**: Refresh tokens rotated on every use
- **Revocation**: Redis-based token blacklist for immediate revocation

**Implementation**
```typescript
// server/_core/auth/jwt.ts
import jwt from 'jsonwebtoken';
import { readFileSync } from 'fs';

const PRIVATE_KEY = readFileSync('/etc/kinga/keys/jwt-private.pem');
const PUBLIC_KEY = readFileSync('/etc/kinga/keys/jwt-public.pem');

export function generateAccessToken(user: User): string {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      permissions: user.permissions,
      org_id: user.organizationId,
      mfa_verified: user.mfaVerified,
    },
    PRIVATE_KEY,
    {
      algorithm: 'RS256',
      expiresIn: '15m',
      issuer: 'https://auth.kinga.ai',
      audience: ['https://api.kinga.ai'],
      jwtid: crypto.randomUUID(),
    }
  );
}

export function generateRefreshToken(userId: string): string {
  return jwt.sign(
    { sub: userId, type: 'refresh' },
    PRIVATE_KEY,
    {
      algorithm: 'RS256',
      expiresIn: '7d',
      issuer: 'https://auth.kinga.ai',
    }
  );
}

export function verifyToken(token: string): jwt.JwtPayload {
  return jwt.verify(token, PUBLIC_KEY, {
    algorithms: ['RS256'],
    issuer: 'https://auth.kinga.ai',
    audience: ['https://api.kinga.ai'],
  }) as jwt.JwtPayload;
}
```

### 3.2 Multi-Factor Authentication (MFA)

**Supported Methods**
- TOTP (Time-based One-Time Password) via Google Authenticator, Authy
- SMS OTP (for backup recovery only, not primary)
- Hardware security keys (FIDO2/WebAuthn)

**Enrollment Flow**
1. User requests MFA enrollment
2. System generates TOTP secret
3. User scans QR code with authenticator app
4. User enters verification code to confirm
5. System stores encrypted TOTP secret
6. Backup codes generated (10 single-use codes)

**Database Schema**
```typescript
export const mfaDevices = pgTable('mfa_devices', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  deviceType: varchar('device_type', { length: 20 }).notNull(), // 'totp', 'webauthn'
  deviceName: varchar('device_name', { length: 100 }),
  totpSecret: text('totp_secret'), // Encrypted with KMS
  webauthnCredentialId: text('webauthn_credential_id'),
  webauthnPublicKey: text('webauthn_public_key'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  lastUsedAt: timestamp('last_used_at'),
});

export const mfaBackupCodes = pgTable('mfa_backup_codes', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  codeHash: varchar('code_hash', { length: 64 }).notNull(), // SHA-256 hash
  usedAt: timestamp('used_at'),
  createdAt: timestamp('created_at').defaultNow(),
});
```

### 3.3 OAuth 2.0 Integration

**Supported Flows**
- Authorization Code Flow (for web applications)
- Client Credentials Flow (for service-to-service)
- Device Authorization Flow (for CLI tools)

**Scopes**
```
claims:read          - Read claim data
claims:write         - Submit and update claims
assessments:read     - View AI assessments
fraud:read           - Access fraud detection results
analytics:read       - View analytics dashboards
admin:users          - Manage users (admin only)
admin:organizations  - Manage organizations (admin only)
```

---

## 4. Authorization & Access Control

### 4.1 Role-Based Access Control (RBAC)

**Roles Hierarchy**
```
Super Admin
  ├── Organization Admin
  │     ├── Insurer User
  │     └── Assessor
  ├── Panel Beater
  └── Read-Only Auditor
```

**Role Permissions Matrix**

| Resource | Super Admin | Org Admin | Insurer | Assessor | Panel Beater | Auditor |
|----------|-------------|-----------|---------|----------|--------------|---------|
| View Claims | ✓ | ✓ (org) | ✓ (org) | ✓ (assigned) | ✓ (assigned) | ✓ (read-only) |
| Submit Claims | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| Approve Claims | ✓ | ✓ | ✓ (threshold) | ✗ | ✗ | ✗ |
| View Fraud Scores | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ |
| Manage Users | ✓ | ✓ (org) | ✗ | ✗ | ✗ | ✗ |
| View Analytics | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ |
| Export Data | ✓ | ✓ (org) | ✓ (org) | ✗ | ✗ | ✓ |

### 4.2 Attribute-Based Access Control (ABAC)

**Policy Example**
```json
{
  "policy_id": "claim_approval_policy",
  "effect": "allow",
  "actions": ["claims:approve"],
  "resources": ["claim:*"],
  "conditions": {
    "user.role": "insurer",
    "user.organization_id": "${resource.organization_id}",
    "resource.total_cost": { "$lt": 50000 },
    "user.approval_limit": { "$gte": "${resource.total_cost}" }
  }
}
```

**Implementation**
```typescript
// server/_core/auth/abac.ts
export interface PolicyCondition {
  attribute: string;
  operator: '$eq' | '$ne' | '$lt' | '$lte' | '$gt' | '$gte' | '$in';
  value: any;
}

export interface Policy {
  id: string;
  effect: 'allow' | 'deny';
  actions: string[];
  resources: string[];
  conditions: PolicyCondition[];
}

export function evaluatePolicy(
  policy: Policy,
  user: User,
  action: string,
  resource: any
): boolean {
  // Check if action matches
  if (!policy.actions.includes(action)) return false;
  
  // Check if resource matches (supports wildcards)
  const resourceMatch = policy.resources.some(pattern =>
    matchPattern(pattern, resource.type)
  );
  if (!resourceMatch) return false;
  
  // Evaluate all conditions
  return policy.conditions.every(condition =>
    evaluateCondition(condition, user, resource)
  );
}
```

### 4.3 Data Access Patterns

**Row-Level Security (RLS)**
```sql
-- PostgreSQL RLS policy for claims table
CREATE POLICY claims_organization_isolation ON claims
  FOR ALL
  TO authenticated_users
  USING (organization_id = current_setting('app.current_org_id')::integer);

CREATE POLICY claims_role_based_access ON claims
  FOR SELECT
  TO authenticated_users
  USING (
    CASE current_setting('app.current_role')
      WHEN 'admin' THEN true
      WHEN 'insurer' THEN organization_id = current_setting('app.current_org_id')::integer
      WHEN 'assessor' THEN assigned_assessor_id = current_setting('app.current_user_id')::integer
      ELSE false
    END
  );
```

**Field-Level Encryption**
```typescript
// Sensitive fields encrypted before storage
export const claims = pgTable('claims', {
  id: serial('id').primaryKey(),
  claimNumber: varchar('claim_number', { length: 50 }).notNull(),
  // PII fields encrypted with KMS
  policyholderName: text('policyholder_name_encrypted').notNull(),
  policyholderIdNumber: text('policyholder_id_encrypted').notNull(),
  policyholderPhone: text('policyholder_phone_encrypted'),
  // Non-sensitive fields in plaintext
  claimDate: timestamp('claim_date').notNull(),
  status: varchar('status', { length: 20 }).notNull(),
});
```

---

## 5. Data Encryption

### 5.1 Encryption at Rest

**Database Encryption**
- **RDS PostgreSQL**: AES-256 encryption using AWS KMS
- **Key Rotation**: Automatic 90-day rotation
- **Backup Encryption**: All backups encrypted with same KMS key

**S3 Bucket Encryption**
```json
{
  "Rules": [
    {
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "aws:kms",
        "KMSMasterKeyID": "arn:aws:kms:us-east-1:123456789012:key/kinga-s3-key"
      },
      "BucketKeyEnabled": true
    }
  ]
}
```

**Application-Level Encryption**
```typescript
// server/_core/encryption/field-encryption.ts
import { KMSClient, EncryptCommand, DecryptCommand } from '@aws-sdk/client-kms';

const kms = new KMSClient({ region: 'us-east-1' });
const KMS_KEY_ID = process.env.KMS_KEY_ID!;

export async function encryptField(plaintext: string): Promise<string> {
  const command = new EncryptCommand({
    KeyId: KMS_KEY_ID,
    Plaintext: Buffer.from(plaintext, 'utf-8'),
  });
  const response = await kms.send(command);
  return Buffer.from(response.CiphertextBlob!).toString('base64');
}

export async function decryptField(ciphertext: string): Promise<string> {
  const command = new DecryptCommand({
    CiphertextBlob: Buffer.from(ciphertext, 'base64'),
  });
  const response = await kms.send(command);
  return Buffer.from(response.Plaintext!).toString('utf-8');
}
```

### 5.2 Encryption in Transit

**TLS Configuration**
```nginx
# Nginx TLS configuration
ssl_protocols TLSv1.3;
ssl_ciphers 'ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384';
ssl_prefer_server_ciphers on;
ssl_session_cache shared:SSL:10m;
ssl_session_timeout 10m;
ssl_stapling on;
ssl_stapling_verify on;

# HSTS header
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
```

**Service-to-Service mTLS**
```yaml
# Istio mTLS policy
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: default
  namespace: kinga-production
spec:
  mtls:
    mode: STRICT
```

---

## 6. Audit Logging & Monitoring

### 6.1 Audit Log Schema

```typescript
export const auditLogs = pgTable('audit_logs', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
  userId: integer('user_id').references(() => users.id),
  organizationId: integer('organization_id').references(() => organizations.id),
  action: varchar('action', { length: 100 }).notNull(), // 'claim.submit', 'user.login'
  resource: varchar('resource', { length: 100 }), // 'claim:12345'
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  requestId: varchar('request_id', { length: 100 }),
  status: varchar('status', { length: 20 }).notNull(), // 'success', 'failure'
  errorMessage: text('error_message'),
  metadata: jsonb('metadata'), // Additional context
  createdAt: timestamp('created_at').defaultNow(),
});
```

### 6.2 Logged Events

**Authentication Events**
- User login (success/failure)
- User logout
- MFA enrollment
- MFA verification (success/failure)
- Password reset request
- Password change

**Authorization Events**
- Permission denied
- Role assignment
- Permission grant/revoke

**Data Access Events**
- Claim viewed
- Assessment downloaded
- PII accessed
- Data exported

**Administrative Events**
- User created/updated/deleted
- Organization created/updated
- Configuration changed
- System settings modified

### 6.3 Monitoring & Alerting

**CloudWatch Alarms**
```typescript
// infrastructure/terraform/modules/monitoring/cloudwatch-alarms.tf
resource "aws_cloudwatch_metric_alarm" "failed_login_attempts" {
  alarm_name          = "kinga-failed-login-spike"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "FailedLoginAttempts"
  namespace           = "KINGA/Security"
  period              = "300"
  statistic           = "Sum"
  threshold           = "10"
  alarm_description   = "Alert on 10+ failed logins in 5 minutes"
  alarm_actions       = [aws_sns_topic.security_alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "unauthorized_access_attempts" {
  alarm_name          = "kinga-unauthorized-access"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "UnauthorizedAccessAttempts"
  namespace           = "KINGA/Security"
  period              = "300"
  statistic           = "Sum"
  threshold           = "5"
  alarm_description   = "Alert on 5+ unauthorized access attempts"
  alarm_actions       = [aws_sns_topic.security_alerts.arn]
}
```

---

## 7. Zero Trust API Architecture

### 7.1 API Gateway Security

**Kong API Gateway Configuration**
```yaml
plugins:
  - name: jwt
    config:
      key_claim_name: kid
      secret_is_base64: false
      run_on_preflight: true
      
  - name: rate-limiting
    config:
      minute: 100
      hour: 1000
      policy: redis
      redis_host: redis.kinga.internal
      
  - name: ip-restriction
    config:
      allow:
        - 10.0.0.0/8  # Internal VPC
        - 203.0.113.0/24  # Office IP range
        
  - name: request-size-limiting
    config:
      allowed_payload_size: 10
      size_unit: megabytes
      
  - name: cors
    config:
      origins:
        - https://app.kinga.ai
      methods:
        - GET
        - POST
        - PUT
        - DELETE
      headers:
        - Authorization
        - Content-Type
      credentials: true
      max_age: 3600
```

### 7.2 API Security Headers

```typescript
// server/_core/middleware/security-headers.ts
export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  
  // Prevent MIME sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // XSS protection
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Content Security Policy
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:;"
  );
  
  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Permissions policy
  res.setHeader(
    'Permissions-Policy',
    'geolocation=(), microphone=(), camera=()'
  );
  
  next();
}
```

### 7.3 Input Validation & Sanitization

```typescript
// server/_core/validation/input-sanitization.ts
import { z } from 'zod';
import DOMPurify from 'isomorphic-dompurify';

export const claimSubmissionSchema = z.object({
  policyNumber: z.string().regex(/^POL-\d{8}$/),
  claimDate: z.string().datetime(),
  incidentDescription: z.string().max(5000).transform(val => DOMPurify.sanitize(val)),
  estimatedCost: z.number().min(0).max(1000000),
  documents: z.array(z.object({
    filename: z.string().regex(/^[a-zA-Z0-9_-]+\.(pdf|jpg|png)$/),
    size: z.number().max(10 * 1024 * 1024), // 10MB max
    contentType: z.enum(['application/pdf', 'image/jpeg', 'image/png']),
  })).max(10),
});

// Usage in tRPC procedure
submitClaim: protectedProcedure
  .input(claimSubmissionSchema)
  .mutation(async ({ input, ctx }) => {
    // Input is validated and sanitized
    return await createClaim(input, ctx.user);
  }),
```

---

## 8. ML Training Data Governance

### 8.1 Data Access Controls

**Feature Store Access Policy**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::123456789012:role/MLEngineerRole"
      },
      "Action": [
        "sagemaker:GetRecord",
        "sagemaker:PutRecord"
      ],
      "Resource": "arn:aws:sagemaker:us-east-1:123456789012:feature-group/kinga-fraud-features",
      "Condition": {
        "IpAddress": {
          "aws:SourceIp": ["10.0.0.0/8"]
        }
      }
    }
  ]
}
```

### 8.2 Differential Privacy

**Implementation**
```python
# services/ml-data-pipeline/src/differential_privacy.py
import numpy as np
from typing import List

class DifferentialPrivacy:
    def __init__(self, epsilon: float = 1.0, delta: float = 1e-5):
        """
        Initialize differential privacy mechanism.
        
        Args:
            epsilon: Privacy budget (smaller = more privacy)
            delta: Probability of privacy breach
        """
        self.epsilon = epsilon
        self.delta = delta
        
    def add_laplace_noise(self, value: float, sensitivity: float) -> float:
        """Add Laplace noise for differential privacy."""
        scale = sensitivity / self.epsilon
        noise = np.random.laplace(0, scale)
        return value + noise
        
    def add_gaussian_noise(self, value: float, sensitivity: float) -> float:
        """Add Gaussian noise for (epsilon, delta)-differential privacy."""
        sigma = (sensitivity / self.epsilon) * np.sqrt(2 * np.log(1.25 / self.delta))
        noise = np.random.normal(0, sigma)
        return value + noise
        
    def privatize_dataset(self, features: np.ndarray, sensitivity: float = 1.0) -> np.ndarray:
        """Apply differential privacy to entire dataset."""
        noise = np.random.laplace(0, sensitivity / self.epsilon, features.shape)
        return features + noise

# Usage in feature engineering pipeline
dp = DifferentialPrivacy(epsilon=1.0, delta=1e-5)
privatized_features = dp.privatize_dataset(fraud_features, sensitivity=2.0)
```

### 8.3 Data Lineage Tracking

```typescript
// services/ml-data-pipeline/src/lineage-tracker.ts
export interface DataLineage {
  datasetId: string;
  datasetName: string;
  version: string;
  createdAt: Date;
  createdBy: string;
  sourceDatasets: string[];
  transformations: {
    name: string;
    parameters: Record<string, any>;
    timestamp: Date;
  }[];
  accessLog: {
    userId: string;
    action: 'read' | 'write' | 'delete';
    timestamp: Date;
    purpose: string;
  }[];
}

export class LineageTracker {
  async trackDatasetCreation(
    datasetName: string,
    sourceDatasets: string[],
    transformations: any[]
  ): Promise<string> {
    const lineage: DataLineage = {
      datasetId: crypto.randomUUID(),
      datasetName,
      version: '1.0.0',
      createdAt: new Date(),
      createdBy: getCurrentUserId(),
      sourceDatasets,
      transformations,
      accessLog: [],
    };
    
    await db.insert(dataLineageTable).values(lineage);
    return lineage.datasetId;
  }
  
  async logDataAccess(
    datasetId: string,
    action: 'read' | 'write' | 'delete',
    purpose: string
  ): Promise<void> {
    await db.insert(dataAccessLogTable).values({
      datasetId,
      userId: getCurrentUserId(),
      action,
      purpose,
      timestamp: new Date(),
    });
  }
}
```

### 8.4 Model Encryption

```python
# services/ml-training/src/model_encryption.py
from cryptography.fernet import Fernet
import pickle
import boto3

class ModelEncryption:
    def __init__(self, kms_key_id: str):
        self.kms_client = boto3.client('kms')
        self.kms_key_id = kms_key_id
        
    def encrypt_model(self, model, model_path: str) -> str:
        """Encrypt trained model before storage."""
        # Generate data key from KMS
        response = self.kms_client.generate_data_key(
            KeyId=self.kms_key_id,
            KeySpec='AES_256'
        )
        
        plaintext_key = response['Plaintext']
        encrypted_key = response['CiphertextBlob']
        
        # Encrypt model with data key
        fernet = Fernet(plaintext_key)
        model_bytes = pickle.dumps(model)
        encrypted_model = fernet.encrypt(model_bytes)
        
        # Save encrypted model and encrypted key
        with open(model_path, 'wb') as f:
            f.write(encrypted_key + b'||' + encrypted_model)
            
        return model_path
        
    def decrypt_model(self, model_path: str):
        """Decrypt model for inference."""
        with open(model_path, 'rb') as f:
            content = f.read()
            
        encrypted_key, encrypted_model = content.split(b'||')
        
        # Decrypt data key with KMS
        response = self.kms_client.decrypt(
            CiphertextBlob=encrypted_key
        )
        plaintext_key = response['Plaintext']
        
        # Decrypt model
        fernet = Fernet(plaintext_key)
        model_bytes = fernet.decrypt(encrypted_model)
        model = pickle.loads(model_bytes)
        
        return model
```

---

## 9. Secrets Management

### 9.1 HashiCorp Vault Integration

**Vault Configuration**
```hcl
# infrastructure/vault/kinga-secrets.hcl
path "kinga/data/database/*" {
  capabilities = ["read"]
}

path "kinga/data/api-keys/*" {
  capabilities = ["read"]
}

path "kinga/data/ml-models/*" {
  capabilities = ["read", "list"]
}

# Dynamic database credentials
path "database/creds/kinga-app" {
  capabilities = ["read"]
}
```

**Application Integration**
```typescript
// server/_core/secrets/vault-client.ts
import vault from 'node-vault';

const vaultClient = vault({
  endpoint: process.env.VAULT_ADDR!,
  token: process.env.VAULT_TOKEN!,
});

export async function getSecret(path: string): Promise<any> {
  const result = await vaultClient.read(`kinga/data/${path}`);
  return result.data.data;
}

export async function getDatabaseCredentials(): Promise<{
  username: string;
  password: string;
}> {
  const result = await vaultClient.read('database/creds/kinga-app');
  return {
    username: result.data.username,
    password: result.data.password,
  };
}

// Usage
const dbCreds = await getDatabaseCredentials();
const dbUrl = `postgresql://${dbCreds.username}:${dbCreds.password}@db.kinga.internal:5432/kinga`;
```

### 9.2 Secret Rotation

**Automated Rotation Lambda**
```python
# infrastructure/lambda/secret-rotation.py
import boto3
import json

secrets_client = boto3.client('secretsmanager')
rds_client = boto3.client('rds')

def lambda_handler(event, context):
    secret_arn = event['SecretId']
    token = event['ClientRequestToken']
    step = event['Step']
    
    if step == 'createSecret':
        # Generate new password
        new_password = generate_secure_password()
        
        # Store new password in pending version
        secrets_client.put_secret_value(
            SecretId=secret_arn,
            ClientRequestToken=token,
            SecretString=json.dumps({'password': new_password}),
            VersionStages=['AWSPENDING']
        )
        
    elif step == 'setSecret':
        # Update database password
        pending_secret = secrets_client.get_secret_value(
            SecretId=secret_arn,
            VersionStage='AWSPENDING'
        )
        new_password = json.loads(pending_secret['SecretString'])['password']
        
        rds_client.modify_db_instance(
            DBInstanceIdentifier='kinga-production',
            MasterUserPassword=new_password,
            ApplyImmediately=True
        )
        
    elif step == 'testSecret':
        # Test new credentials
        pending_secret = secrets_client.get_secret_value(
            SecretId=secret_arn,
            VersionStage='AWSPENDING'
        )
        test_database_connection(pending_secret)
        
    elif step == 'finishSecret':
        # Move AWSCURRENT label to new version
        secrets_client.update_secret_version_stage(
            SecretId=secret_arn,
            VersionStage='AWSCURRENT',
            MoveToVersionId=token
        )
```

---

## 10. Compliance & Standards

### 10.1 ISO 27001 Controls Mapping

| Control | Implementation | Status |
|---------|----------------|--------|
| A.9.2.1 User registration | OAuth 2.0 + MFA | ✓ Implemented |
| A.9.4.1 Information access restriction | RBAC + ABAC | ✓ Implemented |
| A.10.1.1 Cryptographic controls | AES-256 + TLS 1.3 | ✓ Implemented |
| A.12.4.1 Event logging | CloudWatch + Audit logs | ✓ Implemented |
| A.13.1.1 Network security | VPC + Security Groups | ✓ Implemented |
| A.14.2.1 Secure development | SAST + DAST scanning | ⏳ In Progress |

### 10.2 SOC 2 Type II Compliance

**Trust Service Criteria**

**Security (CC6)**
- CC6.1: Logical access controls ✓
- CC6.2: Authentication mechanisms ✓
- CC6.3: Authorization mechanisms ✓
- CC6.6: Encryption of data at rest ✓
- CC6.7: Encryption of data in transit ✓

**Availability (A1)**
- A1.1: System availability monitoring ✓
- A1.2: Incident response procedures ✓

**Confidentiality (C1)**
- C1.1: Data classification ✓
- C1.2: Confidential data encryption ✓

### 10.3 GDPR Compliance

**Data Subject Rights**
- Right to Access: API endpoint `/api/gdpr/data-export`
- Right to Erasure: API endpoint `/api/gdpr/delete-account`
- Right to Portability: JSON export of all user data
- Right to Rectification: User profile update endpoints

**Implementation**
```typescript
// server/routers/gdpr.ts
export const gdprRouter = router({
  exportUserData: protectedProcedure
    .mutation(async ({ ctx }) => {
      const userData = await db.query.users.findFirst({
        where: eq(users.id, ctx.user.id),
        with: {
          claims: true,
          assessments: true,
          auditLogs: true,
        },
      });
      
      // Log data export request
      await logAuditEvent({
        userId: ctx.user.id,
        action: 'gdpr.data_export',
        status: 'success',
      });
      
      return {
        exportDate: new Date().toISOString(),
        data: userData,
      };
    }),
    
  deleteAccount: protectedProcedure
    .input(z.object({ confirmationCode: z.string() }))
    .mutation(async ({ input, ctx }) => {
      // Verify confirmation code
      const isValid = await verifyConfirmationCode(ctx.user.id, input.confirmationCode);
      if (!isValid) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Invalid confirmation code' });
      }
      
      // Anonymize user data (GDPR right to erasure)
      await db.update(users)
        .set({
          email: `deleted_${ctx.user.id}@anonymized.local`,
          name: 'Deleted User',
          phone: null,
          deletedAt: new Date(),
        })
        .where(eq(users.id, ctx.user.id));
        
      // Log deletion request
      await logAuditEvent({
        userId: ctx.user.id,
        action: 'gdpr.account_deletion',
        status: 'success',
      });
      
      return { success: true };
    }),
});
```

---

## 11. Security Operations

### 11.1 Security Monitoring Dashboard

**Grafana Dashboard Panels**
1. Failed login attempts (last 24h)
2. Unauthorized access attempts
3. API rate limit violations
4. Suspicious IP addresses
5. MFA enrollment rate
6. Token revocations
7. Data export requests
8. Privilege escalation attempts

### 11.2 Vulnerability Management

**Scanning Schedule**
- **SAST (Static Analysis)**: Every commit via GitHub Actions
- **DAST (Dynamic Analysis)**: Daily on staging environment
- **Dependency Scanning**: Weekly via Snyk
- **Container Scanning**: On every Docker image build
- **Penetration Testing**: Quarterly by external firm

**Remediation SLAs**
| Severity | Remediation Time | Escalation |
|----------|------------------|------------|
| Critical | 24 hours | CTO + CISO |
| High | 7 days | Security Team Lead |
| Medium | 30 days | Development Team |
| Low | 90 days | Backlog |

### 11.3 Security Training

**Required Training**
- **All Employees**: Security awareness (annual)
- **Developers**: Secure coding practices (quarterly)
- **DevOps**: Infrastructure security (quarterly)
- **Data Scientists**: ML security & privacy (semi-annual)

---

## 12. Incident Response

### 12.1 Incident Classification

| Severity | Definition | Response Time | Escalation |
|----------|------------|---------------|------------|
| P0 - Critical | Data breach, system compromise | 15 minutes | CEO + Board |
| P1 - High | Service outage, failed security control | 1 hour | CTO + CISO |
| P2 - Medium | Degraded performance, minor vulnerability | 4 hours | Security Team |
| P3 - Low | Informational, potential issue | 24 hours | On-call Engineer |

### 12.2 Incident Response Playbook

**Data Breach Response**
1. **Detection** (0-15 min)
   - Alert triggered by SIEM
   - On-call security engineer notified
   
2. **Containment** (15-60 min)
   - Isolate affected systems
   - Revoke compromised credentials
   - Block malicious IP addresses
   
3. **Investigation** (1-4 hours)
   - Analyze audit logs
   - Identify scope of breach
   - Preserve forensic evidence
   
4. **Eradication** (4-24 hours)
   - Remove malware/backdoors
   - Patch vulnerabilities
   - Reset all credentials
   
5. **Recovery** (24-72 hours)
   - Restore systems from clean backups
   - Verify system integrity
   - Resume normal operations
   
6. **Post-Incident** (72 hours+)
   - Conduct post-mortem
   - Notify affected parties
   - Update security controls
   - File regulatory reports (GDPR breach notification within 72 hours)

### 12.3 Communication Plan

**Internal Communication**
- Slack channel: `#security-incidents`
- Email: `security-team@kinga.ai`
- PagerDuty escalation

**External Communication**
- Customer notification (if PII affected)
- Regulatory notification (GDPR, insurance regulators)
- Public disclosure (if required)

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-11 | Tavonga Shoko | Initial enterprise cybersecurity framework |

---

**Classification:** Confidential  
**Distribution:** Security Team, Executive Leadership, Compliance Team  
**Review Cycle:** Quarterly  
**Next Review Date:** 2026-05-11
