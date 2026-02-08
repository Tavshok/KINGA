import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, tinyint, decimal } from "drizzle-orm/mysql-core";

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
  passwordHash: varchar("password_hash", { length: 255 }), // For traditional email/password auth
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin", "insurer", "assessor", "panel_beater", "claimant"]).default("user").notNull(),
  organizationId: int("organization_id"), // Link to organizations table for team members
  emailVerified: tinyint("email_verified").default(0).notNull(), // Email verification status
  
  // Assessor tier system (for freemium model)
  assessorTier: mysqlEnum("assessor_tier", ["free", "premium", "enterprise"]).default("free"),
  tierActivatedAt: timestamp("tier_activated_at"), // When premium/enterprise was activated
  tierExpiresAt: timestamp("tier_expires_at"), // For manual billing, track expiration
  
  // Assessor performance metrics
  performanceScore: int("performance_score").default(70), // 0-100 scale, default 70
  totalAssessmentsCompleted: int("total_assessments_completed").default(0),
  averageVarianceFromFinal: int("average_variance_from_final"), // Percentage variance from final approved cost
  
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
  
  // Total loss detection
  totalLossIndicated: tinyint("total_loss_indicated").default(0), // Boolean flag for total loss
  structuralDamageSeverity: mysqlEnum("structural_damage_severity", ["none", "minor", "moderate", "severe", "catastrophic"]).default("none"),
  estimatedVehicleValue: int("estimated_vehicle_value"), // Vehicle market value in cents
  repairToValueRatio: int("repair_to_value_ratio"), // Percentage (0-100+)
  totalLossReasoning: text("total_loss_reasoning"), // Explanation for total loss determination
   damagedComponentsJson: text("damaged_components_json"), // Full component list with severity
  physicsAnalysis: text("physics_analysis"), // Physics-based accident analysis JSONrity
  
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
  laborHours: int("labor_hours"), // Estimated labor hours required for repairs
  
  // Quote breakdown
  itemizedBreakdown: text("itemized_breakdown"), // JSON array of line items with component details
  notes: text("notes"),
  
  // Component-level details for cost optimization
  componentsJson: text("components_json"), // Detailed component breakdown with parts quality, action (repair/replace), warranty
  partsQuality: mysqlEnum("parts_quality", ["aftermarket", "oem", "genuine", "used"]).default("aftermarket"),
  warrantyMonths: int("warranty_months").default(12),
  
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

/**
 * Quote Line Items - Detailed breakdown of repair quotes
 * Captures itemized parts, labor, and costs for comprehensive quote analysis
 */
