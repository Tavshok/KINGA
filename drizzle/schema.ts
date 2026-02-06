import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, tinyint } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin", "insurer", "assessor", "panel_beater", "claimant"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Panel Beaters - Approved repair shops
 */
export const panelBeaters = mysqlTable("panel_beaters", {
  id: int("id").autoincrement().primaryKey(),
  name: text("name").notNull(),
  businessName: text("business_name").notNull(),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 20 }),
  address: text("address"),
  city: varchar("city", { length: 100 }),
  approved: tinyint("approved").default(1).notNull(),
  userId: int("user_id"), // Link to users table if they have login access
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type PanelBeater = typeof panelBeaters.$inferSelect;
export type InsertPanelBeater = typeof panelBeaters.$inferInsert;

/**
 * Claims - Insurance claims submitted by claimants
 */
export const claims = mysqlTable("claims", {
  id: int("id").autoincrement().primaryKey(),
  claimantId: int("claimant_id").notNull(), // Reference to users table
  claimNumber: varchar("claim_number", { length: 50 }).notNull().unique(),
  
  // Vehicle information
  vehicleMake: varchar("vehicle_make", { length: 100 }),
  vehicleModel: varchar("vehicle_model", { length: 100 }),
  vehicleYear: int("vehicle_year"),
  vehicleRegistration: varchar("vehicle_registration", { length: 50 }),
  
  // Incident details
  incidentDate: timestamp("incident_date"),
  incidentDescription: text("incident_description"),
  incidentLocation: text("incident_location"),
  
  // Damage photos (S3 URLs, stored as JSON array)
  damagePhotos: text("damage_photos"), // JSON array of S3 URLs
  
  // Policy information
  policyNumber: varchar("policy_number", { length: 100 }),
  policyVerified: tinyint("policy_verified").default(0),
  
  // Workflow status
  status: mysqlEnum("status", [
    "submitted",
    "triage",
    "assessment_pending",
    "assessment_in_progress",
    "quotes_pending",
    "comparison",
    "repair_assigned",
    "repair_in_progress",
    "completed",
    "rejected"
  ]).default("submitted").notNull(),
  
  // Assignments
  assignedAssessorId: int("assigned_assessor_id"), // Reference to users table
  assignedPanelBeaterId: int("assigned_panel_beater_id"), // Final selected panel beater
  selectedPanelBeaterIds: text("selected_panel_beater_ids"), // JSON array of 3 selected panel beater IDs
  
  // AI Assessment
  aiAssessmentTriggered: tinyint("ai_assessment_triggered").default(0),
  aiAssessmentCompleted: tinyint("ai_assessment_completed").default(0),
  
  // Fraud detection
  fraudRiskScore: int("fraud_risk_score"), // 0-100 scale
  fraudFlags: text("fraud_flags"), // JSON array of detected fraud indicators
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type Claim = typeof claims.$inferSelect;
export type InsertClaim = typeof claims.$inferInsert;

/**
 * AI Assessments - AI-powered damage assessments
 */
export const aiAssessments = mysqlTable("ai_assessments", {
  id: int("id").autoincrement().primaryKey(),
  claimId: int("claim_id").notNull(),
  
  // Assessment results
  estimatedCost: int("estimated_cost"), // Cost in cents
  damageDescription: text("damage_description"),
  detectedDamageTypes: text("detected_damage_types"), // JSON array
  confidenceScore: int("confidence_score"), // 0-100
  
  // Fraud detection
  fraudIndicators: text("fraud_indicators"), // JSON array
  fraudRiskLevel: mysqlEnum("fraud_risk_level", ["low", "medium", "high"]),
  
  // AI model details
  modelVersion: varchar("model_version", { length: 50 }),
  processingTime: int("processing_time"), // milliseconds
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type AiAssessment = typeof aiAssessments.$inferSelect;
export type InsertAiAssessment = typeof aiAssessments.$inferInsert;

/**
 * Assessor Evaluations - Human assessor evaluations
 */
export const assessorEvaluations = mysqlTable("assessor_evaluations", {
  id: int("id").autoincrement().primaryKey(),
  claimId: int("claim_id").notNull(),
  assessorId: int("assessor_id").notNull(),
  
  // Cost breakdown
  estimatedRepairCost: int("estimated_repair_cost"), // Total cost in cents
  laborCost: int("labor_cost"), // Labor cost in cents
  partsCost: int("parts_cost"), // Parts cost in cents
  estimatedDuration: int("estimated_duration"), // Days
  
  // Evaluation details
  damageAssessment: text("damage_assessment"),
  recommendations: text("recommendations"),
  fraudRiskLevel: mysqlEnum("fraud_risk_level", ["low", "medium", "high"]),
  
  // Inspection details
  inspectionDate: timestamp("inspection_date"),
  inspectionPhotos: text("inspection_photos"), // JSON array of S3 URLs
  
  status: mysqlEnum("status", ["pending", "in_progress", "completed", "submitted"]).default("pending").notNull(),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type AssessorEvaluation = typeof assessorEvaluations.$inferSelect;
export type InsertAssessorEvaluation = typeof assessorEvaluations.$inferInsert;

/**
 * Panel Beater Quotes - Repair quotes from panel beaters
 */
export const panelBeaterQuotes = mysqlTable("panel_beater_quotes", {
  id: int("id").autoincrement().primaryKey(),
  claimId: int("claim_id").notNull(),
  panelBeaterId: int("panel_beater_id").notNull(),
  
  // Quote details
  quotedAmount: int("quoted_amount").notNull(), // Cost in cents
  laborCost: int("labor_cost"),
  partsCost: int("parts_cost"),
  estimatedDuration: int("estimated_duration"), // Days
  
  // Quote breakdown
  itemizedBreakdown: text("itemized_breakdown"), // JSON array of line items
  notes: text("notes"),
  
  // Modifications (if assessor requests changes)
  modified: tinyint("modified").default(0),
  originalQuotedAmount: int("original_quoted_amount"),
  modificationReason: text("modification_reason"),
  modifiedByAssessorId: int("modified_by_assessor_id"),
  panelBeaterAgreed: tinyint("panel_beater_agreed"),
  
  status: mysqlEnum("status", ["draft", "submitted", "modified", "accepted", "rejected"]).default("draft").notNull(),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type PanelBeaterQuote = typeof panelBeaterQuotes.$inferSelect;
export type InsertPanelBeaterQuote = typeof panelBeaterQuotes.$inferInsert;

/**
 * Appointments - Scheduled appointments between assessors and claimants/panel beaters
 */
export const appointments = mysqlTable("appointments", {
  id: int("id").autoincrement().primaryKey(),
  claimId: int("claim_id").notNull(),
  assessorId: int("assessor_id").notNull(),
  
  appointmentType: mysqlEnum("appointment_type", ["claimant_inspection", "panel_beater_inspection"]).notNull(),
  
  // For claimant inspections
  claimantId: int("claimant_id"),
  
  // For panel beater inspections
  panelBeaterId: int("panel_beater_id"),
  
  // Appointment details
  scheduledDate: timestamp("scheduled_date").notNull(),
  location: text("location"),
  notes: text("notes"),
  
  status: mysqlEnum("status", ["scheduled", "confirmed", "completed", "cancelled"]).default("scheduled").notNull(),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type Appointment = typeof appointments.$inferSelect;
export type InsertAppointment = typeof appointments.$inferInsert;

/**
 * Audit Trail - Complete audit log of all changes and actions
 */
export const auditTrail = mysqlTable("audit_trail", {
  id: int("id").autoincrement().primaryKey(),
  claimId: int("claim_id").notNull(),
  userId: int("user_id").notNull(),
  
  action: varchar("action", { length: 100 }).notNull(), // e.g., "quote_modified", "status_changed", "assessment_completed"
  entityType: varchar("entity_type", { length: 50 }), // e.g., "quote", "claim", "assessment"
  entityId: int("entity_id"),
  
  // Change details
  previousValue: text("previous_value"), // JSON
  newValue: text("new_value"), // JSON
  changeDescription: text("change_description"),
  
  // Metadata
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type AuditTrailEntry = typeof auditTrail.$inferSelect;
export type InsertAuditTrailEntry = typeof auditTrail.$inferInsert;

/**
 * Claim Documents - File attachments for claims
 * Supports various document types: PDFs, images, Word docs, Excel sheets
 */
export const claimDocuments = mysqlTable("claim_documents", {
  id: int("id").autoincrement().primaryKey(),
  claimId: int("claim_id").notNull(),
  uploadedBy: int("uploaded_by").notNull(), // User ID
  
  // File details
  fileName: varchar("file_name", { length: 255 }).notNull(),
  fileKey: varchar("file_key", { length: 500 }).notNull(), // S3 key
  fileUrl: text("file_url").notNull(), // S3 URL
  fileSize: int("file_size").notNull(), // in bytes
  mimeType: varchar("mime_type", { length: 100 }).notNull(),
  
  // Document metadata
  documentTitle: varchar("document_title", { length: 255 }),
  documentDescription: text("document_description"),
  documentCategory: mysqlEnum("document_category", [
    "damage_photo",
    "repair_quote",
    "invoice",
    "police_report",
    "medical_report",
    "insurance_policy",
    "correspondence",
    "other"
  ]).default("other").notNull(),
  
  // Access control
  visibleToRoles: text("visible_to_roles"), // JSON array of roles
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type ClaimDocument = typeof claimDocuments.$inferSelect;
export type InsertClaimDocument = typeof claimDocuments.$inferInsert;