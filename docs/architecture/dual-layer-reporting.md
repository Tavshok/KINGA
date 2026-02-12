# KINGA Dual-Layer Reporting System Architecture

## Executive Summary

The KINGA Dual-Layer Reporting System provides a comprehensive solution for insurance claim intelligence reporting that balances regulatory compliance requirements with modern analytics capabilities. The system generates two complementary report formats from a single intelligence data source: **immutable PDF snapshots** for audit trails and regulatory submission, and **interactive living intelligence reports** for dynamic analysis and drill-down exploration. This architecture ensures data consistency, supports version control, enforces governance policies, and enables stakeholders to access claim intelligence in the format most appropriate for their needs.

---

## 1. System Overview

### 1.1 Purpose

The dual-layer reporting system addresses two distinct use cases:

**Regulatory & Audit Requirements:**
- Immutable, timestamped snapshots of claim intelligence
- Self-contained PDF reports suitable for regulatory submission
- Cryptographic audit trails for tamper detection
- Long-term archival and compliance documentation

**Operational & Analytical Requirements:**
- Dynamic, interactive exploration of claim intelligence
- Real-time data updates and trend analysis
- Drill-down capabilities for fraud investigation
- Comparative analytics (AI vs assessor vs panel beater)
- Performance benchmarking and pattern detection

### 1.2 Core Principles

1. **Single Source of Truth**: Both PDF and interactive reports derive from the same claim intelligence aggregation service
2. **Immutability Enforcement**: PDF snapshots are cryptographically hashed and protected from modification
3. **Version Control**: All report snapshots are versioned with full audit trails
4. **Bidirectional Linking**: PDF reports contain links to interactive versions; interactive reports reference PDF snapshots
5. **Governance by Design**: RBAC, multi-tenant isolation, and audit logging are enforced at every layer

---

## 2. Architecture Components

### 2.1 Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        KINGA Dual-Layer Reporting System                 │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │
                    ┌─────────────────┴─────────────────┐
                    │                                   │
         ┌──────────▼──────────┐           ┌───────────▼──────────┐
         │   PDF Snapshot      │           │  Interactive Living  │
         │   Report Layer      │           │  Intelligence Layer  │
         └──────────┬──────────┘           └───────────┬──────────┘
                    │                                   │
                    │                                   │
         ┌──────────▼──────────────────────────────────▼──────────┐
         │         Claim Intelligence Aggregation Service         │
         │  (report-intelligence-aggregator.ts - shared source)   │
         └──────────┬──────────────────────────────────┬──────────┘
                    │                                   │
         ┌──────────▼──────────┐           ┌───────────▼──────────┐
         │  Report Snapshot    │           │  Interactive Report  │
         │  Service            │           │  Rendering Engine    │
         │  - Version Control  │           │  - Drill-Down UI     │
         │  - Audit Hashing    │           │  - Real-Time Updates │
         │  - Immutability     │           │  - Analytics Tools   │
         └──────────┬──────────┘           └───────────┬──────────┘
                    │                                   │
         ┌──────────▼──────────┐           ┌───────────▼──────────┐
         │  PDF Generation &   │           │  Interactive Report  │
         │  Storage Service    │           │  Data API            │
         │  - S3 Storage       │           │  - tRPC Procedures   │
         │  - Metadata DB      │           │  - Real-Time Queries │
         └──────────┬──────────┘           └───────────┬──────────┘
                    │                                   │
                    └─────────────────┬─────────────────┘
                                      │
                         ┌────────────▼────────────┐
                         │  Report Linking Service │
                         │  - URL Generation       │
                         │  - QR Code Embedding    │
                         │  - Access Control       │
                         └────────────┬────────────┘
                                      │
                         ┌────────────▼────────────┐
                         │  Governance Layer       │
                         │  - RBAC Enforcement     │
                         │  - Multi-Tenant Isolation│
                         │  - Audit Trail Logging  │
                         └─────────────────────────┘
```

### 2.2 Data Flow

```
User Request (Generate Report)
        │
        ▼
┌───────────────────────────────────────────────────────────────┐
│ Step 1: Aggregate Claim Intelligence                          │
│ - Fetch claim data, AI assessments, assessor evaluations      │
│ - Fetch panel beater quotes, fraud detection results          │
│ - Fetch physics validation, workflow audit trail              │
│ - Aggregate into ClaimIntelligence object                     │
└───────────────────┬───────────────────────────────────────────┘
                    │
                    ▼
