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
/**
 * Notifications - Real-time notifications for users
 * Tracks system events and user actions that require attention
 */
export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(), // Recipient user ID
  
  // Notification content
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  type: mysqlEnum("type", [
    "claim_assigned",
    "quote_submitted",
    "fraud_detected",
    "status_changed",
    "assessment_completed",
    "approval_required",
    "document_uploaded",
    "system_alert"
  ]).notNull(),
  
  // Related entities
  claimId: int("claim_id"), // Link to related claim
  entityType: varchar("entity_type", { length: 50 }), // e.g., "claim", "quote", "assessment"
  entityId: int("entity_id"), // ID of the related entity
  
  // Notification state
  isRead: tinyint("is_read").default(0).notNull(),
  readAt: timestamp("read_at"),
  
  // Action link (optional)
  actionUrl: varchar("action_url", { length: 500 }), // URL to navigate to when clicked
  
  // Priority level
  priority: mysqlEnum("priority", ["low", "medium", "high", "urgent"]).default("medium").notNull(),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

/**
 * Fraud Indicators - Detailed fraud detection results for each claim
 * Stores all detected fraud patterns and their severity scores
 */
export const fraudIndicators = mysqlTable("fraud_indicators", {
  id: int("id").autoincrement().primaryKey(),
  claimId: int("claim_id").notNull(),
  
  // Overall fraud assessment
  overallFraudScore: int("overall_fraud_score").notNull(), // 0-100
  fraudRiskLevel: mysqlEnum("fraud_risk_level", ["low", "medium", "high", "critical"]).notNull(),
  
  // Claimant fraud indicators
  delayedSubmissionDays: int("delayed_submission_days"), // Days between incident and claim
  delayedSubmissionScore: int("delayed_submission_score"), // 0-100
  
  isNonOwnerDriver: tinyint("is_non_owner_driver").default(0),
  nonOwnerDriverScore: int("non_owner_driver_score"),
  
  isSolePartyNightAccident: tinyint("is_sole_party_night_accident").default(0),
  solePartyNightScore: int("sole_party_night_score"),
  
  policyAgeDays: int("policy_age_days"), // Days between policy start and incident
  newPolicyWriteOffScore: int("new_policy_write_off_score"),
  
  previousInsurerCount: int("previous_insurer_count"), // Number of insurers in past year
  insurerHoppingScore: int("insurer_hopping_score"),
  
  claimantHistoryScore: int("claimant_history_score"), // Based on past claims
  
  // Panel beater fraud indicators
  quoteSimilarityScore: int("quote_similarity_score"), // 0-100, higher = more similar quotes
  hasCopyQuotations: tinyint("has_copy_quotations").default(0),
  
  inflatedPartsCostScore: int("inflated_parts_cost_score"),
  inflatedLaborTimeScore: int("inflated_labor_time_score"),
  exaggeratedDamageScore: int("exaggerated_damage_score"),
  
  replacementVsRepairRatio: int("replacement_vs_repair_ratio"), // Percentage of parts marked for replacement
  replacementRatioScore: int("replacement_ratio_score"),
  
  damageScopeCreepScore: int("damage_scope_creep_score"), // Ballooning parts list
  
  // Assessor fraud indicators
  assessorCollusionScore: int("assessor_collusion_score"),
  assessorBiasScore: int("assessor_bias_score"),
  rubberStampingScore: int("rubber_stamping_score"),
  
  // Document & evidence indicators
  photoMetadataScore: int("photo_metadata_score"), // EXIF tampering, etc.
  reusedPhotoScore: int("reused_photo_score"),
  documentConsistencyScore: int("document_consistency_score"),
  
  // Additional patterns
  stagedAccidentScore: int("staged_accident_score"),
  geographicRiskScore: int("geographic_risk_score"),
  temporalAnomalyScore: int("temporal_anomaly_score"),
  
  // Fraud indicators summary (JSON)
  detectedPatterns: text("detected_patterns"), // JSON array of detected pattern names
  fraudEvidence: text("fraud_evidence"), // JSON array of evidence descriptions
  
  // Investigation status
  requiresInvestigation: tinyint("requires_investigation").default(0).notNull(),
  investigationPriority: mysqlEnum("investigation_priority", ["low", "medium", "high", "urgent"]),
  investigationStatus: mysqlEnum("investigation_status", ["pending", "in_progress", "completed", "closed"]).default("pending"),
  investigationNotes: text("investigation_notes"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type FraudIndicator = typeof fraudIndicators.$inferSelect;
export type InsertFraudIndicator = typeof fraudIndicators.$inferInsert;

/**
 * Claimant History - Track all claims by each claimant across time
 * Used for pattern detection and fraud scoring
 */
export const claimantHistory = mysqlTable("claimant_history", {
  id: int("id").autoincrement().primaryKey(),
  claimantId: int("claimant_id").notNull(),
  claimantEmail: varchar("claimant_email", { length: 320 }),
  claimantPhone: varchar("claimant_phone", { length: 20 }),
  
  // Claim statistics
  totalClaims: int("total_claims").default(0).notNull(),
  approvedClaims: int("approved_claims").default(0),
  rejectedClaims: int("rejected_claims").default(0),
  fraudulentClaims: int("fraudulent_claims").default(0),
  
  totalClaimAmount: int("total_claim_amount").default(0), // In cents
  averageClaimAmount: int("average_claim_amount").default(0),
  
  // Temporal patterns
  firstClaimDate: timestamp("first_claim_date"),
  lastClaimDate: timestamp("last_claim_date"),
  claimFrequency: int("claim_frequency"), // Claims per year
  
  // Vehicle patterns
  uniqueVehiclesCount: int("unique_vehicles_count").default(0),
  nonOwnerAccidentCount: int("non_owner_accident_count").default(0),
  
  // Insurer patterns
  insurerChangeCount: int("insurer_change_count").default(0),
  currentInsurer: varchar("current_insurer", { length: 255 }),
  previousInsurers: text("previous_insurers"), // JSON array
  
  // Geographic patterns
  accidentLocations: text("accident_locations"), // JSON array of locations
  highRiskAreaCount: int("high_risk_area_count").default(0),
  
  // Risk assessment
  riskScore: int("risk_score").default(0), // 0-100
  riskLevel: mysqlEnum("risk_level", ["low", "medium", "high", "critical"]).default("low"),
  
  // Flags
  isHighRiskClient: tinyint("is_high_risk_client").default(0),
  isFraudster: tinyint("is_fraudster").default(0),
  isBlacklisted: tinyint("is_blacklisted").default(0),
  
  notes: text("notes"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type ClaimantHistory = typeof claimantHistory.$inferSelect;
export type InsertClaimantHistory = typeof claimantHistory.$inferInsert;

/**
 * Vehicle History - Track vehicle-related fraud patterns
 */
export const vehicleHistory = mysqlTable("vehicle_history", {
  id: int("id").autoincrement().primaryKey(),
  vehicleRegistration: varchar("vehicle_registration", { length: 50 }).notNull().unique(),
  
  // Vehicle details
  vehicleMake: varchar("vehicle_make", { length: 100 }),
  vehicleModel: varchar("vehicle_model", { length: 100 }),
  vehicleYear: int("vehicle_year"),
  vin: varchar("vin", { length: 17 }),
  
  // Ownership tracking
  currentOwnerId: int("current_owner_id"),
  ownershipChangeCount: int("ownership_change_count").default(0),
  ownershipHistory: text("ownership_history"), // JSON array
  
  // Claim history
  totalClaims: int("total_claims").default(0),
  totalClaimAmount: int("total_claim_amount").default(0),
  lastClaimDate: timestamp("last_claim_date"),
  
  // Fraud indicators
  hasPreExistingDamage: tinyint("has_pre_existing_damage").default(0),
  isSalvageTitle: tinyint("is_salvage_title").default(0),
  hasOdometerFraud: tinyint("has_odometer_fraud").default(0),
  isStolen: tinyint("is_stolen").default(0),
  
  // Driver patterns
  uniqueDriversCount: int("unique_drivers_count").default(0),
  nonOwnerAccidentCount: int("non_owner_accident_count").default(0),
  driverHistory: text("driver_history"), // JSON array
  
  riskScore: int("risk_score").default(0),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type VehicleHistory = typeof vehicleHistory.$inferSelect;
export type InsertVehicleHistory = typeof vehicleHistory.$inferInsert;

/**
 * Entity Relationships - Track connections between entities for collusion detection
 */
export const entityRelationships = mysqlTable("entity_relationships", {
  id: int("id").autoincrement().primaryKey(),
  
  // Entity A
  entityAType: varchar("entity_a_type", { length: 50 }).notNull(), // claimant, assessor, panel_beater
  entityAId: int("entity_a_id").notNull(),
  entityAName: varchar("entity_a_name", { length: 255 }),
  
  // Entity B
  entityBType: varchar("entity_b_type", { length: 50 }).notNull(),
  entityBId: int("entity_b_id").notNull(),
  entityBName: varchar("entity_b_name", { length: 255 }),
  
  // Relationship details
  relationshipType: mysqlEnum("relationship_type", [
    "shared_address",
    "shared_phone",
    "shared_email",
    "shared_bank_account",
    "family_relation",
    "business_relation",
    "frequent_interaction",
    "social_media_connection",
    "employment_relation",
    "suspicious_pattern"
  ]).notNull(),
  
  relationshipStrength: int("relationship_strength").default(0), // 0-100
  
  // Interaction statistics
  interactionCount: int("interaction_count").default(0),
  firstInteractionDate: timestamp("first_interaction_date"),
  lastInteractionDate: timestamp("last_interaction_date"),
  
  // Fraud indicators
  isCollusionSuspected: tinyint("is_collusion_suspected").default(0),
  collusionScore: int("collusion_score").default(0),
  collusionEvidence: text("collusion_evidence"), // JSON array
  
  // Investigation
  investigationStatus: mysqlEnum("investigation_status", ["none", "pending", "in_progress", "confirmed", "cleared"]).default("none"),
  investigationNotes: text("investigation_notes"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type EntityRelationship = typeof entityRelationships.$inferSelect;
export type InsertEntityRelationship = typeof entityRelationships.$inferInsert;

/**
 * Fraud Rules - Configurable fraud detection rules
 */
export const fraudRules = mysqlTable("fraud_rules", {
  id: int("id").autoincrement().primaryKey(),
  
  ruleName: varchar("rule_name", { length: 255 }).notNull().unique(),
  ruleDescription: text("rule_description"),
  ruleCategory: mysqlEnum("rule_category", [
    "claimant",
    "panel_beater",
    "assessor",
    "vehicle",
    "document",
    "temporal",
    "geographic",
    "network"
  ]).notNull(),
  
  // Rule configuration
  isActive: tinyint("is_active").default(1).notNull(),
  severity: mysqlEnum("severity", ["low", "medium", "high", "critical"]).notNull(),
  scoreWeight: int("score_weight").default(10).notNull(), // 1-100
  
  // Threshold configuration
  thresholdValue: int("threshold_value"), // Numeric threshold for rule trigger
  thresholdUnit: varchar("threshold_unit", { length: 50 }), // days, percentage, count, etc.
  
  // Rule logic (JSON configuration)
  ruleLogic: text("rule_logic"), // JSON object defining rule conditions
  
  // Actions
  autoFlag: tinyint("auto_flag").default(1),
  requiresManualReview: tinyint("requires_manual_review").default(0),
  notifyInvestigator: tinyint("notify_investigator").default(0),
  
  // Statistics
  timesTriggered: int("times_triggered").default(0),
  truePositiveCount: int("true_positive_count").default(0),
  falsePositiveCount: int("false_positive_count").default(0),
  accuracy: int("accuracy").default(0), // Percentage
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type FraudRule = typeof fraudRules.$inferSelect;
export type InsertFraudRule = typeof fraudRules.$inferInsert;

/**
 * Fraud Alerts - Real-time fraud alerts triggered by detection system
 */
export const fraudAlerts = mysqlTable("fraud_alerts", {
  id: int("id").autoincrement().primaryKey(),
  claimId: int("claim_id").notNull(),
  
  // Alert details
  alertType: varchar("alert_type", { length: 100 }).notNull(),
  alertSeverity: mysqlEnum("alert_severity", ["low", "medium", "high", "critical"]).notNull(),
  alertTitle: varchar("alert_title", { length: 255 }).notNull(),
  alertDescription: text("alert_description").notNull(),
  
  // Triggered rule
  triggeredRuleId: int("triggered_rule_id"),
  triggeredRuleName: varchar("triggered_rule_name", { length: 255 }),
  
  // Related entities
  relatedEntityType: varchar("related_entity_type", { length: 50 }),
  relatedEntityId: int("related_entity_id"),
  
  // Alert data
  alertData: text("alert_data"), // JSON object with detailed alert information
  fraudScore: int("fraud_score"), // 0-100
  
  // Status
  status: mysqlEnum("status", ["new", "acknowledged", "investigating", "resolved", "false_alarm"]).default("new").notNull(),
  assignedTo: int("assigned_to"), // User ID of investigator
  
  // Resolution
  resolutionNotes: text("resolution_notes"),
  resolutionDate: timestamp("resolution_date"),
  isFraudConfirmed: tinyint("is_fraud_confirmed"),
  
  // Actions taken
  actionsTaken: text("actions_taken"), // JSON array
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type FraudAlert = typeof fraudAlerts.$inferSelect;
export type InsertFraudAlert = typeof fraudAlerts.$inferInsert;
