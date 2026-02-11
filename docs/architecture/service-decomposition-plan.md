# KINGA Microservices Decomposition Plan

**Document Classification:** Technical Architecture Design  
**System:** KINGA - AutoVerify AI Insurance Claims Management Platform  
**Document Date:** February 11, 2026  
**Prepared by:** Tavonga Shoko  
**Version:** 1.0

---

## Executive Summary

This document provides a comprehensive decomposition plan for refactoring the KINGA monolithic application into a microservices architecture comprising ten domain-driven services. The decomposition strategy prioritizes **preservation of existing business logic** while establishing clear service boundaries, event-driven communication patterns, and independent data ownership. Each service specification includes responsibility boundaries, API contracts, event schemas, database ownership, and detailed refactoring strategies that map existing code components to the target architecture.

The proposed architecture enables independent deployment cycles, technology flexibility, horizontal scalability, and team autonomy while maintaining the functional completeness and domain expertise embedded in the current 44,000-line codebase. The decomposition follows Domain-Driven Design (DDD) principles, establishing bounded contexts around core business capabilities: claim lifecycle management, AI-powered damage assessment, fraud detection, physics validation, cost optimization, workflow orchestration, fleet risk analytics, external integrations, identity management, and cross-cutting notifications.

---

## 1. Architecture Overview

### 1.1 Service Topology

The KINGA microservices architecture comprises ten services organized into three tiers:

**Core Domain Services** (Business Logic):
- **claim-intake-service**: Claim submission, validation, document management
- **ai-damage-service**: AI-powered damage assessment and cost estimation
- **fraud-detection-service**: ML-based fraud scoring and investigation
- **physics-simulation-service**: Collision dynamics validation
- **cost-optimisation-service**: Quote comparison and negotiation strategies
- **fleet-risk-service**: Fleet analytics and risk profiling

**Orchestration Services** (Workflow & Integration):
- **workflow-engine-service**: State machine orchestration and business process management
- **insurer-integration-service**: External system integrations and API gateway

**Infrastructure Services** (Cross-Cutting Concerns):
- **identity-access-service**: Authentication, authorization, and user management
- **notification-service**: Multi-channel notifications (email, SMS, push)

### 1.2 Communication Patterns

| Pattern | Use Cases | Technology |
|---------|-----------|------------|
| **Synchronous REST** | User-facing APIs, real-time queries | tRPC over HTTP |
| **Asynchronous Events** | Domain events, state changes, background processing | Apache Kafka |
| **Request-Reply RPC** | Internal service-to-service calls | gRPC |
| **Pub-Sub** | Broadcast notifications, audit logging | Kafka Topics |
| **Saga Pattern** | Distributed transactions (claim approval workflow) | Orchestration-based |

### 1.3 Data Management Strategy

Each service owns its database schema and enforces data sovereignty through well-defined APIs. Cross-service data access occurs exclusively through API calls or event subscriptions, never through direct database queries.

| Service | Database | Data Ownership |
|---------|----------|----------------|
| **claim-intake-service** | PostgreSQL | claims, claim_documents, claim_comments |
| **ai-damage-service** | PostgreSQL | ai_assessments, vehicle_condition_assessment |
| **fraud-detection-service** | PostgreSQL + Neo4j | fraud_indicators, fraud_alerts, fraud_rules, entity_relationships (graph) |
| **physics-simulation-service** | PostgreSQL | physics_validations (new table) |
| **cost-optimisation-service** | PostgreSQL | panel_beater_quotes, quote_line_items, vehicle_market_valuations |
| **fleet-risk-service** | PostgreSQL + TimescaleDB | vehicle_history, claimant_history, fleet_analytics (new tables) |
| **workflow-engine-service** | PostgreSQL | approval_workflow, workflow_state_history (new table) |
| **insurer-integration-service** | PostgreSQL | external_system_configs, integration_logs (new tables) |
| **identity-access-service** | PostgreSQL | users, organizations, user_invitations, email_verification_tokens |
| **notification-service** | PostgreSQL | notifications, notification_templates (new table) |

---

## 2. Service Specifications

---

### 2.1 Claim Intake Service

**Bounded Context:** Claim lifecycle management from submission through initial triage and document management.

#### 2.1.1 Responsibility Boundaries

The Claim Intake Service owns the complete claim submission and initial processing workflow, serving as the entry point for all claim-related data. This service manages claim metadata, document uploads, policy verification, and initial triage assignment. It enforces business rules for claim validity, manages the claim registry, and provides the authoritative source of truth for claim status and ownership.

**Core Responsibilities:**
- Accept and validate claim submissions from claimants
- Manage claim documents (upload, retrieval, deletion) with S3 integration
- Verify policy information and coverage eligibility
- Assign claims to assessors based on workload and specialization
- Maintain claim status and workflow state
- Provide claim search and retrieval APIs
- Enforce claim modification audit trail
- Manage claim comments and collaboration

**Out of Scope:**
- Damage assessment (delegated to ai-damage-service)
- Fraud detection (delegated to fraud-detection-service)
- Quote management (delegated to cost-optimisation-service)
- Workflow orchestration (delegated to workflow-engine-service)

#### 2.1.2 APIs Owned

**REST Endpoints (tRPC Procedures):**

```typescript
// Claim Submission
POST   /api/claims/submit
  Input: {
    claimantId: number;
    vehicleMake: string;
    vehicleModel: string;
    vehicleYear: number;
    vehicleRegistration: string;
    incidentDate: Date;
    incidentDescription: string;
    incidentLocation: string;
    policyNumber: string;
    damagePhotos: File[];
  }
  Output: {
    claimId: number;
    claimNumber: string;
    status: string;
  }

// Claim Retrieval
GET    /api/claims/:claimId
  Output: {
    claim: Claim;
    documents: ClaimDocument[];
    comments: ClaimComment[];
  }

// Claim Search
GET    /api/claims/search?q=:query
  Output: {
    claims: Claim[];
    total: number;
  }

// Claim Status Update
PATCH  /api/claims/:claimId/status
  Input: {
    status: ClaimStatus;
    reason?: string;
  }
  Output: {
    success: boolean;
    claim: Claim;
  }

// Assessor Assignment
POST   /api/claims/:claimId/assign-assessor
  Input: {
    assessorId: number;
  }
  Output: {
    success: boolean;
    claim: Claim;
  }

// Document Management
POST   /api/claims/:claimId/documents
  Input: {
    file: File;
    documentType: string;
    title: string;
    description?: string;
  }
  Output: {
    documentId: number;
    url: string;
  }

GET    /api/claims/:claimId/documents
  Output: {
    documents: ClaimDocument[];
  }

DELETE /api/claims/:claimId/documents/:documentId
  Output: {
    success: boolean;
  }

// Comments
POST   /api/claims/:claimId/comments
  Input: {
    content: string;
    commentType: 'general' | 'flag' | 'clarification_request' | 'technical_note';
  }
  Output: {
    commentId: number;
    comment: ClaimComment;
  }

GET    /api/claims/:claimId/comments
  Output: {
    comments: ClaimComment[];
  }

// Policy Verification
POST   /api/claims/:claimId/verify-policy
  Input: {
    policyNumber: string;
  }
  Output: {
    verified: boolean;
    coverageDetails?: object;
    reason?: string;
  }

// Bulk Operations
GET    /api/claims/by-status/:status
  Query: {
    page?: number;
    limit?: number;
  }
  Output: {
    claims: Claim[];
    total: number;
    page: number;
    totalPages: number;
  }

GET    /api/claims/by-assessor/:assessorId
  Output: {
    claims: Claim[];
  }

GET    /api/claims/by-claimant/:claimantId
  Output: {
    claims: Claim[];
  }
```

#### 2.1.3 Events Published

```typescript
// Domain Events
ClaimSubmitted {
  eventId: string;
  timestamp: Date;
  claimId: number;
  claimNumber: string;
  claimantId: number;
  vehicleRegistration: string;
  incidentDate: Date;
  policyNumber: string;
  damagePhotoUrls: string[];
}

ClaimStatusChanged {
  eventId: string;
  timestamp: Date;
  claimId: number;
  claimNumber: string;
  previousStatus: string;
  newStatus: string;
  changedBy: number;
  reason?: string;
}

AssessorAssigned {
  eventId: string;
  timestamp: Date;
  claimId: number;
  claimNumber: string;
  assessorId: number;
  assignedBy: number;
}

PolicyVerified {
  eventId: string;
  timestamp: Date;
  claimId: number;
  claimNumber: string;
  policyNumber: string;
  verified: boolean;
  coverageDetails?: object;
}

DocumentUploaded {
  eventId: string;
  timestamp: Date;
  claimId: number;
  documentId: number;
  documentType: string;
  url: string;
  uploadedBy: number;
}

CommentAdded {
  eventId: string;
  timestamp: Date;
  claimId: number;
  commentId: number;
  userId: number;
  commentType: string;
  content: string;
}
```

#### 2.1.4 Events Consumed

```typescript
// From workflow-engine-service
WorkflowStateChanged {
  claimId: number;
  workflowState: string;
  triggeredBy: string;
}

// From ai-damage-service
DamageAssessmentCompleted {
  claimId: number;
  assessmentId: number;
  estimatedCost: number;
  fraudRiskLevel: string;
}

// From fraud-detection-service
FraudAlertRaised {
  claimId: number;
  alertId: number;
  riskScore: number;
  riskLevel: string;
}

// From cost-optimisation-service
QuoteSubmitted {
  claimId: number;
  quoteId: number;
  panelBeaterId: number;
  quotedAmount: number;
}
```

#### 2.1.5 Database Ownership

**Tables Owned:**
- `claims` - Core claim data
- `claim_documents` - Document metadata and S3 references
- `claim_comments` - Collaboration comments
- `panel_beaters` - Approved repair shop registry (shared read access)

**Schema Definition:**
```sql
-- claims table (existing, no changes required)
CREATE TABLE claims (
  id INT AUTO_INCREMENT PRIMARY KEY,
  claimant_id INT NOT NULL,
  claim_number VARCHAR(50) NOT NULL UNIQUE,
  vehicle_make VARCHAR(100),
  vehicle_model VARCHAR(100),
  vehicle_year INT,
  vehicle_registration VARCHAR(50),
  incident_date TIMESTAMP,
  incident_description TEXT,
  incident_location TEXT,
  damage_photos TEXT, -- JSON array
  policy_number VARCHAR(100),
  policy_verified TINYINT DEFAULT 0,
  status ENUM(...) DEFAULT 'submitted',
  assigned_assessor_id INT,
  assigned_panel_beater_id INT,
  selected_panel_beater_ids TEXT, -- JSON array
  ai_assessment_triggered TINYINT DEFAULT 0,
  ai_assessment_completed TINYINT DEFAULT 0,
  fraud_risk_score INT,
  fraud_flags TEXT, -- JSON array
  workflow_state ENUM(...),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_claimant (claimant_id),
  INDEX idx_status (status),
  INDEX idx_assessor (assigned_assessor_id),
  INDEX idx_claim_number (claim_number)
);

-- claim_documents table (existing, no changes required)
CREATE TABLE claim_documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  claim_id INT NOT NULL,
  document_type VARCHAR(50),
  title VARCHAR(255),
  description TEXT,
  file_url TEXT NOT NULL,
  file_size INT,
  mime_type VARCHAR(100),
  uploaded_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (claim_id) REFERENCES claims(id) ON DELETE CASCADE,
  INDEX idx_claim (claim_id)
);

-- claim_comments table (existing, no changes required)
CREATE TABLE claim_comments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  claim_id INT NOT NULL,
  user_id INT NOT NULL,
  user_role TEXT NOT NULL,
  comment_type ENUM('general', 'flag', 'clarification_request', 'technical_note'),
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (claim_id) REFERENCES claims(id) ON DELETE CASCADE,
  INDEX idx_claim (claim_id)
);
```

#### 2.1.6 Refactoring Strategy

**Phase 1: Extract Core Logic (Week 1-2)**

1. **Create service skeleton:**
   ```bash
   mkdir -p services/claim-intake-service
   cd services/claim-intake-service
   npm init -y
   npm install express @trpc/server drizzle-orm mysql2 zod nanoid
   ```

2. **Extract database queries from `server/db.ts`:**
   - Copy functions: `createClaim`, `getClaimById`, `getClaimByNumber`, `getClaimsByClaimant`, `getClaimsByStatus`, `getClaimsByAssessor`, `updateClaimStatus`, `assignClaimToAssessor`, `updateClaimPolicyVerification`
   - Move to `services/claim-intake-service/src/repositories/claim-repository.ts`
   - Preserve all existing business logic and validation

3. **Extract tRPC procedures from `server/routers.ts`:**
   - Copy `claims` router section (~800 LOC)
   - Move to `services/claim-intake-service/src/routers/claim-router.ts`
   - Update import paths to reference new repository layer

4. **Extract document management:**
   - Copy document-related queries from `server/db.ts`
   - Copy S3 integration from `server/storage.ts`
   - Move to `services/claim-intake-service/src/services/document-service.ts`

**Phase 2: Add Event Publishing (Week 2)**

1. **Install Kafka client:**
   ```bash
   npm install kafkajs
   ```

2. **Create event publisher:**
   ```typescript
   // services/claim-intake-service/src/events/event-publisher.ts
   import { Kafka, Producer } from 'kafkajs';

   export class EventPublisher {
     private producer: Producer;

     constructor(private kafka: Kafka) {
       this.producer = kafka.producer();
     }

     async publishClaimSubmitted(claim: Claim) {
       await this.producer.send({
         topic: 'claim.submitted',
         messages: [{
           key: claim.claimNumber,
           value: JSON.stringify({
             eventId: nanoid(),
             timestamp: new Date(),
             claimId: claim.id,
             claimNumber: claim.claimNumber,
             claimantId: claim.claimantId,
             vehicleRegistration: claim.vehicleRegistration,
             incidentDate: claim.incidentDate,
             policyNumber: claim.policyNumber,
             damagePhotoUrls: JSON.parse(claim.damagePhotos || '[]'),
           }),
         }],
       });
     }

     // Similar methods for other events...
   }
   ```

3. **Integrate event publishing into procedures:**
   ```typescript
   // After creating claim in database
   await eventPublisher.publishClaimSubmitted(newClaim);
   ```

**Phase 3: Add Event Consumers (Week 3)**

1. **Create event consumer:**
   ```typescript
   // services/claim-intake-service/src/events/event-consumer.ts
   import { Kafka, Consumer } from 'kafkajs';

   export class EventConsumer {
     private consumer: Consumer;

     constructor(private kafka: Kafka) {
       this.consumer = kafka.consumer({ groupId: 'claim-intake-service' });
     }

     async subscribe() {
       await this.consumer.subscribe({
         topics: [
           'workflow.state-changed',
           'ai-damage.assessment-completed',
           'fraud.alert-raised',
           'cost.quote-submitted',
         ],
       });

       await this.consumer.run({
         eachMessage: async ({ topic, message }) => {
           const event = JSON.parse(message.value.toString());
           await this.handleEvent(topic, event);
         },
       });
     }

     private async handleEvent(topic: string, event: any) {
       switch (topic) {
         case 'workflow.state-changed':
           await this.handleWorkflowStateChanged(event);
           break;
         case 'ai-damage.assessment-completed':
           await this.handleAssessmentCompleted(event);
           break;
         // ... other handlers
       }
     }

     private async handleAssessmentCompleted(event: any) {
       // Update claim with AI assessment completion flag
       await updateClaimStatus(event.claimId, 'assessment_completed');
     }
   }
   ```

**Phase 4: Database Migration (Week 3)**

1. **Create dedicated database:**
   ```sql
   CREATE DATABASE kinga_claim_intake;
   ```

2. **Migrate tables:**
   ```bash
   # Export schema
   mysqldump kinga_db claims claim_documents claim_comments panel_beaters > claim_intake_schema.sql
   
   # Import to new database
   mysql kinga_claim_intake < claim_intake_schema.sql
   ```

3. **Set up Drizzle ORM:**
   ```typescript
   // services/claim-intake-service/src/db/schema.ts
   import { mysqlTable, int, varchar, text, timestamp } from 'drizzle-orm/mysql-core';

   export const claims = mysqlTable('claims', {
     id: int('id').autoincrement().primaryKey(),
     claimantId: int('claimant_id').notNull(),
     claimNumber: varchar('claim_number', { length: 50 }).notNull().unique(),
     // ... rest of schema
   });
   ```

**Phase 5: API Gateway Integration (Week 4)**

1. **Register service with API Gateway (Kong):**
   ```bash
   curl -X POST http://kong:8001/services \
     --data name=claim-intake-service \
     --data url=http://claim-intake-service:3000

   curl -X POST http://kong:8001/services/claim-intake-service/routes \
     --data paths[]=/api/claims
   ```

2. **Update frontend to call new endpoint:**
   ```typescript
   // client/src/lib/trpc.ts
   const trpc = createTRPCProxyClient<AppRouter>({
     links: [
       httpBatchLink({
         url: 'https://api-gateway/api/claims/trpc',
       }),
     ],
   });
   ```

**Phase 6: Parallel Run & Cutover (Week 4)**

1. **Deploy service alongside monolith**
2. **Configure API Gateway to route 10% traffic to new service**
3. **Monitor metrics (latency, error rate, throughput)**
4. **Gradually increase traffic to 100%**
5. **Decommission monolith claim endpoints**