┌───────────────────────────────────────────────────────────────┐
│ Step 2: Create Report Snapshot                                │
│ - Generate snapshot ID and version number                     │
│ - Timestamp snapshot creation                                 │
│ - Calculate audit hash (SHA-256 of intelligence data)         │
│ - Store snapshot in report_snapshots table                    │
│ - Mark snapshot as immutable                                  │
└───────────────────┬───────────────────────────────────────────┘
                    │
                    ├─────────────────────────────────────────┐
                    │                                         │
                    ▼                                         ▼
┌────────────────────────────────────┐  ┌──────────────────────────────────┐
│ Step 3a: Generate PDF Report       │  │ Step 3b: Generate Interactive URL│
│ - Apply role-specific template     │  │ - Create unique report ID        │
│ - Generate LLM narrative           │  │ - Generate secure access token   │
│ - Embed visualizations             │  │ - Store link in report_links     │
│ - Add audit hash footer            │  │ - Return interactive report URL  │
│ - Embed interactive report link    │  │                                  │
│ - Convert HTML to PDF              │  │                                  │
│ - Upload PDF to S3                 │  │                                  │
│ - Store metadata in pdf_reports    │  │                                  │
└────────────────────┬───────────────┘  └──────────────────┬───────────────┘
                     │                                      │
                     └──────────────────┬───────────────────┘
                                        │
                                        ▼
                    ┌───────────────────────────────────────┐
                    │ Step 4: Return Report to User         │
                    │ - PDF download URL                    │
                    │ - Interactive report URL              │
                    │ - Report metadata (version, hash)     │
                    └───────────────────────────────────────┘
```

---

## 3. PDF Snapshot Report Layer

### 3.1 Requirements

**Immutability:**
- PDF snapshots must be cryptographically hashed (SHA-256) to detect tampering
- Once generated, PDF content cannot be modified (enforced by audit hash validation)
- Soft delete only—PDFs are never physically removed from storage

**Self-Contained:**
- All necessary context, evidence, and analysis included in the PDF
- Embedded images, charts, and visualizations
- No external dependencies for viewing or interpretation

**Regulator-Ready:**
- Professional formatting with clear section structure
- AI explainability sections describing model decisions
- Complete audit trail of claim workflow
- Timestamped and version-controlled
- Digital signature support (future enhancement)

**Interactive Report Reference:**
- Embedded hyperlink to interactive report
- QR code for mobile access
- Access token for secure viewing

### 3.2 PDF Report Structure

```
┌─────────────────────────────────────────────────────────────┐
│                     KINGA INSURANCE REPORT                   │
│                                                              │
│  Report Type: [Insurer | Assessor | Regulatory]             │
│  Claim Number: CLM-XXXXXX                                   │
│  Report Version: v1.2                                       │
│  Generated: 2026-02-12 14:35:22 UTC                         │
│  Audit Hash: SHA256:a3f5c9...                               │
│                                                              │
│  [QR Code] → Interactive Report                             │
│  https://kinga.manus.space/reports/interactive/abc123       │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ EXECUTIVE SUMMARY                                            │
│ [LLM-generated narrative summary of claim intelligence]     │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ CLAIM OVERVIEW                                               │
│ - Claimant Information                                       │
│ - Vehicle Details                                            │
│ - Incident Description                                       │
│ - Policy Information                                         │
│ - Claim Timeline                                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ DAMAGE ASSESSMENT ANALYSIS                                   │
│ - AI Damage Detection Results                                │
│ - Assessor Evaluation Report                                 │
│ - Damage Severity Breakdown                                  │
│ - Repair Recommendations                                     │
│ - Embedded Damage Photos with Annotations                    │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ AI INTELLIGENCE EXPLANATION                                  │
│ - Model Confidence Scores                                    │
│ - Feature Importance Analysis                                │
│ - Decision Rationale                                         │
│ - Uncertainty Quantification                                 │
│ - Embedded Confidence Gauge Visualization                    │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ COST COMPARISON ANALYTICS                                    │
│ - AI Estimated Cost: $X,XXX                                  │
│ - Assessor Estimated Cost: $X,XXX                            │
│ - Panel Beater Quotes: $X,XXX - $X,XXX                       │
│ - Cost Variance Analysis                                     │
│ - Embedded Cost Comparison Chart                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ FRAUD RISK EVALUATION                                        │
│ - Overall Fraud Risk Score: XX/100                           │
│ - Fraud Indicators Detected                                  │
│ - Risk Factor Breakdown                                      │
│ - Recommendation: [Approve | Investigate | Reject]           │
│ - Embedded Fraud Risk Heat Scale                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ PHYSICS VALIDATION SUMMARY                                   │
│ - Damage Pattern Consistency: [Pass | Fail]                  │
│ - Impact Force Analysis                                      │
│ - Damage Severity vs Speed Correlation                       │
│ - Validation Confidence: XX%                                 │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ WORKFLOW AUDIT TRAIL                                         │
│ - Claim Submitted: 2026-01-15 09:23:11 by John Doe           │
│ - AI Assessment: 2026-01-15 09:25:43 (Automated)             │
│ - Assessor Assigned: 2026-01-16 10:12:05 by Jane Smith       │
│ - Quotes Requested: 2026-01-16 10:15:22 by Jane Smith        │
│ - Quotes Received: 2026-01-18 14:33:09 (3 panel beaters)     │
│ - Claim Approved: 2026-01-19 11:45:30 by Bob Johnson         │
│ - Embedded Workflow Timeline Chart                           │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ SUPPORTING VISUAL EVIDENCE                                   │
│ - Damage Photo Gallery (annotated)                           │
│ - AI Damage Heatmap                                          │
│ - Comparative Quote Breakdown                                │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ REPORT METADATA & VERIFICATION                               │
│ - Report Version: v1.2                                       │
│ - Previous Versions: v1.0, v1.1                              │
│ - Generated By: KINGA AutoVerify AI v2.1.0                   │
│ - Data Sources: AI Assessment, Assessor Evaluation, Quotes   │
│ - Audit Hash: SHA256:a3f5c9e7b2d4f6a8c1e3b5d7f9a2c4e6b8d0    │
│ - Verification: hash matches snapshot ID abc123              │
│                                                              │
│ Interactive Report: https://kinga.manus.space/reports/...    │
│ Access Token: [Secure token for interactive report access]  │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 PDF Generation Workflow

