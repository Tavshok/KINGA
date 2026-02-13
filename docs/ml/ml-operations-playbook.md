# KINGA ML Operations Playbook

**Document Version:** 1.0  
**Last Updated:** February 13, 2026  
**Audience:** Data Scientists, ML Engineers, System Administrators

---

## Purpose

This playbook provides step-by-step operational procedures for managing KINGA's machine learning systems, from historical claims ingestion through model deployment and monitoring. It serves as the practical implementation guide for the governance framework.

---

## Table of Contents

1. [Historical Claims Ingestion](#historical-claims-ingestion)
2. [Training Data Review](#training-data-review)
3. [Model Training](#model-training)
4. [Model Validation](#model-validation)
5. [Model Deployment](#model-deployment)
6. [Monitoring and Maintenance](#monitoring-and-maintenance)
7. [Incident Response](#incident-response)
8. [Troubleshooting](#troubleshooting)

---

## Historical Claims Ingestion

### Batch Upload Procedure

**Frequency:** As needed (typically monthly or quarterly)

**Prerequisites:**
- Historical claims documents organized by claim
- ZIP file prepared with folder-per-claim structure
- Admin access to KINGA ML platform

**Steps:**

1. **Prepare Batch ZIP File**
   ```
   batch-YYYY-MM-DD.zip
   ├── claim-REF-001/
   │   ├── assessor-report.pdf
   │   ├── damage-photos/
   │   │   ├── front.jpg
   │   │   └── rear.jpg
   │   └── panel-beater-quote.pdf
   ├── claim-REF-002/
   │   └── ...
   ```

2. **Access ML Admin Dashboard**
   - Navigate to `/ml/admin/ingest`
   - Click "Batch Upload"

3. **Upload ZIP File**
   - Select ZIP file
   - Enter batch metadata:
     - Batch name (e.g., "Q1 2024 Zimbabwe Insurance Corp")
     - Source insurer
     - Source country
     - Claim year range
   - Click "Upload and Process"

4. **Monitor Processing**
   - Watch progress bar
   - Check for errors in real-time log
   - Processing time: ~2-5 minutes per claim

5. **Review Batch Summary**
   - Total claims processed
   - Success/failure counts
   - Average confidence score
   - Flagged anomalies

6. **Handle Failures**
   - Download error report
   - Fix issues in source documents
   - Re-upload failed claims individually

**Expected Outcomes:**
- Batch record created in database
- Claims added to review queue
- Extraction completed for all documents
- Confidence scores calculated

**Troubleshooting:**
- **ZIP extraction fails** → Check ZIP file integrity, ensure no password protection
- **OCR confidence low** → Verify document quality, consider manual data entry
- **Extraction timeout** → Large PDFs may need splitting, increase timeout setting

---

### Individual Claim Upload

**Use Cases:**
- Corrective upload for failed batch claims
- Adding missing documents to existing claim
- Manual claim reprocessing

**Steps:**

1. **Access Individual Upload**
   - Navigate to `/ml/admin/ingest/individual`

2. **Enter Claim Reference**
   - Input existing claim reference (if adding to existing)
   - Or leave blank for new claim

3. **Upload Documents**
   - Drag and drop files
   - Or click "Browse" to select
   - Supported formats: PDF, JPG, PNG, DOCX, XLSX

4. **Classify Documents**
   - For each document, select type:
     - Assessor Report
     - Panel Beater Quote
     - Police Report
     - Damage Photo
     - Other

5. **Submit for Processing**
   - Click "Process Claim"
   - Wait for extraction to complete

6. **Review Results**
   - Check extracted data accuracy
   - Verify confidence score
   - Approve or request re-extraction

---

## Training Data Review

### Daily Review Queue Check

**Frequency:** Daily (Monday-Friday)

**Responsibility:** Data Quality Reviewer

**Steps:**

1. **Access Review Queue**
   - Navigate to `/ml/review/queue`
   - Queue shows claims pending review, sorted by priority

2. **Select Claim for Review**
   - Click on claim row
   - Review panel opens with:
     - Left: Original documents
     - Right: Extracted data and scores

3. **Inspect Confidence Score Breakdown**
   - Check each of 8 component scores
   - Identify why score is MEDIUM or LOW
   - Review flagged anomalies

4. **Review Documents**
   - Open each document in viewer
   - Verify extracted data matches documents
   - Check for missing information

5. **Make Decision**
   - **Approve** → Claim added to training dataset
   - **Reject** → Claim goes to reference dataset only
   - **Request More Info** → Claim returned to extraction

6. **Document Justification**
   - Enter brief reason for decision
   - Required for all approvals/rejections

7. **Submit Decision**
   - Click "Submit"
   - Claim removed from queue
   - Audit log entry created

**Daily Targets:**
- Review minimum 20 claims per day
- Maintain queue backlog < 100 claims
- Average review time: 3-5 minutes per claim

**Decision Guidelines:**

| Scenario | Decision | Justification Example |
|----------|----------|----------------------|
| Score 75-79, all docs present | Approve | "Borderline score but comprehensive documentation" |
| Score 60-74, missing 1 document | Reject | "Incomplete evidence, missing police report" |
| Score 50-59, rare vehicle type | Approve (exception) | "Rare Lamborghini claim, critical for model diversity" |
| Score 50-59, handwritten adjustments | Reject | "Multiple handwritten changes indicate dispute" |

---

### Weekly Review Metrics

**Frequency:** Weekly (every Monday)

**Responsibility:** Senior Data Reviewer

**Steps:**

1. **Generate Weekly Report**
   - Navigate to `/ml/reports/weekly`
   - Select date range (previous 7 days)
   - Click "Generate Report"

2. **Review Key Metrics**
   - Claims ingested
   - Claims reviewed
   - Approval rate
   - Average confidence score
   - Anomaly detection rate

3. **Identify Trends**
   - Increasing/decreasing approval rates
   - Changes in confidence score distribution
   - New anomaly patterns

4. **Take Action**
   - Adjust scoring weights if needed
   - Update review guidelines
   - Provide feedback to team

5. **Share with Stakeholders**
   - Email report to Data Governance Committee
   - Highlight notable findings
   - Recommend policy changes if needed

---

## Model Training

### Training Request Submission

**Frequency:** As needed (typically monthly)

**Responsibility:** Data Scientist

**Prerequisites:**
- Training dataset version finalized
- Minimum 500 claims in training dataset
- Dataset diversity validated

**Steps:**

1. **Prepare Training Dataset**
   - Navigate to `/ml/datasets/training`
   - Review dataset statistics
   - Verify diversity scores meet thresholds
   - Create new dataset version if needed

2. **Submit Training Request**
   - Navigate to `/ml/models/train`
   - Select training dataset version
   - Configure training parameters:
     - Model architecture (default: XGBoost)
     - Hyperparameters (or use auto-tuning)
     - Validation split (default: 80/20)
   - Enter training job name

3. **Review Pre-Training Validation**
   - System runs automated checks:
     - Dataset size ≥ 500 claims
     - Diversity score ≥ 60
     - No critical data quality issues
   - Address any failures before proceeding

4. **Start Training Job**
   - Click "Start Training"
   - Job submitted to training queue
   - Estimated completion time displayed

5. **Monitor Training Progress**
   - Navigate to `/ml/models/jobs`
   - View real-time training metrics:
     - Epoch progress
     - Training loss
     - Validation accuracy
   - Training typically takes 30-60 minutes

6. **Review Training Results**
   - Training complete notification sent via email
   - Review metrics:
     - Final accuracy
     - Precision/recall
     - Confusion matrix
     - Feature importance
   - Compare to baseline model

7. **Document Training Run**
   - Add notes to training job:
     - Dataset characteristics
     - Notable findings
     - Next steps
   - Save for audit trail

**Expected Outcomes:**
- New model version created
- Validation metrics calculated
- Model ready for validation testing

**Troubleshooting:**
- **Training fails with OOM error** → Reduce batch size or dataset size
- **Accuracy below baseline** → Review dataset quality, check for data leakage
- **Training takes > 2 hours** → Check resource allocation, consider distributed training

---

## Model Validation

### Validation Testing Procedure

**Frequency:** After each training run

**Responsibility:** Data Scientist

**Steps:**

1. **Access Model Version**
   - Navigate to `/ml/models`
   - Select newly trained model version
   - Status should be "validation"

2. **Run Automated Validation Tests**
   - Click "Run Validation Suite"
   - Tests include:
     - Accuracy on held-out test set
     - Bias metrics (geographic, temporal, etc.)
     - Fraud detection stability
     - Performance benchmarks
   - Tests take ~10 minutes

3. **Review Validation Results**
   - **Accuracy Test:**
     - Must be ≥ production baseline
     - Check accuracy by vehicle class
     - Identify weak segments
   
   - **Bias Test:**
     - Geographic fairness score
     - Temporal drift detection
     - Insurer bias metrics
     - All must be within policy limits
   
   - **Fraud Detection Test:**
     - Fraud detection rate vs. baseline
     - False positive rate
     - Must maintain or improve
   
   - **Performance Test:**
     - Prediction latency (must be < 500ms)
     - Throughput (predictions per second)
     - Resource usage

4. **Manual Validation**
   - Review sample predictions:
     - Select 20 random claims from test set
     - Compare model prediction to actual outcome
     - Check for logical consistency
   - Document any concerning patterns

5. **Make Validation Decision**
   - **Pass** → Model ready for deployment request
   - **Fail** → Document issues, retrain with adjustments
   - **Conditional Pass** → Approve with monitoring plan

6. **Document Validation**
   - Enter validation notes
   - Attach supporting analysis
   - Submit validation report

**Validation Thresholds:**

| Metric | Threshold | Action if Failed |
|--------|-----------|------------------|
| Accuracy | ≥ 85% | Retrain with more data |
| Bias (geographic) | Fairness score ≥ 70 | Rebalance dataset |
| Fraud detection rate | ≥ baseline - 2% | Review fraud features |
| Prediction latency | < 500ms | Optimize model size |

---

## Model Deployment

### Deployment Request Procedure

**Frequency:** After successful validation

**Responsibility:** Data Scientist (request), Senior Data Reviewer (approval)

**Steps:**

**For Data Scientist:**

1. **Prepare Deployment Request**
   - Navigate to model version page
   - Click "Request Deployment"
   - Complete deployment form:
     - Target environment (staging or production)
     - Deployment strategy (blue-green, canary, full)
     - Rollback plan
     - Monitoring plan

2. **Attach Supporting Documents**
   - Validation report
   - Training metrics
   - Bias assessment
   - Performance benchmarks

3. **Submit for Approval**
   - Click "Submit Request"
   - Notification sent to Senior Data Reviewer
   - Request enters approval queue

**For Senior Data Reviewer:**

4. **Review Deployment Request**
   - Navigate to `/ml/approvals`
   - Select pending deployment request
   - Review all attached documents

5. **Assess Deployment Readiness**
   - Verify all validation tests passed
   - Check bias metrics within limits
   - Confirm rollback plan documented
   - Review monitoring plan

6. **Make Approval Decision**
   - **Approve** → Deployment proceeds
   - **Reject** → Return to Data Scientist with feedback
   - **Request Changes** → Conditional approval with requirements

7. **Document Approval**
   - Enter approval notes
   - Sign off on deployment
   - Submit decision

**For System Administrator:**

8. **Execute Deployment (if approved)**
   - Deployment to staging:
     - Automated deployment via CI/CD
     - Model loaded into staging environment
     - Smoke tests run automatically
   
   - Monitor staging for 48 hours:
     - Check prediction accuracy
     - Monitor latency and errors
     - Review sample predictions
   
   - Deploy to production (after staging validation):
     - Blue-green deployment (zero downtime)
     - Gradual traffic shift (10% → 50% → 100%)
     - Monitor at each stage

9. **Post-Deployment Verification**
   - Run production smoke tests
   - Verify model version in production
   - Check monitoring dashboards
   - Notify stakeholders of successful deployment

**Deployment Checklist:**

- [ ] Validation tests passed
- [ ] Bias assessment completed
- [ ] Performance benchmarks met
- [ ] Rollback plan documented
- [ ] Monitoring alerts configured
- [ ] Senior approval obtained
- [ ] Staging deployment successful
- [ ] 48-hour staging monitoring complete
- [ ] Production deployment approved
- [ ] Post-deployment verification passed

---

## Monitoring and Maintenance

### Daily Monitoring Tasks

**Frequency:** Daily

**Responsibility:** System Administrator

**Steps:**

1. **Check System Health Dashboard**
   - Navigate to `/ml/monitoring/health`
   - Review key metrics:
     - Ingestion pipeline status
     - Extraction success rate
     - Review queue backlog
     - Model prediction latency
     - Error rates

2. **Review Alerts**
   - Check for critical/warning alerts
   - Investigate any anomalies
   - Take corrective action if needed

3. **Monitor Model Performance**
   - Navigate to `/ml/monitoring/models`
   - Check production model metrics:
     - Prediction volume
     - Average confidence scores
     - Accuracy (if ground truth available)
     - Latency trends

4. **Check Resource Usage**
   - CPU/memory utilization
   - Storage capacity
   - Database performance
   - API rate limits

5. **Document Issues**
   - Log any problems encountered
   - Track resolution status
   - Escalate if needed

**Alert Response Times:**

| Alert Severity | Response Time | Action |
|----------------|---------------|--------|
| Critical | Immediate | Investigate and resolve ASAP |
| High | Within 1 hour | Investigate and plan fix |
| Medium | Within 4 hours | Review and schedule fix |
| Low | Within 24 hours | Monitor and address in maintenance window |

---

### Weekly Maintenance Tasks

**Frequency:** Weekly (Sunday 2:00 AM)

**Responsibility:** System Administrator

**Tasks:**

1. **Database Maintenance**
   - Run database optimization
   - Clean up old temporary files
   - Archive old audit logs (> 90 days)

2. **Performance Optimization**
   - Review slow queries
   - Optimize indexes if needed
   - Clear caches

3. **Backup Verification**
   - Verify automated backups completed
   - Test restore procedure (monthly)
   - Check backup storage capacity

4. **Security Updates**
   - Apply security patches
   - Update dependencies
   - Review access logs

5. **Generate Weekly Report**
   - System uptime
   - Performance metrics
   - Issues encountered
   - Maintenance actions taken

---

### Monthly Model Drift Monitoring

**Frequency:** Monthly (first Monday of month)

**Responsibility:** Data Scientist

**Steps:**

1. **Collect Production Data**
   - Export last 30 days of predictions
   - Gather ground truth data (actual outcomes)
   - Calculate actual accuracy

2. **Compare to Baseline**
   - Production accuracy vs. validation accuracy
   - Check for accuracy degradation
   - Identify drift patterns

3. **Analyze Feature Drift**
   - Compare feature distributions:
     - Production claims vs. training data
     - Check for distribution shifts
     - Identify new patterns

4. **Assess Bias Drift**
   - Recalculate bias metrics on production data
   - Compare to training dataset bias metrics
   - Flag significant changes

5. **Make Recommendations**
   - **No drift detected** → Continue monitoring
   - **Minor drift** → Schedule retraining in next cycle
   - **Significant drift** → Immediate retraining required

6. **Document Findings**
   - Create drift report
   - Share with Data Governance Committee
   - Update retraining schedule if needed

**Drift Thresholds:**

| Metric | Threshold | Action |
|--------|-----------|--------|
| Accuracy drop | > 3% | Immediate retraining |
| Feature drift (KL divergence) | > 0.15 | Schedule retraining |
| Bias metric change | > 10 points | Investigate and retrain |

---

## Incident Response

### Critical Incident: Model Accuracy Drop

**Trigger:** Production accuracy drops > 5% from baseline

**Steps:**

1. **Immediate Actions (within 15 minutes)**
   - Acknowledge alert
   - Notify Data Scientist and Senior Reviewer
   - Check if issue is widespread or isolated

2. **Investigation (within 1 hour)**
   - Review recent predictions
   - Check for data quality issues
   - Verify model version in production
   - Check for infrastructure problems

3. **Mitigation (within 2 hours)**
   - If model issue confirmed:
     - Rollback to previous model version
     - Notify stakeholders
     - Document rollback decision
   - If data issue:
     - Fix data pipeline
     - Reprocess affected claims
   - If infrastructure issue:
     - Restart services
     - Scale resources if needed

4. **Root Cause Analysis (within 24 hours)**
   - Identify root cause
   - Document findings
   - Develop prevention plan

5. **Post-Incident Review (within 3 days)**
   - Conduct team review meeting
   - Update incident response procedures
   - Implement preventive measures

---

### Critical Incident: Bias Detected in Production

**Trigger:** Bias metrics exceed policy limits in production

**Steps:**

1. **Immediate Actions**
   - Pause model predictions (if severe)
   - Notify Senior Data Reviewer and Compliance Officer
   - Document bias metrics

2. **Investigation**
   - Analyze affected predictions
   - Identify bias source (data, model, or both)
   - Assess impact on customers

3. **Mitigation**
   - If data bias:
     - Rebalance training dataset
     - Retrain model
     - Validate bias metrics
   - If model bias:
     - Adjust model fairness constraints
     - Retrain with fairness objectives
     - Validate improvements

4. **Communication**
   - Notify affected stakeholders
   - Prepare customer communication (if needed)
   - Document corrective actions

5. **Prevention**
   - Enhance bias detection
   - Update training procedures
   - Increase monitoring frequency

---

## Troubleshooting

### Common Issues and Solutions

**Issue: Low OCR Confidence**

**Symptoms:**
- Extraction confidence < 70%
- Missing or incorrect extracted data
- Garbled text in extraction results

**Solutions:**
1. Check document quality (resolution, clarity)
2. Try different OCR engine (Tesseract vs. Cloud Vision)
3. Pre-process images (deskew, denoise, enhance contrast)
4. Manual data entry for critical fields

---

**Issue: High Review Queue Backlog**

**Symptoms:**
- Queue backlog > 100 claims
- Review SLA breached
- Complaints from data scientists

**Solutions:**
1. Allocate additional reviewers
2. Adjust confidence thresholds (increase auto-approval threshold from 80 to 75)
3. Batch review similar claims
4. Prioritize high-value claims

---

**Issue: Model Training Fails**

**Symptoms:**
- Training job status "failed"
- Error in training logs
- No model version created

**Solutions:**
1. Check error logs for specific error
2. Common causes:
   - Out of memory → Reduce batch size
   - Data format error → Validate dataset
   - Insufficient data → Add more claims
3. Retry with adjusted parameters
4. Escalate to ML engineer if persistent

---

**Issue: Deployment Rollback Needed**

**Symptoms:**
- Production accuracy drop
- Increased error rate
- Customer complaints

**Steps:**
1. Navigate to `/ml/models/production`
2. Click "Rollback to Previous Version"
3. Confirm rollback
4. Verify previous version restored
5. Monitor for stability
6. Investigate root cause

---

## Appendix A: Command Reference

### Database Queries

**Get training dataset statistics:**
```sql
SELECT 
  COUNT(*) as total_claims,
  AVG(confidence_score) as avg_score,
  COUNT(DISTINCT country) as countries,
  COUNT(DISTINCT insurer) as insurers
FROM training_dataset
WHERE dataset_version = 'v1.2.0';
```

**Find claims pending review:**
```sql
SELECT 
  claim_id,
  confidence_score,
  confidence_category,
  created_at
FROM claim_review_queue
WHERE status = 'pending'
ORDER BY priority DESC, created_at ASC
LIMIT 20;
```

**Get model deployment history:**
```sql
SELECT 
  model_version,
  deployed_to,
  deployed_at,
  deployed_by
FROM model_training_audit_log
WHERE event_type = 'deployment'
ORDER BY deployed_at DESC
LIMIT 10;
```

---

## Appendix B: Escalation Matrix

| Issue Type | Severity | First Contact | Escalation (if unresolved in 2 hours) |
|------------|----------|---------------|---------------------------------------|
| System down | Critical | System Admin | CTO |
| Model accuracy drop | Critical | Data Scientist | Senior Data Reviewer → Data Governance Committee |
| Bias detected | Critical | Senior Data Reviewer | Compliance Officer → Data Governance Committee |
| Ingestion failure | High | System Admin | Data Scientist |
| Review queue backlog | Medium | Data Quality Reviewer | Senior Data Reviewer |
| Performance degradation | Medium | System Admin | DevOps Lead |

---

## Appendix C: Contact Information

**On-Call Rotation:**  
Check `/ml/admin/oncall` for current on-call engineer

**Team Emails:**
- ML Team: ml-team@kinga.ai
- Data Quality: data-quality@kinga.ai
- System Admin: ml-support@kinga.ai

**Emergency Hotline:**  
+263-XXX-XXXX (24/7)

---

**Document Control:**
- Version: 1.0
- Author: KINGA ML Operations Team
- Last Updated: February 13, 2026
- Next Review: May 13, 2026