**Code Preservation Checklist:**
- ✅ All existing validation logic preserved
- ✅ Audit trail functionality maintained
- ✅ S3 integration unchanged
- ✅ tRPC contracts unchanged (frontend compatibility)
- ✅ Database schema unchanged (data migration not required)
- ✅ Error handling preserved
- ✅ Logging preserved

---

### 2.2 AI Damage Service

**Bounded Context:** AI-powered damage assessment, cost estimation, and component-level repair recommendations.

#### 2.2.1 Responsibility Boundaries

The AI Damage Service owns all artificial intelligence and machine learning capabilities related to vehicle damage analysis. This service orchestrates the multi-stage assessment pipeline including image extraction, vision-based damage detection, natural language processing for cost estimation, and structured output generation. It serves as the authoritative source for AI-generated assessments and maintains the history of model predictions for accuracy tracking and retraining.

**Core Responsibilities:**
- Extract and classify images from assessment documents (PDF, images)
- Analyze damage photos using computer vision and LLM vision capabilities
- Generate component-level damage breakdown with severity scoring
- Estimate repair costs with labor hours and parts pricing
- Provide repair vs. replace recommendations
- Detect total loss scenarios based on repair-to-value ratio
- Track model versions and assessment confidence scores
- Generate damage visualization diagrams
- Maintain assessment history for model retraining

**Out of Scope:**
- Fraud detection (delegated to fraud-detection-service)
- Physics validation (delegated to physics-simulation-service)
- Quote comparison (delegated to cost-optimisation-service)
- Workflow orchestration (delegated to workflow-engine-service)

#### 2.2.2 APIs Owned

**REST Endpoints (tRPC Procedures):**

```typescript
// Assessment Submission
POST   /api/ai-damage/assess
  Input: {
    claimId: number;
    documentUrl?: string;  // PDF assessment document
    imageUrls?: string[];  // Direct image URLs
    vehicleMake: string;
    vehicleModel: string;
    vehicleYear: number;
    incidentDescription?: string;
  }
  Output: {
    jobId: string;  // Async job ID for polling
    status: 'queued' | 'processing';
  }

// Assessment Status
GET    /api/ai-damage/assess/:jobId/status
  Output: {
    jobId: string;
    status: 'queued' | 'processing' | 'completed' | 'failed';
    progress?: number;  // 0-100
    estimatedCompletion?: Date;
  }

// Assessment Retrieval
GET    /api/ai-damage/assess/:assessmentId
  Output: {
    assessmentId: number;
    claimId: number;
    estimatedCost: number;
    damageDescription: string;
    detectedDamageTypes: string[];
    confidenceScore: number;
    damagedComponents: ComponentDamage[];
    repairRecommendations: ComponentRecommendation[];
    totalLossIndicated: boolean;
    totalLossReasoning?: string;
    estimatedVehicleValue?: number;
    repairToValueRatio?: number;
    graphUrls: string[];
    modelVersion: string;
    processingTime: number;
    createdAt: Date;
  }

// Assessment by Claim
GET    /api/ai-damage/by-claim/:claimId
  Output: {
    assessments: AiAssessment[];
  }

// Component Damage Details
GET    /api/ai-damage/assess/:assessmentId/components
  Output: {
    components: ComponentDamage[];
  }

// Damage Visualization
GET    /api/ai-damage/assess/:assessmentId/visualization
  Output: {
    damageLocationDiagram: string;  // SVG or image URL
    costBreakdownChart: string;
    severityHeatmap: string;
  }

// Model Performance
GET    /api/ai-damage/model/performance
  Output: {
    modelVersion: string;
    accuracy: number;
    avgConfidence: number;
    totalAssessments: number;
    avgProcessingTime: number;
  }

// Batch Assessment
POST   /api/ai-damage/assess/batch
  Input: {
    assessments: Array<{
      claimId: number;
      documentUrl: string;
    }>;
  }
  Output: {
    batchId: string;
    jobIds: string[];
  }
```

#### 2.2.3 Events Published

```typescript
// Domain Events
AssessmentQueued {
  eventId: string;
  timestamp: Date;
  jobId: string;
  claimId: number;
  documentUrl?: string;
  imageUrls?: string[];
}

AssessmentStarted {
  eventId: string;
  timestamp: Date;
  jobId: string;
  claimId: number;
  modelVersion: string;
}

AssessmentCompleted {
  eventId: string;
  timestamp: Date;
  jobId: string;
  claimId: number;
  assessmentId: number;
  estimatedCost: number;
  confidenceScore: number;
  totalLossIndicated: boolean;
  damagedComponents: ComponentDamage[];
  processingTime: number;
}

AssessmentFailed {
  eventId: string;
  timestamp: Date;
  jobId: string;
  claimId: number;
  error: string;
  reason: string;
}

TotalLossDetected {
  eventId: string;
  timestamp: Date;
  claimId: number;
  assessmentId: number;
  estimatedCost: number;
  estimatedVehicleValue: number;
  repairToValueRatio: number;
  reasoning: string;
}
```

#### 2.2.4 Events Consumed

```typescript
// From claim-intake-service
ClaimSubmitted {
  claimId: number;
  claimNumber: string;
  damagePhotoUrls: string[];
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number;
}

DocumentUploaded {
  claimId: number;
  documentId: number;
  documentType: string;
  url: string;
}

// From workflow-engine-service
AssessmentRequested {
  claimId: number;
  requestedBy: number;
  priority: 'low' | 'normal' | 'high';
}
```

#### 2.2.5 Database Ownership

**Tables Owned:**
- `ai_assessments` - Assessment results and metadata
- `vehicle_condition_assessment` - Pre-accident condition data

**New Tables:**
- `assessment_jobs` - Async job tracking
- `component_damages` - Detailed component-level damage (normalized)
- `model_versions` - Model metadata and performance tracking

**Schema Definition:**
```sql
-- ai_assessments table (existing, minor additions)
CREATE TABLE ai_assessments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  claim_id INT NOT NULL,
  job_id VARCHAR(50) UNIQUE,  -- NEW: Link to async job
  estimated_cost INT,
  damage_description TEXT,
  detected_damage_types TEXT,  -- JSON array
  confidence_score INT,
  damaged_components_json TEXT,  -- JSON array
  physics_analysis TEXT,  -- JSON object
  graph_urls TEXT,  -- JSON array
  total_loss_indicated TINYINT DEFAULT 0,
  structural_damage_severity ENUM('none', 'minor', 'moderate', 'severe', 'catastrophic'),
  estimated_vehicle_value INT,
  repair_to_value_ratio INT,
  total_loss_reasoning TEXT,
  model_version VARCHAR(50),
  processing_time INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_claim (claim_id),
  INDEX idx_job (job_id)
);

-- assessment_jobs table (NEW)
CREATE TABLE assessment_jobs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  job_id VARCHAR(50) NOT NULL UNIQUE,
  claim_id INT NOT NULL,
  status ENUM('queued', 'processing', 'completed', 'failed') DEFAULT 'queued',
  progress INT DEFAULT 0,
  document_url TEXT,
  image_urls TEXT,  -- JSON array
  error_message TEXT,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_job_id (job_id),
  INDEX idx_claim (claim_id),
  INDEX idx_status (status)
);

-- component_damages table (NEW - normalized from JSON)
CREATE TABLE component_damages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  assessment_id INT NOT NULL,
  component_name VARCHAR(100) NOT NULL,
  damage_type VARCHAR(50),
  severity ENUM('minor', 'moderate', 'severe', 'total_loss'),
  estimated_cost INT,
  labor_hours DECIMAL(5,2),
  recommendation ENUM('repair', 'replace'),
  reasoning TEXT,
  confidence_score INT,
  FOREIGN KEY (assessment_id) REFERENCES ai_assessments(id) ON DELETE CASCADE,
  INDEX idx_assessment (assessment_id),
  INDEX idx_component (component_name)
);

-- model_versions table (NEW)
CREATE TABLE model_versions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  version VARCHAR(50) NOT NULL UNIQUE,
  model_type VARCHAR(50),  -- 'vision', 'nlp', 'cost_estimator'
  deployed_at TIMESTAMP,
  deprecated_at TIMESTAMP,
  total_assessments INT DEFAULT 0,
  avg_confidence DECIMAL(5,2),
  avg_processing_time INT,
  accuracy_score DECIMAL(5,2),
  metadata TEXT,  -- JSON object
  INDEX idx_version (version)
);
```

#### 2.2.6 Refactoring Strategy

**Phase 1: Extract Assessment Pipeline (Week 1-2)**

1. **Create service skeleton with Python integration:**
   ```bash
   mkdir -p services/ai-damage-service
   cd services/ai-damage-service
   npm init -y
   npm install express @trpc/server drizzle-orm mysql2 bull ioredis
   
   # Python environment
   mkdir python
   cd python
   python3 -m venv venv
   source venv/bin/activate
   pip install PyMuPDF pdf2image Pillow numpy
   ```

2. **Extract assessment processor from `server/assessment-processor.ts`:**
   - Copy entire file (~1,100 LOC)
   - Move to `services/ai-damage-service/src/processors/assessment-processor.ts`
   - Preserve all existing pipeline logic

3. **Extract Python modules:**
   - Copy `python/extract_images.py` → `services/ai-damage-service/python/`
   - Copy `python/extract_pdf_text.py` → `services/ai-damage-service/python/`
   - Copy `python/extract_pdf_text_ocr.py` → `services/ai-damage-service/python/`
   - Preserve all existing image classification logic

4. **Extract LLM integration:**
   - Copy `server/_core/llm.ts` → `services/ai-damage-service/src/integrations/llm-client.ts`
   - Preserve vision API integration

**Phase 2: Implement Async Job Queue (Week 2)**

1. **Install Bull queue:**
   ```bash
   npm install bull @types/bull
   ```

2. **Create job queue:**
   ```typescript
   // services/ai-damage-service/src/queues/assessment-queue.ts
   import Bull from 'bull';
   import { processAssessment } from '../processors/assessment-processor';

   export const assessmentQueue = new Bull('ai-damage-assessment', {
     redis: {
       host: process.env.REDIS_HOST,
       port: parseInt(process.env.REDIS_PORT || '6379'),
     },
   });

   assessmentQueue.process(async (job) => {
     const { claimId, documentUrl, imageUrls } = job.data;
     
     // Update job status
     await updateJobStatus(job.id, 'processing');
     
     try {
       // Run existing assessment processor
       const result = await processAssessment(documentUrl, imageUrls);
       
       // Save to database
       const assessment = await saveAssessment(claimId, result);
       
       // Publish event
       await eventPublisher.publishAssessmentCompleted(assessment);
       
       return assessment;
     } catch (error) {
       await updateJobStatus(job.id, 'failed', error.message);
       throw error;
     }
   });

   assessmentQueue.on('progress', (job, progress) => {
     updateJobProgress(job.id, progress);
   });
   ```

3. **Update API to return job ID:**
   ```typescript
   // POST /api/ai-damage/assess
   const job = await assessmentQueue.add({
     claimId,
     documentUrl,
     imageUrls,
   });

   return {
     jobId: job.id,
     status: 'queued',
   };
   ```

**Phase 3: Add Event Publishing (Week 2-3)**

1. **Create event publisher (same pattern as claim-intake-service)**

2. **Publish events at key pipeline stages:**
   ```typescript
   // After queuing job
   await eventPublisher.publishAssessmentQueued(job);

   // After starting processing
   await eventPublisher.publishAssessmentStarted(job);

   // After completion
   await eventPublisher.publishAssessmentCompleted(assessment);

   // On total loss detection
   if (assessment.totalLossIndicated) {
     await eventPublisher.publishTotalLossDetected(assessment);
   }
   ```

**Phase 4: Database Migration (Week 3)**

1. **Create dedicated database:**
   ```sql
   CREATE DATABASE kinga_ai_damage;
   ```

2. **Migrate tables:**
   ```bash
   mysqldump kinga_db ai_assessments vehicle_condition_assessment > ai_damage_schema.sql
   mysql kinga_ai_damage < ai_damage_schema.sql
   ```

3. **Create new tables:**
   ```sql
   -- Run schema creation scripts for assessment_jobs, component_damages, model_versions
   ```

**Phase 5: Add GPU Support (Week 4)**

1. **Containerize with NVIDIA runtime:**
   ```dockerfile
   FROM nvidia/cuda:11.8.0-cudnn8-runtime-ubuntu22.04

   # Install Python and dependencies
   RUN apt-get update && apt-get install -y python3 python3-pip
   COPY python/requirements.txt /app/python/
   RUN pip3 install -r /app/python/requirements.txt

   # Install Node.js
   RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
   RUN apt-get install -y nodejs

   # Copy application
   COPY . /app
   WORKDIR /app
   RUN npm install

   CMD ["npm", "start"]
   ```

2. **Add computer vision models (future enhancement):**
   ```python
   # python/damage_detector.py
   import torch
   from detectron2.engine import DefaultPredictor
   from detectron2.config import get_cfg

   class DamageDetector:
       def __init__(self):
           cfg = get_cfg()
           cfg.merge_from_file("configs/damage_detection_model.yaml")
           cfg.MODEL.WEIGHTS = "models/damage_detector.pth"
           self.predictor = DefaultPredictor(cfg)

       def detect_damage(self, image_path):
           image = cv2.imread(image_path)
           predictions = self.predictor(image)
           return predictions
   ```

**Phase 6: API Gateway Integration & Cutover (Week 4)**

1. **Register service with API Gateway**
2. **Deploy with parallel run**
3. **Monitor and cutover**

**Code Preservation Checklist:**
- ✅ All existing assessment pipeline logic preserved
- ✅ Image extraction and classification unchanged
- ✅ LLM integration unchanged
- ✅ Cost estimation logic preserved
- ✅ Component recommendation logic preserved
- ✅ Database schema backward compatible

---

### 2.3 Fraud Detection Service

**Bounded Context:** ML-based fraud detection, investigation management, and fraud ring identification.

#### 2.3.1 Responsibility Boundaries

The Fraud Detection Service owns all fraud-related intelligence including machine learning models, rule-based indicators, image forensics, and graph-based fraud ring detection. This service analyzes claims for fraudulent patterns, maintains fraud case investigations, and provides real-time fraud scoring for decision support. It serves as the authoritative source for fraud risk assessments and investigation workflows.

**Core Responsibilities:**
- Calculate real-time fraud risk scores using ML models
- Detect fraud indicators using rule-based logic
- Perform image forensics (EXIF analysis, tampering detection, duplicate detection)
- Identify fraud rings using graph analysis of entity relationships
- Manage fraud investigations and case workflows
- Track fraud alerts and escalations
- Maintain fraud rules and thresholds
- Provide fraud analytics and trend analysis
- Cross-reference with physics validation results

**Out of Scope:**
- Damage assessment (delegated to ai-damage-service)
- Physics validation (delegated to physics-simulation-service)
- Workflow orchestration (delegated to workflow-engine-service)

#### 2.3.2 APIs Owned

**REST Endpoints (tRPC Procedures):**

```typescript
// Fraud Scoring
POST   /api/fraud/score
  Input: {
    claimId: number;
    claimData: {
      claimAmount: number;
      vehicleAge: number;
      daysSincePolicyStart: number;
      previousClaimsCount: number;
      hasWitnesses: boolean;
      hasPoliceReport: boolean;
      hasPhotos: boolean;
      accidentType: string;
      claimTime: Date;
    };
    physicsValidationScore?: number;
    imageForensicsScore?: number;
  }
  Output: {
    fraudScore: number;  // 0-100
    riskLevel: 'low' | 'medium' | 'high';
    confidence: number;
    topRiskFactors: string[];
    indicators: {
      claimHistory: number;
      damageConsistency: number;
      documentAuthenticity: number;
      behavioralPatterns: number;
      ownershipVerification: number;
      geographicRisk: number;
    };
    recommendations: string[];
  }

// Image Forensics
POST   /api/fraud/image-forensics
  Input: {
    imageUrls: string[];
  }
  Output: {
    results: Array<{
      imageUrl: string;
      exifData: object;
      tamperingScore: number;
      tamperingIndicators: string[];
      duplicateOf?: string;
      perceptualHash: string;
    }>;
  }

// Fraud Ring Detection
POST   /api/fraud/detect-rings
  Input: {
    claimId: number;
  }
  Output: {
    suspectedRings: Array<{
      ringId: string;
      members: Array<{
        entityType: 'claimant' | 'assessor' | 'panel_beater';
        entityId: number;
        name: string;
      }>;
      connectionType: string;
      riskScore: number;
      evidence: string[];
    }>;
  }

// Fraud Alert Management
POST   /api/fraud/alerts
  Input: {
    claimId: number;
    alertType: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    evidence: string[];
  }
  Output: {
    alertId: number;
    alert: FraudAlert;
  }

GET    /api/fraud/alerts/:alertId
  Output: {
    alert: FraudAlert;
    investigation?: FraudInvestigation;
  }

GET    /api/fraud/alerts/by-claim/:claimId
  Output: {
    alerts: FraudAlert[];
  }

// Investigation Management
POST   /api/fraud/investigations
  Input: {
    alertId: number;
    assignedTo: number;
    priority: 'low' | 'medium' | 'high';
  }
  Output: {
    investigationId: number;
    investigation: FraudInvestigation;
  }

PATCH  /api/fraud/investigations/:investigationId
  Input: {
    status?: 'open' | 'in_progress' | 'closed';
    findings?: string;
    outcome?: 'confirmed_fraud' | 'no_fraud' | 'inconclusive';
  }
  Output: {
    investigation: FraudInvestigation;
  }

// Fraud Rules Management
GET    /api/fraud/rules
  Output: {
    rules: FraudRule[];
  }

POST   /api/fraud/rules
  Input: {
    ruleName: string;
    ruleType: string;
    condition: string;
    threshold: number;
    severity: 'low' | 'medium' | 'high';
    enabled: boolean;
  }
  Output: {
    ruleId: number;
    rule: FraudRule;
  }

// Analytics
GET    /api/fraud/analytics/trends
  Query: {
    startDate: Date;
    endDate: Date;
  }
  Output: {
    totalAlerts: number;
    confirmedFraud: number;
    falsePositives: number;
    avgRiskScore: number;
    trendData: Array<{
      date: Date;
      alertCount: number;
      avgRiskScore: number;
    }>;
  }

GET    /api/fraud/analytics/hotspots
  Output: {
    geographicHotspots: Array<{
      postalCode: string;
      alertCount: number;
      avgRiskScore: number;
    }>;
  }
```