```typescript
// Pseudocode for PDF snapshot generation
async function generatePDFSnapshot(claimId: string, reportType: 'insurer' | 'assessor' | 'regulatory') {
  // Step 1: Aggregate claim intelligence
  const intelligence = await aggregateClaimIntelligence(claimId);
  
  // Step 2: Create snapshot
  const snapshot = await createReportSnapshot({
    claimId,
    intelligence,
    reportType,
    generatedBy: ctx.user.id,
  });
  
  // Step 3: Generate narrative
  const narrative = await generateReportNarrative(intelligence, reportType);
  
  // Step 4: Generate visualizations
  const visualizations = await generateReportVisualizations(intelligence);
  
  // Step 5: Create interactive report link
  const interactiveLink = await createInteractiveReportLink(snapshot.id);
  
  // Step 6: Generate PDF
  const pdfHtml = renderPDFTemplate({
    intelligence,
    narrative,
    visualizations,
    interactiveLink,
    snapshot,
  });
  
  const pdfBuffer = await convertHTMLToPDF(pdfHtml);
  
  // Step 7: Upload to S3
  const pdfUrl = await uploadPDFToS3(pdfBuffer, snapshot.id);
  
  // Step 8: Store metadata
  await storePDFMetadata({
    snapshotId: snapshot.id,
    url: pdfUrl,
    auditHash: snapshot.auditHash,
    version: snapshot.version,
  });
  
  return {
    pdfUrl,
    interactiveUrl: interactiveLink.url,
    snapshot,
  };
}
```

---

## 4. Interactive Living Intelligence Report Layer

### 4.1 Requirements

**Dynamic Visualization:**
- Real-time data updates when claim intelligence changes
- Interactive charts with zoom, pan, and drill-down capabilities
- Responsive design for desktop and mobile viewing

**Drill-Down Analytics:**
- Click-through from summary metrics to detailed breakdowns
- Filter and segment data by time, status, risk level, etc.
- Comparative analysis across multiple dimensions

**AI vs Assessor Comparison:**
- Side-by-side comparison of AI and human assessor evaluations
- Highlight discrepancies and agreement areas
- Confidence interval visualization

**Fraud Risk Exploration:**
- Interactive fraud risk heatmap
- Drill-down into specific fraud indicators
- Historical fraud pattern comparison
- Entity-level fraud profiles (claimant, panel beater, assessor)

