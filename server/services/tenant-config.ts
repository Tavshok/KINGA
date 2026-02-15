/**
 * Tenant Configuration Service
 * 
 * Provides application-level default handling for tenant configuration
 * to work around TiDB's limitation with DEFAULT expressions for TEXT fields.
 */

import { getDb } from "../db";
import { insurerTenants, tenantRoleConfigs, tenantWorkflowConfigs, documentNamingTemplates } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

// ============================================================================
// DEFAULT CONFIGURATIONS
// ============================================================================

export const DEFAULT_TENANT_CONFIG = {
  primaryColor: "#10b981", // KINGA emerald
  secondaryColor: "#64748b", // Slate
  documentNamingTemplate: "KINGA-{DocType}-{ClaimNumber}-v{Version}-{Date}.pdf",
  documentRetentionYears: 7,
  fraudRetentionYears: 10,
  requireManagerApprovalAbove: 10000.00,
  highValueThreshold: 10000.00,
  autoApproveBelow: 5000.00,
  fraudFlagThreshold: 0.70,
};

export const DEFAULT_WORKFLOW_CONFIG = {
  requireExecutiveApprovalAbove: 50000.00,
  requireManagerApprovalAbove: 10000.00,
  autoApproveBelow: 5000.00,
  fraudFlagThreshold: 0.70,
  requireInternalAssessment: 0, // 0 = external only, 1 = all claims
};

export const DEFAULT_ROLE_PERMISSIONS = {
  executive: [
    "view_all_claims",
    "approve_high_value",
    "view_analytics",
    "manage_users",
    "configure_workflows",
  ],
  claims_manager: [
    "view_assigned_claims",
    "approve_moderate_value",
    "assign_assessors",
    "view_team_analytics",
  ],
  claims_processor: [
    "view_assigned_claims",
    "update_claim_status",
    "request_documents",
    "communicate_claimants",
  ],
  internal_assessor: [
    "view_assigned_claims",
    "submit_assessments",
    "upload_reports",
    "flag_fraud",
  ],
  risk_manager: [
    "view_all_claims",
    "review_fraud_flags",
    "approve_technical",
    "manage_risk_register",
  ],
};

export const DEFAULT_DOCUMENT_TEMPLATES = {
  claim: "{TenantCode}-CLAIM-{ClaimNumber}-v{Version}-{Date}.pdf",
  assessment: "{TenantCode}-ASSESS-{ClaimNumber}-v{Version}-{Date}.pdf",
  report: "{TenantCode}-REPORT-{ClaimNumber}-v{Version}-{Date}.pdf",
  approval: "{TenantCode}-APPROVAL-{ClaimNumber}-v{Version}-{Date}.pdf",
};

// ============================================================================
// TENANT CONFIGURATION RETRIEVAL
// ============================================================================

/**
 * Get tenant configuration with defaults applied
 */
export async function getTenantConfig(tenantId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const results = await db.select().from(insurerTenants).where(eq(insurerTenants.id, tenantId)).limit(1);
  const config = results[0];

  if (!config) {
    throw new Error(`Tenant not found: ${tenantId}`);
  }

  // Merge with defaults for any null values
  return {
    ...DEFAULT_TENANT_CONFIG,
    ...config,
    documentNamingTemplate: config.documentNamingTemplate || DEFAULT_TENANT_CONFIG.documentNamingTemplate,
  };
}

/**
 * Get workflow configuration with defaults applied
 */
export async function getWorkflowConfig(tenantId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const results = await db.select().from(tenantWorkflowConfigs).where(eq(tenantWorkflowConfigs.tenantId, tenantId)).limit(1);
  const config = results[0];

  if (!config) {
    // Return defaults if no custom config exists
    return {
      tenantId,
      ...DEFAULT_WORKFLOW_CONFIG,
    };
  }

  return config;
}

/**
 * Get enabled roles for a tenant with permissions
 */
export async function getTenantRoles(tenantId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const roles = await db.select().from(tenantRoleConfigs).where(eq(tenantRoleConfigs.tenantId, tenantId));

  // Apply defaults for permissions if not set
  return roles.map((role: any) => ({
    ...role,
    permissions: role.permissions 
      ? JSON.parse(role.permissions)
      : (DEFAULT_ROLE_PERMISSIONS as any)[role.roleKey] || [],
  }));
}