#### 2.3.3 Events Published

```typescript
// Domain Events
FraudScoreCalculated {
  eventId: string;
  timestamp: Date;
  claimId: number;
  fraudScore: number;
  riskLevel: string;
  confidence: number;
  topRiskFactors: string[];
}

FraudAlertRaised {
  eventId: string;
  timestamp: Date;
  claimId: number;
  alertId: number;
  alertType: string;
  severity: string;
  riskScore: number;
  evidence: string[];
}

FraudRingDetected {
  eventId: string;
  timestamp: Date;
  ringId: string;
  memberCount: number;
  claimIds: number[];
  riskScore: number;
}

InvestigationOpened {
  eventId: string;
  timestamp: Date;
  investigationId: number;
  alertId: number;
  claimId: number;
  assignedTo: number;
  priority: string;
}

InvestigationClosed {
  eventId: string;
  timestamp: Date;
  investigationId: number;
  claimId: number;
  outcome: string;
  findings: string;
}

FraudConfirmed {
  eventId: string;
  timestamp: Date;
  claimId: number;
  investigationId: number;
  fraudType: string;
  estimatedLoss: number;
}
```

#### 2.3.4 Events Consumed

```typescript
// From claim-intake-service
ClaimSubmitted {
  claimId: number;
  claimantId: number;
  claimAmount: number;
  vehicleRegistration: string;
  incidentDate: Date;
  damagePhotoUrls: string[];
}

// From ai-damage-service
AssessmentCompleted {
  claimId: number;
  assessmentId: number;
  estimatedCost: number;
  confidenceScore: number;
  damagedComponents: ComponentDamage[];
}

// From physics-simulation-service
PhysicsValidationCompleted {
  claimId: number;
  validationId: number;
  isValid: boolean;
  confidence: number;
  flags: string[];
  physicsScore: number;
}
```

#### 2.3.5 Database Ownership

**Tables Owned:**
- `fraud_indicators` - Detected fraud indicators per claim
- `fraud_alerts` - Fraud alerts and escalations
- `fraud_rules` - Configurable fraud detection rules
- `entity_relationships` - Graph relationships for fraud ring detection

**New Tables:**
- `fraud_investigations` - Investigation case management
- `fraud_scores` - Historical fraud scores for analytics
- `image_forensics_results` - Image analysis results

**Graph Database (Neo4j):**
- Nodes: `Claimant`, `Assessor`, `PanelBeater`, `Vehicle`, `Address`, `BankAccount`, `PhoneNumber`
- Relationships: `SUBMITTED_CLAIM`, `ASSESSED_CLAIM`, `QUOTED_CLAIM`, `LIVES_AT`, `OWNS_VEHICLE`, `SHARES_PHONE`, `SHARES_BANK_ACCOUNT`

**Schema Definition:**
```sql
-- fraud_indicators table (existing, no changes)
CREATE TABLE fraud_indicators (
  id INT AUTO_INCREMENT PRIMARY KEY,
  claim_id INT NOT NULL,
  indicator_type VARCHAR(100) NOT NULL,
  severity ENUM('low', 'medium', 'high') NOT NULL,
  description TEXT,
  evidence TEXT,  -- JSON array
  detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_claim (claim_id),
  INDEX idx_type (indicator_type)
);

-- fraud_alerts table (existing, no changes)
CREATE TABLE fraud_alerts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  claim_id INT NOT NULL,
  alert_type VARCHAR(100) NOT NULL,
  severity ENUM('low', 'medium', 'high', 'critical') NOT NULL,
  risk_score INT,
  description TEXT,
  evidence TEXT,  -- JSON array
  status ENUM('open', 'investigating', 'resolved') DEFAULT 'open',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP,
  INDEX idx_claim (claim_id),
  INDEX idx_status (status),
  INDEX idx_severity (severity)
);

-- fraud_rules table (existing, no changes)
CREATE TABLE fraud_rules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  rule_name VARCHAR(255) NOT NULL,
  rule_type VARCHAR(100) NOT NULL,
  condition TEXT NOT NULL,
  threshold DECIMAL(10,2),
  severity ENUM('low', 'medium', 'high') NOT NULL,
  enabled TINYINT DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_enabled (enabled)
);

-- fraud_investigations table (NEW)
CREATE TABLE fraud_investigations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  alert_id INT NOT NULL,
  claim_id INT NOT NULL,
  assigned_to INT NOT NULL,
  priority ENUM('low', 'medium', 'high') DEFAULT 'medium',
  status ENUM('open', 'in_progress', 'closed') DEFAULT 'open',
  findings TEXT,
  outcome ENUM('confirmed_fraud', 'no_fraud', 'inconclusive'),
  opened_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  closed_at TIMESTAMP,
  FOREIGN KEY (alert_id) REFERENCES fraud_alerts(id),
  INDEX idx_claim (claim_id),
  INDEX idx_assigned (assigned_to),
  INDEX idx_status (status)
);

-- fraud_scores table (NEW)
CREATE TABLE fraud_scores (
  id INT AUTO_INCREMENT PRIMARY KEY,
  claim_id INT NOT NULL,
  fraud_score INT NOT NULL,
  risk_level ENUM('low', 'medium', 'high') NOT NULL,
  confidence DECIMAL(5,2),
  top_risk_factors TEXT,  -- JSON array
  indicators TEXT,  -- JSON object
  model_version VARCHAR(50),
  calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_claim (claim_id),
  INDEX idx_risk_level (risk_level),
  INDEX idx_calculated_at (calculated_at)
);

-- image_forensics_results table (NEW)
CREATE TABLE image_forensics_results (
  id INT AUTO_INCREMENT PRIMARY KEY,
  claim_id INT NOT NULL,
  image_url TEXT NOT NULL,
  exif_data TEXT,  -- JSON object
  tampering_score INT,
  tampering_indicators TEXT,  -- JSON array
  duplicate_of VARCHAR(255),
  perceptual_hash VARCHAR(64),
  analyzed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_claim (claim_id),
  INDEX idx_hash (perceptual_hash)
);
```

**Neo4j Schema:**
```cypher
// Claimant node
CREATE (c:Claimant {
  id: INT,
  name: STRING,
  email: STRING,
  phone: STRING,
  address: STRING
})

// Claim relationship
CREATE (c:Claimant)-[:SUBMITTED_CLAIM {
  claimId: INT,
  claimNumber: STRING,
  submittedAt: DATETIME
}]->(claim:Claim)

// Shared address relationship (fraud indicator)
MATCH (c1:Claimant)-[:LIVES_AT]->(a:Address)<-[:LIVES_AT]-(c2:Claimant)
WHERE c1.id <> c2.id
RETURN c1, c2, a
```

#### 2.3.6 Refactoring Strategy

**Phase 1: Extract Fraud Detection Logic (Week 1-2)**

1. **Create service skeleton:**
   ```bash
   mkdir -p services/fraud-detection-service
   cd services/fraud-detection-service
   npm init -y
   npm install express @trpc/server drizzle-orm mysql2 neo4j-driver
   
   # Python for ML
   mkdir python
   cd python
   python3 -m venv venv
   source venv/bin/activate
   pip install scikit-learn numpy pandas opencv-python imagehash
   ```

2. **Extract fraud ML model from `python/fraud_ml_model.py`:**
   - Copy entire file (~400 LOC)
   - Move to `services/fraud-detection-service/python/fraud_ml_model.py`
   - Preserve all feature extraction and scoring logic

3. **Extract image forensics from `python/image_forensics.py`:**
   - Copy entire file (~300 LOC)
   - Move to `services/fraud-detection-service/python/image_forensics.py`
   - Preserve EXIF analysis and tampering detection

4. **Extract fraud detection from `server/fraud-detection-enhanced.ts`:**
   - Copy entire file (~250 LOC)
   - Move to `services/fraud-detection-service/src/detectors/fraud-detector.ts`
   - Preserve rule-based indicators

**Phase 2: Implement Graph Database (Week 2-3)**

1. **Set up Neo4j:**
   ```bash
   docker run -d \
     --name neo4j \
     -p 7474:7474 -p 7687:7687 \
     -e NEO4J_AUTH=neo4j/password \
     neo4j:latest
   ```

2. **Create graph service:**
   ```typescript
   // services/fraud-detection-service/src/graph/fraud-ring-detector.ts
   import neo4j from 'neo4j-driver';

   export class FraudRingDetector {
     private driver: neo4j.Driver;

     constructor() {
       this.driver = neo4j.driver(
         process.env.NEO4J_URI,
         neo4j.auth.basic(process.env.NEO4J_USER, process.env.NEO4J_PASSWORD)
       );
     }

     async detectRings(claimId: number) {
       const session = this.driver.session();
       
       try {
         // Find connected entities
         const result = await session.run(`
           MATCH (c:Claim {id: $claimId})<-[:SUBMITTED]-(claimant:Claimant)
           MATCH (claimant)-[:SHARES_ADDRESS|SHARES_PHONE|SHARES_BANK_ACCOUNT]-(other:Claimant)
           MATCH (other)-[:SUBMITTED]->(otherClaim:Claim)
           RETURN claimant, other, otherClaim
         `, { claimId });

         // Analyze connections
         const rings = this.analyzeConnections(result.records);
         return rings;
       } finally {
         await session.close();
       }
     }

     private analyzeConnections(records: any[]) {
       // Group by connection type
       // Calculate risk scores
       // Return suspected fraud rings
     }
   }
   ```

3. **Populate graph on claim submission:**
   ```typescript
   // Event consumer
   async handleClaimSubmitted(event: ClaimSubmitted) {
     await graphService.addClaimant(event.claimantId, event.claimData);
     await graphService.linkClaimToClaimant(event.claimId, event.claimantId);
     await graphService.detectSharedEntities(event.claimantId);
   }
   ```

**Phase 3: Add Real-Time Scoring API (Week 3)**

1. **Create fraud scoring endpoint:**
   ```typescript
   // POST /api/fraud/score
   export const scoreFraud = publicProcedure
     .input(z.object({
       claimId: z.number(),
       claimData: z.object({
         claimAmount: z.number(),
         vehicleAge: z.number(),
         // ... other fields
       }),
       physicsValidationScore: z.number().optional(),
     }))
     .mutation(async ({ input }) => {
       // Extract features
       const features = fraudMLModel.extractFeatures(input.claimData);

       // Call Python ML model
       const mlScore = await callPythonModel('fraud_ml_model.py', features);

       // Apply rule-based indicators
       const ruleScore = await fraudDetector.calculateRuleScore(input.claimData);

       // Combine scores
       const finalScore = (mlScore * 0.7) + (ruleScore * 0.3);

       // Save to database
       await saveFraudScore(input.claimId, finalScore, indicators);

       // Publish event
       if (finalScore > 70) {
         await eventPublisher.publishFraudAlertRaised({
           claimId: input.claimId,
           riskScore: finalScore,
           severity: 'high',
         });
       }

       return {
         fraudScore: finalScore,
         riskLevel: getRiskLevel(finalScore),
         indicators,
       };
     });
   ```

**Phase 4: Database Migration (Week 3-4)**

1. **Create dedicated databases:**
   ```sql
   CREATE DATABASE kinga_fraud_detection;
   ```

2. **Migrate tables:**
   ```bash
   mysqldump kinga_db fraud_indicators fraud_alerts fraud_rules entity_relationships > fraud_schema.sql
   mysql kinga_fraud_detection < fraud_schema.sql
   ```

3. **Create new tables (fraud_investigations, fraud_scores, image_forensics_results)**

**Phase 5: Event Integration (Week 4)**

1. **Consume events from other services**
2. **Publish fraud events**
3. **Cross-reference with physics validation**

**Phase 6: API Gateway Integration & Cutover (Week 4)**

**Code Preservation Checklist:**
- ✅ All existing ML model logic preserved
- ✅ Feature extraction unchanged
- ✅ Rule-based indicators preserved
- ✅ Image forensics logic unchanged
- ✅ Database schema backward compatible

---

### 2.4 Physics Simulation Service

**Bounded Context:** Collision dynamics validation and accident scenario analysis.

#### 2.4.1 Responsibility Boundaries

The Physics Simulation Service owns all physics-based validation of accident scenarios using collision dynamics, impact forces, energy dissipation, and deformation patterns. This service validates whether reported damage is consistent with the described accident physics, providing scientific evidence to support or refute claims. It serves as a shared library rather than a standalone microservice due to low latency requirements.

**Core Responsibilities:**
- Validate collision scenarios using kinetic energy calculations
- Calculate impact forces, deceleration, and g-forces
- Assess damage location consistency with accident type
- Validate airbag deployment logic
- Detect physics inconsistencies (red flags)
- Provide confidence scores for physics validation
- Generate physics analysis reports
- Cross-reference with damage assessment results

**Out of Scope:**
- Damage assessment (delegated to ai-damage-service)
- Fraud detection (delegated to fraud-detection-service)
- Cost estimation (delegated to cost-optimisation-service)

#### 2.4.2 APIs Owned

**REST Endpoints (tRPC Procedures):**

```typescript
// Physics Validation
POST   /api/physics/validate
  Input: {
    claimId: number;
    vehicleType: string;
    accidentType: string;
    estimatedSpeed: number;  // km/h
    damageSeverity: 'minor' | 'moderate' | 'severe' | 'total_loss';
    damageLocations: string[];  // ['front', 'rear', 'left_side', 'right_side', 'roof']
    reportedDescription: string;
    airbagDeployed?: boolean;
    vehicleMass?: number;  // kg (optional, will estimate if not provided)
  }
  Output: {
    validationId: number;
    isValid: boolean;
    confidence: number;  // 0-1
    flags: string[];
    physicsAnalysis: {
      kineticEnergyJoules: number;
      vehicleMassKg: number;
      impactSpeedMs: number;
      decelerationMs2: number;
      gForce: number;
    };
    recommendations: string[];
    physicsScore: number;  // 0-100
  }

// Validation Retrieval
GET    /api/physics/validate/:validationId
  Output: {
    validation: PhysicsValidation;
  }

// Validation by Claim
GET    /api/physics/by-claim/:claimId
  Output: {
    validations: PhysicsValidation[];
  }

// Batch Validation
POST   /api/physics/validate/batch
  Input: {
    validations: Array<{
      claimId: number;
      vehicleType: string;
      // ... other fields
    }>;
  }
  Output: {
    results: PhysicsValidation[];
  }
```

#### 2.4.3 Events Published

```typescript
// Domain Events
PhysicsValidationCompleted {
  eventId: string;
  timestamp: Date;
  claimId: number;
  validationId: number;
  isValid: boolean;
  confidence: number;
  flags: string[];
  physicsScore: number;
}

PhysicsInconsistencyDetected {
  eventId: string;
  timestamp: Date;
  claimId: number;
  validationId: number;
  inconsistencyType: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
}
```

#### 2.4.4 Events Consumed

```typescript
// From claim-intake-service
ClaimSubmitted {
  claimId: number;
  incidentDescription: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number;
}

// From ai-damage-service
AssessmentCompleted {
  claimId: number;
  damagedComponents: ComponentDamage[];
  estimatedCost: number;
}
```

#### 2.4.5 Database Ownership

**Tables Owned:**

**New Tables:**
- `physics_validations` - Validation results and analysis

**Schema Definition:**
```sql
-- physics_validations table (NEW)
CREATE TABLE physics_validations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  claim_id INT NOT NULL,
  vehicle_type VARCHAR(50),
  accident_type VARCHAR(50),
  estimated_speed DECIMAL(6,2),
  damage_severity ENUM('minor', 'moderate', 'severe', 'total_loss'),
  damage_locations TEXT,  -- JSON array
  reported_description TEXT,
  airbag_deployed TINYINT,
  is_valid TINYINT,
  confidence DECIMAL(5,2),
  flags TEXT,  -- JSON array
  physics_analysis TEXT,  -- JSON object
  recommendations TEXT,  -- JSON array
  physics_score INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_claim (claim_id),
  INDEX idx_is_valid (is_valid)
);
```