**Benchmark & Trend Analytics:**
- Compare claim against similar claims (vehicle type, damage type, region)
- Trend analysis over time (cost trends, fraud trends, processing time)
- Performance metrics (assessor accuracy, panel beater reliability)

### 4.2 Interactive Report UI Structure

```
┌─────────────────────────────────────────────────────────────┐
│ KINGA Interactive Intelligence Report                        │
│ Claim: CLM-XXXXXX | Version: v1.2 | Last Updated: 2 min ago │
│                                                              │
│ [Overview] [Damage] [Cost] [Fraud] [Timeline] [Benchmark]   │
│                                                              │
│ PDF Snapshot: [Download v1.2] [View All Versions]           │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ OVERVIEW TAB                                                 │
│ ┌─────────────┬─────────────┬─────────────┬─────────────┐  │
│ │ Claim Status│ Fraud Risk  │ Est. Cost   │ Processing  │  │
│ │ Approved    │ Low (12/100)│ $4,250      │ 4.2 days    │  │
│ └─────────────┴─────────────┴─────────────┴─────────────┘  │
│                                                              │
│ [Interactive Timeline Chart - Click to drill down]           │
│ [Damage Severity Gauge - Hover for details]                 │
│ [Cost Comparison Chart - Toggle AI/Assessor/Quotes]         │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ DAMAGE TAB                                                   │
│ ┌───────────────────────────────────────────────────────┐  │
│ │ AI Damage Detection                                    │  │
│ │ [Interactive Damage Heatmap - Click regions for detail]│  │
│ │ - Front Bumper: Moderate (85% confidence)             │  │
│ │ - Hood: Severe (92% confidence)                        │  │
│ │ - Headlight (Right): Severe (98% confidence)           │  │
│ └───────────────────────────────────────────────────────┘  │
│                                                              │
│ ┌───────────────────────────────────────────────────────┐  │
│ │ Assessor Evaluation                                    │  │
│ │ [Comparison View - Toggle AI vs Assessor]             │  │
│ │ Agreement: 87% | Discrepancies: 2 items                │  │
│ └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ COST TAB                                                     │
│ [Interactive Cost Breakdown Chart]                           │
│ - AI Estimate: $4,100 (Parts: $2,800 | Labor: $1,300)       │
│ - Assessor Estimate: $4,250 (Parts: $2,900 | Labor: $1,350) │
│ - Panel Beater Quotes:                                       │
│   • Quote 1: $4,150 [View Details]                           │
│   • Quote 2: $4,300 [View Details]                           │
│   • Quote 3: $4,500 [View Details]                           │
│                                                              │
│ [Drill-Down: Click to see itemized parts and labor]         │
│ [Variance Analysis: Highlight cost discrepancies]           │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ FRAUD TAB                                                    │
│ [Interactive Fraud Risk Heatmap]                             │
│ Overall Risk: Low (12/100)                                   │
│                                                              │
│ Fraud Indicators:                                            │
│ ✓ Claimant History: Clean (0 prior claims)                   │
│ ✓ Vehicle History: No red flags                              │
│ ✓ Damage Consistency: Physics validation passed              │
│ ⚠ Delayed Submission: 3 days (minor risk)                    │
│ ✓ Panel Beater Quotes: No collusion detected                 │
│                                                              │
│ [Drill-Down: Click indicator to see detailed analysis]      │
│ [Historical Comparison: Similar claims fraud rates]         │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ TIMELINE TAB                                                 │
│ [Interactive Workflow Timeline]                              │
│ - Claim Submitted: 2026-01-15 09:23:11                       │
│ - AI Assessment: 2026-01-15 09:25:43 (2.5 min)               │
│ - Assessor Assigned: 2026-01-16 10:12:05 (24.8 hrs)          │
│ - Quotes Requested: 2026-01-16 10:15:22 (3 min)              │
│ - Quotes Received: 2026-01-18 14:33:09 (52.3 hrs)            │
│ - Claim Approved: 2026-01-19 11:45:30 (21.2 hrs)             │
│                                                              │
│ Total Processing Time: 4.2 days                              │
│ Benchmark: 5.1 days (18% faster than average)                │
│                                                              │
│ [Drill-Down: Click event to see audit trail details]        │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ BENCHMARK TAB                                                │
│ [Comparative Analytics]                                      │
│                                                              │
│ Similar Claims (Vehicle: Sedan, Damage: Front-end):         │
│ - Average Cost: $4,500 (This claim: $4,250 - 5.6% lower)    │
│ - Average Processing Time: 5.1 days (This: 4.2 days)        │
│ - Fraud Rate: 8% (This claim: Low risk)                     │
│                                                              │
│ [Interactive Scatter Plot: Cost vs Damage Severity]         │
│ [Trend Chart: Monthly cost trends for similar claims]       │
│ [Performance Metrics: Assessor accuracy, panel beater reliability]│
└─────────────────────────────────────────────────────────────┘
```

