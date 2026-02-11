/**
 * Claim Intake Database Schema (PostgreSQL)
 * 
 * Owned by: claim-intake-service
 * Database: claim_intake_db
 * 
 * @author Tavonga Shoko
 */

import { pgTable, serial, varchar, text, timestamp, boolean, integer, jsonb, pgEnum } from "drizzle-orm/pg-core";

// Enums
export const claimStatusEnum = pgEnum("claim_status", [
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
]);

export const workflowStateEnum = pgEnum("workflow_state", [
  "created",
  "assigned",
  "under_assessment",
  "internal_review",
  "technical_approval",
  "financial_decision",
  "payment_authorized",
  "closed",
  "disputed"
]);

export const commentTypeEnum = pgEnum("comment_type", [
  "general",
  "flag",
  "clarification_request",
  "technical_note"
]);

export const documentTypeEnum = pgEnum("document_type", [
  "damage_photo",
  "police_report",
  "insurance_policy",
  "vehicle_registration",
  "driver_license",
  "repair_quote",
  "invoice",
  "other"
]);

/**
 * Claims - Insurance claims (partitioned by created_at)
 */
export const claims = pgTable("claims", {
  id: serial("id").primaryKey(),
  claimNumber: varchar("claim_number", { length: 50 }).notNull().unique(),
  claimantId: integer("claimant_id").notNull(),
  
  // Vehicle information
  vehicleMake: varchar("vehicle_make", { length: 100 }),
  vehicleModel: varchar("vehicle_model", { length: 100 }),
  vehicleYear: integer("vehicle_year"),
  vehicleRegistration: varchar("vehicle_registration", { length: 50 }),
  
  // Incident details
  incidentDate: timestamp("incident_date", { withTimezone: true }),
  incidentDescription: text("incident_description"),
  incidentLocation: text("incident_location"),
  incidentCoordinates: jsonb("incident_coordinates"), // {lat, lng}
  
  // Damage photos (S3 URLs stored as JSONB array)
  damagePhotos: jsonb("damage_photos"),
  
  // Policy information
  policyNumber: varchar("policy_number", { length: 100 }),
  policyVerified: boolean("policy_verified").default(false),
  policyDetails: jsonb("policy_details"),
  
  // Workflow status
  status: claimStatusEnum("status").default("submitted").notNull(),
  workflowState: workflowStateEnum("workflow_state"),
  
  // Assignments
  assignedAssessorId: integer("assigned_assessor_id"),
  assignedPanelBeaterId: integer("assigned_panel_beater_id"),
  selectedPanelBeaterIds: jsonb("selected_panel_beater_ids"), // Array of 3 IDs
  
  // AI flags
  aiAssessmentTriggered: boolean("ai_assessment_triggered").default(false),
  aiAssessmentCompleted: boolean("ai_assessment_completed").default(false),
  
  // Fraud flags
  fraudRiskScore: integer("fraud_risk_score"),
  fraudFlags: jsonb("fraud_flags"),
  
  // Approval tracking
  technicallyApprovedBy: integer("technically_approved_by"),
  technicallyApprovedAt: timestamp("technically_approved_at", { withTimezone: true }),
  financiallyApprovedBy: integer("financially_approved_by"),
  financiallyApprovedAt: timestamp("financially_approved_at", { withTimezone: true }),
  approvedAmount: integer("approved_amount"),
  closedBy: integer("closed_by"),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  
  // Metadata
  metadata: jsonb("metadata"),
  
  // Full-text search
  searchVector: text("search_vector"), // tsvector for full-text search
  
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Claim = typeof claims.$inferSelect;
export type InsertClaim = typeof claims.$inferInsert;

/**
 * Claim Documents - Document attachments
 */
export const claimDocuments = pgTable("claim_documents", {
  id: serial("id").primaryKey(),
  claimId: integer("claim_id").notNull(),
  
  documentType: documentTypeEnum("document_type").notNull(),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  fileUrl: text("file_url").notNull(),
  fileSize: integer("file_size"), // bytes
  mimeType: varchar("mime_type", { length: 100 }),
  
  // OCR/extraction results
  extractedText: text("extracted_text"),
  extractedData: jsonb("extracted_data"),
  
  // Upload details
  uploadedBy: integer("uploaded_by").notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).defaultNow().notNull(),
  
  // Verification
  isVerified: boolean("is_verified").default(false),
  verifiedBy: integer("verified_by"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  
  // Metadata
  metadata: jsonb("metadata"),
  
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ClaimDocument = typeof claimDocuments.$inferSelect;
export type InsertClaimDocument = typeof claimDocuments.$inferInsert;

/**
 * Claim Comments - Workflow collaboration
 */
export const claimComments = pgTable("claim_comments", {
  id: serial("id").primaryKey(),
  claimId: integer("claim_id").notNull(),
  userId: integer("user_id").notNull(),
  userRole: text("user_role").notNull(),
  
  commentType: commentTypeEnum("comment_type").notNull(),
  content: text("content").notNull(),
  
  // Mentions
  mentionedUserIds: jsonb("mentioned_user_ids"),
  
  // Attachments
  attachments: jsonb("attachments"),
  
  // Thread support
  parentCommentId: integer("parent_comment_id"),
  
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ClaimComment = typeof claimComments.$inferSelect;
export type InsertClaimComment = typeof claimComments.$inferInsert;

/**
 * Appointments - Assessment appointments
 */
export const appointments = pgTable("appointments", {
  id: serial("id").primaryKey(),
  claimId: integer("claim_id").notNull(),
  assessorId: integer("assessor_id").notNull(),
  
  // Appointment details
  scheduledDate: timestamp("scheduled_date", { withTimezone: true }).notNull(),
  duration: integer("duration").default(60), // minutes
  location: text("location"),
  locationCoordinates: jsonb("location_coordinates"),
  
  // Status
  status: varchar("status", { length: 50 }).default("scheduled").notNull(),
  cancelledBy: integer("cancelled_by"),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  cancellationReason: text("cancellation_reason"),
  
  // Completion
  completedAt: timestamp("completed_at", { withTimezone: true }),
  completionNotes: text("completion_notes"),
  
  // Reminders
  reminderSent: boolean("reminder_sent").default(false),
  reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
  
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Appointment = typeof appointments.$inferSelect;
export type InsertAppointment = typeof appointments.$inferInsert;

/**
 * Police Reports - Police report integration
 */
export const policeReports = pgTable("police_reports", {
  id: serial("id").primaryKey(),
  claimId: integer("claim_id").notNull(),
  
  reportNumber: varchar("report_number", { length: 100 }).notNull().unique(),
  reportDate: timestamp("report_date", { withTimezone: true }),
  reportingOfficer: varchar("reporting_officer", { length: 255 }),
  policeStation: varchar("police_station", { length: 255 }),
  
  // Incident details from report
  incidentDescription: text("incident_description"),
  incidentLocation: text("incident_location"),
  incidentDate: timestamp("incident_date", { withTimezone: true }),
  
  // Parties involved
  partiesInvolved: jsonb("parties_involved"),
  witnessStatements: jsonb("witness_statements"),
  
  // Report document
  reportDocumentUrl: text("report_document_url"),
  
  // Verification
  isVerified: boolean("is_verified").default(false),
  verifiedBy: integer("verified_by"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  
  // Extracted data
  extractedData: jsonb("extracted_data"),
  
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type PoliceReport = typeof policeReports.$inferSelect;
export type InsertPoliceReport = typeof policeReports.$inferInsert;

/**
 * Third Party Vehicles - Third-party vehicle information
 */
export const thirdPartyVehicles = pgTable("third_party_vehicles", {
  id: serial("id").primaryKey(),
  claimId: integer("claim_id").notNull(),
  
  // Vehicle details
  vehicleMake: varchar("vehicle_make", { length: 100 }),
  vehicleModel: varchar("vehicle_model", { length: 100 }),
  vehicleYear: integer("vehicle_year"),
  vehicleRegistration: varchar("vehicle_registration", { length: 50 }),
  vehicleColor: varchar("vehicle_color", { length: 50 }),
  
  // Driver details
  driverName: varchar("driver_name", { length: 255 }),
  driverLicense: varchar("driver_license", { length: 100 }),
  driverPhone: varchar("driver_phone", { length: 20 }),
  driverAddress: text("driver_address"),
  
  // Insurance details
  insuranceCompany: varchar("insurance_company", { length: 255 }),
  policyNumber: varchar("policy_number", { length: 100 }),
  
  // Liability
  isAtFault: boolean("is_at_fault"),
  liabilityPercentage: integer("liability_percentage"),
  
  // Metadata
  metadata: jsonb("metadata"),
  
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ThirdPartyVehicle = typeof thirdPartyVehicles.$inferSelect;
export type InsertThirdPartyVehicle = typeof thirdPartyVehicles.$inferInsert;