#### 2.4.6 Refactoring Strategy

**Phase 1: Extract Physics Validation (Week 1)**

1. **Create shared library (not microservice):**
   ```bash
   mkdir -p shared-libraries/physics-validation
   cd shared-libraries/physics-validation
   npm init -y
   
   # Python for physics calculations
   mkdir python
   cd python
   python3 -m venv venv
   source venv/bin/activate
   pip install numpy scipy
   ```

2. **Extract Python physics validator from `python/physics_validator.py`:**
   - Copy entire file (~350 LOC)
   - Move to `shared-libraries/physics-validation/python/physics_validator.py`
   - Preserve all physics calculations

3. **Extract TypeScript wrapper from `server/accidentPhysics.ts`:**
   - Copy entire file (~1,500 LOC)
   - Move to `shared-libraries/physics-validation/src/physics-engine.ts`
   - Preserve all validation logic

4. **Create wrapper service (thin API layer):**
   ```typescript
   // services/physics-simulation-service/src/index.ts
   import { PhysicsEngine } from '@kinga/physics-validation';

   const physicsEngine = new PhysicsEngine();

   export const validatePhysics = publicProcedure
     .input(z.object({
       claimId: z.number(),
       vehicleType: z.string(),
       // ... other fields
     }))
     .mutation(async ({ input }) => {
       // Call physics engine
       const result = await physicsEngine.validate(input);

       // Save to database
       const validation = await savePhysicsValidation(input.claimId, result);

       // Publish event
       await eventPublisher.publishPhysicsValidationCompleted(validation);

       // If inconsistencies detected
       if (!result.isValid) {
         await eventPublisher.publishPhysicsInconsistencyDetected({
           claimId: input.claimId,
           validationId: validation.id,
           inconsistencyType: result.flags[0],
           severity: 'high',
         });
       }

       return validation;
     });
   ```

**Phase 2: Database Setup (Week 1)**

1. **Create table in fraud-detection-service database (shared):**
   ```sql
   -- Physics validations stored alongside fraud data for cross-referencing
   USE kinga_fraud_detection;
   CREATE TABLE physics_validations (...);
   ```

**Phase 3: Event Integration (Week 2)**

1. **Consume events from claim-intake and ai-damage services**
2. **Publish validation events**
3. **Cross-reference with fraud detection**

**Phase 4: API Gateway Integration (Week 2)**

**Deployment Strategy:**
- Deploy as shared library imported by fraud-detection-service and ai-damage-service
- Expose thin API wrapper for external access
- No separate database (shares fraud-detection database)

**Code Preservation Checklist:**
- ✅ All existing physics calculations preserved
- ✅ Validation logic unchanged
- ✅ Energy calculations preserved
- ✅ Damage consistency checks preserved

---

### 2.5 Cost Optimisation Service

**Bounded Context:** Quote comparison, cost analysis, negotiation strategies, and market benchmarking.

#### 2.5.1 Responsibility Boundaries

The Cost Optimisation Service owns all cost-related intelligence including quote management, component-level cost comparison, variance analysis, negotiation strategy generation, and market rate benchmarking. This service provides decision support for selecting optimal repair quotes and identifying cost-saving opportunities. It serves as the authoritative source for quote data and cost analytics.

**Core Responsibilities:**
- Manage panel beater quotes and line items
- Compare quotes at component level
- Detect cost outliers and variances
- Generate negotiation strategies with talking points
- Benchmark against market rates (parts and labor)
- Estimate vehicle market values
- Calculate total cost of ownership
- Provide cost analytics and trends
- Manage preferred provider network (PPN) optimization

**Out of Scope:**
- Damage assessment (delegated to ai-damage-service)
- Fraud detection (delegated to fraud-detection-service)
- Workflow orchestration (delegated to workflow-engine-service)

#### 2.5.2 APIs Owned

**REST Endpoints (tRPC Procedures):**

```typescript
// Quote Submission
POST   /api/cost/quotes
  Input: {
    claimId: number;
    panelBeaterId: number;
    quotedAmount: number;
    laborCost: number;
    partsCost: number;
    estimatedDuration: number;  // days
    partsQuality: 'aftermarket' | 'oem' | 'genuine' | 'used';
    warrantyMonths: number;
    lineItems: Array<{
      componentName: string;
      action: 'repair' | 'replace';
      partsCost: number;
      laborCost: number;
      laborHours: number;
      notes?: string;
    }>;
  }
  Output: {
    quoteId: number;
    quote: PanelBeaterQuote;
  }

// Quote Retrieval
GET    /api/cost/quotes/:quoteId
  Output: {
    quote: PanelBeaterQuote;
    lineItems: QuoteLineItem[];
  }

// Quotes by Claim
GET    /api/cost/quotes/by-claim/:claimId
  Output: {
    quotes: PanelBeaterQuote[];
  }

// Quote Comparison
POST   /api/cost/compare
  Input: {
    claimId: number;
  }
  Output: {
    quotes: QuoteAnalysis[];
    componentComparisons: ComponentComparison[];
    lowestQuote: QuoteAnalysis;
    highestQuote: QuoteAnalysis;
    medianCost: number;
    averageCost: number;
    costSpread: number;
    spreadPercentage: number;
    recommendedQuote: QuoteAnalysis;
    potentialSavings: number;
    savingsPercentage: number;
    riskLevel: 'low' | 'medium' | 'high';
    negotiationTargets: Array<{
      quoteId: number;
      panelBeaterName: string;
      components: string[];
      targetReduction: number;
      talkingPoints: string[];
    }>;
  }

// Market Value Estimation
POST   /api/cost/vehicle-valuation
  Input: {
    vehicleMake: string;
    vehicleModel: string;
    vehicleYear: number;
    mileage?: number;
    condition?: string;
  }
  Output: {
    valuationId: number;
    estimatedValue: number;
    valuationSource: string;
    confidence: number;
    comparables: Array<{
      make: string;
      model: string;
      year: number;
      price: number;
      source: string;
    }>;
  }

// Parts Pricing Lookup
GET    /api/cost/parts-pricing
  Query: {
    partName: string;
    vehicleMake: string;
    vehicleModel: string;
    vehicleYear: number;
    quality: 'aftermarket' | 'oem' | 'genuine';
  }
  Output: {
    partName: string;
    prices: Array<{
      supplier: string;
      price: number;
      quality: string;
      availability: string;
    }>;
    medianPrice: number;
  }

// Labor Rate Benchmarking
GET    /api/cost/labor-rates
  Query: {
    postalCode: string;
    shopType: 'dealership' | 'independent' | 'chain';
  }
  Output: {
    postalCode: string;
    avgLaborRate: number;
    rateRange: {
      min: number;
      max: number;
    };
    shopTypeAdjustment: number;
  }

// Cost Analytics
GET    /api/cost/analytics/trends
  Query: {
    startDate: Date;
    endDate: Date;
  }
  Output: {
    avgQuoteAmount: number;
    avgSavings: number;
    totalClaims: number;
    trendData: Array<{
      date: Date;
      avgQuote: number;
      avgSavings: number;
    }>;
  }
```

#### 2.5.3 Events Published

```typescript
// Domain Events
QuoteSubmitted {
  eventId: string;
  timestamp: Date;
  claimId: number;
  quoteId: number;
  panelBeaterId: number;
  quotedAmount: number;
  submittedBy: number;
}

QuoteComparisonCompleted {
  eventId: string;
  timestamp: Date;
  claimId: number;
  quoteCount: number;
  lowestQuote: number;
  highestQuote: number;
  recommendedQuoteId: number;
  potentialSavings: number;
}

CostOutlierDetected {
  eventId: string;
  timestamp: Date;
  claimId: number;
  quoteId: number;
  componentName: string;
  quotedCost: number;
  medianCost: number;
  variance: number;
}

VehicleValuationCompleted {
  eventId: string;
  timestamp: Date;
  claimId: number;
  valuationId: number;
  estimatedValue: number;
  confidence: number;
}
```

#### 2.5.4 Events Consumed

```typescript
// From claim-intake-service
ClaimSubmitted {
  claimId: number;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number;
}

// From ai-damage-service
AssessmentCompleted {
  claimId: number;
  estimatedCost: number;
  damagedComponents: ComponentDamage[];
}

// From workflow-engine-service
QuoteRequestSent {
  claimId: number;
  panelBeaterIds: number[];
}
```

#### 2.5.5 Database Ownership

**Tables Owned:**
- `panel_beater_quotes` - Quote submissions
- `quote_line_items` - Itemized quote breakdown
- `vehicle_market_valuations` - Vehicle value estimates
- `panel_beaters` - Repair shop registry (shared read/write)

**New Tables:**
- `parts_pricing_cache` - Cached parts pricing data
- `labor_rate_benchmarks` - Geographic labor rate data
- `cost_analytics` - Aggregated cost metrics

**Schema Definition:**
```sql
-- panel_beater_quotes table (existing, no changes)
CREATE TABLE panel_beater_quotes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  claim_id INT NOT NULL,
  panel_beater_id INT NOT NULL,
  quoted_amount INT NOT NULL,
  labor_cost INT,
  parts_cost INT,
  estimated_duration INT,
  parts_quality ENUM('aftermarket', 'oem', 'genuine', 'used'),
  warranty_months INT,
  status ENUM('pending', 'submitted', 'accepted', 'rejected') DEFAULT 'pending',
  submitted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_claim (claim_id),
  INDEX idx_panel_beater (panel_beater_id),
  INDEX idx_status (status)
);

-- quote_line_items table (existing, no changes)
CREATE TABLE quote_line_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  quote_id INT NOT NULL,
  component_name VARCHAR(100) NOT NULL,
  action ENUM('repair', 'replace') NOT NULL,
  parts_cost INT,
  labor_cost INT,
  labor_hours DECIMAL(5,2),
  notes TEXT,
  FOREIGN KEY (quote_id) REFERENCES panel_beater_quotes(id) ON DELETE CASCADE,
  INDEX idx_quote (quote_id),
  INDEX idx_component (component_name)
);

-- vehicle_market_valuations table (existing, no changes)
CREATE TABLE vehicle_market_valuations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  claim_id INT NOT NULL,
  vehicle_make VARCHAR(100),
  vehicle_model VARCHAR(100),
  vehicle_year INT,
  mileage INT,
  condition VARCHAR(50),
  estimated_value INT,
  valuation_source VARCHAR(100),
  confidence DECIMAL(5,2),
  comparables TEXT,  -- JSON array
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_claim (claim_id)
);

-- parts_pricing_cache table (NEW)
CREATE TABLE parts_pricing_cache (
  id INT AUTO_INCREMENT PRIMARY KEY,
  part_name VARCHAR(255) NOT NULL,
  vehicle_make VARCHAR(100),
  vehicle_model VARCHAR(100),
  vehicle_year INT,
  quality ENUM('aftermarket', 'oem', 'genuine'),
  supplier VARCHAR(100),
  price INT,
  availability VARCHAR(50),
  cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP,
  INDEX idx_part (part_name, vehicle_make, vehicle_model, vehicle_year),
  INDEX idx_expires (expires_at)
);

-- labor_rate_benchmarks table (NEW)
CREATE TABLE labor_rate_benchmarks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  postal_code VARCHAR(20) NOT NULL,
  shop_type ENUM('dealership', 'independent', 'chain'),
  avg_labor_rate INT,
  rate_min INT,
  rate_max INT,
  sample_size INT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_postal (postal_code),
  INDEX idx_shop_type (shop_type)
);

-- cost_analytics table (NEW)
CREATE TABLE cost_analytics (
  id INT AUTO_INCREMENT PRIMARY KEY,
  date DATE NOT NULL,
  total_claims INT,
  total_quotes INT,
  avg_quote_amount INT,
  avg_savings INT,
  median_quote_amount INT,
  INDEX idx_date (date)
);
```

#### 2.5.6 Refactoring Strategy

**Phase 1: Extract Cost Optimization Logic (Week 1-2)**

1. **Create service skeleton:**
   ```bash
   mkdir -p services/cost-optimisation-service
   cd services/cost-optimisation-service
   npm init -y
   npm install express @trpc/server drizzle-orm mysql2
   ```

2. **Extract cost optimization engine from `server/cost-optimization.ts`:**
   - Copy entire file (~400 LOC)
   - Move to `services/cost-optimisation-service/src/engines/cost-optimizer.ts`
   - Preserve all comparison and negotiation logic

3. **Extract vehicle valuation from `server/services/vehicleValuation.ts`:**
   - Copy entire file (~400 LOC)
   - Move to `services/cost-optimisation-service/src/services/valuation-service.ts`
   - Preserve external API integrations

4. **Extract database queries:**
   - Copy quote-related queries from `server/db.ts`
   - Move to `services/cost-optimisation-service/src/repositories/quote-repository.ts`

**Phase 2: Add External Integrations (Week 2-3)**

1. **Integrate parts pricing APIs:**
   ```typescript
   // services/cost-optimisation-service/src/integrations/parts-pricing.ts
   import axios from 'axios';

   export class PartsPricingClient {
     async getPartPrice(partName: string, vehicle: Vehicle, quality: string) {
       // Mitchell International API
       const mitchellPrice = await this.callMitchellAPI(partName, vehicle, quality);

       // CCC ONE API
       const cccPrice = await this.callCCCAPI(partName, vehicle, quality);

       // Return median
       return {
         prices: [mitchellPrice, cccPrice],
         median: this.calculateMedian([mitchellPrice.price, cccPrice.price]),
       };
     }

     private async callMitchellAPI(partName: string, vehicle: Vehicle, quality: string) {
       const response = await axios.post('https://api.mitchell.com/parts/pricing', {
         partName,
         make: vehicle.make,
         model: vehicle.model,
         year: vehicle.year,
         quality,
       }, {
         headers: {
           'Authorization': `Bearer ${process.env.MITCHELL_API_KEY}`,
         },
       });

       return response.data;
     }
   }
   ```

2. **Add labor rate benchmarking:**
   ```typescript
   // services/cost-optimisation-service/src/services/labor-rate-service.ts
   export class LaborRateService {
     async getLaborRate(postalCode: string, shopType: string) {
       // Check cache
       const cached = await this.getCachedRate(postalCode, shopType);
       if (cached && !this.isExpired(cached)) {
         return cached;
       }

       // Fetch from external source
       const rate = await this.fetchLaborRate(postalCode, shopType);

       // Cache result
       await this.cacheRate(postalCode, shopType, rate);

       return rate;
     }

     private async fetchLaborRate(postalCode: string, shopType: string) {
       // Call labor rate API (e.g., RepairPal, Chilton)
       // ...
     }
   }
   ```

**Phase 3: Database Migration (Week 3)**

1. **Create dedicated database:**
   ```sql
   CREATE DATABASE kinga_cost_optimisation;
   ```

2. **Migrate tables:**
   ```bash
   mysqldump kinga_db panel_beater_quotes quote_line_items vehicle_market_valuations panel_beaters > cost_schema.sql
   mysql kinga_cost_optimisation < cost_schema.sql
   ```

3. **Create new tables (parts_pricing_cache, labor_rate_benchmarks, cost_analytics)**

**Phase 4: Event Integration (Week 3-4)**

1. **Consume events from claim-intake and ai-damage services**
2. **Publish quote and comparison events**

**Phase 5: API Gateway Integration & Cutover (Week 4)**

**Code Preservation Checklist:**
- ✅ All existing comparison logic preserved
- ✅ Negotiation strategy generation unchanged
- ✅ Vehicle valuation logic preserved
- ✅ Database schema backward compatible

---

### 2.6 Workflow Engine Service

**Bounded Context:** Business process orchestration, state machine management, and approval workflows.

#### 2.6.1 Responsibility Boundaries

The Workflow Engine Service owns all business process orchestration including claim lifecycle state management, approval workflows, and saga coordination for distributed transactions. This service enforces business rules for state transitions, manages approval hierarchies, and coordinates multi-step processes across services. It serves as the orchestration layer that ties together the domain services.

**Core Responsibilities:**
- Manage claim workflow state machine
- Orchestrate approval workflows (technical, financial)
- Coordinate distributed transactions using saga pattern
- Enforce business rules for state transitions
- Track workflow history and audit trail
- Manage workflow timeouts and escalations
- Provide workflow analytics and bottleneck detection
- Handle workflow compensation (rollback)

**Out of Scope:**
- Domain-specific logic (delegated to domain services)
- Data persistence (services own their data)
- User authentication (delegated to identity-access-service)

#### 2.6.2 APIs Owned

**REST Endpoints (tRPC Procedures):**