### 4.3 Interactive Report Data API

```typescript
// tRPC procedures for interactive report data
export const interactiveReportsRouter = router({
  // Get interactive report data
  getInteractiveReport: protectedProcedure
    .input(z.object({ reportId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Verify access permissions
      await verifyReportAccess(ctx.user, input.reportId);
      
      // Get latest snapshot for this report
      const snapshot = await getLatestSnapshot(input.reportId);
      
      // Get real-time claim intelligence
      const intelligence = await aggregateClaimIntelligence(snapshot.claimId);
      
      // Return interactive report data
      return {
        snapshot,
        intelligence,
        lastUpdated: new Date(),
      };
    }),
  
  // Get drill-down data for specific section
  getDrillDownData: protectedProcedure
    .input(z.object({
      reportId: z.string(),
      section: z.enum(['damage', 'cost', 'fraud', 'timeline', 'benchmark']),
      filters: z.record(z.any()).optional(),
    }))
    .query(async ({ ctx, input }) => {
      // Verify access
      await verifyReportAccess(ctx.user, input.reportId);
      
      // Get section-specific drill-down data
      switch (input.section) {
        case 'damage':
          return await getDamageDrillDown(input.reportId, input.filters);
        case 'cost':
          return await getCostDrillDown(input.reportId, input.filters);
        case 'fraud':
          return await getFraudDrillDown(input.reportId, input.filters);
        case 'timeline':
          return await getTimelineDrillDown(input.reportId, input.filters);
        case 'benchmark':
          return await getBenchmarkDrillDown(input.reportId, input.filters);
      }
    }),
  
  // Export interactive report to PDF
  exportToPDF: protectedProcedure
    .input(z.object({ reportId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Verify access
      await verifyReportAccess(ctx.user, input.reportId);
      
      // Get current state of interactive report
      const snapshot = await getLatestSnapshot(input.reportId);
      
      // Generate new PDF snapshot
      return await generatePDFSnapshot(snapshot.claimId, snapshot.reportType);
    }),
});
```

---

## 5. Report Snapshot Service

### 5.1 Database Schema

```sql
-- Report Snapshots Table
CREATE TABLE report_snapshots (
  id VARCHAR(255) PRIMARY KEY,
  claim_id INT NOT NULL,
  version INT NOT NULL,
  report_type ENUM('insurer', 'assessor', 'regulatory') NOT NULL,
  intelligence_data JSON NOT NULL,
  audit_hash VARCHAR(64) NOT NULL,
  generated_by INT NOT NULL,
  generated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_immutable BOOLEAN NOT NULL DEFAULT TRUE,
  tenant_id VARCHAR(255) NOT NULL,
  
  FOREIGN KEY (claim_id) REFERENCES claims(id),
  FOREIGN KEY (generated_by) REFERENCES users(id),
  INDEX idx_claim_version (claim_id, version),
  INDEX idx_audit_hash (audit_hash),
  INDEX idx_tenant (tenant_id)
);

-- PDF Reports Table
CREATE TABLE pdf_reports (
  id VARCHAR(255) PRIMARY KEY,
  snapshot_id VARCHAR(255) NOT NULL,
  s3_url TEXT NOT NULL,
  file_size_bytes INT NOT NULL,
  generated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL,
  tenant_id VARCHAR(255) NOT NULL,
  
  FOREIGN KEY (snapshot_id) REFERENCES report_snapshots(id),
  INDEX idx_snapshot (snapshot_id),
  INDEX idx_tenant (tenant_id)
);

-- Report Links Table (PDF to Interactive)
CREATE TABLE report_links (
  id VARCHAR(255) PRIMARY KEY,
  snapshot_id VARCHAR(255) NOT NULL,
  interactive_url TEXT NOT NULL,
  access_token VARCHAR(255) NOT NULL,
  qr_code_data TEXT,
  expires_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  tenant_id VARCHAR(255) NOT NULL,
  
  FOREIGN KEY (snapshot_id) REFERENCES report_snapshots(id),
  INDEX idx_snapshot (snapshot_id),
  INDEX idx_access_token (access_token),
  INDEX idx_tenant (tenant_id)
);

-- Report Access Audit Trail
CREATE TABLE report_access_audit (
  id INT AUTO_INCREMENT PRIMARY KEY,
  report_id VARCHAR(255) NOT NULL,
  report_type ENUM('pdf', 'interactive') NOT NULL,
  accessed_by INT NOT NULL,
  access_type ENUM('view', 'download', 'export') NOT NULL,
  accessed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip_address VARCHAR(45),
  user_agent TEXT,
  tenant_id VARCHAR(255) NOT NULL,
  
  FOREIGN KEY (accessed_by) REFERENCES users(id),
  INDEX idx_report (report_id),
  INDEX idx_user (accessed_by),
  INDEX idx_tenant (tenant_id)
);
```

