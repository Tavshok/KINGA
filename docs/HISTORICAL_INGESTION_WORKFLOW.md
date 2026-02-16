# Historical Claims Ingestion Workflow

## Overview

The Historical Claims Ingestion System provides a safe, bias-aware pipeline for importing legacy claims data into the KINGA training dataset. This system ensures data quality, detects potential biases, and maintains strict governance controls.

## Workflow Phases

### Phase 1: Batch Upload

**Input**: ZIP file containing historical claim documents (PDFs, images, scanned forms)

**Process**:
1. User uploads ZIP file via batch upload API
2. System extracts files to S3 storage
3. Creates ingestionBatch record with status "pending"
4. Generates SHA256 hash for integrity verification
5. Stores file metadata in ingestionDocuments table

**Output**: Batch ID and upload confirmation

**Governance**: All uploads logged to audit trail with user ID, timestamp, and file hash

---

### Phase 2: OCR and LLM Extraction

**Input**: Uploaded document files from S3

**Process**:
1. For each document in batch:
   - Download file from S3
   - Extract text using OCR (for scanned documents)
   - Parse structured data using Manus LLM with vision capabilities
   - Extract fields: claim number, date, claimant info, vehicle details, damage description, costs
2. Store extracted data in extractedDocumentData table
3. Create historicalClaims record linking all extracted data
4. Update batch progress tracking

**Output**: Structured claim data with extraction confidence metadata

**Data Extracted**:
- Claim number, date, claimant name
- Vehicle make, model, registration
- Damage description
- Estimated vs actual repair costs
- Panel beater quotes
- Assessor recommendations
- Final approval amounts
- Fraud indicators (if present)

---

### Phase 3: Confidence Scoring

**Input**: Extracted claim data from Phase 2

**Process**:
1. Calculate data completeness score (0-100)
   - Check for missing critical fields
   - Validate data format and consistency
2. Assess extraction confidence
   - LLM confidence scores
   - OCR quality metrics
   - Data validation results
3. Calculate overall confidence score
4. Classify claims:
   - **HIGH** (≥80): Complete data, high extraction confidence
   - **MEDIUM** (50-79): Minor gaps or moderate confidence
   - **LOW** (<50): Significant missing data or low confidence

**Output**: Confidence score and classification for each claim

**Routing**:
- HIGH → Proceed to bias detection
- MEDIUM → Route to human review queue
- LOW → Mark as reference-only (not for training)

---

### Phase 4: Bias Detection

**Input**: Claims with confidence scores

**Process**:
1. **Extreme Repair Value Detection**
   - Calculate mean and standard deviation of repair costs
   - Flag claims beyond 3 standard deviations
   - Threshold: >10% extreme values triggers bias flag

2. **Panel Beater Dominance Detection**
   - Count claims per panel beater
   - Flag if one panel beater has >40% of claims
   - Risk: Pricing bias toward specific vendor

3. **Demographic Skew Detection** (if data available)
   - Analyze age distribution (flag if >60% in one age group)
   - Analyze gender distribution (flag if >70% one gender)
   - Risk: Model may learn demographic biases

4. **Temporal Clustering Detection**
   - Group claims by month
   - Flag months with >2x average claim volume
   - Risk: Seasonal bias or data collection artifacts

5. Store bias flags in biasDetectionFlags table with:
   - Bias type
   - Severity (low/medium/high)
   - Affected claims count
   - Mitigation recommendations

**Output**: Bias detection report for batch

**Severity Levels**:
- **HIGH**: 3+ bias types detected
- **MEDIUM**: 2 bias types detected
- **LOW**: 1 bias type detected

---

### Phase 5: Human Review Queue

**Input**: MEDIUM confidence claims requiring manual review

**Process**:
1. Add claim to claimReviewQueue with:
   - Routed reason (flagged issues)
   - Review priority (based on confidence score)
   - Review status: "pending_review"

2. Claims Manager reviews claim:
   - Views extracted data
   - Compares with original documents
   - Checks flagged issues
   - Makes decision: approve/reject/request_more_info

3. On approval:
   - Move claim to trainingDataset
   - Log approval in audit trail
   - Update review queue status

4. On rejection:
   - Mark claim as reference-only
   - Log rejection reason
   - Update review queue status

**Output**: Approved claims added to training dataset

**Metrics Tracked**:
- Pending review count
- Average review time
- Approval rate
- Rejection reasons

---

### Phase 6: Training Dataset Inclusion

**Input**: HIGH confidence claims (auto-approved) + MEDIUM confidence claims (human-approved)

**Process**:
1. Insert approved claims into trainingDataset table
2. Set dataset version (e.g., "v1.0")
3. Record inclusion metadata:
   - Included by (user ID or "system")
   - Inclusion reason
   - Timestamp
4. Set training weight (default: 1.00)
5. Mark as active for training

**Output**: Claims ready for ML model training

**Exclusions**:
- LOW confidence claims (reference-only)
- Claims with HIGH severity bias flags (unless manually reviewed)
- Rejected claims from human review

---

### Phase 7: Executive Dashboard

**Metrics Displayed**:

**Batch Statistics**:
- Total batches uploaded
- Active/completed/failed batches
- Average extraction time

**Claims Statistics**:
- Total claims ingested
- Claims in training dataset
- Claims pending review
- Claims rejected

**Confidence Distribution**:
- HIGH confidence count
- MEDIUM confidence count
- LOW confidence count

**Bias Detection Summary**:
- Total bias flags
- Flags by severity (high/medium/low)
- Flags by type (extreme values, panel beater dominance, etc.)
- Bias trends over time

**Data Quality Metrics**:
- Data quality score (% HIGH confidence)
- Completeness rate (% with complete data)
- Average review time