```typescript
// Workflow State Management
POST   /api/workflow/transition
  Input: {
    claimId: number;
    targetState: string;
    triggeredBy: number;
    reason?: string;
  }
  Output: {
    success: boolean;
    currentState: string;
    previousState: string;
    transitionId: number;
  }

GET    /api/workflow/state/:claimId
  Output: {
    claimId: number;
    currentState: string;
    stateHistory: Array<{
      state: string;
      enteredAt: Date;
      exitedAt?: Date;
      triggeredBy: number;
    }>;
  }

// Approval Workflows
POST   /api/workflow/approvals
  Input: {
    claimId: number;
    approvalType: 'technical' | 'financial';
    requestedBy: number;
    requiredApprovers: number[];
    deadline?: Date;
  }
  Output: {
    approvalId: number;
    approval: ApprovalWorkflow;
  }

POST   /api/workflow/approvals/:approvalId/approve
  Input: {
    approverId: number;
    decision: 'approved' | 'rejected';
    comments?: string;
  }
  Output: {
    approval: ApprovalWorkflow;
    workflowCompleted: boolean;
  }

GET    /api/workflow/approvals/:approvalId
  Output: {
    approval: ApprovalWorkflow;
    approvers: Array<{
      userId: number;
      decision?: string;
      decidedAt?: Date;
      comments?: string;
    }>;
  }

GET    /api/workflow/approvals/pending/:userId
  Output: {
    pendingApprovals: ApprovalWorkflow[];
  }

// Saga Orchestration
POST   /api/workflow/sagas/start
  Input: {
    sagaType: string;
    claimId: number;
    steps: Array<{
      service: string;
      action: string;
      compensationAction: string;
    }>;
  }
  Output: {
    sagaId: string;
    status: 'running';
  }

GET    /api/workflow/sagas/:sagaId
  Output: {
    sagaId: string;
    status: 'running' | 'completed' | 'failed' | 'compensating';
    currentStep: number;
    steps: Array<{
      stepId: number;
      service: string;
      action: string;
      status: 'pending' | 'completed' | 'failed';
      result?: any;
    }>;
  }

// Workflow Analytics
GET    /api/workflow/analytics/bottlenecks
  Output: {
    bottlenecks: Array<{
      state: string;
      avgDuration: number;
      claimCount: number;
    }>;
  }

GET    /api/workflow/analytics/sla-violations
  Query: {
    startDate: Date;
    endDate: Date;
  }
  Output: {
    violations: Array<{
      claimId: number;
      claimNumber: string;
      state: string;
      expectedDuration: number;
      actualDuration: number;
    }>;
  }
```

#### 2.6.3 Events Published

```typescript
// Domain Events
WorkflowStateChanged {
  eventId: string;
  timestamp: Date;
  claimId: number;
  previousState: string;
  newState: string;
  triggeredBy: number;
  reason?: string;
}

ApprovalRequested {
  eventId: string;
  timestamp: Date;
  approvalId: number;
  claimId: number;
  approvalType: string;
  requiredApprovers: number[];
  deadline?: Date;
}

ApprovalCompleted {
  eventId: string;
  timestamp: Date;
  approvalId: number;
  claimId: number;
  decision: string;
  approvedBy: number;
}

SagaStarted {
  eventId: string;
  timestamp: Date;
  sagaId: string;
  claimId: number;
  sagaType: string;
}

SagaCompleted {
  eventId: string;
  timestamp: Date;
  sagaId: string;
  claimId: number;
  result: any;
}

SagaFailed {
  eventId: string;
  timestamp: Date;
  sagaId: string;
  claimId: number;
  failedStep: number;
  error: string;
}

SagaCompensating {
  eventId: string;
  timestamp: Date;
  sagaId: string;
  claimId: number;
  compensationStep: number;
}
```

#### 2.6.4 Events Consumed

```typescript
// From all domain services
ClaimSubmitted {
  claimId: number;
}

AssessmentCompleted {
  claimId: number;
}

FraudAlertRaised {
  claimId: number;
  severity: string;
}

QuoteSubmitted {
  claimId: number;
}

// ... other domain events
```

#### 2.6.5 Database Ownership

**Tables Owned:**
- `approval_workflow` - Approval tracking (existing)

**New Tables:**
- `workflow_state_history` - State transition audit trail
- `saga_executions` - Saga orchestration tracking
- `workflow_sla_config` - SLA thresholds per state

**Schema Definition:**
```sql
-- approval_workflow table (existing, no changes)
CREATE TABLE approval_workflow (
  id INT AUTO_INCREMENT PRIMARY KEY,
  claim_id INT NOT NULL,
  approval_type ENUM('technical', 'financial') NOT NULL,
  requested_by INT NOT NULL,
  required_approvers TEXT,  -- JSON array
  status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
  deadline TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  INDEX idx_claim (claim_id),
  INDEX idx_status (status)
);

-- workflow_state_history table (NEW)
CREATE TABLE workflow_state_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  claim_id INT NOT NULL,
  previous_state VARCHAR(50),
  new_state VARCHAR(50) NOT NULL,
  triggered_by INT NOT NULL,
  reason TEXT,
  entered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  exited_at TIMESTAMP,
  INDEX idx_claim (claim_id),
  INDEX idx_state (new_state),
  INDEX idx_entered_at (entered_at)
);

-- saga_executions table (NEW)
CREATE TABLE saga_executions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  saga_id VARCHAR(50) NOT NULL UNIQUE,
  claim_id INT NOT NULL,
  saga_type VARCHAR(100) NOT NULL,
  status ENUM('running', 'completed', 'failed', 'compensating') DEFAULT 'running',
  current_step INT DEFAULT 0,
  steps TEXT NOT NULL,  -- JSON array
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  INDEX idx_saga_id (saga_id),
  INDEX idx_claim (claim_id),
  INDEX idx_status (status)
);

-- workflow_sla_config table (NEW)
CREATE TABLE workflow_sla_config (
  id INT AUTO_INCREMENT PRIMARY KEY,
  state VARCHAR(50) NOT NULL UNIQUE,
  expected_duration_hours INT NOT NULL,
  escalation_threshold_hours INT,
  escalation_action TEXT,  -- JSON object
  INDEX idx_state (state)
);
```

#### 2.6.6 Refactoring Strategy

**Phase 1: Extract Workflow Logic (Week 1-2)**

1. **Create service skeleton:**
   ```bash
   mkdir -p services/workflow-engine-service
   cd services/workflow-engine-service
   npm install express @trpc/server drizzle-orm mysql2 node-workflow
   ```

2. **Extract workflow logic from `server/workflow.ts`:**
   - Copy entire file (~250 LOC)
   - Move to `services/workflow-engine-service/src/engines/workflow-engine.ts`
   - Preserve state machine logic

3. **Extract approval workflow from `server/db.ts`:**
   - Copy approval-related queries
   - Move to `services/workflow-engine-service/src/repositories/approval-repository.ts`

**Phase 2: Implement State Machine (Week 2)**

1. **Define state machine:**
   ```typescript
   // services/workflow-engine-service/src/state-machines/claim-workflow.ts
   import { StateMachine } from 'node-workflow';

   export const claimWorkflowStateMachine = new StateMachine({
     initial: 'created',
     states: {
       created: {
         on: {
           ASSIGN: 'assigned',
           REJECT: 'rejected',
         },
       },
       assigned: {
         on: {
           START_ASSESSMENT: 'under_assessment',
         },
       },
       under_assessment: {
         on: {
           COMPLETE_ASSESSMENT: 'internal_review',
         },
       },
       internal_review: {
         on: {
           REQUEST_TECHNICAL_APPROVAL: 'technical_approval',
           RETURN_TO_ASSESSMENT: 'under_assessment',
         },
       },
       technical_approval: {
         on: {
           APPROVE_TECHNICAL: 'financial_decision',
           REJECT_TECHNICAL: 'rejected',
         },
       },
       financial_decision: {
         on: {
           APPROVE_FINANCIAL: 'payment_authorized',
           REJECT_FINANCIAL: 'rejected',
         },
       },
       payment_authorized: {
         on: {
           CLOSE: 'closed',
         },
       },
       closed: {
         type: 'final',
       },
       rejected: {
         type: 'final',
       },
     },
   });
   ```

2. **Implement transition handler:**
   ```typescript
   // POST /api/workflow/transition
   export const transitionWorkflow = protectedProcedure
     .input(z.object({
       claimId: z.number(),
       targetState: z.string(),
       triggeredBy: z.number(),
     }))
     .mutation(async ({ input }) => {
       // Get current state
       const currentState = await getClaimWorkflowState(input.claimId);

       // Validate transition
       const canTransition = claimWorkflowStateMachine.can(currentState, input.targetState);
       if (!canTransition) {
         throw new Error(`Invalid transition from ${currentState} to ${input.targetState}`);
       }

       // Execute transition
       const transition = await executeTransition(input.claimId, currentState, input.targetState);

       // Save to history
       await saveWorkflowHistory(input.claimId, currentState, input.targetState, input.triggeredBy);

       // Publish event
       await eventPublisher.publishWorkflowStateChanged({
         claimId: input.claimId,
         previousState: currentState,
         newState: input.targetState,
         triggeredBy: input.triggeredBy,
       });

       return transition;
     });
   ```

**Phase 3: Implement Saga Pattern (Week 3)**

1. **Create saga orchestrator:**
   ```typescript
   // services/workflow-engine-service/src/sagas/saga-orchestrator.ts
   export class SagaOrchestrator {
     async executeSaga(sagaType: string, claimId: number, steps: SagaStep[]) {
       const sagaId = nanoid();
       
       // Save saga execution
       await this.saveSagaExecution(sagaId, claimId, sagaType, steps);

       // Execute steps sequentially
       for (let i = 0; i < steps.length; i++) {
         const step = steps[i];
         
         try {
           // Call service
           const result = await this.executeStep(step);
           
           // Update saga state
           await this.updateSagaStep(sagaId, i, 'completed', result);
         } catch (error) {
           // Step failed, start compensation
           await this.compensate(sagaId, i, steps);
           throw error;
         }
       }

       // Saga completed
       await this.completeSaga(sagaId);
       await eventPublisher.publishSagaCompleted(sagaId, claimId);
     }

     private async compensate(sagaId: string, failedStep: number, steps: SagaStep[]) {
       // Execute compensation actions in reverse order
       for (let i = failedStep - 1; i >= 0; i--) {
         const step = steps[i];
         await this.executeCompensation(step);
       }

       await eventPublisher.publishSagaFailed(sagaId);
     }
   }
   ```

2. **Example saga: Claim Approval**
   ```typescript
   // Saga for claim approval workflow
   const approvalSaga = {
     type: 'claim_approval',
     steps: [
       {
         service: 'ai-damage-service',
         action: 'assessClaim',
         compensationAction: 'deleteAssessment',
       },
       {
         service: 'fraud-detection-service',
         action: 'scoreFraud',
         compensationAction: 'deleteFraudScore',
       },
       {
         service: 'cost-optimisation-service',
         action: 'compareQuotes',
         compensationAction: 'deleteComparison',
       },
       {
         service: 'workflow-engine-service',
         action: 'requestApproval',
         compensationAction: 'cancelApproval',
       },
     ],
   };

   await sagaOrchestrator.executeSaga('claim_approval', claimId, approvalSaga.steps);
   ```

**Phase 4: Database Migration (Week 3)**

1. **Create dedicated database:**
   ```sql
   CREATE DATABASE kinga_workflow_engine;
   ```

2. **Migrate tables:**
   ```bash
   mysqldump kinga_db approval_workflow > workflow_schema.sql
   mysql kinga_workflow_engine < workflow_schema.sql
   ```

3. **Create new tables (workflow_state_history, saga_executions, workflow_sla_config)**

**Phase 5: Event Integration (Week 4)**

1. **Consume events from all domain services**
2. **Publish workflow events**
3. **Trigger state transitions based on domain events**

**Phase 6: API Gateway Integration & Cutover (Week 4)**

**Code Preservation Checklist:**
- ✅ All existing workflow logic preserved
- ✅ Approval workflow unchanged
- ✅ State machine logic preserved

---

### 2.7 Fleet Risk Service

**Bounded Context:** Fleet-level analytics, risk profiling, and predictive insights.

#### 2.7.1 Responsibility Boundaries

The Fleet Risk Service owns all fleet-level intelligence including vehicle history tracking, driver risk profiling, loss ratio analysis, and predictive analytics. This service provides strategic insights for commercial insurance clients with vehicle fleets. It serves as the data warehouse and analytics layer for fleet management.

**Core Responsibilities:**
- Track vehicle history across claims
- Profile driver risk based on claim history
- Calculate loss ratios by fleet segment
- Provide benchmark comparisons across fleets
- Generate predictive risk scores
- Integrate with telematics providers
- Provide fleet analytics dashboards
- Track maintenance and usage patterns

**Out of Scope:**
- Individual claim processing (delegated to claim-intake-service)
- Damage assessment (delegated to ai-damage-service)
- Fraud detection (delegated to fraud-detection-service)

#### 2.7.2 APIs Owned

**REST Endpoints (tRPC Procedures):**

```typescript
// Vehicle History
GET    /api/fleet/vehicles/:vehicleRegistration/history
  Output: {
    vehicleRegistration: string;
    claims: Array<{
      claimId: number;
      claimNumber: string;
      incidentDate: Date;
      estimatedCost: number;
      status: string;
    }>;
    totalClaims: number;
    totalCost: number;
    avgClaimCost: number;
  }

// Driver Risk Profiling
GET    /api/fleet/drivers/:driverId/risk-profile
  Output: {
    driverId: number;
    riskScore: number;  // 0-100
    riskLevel: 'low' | 'medium' | 'high';
    claimHistory: Array<{
      claimId: number;
      incidentDate: Date;
      atFault: boolean;
      cost: number;
    }>;
    drivingBehavior?: {
      harshBraking: number;
      speeding: number;
      idling: number;
    };
  }

// Fleet Analytics
GET    /api/fleet/:fleetId/analytics
  Query: {
    startDate: Date;
    endDate: Date;
  }
  Output: {
    fleetId: number;
    vehicleCount: number;
    totalClaims: number;
    totalCost: number;
    lossRatio: number;
    avgClaimCost: number;
    claimFrequency: number;
    topRiskVehicles: Array<{
      vehicleRegistration: string;
      claimCount: number;
      totalCost: number;
    }>;
    topRiskDrivers: Array<{
      driverId: number;
      driverName: string;
      riskScore: number;
    }>;
  }

// Loss Ratio Analysis
GET    /api/fleet/:fleetId/loss-ratio
  Query: {
    startDate: Date;
    endDate: Date;
    groupBy: 'vehicle_type' | 'driver' | 'region';
  }
  Output: {
    segments: Array<{
      segmentName: string;
      premiumCollected: number;
      claimsPaid: number;
      lossRatio: number;
    }>;
  }

// Benchmark Comparisons
GET    /api/fleet/:fleetId/benchmarks
  Output: {
    fleetMetrics: {
      lossRatio: number;
      claimFrequency: number;
      avgClaimCost: number;
    };
    industryBenchmarks: {
      lossRatio: number;
      claimFrequency: number;
      avgClaimCost: number;
    };
    peerGroupBenchmarks: {
      lossRatio: number;
      claimFrequency: number;
      avgClaimCost: number;
    };
  }

// Predictive Risk Scoring
POST   /api/fleet/predict-risk
  Input: {
    vehicleRegistration: string;
    driverId: number;
    usagePatterns: {
      avgMileagePerMonth: number;
      avgTripsPerDay: number;
      nightDrivingPercentage: number;
    };
  }
  Output: {
    predictedRiskScore: number;
    predictedClaimProbability: number;
    riskFactors: string[];
  }

// Telematics Integration
POST   /api/fleet/telematics/sync
  Input: {
    fleetId: number;
    telematicsProvider: string;
    apiKey: string;
  }
  Output: {
    syncId: string;
    status: 'syncing';
  }

GET    /api/fleet/telematics/sync/:syncId
  Output: {
    syncId: string;
    status: 'syncing' | 'completed' | 'failed';
    vehiclesSynced: number;
    dataPoints: number;
  }
```

#### 2.7.3 Events Published

```typescript
// Domain Events
VehicleHistoryUpdated {
  eventId: string;
  timestamp: Date;
  vehicleRegistration: string;
  claimId: number;
  totalClaims: number;
  totalCost: number;
}

DriverRiskScoreUpdated {
  eventId: string;
  timestamp: Date;
  driverId: number;
  previousRiskScore: number;
  newRiskScore: number;
  riskLevel: string;
}

HighRiskVehicleDetected {
  eventId: string;
  timestamp: Date;
  vehicleRegistration: string;
  fleetId: number;
  claimCount: number;
  totalCost: number;
  threshold: number;
}

TelematicsSyncCompleted {
  eventId: string;
  timestamp: Date;
  syncId: string;
  fleetId: number;
  vehiclesSynced: number;
  dataPoints: number;
}
```

#### 2.7.4 Events Consumed

```typescript
// From claim-intake-service
ClaimSubmitted {
  claimId: number;
  vehicleRegistration: string;
  claimantId: number;
}

ClaimStatusChanged {
  claimId: number;
  newStatus: string;
}

// From cost-optimisation-service
QuoteComparisonCompleted {
  claimId: number;
  lowestQuote: number;
  potentialSavings: number;
}
```

#### 2.7.5 Database Ownership

**Tables Owned:**
- `vehicle_history` - Vehicle claim history (existing)
- `claimant_history` - Claimant/driver claim history (existing)

**New Tables:**
- `fleet_analytics` - Aggregated fleet metrics
- `driver_risk_profiles` - Driver risk scores and behavior
- `telematics_data` - Raw telematics data
- `fleet_benchmarks` - Industry and peer group benchmarks

