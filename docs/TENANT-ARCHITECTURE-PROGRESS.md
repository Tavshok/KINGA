# Multi-Tenant Insurer Architecture - Implementation Progress

**Last Updated:** February 15, 2026  
**Status:** Phase 2 Complete - Tenant Configuration Tables Deployed

## Overview

This document tracks the implementation progress of the multi-tenant insurer architecture.

## ✅ Completed Work

### Phase 1: Database Schema - Claims Table Enhancement
- **Added `complexity_score` field** to claims table
  - Type: ENUM('simple', 'moderate', 'complex', 'exceptional')
  - Purpose: Track claim complexity for SLA adjustments and workflow routing
  - Location: Added after `fraud_flags` column
  - Status: Successfully deployed to TiDB database

### Phase 2: Tenant Configuration Tables ✅ COMPLETE
**Status:** All 9 tables successfully deployed and tested

#### Tables Created:
1. **`insurer_tenants`** - Insurance companies leasing the platform
   - Stores tenant branding (logo, colors)
   - Document naming templates
   - Retention policies (7 years standard, 10 years fraud)
   - Approval thresholds (R10,000 manager approval, R50,000 executive)
   - Fraud detection thresholds (0.70 default)

2. **`tenant_role_configs`** - Role enablement and customization per tenant
   - Enable/disable roles per tenant
   - Custom role display names
   - Role-specific permissions (JSON array)
   - 5 default roles: executive, claims_manager, claims_processor, internal_assessor, risk_manager

3. **`tenant_workflow_configs`** - Approval thresholds and routing rules
   - Executive approval threshold (R50,000+)
   - Manager approval threshold (R10,000+)
   - Auto-approval threshold (R5,000-)
   - Fraud flag threshold (0.70 default)
   - Internal assessment requirement flag

4. **`document_naming_templates`** - Tenant-customizable document naming
   - Templates for claim, assessment, report, approval documents
   - Variable substitution: {TenantCode}, {DocType}, {ClaimNumber}, {Version}, {Date}
   - Default: "KINGA-{DocType}-{ClaimNumber}-v{Version}-{Date}.pdf"

5. **`document_versions`** - Immutable version history for documents
   - Tracks all document versions with S3 URLs
   - Approval tracking (created_by, approved_by, approved_at)
   - Retention until timestamp for automated cleanup
   - Unique constraint on (claim_id, doc_type, version)

6. **`iso_audit_logs`** - ISO 9001:2015 compliance audit trail
   - Immutable log of all user actions
   - Before/after state snapshots (JSON)
   - Session tracking (IP, session ID)
   - Integrity hash (SHA-256) for tamper detection
   - Action types: create, update, approve, reject, view, delete

7. **`quality_metrics`** - Process performance metrics
   - Metric types: processing_time, approval_rate, fraud_detection, cost_savings
   - Time-series data (period_start, period_end)
   - Used for ISO compliance reporting

8. **`risk_register`** - ISO 31000 risk management tracking
   - Risk types: fraud, cost_overrun, compliance, operational
   - Risk scoring (likelihood × impact, 1-5 scale)
   - Treatment plans: accept, mitigate, transfer, avoid
   - Status tracking: open, mitigated, closed

9. **`training_records`** - User competency and training tracking
   - Training types: fraud_detection, iso_compliance, role_onboarding
   - Completion dates and expiry dates (for certifications)
   - Assessment scores and certificate URLs (S3)

#### Application-Level Default Handling
**Created:** `server/services/tenant-config.ts`

**Purpose:** Handle TEXT field defaults in application code (TiDB limitation workaround)

**Functions:**
- `getTenantConfig(tenantId)` - Get tenant config with defaults applied
- `getWorkflowConfig(tenantId)` - Get workflow config with defaults
- `getTenantRoles(tenantId)` - Get enabled roles with permissions
- `getDocumentTemplate(tenantId, docType)` - Get document naming template
- `createTenant(data)` - Create new tenant with full default configuration
- `seedDefaultKingaTenant()` - Initialize default KINGA tenant

**Default Values:**
- Primary color: #10b981 (KINGA emerald)
- Secondary color: #64748b (slate)
- Document retention: 7 years
- Fraud retention: 10 years
- Manager approval threshold: R10,000
- Executive approval threshold: R50,000
- Auto-approval: R5,000
- Fraud flag threshold: 0.70