/**
 * Get document naming template for a specific document type
 */
export async function getDocumentTemplate(tenantId: string, docType: "claim" | "assessment" | "report" | "approval") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const results = await db.select().from(documentNamingTemplates)
    .where((t: any) => eq(t.tenantId, tenantId) && eq(t.docType, docType))
    .limit(1);
  const template = results[0];

  if (!template) {
    // Return default template
    return DEFAULT_DOCUMENT_TEMPLATES[docType];
  }

  return template.template;
}

// ============================================================================
// TENANT INITIALIZATION
// ============================================================================

/**
 * Create a new tenant with default configuration
 */
export async function createTenant(data: {
  id: string;
  name: string;
  displayName: string;
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Create tenant record
  await db.insert(insurerTenants).values({
    ...data,
    primaryColor: data.primaryColor || DEFAULT_TENANT_CONFIG.primaryColor,
    secondaryColor: data.secondaryColor || DEFAULT_TENANT_CONFIG.secondaryColor,
    documentNamingTemplate: DEFAULT_TENANT_CONFIG.documentNamingTemplate,
    documentRetentionYears: DEFAULT_TENANT_CONFIG.documentRetentionYears,
    fraudRetentionYears: DEFAULT_TENANT_CONFIG.fraudRetentionYears,
    requireManagerApprovalAbove: DEFAULT_TENANT_CONFIG.requireManagerApprovalAbove.toString(),
    highValueThreshold: DEFAULT_TENANT_CONFIG.highValueThreshold.toString(),
    autoApproveBelow: DEFAULT_TENANT_CONFIG.autoApproveBelow.toString(),
    fraudFlagThreshold: DEFAULT_TENANT_CONFIG.fraudFlagThreshold.toString(),
  });

  // Create default workflow config
  await db.insert(tenantWorkflowConfigs).values({
    id: `${data.id}-workflow`,
    tenantId: data.id,
    requireExecutiveApprovalAbove: DEFAULT_WORKFLOW_CONFIG.requireExecutiveApprovalAbove.toString(),
    requireManagerApprovalAbove: DEFAULT_WORKFLOW_CONFIG.requireManagerApprovalAbove.toString(),
    autoApproveBelow: DEFAULT_WORKFLOW_CONFIG.autoApproveBelow.toString(),
    fraudFlagThreshold: DEFAULT_WORKFLOW_CONFIG.fraudFlagThreshold.toString(),
    requireInternalAssessment: DEFAULT_WORKFLOW_CONFIG.requireInternalAssessment,
  });

  // Create default role configs (all roles enabled by default)
  const roleKeys = ["executive", "claims_manager", "claims_processor", "internal_assessor", "risk_manager"] as const;
  
  for (const roleKey of roleKeys) {
    await db.insert(tenantRoleConfigs).values({
      id: `${data.id}-role-${roleKey}`,
      tenantId: data.id,
      roleKey,
      enabled: 1,
      displayName: roleKey.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
      permissions: JSON.stringify(DEFAULT_ROLE_PERMISSIONS[roleKey]),
    });
  }

  // Create default document naming templates
  const docTypes = ["claim", "assessment", "report", "approval"] as const;
  
  for (const docType of docTypes) {
    await db.insert(documentNamingTemplates).values({
      id: `${data.id}-template-${docType}`,
      tenantId: data.id,
      docType,
      template: DEFAULT_DOCUMENT_TEMPLATES[docType],
      description: `Default ${docType} document naming template`,
    });
  }

  return data.id;
}

/**
 * Seed default KINGA tenant (for internal use)
 */
export async function seedDefaultKingaTenant() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const kingaTenantId = "kinga-default";
  
  // Check if already exists
  const results = await db.select().from(insurerTenants).where(eq(insurerTenants.id, kingaTenantId)).limit(1);
  const existing = results[0];

  if (existing) {
    console.log("KINGA default tenant already exists");
    return kingaTenantId;
  }

  // Create default KINGA tenant
  await createTenant({
    id: kingaTenantId,
    name: "KINGA",
    displayName: "KINGA Agency",
    primaryColor: "#10b981",
    secondaryColor: "#64748b",
  });

  console.log("✓ Created default KINGA tenant");
  return kingaTenantId;
}
