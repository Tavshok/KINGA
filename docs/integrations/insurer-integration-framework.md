# KINGA Multi-Tenant Insurer Integration Framework

**Prepared by:** Tavonga Shoko  
**Date:** 2026-02-11  
**Version:** 1.0  
**Classification:** Confidential

---

## Executive Summary

This document defines the comprehensive multi-tenant insurer integration framework for KINGA AutoVerify AI. The framework enables seamless integration with multiple insurance companies' existing systems through a plugin-based architecture with configuration-driven field mapping, secure OAuth 2.0 and API key authentication, insurer-specific workflow rules, and bidirectional data synchronization.

The integration architecture supports REST APIs, SOAP web services, SFTP file transfers, and webhook callbacks. Each insurer tenant is isolated with dedicated configuration, custom field mappings, workflow rules, and audit logging to ensure data privacy and regulatory compliance.

---

## Table of Contents

1. [Integration Architecture Overview](#integration-architecture-overview)
2. [Insurer API Connector Framework](#insurer-api-connector-framework)
3. [Configuration-Driven Field Mapping](#configuration-driven-field-mapping)
4. [Secure Data Exchange Protocols](#secure-data-exchange-protocols)
5. [Insurer-Specific Workflow Rules](#insurer-specific-workflow-rules)
6. [Webhook & Event Handling](#webhook--event-handling)
7. [Insurer Onboarding Process](#insurer-onboarding-process)
8. [Monitoring & Troubleshooting](#monitoring--troubleshooting)

---

## 1. Integration Architecture Overview

### 1.1 Multi-Tenant Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        KINGA Core Platform                      │
├─────────────────────────────────────────────────────────────────┤
│                    Integration Service Layer                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │  Connector   │  │    Field     │  │   Workflow   │         │
│  │   Registry   │  │    Mapper    │  │Rule Engine   │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
├─────────────────────────────────────────────────────────────────┤
│                      Insurer Adapters                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │ Old Mutual   │  │  Santam      │  │  Discovery   │         │
│  │  Adapter     │  │  Adapter     │  │   Adapter    │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
├─────────────────────────────────────────────────────────────────┤
│                    Transport Protocols                          │
│     REST API  │  SOAP  │  SFTP  │  Webhooks  │  Message Queue │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Integration Patterns

**Synchronous Integration**
- REST API calls for real-time claim submission
- SOAP web services for legacy systems
- Response time SLA: < 3 seconds

**Asynchronous Integration**
- Kafka events for claim status updates
- SFTP batch file transfers (nightly)
- Webhook callbacks for assessment completion

**Hybrid Integration**
- Initial claim submission via REST (synchronous)
- Assessment results via webhook (asynchronous)
- Status polling fallback if webhook fails

### 1.3 Supported Insurer Systems

| Insurer | System | Protocol | Authentication | Status |
|---------|--------|----------|----------------|--------|
| Old Mutual | ClaimsPro | REST API | OAuth 2.0 | ✓ Production |
| Santam | iSure | SOAP | API Key | ✓ Production |
| Discovery | Vitality Claims | REST API | OAuth 2.0 + mTLS | ✓ Production |
| Hollard | ClaimTrack | SFTP | SSH Key | ⏳ UAT |
| Momentum | ClaimHub | REST API | JWT | 📋 Planned |

---

## 2. Insurer API Connector Framework

### 2.1 Connector Plugin Architecture

**Base Connector Interface**
```typescript
// server/integrations/connectors/base-connector.ts
export interface InsurerConnectorConfig {
  insurerId: string;
  insurerName: string;
  baseUrl: string;
  authType: 'oauth2' | 'api_key' | 'jwt' | 'mtls';
  credentials: Record<string, string>;
  timeout: number;
  retryAttempts: number;
  fieldMappings: FieldMapping[];
  workflowRules: WorkflowRule[];
}

export abstract class BaseInsurerConnector {
  protected config: InsurerConnectorConfig;
  protected httpClient: AxiosInstance;
  
  constructor(config: InsurerConnectorConfig) {
    this.config = config;
    this.httpClient = this.createHttpClient();
  }
  
  protected abstract createHttpClient(): AxiosInstance;
  
  // Claim operations
  abstract submitClaim(claim: KingaClaim): Promise<InsurerClaimResponse>;
  abstract updateClaim(claimId: string, updates: Partial<KingaClaim>): Promise<void>;
  abstract getClaimStatus(externalClaimId: string): Promise<ClaimStatus>;
  
  // Assessment operations
  abstract submitAssessment(assessment: KingaAssessment): Promise<void>;
  abstract getAssessmentStatus(assessmentId: string): Promise<AssessmentStatus>;
  
  // Document operations
  abstract uploadDocument(claimId: string, document: Buffer, metadata: DocumentMetadata): Promise<string>;
  abstract downloadDocument(documentId: string): Promise<Buffer>;
  
  // Webhook operations
  abstract registerWebhook(event: string, callbackUrl: string): Promise<void>;
  abstract unregisterWebhook(webhookId: string): Promise<void>;
  
  // Health check
  abstract healthCheck(): Promise<boolean>;
}
```

### 2.2 Old Mutual Connector Implementation

```typescript
// server/integrations/connectors/old-mutual-connector.ts
import axios, { AxiosInstance } from 'axios';
import { BaseInsurerConnector, InsurerConnectorConfig } from './base-connector';

export class OldMutualConnector extends BaseInsurerConnector {
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;
  
  protected createHttpClient(): AxiosInstance {
    return axios.create({
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Version': '2.0',
      },
    });
  }
  
  private async ensureAuthenticated(): Promise<void> {
    if (this.accessToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
      return; // Token still valid
    }
    
    // OAuth 2.0 Client Credentials flow
    const response = await axios.post(
      `${this.config.baseUrl}/oauth/token`,
      {
        grant_type: 'client_credentials',
        client_id: this.config.credentials.clientId,
        client_secret: this.config.credentials.clientSecret,
        scope: 'claims:write claims:read assessments:write',
      }
    );
    
    this.accessToken = response.data.access_token;
    this.tokenExpiry = new Date(Date.now() + response.data.expires_in * 1000);
  }
  
  async submitClaim(claim: KingaClaim): Promise<InsurerClaimResponse> {
    await this.ensureAuthenticated();
    
    // Map KINGA claim to Old Mutual format
    const mappedClaim = this.mapClaimToInsurerFormat(claim);
    
    const response = await this.httpClient.post('/api/v2/claims', mappedClaim, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    
    return {
      externalClaimId: response.data.claimReference,
      status: response.data.status,
      message: response.data.message,
    };
  }
  
  async updateClaim(claimId: string, updates: Partial<KingaClaim>): Promise<void> {
    await this.ensureAuthenticated();
    
    const mappedUpdates = this.mapClaimToInsurerFormat(updates);
    
    await this.httpClient.patch(`/api/v2/claims/${claimId}`, mappedUpdates, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
  }
  
  async getClaimStatus(externalClaimId: string): Promise<ClaimStatus> {
    await this.ensureAuthenticated();
    
    const response = await this.httpClient.get(`/api/v2/claims/${externalClaimId}`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    
    return this.mapInsurerStatusToKinga(response.data.status);
  }
  
  async submitAssessment(assessment: KingaAssessment): Promise<void> {
    await this.ensureAuthenticated();
    
    const mappedAssessment = this.mapAssessmentToInsurerFormat(assessment);
    
    await this.httpClient.post(
      `/api/v2/claims/${assessment.externalClaimId}/assessments`,
      mappedAssessment,
      { headers: { Authorization: `Bearer ${this.accessToken}` } }
    );
  }
  
  async uploadDocument(
    claimId: string,
    document: Buffer,
    metadata: DocumentMetadata
  ): Promise<string> {
    await this.ensureAuthenticated();
    
    const formData = new FormData();
    formData.append('file', new Blob([document]), metadata.filename);
    formData.append('documentType', metadata.type);
    formData.append('description', metadata.description);
    
    const response = await this.httpClient.post(
      `/api/v2/claims/${claimId}/documents`,
      formData,
      {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    
    return response.data.documentId;
  }
  
  async registerWebhook(event: string, callbackUrl: string): Promise<void> {
    await this.ensureAuthenticated();
    
    await this.httpClient.post(
      '/api/v2/webhooks',
      {
        event,
        url: callbackUrl,
        secret: crypto.randomBytes(32).toString('hex'),
      },
      { headers: { Authorization: `Bearer ${this.accessToken}` } }
    );
  }
  
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.httpClient.get('/api/v2/health');
      return response.status === 200;
    } catch {
      return false;
    }
  }
  
  private mapClaimToInsurerFormat(claim: Partial<KingaClaim>): any {
    // Use field mappings from config
    const mapped: any = {};
    
    for (const mapping of this.config.fieldMappings) {
      const value = this.getNestedValue(claim, mapping.kingaField);
      if (value !== undefined) {
        this.setNestedValue(mapped, mapping.insurerField, this.transformValue(value, mapping));
      }
    }
    
    return mapped;
  }
  
  private mapInsurerStatusToKinga(insurerStatus: string): ClaimStatus {
    const statusMap: Record<string, ClaimStatus> = {
      'NEW': 'submitted',
      'UNDER_REVIEW': 'under_review',
      'APPROVED': 'approved',
      'REJECTED': 'rejected',
      'PENDING_INFO': 'pending_information',
    };
    
    return statusMap[insurerStatus] || 'unknown';
  }
}
```

### 2.3 Connector Registry

```typescript
// server/integrations/connector-registry.ts
export class ConnectorRegistry {
  private connectors: Map<string, typeof BaseInsurerConnector> = new Map();
  private instances: Map<string, BaseInsurerConnector> = new Map();
  
  registerConnector(insurerId: string, connectorClass: typeof BaseInsurerConnector): void {
    this.connectors.set(insurerId, connectorClass);
  }
  
  async getConnector(insurerId: string): Promise<BaseInsurerConnector> {
    // Return cached instance if exists
    if (this.instances.has(insurerId)) {
      return this.instances.get(insurerId)!;
    }
    
    // Load configuration from database
    const config = await db.query.insurerIntegrationConfigs.findFirst({
      where: eq(insurerIntegrationConfigs.insurerId, insurerId),
    });
    
    if (!config) {
      throw new Error(`No configuration found for insurer: ${insurerId}`);
    }
    
    // Get connector class
    const ConnectorClass = this.connectors.get(insurerId);
    if (!ConnectorClass) {
      throw new Error(`No connector registered for insurer: ${insurerId}`);
    }
    
    // Create and cache instance
    const instance = new ConnectorClass(config);
    this.instances.set(insurerId, instance);
    
    return instance;
  }
  
  async testConnection(insurerId: string): Promise<boolean> {
    const connector = await this.getConnector(insurerId);
    return await connector.healthCheck();
  }
}

// Global registry instance
export const connectorRegistry = new ConnectorRegistry();

// Register all connectors
connectorRegistry.registerConnector('old-mutual', OldMutualConnector);
connectorRegistry.registerConnector('santam', SantamConnector);
connectorRegistry.registerConnector('discovery', DiscoveryConnector);
```

---

## 3. Configuration-Driven Field Mapping

### 3.1 Field Mapping Schema

```typescript
// Database schema for field mappings
export const fieldMappings = pgTable('field_mappings', {
  id: serial('id').primaryKey(),
  insurerId: varchar('insurer_id', { length: 50 }).notNull(),
  kingaField: varchar('kinga_field', { length: 200 }).notNull(),
  insurerField: varchar('insurer_field', { length: 200 }).notNull(),
  dataType: varchar('data_type', { length: 50 }).notNull(), // 'string', 'number', 'date', 'boolean'
  transformation: varchar('transformation', { length: 50 }), // 'uppercase', 'lowercase', 'date_format', 'custom'
  transformationConfig: jsonb('transformation_config'), // Additional config for transformations
  isRequired: boolean('is_required').default(false),
  defaultValue: text('default_value'),
  validationRules: jsonb('validation_rules'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
```

### 3.2 Field Mapping Configuration Example

```json
{
  "insurerId": "old-mutual",
  "mappings": [
    {
      "kingaField": "claimNumber",
      "insurerField": "claimReference",
      "dataType": "string",
      "isRequired": true
    },
    {
      "kingaField": "policyNumber",
      "insurerField": "policyRef",
      "dataType": "string",
      "transformation": "uppercase",
      "isRequired": true
    },
    {
      "kingaField": "claimDate",
      "insurerField": "dateOfLoss",
      "dataType": "date",
      "transformation": "date_format",
      "transformationConfig": {
        "inputFormat": "ISO8601",
        "outputFormat": "DD/MM/YYYY"
      },
      "isRequired": true
    },
    {
      "kingaField": "estimatedCost",
      "insurerField": "estimatedClaimAmount",
      "dataType": "number",
      "transformation": "currency",
      "transformationConfig": {
        "currency": "ZAR",
        "decimals": 2
      }
    },
    {
      "kingaField": "vehicle.make",
      "insurerField": "vehicleDetails.manufacturer",
      "dataType": "string",
      "isRequired": true
    },
    {
      "kingaField": "vehicle.model",
      "insurerField": "vehicleDetails.modelName",
      "dataType": "string",
      "isRequired": true
    },
    {
      "kingaField": "vehicle.year",
      "insurerField": "vehicleDetails.yearOfManufacture",
      "dataType": "number",
      "validationRules": {
        "min": 1900,
        "max": 2026
      }
    },
    {
      "kingaField": "fraudScore",
      "insurerField": "riskAssessment.fraudIndicator",
      "dataType": "number",
      "transformation": "scale",
      "transformationConfig": {
        "inputRange": [0, 100],
        "outputRange": [0, 10]
      }
    }
  ]
}
```

### 3.3 Field Mapper Implementation

```typescript
// server/integrations/field-mapper.ts
export class FieldMapper {
  private mappings: FieldMapping[];
  
  constructor(mappings: FieldMapping[]) {
    this.mappings = mappings;
  }
  
  mapToInsurer(kingaData: any): any {
    const insurerData: any = {};
    
    for (const mapping of this.mappings) {
      const value = this.getNestedValue(kingaData, mapping.kingaField);
      
      if (value === undefined || value === null) {
        if (mapping.isRequired && mapping.defaultValue) {
          this.setNestedValue(insurerData, mapping.insurerField, mapping.defaultValue);
        } else if (mapping.isRequired) {
          throw new Error(`Required field missing: ${mapping.kingaField}`);
        }
        continue;
      }
      
      // Apply transformations
      const transformedValue = this.transformValue(value, mapping);
      
      // Validate
      if (mapping.validationRules) {
        this.validateValue(transformedValue, mapping.validationRules);
      }
      
      this.setNestedValue(insurerData, mapping.insurerField, transformedValue);
    }
    
    return insurerData;
  }
  
  mapFromInsurer(insurerData: any): any {
    const kingaData: any = {};
    
    // Reverse mapping
    for (const mapping of this.mappings) {
      const value = this.getNestedValue(insurerData, mapping.insurerField);
      
      if (value !== undefined && value !== null) {
        const transformedValue = this.reverseTransformValue(value, mapping);
        this.setNestedValue(kingaData, mapping.kingaField, transformedValue);
      }
    }
    
    return kingaData;
  }
  
  private transformValue(value: any, mapping: FieldMapping): any {
    if (!mapping.transformation) return value;
    
    switch (mapping.transformation) {
      case 'uppercase':
        return String(value).toUpperCase();
        
      case 'lowercase':
        return String(value).toLowerCase();
        
      case 'date_format':
        return this.transformDate(value, mapping.transformationConfig);
        
      case 'currency':
        return this.transformCurrency(value, mapping.transformationConfig);
        
      case 'scale':
        return this.scaleValue(value, mapping.transformationConfig);
        
      case 'custom':
        return this.customTransform(value, mapping.transformationConfig);
        
      default:
        return value;
    }
  }
  
  private transformDate(value: any, config: any): string {
    const date = new Date(value);
    const format = config.outputFormat || 'ISO8601';
    
    if (format === 'ISO8601') {
      return date.toISOString();
    } else if (format === 'DD/MM/YYYY') {
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
    } else if (format === 'YYYY-MM-DD') {
      return date.toISOString().split('T')[0];
    }
    
    return value;
  }
  
  private transformCurrency(value: number, config: any): string {
    const decimals = config.decimals || 2;
    const currency = config.currency || 'ZAR';
    return `${currency} ${value.toFixed(decimals)}`;
  }
  
  private scaleValue(value: number, config: any): number {
    const [inMin, inMax] = config.inputRange;
    const [outMin, outMax] = config.outputRange;
    return ((value - inMin) / (inMax - inMin)) * (outMax - outMin) + outMin;
  }
  
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }
  
  private setNestedValue(obj: any, path: string, value: any): void {
    const keys = path.split('.');
    const lastKey = keys.pop()!;
    const target = keys.reduce((current, key) => {
      if (!current[key]) current[key] = {};
      return current[key];
    }, obj);
    target[lastKey] = value;
  }
  
  private validateValue(value: any, rules: any): void {
    if (rules.min !== undefined && value < rules.min) {
      throw new Error(`Value ${value} is below minimum ${rules.min}`);
    }
    if (rules.max !== undefined && value > rules.max) {
      throw new Error(`Value ${value} exceeds maximum ${rules.max}`);
    }
    if (rules.pattern && !new RegExp(rules.pattern).test(value)) {
      throw new Error(`Value ${value} does not match pattern ${rules.pattern}`);
    }
  }
}
```

---

## 4. Secure Data Exchange Protocols

### 4.1 Authentication Methods

**OAuth 2.0 Client Credentials Flow**
```typescript
export class OAuth2AuthProvider {
  async getAccessToken(config: OAuth2Config): Promise<string> {
    const response = await axios.post(config.tokenUrl, {
      grant_type: 'client_credentials',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      scope: config.scope,
    });
    
    return response.data.access_token;
  }
}
```

**API Key Authentication**
```typescript
export class ApiKeyAuthProvider {
  getHeaders(apiKey: string): Record<string, string> {
    return {
      'X-API-Key': apiKey,
      'X-Request-ID': crypto.randomUUID(),
    };
  }
}
```

**Mutual TLS (mTLS)**
```typescript
export class MTLSAuthProvider {
  createHttpsAgent(config: MTLSConfig): https.Agent {
    return new https.Agent({
      cert: fs.readFileSync(config.clientCertPath),
      key: fs.readFileSync(config.clientKeyPath),
      ca: fs.readFileSync(config.caCertPath),
      rejectUnauthorized: true,
    });
  }
}
```

### 4.2 Data Encryption

**Payload Encryption**
```typescript
export class PayloadEncryption {
  async encryptPayload(data: any, publicKey: string): Promise<string> {
    const dataString = JSON.stringify(data);
    const encrypted = crypto.publicEncrypt(
      {
        key: publicKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      },
      Buffer.from(dataString)
    );
    return encrypted.toString('base64');
  }
  
  async decryptPayload(encryptedData: string, privateKey: string): Promise<any> {
    const buffer = Buffer.from(encryptedData, 'base64');
    const decrypted = crypto.privateDecrypt(
      {
        key: privateKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      },
      buffer
    );
    return JSON.parse(decrypted.toString());
  }
}
```

### 4.3 Request Signing

```typescript
export class RequestSigner {
  signRequest(method: string, url: string, body: any, secret: string): string {
    const timestamp = Date.now();
    const payload = `${method}|${url}|${JSON.stringify(body)}|${timestamp}`;
    const signature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
    return `${timestamp}.${signature}`;
  }
  
  verifySignature(signature: string, method: string, url: string, body: any, secret: string): boolean {
    const [timestamp, receivedSig] = signature.split('.');
    const payload = `${method}|${url}|${JSON.stringify(body)}|${timestamp}`;
    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
    return receivedSig === expectedSig;
  }
}
```

---

## 5. Insurer-Specific Workflow Rules

### 5.1 Workflow Rule Schema

```typescript
export const workflowRules = pgTable('workflow_rules', {
  id: serial('id').primaryKey(),
  insurerId: varchar('insurer_id', { length: 50 }).notNull(),
  ruleName: varchar('rule_name', { length: 100 }).notNull(),
  ruleType: varchar('rule_type', { length: 50 }).notNull(), // 'approval_threshold', 'auto_approve', 'require_review'
  conditions: jsonb('conditions').notNull(), // JSON logic conditions
  actions: jsonb('actions').notNull(), // Actions to execute
  priority: integer('priority').default(0),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
```

### 5.2 Workflow Rule Examples

```json
{
  "insurerId": "old-mutual",
  "rules": [
    {
      "ruleName": "Auto-approve low-value claims",
      "ruleType": "auto_approve",
      "priority": 1,
      "conditions": {
        "and": [
          { "<=": [{ "var": "estimatedCost" }, 10000] },
          { "<=": [{ "var": "fraudScore" }, 30] },
          { "==": [{ "var": "hasAllDocuments" }, true] }
        ]
      },
      "actions": [
        { "type": "approve_claim", "config": { "autoApprove": true } },
        { "type": "notify_insurer", "config": { "template": "auto_approved" } }
      ]
    },
    {
      "ruleName": "Require senior approval for high-value claims",
      "ruleType": "require_review",
      "priority": 2,
      "conditions": {
        "or": [
          { ">": [{ "var": "estimatedCost" }, 100000] },
          { ">": [{ "var": "fraudScore" }, 70] }
        ]
      },
      "actions": [
        { "type": "assign_to_role", "config": { "role": "senior_assessor" } },
        { "type": "set_sla", "config": { "hours": 48 } },
        { "type": "notify_insurer", "config": { "template": "senior_review_required" } }
      ]
    },
    {
      "ruleName": "Flag suspicious patterns",
      "ruleType": "fraud_check",
      "priority": 3,
      "conditions": {
        "or": [
          { ">": [{ "var": "fraudScore" }, 80] },
          { "==": [{ "var": "hasSuspiciousPatterns" }, true] },
          { ">": [{ "var": "claimFrequency30Days" }, 3] }
        ]
      },
      "actions": [
        { "type": "flag_for_investigation", "config": { "reason": "high_fraud_risk" } },
        { "type": "notify_fraud_team", "config": { "urgency": "high" } },
        { "type": "hold_payment", "config": {} }
      ]
    }
  ]
}
```

### 5.3 Workflow Rule Engine

```typescript
// server/integrations/workflow-rule-engine.ts
import { Engine } from 'json-rules-engine';

export class WorkflowRuleEngine {
  private engine: Engine;
  
  constructor(rules: WorkflowRule[]) {
    this.engine = new Engine();
    
    // Add all rules to engine
    for (const rule of rules.sort((a, b) => b.priority - a.priority)) {
      if (rule.isActive) {
        this.engine.addRule({
          conditions: rule.conditions,
          event: {
            type: rule.ruleType,
            params: {
              ruleName: rule.ruleName,
              actions: rule.actions,
            },
          },
          priority: rule.priority,
        });
      }
    }
  }
  
  async evaluateClaim(claim: KingaClaim): Promise<WorkflowAction[]> {
    const facts = {
      estimatedCost: claim.estimatedCost,
      fraudScore: claim.fraudScore,
      hasAllDocuments: claim.documents.length >= 3,
      hasSuspiciousPatterns: claim.fraudFlags?.length > 0,
      claimFrequency30Days: await this.getClaimFrequency(claim.policyNumber, 30),
    };
    
    const { events } = await this.engine.run(facts);
    
    const actions: WorkflowAction[] = [];
    for (const event of events) {
      actions.push(...event.params.actions);
    }
    
    return actions;
  }
  
  async executeActions(actions: WorkflowAction[], claim: KingaClaim): Promise<void> {
    for (const action of actions) {
      await this.executeAction(action, claim);
    }
  }
  
  private async executeAction(action: WorkflowAction, claim: KingaClaim): Promise<void> {
    switch (action.type) {
      case 'approve_claim':
        await this.approveClaim(claim.id, action.config);
        break;
        
      case 'assign_to_role':
        await this.assignToRole(claim.id, action.config.role);
        break;
        
      case 'set_sla':
        await this.setSLA(claim.id, action.config.hours);
        break;
        
      case 'notify_insurer':
        await this.notifyInsurer(claim.insurerId, action.config.template, claim);
        break;
        
      case 'flag_for_investigation':
        await this.flagForInvestigation(claim.id, action.config.reason);
        break;
        
      case 'hold_payment':
        await this.holdPayment(claim.id);
        break;
    }
  }
}
```

---

## 6. Webhook & Event Handling

### 6.1 Webhook Receiver

```typescript
// server/integrations/webhook-receiver.ts
export const webhookRouter = express.Router();

webhookRouter.post('/webhooks/:insurerId/:event', async (req, res) => {
  const { insurerId, event } = req.params;
  const signature = req.headers['x-webhook-signature'] as string;
  
  // Verify webhook signature
  const config = await getInsurerConfig(insurerId);
  const isValid = verifyWebhookSignature(req.body, signature, config.webhookSecret);
  
  if (!isValid) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  
  // Log webhook receipt
  await logWebhookEvent({
    insurerId,
    event,
    payload: req.body,
    receivedAt: new Date(),
  });
  
  // Process webhook based on event type
  try {
    await processWebhookEvent(insurerId, event, req.body);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Processing failed' });
  }
});

async function processWebhookEvent(insurerId: string, event: string, payload: any): Promise<void> {
  switch (event) {
    case 'claim.status_changed':
      await handleClaimStatusChange(insurerId, payload);
      break;
      
    case 'assessment.requested':
      await handleAssessmentRequest(insurerId, payload);
      break;
      
    case 'document.uploaded':
      await handleDocumentUpload(insurerId, payload);
      break;
      
    case 'payment.processed':
      await handlePaymentProcessed(insurerId, payload);
      break;
      
    default:
      console.warn(`Unknown webhook event: ${event}`);
  }
}
```

### 6.2 Outbound Webhooks

```typescript
export class WebhookDispatcher {
  async sendWebhook(url: string, event: string, payload: any, secret: string): Promise<void> {
    const timestamp = Date.now();
    const signature = this.generateSignature(payload, timestamp, secret);
    
    await axios.post(url, payload, {
      headers: {
        'X-Webhook-Event': event,
        'X-Webhook-Signature': signature,
        'X-Webhook-Timestamp': timestamp.toString(),
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });
  }
  
  private generateSignature(payload: any, timestamp: number, secret: string): string {
    const data = `${timestamp}.${JSON.stringify(payload)}`;
    return crypto.createHmac('sha256', secret).update(data).digest('hex');
  }
}
```

---

## 7. Insurer Onboarding Process

### 7.1 Onboarding Checklist

1. **Initial Setup**
   - [ ] Create insurer organization in KINGA
   - [ ] Assign insurer admin user
   - [ ] Configure authentication credentials

2. **Technical Integration**
   - [ ] Obtain API documentation from insurer
   - [ ] Configure API endpoints and authentication
   - [ ] Define field mappings
   - [ ] Configure workflow rules
   - [ ] Set up webhook endpoints

3. **Testing**
   - [ ] Test authentication
   - [ ] Submit test claim
   - [ ] Verify field mapping
   - [ ] Test workflow rules
   - [ ] Test webhook delivery

4. **Production Deployment**
   - [ ] Enable production credentials
   - [ ] Configure monitoring alerts
   - [ ] Train insurer users
   - [ ] Go-live

### 7.2 Onboarding Wizard UI

```typescript
// client/src/pages/InsurerOnboarding.tsx
export default function InsurerOnboarding() {
  const [step, setStep] = useState(1);
  
  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">Insurer Integration Onboarding</h1>
      
      <Stepper currentStep={step} steps={[
        'Basic Information',
        'API Configuration',
        'Field Mapping',
        'Workflow Rules',
        'Testing',
        'Go Live',
      ]} />
      
      {step === 1 && <BasicInformationStep onNext={() => setStep(2)} />}
      {step === 2 && <APIConfigurationStep onNext={() => setStep(3)} />}
      {step === 3 && <FieldMappingStep onNext={() => setStep(4)} />}
      {step === 4 && <WorkflowRulesStep onNext={() => setStep(5)} />}
      {step === 5 && <TestingStep onNext={() => setStep(6)} />}
      {step === 6 && <GoLiveStep />}
    </div>
  );
}
```

---

## 8. Monitoring & Troubleshooting

### 8.1 Integration Metrics

**CloudWatch Metrics**
- `IntegrationAPICallCount` - Total API calls per insurer
- `IntegrationAPILatency` - Average response time
- `IntegrationAPIErrorRate` - Failed API calls percentage
- `WebhookDeliverySuccess` - Successful webhook deliveries
- `FieldMappingErrors` - Field mapping failures

### 8.2 Integration Dashboard

**Grafana Panels**
1. API call volume by insurer (last 24h)
2. API response time percentiles (p50, p95, p99)
3. Error rate by insurer and endpoint
4. Webhook delivery success rate
5. Field mapping error breakdown
6. Active integrations health status

### 8.3 Troubleshooting Guide

**Common Issues**

| Issue | Symptoms | Resolution |
|-------|----------|------------|
| Authentication failure | 401 Unauthorized | Verify OAuth credentials, check token expiry |
| Field mapping error | 400 Bad Request | Review field mapping configuration, check data types |
| Webhook not received | No callback | Verify webhook URL, check firewall rules |
| Timeout errors | 504 Gateway Timeout | Increase timeout setting, check insurer API status |
| Rate limiting | 429 Too Many Requests | Implement exponential backoff, request rate limit increase |

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-11 | Tavonga Shoko | Initial multi-tenant insurer integration framework |

---

**Classification:** Confidential  
**Distribution:** Integration Team, Insurer Partners (NDA required)  
**Review Cycle:** Quarterly  
**Next Review Date:** 2026-05-11