---

## Data Flow Diagram

```
┌─────────────────┐
│  ZIP Upload     │
│  (Phase 1)      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  OCR/LLM        │
│  Extraction     │
│  (Phase 2)      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Confidence     │
│  Scoring        │
│  (Phase 3)      │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌───────┐ ┌───────┐
│ HIGH  │ │MEDIUM │
│ (≥80) │ │(50-79)│
└───┬───┘ └───┬───┘
    │         │
    │         ▼
    │    ┌─────────────┐
    │    │   Human     │
    │    │   Review    │
    │    │  (Phase 5)  │
    │    └──────┬──────┘
    │           │
    │      ┌────┴────┐
    │      │         │
    │      ▼         ▼
    │  ┌────────┐ ┌────────┐
    │  │Approve │ │ Reject │
    │  └───┬────┘ └────────┘
    │      │
    ▼      ▼
┌─────────────────┐
│  Bias Detection │
│  (Phase 4)      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Training       │
│  Dataset        │
│  (Phase 6)      │
└─────────────────┘
```

---

## Bias Mitigation Strategies

### 1. Extreme Repair Values
**Mitigation**: 
- Review extreme value claims manually
- Consider capping outliers during model training
- Use robust scaling methods (e.g., median instead of mean)

### 2. Panel Beater Dominance
**Mitigation**:
- Balance training data across multiple panel beaters
- Use panel-beater-agnostic features
- Apply stratified sampling during training

### 3. Demographic Skew
**Mitigation**:
- Ensure model does not use protected attributes (age, gender)
- Apply fairness constraints during training
- Use stratified sampling to balance demographics

### 4. Temporal Clustering
**Mitigation**:
- Include seasonal features in model
- Use time-based stratification
- Normalize for seasonal variations

---

## Governance Controls

### Audit Trail
- All batch uploads logged with user ID, timestamp, file hash
- All extraction attempts logged with confidence scores
- All review decisions logged with reviewer ID and justification
- All bias detections logged with severity and mitigation recommendations

### Access Control
- Only Claims Managers can approve/reject claims
- Only Executives can view executive dashboard
- All actions require tenant isolation enforcement

### Data Quality Gates
- Claims must pass confidence threshold (≥50) to enter review queue
- Claims with HIGH severity bias flags require manual review
- All training dataset inclusions require approval (human or system)

---

## Future Enhancements

1. **Automatic ML Retraining**: Trigger model retraining when training dataset reaches threshold size
2. **Bias Mitigation Automation**: Automatically apply bias mitigation techniques during training
3. **Active Learning**: Prioritize uncertain claims for human review to improve model
4. **Cross-Batch Validation**: Detect inconsistencies across multiple batches
5. **Real-Time Extraction**: Process documents as they're uploaded (streaming mode)

---

## API Endpoints

### Batch Upload
```typescript
POST /api/trpc/historicalIngestion.uploadBatch
Input: { zipFile: File, uploadedBy: string }
Output: { batchId: number, status: string }
```

### Review Queue
```typescript
GET /api/trpc/reviewQueue.getPending
Output: ReviewQueueItem[]

POST /api/trpc/reviewQueue.submitDecision
Input: { reviewQueueId: number, decision: "approve" | "reject", notes?: string }
Output: { success: boolean }
```

### Executive Dashboard
```typescript
GET /api/trpc/historicalIngestion.getDashboardMetrics
Output: IngestionDashboardMetrics

GET /api/trpc/historicalIngestion.getRecentBatches
Output: BatchSummary[]
```

---

## Database Tables

### Core Tables
- `ingestion_batches`: Batch upload tracking
- `ingestion_documents`: Individual document metadata
- `extracted_document_data`: OCR/LLM extraction results
- `historical_claims`: Master claim records
- `training_dataset`: Approved claims for ML training
- `claim_review_queue`: Human review workflow
- `bias_detection_flags`: Bias detection results

### Audit Tables
- `iso_audit_logs`: Immutable audit trail
- `workflow_audit_trail`: State transition logging

---

## Performance Considerations

- **Batch Processing**: Process documents in parallel (up to 10 concurrent)
- **Caching**: Cache LLM responses for similar documents
- **Indexing**: Composite indexes on (tenantId, batchId, status)
- **Pagination**: Limit query results to 50 items per page
- **Async Processing**: Use background jobs for large batches (>100 documents)

---

## Security Considerations

- **Tenant Isolation**: All queries enforce tenantId filtering
- **File Validation**: Verify file types and sizes before processing
- **Hash Verification**: SHA256 hashing prevents file tampering
- **Access Logging**: All file access logged to audit trail
- **Data Encryption**: Files encrypted at rest in S3

---

## Testing Strategy

### Unit Tests
- Confidence scoring algorithm
- Bias detection algorithms
- Review queue state transitions

### Integration Tests
- End-to-end batch upload flow
- OCR/LLM extraction pipeline
- Human review approval workflow

### Performance Tests
- Large batch processing (1000+ documents)
- Concurrent batch uploads
- Dashboard query performance

---

## Monitoring and Alerts

### Key Metrics
- Batch processing success rate
- Average extraction time
- Review queue backlog
- Bias detection frequency
- Data quality score trends

### Alerts
- Batch processing failures
- HIGH severity bias flags
- Review queue backlog >100 items
- Data quality score <70%
- Extraction time >5 minutes per document

---

## Conclusion

The Historical Claims Ingestion System provides a comprehensive, bias-aware pipeline for safely importing legacy data into the KINGA training dataset. By combining automated extraction, confidence scoring, bias detection, and human oversight, the system ensures high-quality training data while maintaining strict governance controls.