### 5.2 Snapshot Creation Workflow

```typescript
// server/report-snapshot-service.ts
import crypto from 'crypto';

interface CreateSnapshotParams {
  claimId: number;
  intelligence: ClaimIntelligence;
  reportType: 'insurer' | 'assessor' | 'regulatory';
  generatedBy: number;
  tenantId: string;
}

export async function createReportSnapshot(params: CreateSnapshotParams) {
  const { claimId, intelligence, reportType, generatedBy, tenantId } = params;
  
  // Get next version number for this claim
  const latestVersion = await getLatestSnapshotVersion(claimId, reportType);
  const version = latestVersion + 1;
  
  // Generate snapshot ID
  const snapshotId = `SNAP-${claimId}-${reportType.toUpperCase()}-v${version}-${Date.now()}`;
  
  // Calculate audit hash (SHA-256 of intelligence data)
  const intelligenceJson = JSON.stringify(intelligence, null, 0);
  const auditHash = crypto
    .createHash('sha256')
    .update(intelligenceJson)
    .digest('hex');
  
  // Store snapshot in database
  const snapshot = await db.insert(reportSnapshots).values({
    id: snapshotId,
    claimId,
    version,
    reportType,
    intelligenceData: intelligence,
    auditHash,
    generatedBy,
    generatedAt: new Date(),
    isImmutable: true,
    tenantId,
  });
  
  // Log snapshot creation in audit trail
  await logReportAudit({
    reportId: snapshotId,
    reportType: 'pdf',
    accessedBy: generatedBy,
    accessType: 'create',
    tenantId,
  });
  
  return {
    id: snapshotId,
    version,
    auditHash,
    generatedAt: snapshot.generatedAt,
  };
}

export async function verifySnapshotIntegrity(snapshotId: string): Promise<boolean> {
  const snapshot = await getSnapshotById(snapshotId);
  
  if (!snapshot) {
    throw new Error(`Snapshot ${snapshotId} not found`);
  }
  
  // Recalculate audit hash
  const intelligenceJson = JSON.stringify(snapshot.intelligenceData, null, 0);
  const calculatedHash = crypto
    .createHash('sha256')
    .update(intelligenceJson)
    .digest('hex');
  
  // Compare with stored hash
  return calculatedHash === snapshot.auditHash;
}
```

---

## 6. Report Linking Mechanism

### 6.1 Link Generation

```typescript
// server/report-linking-service.ts
import { nanoid } from 'nanoid';
import QRCode from 'qrcode';

export async function createInteractiveReportLink(snapshotId: string) {
  // Generate unique access token
  const accessToken = nanoid(32);
  
  // Generate interactive report URL
  const baseUrl = process.env.VITE_APP_URL || 'https://kinga.manus.space';
  const interactiveUrl = `${baseUrl}/reports/interactive/${snapshotId}?token=${accessToken}`;
  
  // Generate QR code data URL
  const qrCodeDataUrl = await QRCode.toDataURL(interactiveUrl, {
    errorCorrectionLevel: 'M',
    width: 200,
  });
  
  // Store link in database
  await db.insert(reportLinks).values({
    id: nanoid(),
    snapshotId,
    interactiveUrl,
    accessToken,
    qrCodeData: qrCodeDataUrl,
    expiresAt: null, // No expiration by default
    createdAt: new Date(),
    tenantId: await getTenantIdForSnapshot(snapshotId),
  });
  
  return {
    url: interactiveUrl,
    qrCode: qrCodeDataUrl,
    accessToken,
  };
}

export async function verifyReportAccess(user: User, reportId: string): Promise<boolean> {
  // Get snapshot
  const snapshot = await getSnapshotById(reportId);
  
  if (!snapshot) {
    throw new Error('Report not found');
  }
  
  // Check multi-tenant isolation
  if (user.tenantId !== snapshot.tenantId && user.role !== 'admin') {
    throw new Error('Access denied: tenant mismatch');
  }
  
  // Check RBAC permissions
  const claim = await getClaimById(snapshot.claimId);
  
  if (!canViewClaim(user, claim)) {
    throw new Error('Access denied: insufficient permissions');
  }
  
  // Log access in audit trail
  await logReportAudit({
    reportId,
    reportType: 'interactive',
    accessedBy: user.id,
    accessType: 'view',
    tenantId: snapshot.tenantId,
  });
  
  return true;
}
```