**Schema Definition:**
```sql
-- vehicle_history table (existing, no changes)
CREATE TABLE vehicle_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vehicle_registration VARCHAR(50) NOT NULL,
  claim_id INT NOT NULL,
  incident_date TIMESTAMP,
  estimated_cost INT,
  status VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_vehicle (vehicle_registration),
  INDEX idx_claim (claim_id)
);

-- claimant_history table (existing, no changes)
CREATE TABLE claimant_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  claimant_id INT NOT NULL,
  claim_id INT NOT NULL,
  incident_date TIMESTAMP,
  at_fault TINYINT,
  cost INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_claimant (claimant_id),
  INDEX idx_claim (claim_id)
);

-- fleet_analytics table (NEW)
CREATE TABLE fleet_analytics (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fleet_id INT NOT NULL,
  date DATE NOT NULL,
  vehicle_count INT,
  total_claims INT,
  total_cost INT,
  loss_ratio DECIMAL(5,2),
  avg_claim_cost INT,
  claim_frequency DECIMAL(5,2),
  INDEX idx_fleet (fleet_id),
  INDEX idx_date (date)
);

-- driver_risk_profiles table (NEW)
CREATE TABLE driver_risk_profiles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  driver_id INT NOT NULL UNIQUE,
  risk_score INT,
  risk_level ENUM('low', 'medium', 'high'),
  total_claims INT,
  at_fault_claims INT,
  harsh_braking_events INT,
  speeding_events INT,
  idling_hours DECIMAL(6,2),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_driver (driver_id),
  INDEX idx_risk_level (risk_level)
);

-- telematics_data table (NEW)
CREATE TABLE telematics_data (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vehicle_registration VARCHAR(50) NOT NULL,
  driver_id INT,
  timestamp TIMESTAMP NOT NULL,
  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8),
  speed INT,
  harsh_braking TINYINT,
  harsh_acceleration TINYINT,
  idling TINYINT,
  INDEX idx_vehicle (vehicle_registration),
  INDEX idx_timestamp (timestamp)
);

-- fleet_benchmarks table (NEW)
CREATE TABLE fleet_benchmarks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  benchmark_type ENUM('industry', 'peer_group') NOT NULL,
  fleet_segment VARCHAR(100),
  loss_ratio DECIMAL(5,2),
  claim_frequency DECIMAL(5,2),
  avg_claim_cost INT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_type (benchmark_type),
  INDEX idx_segment (fleet_segment)
);
```

#### 2.7.6 Refactoring Strategy

**Phase 1: Extract Executive Analytics (Week 1-2)**

1. **Create service skeleton:**
   ```bash
   mkdir -p services/fleet-risk-service
   cd services/fleet-risk-service
   npm install express @trpc/server drizzle-orm mysql2 @timescale/timescaledb
   ```

2. **Extract executive analytics from `server/executive-analytics.ts`:**
   - Copy relevant functions (~350 LOC)
   - Move to `services/fleet-risk-service/src/analytics/fleet-analytics.ts`
   - Refactor from claim-centric to fleet-centric

3. **Extract database queries:**
   - Copy vehicle/claimant history queries from `server/db.ts`
   - Move to `services/fleet-risk-service/src/repositories/fleet-repository.ts`

**Phase 2: Implement Data Warehouse (Week 2-3)**

1. **Set up TimescaleDB for time-series data:**
   ```sql
   -- Enable TimescaleDB extension
   CREATE EXTENSION IF NOT EXISTS timescaledb;

   -- Convert telematics_data to hypertable
   SELECT create_hypertable('telematics_data', 'timestamp');

   -- Create continuous aggregates for analytics
   CREATE MATERIALIZED VIEW fleet_analytics_hourly
   WITH (timescaledb.continuous) AS
   SELECT
     vehicle_registration,
     time_bucket('1 hour', timestamp) AS hour,
     AVG(speed) AS avg_speed,
     SUM(harsh_braking) AS harsh_braking_count,
     SUM(idling) AS idling_minutes
   FROM telematics_data
   GROUP BY vehicle_registration, hour;
   ```

2. **Implement dimensional modeling:**
   ```sql
   -- Dimension tables
   CREATE TABLE dim_vehicle (
     vehicle_id INT PRIMARY KEY,
     vehicle_registration VARCHAR(50),
     vehicle_type VARCHAR(50),
     make VARCHAR(100),
     model VARCHAR(100),
     year INT
   );

   CREATE TABLE dim_driver (
     driver_id INT PRIMARY KEY,
     driver_name VARCHAR(255),
     license_number VARCHAR(50),
     hire_date DATE
   );

   CREATE TABLE dim_time (
     date_id INT PRIMARY KEY,
     date DATE,
     year INT,
     quarter INT,
     month INT,
     day_of_week INT
   );

   -- Fact table
   CREATE TABLE fact_claims (
     claim_id INT PRIMARY KEY,
     vehicle_id INT,
     driver_id INT,
     date_id INT,
     cost INT,
     loss_ratio DECIMAL(5,2),
     FOREIGN KEY (vehicle_id) REFERENCES dim_vehicle(vehicle_id),
     FOREIGN KEY (driver_id) REFERENCES dim_driver(driver_id),
     FOREIGN KEY (date_id) REFERENCES dim_time(date_id)
   );
   ```

**Phase 3: Add Telematics Integration (Week 3-4)**

1. **Create telematics client:**
   ```typescript
   // services/fleet-risk-service/src/integrations/telematics-client.ts
   export class TelematicsClient {
     async syncFleet(fleetId: number, provider: string, apiKey: string) {
       const syncId = nanoid();
       
       // Queue sync job
       await telematicsSyncQueue.add({
         syncId,
         fleetId,
         provider,
         apiKey,
       });

       return { syncId, status: 'syncing' };
     }

     async fetchTelematicsData(provider: string, vehicleId: string, apiKey: string) {
       switch (provider) {
         case 'geotab':
           return await this.fetchGeotabData(vehicleId, apiKey);
         case 'verizon_connect':
           return await this.fetchVerizonConnectData(vehicleId, apiKey);
         default:
           throw new Error(`Unsupported provider: ${provider}`);
       }
     }

     private async fetchGeotabData(vehicleId: string, apiKey: string) {
       // Call Geotab API
       // ...
     }
   }
   ```

2. **Process telematics data:**
   ```typescript
   telematicsSyncQueue.process(async (job) => {
     const { syncId, fleetId, provider, apiKey } = job.data;
     
     // Get fleet vehicles
     const vehicles = await getFleetVehicles(fleetId);
     
     let vehiclesSynced = 0;
     let dataPoints = 0;
     
     for (const vehicle of vehicles) {
       // Fetch telematics data
       const data = await telematicsClient.fetchTelematicsData(
         provider,
         vehicle.registration,
         apiKey
       );
       
       // Save to database
       await saveTelematicsData(vehicle.registration, data);
       
       vehiclesSynced++;
       dataPoints += data.length;
       
       // Update progress
       job.progress((vehiclesSynced / vehicles.length) * 100);
     }
     
     // Publish event
     await eventPublisher.publishTelematicsSyncCompleted({
       syncId,
       fleetId,
       vehiclesSynced,
       dataPoints,
     });
   });
   ```

**Phase 4: Implement Predictive Analytics (Week 4)**

1. **Create risk prediction model:**
   ```python
   # services/fleet-risk-service/python/risk_predictor.py
   import pandas as pd
   from sklearn.ensemble import RandomForestClassifier

   class RiskPredictor:
       def __init__(self):
           self.model = RandomForestClassifier()
           
       def train(self, historical_data):
           X = historical_data[['avg_mileage', 'avg_trips', 'night_driving_pct', 'harsh_braking', 'speeding']]
           y = historical_data['had_claim']
           self.model.fit(X, y)
           
       def predict(self, vehicle_data):
           X = [[
               vehicle_data['avg_mileage'],
               vehicle_data['avg_trips'],
               vehicle_data['night_driving_pct'],
               vehicle_data['harsh_braking'],
               vehicle_data['speeding'],
           ]]
           probability = self.model.predict_proba(X)[0][1]
           return probability
   ```

**Phase 5: Database Migration (Week 4)**

1. **Create dedicated database:**
   ```sql
   CREATE DATABASE kinga_fleet_risk;
   ```

2. **Migrate tables and create new tables**

**Phase 6: API Gateway Integration & Cutover (Week 4)**

**Code Preservation Checklist:**
- ✅ Executive analytics logic preserved
- ✅ Vehicle/claimant history tracking unchanged

---

### 2.8 Insurer Integration Service

**Bounded Context:** External system integrations, API gateway, and third-party service orchestration.

#### 2.8.1 Responsibility Boundaries

The Insurer Integration Service owns all external system integrations including policy management systems, FNOL (First Notice of Loss) systems, payment gateways, and third-party data providers. This service acts as an adapter layer between KINGA and external insurance systems. It serves as the integration hub for all external communications.

**Core Responsibilities:**
- Integrate with policy management systems
- Integrate with FNOL systems for claim submission
- Integrate with payment gateways for claim payments
- Integrate with credit bureaus for identity verification
- Integrate with vehicle valuation services
- Integrate with parts pricing databases
- Manage API keys and credentials for external services
- Handle webhook callbacks from external systems
- Provide unified API for external integrations
- Log all external API calls for audit

**Out of Scope:**
- Internal business logic (delegated to domain services)
- Data persistence (services own their data)

#### 2.8.2 APIs Owned

**REST Endpoints (tRPC Procedures):**

```typescript
// Policy Verification
POST   /api/integrations/policy/verify
  Input: {
    policyNumber: string;
    claimantName: string;
    vehicleRegistration: string;
  }
  Output: {
    verified: boolean;
    policyDetails?: {
      policyNumber: string;
      policyHolder: string;
      coverageType: string;
      coverageLimit: number;
      deductible: number;
      effectiveDate: Date;
      expiryDate: Date;
    };
    reason?: string;
  }

// FNOL Submission
POST   /api/integrations/fnol/submit
  Input: {
    claimNumber: string;
    claimData: object;
  }
  Output: {
    externalClaimId: string;
    status: string;
  }

// Payment Processing
POST   /api/integrations/payment/process
  Input: {
    claimId: number;
    amount: number;
    paymentMethod: string;
    recipientDetails: object;
  }
  Output: {
    paymentId: string;
    status: 'pending' | 'completed' | 'failed';
    transactionId?: string;
  }

// Identity Verification
POST   /api/integrations/identity/verify
  Input: {
    name: string;
    idNumber: string;
    dateOfBirth: Date;
  }
  Output: {
    verified: boolean;
    confidence: number;
    matchDetails: object;
  }

// Vehicle Valuation (External)
POST   /api/integrations/valuation/vehicle
  Input: {
    make: string;
    model: string;
    year: number;
    mileage: number;
  }
  Output: {
    estimatedValue: number;
    valuationSource: string;
    comparables: object[];
  }

// Parts Pricing (External)
GET    /api/integrations/parts/pricing
  Query: {
    partName: string;
    make: string;
    model: string;
    year: number;
  }
  Output: {
    prices: Array<{
      supplier: string;
      price: number;
      availability: string;
    }>;
  }

// Webhook Management
POST   /api/integrations/webhooks/register
  Input: {
    externalSystem: string;
    eventType: string;
    callbackUrl: string;
  }
  Output: {
    webhookId: string;
    secret: string;
  }

POST   /api/integrations/webhooks/callback/:webhookId
  Input: {
    signature: string;
    payload: object;
  }
  Output: {
    received: boolean;
  }

// Integration Logs
GET    /api/integrations/logs
  Query: {
    startDate: Date;
    endDate: Date;
    externalSystem?: string;
  }
  Output: {
    logs: Array<{
      timestamp: Date;
      externalSystem: string;
      endpoint: string;
      method: string;
      statusCode: number;
      responseTime: number;
    }>;
  }
```

#### 2.8.3 Events Published

```typescript
// Domain Events
PolicyVerified {
  eventId: string;
  timestamp: Date;
  claimId: number;
  policyNumber: string;
  verified: boolean;
  policyDetails?: object;
}

FNOLSubmitted {
  eventId: string;
  timestamp: Date;
  claimId: number;
  claimNumber: string;
  externalClaimId: string;
}

PaymentProcessed {
  eventId: string;
  timestamp: Date;
  claimId: number;
  paymentId: string;
  amount: number;
  status: string;
}

ExternalAPICallFailed {
  eventId: string;
  timestamp: Date;
  externalSystem: string;
  endpoint: string;
  error: string;
}
```

#### 2.8.4 Events Consumed

```typescript
// From claim-intake-service
ClaimSubmitted {
  claimId: number;
  policyNumber: string;
}

// From workflow-engine-service
PaymentAuthorized {
  claimId: number;
  approvedAmount: number;
}
```

#### 2.8.5 Database Ownership

**New Tables:**
- `external_system_configs` - External system credentials and endpoints
- `integration_logs` - API call audit trail
- `webhook_registrations` - Webhook configurations

**Schema Definition:**
```sql
-- external_system_configs table (NEW)
CREATE TABLE external_system_configs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  system_name VARCHAR(100) NOT NULL UNIQUE,
  system_type VARCHAR(50),
  base_url TEXT,
  api_key_encrypted TEXT,
  credentials_encrypted TEXT,
  enabled TINYINT DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_system (system_name)
);

-- integration_logs table (NEW)
CREATE TABLE integration_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  external_system VARCHAR(100) NOT NULL,
  endpoint TEXT,
  method VARCHAR(10),
  request_payload TEXT,
  response_payload TEXT,
  status_code INT,
  response_time INT,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_system (external_system),
  INDEX idx_created_at (created_at)
);

-- webhook_registrations table (NEW)
CREATE TABLE webhook_registrations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  webhook_id VARCHAR(50) NOT NULL UNIQUE,
  external_system VARCHAR(100) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  callback_url TEXT NOT NULL,
  secret VARCHAR(255) NOT NULL,
  enabled TINYINT DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_webhook_id (webhook_id),
  INDEX idx_system (external_system)
);
```

#### 2.8.6 Refactoring Strategy

**Phase 1: Create Integration Service (Week 1-2)**

1. **Create service skeleton:**
   ```bash
   mkdir -p services/insurer-integration-service
   cd services/insurer-integration-service
   npm install express @trpc/server axios drizzle-orm mysql2
   ```

2. **Create integration clients:**
   ```typescript
   // services/insurer-integration-service/src/clients/policy-system-client.ts
   export class PolicySystemClient {
     async verifyPolicy(policyNumber: string, claimantName: string) {
       const config = await getExternalSystemConfig('policy_management');
       
       const response = await axios.post(`${config.baseUrl}/policies/verify`, {
         policyNumber,
         claimantName,
       }, {
         headers: {
           'Authorization': `Bearer ${config.apiKey}`,
         },
       });

       // Log API call
       await logIntegrationCall('policy_management', '/policies/verify', 'POST', response);

       return response.data;
     }
   }
   ```

3. **Extract existing integrations:**
   - Vehicle valuation from `server/services/vehicleValuation.ts`
   - Move to `services/insurer-integration-service/src/clients/valuation-client.ts`

**Phase 2: Implement Webhook Handler (Week 2)**

1. **Create webhook receiver:**
   ```typescript
   // POST /api/integrations/webhooks/callback/:webhookId
   export const handleWebhook = publicProcedure
     .input(z.object({
       webhookId: z.string(),
       signature: z.string(),
       payload: z.any(),
     }))
     .mutation(async ({ input }) => {
       // Get webhook config
       const webhook = await getWebhookRegistration(input.webhookId);

       // Verify signature
       const isValid = verifyWebhookSignature(input.payload, input.signature, webhook.secret);
       if (!isValid) {
         throw new Error('Invalid webhook signature');
       }

       // Process webhook based on event type
       await processWebhookEvent(webhook.eventType, input.payload);

       return { received: true };
     });
   ```

**Phase 3: Database Setup (Week 2)**

1. **Create dedicated database:**
   ```sql
   CREATE DATABASE kinga_insurer_integration;
   ```

2. **Create tables (external_system_configs, integration_logs, webhook_registrations)**

**Phase 4: Event Integration (Week 3)**

1. **Consume events from domain services**
2. **Publish integration events**

**Phase 5: API Gateway Integration & Cutover (Week 3)**

**Code Preservation Checklist:**
- ✅ Vehicle valuation integration preserved
- ✅ External API patterns preserved

---

### 2.9 Identity Access Service

**Bounded Context:** Authentication, authorization, user management, and RBAC.

#### 2.9.1 Responsibility Boundaries

The Identity Access Service owns all identity and access management including user authentication, authorization, role-based access control, session management, and user profile management. This service serves as the security foundation for all other services.

**Core Responsibilities:**
- Authenticate users via OAuth and traditional login
- Manage user sessions and JWT tokens
- Enforce role-based access control (RBAC)
- Manage user profiles and organizations
- Handle user invitations and email verification
- Provide multi-factor authentication (MFA)
- Integrate with SSO providers (SAML, OIDC)
- Manage API keys for programmatic access
- Track security events and audit logs
- Provide user management APIs

**Out of Scope:**
- Business logic (delegated to domain services)
- Data persistence for domain entities (services own their data)

#### 2.9.2 APIs Owned

**REST Endpoints (tRPC Procedures):**