**Role Permissions:**
- Executive: view_all_claims, approve_high_value, view_analytics, manage_users, configure_workflows
- Claims Manager: view_assigned_claims, approve_moderate_value, assign_assessors, view_team_analytics
- Claims Processor: view_assigned_claims, update_claim_status, request_documents, communicate_claimants
- Internal Assessor: view_assigned_claims, submit_assessments, upload_reports, flag_fraud
- Risk Manager: view_all_claims, review_fraud_flags, approve_technical, manage_risk_register

#### Testing ✅ ALL TESTS PASS
**Test File:** `server/services/tenant-config.test.ts`  
**Results:** 16/16 tests passing

**Test Coverage:**
- ✅ Create tenant with default configuration
- ✅ Create tenant with custom colors
- ✅ Get tenant configuration with defaults applied
- ✅ Error handling for non-existent tenant
- ✅ Get workflow configuration
- ✅ Return defaults for tenant without custom workflow
- ✅ Get enabled roles with permissions
- ✅ Apply default permissions when not set
- ✅ Get document template
- ✅ Return default template when not found
- ✅ Seed default KINGA tenant
- ✅ Prevent duplicate KINGA tenant
- ✅ Verify default tenant config values
- ✅ Verify default workflow config values
- ✅ Verify permissions defined for all roles
- ✅ Verify templates defined for all document types

## 📋 Next Steps

### Phase 3: Portal Hub Refactor
**Priority:** High  
**Estimated Effort:** 3-4 hours  
**Status:** Not Started

**Objectives:**
1. Consolidate 5 separate insurer role cards into single "Insurer Portal" card
2. Create role selection page showing all 5 roles with descriptions
3. Update routing to support sub-role navigation
4. Update ProtectedRoute to handle insurer sub-role permissions

**Implementation Plan:**
- Create `/insurer-portal` → InsurerRoleSelection page
- Create `/insurer-portal/executive` → Executive Dashboard
- Create `/insurer-portal/claims-manager` → Claims Manager Dashboard
- Create `/insurer-portal/claims-processor` → Claims Processor Dashboard
- Create `/insurer-portal/internal-assessor` → Internal Assessor Dashboard
- Create `/insurer-portal/risk-manager` → Risk Manager Dashboard
- Update PortalHub component to show single card
- Update ProtectedRoute to verify sub-role permissions

### Phase 4: Tenant Configuration Admin UI
**Priority:** High  
**Estimated Effort:** 6-8 hours  
**Status:** Not Started

**Objectives:**
1. Build tenant management interface (list, create, edit)
2. Build role configuration interface (enable/disable, rename, permissions)
3. Build workflow configuration interface (thresholds, routing rules)
4. Build document naming template editor (visual builder, variable insertion)

**Implementation Plan:**
- Create `/admin/tenants` → Tenant list page
- Create `/admin/tenants/new` → Create tenant form
- Create `/admin/tenants/:id` → Edit tenant page
- Create `/admin/tenants/:id/roles` → Role configuration
- Create `/admin/tenants/:id/workflow` → Workflow configuration
- Create `/admin/tenants/:id/documents` → Document templates
- Add tRPC procedures for tenant CRUD operations
- Add tRPC procedures for role/workflow/document config

### Phase 5: Executive Dashboard
**Priority:** Medium  
**Estimated Effort:** 8-10 hours  
**Status:** Not Started

**Objectives:**
1. Build KPI summary cards (claims processed, avg processing time, fraud rate, cost savings)
2. Implement progressive disclosure modals (click card → detailed drill-down)
3. Build complexity-adjusted SLA tracking (2/5/10/20 day SLAs)
4. Build workflow bottleneck identification (station dwell time, delays)

**Implementation Plan:**
- Create `/insurer-portal/executive` → Executive Dashboard
- Create KPI summary cards component
- Create drill-down modal components
- Create SLA tracking component with complexity filtering
- Create bottleneck identification component
- Add tRPC procedures for executive analytics queries
- Add database queries for KPI aggregation

## Technical Notes

### TiDB Constraints & Workarounds
- **No DEFAULT expressions for TEXT fields** → Handle in application code
- **DECIMAL values return as strings** → Parse with `parseFloat()` in application code
- **Timestamp DEFAULT (now())** → Works correctly
- **INT/DECIMAL defaults** → Use quoted string values

### Database Migration Strategy
- **Phase 1:** Used `ALTER TABLE` for single-column addition (complexity_score)
- **Phase 2:** Used direct SQL migration script for 9 tenant tables
- **Future:** Use `drizzle-kit generate && migrate` for incremental changes
- **Always:** Backup database before major schema changes

