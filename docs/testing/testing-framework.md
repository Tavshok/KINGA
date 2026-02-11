# KINGA Comprehensive Testing Framework

**Prepared by:** Tavonga Shoko  
**Date:** 2026-02-11  
**Version:** 1.0  
**Classification:** Internal

---

## Executive Summary

This document defines the comprehensive testing framework for KINGA AutoVerify AI, ensuring production readiness through multi-layered testing strategies. The framework encompasses unit testing with Vitest for business logic validation, integration testing for tRPC endpoints and database operations, API contract testing with Pact for insurer integrations, ML model performance testing for accuracy and latency validation, and event system resilience testing for Kafka-based architecture. The testing pyramid approach ensures 70% unit tests, 20% integration tests, and 10% end-to-end tests, with automated CI/CD integration achieving 85%+ code coverage.

---

## Table of Contents

1. [Testing Architecture Overview](#testing-architecture-overview)
2. [Unit Testing Framework](#unit-testing-framework)
3. [Integration Testing](#integration-testing)
4. [API Contract Testing](#api-contract-testing)
5. [ML Model Performance Testing](#ml-model-performance-testing)
6. [Event System Resilience Testing](#event-system-resilience-testing)
7. [Test Data Management](#test-data-management)
8. [CI/CD Integration](#cicd-integration)
9. [Testing Best Practices](#testing-best-practices)

---

## 1. Testing Architecture Overview

### 1.1 Testing Pyramid

```
                    ┌─────────────────┐
                    │   E2E Tests     │  10%
                    │  (Playwright)   │
                    └─────────────────┘
                  ┌───────────────────────┐
                  │  Integration Tests    │  20%
                  │  (Vitest + Testcontainers)
                  └───────────────────────┘
              ┌─────────────────────────────────┐
              │         Unit Tests              │  70%
              │    (Vitest + Testing Library)   │
              └─────────────────────────────────┘
```

### 1.2 Testing Framework Stack

| Layer | Framework | Purpose |
|-------|-----------|---------|
| Unit Tests | Vitest | Business logic, utilities, pure functions |
| Component Tests | Vitest + Testing Library | React components, UI logic |
| Integration Tests | Vitest + Testcontainers | tRPC endpoints, database operations |
| API Contract Tests | Pact | Insurer API integrations |
| ML Performance Tests | Pytest + MLflow | Model accuracy, latency, drift |
| Event Resilience Tests | Testcontainers + Kafka | Event publishing, consumption, retries |
| E2E Tests | Playwright | Critical user journeys |

### 1.3 Coverage Targets

- **Overall Code Coverage**: 85%+
- **Business Logic Coverage**: 95%+
- **API Endpoints Coverage**: 90%+
- **ML Model Test Coverage**: 100% (all models)
- **Event Handlers Coverage**: 90%+

---

## 2. Unit Testing Framework

### 2.1 Vitest Configuration

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/dist/**',
      ],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 80,
        statements: 85,
      },
    },
    testTimeout: 10000,
    hookTimeout: 10000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './server'),
      '@client': path.resolve(__dirname, './client/src'),
    },
  },
});
```

### 2.2 Unit Test Examples

**Business Logic Testing**
```typescript
// server/cost-optimization.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { CostOptimizer } from './cost-optimization';
import { mockAssessment, mockQuotes } from '../tests/fixtures';

describe('CostOptimizer', () => {
  let optimizer: CostOptimizer;
  
  beforeEach(() => {
    optimizer = new CostOptimizer();
  });
  
  describe('findBestQuote', () => {
    it('should select lowest quote when all quotes are valid', () => {
      const quotes = [
        { panelBeaterId: 'pb1', totalCost: 15000, laborCost: 5000, partsCost: 10000 },
        { panelBeaterId: 'pb2', totalCost: 12000, laborCost: 4000, partsCost: 8000 },
        { panelBeaterId: 'pb3', totalCost: 18000, laborCost: 6000, partsCost: 12000 },
      ];
      
      const best = optimizer.findBestQuote(quotes);
      
      expect(best.panelBeaterId).toBe('pb2');
      expect(best.totalCost).toBe(12000);
    });
    
    it('should consider quality score when costs are similar', () => {
      const quotes = [
        { panelBeaterId: 'pb1', totalCost: 12000, qualityScore: 85 },
        { panelBeaterId: 'pb2', totalCost: 12100, qualityScore: 95 },
      ];
      
      const best = optimizer.findBestQuote(quotes, { considerQuality: true });
      
      expect(best.panelBeaterId).toBe('pb2'); // Higher quality despite slightly higher cost
    });
    
    it('should throw error when no valid quotes provided', () => {
      expect(() => optimizer.findBestQuote([])).toThrow('No valid quotes available');
    });
  });
  
  describe('calculateNegotiationSavings', () => {
    it('should calculate savings correctly', () => {
      const originalQuote = 15000;
      const negotiatedQuote = 12000;
      
      const savings = optimizer.calculateNegotiationSavings(originalQuote, negotiatedQuote);
      
      expect(savings.amount).toBe(3000);
      expect(savings.percentage).toBe(20);
    });
    
    it('should return zero savings when negotiated quote is higher', () => {
      const savings = optimizer.calculateNegotiationSavings(10000, 12000);
      
      expect(savings.amount).toBe(0);
      expect(savings.percentage).toBe(0);
    });
  });
});
```

**Fraud Detection Logic Testing**
```typescript
// server/fraud-detection.test.ts
import { describe, it, expect, vi } from 'vitest';
import { FraudDetector } from './fraud-detection';
import { mockClaim } from '../tests/fixtures';

describe('FraudDetector', () => {
  describe('calculateFraudScore', () => {
    it('should return low score for normal claim', async () => {
      const claim = mockClaim({
        estimatedCost: 8000,
        claimFrequency: 0,
        hasInconsistencies: false,
      });
      
      const detector = new FraudDetector();
      const score = await detector.calculateFraudScore(claim);
      
      expect(score).toBeLessThan(30);
    });
    
    it('should return high score for suspicious claim', async () => {
      const claim = mockClaim({
        estimatedCost: 150000,
        claimFrequency: 5,
        hasInconsistencies: true,
        damageConsistentWithImpact: false,
      });
      
      const detector = new FraudDetector();
      const score = await detector.calculateFraudScore(claim);
      
      expect(score).toBeGreaterThan(70);
    });
    
    it('should flag high-value claims', async () => {
      const claim = mockClaim({ estimatedCost: 200000 });
      
      const detector = new FraudDetector();
      const flags = await detector.getFraudFlags(claim);
      
      expect(flags).toContain('high_value_claim');
    });
    
    it('should flag frequent claimants', async () => {
      const claim = mockClaim({ policyNumber: 'POL123' });
      
      // Mock database to return high claim frequency
      vi.spyOn(detector as any, 'getClaimFrequency').mockResolvedValue(4);
      
      const flags = await detector.getFraudFlags(claim);
      
      expect(flags).toContain('frequent_claimant');
    });
  });
});
```

**Utility Function Testing**
```typescript
// server/utils/date-utils.test.ts
import { describe, it, expect } from 'vitest';
import { calculateBusinessDays, isWithinSLA } from './date-utils';

describe('Date Utilities', () => {
  describe('calculateBusinessDays', () => {
    it('should calculate business days excluding weekends', () => {
      const start = new Date('2026-02-09'); // Monday
      const end = new Date('2026-02-13'); // Friday
      
      const days = calculateBusinessDays(start, end);
      
      expect(days).toBe(5);
    });
    
    it('should exclude public holidays', () => {
      const start = new Date('2026-04-01');
      const end = new Date('2026-04-10');
      const holidays = [new Date('2026-04-03'), new Date('2026-04-06')]; // Good Friday, Family Day
      
      const days = calculateBusinessDays(start, end, holidays);
      
      expect(days).toBe(5); // 9 days - 2 weekends - 2 holidays
    });
  });
  
  describe('isWithinSLA', () => {
    it('should return true when within SLA', () => {
      const createdAt = new Date('2026-02-10T09:00:00');
      const now = new Date('2026-02-11T10:00:00');
      const slaHours = 48;
      
      expect(isWithinSLA(createdAt, now, slaHours)).toBe(true);
    });
    
    it('should return false when SLA breached', () => {
      const createdAt = new Date('2026-02-08T09:00:00');
      const now = new Date('2026-02-11T10:00:00');
      const slaHours = 48;
      
      expect(isWithinSLA(createdAt, now, slaHours)).toBe(false);
    });
  });
});
```

---

## 3. Integration Testing

### 3.1 tRPC Endpoint Testing

```typescript
// server/routers.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createCaller } from './test-utils/trpc-test-helper';
import { db } from './db';
import { claims, users } from '../drizzle/schema';

describe('Claims Router', () => {
  let caller: ReturnType<typeof createCaller>;
  let testUser: typeof users.$inferSelect;
  
  beforeAll(async () => {
    // Set up test database
    testUser = await db.insert(users).values({
      email: 'test@example.com',
      role: 'insurer',
      organizationId: 'org-test',
    }).returning().then(rows => rows[0]);
    
    caller = createCaller({ user: testUser });
  });
  
  afterAll(async () => {
    // Clean up test data
    await db.delete(claims).where(eq(claims.userId, testUser.id));
    await db.delete(users).where(eq(users.id, testUser.id));
  });
  
  describe('submitClaim', () => {
    it('should create claim successfully', async () => {
      const input = {
        policyNumber: 'POL-TEST-001',
        claimDate: new Date(),
        vehicleMake: 'Toyota',
        vehicleModel: 'Corolla',
        vehicleYear: 2020,
        estimatedCost: 15000,
      };
      
      const result = await caller.claims.submitClaim(input);
      
      expect(result.id).toBeDefined();
      expect(result.claimNumber).toMatch(/^CLM-\d{10}$/);
      expect(result.status).toBe('submitted');
    });
    
    it('should reject claim with invalid policy number', async () => {
      const input = {
        policyNumber: 'INVALID',
        claimDate: new Date(),
        vehicleMake: 'Toyota',
        vehicleModel: 'Corolla',
        vehicleYear: 2020,
        estimatedCost: 15000,
      };
      
      await expect(caller.claims.submitClaim(input)).rejects.toThrow('Invalid policy number');
    });
    
    it('should enforce user permissions', async () => {
      const guestCaller = createCaller({ user: null });
      
      await expect(guestCaller.claims.submitClaim({} as any)).rejects.toThrow('UNAUTHORIZED');
    });
  });
  
  describe('getClaimById', () => {
    it('should return claim details', async () => {
      const claim = await db.insert(claims).values({
        userId: testUser.id,
        claimNumber: 'CLM-TEST-001',
        policyNumber: 'POL-TEST-001',
        status: 'submitted',
      }).returning().then(rows => rows[0]);
      
      const result = await caller.claims.getClaimById({ id: claim.id });
      
      expect(result.id).toBe(claim.id);
      expect(result.claimNumber).toBe('CLM-TEST-001');
    });
    
    it('should throw error for non-existent claim', async () => {
      await expect(caller.claims.getClaimById({ id: 999999 })).rejects.toThrow('Claim not found');
    });
  });
});
```

### 3.2 Database Integration Testing with Testcontainers

```typescript
// tests/setup.ts
import { beforeAll, afterAll } from 'vitest';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';

let mysqlContainer: StartedTestContainer;
let connection: mysql.Connection;

beforeAll(async () => {
  // Start MySQL container
  mysqlContainer = await new GenericContainer('mysql:8.0')
    .withEnvironment({
      MYSQL_ROOT_PASSWORD: 'test',
      MYSQL_DATABASE: 'kinga_test',
    })
    .withExposedPorts(3306)
    .start();
  
  const host = mysqlContainer.getHost();
  const port = mysqlContainer.getMappedPort(3306);
  
  // Connect to test database
  connection = await mysql.createConnection({
    host,
    port,
    user: 'root',
    password: 'test',
    database: 'kinga_test',
  });
  
  // Run migrations
  const db = drizzle(connection);
  await runMigrations(db);
  
  // Set global test database
  global.testDb = db;
}, 60000);

afterAll(async () => {
  await connection?.end();
  await mysqlContainer?.stop();
});
```

---

## 4. API Contract Testing

### 4.1 Pact Consumer Tests

```typescript
// tests/pact/old-mutual-consumer.test.ts
import { PactV3, MatchersV3 } from '@pact-foundation/pact';
import { OldMutualConnector } from '../../server/integrations/connectors/old-mutual-connector';

const { like, eachLike, iso8601DateTime } = MatchersV3;

const provider = new PactV3({
  consumer: 'KINGA',
  provider: 'OldMutual-ClaimsPro',
  dir: './pacts',
});

describe('Old Mutual API Contract', () => {
  describe('Submit Claim', () => {
    it('should submit claim successfully', async () => {
      await provider
        .given('a valid policy exists')
        .uponReceiving('a claim submission request')
        .withRequest({
          method: 'POST',
          path: '/api/v2/claims',
          headers: {
            'Content-Type': 'application/json',
            Authorization: like('Bearer token123'),
          },
          body: {
            policyReference: like('POL-12345'),
            dateOfLoss: iso8601DateTime(),
            vehicleDetails: {
              manufacturer: like('Toyota'),
              modelName: like('Corolla'),
              yearOfManufacture: like(2020),
            },
            estimatedClaimAmount: like(15000),
          },
        })
        .willRespondWith({
          status: 201,
          headers: { 'Content-Type': 'application/json' },
          body: {
            claimReference: like('OM-CLM-789456'),
            status: like('NEW'),
            message: like('Claim submitted successfully'),
            createdAt: iso8601DateTime(),
          },
        })
        .executeTest(async (mockServer) => {
          const connector = new OldMutualConnector({
            baseUrl: mockServer.url,
            authType: 'oauth2',
            credentials: { clientId: 'test', clientSecret: 'test' },
            timeout: 5000,
            retryAttempts: 3,
            fieldMappings: [],
            workflowRules: [],
          });
          
          const result = await connector.submitClaim({
            policyNumber: 'POL-12345',
            claimDate: new Date(),
            vehicleMake: 'Toyota',
            vehicleModel: 'Corolla',
            vehicleYear: 2020,
            estimatedCost: 15000,
          });
          
          expect(result.externalClaimId).toBe('OM-CLM-789456');
          expect(result.status).toBe('NEW');
        });
    });
  });
  
  describe('Get Claim Status', () => {
    it('should retrieve claim status', async () => {
      await provider
        .given('a claim exists with reference OM-CLM-789456')
        .uponReceiving('a claim status request')
        .withRequest({
          method: 'GET',
          path: '/api/v2/claims/OM-CLM-789456',
          headers: {
            Authorization: like('Bearer token123'),
          },
        })
        .willRespondWith({
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: {
            claimReference: like('OM-CLM-789456'),
            status: like('UNDER_REVIEW'),
            lastUpdated: iso8601DateTime(),
          },
        })
        .executeTest(async (mockServer) => {
          const connector = new OldMutualConnector({
            baseUrl: mockServer.url,
            // ... config
          });
          
          const status = await connector.getClaimStatus('OM-CLM-789456');
          
          expect(status).toBe('under_review');
        });
    });
  });
});
```

### 4.2 Pact Provider Verification

```typescript
// tests/pact/kinga-provider.test.ts
import { Verifier } from '@pact-foundation/pact';
import { startServer } from '../../server/_core';

describe('KINGA Provider Verification', () => {
  let server: any;
  let serverUrl: string;
  
  beforeAll(async () => {
    server = await startServer();
    serverUrl = `http://localhost:${server.address().port}`;
  });
  
  afterAll(async () => {
    await server.close();
  });
  
  it('should verify pacts with consumers', async () => {
    const verifier = new Verifier({
      providerBaseUrl: serverUrl,
      pactUrls: ['./pacts/insurer-portal-kinga.json'],
      provider: 'KINGA',
      providerVersion: process.env.GIT_COMMIT || '1.0.0',
      publishVerificationResult: process.env.CI === 'true',
      stateHandlers: {
        'a claim exists with ID 123': async () => {
          // Set up test data
          await db.insert(claims).values({
            id: 123,
            claimNumber: 'CLM-TEST-123',
            status: 'submitted',
          });
        },
        'user is authenticated': async () => {
          // Set up authenticated session
        },
      },
    });
    
    await verifier.verifyProvider();
  });
});
```

---

## 5. ML Model Performance Testing

### 5.1 Model Accuracy Testing

```python
# tests/ml/test_fraud_model.py
import pytest
import pandas as pd
import mlflow
from sklearn.metrics import roc_auc_score, precision_recall_curve, f1_score

class TestFraudDetectionModel:
    @pytest.fixture
    def model(self):
        """Load latest fraud detection model from MLflow"""
        client = mlflow.tracking.MlflowClient()
        model_version = client.get_latest_versions("fraud-detection", stages=["Production"])[0]
        return mlflow.pyfunc.load_model(f"models:/fraud-detection/{model_version.version}")
    
    @pytest.fixture
    def test_data(self):
        """Load test dataset"""
        return pd.read_csv('tests/data/fraud_test_set.csv')
    
    def test_model_auc_threshold(self, model, test_data):
        """Ensure AUC-ROC meets minimum threshold"""
        X_test = test_data.drop('is_fraud', axis=1)
        y_test = test_data['is_fraud']
        
        y_pred_proba = model.predict(X_test)
        auc = roc_auc_score(y_test, y_pred_proba)
        
        assert auc >= 0.90, f"AUC {auc:.3f} below threshold 0.90"
    
    def test_model_precision_at_recall(self, model, test_data):
        """Ensure precision at 80% recall meets threshold"""
        X_test = test_data.drop('is_fraud', axis=1)
        y_test = test_data['is_fraud']
        
        y_pred_proba = model.predict(X_test)
        precision, recall, _ = precision_recall_curve(y_test, y_pred_proba)
        
        # Find precision at 80% recall
        idx = (recall >= 0.80).argmax()
        precision_at_80_recall = precision[idx]
        
        assert precision_at_80_recall >= 0.75, \
            f"Precision {precision_at_80_recall:.3f} at 80% recall below threshold 0.75"
    
    def test_model_f1_score(self, model, test_data):
        """Ensure F1 score meets minimum threshold"""
        X_test = test_data.drop('is_fraud', axis=1)
        y_test = test_data['is_fraud']
        
        y_pred_proba = model.predict(X_test)
        y_pred = (y_pred_proba >= 0.5).astype(int)
        
        f1 = f1_score(y_test, y_pred)
        
        assert f1 >= 0.85, f"F1 score {f1:.3f} below threshold 0.85"
    
    def test_model_inference_latency(self, model, test_data):
        """Ensure inference latency meets SLA"""
        import time
        
        X_test = test_data.drop('is_fraud', axis=1).head(100)
        
        start = time.time()
        _ = model.predict(X_test)
        end = time.time()
        
        latency_ms = (end - start) / len(X_test) * 1000
        
        assert latency_ms < 50, f"Inference latency {latency_ms:.2f}ms exceeds 50ms SLA"
    
    def test_model_data_drift(self, model, test_data):
        """Detect data drift in test set"""
        from scipy.stats import ks_2samp
        
        # Load training data distribution
        train_data = pd.read_csv('tests/data/fraud_train_set.csv')
        
        # Compare distributions for key features
        drift_detected = False
        for col in ['estimated_cost', 'claim_frequency', 'vehicle_age']:
            statistic, p_value = ks_2samp(train_data[col], test_data[col])
            
            if p_value < 0.05:
                drift_detected = True
                print(f"Data drift detected in {col}: p-value={p_value:.4f}")
        
        assert not drift_detected, "Data drift detected - model retraining recommended"
```

### 5.2 Model Bias Testing

```python
# tests/ml/test_model_fairness.py
import pytest
from aif360.datasets import BinaryLabelDataset
from aif360.metrics import BinaryLabelDatasetMetric, ClassificationMetric

class TestModelFairness:
    def test_demographic_parity(self, model, test_data):
        """Ensure model predictions are fair across demographics"""
        # Test for bias across vehicle make (proxy for socioeconomic status)
        dataset = BinaryLabelDataset(
            df=test_data,
            label_names=['is_fraud'],
            protected_attribute_names=['vehicle_make'],
        )
        
        y_pred = model.predict(test_data.drop('is_fraud', axis=1))
        
        metric = ClassificationMetric(
            dataset,
            dataset.copy(deepcopy=True),
            unprivileged_groups=[{'vehicle_make': 'budget'}],
            privileged_groups=[{'vehicle_make': 'luxury'}],
        )
        
        disparate_impact = metric.disparate_impact()
        
        # Disparate impact should be between 0.8 and 1.25 (80% rule)
        assert 0.8 <= disparate_impact <= 1.25, \
            f"Disparate impact {disparate_impact:.3f} indicates bias"
```

---

## 6. Event System Resilience Testing

### 6.1 Kafka Event Publishing Tests

```typescript
// tests/events/event-publisher.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Kafka } from 'kafkajs';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { EventPublisher } from '../../shared/events/src/publisher/event-publisher';

describe('Event Publisher Resilience', () => {
  let kafkaContainer: StartedTestContainer;
  let kafka: Kafka;
  let publisher: EventPublisher;
  
  beforeAll(async () => {
    kafkaContainer = await new GenericContainer('confluentinc/cp-kafka:7.5.0')
      .withEnvironment({
        KAFKA_ZOOKEEPER_CONNECT: 'zookeeper:2181',
        KAFKA_ADVERTISED_LISTENERS: 'PLAINTEXT://localhost:9092',
      })
      .withExposedPorts(9092)
      .start();
    
    const brokers = [`localhost:${kafkaContainer.getMappedPort(9092)}`];
    kafka = new Kafka({ clientId: 'test', brokers });
    publisher = new EventPublisher({ brokers });
  }, 60000);
  
  afterAll(async () => {
    await publisher.disconnect();
    await kafkaContainer.stop();
  });
  
  it('should publish event successfully', async () => {
    const event = {
      type: 'ClaimSubmitted',
      version: '1.0',
      data: {
        claimId: 123,
        policyNumber: 'POL-TEST-001',
        submittedAt: new Date().toISOString(),
      },
    };
    
    await expect(publisher.publish('kinga.claims', event)).resolves.not.toThrow();
  });
  
  it('should retry on transient failures', async () => {
    // Simulate network failure
    await kafkaContainer.stop();
    
    const publishPromise = publisher.publish('kinga.claims', {
      type: 'ClaimSubmitted',
      version: '1.0',
      data: { claimId: 456 },
    });
    
    // Restart Kafka after 2 seconds
    setTimeout(async () => {
      await kafkaContainer.start();
    }, 2000);
    
    // Should succeed after retry
    await expect(publishPromise).resolves.not.toThrow();
  }, 30000);
  
  it('should send to DLQ after max retries', async () => {
    const dlqMessages: any[] = [];
    
    // Subscribe to DLQ
    const consumer = kafka.consumer({ groupId: 'test-dlq' });
    await consumer.connect();
    await consumer.subscribe({ topic: 'kinga.dlq' });
    
    consumer.run({
      eachMessage: async ({ message }) => {
        dlqMessages.push(JSON.parse(message.value!.toString()));
      },
    });
    
    // Publish invalid event that will fail validation
    await publisher.publish('kinga.claims', {
      type: 'InvalidEvent',
      version: '999.0',
      data: {},
    });
    
    // Wait for DLQ message
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    expect(dlqMessages.length).toBeGreaterThan(0);
    expect(dlqMessages[0].originalTopic).toBe('kinga.claims');
  });
});
```

### 6.2 Event Consumer Tests

```typescript
// tests/events/event-consumer.test.ts
describe('Event Consumer Resilience', () => {
  it('should handle duplicate events idempotently', async () => {
    const consumer = new EventSubscriber({
      groupId: 'test-consumer',
      topics: ['kinga.claims'],
    });
    
    let processCount = 0;
    
    consumer.on('ClaimSubmitted', async (event) => {
      processCount++;
      // Process event
    });
    
    await consumer.connect();
    
    // Publish same event twice
    const event = { type: 'ClaimSubmitted', version: '1.0', data: { claimId: 789 } };
    await publisher.publish('kinga.claims', event);
    await publisher.publish('kinga.claims', event);
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Should process only once due to idempotency
    expect(processCount).toBe(1);
  });
  
  it('should handle consumer lag gracefully', async () => {
    // Publish 1000 events rapidly
    const events = Array.from({ length: 1000 }, (_, i) => ({
      type: 'ClaimSubmitted',
      version: '1.0',
      data: { claimId: i },
    }));
    
    await Promise.all(events.map(e => publisher.publish('kinga.claims', e)));
    
    // Start consumer
    const consumer = new EventSubscriber({
      groupId: 'test-lag',
      topics: ['kinga.claims'],
    });
    
    let processed = 0;
    consumer.on('ClaimSubmitted', async () => {
      processed++;
    });
    
    await consumer.connect();
    
    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Should process all events
    expect(processed).toBe(1000);
  });
});
```

---

## 7. Test Data Management

### 7.1 Test Fixtures

```typescript
// tests/fixtures/claim-fixtures.ts
import { faker } from '@faker-js/faker';

export function mockClaim(overrides?: Partial<KingaClaim>): KingaClaim {
  return {
    id: faker.number.int({ min: 1, max: 100000 }),
    claimNumber: `CLM-${faker.string.numeric(10)}`,
    policyNumber: `POL-${faker.string.alphanumeric(8).toUpperCase()}`,
    claimDate: faker.date.recent({ days: 30 }),
    vehicleMake: faker.vehicle.manufacturer(),
    vehicleModel: faker.vehicle.model(),
    vehicleYear: faker.number.int({ min: 2010, max: 2026 }),
    estimatedCost: faker.number.int({ min: 5000, max: 50000 }),
    status: 'submitted',
    fraudScore: faker.number.int({ min: 0, max: 100 }),
    ...overrides,
  };
}

export function mockAssessment(overrides?: Partial<KingaAssessment>): KingaAssessment {
  return {
    id: faker.number.int({ min: 1, max: 100000 }),
    claimId: faker.number.int({ min: 1, max: 100000 }),
    assessorName: faker.person.fullName(),
    assessmentDate: faker.date.recent({ days: 7 }),
    damagedComponents: [
      { name: 'Front Bumper', repairCost: 3500, replaceCost: 5000 },
      { name: 'Headlight', repairCost: 0, replaceCost: 1200 },
    ],
    totalCost: 6200,
    ...overrides,
  };
}
```

### 7.2 Database Seeding

```typescript
// tests/utils/seed-test-data.ts
export async function seedTestData() {
  const users = await db.insert(usersTable).values([
    { email: 'admin@test.com', role: 'admin', organizationId: 'org-1' },
    { email: 'insurer@test.com', role: 'insurer', organizationId: 'org-1' },
    { email: 'assessor@test.com', role: 'assessor', organizationId: 'org-2' },
  ]).returning();
  
  const claims = await db.insert(claimsTable).values([
    mockClaim({ userId: users[0].id, status: 'submitted' }),
    mockClaim({ userId: users[1].id, status: 'under_review' }),
    mockClaim({ userId: users[1].id, status: 'approved' }),
  ]).returning();
  
  return { users, claims };
}
```

---

## 8. CI/CD Integration

### 8.1 GitHub Actions Workflow

```yaml
# .github/workflows/test.yml
name: Test Suite

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '22'
          cache: 'pnpm'
      
      - name: Install dependencies
        run: pnpm install
      
      - name: Run unit tests
        run: pnpm test:unit --coverage
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
  
  integration-tests:
    runs-on: ubuntu-latest
    services:
      mysql:
        image: mysql:8.0
        env:
          MYSQL_ROOT_PASSWORD: test
          MYSQL_DATABASE: kinga_test
        ports:
          - 3306:3306
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '22'
      
      - name: Install dependencies
        run: pnpm install
      
      - name: Run migrations
        run: pnpm db:push
        env:
          DATABASE_URL: mysql://root:test@localhost:3306/kinga_test
      
      - name: Run integration tests
        run: pnpm test:integration
  
  ml-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.11'
      
      - name: Install dependencies
        run: pip install -r python/requirements-test.txt
      
      - name: Run ML tests
        run: pytest python/tests/ --cov=python --cov-report=xml
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage.xml
```

### 8.2 Test Scripts

```json
// package.json
{
  "scripts": {
    "test": "vitest",
    "test:unit": "vitest run --coverage",
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "test:e2e": "playwright test",
    "test:pact": "vitest run --config vitest.pact.config.ts",
    "test:all": "pnpm test:unit && pnpm test:integration && pnpm test:e2e",
    "test:watch": "vitest watch",
    "test:ui": "vitest --ui"
  }
}
```

---

## 9. Testing Best Practices

### 9.1 Test Organization

- **Collocate tests with code**: Place `.test.ts` files next to the code they test
- **Use descriptive test names**: `it('should reject claim with invalid policy number')`
- **Follow AAA pattern**: Arrange, Act, Assert
- **One assertion per test**: Focus on single behavior
- **Use test fixtures**: Reuse common test data

### 9.2 Mocking Strategy

```typescript
// Use vi.mock for external dependencies
vi.mock('./external-api', () => ({
  fetchData: vi.fn().mockResolvedValue({ data: 'mocked' }),
}));

// Use vi.spyOn for partial mocking
const spy = vi.spyOn(service, 'method').mockReturnValue('mocked');

// Clean up after tests
afterEach(() => {
  vi.restoreAllMocks();
});
```

### 9.3 Test Coverage Guidelines

- **Critical paths**: 100% coverage for authentication, payment, fraud detection
- **Business logic**: 95% coverage for core domain logic
- **UI components**: 80% coverage for user interactions
- **Utilities**: 90% coverage for helper functions

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-11 | Tavonga Shoko | Initial comprehensive testing framework |

---

**Classification:** Internal  
**Distribution:** Engineering Team  
**Review Cycle:** Quarterly  
**Next Review Date:** 2026-05-11