```typescript
// Authentication
POST   /api/identity/auth/login
  Input: {
    email: string;
    password: string;
  }
  Output: {
    token: string;
    user: User;
  }

POST   /api/identity/auth/oauth/callback
  Input: {
    code: string;
    state: string;
  }
  Output: {
    token: string;
    user: User;
  }

POST   /api/identity/auth/logout
  Output
: {
    success: boolean;
  }

POST   /api/identity/auth/refresh
  Input: {
    refreshToken: string;
  }
  Output: {
    token: string;
  }

// User Management
GET    /api/identity/users/:userId
  Output: {
    user: User;
  }

PATCH  /api/identity/users/:userId
  Input: {
    name?: string;
    email?: string;
    role?: string;
  }
  Output: {
    user: User;
  }

GET    /api/identity/users
  Query: {
    role?: string;
    organizationId?: number;
    page?: number;
    limit?: number;
  }
  Output: {
    users: User[];
    total: number;
  }

// Role Management
POST   /api/identity/roles
  Input: {
    roleName: string;
    permissions: string[];
  }
  Output: {
    roleId: number;
    role: Role;
  }

GET    /api/identity/roles
  Output: {
    roles: Role[];
  }

POST   /api/identity/users/:userId/assign-role
  Input: {
    roleId: number;
  }
  Output: {
    success: boolean;
  }

// Permissions
GET    /api/identity/users/:userId/permissions
  Output: {
    permissions: string[];
  }

POST   /api/identity/check-permission
  Input: {
    userId: number;
    permission: string;
  }
  Output: {
    allowed: boolean;
  }

// Organizations
POST   /api/identity/organizations
  Input: {
    name: string;
    type: string;
  }
  Output: {
    organizationId: number;
    organization: Organization;
  }

GET    /api/identity/organizations/:organizationId
  Output: {
    organization: Organization;
    members: User[];
  }

// Invitations
POST   /api/identity/invitations
  Input: {
    email: string;
    role: string;
    organizationId?: number;
  }
  Output: {
    invitationId: number;
    invitation: UserInvitation;
  }

POST   /api/identity/invitations/:token/accept
  Input: {
    password: string;
  }
  Output: {
    user: User;
    token: string;
  }

// Email Verification
POST   /api/identity/email/send-verification
  Input: {
    userId: number;
  }
  Output: {
    sent: boolean;
  }

POST   /api/identity/email/verify
  Input: {
    token: string;
  }
  Output: {
    verified: boolean;
  }

// MFA
POST   /api/identity/mfa/enable
  Input: {
    userId: number;
  }
  Output: {
    qrCode: string;
    secret: string;
  }

POST   /api/identity/mfa/verify
  Input: {
    userId: number;
    code: string;
  }
  Output: {
    valid: boolean;
  }

// API Keys
POST   /api/identity/api-keys
  Input: {
    userId: number;
    name: string;
    scopes: string[];
  }
  Output: {
    apiKey: string;
    keyId: number;
  }

GET    /api/identity/api-keys/:userId
  Output: {
    apiKeys: Array<{
      keyId: number;
      name: string;
      scopes: string[];
      createdAt: Date;
    }>;
  }

DELETE /api/identity/api-keys/:keyId
  Output: {
    success: boolean;
  }

// Audit Logs
GET    /api/identity/audit-logs
  Query: {
    userId?: number;
    action?: string;
    startDate?: Date;
    endDate?: Date;
  }
  Output: {
    logs: Array<{
      timestamp: Date;
      userId: number;
      action: string;
      resource: string;
      ipAddress: string;
    }>;
  }
```

#### 2.9.3 Events Published

```typescript
// Domain Events
UserCreated {
  eventId: string;
  timestamp: Date;
  userId: number;
  email: string;
  role: string;
}

UserLoggedIn {
  eventId: string;
  timestamp: Date;
  userId: number;
  ipAddress: string;
  userAgent: string;
}

UserLoggedOut {
  eventId: string;
  timestamp: Date;
  userId: number;
}

RoleAssigned {
  eventId: string;
  timestamp: Date;
  userId: number;
  roleId: number;
  roleName: string;
}

PermissionDenied {
  eventId: string;
  timestamp: Date;
  userId: number;
  permission: string;
  resource: string;
}

MFAEnabled {
  eventId: string;
  timestamp: Date;
  userId: number;
}

APIKeyCreated {
  eventId: string;
  timestamp: Date;
  userId: number;
  keyId: number;
  scopes: string[];
}
```

#### 2.9.4 Events Consumed

```typescript
// From all services (for audit logging)
* {
  userId: number;
  action: string;
  resource: string;
}
```

#### 2.9.5 Database Ownership

**Tables Owned:**
- `users` - User profiles and credentials
- `organizations` - Organization/tenant data
- `user_invitations` - Pending user invitations
- `email_verification_tokens` - Email verification tokens

**New Tables:**
- `roles` - Role definitions
- `permissions` - Permission definitions
- `role_permissions` - Role-permission mapping
- `user_roles` - User-role mapping
- `api_keys` - API key management
- `security_audit_logs` - Security event audit trail
- `mfa_secrets` - MFA secret storage

**Schema Definition:**
```sql
-- users table (existing, no changes)
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  open_id VARCHAR(64) UNIQUE,
  name TEXT,
  email VARCHAR(320),
  password_hash VARCHAR(255),
  login_method VARCHAR(64),
  role ENUM('user', 'admin', 'insurer', 'assessor', 'panel_beater', 'claimant'),
  insurer_role ENUM('claims_processor', 'internal_assessor', 'risk_manager', 'claims_manager', 'executive'),
  organization_id INT,
  email_verified TINYINT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  last_signed_in TIMESTAMP,
  INDEX idx_email (email),
  INDEX idx_organization (organization_id)
);

-- organizations table (existing, no changes)
CREATE TABLE organizations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  organization_type ENUM('insurer', 'assessor_firm', 'panel_beater_network'),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- user_invitations table (existing, no changes)
CREATE TABLE user_invitations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(320) NOT NULL,
  token VARCHAR(255) NOT NULL UNIQUE,
  role VARCHAR(50) NOT NULL,
  organization_id INT,
  invited_by INT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  accepted TINYINT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_token (token),
  INDEX idx_email (email)
);

-- email_verification_tokens table (existing, no changes)
CREATE TABLE email_verification_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_token (token),
  INDEX idx_user (user_id)
);

-- roles table (NEW)
CREATE TABLE roles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  role_name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_role_name (role_name)
);

-- permissions table (NEW)
CREATE TABLE permissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  permission_name VARCHAR(100) NOT NULL UNIQUE,
  resource VARCHAR(100),
  action VARCHAR(50),
  description TEXT,
  INDEX idx_permission_name (permission_name)
);

-- role_permissions table (NEW)
CREATE TABLE role_permissions (
  role_id INT NOT NULL,
  permission_id INT NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);

-- user_roles table (NEW)
CREATE TABLE user_roles (
  user_id INT NOT NULL,
  role_id INT NOT NULL,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, role_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
);

-- api_keys table (NEW)
CREATE TABLE api_keys (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  key_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  scopes TEXT,  -- JSON array
  last_used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user (user_id)
);

-- security_audit_logs table (NEW)
CREATE TABLE security_audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT,
  action VARCHAR(100) NOT NULL,
  resource VARCHAR(255),
  ip_address VARCHAR(45),
  user_agent TEXT,
  success TINYINT DEFAULT 1,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (user_id),
  INDEX idx_action (action),
  INDEX idx_created_at (created_at)
);

-- mfa_secrets table (NEW)
CREATE TABLE mfa_secrets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  secret_encrypted VARCHAR(255) NOT NULL,
  enabled TINYINT DEFAULT 0,
  backup_codes TEXT,  -- JSON array, encrypted
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user (user_id)
);
```

#### 2.9.6 Refactoring Strategy

**Phase 1: Extract Auth Logic (Week 1-2)**

1. **Create service skeleton:**
   ```bash
   mkdir -p services/identity-access-service
   cd services/identity-access-service
   npm install express @trpc/server drizzle-orm mysql2 jsonwebtoken bcrypt speakeasy qrcode
   ```

2. **Extract OAuth integration from `server/_core/oauth.ts`:**
   - Copy entire file (~300 LOC)
   - Move to `services/identity-access-service/src/auth/oauth-client.ts`
   - Preserve all OAuth flow logic

3. **Extract session management from `server/_core/session.ts`:**
   - Copy entire file
   - Move to `services/identity-access-service/src/auth/session-manager.ts`

4. **Extract user queries from `server/db.ts`:**
   - Copy user-related queries
   - Move to `services/identity-access-service/src/repositories/user-repository.ts`

**Phase 2: Implement RBAC (Week 2)**

1. **Create RBAC engine:**
   ```typescript
   // services/identity-access-service/src/rbac/rbac-engine.ts
   export class RBACEngine {
     async checkPermission(userId: number, permission: string): Promise<boolean> {
       // Get user roles
       const roles = await getUserRoles(userId);

       // Get permissions for roles
       const permissions = await getPermissionsForRoles(roles.map(r => r.id));

       // Check if permission exists
       return permissions.some(p => p.permissionName === permission);
     }

     async assignRole(userId: number, roleId: number) {
       await assignRoleToUser(userId, roleId);
       
       // Publish event
       await eventPublisher.publishRoleAssigned({
         userId,
         roleId,
         roleName: await getRoleName(roleId),
       });
     }
   }
   ```

2. **Seed default roles and permissions:**
   ```typescript
   // services/identity-access-service/src/seeds/roles-permissions.ts
   const defaultRoles = [
     {
       name: 'admin',
       permissions: ['*'],  // All permissions
     },
     {
       name: 'claims_manager',
       permissions: [
         'claims.view',
         'claims.approve',
         'claims.reject',
         'assessments.view',
         'quotes.view',
       ],
     },
     {
       name: 'assessor',
       permissions: [
         'claims.view',
         'assessments.create',
         'assessments.update',
       ],
     },
     {
       name: 'claimant',
       permissions: [
         'claims.create',
         'claims.view_own',
         'documents.upload',
       ],
     },
   ];

   async function seedRolesAndPermissions() {
     for (const role of defaultRoles) {
       const roleId = await createRole(role.name);
       
       for (const permission of role.permissions) {
         const permissionId = await createPermission(permission);
         await linkRolePermission(roleId, permissionId);
       }
     }
   }
   ```

**Phase 3: Add MFA Support (Week 3)**

1. **Implement MFA:**
   ```typescript
   // services/identity-access-service/src/auth/mfa-manager.ts
   import speakeasy from 'speakeasy';
   import QRCode from 'qrcode';

   export class MFAManager {
     async enableMFA(userId: number) {
       // Generate secret
       const secret = speakeasy.generateSecret({
         name: `KINGA (${await getUserEmail(userId)})`,
       });

       // Save encrypted secret
       await saveMFASecret(userId, secret.base32);

       // Generate QR code
       const qrCode = await QRCode.toDataURL(secret.otpauth_url);

       return {
         qrCode,
         secret: secret.base32,
       };
     }

     async verifyMFA(userId: number, code: string): Promise<boolean> {
       const secret = await getMFASecret(userId);
       
       return speakeasy.totp.verify({
         secret,
         encoding: 'base32',
         token: code,
       });
     }
   }
   ```

**Phase 4: Database Migration (Week 3)**

1. **Create dedicated database:**
   ```sql
   CREATE DATABASE kinga_identity_access;
   ```

2. **Migrate tables:**
   ```bash
   mysqldump kinga_db users organizations user_invitations email_verification_tokens > identity_schema.sql
   mysql kinga_identity_access < identity_schema.sql
   ```

3. **Create new tables (roles, permissions, role_permissions, user_roles, api_keys, security_audit_logs, mfa_secrets)**

**Phase 5: Event Integration (Week 4)**

1. **Publish auth events**
2. **Consume events for audit logging**

**Phase 6: API Gateway Integration & Cutover (Week 4)**

**Code Preservation Checklist:**
- ✅ OAuth flow preserved
- ✅ Session management unchanged
- ✅ User management logic preserved

---

### 2.10 Notification Service

**Bounded Context:** Multi-channel notifications including email, SMS, push, and in-app.

#### 2.10.1 Responsibility Boundaries

The Notification Service owns all outbound communications to users including email, SMS, push notifications, and in-app notifications. This service manages notification templates, delivery tracking, and user notification preferences. It serves as the centralized communication hub for all user-facing notifications.

**Core Responsibilities:**
- Send email notifications
- Send SMS notifications
- Send push notifications (web and mobile)
- Manage in-app notification feed
- Manage notification templates
- Track notification delivery status
- Handle notification preferences and opt-outs
- Provide notification analytics
- Queue and batch notifications
- Handle notification retries

**Out of Scope:**
- Business logic (delegated to domain services)
- Event generation (services publish events)

#### 2.10.2 APIs Owned

**REST Endpoints (tRPC Procedures):**

```typescript
// Send Notification
POST   /api/notifications/send
  Input: {
    userId: number;
    channel: 'email' | 'sms' | 'push' | 'in_app';
    templateId: string;
    data: object;
    priority: 'low' | 'normal' | 'high';
  }
  Output: {
    notificationId: number;
    status: 'queued' | 'sent';
  }

// Batch Notifications
POST   /api/notifications/send-batch
  Input: {
    userIds: number[];
    channel: string;
    templateId: string;
    data: object;
  }
  Output: {
    batchId: string;
    queued: number;
  }

// In-App Notifications
GET    /api/notifications/in-app/:userId
  Query: {
    unreadOnly?: boolean;
    page?: number;
    limit?: number;
  }
  Output: {
    notifications: Array<{
      id: number;
      title: string;
      message: string;
      type: string;
      read: boolean;
      createdAt: Date;
    }>;
    unreadCount: number;
  }

PATCH  /api/notifications/in-app/:notificationId/read
  Output: {
    success: boolean;
  }

DELETE /api/notifications/in-app/:notificationId
  Output: {
    success: boolean;
  }

// Templates
POST   /api/notifications/templates
  Input: {
    templateId: string;
    channel: string;
    subject?: string;
    body: string;
    variables: string[];
  }
  Output: {
    template: NotificationTemplate;
  }

GET    /api/notifications/templates/:templateId
  Output: {
    template: NotificationTemplate;
  }

// Preferences
GET    /api/notifications/preferences/:userId
  Output: {
    preferences: {
      email: boolean;
      sms: boolean;
      push: boolean;
      in_app: boolean;
      notificationTypes: object;
    };
  }

PATCH  /api/notifications/preferences/:userId
  Input: {
    email?: boolean;
    sms?: boolean;
    push?: boolean;
    notificationTypes?: object;
  }
  Output: {
    preferences: object;
  }

// Delivery Status
GET    /api/notifications/:notificationId/status
  Output: {
    notificationId: number;
    status: 'queued' | 'sent' | 'delivered' | 'failed';
    sentAt?: Date;
    deliveredAt?: Date;
    error?: string;
  }

// Analytics
GET    /api/notifications/analytics
  Query: {
    startDate: Date;
    endDate: Date;
    channel?: string;
  }
  Output: {
    totalSent: number;
    totalDelivered: number;
    totalFailed: number;
    deliveryRate: number;
    byChannel: object;
  }
```

#### 2.10.3 Events Published

```typescript
// Domain Events
NotificationSent {
  eventId: string;
  timestamp: Date;
  notificationId: number;
  userId: number;
  channel: string;
  templateId: string;
}

NotificationDelivered {
  eventId: string;
  timestamp: Date;
  notificationId: number;
  userId: number;
  channel: string;
}

NotificationFailed {
  eventId: string;
  timestamp: Date;
  notificationId: number;
  userId: number;
  channel: string;
  error: string;
}
```

#### 2.10.4 Events Consumed

```typescript
// From all services
ClaimSubmitted {
  claimId: number;
  claimantId: number;
}

AssessmentCompleted {
  claimId: number;
  claimantId: number;
}

FraudAlertRaised {
  claimId: number;
  assignedTo: number;
}

ApprovalRequested {
  approvalId: number;
  requiredApprovers: number[];
}

// ... all domain events that trigger notifications
```

#### 2.10.5 Database Ownership

**Tables Owned:**
- `notifications` - Notification delivery tracking (existing)

**New Tables:**
- `notification_templates` - Template definitions
- `notification_preferences` - User preferences
- `notification_queue` - Pending notifications

**Schema Definition:**
```sql
-- notifications table (existing, minor additions)
CREATE TABLE notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  type VARCHAR(100) NOT NULL,
  title VARCHAR(255),
  message TEXT NOT NULL,
  channel VARCHAR(20),  -- NEW: 'email', 'sms', 'push', 'in_app'
  status VARCHAR(20) DEFAULT 'sent',  -- NEW: 'queued', 'sent', 'delivered', 'failed'
  read TINYINT DEFAULT 0,
  link TEXT,
  sent_at TIMESTAMP,  -- NEW
  delivered_at TIMESTAMP,  -- NEW
  error_message TEXT,  -- NEW
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (user_id),
  INDEX idx_read (read),
  INDEX idx_channel (channel),
  INDEX idx_status (status)
);

-- notification_templates table (NEW)
CREATE TABLE notification_templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  template_id VARCHAR(100) NOT NULL UNIQUE,
  channel VARCHAR(20) NOT NULL,
  subject VARCHAR(255),
  body TEXT NOT NULL,
  variables TEXT,  -- JSON array
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_template_id (template_id),
  INDEX idx_channel (channel)
);

-- notification_preferences table (NEW)
CREATE TABLE notification_preferences (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  email_enabled TINYINT DEFAULT 1,
  sms_enabled TINYINT DEFAULT 1,
  push_enabled TINYINT DEFAULT 1,
  in_app_enabled TINYINT DEFAULT 1,
  notification_types TEXT,  -- JSON object
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user (user_id)
);

-- notification_queue table (NEW)
CREATE TABLE notification_queue (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  channel VARCHAR(20) NOT NULL,
  template_id VARCHAR(100) NOT NULL,
  data TEXT,  -- JSON object
  priority ENUM('low', 'normal', 'high') DEFAULT 'normal',
  status ENUM('queued', 'processing', 'sent', 'failed') DEFAULT 'queued',
  retry_count INT DEFAULT 0,
  scheduled_at TIMESTAMP,
  processed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_status (status),
  INDEX idx_scheduled (scheduled_at),
  INDEX idx_priority (priority)
);
```