### Application-Level Default Pattern
```typescript
// 1. Define defaults as constants
export const DEFAULT_CONFIG = { ... };

// 2. Merge with database values
const config = await db.select()...;
return { ...DEFAULT_CONFIG, ...config };

// 3. Handle null TEXT fields explicitly
return config.field || DEFAULT_CONFIG.field;
```

### Testing Best Practices
- Test default value application
- Test error handling (non-existent records)
- Test type conversions (DECIMAL strings → numbers)
- Test idempotency (e.g., seedDefaultKingaTenant)
- Test all CRUD operations
- Test permission inheritance

## Database Schema Diagram

```
┌─────────────────────┐
│ insurer_tenants     │
│ (Insurance Co.)     │
└──────────┬──────────┘
           │
           ├─────────────────────────────────────────────────┐
           │                                                 │
           ▼                                                 ▼
┌─────────────────────┐                          ┌─────────────────────┐
│ tenant_role_configs │                          │ tenant_workflow_    │
│ (Role Permissions)  │                          │ configs (Thresholds)│
└─────────────────────┘                          └─────────────────────┘
           │
           ▼
┌─────────────────────┐
│ document_naming_    │
│ templates           │
└─────────────────────┘
           │
           ▼
┌─────────────────────┐         ┌─────────────────────┐
│ document_versions   │◄────────│ claims              │
│ (Version History)   │         │ (+ complexity_score)│
└─────────────────────┘         └──────────┬──────────┘
                                           │
                                           ├──────────────┐
                                           ▼              ▼
                                ┌─────────────────────┐  ┌─────────────────────┐
                                │ iso_audit_logs      │  │ risk_register       │
                                │ (Compliance Trail)  │  │ (Risk Management)   │
                                └─────────────────────┘  └─────────────────────┘
                                           │
                                           ▼
                                ┌─────────────────────┐
                                │ quality_metrics     │
                                │ (Performance KPIs)  │
                                └─────────────────────┘
```

## Files Modified/Created

### Phase 1 Files:
- `drizzle/schema.ts` - Added complexity_score field to claims table

### Phase 2 Files:
- `drizzle/schema.ts` - Added 9 tenant configuration tables
- `scripts/migrations/add-tenant-config-tables.sql` - SQL migration script
- `server/services/tenant-config.ts` - Tenant configuration service
- `server/services/tenant-config.test.ts` - Test suite (16 tests)

## Deployment Checklist

### Phase 2 Deployment ✅ COMPLETE
- [x] Schema definitions added to drizzle/schema.ts
- [x] SQL migration script created
- [x] Tables created in TiDB database
- [x] Indexes created for common queries
- [x] Tenant configuration service implemented
- [x] Default values defined and documented
- [x] Test suite created (16 tests)
- [x] All tests passing
- [x] TypeScript compilation successful
- [x] Dev server running without errors

### Phase 3 Deployment (Pending)
- [ ] Portal Hub component updated
- [ ] InsurerRoleSelection page created
- [ ] Sub-role dashboards created
- [ ] Routing updated for sub-roles
- [ ] ProtectedRoute updated for sub-role permissions
- [ ] Tests created for role routing
- [ ] Manual testing of role selection flow

### Phase 4 Deployment (Pending)
- [ ] Tenant management pages created
- [ ] Role configuration interface created
- [ ] Workflow configuration interface created
- [ ] Document template editor created
- [ ] tRPC procedures created for tenant CRUD
- [ ] Tests created for tenant management
- [ ] Manual testing of admin UI

### Phase 5 Deployment (Pending)
- [ ] Executive Dashboard created
- [ ] KPI summary cards implemented
- [ ] Progressive disclosure modals implemented
- [ ] SLA tracking with complexity implemented
- [ ] Bottleneck identification implemented
- [ ] tRPC procedures created for analytics
- [ ] Tests created for executive dashboard
- [ ] Manual testing of dashboard features

## References

- **Database Schema:** `/home/ubuntu/kinga-replit/drizzle/schema.ts`
- **Migration Script:** `/home/ubuntu/kinga-replit/scripts/migrations/add-tenant-config-tables.sql`
- **Tenant Service:** `/home/ubuntu/kinga-replit/server/services/tenant-config.ts`
- **Test Suite:** `/home/ubuntu/kinga-replit/server/services/tenant-config.test.ts`
- **Portal Hub Component:** `/home/ubuntu/kinga-replit/app/components/PortalHub.tsx`
- **Admin Dashboard:** `/home/ubuntu/kinga-replit/app/components/AdminDashboard.tsx`