### 6.2 PDF Embedding

```html
<!-- PDF Report Footer with Interactive Link -->
<div class="report-footer">
  <div class="interactive-link-section">
    <h3>Interactive Report Access</h3>
    <p>
      View the interactive version of this report for real-time updates,
      drill-down analytics, and comparative insights.
    </p>
    
    <div class="qr-code">
      <img src="data:image/png;base64,{{qrCodeData}}" alt="QR Code" />
      <p>Scan with mobile device</p>
    </div>
    
    <div class="link">
      <a href="{{interactiveUrl}}">
        {{interactiveUrl}}
      </a>
      <p>Access Token: {{accessToken}}</p>
    </div>
  </div>
  
  <div class="audit-verification">
    <h3>Report Verification</h3>
    <p>Audit Hash: <code>{{auditHash}}</code></p>
    <p>Version: v{{version}}</p>
    <p>Generated: {{generatedAt}}</p>
    <p>
      To verify report integrity, visit:
      https://kinga.manus.space/verify?hash={{auditHash}}
    </p>
  </div>
</div>
```

---

## 7. Governance & Security

### 7.1 RBAC Enforcement

```typescript
// Role-based access control for reports
export const reportPermissions = {
  insurer: {
    canViewPDF: true,
    canViewInteractive: true,
    canExportPDF: true,
    canShareReport: true,
    canViewAllVersions: true,
  },
  assessor: {
    canViewPDF: true,
    canViewInteractive: true,
    canExportPDF: false,
    canShareReport: false,
    canViewAllVersions: false,
  },
  panel_beater: {
    canViewPDF: false,
    canViewInteractive: false,
    canExportPDF: false,
    canShareReport: false,
    canViewAllVersions: false,
  },
  claimant: {
    canViewPDF: true,
    canViewInteractive: true,
    canExportPDF: true,
    canShareReport: false,
    canViewAllVersions: false,
  },
  regulatory: {
    canViewPDF: true,
    canViewInteractive: true,
    canExportPDF: true,
    canShareReport: false,
    canViewAllVersions: true,
  },
  admin: {
    canViewPDF: true,
    canViewInteractive: true,
    canExportPDF: true,
    canShareReport: true,
    canViewAllVersions: true,
  },
};

export function canAccessReport(user: User, report: ReportSnapshot): boolean {
  const permissions = reportPermissions[user.role];
  
  if (!permissions) {
    return false;
  }
  
  // Check tenant isolation
  if (user.tenantId !== report.tenantId && user.role !== 'admin') {
    return false;
  }
  
  // Check claim ownership/assignment
  const claim = getClaimById(report.claimId);
  
  if (user.role === 'claimant' && claim.claimantId !== user.id) {
    return false;
  }
  
  if (user.role === 'assessor' && !isAssignedToAssessor(claim, user.id)) {
    return false;
  }
  
  return true;
}
```

### 7.2 Multi-Tenant Isolation

```typescript
// Ensure all report queries filter by tenant
export async function getReportsForClaim(claimId: number, user: User) {
  const tenantId = user.role === 'admin' ? undefined : user.tenantId;
  
  const snapshots = await db
    .select()
    .from(reportSnapshots)
    .where(
      and(
        eq(reportSnapshots.claimId, claimId),
        tenantId ? eq(reportSnapshots.tenantId, tenantId) : undefined
      )
    )
    .orderBy(desc(reportSnapshots.version));
  
  return snapshots;
}
```

### 7.3 Audit Trail Logging