#### 2.10.6 Refactoring Strategy

**Phase 1: Extract Notification Logic (Week 1)**

1. **Create service skeleton:**
   ```bash
   mkdir -p services/notification-service
   cd services/notification-service
   npm install express @trpc/server drizzle-orm mysql2 nodemailer twilio bull
   ```

2. **Extract notification logic from `server/_core/notification.ts`:**
   - Copy `notifyOwner` function
   - Move to `services/notification-service/src/senders/notification-sender.ts`
   - Generalize to support all notification types

3. **Extract database queries:**
   - Copy notification queries from `server/db.ts`
   - Move to `services/notification-service/src/repositories/notification-repository.ts`

**Phase 2: Implement Multi-Channel Support (Week 1-2)**

1. **Create channel-specific senders:**
   ```typescript
   // services/notification-service/src/senders/email-sender.ts
   import nodemailer from 'nodemailer';

   export class EmailSender {
     private transporter: nodemailer.Transporter;

     constructor() {
       this.transporter = nodemailer.createTransport({
         host: process.env.SMTP_HOST,
         port: parseInt(process.env.SMTP_PORT),
         auth: {
           user: process.env.SMTP_USER,
           pass: process.env.SMTP_PASS,
         },
       });
     }

     async send(to: string, subject: string, body: string) {
       const result = await this.transporter.sendMail({
         from: process.env.FROM_EMAIL,
         to,
         subject,
         html: body,
       });

       return result;
     }
   }

   // services/notification-service/src/senders/sms-sender.ts
   import twilio from 'twilio';

   export class SMSSender {
     private client: twilio.Twilio;

     constructor() {
       this.client = twilio(
         process.env.TWILIO_ACCOUNT_SID,
         process.env.TWILIO_AUTH_TOKEN
       );
     }

     async send(to: string, message: string) {
       const result = await this.client.messages.create({
         from: process.env.TWILIO_PHONE_NUMBER,
         to,
         body: message,
       });

       return result;
     }
   }
   ```

2. **Create template engine:**
   ```typescript
   // services/notification-service/src/templates/template-engine.ts
   import Handlebars from 'handlebars';

   export class TemplateEngine {
     async render(templateId: string, data: object): Promise<string> {
       // Get template from database
       const template = await getTemplate(templateId);

       // Compile template
       const compiled = Handlebars.compile(template.body);

       // Render with data
       return compiled(data);
     }
   }
   ```

**Phase 3: Implement Queue System (Week 2)**

1. **Create notification queue:**
   ```typescript
   // services/notification-service/src/queues/notification-queue.ts
   import Bull from 'bull';

   export const notificationQueue = new Bull('notifications', {
     redis: {
       host: process.env.REDIS_HOST,
       port: parseInt(process.env.REDIS_PORT),
     },
   });

   notificationQueue.process(async (job) => {
     const { userId, channel, templateId, data } = job.data;

     // Get user contact info
     const user = await getUser(userId);

     // Check preferences
     const preferences = await getNotificationPreferences(userId);
     if (!preferences[`${channel}_enabled`]) {
       return { skipped: true, reason: 'User opted out' };
     }

     // Render template
     const content = await templateEngine.render(templateId, data);

     // Send notification
     let result;
     switch (channel) {
       case 'email':
         result = await emailSender.send(user.email, content.subject, content.body);
         break;
       case 'sms':
         result = await smsSender.send(user.phone, content.body);
         break;
       case 'push':
         result = await pushSender.send(user.id, content.body);
         break;
       case 'in_app':
         result = await saveInAppNotification(user.id, content);
         break;
     }

     // Update status
     await updateNotificationStatus(job.data.notificationId, 'sent');

     // Publish event
     await eventPublisher.publishNotificationSent({
       notificationId: job.data.notificationId,
       userId,
       channel,
       templateId,
     });

     return result;
   });

   notificationQueue.on('failed', async (job, error) => {
     await updateNotificationStatus(job.data.notificationId, 'failed', error.message);
     await eventPublisher.publishNotificationFailed({
       notificationId: job.data.notificationId,
       userId: job.data.userId,
       channel: job.data.channel,
       error: error.message,
     });
   });
   ```

**Phase 4: Database Migration (Week 2)**

1. **Create dedicated database:**
   ```sql
   CREATE DATABASE kinga_notification;
   ```

2. **Migrate tables:**
   ```bash
   mysqldump kinga_db notifications > notification_schema.sql
   mysql kinga_notification < notification_schema.sql
   ```

3. **Create new tables (notification_templates, notification_preferences, notification_queue)**

**Phase 5: Event Integration (Week 3)**

1. **Create event consumer:**
   ```typescript
   // services/notification-service/src/events/event-consumer.ts
   export class EventConsumer {
     async subscribe() {
       await this.consumer.subscribe({
         topics: [
           'claim.submitted',
           'ai-damage.assessment-completed',
           'fraud.alert-raised',
           'workflow.approval-requested',
           // ... all notification-triggering events
         ],
       });

       await this.consumer.run({
         eachMessage: async ({ topic, message }) => {
           const event = JSON.parse(message.value.toString());
           await this.handleEvent(topic, event);
         },
       });
     }

     private async handleEvent(topic: string, event: any) {
       // Map event to notification
       const notification = this.mapEventToNotification(topic, event);

       // Queue notification
       await notificationQueue.add(notification);
     }

     private mapEventToNotification(topic: string, event: any) {
       switch (topic) {
         case 'claim.submitted':
           return {
             userId: event.claimantId,
             channel: 'email',
             templateId: 'claim_submitted',
             data: {
               claimNumber: event.claimNumber,
               incidentDate: event.incidentDate,
             },
           };
         case 'workflow.approval-requested':
           return event.requiredApprovers.map(approverId => ({
             userId: approverId,
             channel: 'email',
             templateId: 'approval_requested',
             data: {
               claimNumber: event.claimNumber,
               approvalType: event.approvalType,
             },
           }));
         // ... other mappings
       }
     }
   }
   ```

**Phase 6: API Gateway Integration & Cutover (Week 3)**

**Code Preservation Checklist:**
- ✅ Existing notification logic preserved
- ✅ Email sending unchanged

---

## 3. Cross-Cutting Concerns

### 3.1 Event-Driven Architecture

**Event Bus:** Apache Kafka

**Topic Naming Convention:**
```
{service}.{entity}.{event}
```

Examples:
- `claim-intake.claim.submitted`
- `ai-damage.assessment.completed`
- `fraud-detection.alert.raised`

**Event Schema:**
```typescript
interface DomainEvent {
  eventId: string;  // UUID
  eventType: string;  // e.g., 'ClaimSubmitted'
  timestamp: Date;
  version: string;  // Schema version
  payload: object;
  metadata: {
    correlationId?: string;
    causationId?: string;
    userId?: number;
  };
}
```

**Event Sourcing:**
- All state changes captured as events
- Event store for audit trail and replay
- CQRS pattern for read/write separation

### 3.2 API Gateway

**Technology:** Kong or AWS API Gateway

**Responsibilities:**
- Route requests to appropriate services
- Authentication and authorization
- Rate limiting and throttling
- Request/response transformation
- API versioning
- Monitoring and logging

**Routing Configuration:**
```yaml
services:
  - name: claim-intake-service
    url: http://claim-intake-service:3000
    routes:
      - paths: ["/api/claims"]
  
  - name: ai-damage-service
    url: http://ai-damage-service:3000
    routes:
      - paths: ["/api/ai-damage"]
  
  # ... other services
```

### 3.3 Service Discovery

**Technology:** Consul or Kubernetes DNS

**Registration:**
- Services self-register on startup
- Health checks every 30 seconds
- Automatic deregistration on failure

### 3.4 Distributed Tracing

**Technology:** Jaeger or AWS X-Ray

**Implementation:**
- Trace ID propagated in HTTP headers
- Span created for each service call
- Performance bottleneck detection

### 3.5 Centralized Logging

**Technology:** ELK Stack (Elasticsearch, Logstash, Kibana)

**Log Format:**
```json
{
  "timestamp": "2026-02-11T10:30:00Z",
  "service": "claim-intake-service",
  "level": "info",
  "traceId": "abc123",
  "userId": 42,
  "message": "Claim submitted successfully",
  "claimId": 1234
}
```

### 3.6 Monitoring and Alerting

**Technology:** Prometheus + Grafana

**Metrics:**
- Request rate, latency, error rate (RED metrics)
- CPU, memory, disk usage
- Queue depth and processing time
- Database connection pool usage

**Alerts:**
- Error rate > 5%
- Latency p99 > 2s
- Queue depth > 1000
- Service down

### 3.7 Security

**Authentication:**
- JWT tokens issued by identity-access-service
- Token validation at API Gateway
- Short-lived access tokens (15 min) + refresh tokens

**Authorization:**
- RBAC enforced by identity-access-service
- Service-to-service auth using mTLS

**Data Encryption:**
- TLS 1.3 for data in transit
- AES-256 for data at rest
- Secrets managed by Vault or AWS Secrets Manager

### 3.8 Data Consistency

**Pattern:** Saga Pattern (orchestration-based)

**Compensation:**
- Each saga step has compensation action
- Automatic rollback on failure
- Idempotent operations

**Example: Claim Approval Saga**
```typescript
const claimApprovalSaga = {
  steps: [
    {
      service: 'ai-damage-service',
      action: 'assessClaim',
      compensation: 'deleteAssessment',
    },
    {
      service: 'fraud-detection-service',
      action: 'scoreFraud',
      compensation: 'deleteFraudScore',
    },
    {
      service: 'cost-optimisation-service',
      action: 'compareQuotes',
      compensation: 'deleteComparison',
    },
    {
      service: 'workflow-engine-service',
      action: 'requestApproval',
      compensation: 'cancelApproval',
    },
  ],
};
```

---

## 4. Migration Strategy

### 4.1 Phased Rollout

**Phase 1: Foundation (Weeks 1-4)**
- Set up infrastructure (Kubernetes, Kafka, databases)
- Deploy identity-access-service
- Deploy notification-service
- Migrate authentication to new services

**Phase 2: Core Services (Weeks 5-12)**
- Deploy claim-intake-service
- Deploy ai-damage-service
- Deploy fraud-detection-service
- Deploy physics-simulation-service (as library)
- Parallel run with monolith (10% traffic)

**Phase 3: Orchestration (Weeks 13-16)**
- Deploy workflow-engine-service
- Deploy cost-optimisation-service
- Implement saga pattern
- Increase traffic to 50%

**Phase 4: Analytics & Integration (Weeks 17-20)**
- Deploy fleet-risk-service
- Deploy insurer-integration-service
- Integrate external systems
- Increase traffic to 100%

**Phase 5: Decommission Monolith (Weeks 21-24)**
- Monitor for issues
- Decommission monolith services
- Archive monolith codebase

### 4.2 Data Migration

**Strategy:** Dual-write pattern

1. **Phase 1:** Write to both monolith and microservice databases
2. **Phase 2:** Read from microservice, fallback to monolith
3. **Phase 3:** Read only from microservice
4. **Phase 4:** Stop writing to monolith

**Tools:**
- Debezium for change data capture (CDC)
- Custom migration scripts for historical data

### 4.3 Testing Strategy

**Unit Tests:**
- 80% code coverage minimum
- Test business logic in isolation

**Integration Tests:**
- Test service-to-service communication
- Test event publishing and consumption
- Test database interactions

**End-to-End Tests:**
- Test complete user journeys
- Test saga compensation
- Test failure scenarios

**Performance Tests:**
- Load testing with 10x expected traffic
- Stress testing to find breaking points
- Chaos engineering (kill services randomly)

### 4.4 Rollback Plan

**Triggers:**
- Error rate > 10%
- Latency p99 > 5s
- Data inconsistency detected

**Actions:**
1. Route 100% traffic back to monolith
2. Investigate root cause
3. Fix issue in microservice
4. Gradually reroute traffic

---

## 5. Technology Stack

### 5.1 Core Technologies

| Component | Technology | Justification |
|-----------|------------|---------------|
| **Runtime** | Node.js 18+ | Existing codebase, team expertise |
| **Framework** | Express + tRPC | Existing stack, type-safe APIs |
| **Language** | TypeScript | Type safety, existing codebase |
| **ORM** | Drizzle | Existing stack, type-safe queries |
| **Database** | MySQL (TiDB) | Existing database, horizontal scalability |
| **Message Broker** | Apache Kafka | High throughput, event sourcing support |
| **Cache** | Redis | Session storage, queue backend |
| **API Gateway** | Kong | Open source, plugin ecosystem |
| **Service Discovery** | Kubernetes DNS | Built-in, no additional infrastructure |
| **Container Orchestration** | Kubernetes | Industry standard, cloud-agnostic |
| **CI/CD** | GitHub Actions | Existing integration |
| **Monitoring** | Prometheus + Grafana | Open source, rich ecosystem |
| **Logging** | ELK Stack | Centralized logging, powerful search |
| **Tracing** | Jaeger | OpenTelemetry compatible |

### 5.2 Specialized Technologies

| Service | Additional Technologies |
|---------|------------------------|
| **ai-damage-service** | Python 3.11, PyMuPDF, pdf2image, Bull (job queue) |
| **fraud-detection-service** | Python 3.11, scikit-learn, Neo4j (graph database) |
| **fleet-risk-service** | TimescaleDB (time-series data) |
| **notification-service** | Nodemailer, Twilio, Bull (job queue) |

---

## 6. Success Metrics

### 6.1 Technical Metrics

| Metric | Target |
|--------|--------|
| **Deployment Frequency** | Multiple times per day |
| **Lead Time for Changes** | < 1 hour |
| **Mean Time to Recovery** | < 15 minutes |
| **Change Failure Rate** | < 5% |
| **Service Availability** | 99.9% uptime |
| **API Latency (p99)** | < 500ms |
| **Error Rate** | < 0.1% |

### 6.2 Business Metrics

| Metric | Target |
|--------|--------|
| **Development Velocity** | 2x increase in feature delivery |
| **Team Autonomy** | Independent service deployments |
| **Scalability** | Handle 10x traffic without code changes |
| **Cost Efficiency** | 30% reduction in infrastructure costs |

---

## 7. Risks and Mitigation

### 7.1 Technical Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **Data Inconsistency** | High | Medium | Implement saga pattern, event sourcing, automated reconciliation |
| **Increased Latency** | Medium | Medium | Optimize inter-service calls, implement caching, use async where possible |
| **Operational Complexity** | High | High | Invest in monitoring, automate deployments, comprehensive documentation |
| **Service Coupling** | Medium | Medium | Enforce API contracts, avoid shared databases, use events for communication |

### 7.2 Organizational Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **Team Resistance** | Medium | Low | Involve team in design, provide training, demonstrate benefits |
| **Knowledge Silos** | Medium | Medium | Cross-training, documentation, pair programming |
| **Increased Coordination** | Low | High | Establish clear service boundaries, API contracts, async communication |

---

## 8. Conclusion

This service decomposition plan provides a comprehensive roadmap for refactoring the KINGA monolithic application into a scalable, maintainable microservices architecture. The plan prioritizes **preservation of existing business logic** while establishing clear service boundaries, event-driven communication, and independent data ownership.

**Key Principles:**
- **Domain-Driven Design:** Services organized around business capabilities
- **Event-Driven Architecture:** Loose coupling through asynchronous events
- **Data Sovereignty:** Each service owns its data
- **Incremental Migration:** Phased rollout with parallel run
- **Code Preservation:** Existing logic refactored, not rewritten

**Next Steps:**
1. Review and approve this decomposition plan
2. Set up infrastructure (Kubernetes, Kafka, monitoring)
3. Begin Phase 1 implementation (identity-access-service, notification-service)
4. Establish CI/CD pipelines for microservices
5. Train team on microservices patterns and tools

**Estimated Timeline:** 24 weeks (6 months)

**Estimated Effort:** 8-10 engineers

**Expected Outcomes:**
- 2x increase in development velocity
- 99.9% service availability
- Independent service deployments
- 10x scalability without code changes
- 30% reduction in infrastructure costs

---

## Document Control

| Version | Date | Author | Description |
|---------|------|--------|-------------|
| 1.0 | 2026-02-11 | Tavonga Shoko | Initial service decomposition plan |

---

**End of Document**