export const quoteLineItems = mysqlTable("quote_line_items", {
  id: int("id").autoincrement().primaryKey(),
  quoteId: int("quote_id").notNull(), // Reference to panel_beater_quotes
  
  // Line item details
  itemNumber: int("item_number"), // Sequential number in quote
  description: varchar("description", { length: 500 }).notNull(),
  partNumber: varchar("part_number", { length: 100 }),
  
  // Categorization
  category: mysqlEnum("category", ["parts", "labor", "paint", "diagnostic", "sundries", "other"]).notNull(),
  
  // Pricing
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  lineTotal: decimal("line_total", { precision: 10, scale: 2 }).notNull(),
  
  // VAT handling
  vatRate: decimal("vat_rate", { precision: 5, scale: 2 }).default("15.00"), // Zimbabwe VAT is 15%
  vatAmount: decimal("vat_amount", { precision: 10, scale: 2 }),
  totalWithVat: decimal("total_with_vat", { precision: 10, scale: 2 }),
  
  // Repair vs replacement
  isRepair: tinyint("is_repair").default(0),
  isReplacement: tinyint("is_replacement").default(1),
  
  // Betterment calculation
  bettermentAmount: decimal("betterment_amount", { precision: 10, scale: 2 }),
  netCost: decimal("net_cost", { precision: 10, scale: 2 }), // After betterment deduction
  
  // Fraud detection flags
  isPriceInflated: tinyint("is_price_inflated").default(0),
  isUnrelatedDamage: tinyint("is_unrelated_damage").default(0),
  isMissingInOtherQuotes: tinyint("is_missing_in_other_quotes").default(0),
  
  notes: text("notes"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type QuoteLineItem = typeof quoteLineItems.$inferSelect;
export type InsertQuoteLineItem = typeof quoteLineItems.$inferInsert;

/**
 * Third Party Vehicles - Vehicles involved in multi-vehicle accidents
 * Captures details of non-insured vehicles for liability claims
 */
export const thirdPartyVehicles = mysqlTable("third_party_vehicles", {
  id: int("id").autoincrement().primaryKey(),
  claimId: int("claim_id").notNull(), // Reference to main claim
  
  // Vehicle details
  make: varchar("make", { length: 100 }),
  model: varchar("model", { length: 100 }),
  year: int("year"),
  registration: varchar("registration", { length: 50 }),
  vin: varchar("vin", { length: 17 }),
  color: varchar("color", { length: 50 }),
  
  // Owner/driver details
  ownerName: varchar("owner_name", { length: 200 }),
  ownerContact: varchar("owner_contact", { length: 100 }),
  ownerAddress: text("owner_address"),
  driverName: varchar("driver_name", { length: 200 }),
  driverLicense: varchar("driver_license", { length: 100 }),
  
  // Insurance details
  insuranceCompany: varchar("insurance_company", { length: 200 }),
  policyNumber: varchar("policy_number", { length: 100 }),
  
  // Damage assessment
  damageDescription: text("damage_description"),
  damagePhotos: text("damage_photos"), // JSON array of S3 URLs
  estimatedRepairCost: int("estimated_repair_cost"), // In cents
  
  // Valuation
  marketValue: int("market_value"), // In cents
  marketValueSource: varchar("market_value_source", { length: 255 }), // e.g., "Facebook Marketplace", "AutoTrader SA"
  marketValueConfidence: mysqlEnum("market_value_confidence", ["low", "medium", "high"]),
  
  // Liability
  liabilityPercentage: int("liability_percentage").default(0), // 0-100, percentage of fault
  compensationAmount: int("compensation_amount"), // Final compensation in cents
  compensationType: mysqlEnum("compensation_type", ["repair", "cash", "total_loss"]),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type ThirdPartyVehicle = typeof thirdPartyVehicles.$inferSelect;
export type InsertThirdPartyVehicle = typeof thirdPartyVehicles.$inferInsert;

/**
 * Vehicle Market Valuations - Market value assessments for vehicles
 * Supports multi-source pricing for accurate total loss and betterment calculations
 */
export const vehicleMarketValuations = mysqlTable("vehicle_market_valuations", {
  id: int("id").autoincrement().primaryKey(),
  claimId: int("claim_id").notNull(),
  
  // Vehicle identification
  vehicleMake: varchar("vehicle_make", { length: 100 }).notNull(),
  vehicleModel: varchar("vehicle_model", { length: 100 }).notNull(),
  vehicleYear: int("vehicle_year").notNull(),
  vehicleRegistration: varchar("vehicle_registration", { length: 50 }),
  mileage: int("mileage"), // Odometer reading
  condition: mysqlEnum("condition", ["excellent", "good", "fair", "poor"]),
  
  // Market value assessment
  estimatedMarketValue: int("estimated_market_value").notNull(), // In cents
  valuationMethod: mysqlEnum("valuation_method", [
    "facebook_marketplace",
    "classifieds",
    "autotrader_sa",
    "historical_claims",
    "manual_assessor",
    "ai_estimation",
    "hybrid"
  ]).notNull(),
  
  // Data sources (JSON array of price points)
  facebookPrices: text("facebook_prices"), // JSON: [{price, listing_url, date}]
  classifiedsPrices: text("classifieds_prices"),
  autotraderSaPrices: text("autotrader_sa_prices"),
  
  // SA import calculation (if applicable)
  saBasePrice: int("sa_base_price"), // In cents
  importDutyPercent: decimal("import_duty_percent", { precision: 5, scale: 2 }),
  importDutyAmount: int("import_duty_amount"),
  transportCost: int("transport_cost"),
  totalImportCost: int("total_import_cost"),
  
  // Confidence scoring
  confidenceScore: int("confidence_score"), // 0-100
  dataPointsCount: int("data_points_count"), // Number of comparable listings found
  priceRange: text("price_range"), // JSON: {min, max, median, average}
  
  // Adjustments
  conditionAdjustment: int("condition_adjustment"), // +/- cents based on condition
  mileageAdjustment: int("mileage_adjustment"),
  marketTrendAdjustment: int("market_trend_adjustment"),
  finalAdjustedValue: int("final_adjusted_value"),
  
  // Total loss determination
  isTotalLoss: tinyint("is_total_loss").default(0),
  totalLossThreshold: decimal("total_loss_threshold", { precision: 5, scale: 2 }).default("60.00"), // Percentage
  repairCostToValueRatio: decimal("repair_cost_to_value_ratio", { precision: 5, scale: 2 }),
  
  // Assessor override
  assessorOverride: tinyint("assessor_override").default(0),
  assessorValue: int("assessor_value"),
  assessorJustification: text("assessor_justification"),
  
  // Metadata
  valuationDate: timestamp("valuation_date").defaultNow().notNull(),
  validUntil: timestamp("valid_until"), // Valuation expires after 30 days
  valuedBy: int("valued_by"), // User ID of assessor/system
  
  notes: text("notes"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type VehicleMarketValuation = typeof vehicleMarketValuations.$inferSelect;
export type InsertVehicleMarketValuation = typeof vehicleMarketValuations.$inferInsert;

/**
 * Police Reports - Official police accident reports
 * Captures police documentation for cross-validation with claim details
 */
export const policeReports = mysqlTable("police_reports", {
  id: int("id").autoincrement().primaryKey(),
  claimId: int("claim_id").notNull(),
  
  // Police report details
  reportNumber: varchar("report_number", { length: 100 }).notNull(),
  policeStation: varchar("police_station", { length: 200 }),
  officerName: varchar("officer_name", { length: 200 }),
  officerBadgeNumber: varchar("officer_badge_number", { length: 100 }),
  reportDate: timestamp("report_date"),
  
  // Accident details (from police perspective)
  reportedSpeed: int("reported_speed"), // KM/H
  reportedWeather: varchar("reported_weather", { length: 100 }),
  reportedRoadCondition: varchar("reported_road_condition", { length: 100 }),
  reportedVisibility: varchar("reported_visibility", { length: 100 }),
  accidentLocation: text("accident_location"),
  accidentDescription: text("accident_description"),
  
  // Violations and citations
  violationsIssued: text("violations_issued"), // JSON array
  citationNumbers: text("citation_numbers"), // JSON array
  
  // Witnesses
  witnessStatements: text("witness_statements"), // JSON array
  witnessCount: int("witness_count").default(0),
  
  // Evidence
  policePhotos: text("police_photos"), // JSON array of S3 URLs
  accidentDiagram: varchar("accident_diagram", { length: 500 }), // S3 URL
  
  // Document upload
  reportDocumentUrl: varchar("report_document_url", { length: 500 }), // PDF of official report
  
  // Physics parameters (extracted via OCR)
  roadSurface: varchar("road_surface", { length: 100 }), // asphalt, gravel, dirt, etc.
  vehicle1Mass: int("vehicle1_mass"), // kg
  vehicle2Mass: int("vehicle2_mass"), // kg
  skidMarkLength: decimal("skid_mark_length", { precision: 10, scale: 2 }), // meters
  impactSpeed: int("impact_speed"), // km/h (calculated or estimated)
  roadGradient: decimal("road_gradient", { precision: 5, scale: 2 }), // degrees
  lightingCondition: varchar("lighting_condition", { length: 100 }),
  trafficCondition: varchar("traffic_condition", { length: 100 }),
  
  // OCR extraction metadata
  ocrExtracted: tinyint("ocr_extracted").default(0),
  ocrConfidence: int("ocr_confidence"), // 0-100
  ocrNotes: text("ocr_notes"),
  
  // Cross-validation flags
  speedDiscrepancy: int("speed_discrepancy"), // Difference between claimed and reported speed
  locationMismatch: tinyint("location_mismatch").default(0),
  weatherMismatch: tinyint("weather_mismatch").default(0),
  descriptionInconsistent: tinyint("description_inconsistent").default(0),
  
  notes: text("notes"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type PoliceReport = typeof policeReports.$inferSelect;
export type InsertPoliceReport = typeof policeReports.$inferInsert;

/**
 * Pre-Accident Damage - Documentation of existing damage before accident
 * Prevents fraudulent claims for pre-existing damage
 */
export const preAccidentDamage = mysqlTable("pre_accident_damage", {
  id: int("id").autoincrement().primaryKey(),
  claimId: int("claim_id").notNull(),
  
  // Damage details
  damageType: mysqlEnum("damage_type", [
    "rust",
    "dent",
    "scratch",
    "paint_damage",
    "mechanical",
    "glass",
    "interior",
    "other"
  ]).notNull(),
  location: varchar("location", { length: 200 }).notNull(), // e.g., "front bumper", "driver door"
  severity: mysqlEnum("severity", ["minor", "moderate", "severe"]).notNull(),
  description: text("description"),
  
  // Evidence
  photoUrl: varchar("photo_url", { length: 500 }), // S3 URL
  documentedDate: timestamp("documented_date"),
  
  // Assessment
  estimatedAge: varchar("estimated_age", { length: 100 }), // e.g., "6 months", "1-2 years"
  isRelatedToCurrentClaim: tinyint("is_related_to_current_claim").default(0),
  
  // Assessor notes
  assessorNotes: text("assessor_notes"),
  documentedBy: int("documented_by"), // User ID
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type PreAccidentDamage = typeof preAccidentDamage.$inferSelect;
export type InsertPreAccidentDamage = typeof preAccidentDamage.$inferInsert;

/**
 * Vehicle Condition Assessment - Comprehensive mechanical and safety inspection
 * Documents overall vehicle condition at time of claim
 */
export const vehicleConditionAssessment = mysqlTable("vehicle_condition_assessment", {
  id: int("id").autoincrement().primaryKey(),
  claimId: int("claim_id").notNull(),
  assessorId: int("assessor_id").notNull(),
  
  // Odometer
  speedoReading: int("speedo_reading"), // Mileage
  speedoUnit: mysqlEnum("speedo_unit", ["km", "miles"]).default("km"),
  
  // Mechanical condition
  brakesCondition: mysqlEnum("brakes_condition", ["good", "fair", "poor"]),
  brakesNotes: text("brakes_notes"),
  
  steeringCondition: mysqlEnum("steering_condition", ["good", "fair", "poor"]),
  steeringNotes: text("steering_notes"),
  
  tiresCondition: mysqlEnum("tires_condition", ["good", "fair", "poor"]),
  tireTreadDepthMm: int("tire_tread_depth_mm"),
  tiresNotes: text("tires_notes"),
  
  suspensionCondition: mysqlEnum("suspension_condition", ["good", "fair", "poor"]),
  suspensionNotes: text("suspension_notes"),
  
  // Body condition
  bodyworkCondition: mysqlEnum("bodywork_condition", ["good", "fair", "poor"]),
  bodyworkNotes: text("bodywork_notes"),
  
  paintworkCondition: mysqlEnum("paintwork_condition", ["good", "fair", "poor"]),
  paintworkNotes: text("paintwork_notes"),
  
  // Interior condition
  upholsteryCondition: mysqlEnum("upholstery_condition", ["good", "fair", "poor"]),
  upholsteryNotes: text("upholstery_notes"),
  
  // General mechanical
  generalMechanical: mysqlEnum("general_mechanical", ["good", "fair", "poor"]),
  mechanicalNotes: text("mechanical_notes"),
  
  // Accessories
  radioPresent: tinyint("radio_present").default(1),
  radioModel: varchar("radio_model", { length: 100 }),
  tokenNumber: varchar("token_number", { length: 100 }), // Radio security token
  
  // Overall assessment
  overallCondition: mysqlEnum("overall_condition", ["excellent", "good", "fair", "poor"]),
  maintenanceLevel: mysqlEnum("maintenance_level", ["well_maintained", "average", "poorly_maintained"]),
  
  // Contributory negligence flags
  hasContributoryNegligence: tinyint("has_contributory_negligence").default(0),
  negligenceDescription: text("negligence_description"),
  
  // Photos
  conditionPhotos: text("condition_photos"), // JSON array of S3 URLs
  
  // Assessment metadata
  assessmentDate: timestamp("assessment_date").defaultNow().notNull(),
  assessorSignature: varchar("assessor_signature", { length: 500 }), // Digital signature URL
  
  notes: text("notes"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type VehicleConditionAssessment = typeof vehicleConditionAssessment.$inferSelect;
export type InsertVehicleConditionAssessment = typeof vehicleConditionAssessment.$inferInsert;

/**
 * Approval Workflow - Multi-level approval process for claims
 * Implements three-tier approval: Assessor → Risk Surveyor → Risk Manager
 */
export const approvalWorkflow = mysqlTable("approval_workflow", {
  id: int("id").autoincrement().primaryKey(),
  claimId: int("claim_id").notNull(),
  
  // Approval level
  level: mysqlEnum("level", ["assessor", "risk_surveyor", "risk_manager"]).notNull(),
  levelOrder: int("level_order").notNull(), // 1, 2, 3
  
  // Approver details
  approverId: int("approver_id"), // User ID
  approverName: varchar("approver_name", { length: 200 }),
  approverRole: varchar("approver_role", { length: 100 }),
  
  // Approval status
  status: mysqlEnum("status", ["pending", "approved", "rejected", "returned"]).default("pending").notNull(),
  
  // Decision details
  approvedAmount: int("approved_amount"), // In cents
  comments: text("comments"),
  conditions: text("conditions"), // JSON array of approval conditions
  
  // Rejection/return details
  rejectionReason: text("rejection_reason"),
  returnReason: text("return_reason"),
  returnToLevel: mysqlEnum("return_to_level", ["assessor", "risk_surveyor"]),
  
  // Timestamps
  submittedAt: timestamp("submitted_at"),
  reviewedAt: timestamp("reviewed_at"),
  approvalDate: timestamp("approval_date"),
  
  // Escalation
  isEscalated: tinyint("is_escalated").default(0),
  escalationReason: text("escalation_reason"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type ApprovalWorkflow = typeof approvalWorkflow.$inferSelect;
export type InsertApprovalWorkflow = typeof approvalWorkflow.$inferInsert;

/**
 * Organizations - Insurance companies and their teams
 */
export const organizations = mysqlTable("organizations", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  businessName: varchar("business_name", { length: 200 }),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 20 }),
  address: text("address"),
  city: varchar("city", { length: 100 }),
  country: varchar("country", { length: 100 }).default("Zimbabwe"),
  
  // Organization type
  type: mysqlEnum("type", ["insurer", "broker", "tpa"]).default("insurer").notNull(), // TPA = Third Party Administrator
  
  // Owner/Admin
  ownerId: int("owner_id").notNull(), // User ID of organization owner
  
  // Status
  active: tinyint("active").default(1).notNull(),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type Organization = typeof organizations.$inferSelect;
export type InsertOrganization = typeof organizations.$inferInsert;

/**
 * User Invitations - Team member invitations for organizations
 */
export const userInvitations = mysqlTable("user_invitations", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organization_id").notNull(),
  
  // Invitee details
  email: varchar("email", { length: 320 }).notNull(),
  role: mysqlEnum("role", ["insurer", "assessor"]).notNull(), // Role to assign when accepted
  
  // Invitation details
  invitedBy: int("invited_by").notNull(), // User ID of inviter
  invitationToken: varchar("invitation_token", { length: 64 }).notNull().unique(),
  
  // Status
  status: mysqlEnum("status", ["pending", "accepted", "expired", "cancelled"]).default("pending").notNull(),
  
  // Acceptance
  acceptedAt: timestamp("accepted_at"),
  acceptedUserId: int("accepted_user_id"), // User ID created when invitation accepted
  
  // Expiration
  expiresAt: timestamp("expires_at").notNull(), // Invitations expire after 7 days
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type UserInvitation = typeof userInvitations.$inferSelect;
export type InsertUserInvitation = typeof userInvitations.$inferInsert;

/**
 * Registration Requests - Pending registrations for panel beaters and assessors
 */
export const registrationRequests = mysqlTable("registration_requests", {
  id: int("id").autoincrement().primaryKey(),
  
  // Applicant details
  name: varchar("name", { length: 200 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  phone: varchar("phone", { length: 20 }),
  
  // Registration type
  role: mysqlEnum("role", ["panel_beater", "assessor"]).notNull(),
  
  // Panel beater specific
  businessName: varchar("business_name", { length: 200 }),
  address: text("address"),
  city: varchar("city", { length: 100 }),
  
  // Assessor specific
  licenseNumber: varchar("license_number", { length: 100 }),
  yearsExperience: int("years_experience"),
  specializations: text("specializations"), // JSON array
  
  // Supporting documents (S3 URLs)
  documentsJson: text("documents_json"), // JSON array of document URLs
  
  // Status
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).default("pending").notNull(),
  
  // Review
  reviewedBy: int("reviewed_by"), // Admin user ID
  reviewedAt: timestamp("reviewed_at"),
  reviewNotes: text("review_notes"),
  
  // Created user
  createdUserId: int("created_user_id"), // User ID created when approved
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type RegistrationRequest = typeof registrationRequests.$inferSelect;
export type InsertRegistrationRequest = typeof registrationRequests.$inferInsert;

/**
 * Email Verification Tokens - For email verification and password reset
 */
export const emailVerificationTokens = mysqlTable("email_verification_tokens", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  token: varchar("token", { length: 64 }).notNull().unique(),
  type: mysqlEnum("type", ["verification", "password_reset"]).notNull(),
  
  // Status
  used: tinyint("used").default(0).notNull(),
  usedAt: timestamp("used_at"),
  
  // Expiration
  expiresAt: timestamp("expires_at").notNull(),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type EmailVerificationToken = typeof emailVerificationTokens.$inferSelect;
export type InsertEmailVerificationToken = typeof emailVerificationTokens.$inferInsert;