```typescript
// Log all report access events
export async function logReportAudit(params: {
  reportId: string;
  reportType: 'pdf' | 'interactive';
  accessedBy: number;
  accessType: 'view' | 'download' | 'export' | 'create';
  tenantId: string;
  ipAddress?: string;
  userAgent?: string;
}) {
  await db.insert(reportAccessAudit).values({
    reportId: params.reportId,
    reportType: params.reportType,
    accessedBy: params.accessedBy,
    accessType: params.accessType,
    accessedAt: new Date(),
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    tenantId: params.tenantId,
  });
}

// Get audit trail for a report
export async function getReportAuditTrail(reportId: string, user: User) {
  // Verify access
  await verifyReportAccess(user, reportId);
  
  const auditTrail = await db
    .select({
      id: reportAccessAudit.id,
      accessType: reportAccessAudit.accessType,
      accessedAt: reportAccessAudit.accessedAt,
      accessedBy: {
        id: users.id,
        name: users.name,
        role: users.role,
      },
    })
    .from(reportAccessAudit)
    .leftJoin(users, eq(reportAccessAudit.accessedBy, users.id))
    .where(eq(reportAccessAudit.reportId, reportId))
    .orderBy(desc(reportAccessAudit.accessedAt));
  
  return auditTrail;
}
```

---

## 8. Implementation Roadmap

### Phase 1: Foundation (Week 1)
- [ ] Design database schema for snapshots, PDF metadata, links, audit trail
- [ ] Implement report snapshot service with version control
- [ ] Build audit hash generation and verification
- [ ] Create report linking service with QR code generation

### Phase 2: PDF Layer (Week 2)
- [ ] Extend existing PDF generation service for dual-layer support
- [ ] Embed interactive report links and QR codes in PDFs
- [ ] Implement PDF storage service with S3 integration
- [ ] Add immutability enforcement and soft delete

### Phase 3: Interactive Layer (Week 3)
- [ ] Build interactive report page component
- [ ] Implement drill-down analytics UI
- [ ] Create AI vs assessor comparison tools
- [ ] Build fraud risk exploration interface
- [ ] Add benchmark and trend analytics

### Phase 4: Governance (Week 4)
- [ ] Implement RBAC enforcement for report access
- [ ] Add multi-tenant isolation checks
- [ ] Build report access audit trail logging
- [ ] Create report sharing controls

### Phase 5: Integration & Testing (Week 5)
- [ ] Create tRPC procedures for dual-layer reports
- [ ] Build frontend UI for report generation
- [ ] Integrate with existing claim workflow
- [ ] Comprehensive testing (unit, integration, E2E)
- [ ] Performance optimization
- [ ] Create checkpoint

---

## 9. Success Metrics

### Technical Metrics
- **Report Generation Time**: < 5 seconds for PDF, < 1 second for interactive
- **Snapshot Integrity**: 100% audit hash verification success rate
- **Storage Efficiency**: < 2MB average PDF size, < 100KB snapshot metadata
- **API Performance**: < 200ms p95 latency for interactive report queries

### Business Metrics
- **Regulatory Compliance**: 100% of reports include required audit trails
- **User Adoption**: > 80% of users access interactive reports within 7 days
- **Cost Savings**: 30% reduction in manual report generation time
- **Fraud Detection**: Interactive drill-down increases fraud investigation efficiency by 40%

---

## 10. Future Enhancements

### Advanced Analytics
- Predictive analytics for claim outcomes
- Machine learning model performance tracking
- Automated fraud pattern detection alerts

### Collaboration Features
- Real-time collaborative annotations on interactive reports
- Shared report workspaces for multi-stakeholder review
- Comment threads and discussion forums

### Regulatory Extensions
- Digital signature integration for PDF reports
- Blockchain-based audit trail immutability
- Automated regulatory submission workflows

### AI Enhancements
- Natural language query interface for interactive reports
- Automated report summarization and insights
- Conversational AI assistant for report exploration

---

## Conclusion

The KINGA Dual-Layer Reporting System provides a comprehensive solution that balances regulatory compliance with modern analytics capabilities. By maintaining a single source of truth (claim intelligence aggregation) and generating two complementary report formats (immutable PDF snapshots and interactive living reports), the system ensures data consistency, supports version control, enforces governance policies, and enables stakeholders to access claim intelligence in the format most appropriate for their needs. The architecture is designed for scalability, security, and extensibility, positioning KINGA as a leader in insurance technology innovation.
