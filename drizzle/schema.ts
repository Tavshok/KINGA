import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, tinyint, decimal, json, date, time, longtext, index, bigint, boolean } from "drizzle-orm/mysql-core";

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
  insurerRole: mysqlEnum("insurer_role", ["claims_processor", "internal_assessor", "risk_manager", "claims_manager", "executive"]), // Hierarchical roles for insurer users
  organizationId: int("organization_id"), // Link to organizations table for team members
  tenantId: varchar("tenant_id", { length: 64 }), // Link to tenants table for multi-tenant isolation
  emailVerified: tinyint("email_verified").default(0).notNull(), // Email verification status
  
  // Assessor tier system (for freemium model)
  assessorTier: mysqlEnum("assessor_tier", ["free", "premium", "enterprise"]).default("free"),
  tierActivatedAt: timestamp("tier_activated_at"), // When premium/enterprise was activated
  tierExpiresAt: timestamp("tier_expires_at"), // For manual billing, track expiration
  
  // Assessor performance metrics
  performanceScore: int("performance_score").default(70), // 0-100 scale, default 70
  totalAssessmentsCompleted: int("total_assessments_completed").default(0),
  averageVarianceFromFinal: int("average_variance_from_final"), // Percentage variance from final approved cost
  accuracyScore: decimal("accuracy_score", { precision: 5, scale: 2 }).default("0.00"), // Accuracy percentage
  avgCompletionTime: decimal("avg_completion_time", { precision: 6, scale: 2 }).default("0.00"), // Average hours to complete
  
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
  tenantId: varchar("tenant_id", { length: 255 }), // Multi-tenant isolation
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
  tenantId: varchar("tenant_id", { length: 255 }), // Multi-tenant isolation
  
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
  
  // Workflow state machine
  workflowState: mysqlEnum("workflow_state", [
    "created",
    "assigned",
    "under_assessment",
    "internal_review",
    "technical_approval",
    "financial_decision",
    "payment_authorized",
    "closed",
    "disputed"
  ]),
  
  // Approval tracking
  technicallyApprovedBy: int("technically_approved_by"), // Risk Manager user ID
  technicallyApprovedAt: timestamp("technically_approved_at"),
  financiallyApprovedBy: int("financially_approved_by"), // Claims Manager user ID
  financiallyApprovedAt: timestamp("financially_approved_at"),
  approvedAmount: int("approved_amount"), // Final approved amount in cents
  closedBy: int("closed_by"), // Claims Manager user ID
  closedAt: timestamp("closed_at"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type Claim = typeof claims.$inferSelect;
export type InsertClaim = typeof claims.$inferInsert;

/**
 * Claim Comments - Workflow collaboration and annotations
 */
export const claimComments = mysqlTable("claim_comments", {
  id: int("id").autoincrement().primaryKey(),
  claimId: int("claim_id").notNull(),
  userId: int("user_id").notNull(),
  userRole: text("user_role").notNull(), // Role at time of comment (for audit trail)
  
  commentType: mysqlEnum("comment_type", [
    "general",
    "flag",
    "clarification_request",
    "technical_note"
  ]).notNull(),
  
  content: text("content").notNull(),
  
    tenantId: varchar("tenant_id", { length: 255 }), // Multi-tenant isolation
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ClaimComment = typeof claimComments.$inferSelect;
export type InsertClaimComment = typeof claimComments.$inferInsert;

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
  physicsAnalysis: text("physics_analysis"), // Physics-based accident analysis JSON
  graphUrls: text("graph_urls"), // Generated visualization graph URLs (JSON)
  
  // AI model details
  modelVersion: varchar("model_version", { length: 50 }),
  processingTime: int("processing_time"), // milliseconds
  
  tenantId: varchar("tenant_id", { length: 255 }), // Multi-tenant isolation
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
  
    tenantId: varchar("tenant_id", { length: 255 }), // Multi-tenant isolation
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
  
    tenantId: varchar("tenant_id", { length: 255 }), // Multi-tenant isolation
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
  
    tenantId: varchar("tenant_id", { length: 255 }), // Multi-tenant isolation
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
  
    tenantId: varchar("tenant_id", { length: 255 }), // Multi-tenant isolation
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

/**
 * Tenants - Multi-tenant isolation for insurers
 */
export const tenants = mysqlTable("tenants", {
  id: varchar("id", { length: 64 }).primaryKey(), // tenant-{uuid}
  name: varchar("name", { length: 255 }).notNull(),
  displayName: varchar("display_name", { length: 255 }).notNull(),
  
  // Tier and status
  tier: mysqlEnum("tier", ["tier-basic", "tier-professional", "tier-enterprise"]).default("tier-basic").notNull(),
  status: mysqlEnum("status", ["active", "inactive", "suspended"]).default("active").notNull(),
  
  // Encryption
  encryptionKeyId: varchar("encryption_key_id", { length: 255 }), // KMS key ID for tenant-specific encryption
  
  // Contact information
  contactName: varchar("contact_name", { length: 255 }),
  contactEmail: varchar("contact_email", { length: 320 }),
  contactPhone: varchar("contact_phone", { length: 20 }),
  
  // Billing
  billingEmail: varchar("billing_email", { length: 320 }),
  
  // Configuration
  configJson: text("config_json"), // JSON object for tenant-specific configuration
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  activatedAt: timestamp("activated_at"),
  suspendedAt: timestamp("suspended_at"),
});

export type Tenant = typeof tenants.$inferSelect;
export type InsertTenant = typeof tenants.$inferInsert;

/**
 * Assessors - Professional assessors with classification system
 * Supports insurer-owned, marketplace, and hybrid assessors
 */
export const assessors = mysqlTable("assessors", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull().unique(), // Links to users table
  professionalLicenseNumber: varchar("professional_license_number", { length: 100 }).notNull().unique(),
  licenseExpiryDate: timestamp("license_expiry_date").notNull(),
  
  // Assessor classification
  assessorType: mysqlEnum("assessor_type", ["insurer_owned", "marketplace", "hybrid"]).notNull(),
  primaryTenantId: varchar("primary_tenant_id", { length: 64 }), // For insurer-owned and hybrid assessors
  marketplaceEnabled: tinyint("marketplace_enabled").default(0).notNull(), // Can accept marketplace assignments
  
  // Marketplace profile
  marketplaceStatus: mysqlEnum("marketplace_status", ["pending_approval", "active", "suspended", "inactive"]).default("pending_approval"),
  marketplaceOnboardedAt: timestamp("marketplace_onboarded_at"),
  marketplaceBio: text("marketplace_bio"), // Public profile description
  marketplaceHourlyRate: decimal("marketplace_hourly_rate", { precision: 10, scale: 2 }), // Suggested rate for marketplace
  marketplaceAvailability: mysqlEnum("marketplace_availability", ["full_time", "part_time", "weekends_only", "on_demand"]).default("on_demand"),
  
  // Specializations and certifications
  specializations: text("specializations"), // JSON array: ["vehicle", "property", "marine"]
  certifications: text("certifications"), // JSON array: ["IICRC", "ASE", "I-CAR"]
  certificationLevel: mysqlEnum("certification_level", ["junior", "senior", "expert", "master"]).notNull(),
  yearsOfExperience: int("years_of_experience"),
  
  // Geographic coverage
  serviceRegions: text("service_regions"), // JSON array: ["Harare", "Bulawayo"]
  maxTravelDistanceKm: int("max_travel_distance_km").default(50),
  
  // Performance metrics (unified across all types)
  activeStatus: tinyint("active_status").default(1).notNull(),
  performanceScore: decimal("performance_score", { precision: 5, scale: 2 }), // 0.00 to 100.00
  totalAssessmentsCompleted: int("total_assessments_completed").default(0),
  averageAccuracyScore: decimal("average_accuracy_score", { precision: 5, scale: 2 }), // Compared to AI baseline
  averageTurnaroundHours: decimal("average_turnaround_hours", { precision: 8, scale: 2 }),
  averageRating: decimal("average_rating", { precision: 3, scale: 2 }), // 0.00 to 5.00 (marketplace ratings)
  totalRatingsCount: int("total_ratings_count").default(0),
  
  // Marketplace earnings (for marketplace and hybrid assessors)
  totalMarketplaceEarnings: decimal("total_marketplace_earnings", { precision: 12, scale: 2 }).default("0.00"),
  pendingPayout: decimal("pending_payout", { precision: 12, scale: 2 }).default("0.00"),
  lastPayoutDate: timestamp("last_payout_date"),
  
  // Compliance and verification
  backgroundCheckStatus: mysqlEnum("background_check_status", ["pending", "passed", "failed"]).default("pending"),
  backgroundCheckDate: timestamp("background_check_date"),
  insuranceVerified: tinyint("insurance_verified").default(0), // Professional indemnity insurance
  insuranceExpiryDate: timestamp("insurance_expiry_date"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type Assessor = typeof assessors.$inferSelect;
export type InsertAssessor = typeof assessors.$inferInsert;

/**
 * Assessor-Insurer Relationships
 * Tracks relationships between assessors and insurers (both BYOA and marketplace)
 */
export const assessorInsurerRelationships = mysqlTable("assessor_insurer_relationships", {
  id: int("id").autoincrement().primaryKey(),
  assessorId: int("assessor_id").notNull(),
  tenantId: varchar("tenant_id", { length: 64 }).notNull(),
  
  // Relationship type
  relationshipType: mysqlEnum("relationship_type", ["insurer_owned", "marketplace_contract", "preferred_vendor"]).notNull(),
  relationshipStatus: mysqlEnum("relationship_status", ["active", "suspended", "terminated"]).default("active"),
  
  // Contract details
  contractStartDate: timestamp("contract_start_date").notNull(),
  contractEndDate: timestamp("contract_end_date"),
  contractedRatePerAssessment: decimal("contracted_rate_per_assessment", { precision: 10, scale: 2 }), // For insurer-owned assessors
  marketplaceCommissionRate: decimal("marketplace_commission_rate", { precision: 5, scale: 2 }), // For marketplace assessors (e.g., 15.00 = 15%)
  
  // Performance tracking (tenant-specific)
  performanceRating: decimal("performance_rating", { precision: 3, scale: 2 }), // Insurer-specific rating 0.00 to 5.00
  totalAssignmentsCompleted: int("total_assignments_completed").default(0),
  totalAssignmentsRejected: int("total_assignments_rejected").default(0),
  averageCompletionTimeHours: decimal("average_completion_time_hours", { precision: 8, scale: 2 }),
  
  // Preferred vendor status (for marketplace assessors)
  isPreferredVendor: tinyint("is_preferred_vendor").default(0),
  preferredVendorSince: timestamp("preferred_vendor_since"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type AssessorInsurerRelationship = typeof assessorInsurerRelationships.$inferSelect;
export type InsertAssessorInsurerRelationship = typeof assessorInsurerRelationships.$inferInsert;

/**
 * Marketplace Assessor Reviews
 * Ratings and reviews for marketplace assessors
 */
export const assessorMarketplaceReviews = mysqlTable("assessor_marketplace_reviews", {
  id: int("id").autoincrement().primaryKey(),
  assessorId: int("assessor_id").notNull(),
  claimId: int("claim_id").notNull(),
  tenantId: varchar("tenant_id", { length: 64 }).notNull(),
  reviewerUserId: int("reviewer_user_id").notNull(), // Insurer user who left review
  
  // Rating (1-5 stars)
  overallRating: int("overall_rating").notNull(), // 1-5
  accuracyRating: int("accuracy_rating"), // 1-5
  professionalismRating: int("professionalism_rating"), // 1-5
  timelinessRating: int("timeliness_rating"), // 1-5
  communicationRating: int("communication_rating"), // 1-5
  
  // Review content
  reviewText: text("review_text"),
  wouldHireAgain: tinyint("would_hire_again"),
  
  // Metadata
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type AssessorMarketplaceReview = typeof assessorMarketplaceReviews.$inferSelect;
export type InsertAssessorMarketplaceReview = typeof assessorMarketplaceReviews.$inferInsert;

/**
 * Marketplace Transactions
 * Tracks commission and payouts for marketplace assessments
 */
export const marketplaceTransactions = mysqlTable("marketplace_transactions", {
  id: int("id").autoincrement().primaryKey(),
  assignmentId: int("assignment_id").notNull(), // Links to assessor_claim_assignments (to be added)
  assessorId: int("assessor_id").notNull(),
  tenantId: varchar("tenant_id", { length: 64 }).notNull(),
  claimId: int("claim_id").notNull(),
  
  // Financial details
  assessmentFee: decimal("assessment_fee", { precision: 10, scale: 2 }).notNull(), // Total fee charged to insurer
  kingaCommission: decimal("kinga_commission", { precision: 10, scale: 2 }).notNull(), // KINGA's commission
  assessorPayout: decimal("assessor_payout", { precision: 10, scale: 2 }).notNull(), // Assessor's net earnings
  commissionRate: decimal("commission_rate", { precision: 5, scale: 2 }).notNull(), // Percentage (e.g., 15.00)
  
  // Transaction status
  transactionStatus: mysqlEnum("transaction_status", ["pending", "completed", "paid_out", "disputed", "refunded"]).default("pending"),
  completedAt: timestamp("completed_at"),
  paidOutAt: timestamp("paid_out_at"),
  
  // Payment details
  paymentMethod: varchar("payment_method", { length: 50 }), // "stripe", "bank_transfer", "mobile_money"
  paymentReference: varchar("payment_reference", { length: 100 }),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type MarketplaceTransaction = typeof marketplaceTransactions.$inferSelect;
export type InsertMarketplaceTransaction = typeof marketplaceTransactions.$inferInsert;


/**
 * Document Ingestion Batches
 * Tracks batches of documents uploaded for processing
 */
export const ingestionBatches = mysqlTable("ingestion_batches", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: varchar("tenant_id", { length: 64 }).notNull(),
  
  // Batch identification
  batchId: varchar("batch_id", { length: 36 }).notNull().unique(), // UUID
  batchName: varchar("batch_name", { length: 255 }),
  
  // Source tracking
  ingestionSource: mysqlEnum("ingestion_source", ["processor_upload", "bulk_batch", "api", "email", "legacy_import", "broker_upload"]).notNull(),
  ingestionChannel: mysqlEnum("ingestion_channel", ["web_ui", "api", "email", "sftp"]).notNull(),
  
  // Uploader information
  uploadedByUserId: int("uploaded_by_user_id"),
  uploadedByEmail: varchar("uploaded_by_email", { length: 320 }),
  uploadedByIpAddress: varchar("uploaded_by_ip_address", { length: 45 }),
  
  // Batch statistics
  totalDocuments: int("total_documents").default(0).notNull(),
  processedDocuments: int("processed_documents").default(0).notNull(),
  failedDocuments: int("failed_documents").default(0).notNull(),
  
  // Processing status
  status: mysqlEnum("status", ["pending", "processing", "completed", "failed"]).default("pending").notNull(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  
  // Chain of custody
  custodyChain: json("custody_chain"), // Array of custody events
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type IngestionBatch = typeof ingestionBatches.$inferSelect;
export type InsertIngestionBatch = typeof ingestionBatches.$inferInsert;

/**
 * Ingestion Documents
 * Individual documents within ingestion batches
 */
export const ingestionDocuments = mysqlTable("ingestion_documents", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: varchar("tenant_id", { length: 64 }).notNull(),
  batchId: int("batch_id").notNull(),
  
  // Document identification
  documentId: varchar("document_id", { length: 36 }).notNull().unique(), // UUID
  originalFilename: varchar("original_filename", { length: 500 }).notNull(),
  fileSizeBytes: int("file_size_bytes").notNull(),
  mimeType: varchar("mime_type", { length: 100 }).notNull(),
  
  // Storage location
  s3Bucket: varchar("s3_bucket", { length: 255 }).notNull(),
  s3Key: varchar("s3_key", { length: 1024 }).notNull(),
  s3Url: varchar("s3_url", { length: 2048 }).notNull(),
  
  // Hash verification
  sha256Hash: varchar("sha256_hash", { length: 64 }).notNull(),
  hashVerified: tinyint("hash_verified").default(0).notNull(),
  
  // Classification
  documentType: mysqlEnum("document_type", ["claim_form", "police_report", "damage_image", "repair_quote", "assessor_report", "supporting_evidence", "unknown"]),
  classificationConfidence: decimal("classification_confidence", { precision: 5, scale: 4 }), // 0.0000 to 1.0000
  classificationMethod: mysqlEnum("classification_method", ["ai_model", "rule_based", "manual_override"]),
  
  // Extraction status
  extractionStatus: mysqlEnum("extraction_status", ["pending", "processing", "completed", "failed"]).default("pending").notNull(),
  extractionStartedAt: timestamp("extraction_started_at"),
  extractionCompletedAt: timestamp("extraction_completed_at"),
  
  // Validation status
  validationStatus: mysqlEnum("validation_status", ["pending", "in_review", "approved", "rejected"]).default("pending").notNull(),
  validatedByUserId: int("validated_by_user_id"),
  validatedAt: timestamp("validated_at"),
  
  // Metadata
  pageCount: int("page_count"),
  languageDetected: varchar("language_detected", { length: 10 }), // ISO 639-1 code
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type IngestionDocument = typeof ingestionDocuments.$inferSelect;
export type InsertIngestionDocument = typeof ingestionDocuments.$inferInsert;

/**
 * Extracted Document Data
 * Structured data extracted from documents
 */
export const extractedDocumentData = mysqlTable("extracted_document_data", {
  id: int("id").autoincrement().primaryKey(),
  documentId: int("document_id").notNull(), // Foreign key to ingestion_documents
  
  // Claim identification
  policyNumber: varchar("policy_number", { length: 100 }),
  claimNumber: varchar("claim_number", { length: 100 }),
  
  // Insured information
  insuredName: varchar("insured_name", { length: 255 }),
  insuredIdNumber: varchar("insured_id_number", { length: 50 }),
  insuredPhone: varchar("insured_phone", { length: 50 }),
  insuredEmail: varchar("insured_email", { length: 320 }),
  insuredAddress: text("insured_address"),
  
  // Incident details
  incidentDate: date("incident_date"),
  incidentTime: time("incident_time"),
  incidentLocation: text("incident_location"),
  incidentDescription: text("incident_description"),
  
  // Vehicle details
  vehicleMake: varchar("vehicle_make", { length: 100 }),
  vehicleModel: varchar("vehicle_model", { length: 100 }),
  vehicleYear: int("vehicle_year"),
  vehicleVin: varchar("vehicle_vin", { length: 50 }),
  vehicleLicensePlate: varchar("vehicle_license_plate", { length: 20 }),
  vehicleMass: int("vehicle_mass"), // kg
  
  // Repair details
  repairCostEstimate: decimal("repair_cost_estimate", { precision: 10, scale: 2 }),
  repairPartsList: json("repair_parts_list"), // Array of parts
  repairLaborHours: decimal("repair_labor_hours", { precision: 6, scale: 2 }),
  repairLaborRate: decimal("repair_labor_rate", { precision: 10, scale: 2 }),
  
  // Assessor observations
  assessorName: varchar("assessor_name", { length: 255 }),
  assessorLicenseNumber: varchar("assessor_license_number", { length: 100 }),
  assessorObservations: text("assessor_observations"),
  damageSeverity: mysqlEnum("damage_severity", ["minor", "moderate", "severe", "total_loss"]),
  
  // Extraction metadata
  extractionConfidence: decimal("extraction_confidence", { precision: 5, scale: 4 }), // 0.0000 to 1.0000
  fieldsExtractedCount: int("fields_extracted_count"),
  fieldsMissingCount: int("fields_missing_count"),
  
  // Full OCR text
  fullText: longtext("full_text"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type ExtractedDocumentData = typeof extractedDocumentData.$inferSelect;
export type InsertExtractedDocumentData = typeof extractedDocumentData.$inferInsert;

// Note: claimDocuments table already exists earlier in the schema (line 350)
// It will be extended to support both traditional uploads and document ingestion pipeline


// ============================================================
// HISTORICAL CLAIM INTELLIGENCE PIPELINE TABLES
// ============================================================

/**
 * Historical Claims Master
 * Central record for each historical claim imported into the intelligence pipeline.
 * Links all documents, extracted data, ground truth, and variance analysis.
 */
export const historicalClaims = mysqlTable("historical_claims", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: varchar("tenant_id", { length: 64 }).notNull(),
  batchId: int("batch_id"), // Link to ingestion batch
  
  // Claim identification
  claimReference: varchar("claim_reference", { length: 100 }), // Original claim number from insurer
  policyNumber: varchar("policy_number", { length: 100 }),
  
  // Vehicle details (extracted)
  vehicleMake: varchar("vehicle_make", { length: 100 }),
  vehicleModel: varchar("vehicle_model", { length: 100 }),
  vehicleYear: int("vehicle_year"),
  vehicleRegistration: varchar("vehicle_registration", { length: 50 }),
  vehicleVin: varchar("vehicle_vin", { length: 50 }),
  vehicleColor: varchar("vehicle_color", { length: 50 }),
  
  // Accident details (extracted)
  incidentDate: date("incident_date"),
  incidentLocation: text("incident_location"),
  incidentDescription: text("incident_description"),
  accidentType: varchar("accident_type", { length: 100 }), // rear_end, head_on, side_impact, rollover, etc.
  estimatedSpeed: int("estimated_speed"), // km/h
  
  // Claimant details (extracted)
  claimantName: varchar("claimant_name", { length: 255 }),
  claimantIdNumber: varchar("claimant_id_number", { length: 50 }),
  claimantContact: varchar("claimant_contact", { length: 100 }),
  
  // Cost summary
  totalPanelBeaterQuote: decimal("total_panel_beater_quote", { precision: 12, scale: 2 }), // Original quote
  totalAssessorEstimate: decimal("total_assessor_estimate", { precision: 12, scale: 2 }), // Assessor's estimate
  totalAiEstimate: decimal("total_ai_estimate", { precision: 12, scale: 2 }), // AI prediction
  finalApprovedCost: decimal("final_approved_cost", { precision: 12, scale: 2 }), // Ground truth
  
  // Repair decision
  repairDecision: mysqlEnum("repair_decision", ["repair", "total_loss", "cash_settlement", "rejected"]),
  
  // Assessor involved
  assessorName: varchar("assessor_name", { length: 255 }),
  assessorLicenseNumber: varchar("assessor_license_number", { length: 100 }),
  
  // Processing status
  pipelineStatus: mysqlEnum("pipeline_status", [
    "pending",
    "documents_uploaded",
    "classification_complete",
    "extraction_complete",
    "ground_truth_captured",
    "variance_calculated",
    "complete",
    "failed"
  ]).default("pending").notNull(),
  
  // Data quality
  dataQualityScore: int("data_quality_score"), // 0-100
  fieldsExtracted: int("fields_extracted"),
  fieldsMissing: int("fields_missing"),
  manualCorrections: int("manual_corrections").default(0),
  
  // Document count
  totalDocuments: int("total_documents").default(0),
  
  // Extraction log (audit trail)
  extractionLog: json("extraction_log"), // Array of extraction events
  
  // Error tracking
  lastError: text("last_error"),
  retryCount: int("retry_count").default(0),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type HistoricalClaim = typeof historicalClaims.$inferSelect;
export type InsertHistoricalClaim = typeof historicalClaims.$inferInsert;

/**
 * Extracted Repair Items
 * Itemized repair data extracted from panel beater quotes and assessor reports.
 * Each row represents one line item from a document.
 */
export const extractedRepairItems = mysqlTable("extracted_repair_items", {
  id: int("id").autoincrement().primaryKey(),
  historicalClaimId: int("historical_claim_id").notNull(),
  documentId: int("document_id"), // Link to ingestion_documents
  sourceType: mysqlEnum("source_type", ["panel_beater_quote", "assessor_report", "ai_estimate"]).notNull(),
  
  // Item details
  itemNumber: int("item_number"),
  description: varchar("description", { length: 500 }).notNull(),
  partNumber: varchar("part_number", { length: 100 }),
  
  // Categorization
  category: mysqlEnum("category", ["parts", "labor", "paint", "diagnostic", "sundries", "sublet", "other"]).notNull(),
  damageLocation: varchar("damage_location", { length: 200 }), // front_bumper, rear_door, etc.
  
  // Action
  repairAction: mysqlEnum("repair_action", ["repair", "replace", "refinish", "blend", "remove_refit"]),
  
  // Pricing
  quantity: decimal("quantity", { precision: 10, scale: 2 }).default("1.00"),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }),
  lineTotal: decimal("line_total", { precision: 10, scale: 2 }),
  
  // Labor
  laborHours: decimal("labor_hours", { precision: 6, scale: 2 }),
  laborRate: decimal("labor_rate", { precision: 10, scale: 2 }),
  
  // Parts quality
  partsQuality: mysqlEnum("parts_quality", ["oem", "genuine", "aftermarket", "used", "reconditioned"]),
  
  // Betterment
  bettermentPercent: decimal("betterment_percent", { precision: 5, scale: 2 }),
  bettermentAmount: decimal("betterment_amount", { precision: 10, scale: 2 }),
  
  // Extraction confidence
  extractionConfidence: decimal("extraction_confidence", { precision: 5, scale: 4 }), // 0.0000 to 1.0000
  isHandwritten: tinyint("is_handwritten").default(0), // Flag for handwritten items
  manuallyVerified: tinyint("manually_verified").default(0),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ExtractedRepairItem = typeof extractedRepairItems.$inferSelect;
export type InsertExtractedRepairItem = typeof extractedRepairItems.$inferInsert;

/**
 * Cost Components
 * Aggregated cost breakdown per historical claim per source.
 * Captures labor, parts, materials, paint, sublet totals.
 */
export const costComponents = mysqlTable("cost_components", {
  id: int("id").autoincrement().primaryKey(),
  historicalClaimId: int("historical_claim_id").notNull(),
  sourceType: mysqlEnum("source_type", ["panel_beater_quote", "assessor_report", "ai_estimate", "final_approved"]).notNull(),
  documentId: int("document_id"), // Link to source document
  
  // Cost breakdown
  laborCost: decimal("labor_cost", { precision: 12, scale: 2 }).default("0.00"),
  partsCost: decimal("parts_cost", { precision: 12, scale: 2 }).default("0.00"),
  paintCost: decimal("paint_cost", { precision: 12, scale: 2 }).default("0.00"),
  materialsCost: decimal("materials_cost", { precision: 12, scale: 2 }).default("0.00"),
  subletCost: decimal("sublet_cost", { precision: 12, scale: 2 }).default("0.00"),
  sundries: decimal("sundries", { precision: 12, scale: 2 }).default("0.00"),
  vatAmount: decimal("vat_amount", { precision: 12, scale: 2 }).default("0.00"),
  totalExclVat: decimal("total_excl_vat", { precision: 12, scale: 2 }).default("0.00"),
  totalInclVat: decimal("total_incl_vat", { precision: 12, scale: 2 }).default("0.00"),
  
  // Labor details
  totalLaborHours: decimal("total_labor_hours", { precision: 8, scale: 2 }),
  averageLaborRate: decimal("average_labor_rate", { precision: 10, scale: 2 }),
  
  // Parts details
  totalPartsCount: int("total_parts_count"),
  oemPartsCount: int("oem_parts_count"),
  aftermarketPartsCount: int("aftermarket_parts_count"),
  repairVsReplaceRatio: decimal("repair_vs_replace_ratio", { precision: 5, scale: 2 }), // % replaced
  
  // Betterment
  totalBetterment: decimal("total_betterment", { precision: 12, scale: 2 }).default("0.00"),
  
  // Extraction metadata
  extractionConfidence: decimal("extraction_confidence", { precision: 5, scale: 4 }),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type CostComponent = typeof costComponents.$inferSelect;
export type InsertCostComponent = typeof costComponents.$inferInsert;

/**
 * AI Prediction Logs
 * Audit trail of every AI prediction made during historical claim processing.
 * Used for model accuracy tracking and continuous learning.
 */
export const aiPredictionLogs = mysqlTable("ai_prediction_logs", {
  id: int("id").autoincrement().primaryKey(),
  historicalClaimId: int("historical_claim_id").notNull(),
  tenantId: varchar("tenant_id", { length: 64 }).notNull(),
  
  // Prediction type
  predictionType: mysqlEnum("prediction_type", [
    "cost_estimate",
    "fraud_detection",
    "document_classification",
    "damage_assessment",
    "repair_vs_replace",
    "total_loss_determination",
    "physics_validation"
  ]).notNull(),
  
  // Model details
  modelName: varchar("model_name", { length: 100 }).notNull(), // e.g., "gpt-4o", "kinga-fraud-v1"
  modelVersion: varchar("model_version", { length: 50 }),
  
  // Input summary
  inputSummary: text("input_summary"), // Brief description of what was sent to the model
  inputTokens: int("input_tokens"),
  
  // Prediction output
  predictedValue: decimal("predicted_value", { precision: 12, scale: 2 }), // For numeric predictions (cost)
  predictedLabel: varchar("predicted_label", { length: 100 }), // For classification predictions
  confidenceScore: decimal("confidence_score", { precision: 5, scale: 4 }), // 0.0000 to 1.0000
  predictionJson: json("prediction_json"), // Full structured prediction output
  
  // Ground truth comparison (filled after ground truth is captured)
  actualValue: decimal("actual_value", { precision: 12, scale: 2 }),
  actualLabel: varchar("actual_label", { length: 100 }),
  varianceAmount: decimal("variance_amount", { precision: 12, scale: 2 }), // predicted - actual
  variancePercent: decimal("variance_percent", { precision: 8, scale: 2 }), // ((predicted - actual) / actual) * 100
  isAccurate: tinyint("is_accurate"), // Within acceptable threshold
  
  // Processing metadata
  processingTimeMs: int("processing_time_ms"),
  outputTokens: int("output_tokens"),
  totalCost: decimal("total_cost", { precision: 10, scale: 6 }), // API cost in USD
  
  // Error tracking
  errorOccurred: tinyint("error_occurred").default(0),
  errorMessage: text("error_message"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type AiPredictionLog = typeof aiPredictionLogs.$inferSelect;
export type InsertAiPredictionLog = typeof aiPredictionLogs.$inferInsert;

/**
 * Final Approval Records (Ground Truth)
 * The definitive record of what was actually approved and paid.
 * This is the training label for ML models.
 */
export const finalApprovalRecords = mysqlTable("final_approval_records", {
  id: int("id").autoincrement().primaryKey(),
  historicalClaimId: int("historical_claim_id").notNull().unique(),
  tenantId: varchar("tenant_id", { length: 64 }).notNull(),
  
  // Final decision
  finalDecision: mysqlEnum("final_decision", ["approved_repair", "approved_total_loss", "cash_settlement", "rejected", "withdrawn"]).notNull(),
  
  // Final costs
  finalApprovedAmount: decimal("final_approved_amount", { precision: 12, scale: 2 }).notNull(),
  finalLaborCost: decimal("final_labor_cost", { precision: 12, scale: 2 }),
  finalPartsCost: decimal("final_parts_cost", { precision: 12, scale: 2 }),
  finalPaintCost: decimal("final_paint_cost", { precision: 12, scale: 2 }),
  finalSubletCost: decimal("final_sublet_cost", { precision: 12, scale: 2 }),
  finalBetterment: decimal("final_betterment", { precision: 12, scale: 2 }),
  
  // Decision maker
  approvedByName: varchar("approved_by_name", { length: 255 }),
  approvedByRole: varchar("approved_by_role", { length: 100 }),
  approvalDate: date("approval_date"),
  
  // Assessor involved
  assessorName: varchar("assessor_name", { length: 255 }),
  assessorLicenseNumber: varchar("assessor_license_number", { length: 100 }),
  assessorEstimate: decimal("assessor_estimate", { precision: 12, scale: 2 }),
  
  // Repair outcome
  repairShopName: varchar("repair_shop_name", { length: 255 }),
  actualRepairDuration: int("actual_repair_duration"), // Days
  customerSatisfaction: int("customer_satisfaction"), // 1-5
  
  // Notes
  approvalNotes: text("approval_notes"),
  conditions: text("conditions"), // JSON array of conditions
  
  // Data source
  dataSource: mysqlEnum("data_source", ["extracted_from_document", "manual_entry", "system_import"]).notNull(),
  capturedByUserId: int("captured_by_user_id"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type FinalApprovalRecord = typeof finalApprovalRecords.$inferSelect;
export type InsertFinalApprovalRecord = typeof finalApprovalRecords.$inferInsert;

/**
 * Variance Datasets
 * Pre-computed variance analysis comparing different cost sources.
 * Used for analytics dashboards, assessor benchmarking, and ML training.
 */
export const varianceDatasets = mysqlTable("variance_datasets", {
  id: int("id").autoincrement().primaryKey(),
  historicalClaimId: int("historical_claim_id").notNull(),
  tenantId: varchar("tenant_id", { length: 64 }).notNull(),
  
  // Comparison type
  comparisonType: mysqlEnum("comparison_type", [
    "quote_vs_final",       // Panel beater quote vs final approved
    "ai_vs_final",          // AI prediction vs final approved
    "assessor_vs_final",    // Assessor estimate vs final approved
    "quote_vs_assessor",    // Panel beater quote vs assessor
    "ai_vs_assessor",       // AI vs assessor
    "quote_vs_ai"           // Panel beater quote vs AI
  ]).notNull(),
  
  // Source values
  sourceALabel: varchar("source_a_label", { length: 100 }).notNull(), // e.g., "Panel Beater Quote"
  sourceAAmount: decimal("source_a_amount", { precision: 12, scale: 2 }).notNull(),
  sourceBLabel: varchar("source_b_label", { length: 100 }).notNull(), // e.g., "Final Approved"
  sourceBAmount: decimal("source_b_amount", { precision: 12, scale: 2 }).notNull(),
  
  // Variance calculation
  varianceAmount: decimal("variance_amount", { precision: 12, scale: 2 }).notNull(), // A - B
  variancePercent: decimal("variance_percent", { precision: 8, scale: 2 }).notNull(), // ((A - B) / B) * 100
  absoluteVariancePercent: decimal("absolute_variance_percent", { precision: 8, scale: 2 }).notNull(), // |variance%|
  
  // Component-level variance (JSON)
  laborVariance: decimal("labor_variance", { precision: 12, scale: 2 }),
  partsVariance: decimal("parts_variance", { precision: 12, scale: 2 }),
  paintVariance: decimal("paint_variance", { precision: 12, scale: 2 }),
  
  // Categorization
  varianceCategory: mysqlEnum("variance_category", [
    "within_threshold",   // < 5%
    "minor_variance",     // 5-15%
    "significant_variance", // 15-30%
    "major_variance",     // 30-50%
    "extreme_variance"    // > 50%
  ]).notNull(),
  
  // Vehicle context (for segmented analysis)
  vehicleMake: varchar("vehicle_make", { length: 100 }),
  vehicleModel: varchar("vehicle_model", { length: 100 }),
  vehicleYear: int("vehicle_year"),
  accidentType: varchar("accident_type", { length: 100 }),
  
  // Assessor context (for benchmarking)
  assessorName: varchar("assessor_name", { length: 255 }),
  assessorLicenseNumber: varchar("assessor_license_number", { length: 100 }),
  
  // Flags
  isFraudSuspected: tinyint("is_fraud_suspected").default(0),
  isOutlier: tinyint("is_outlier").default(0),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type VarianceDataset = typeof varianceDatasets.$inferSelect;
export type InsertVarianceDataset = typeof varianceDatasets.$inferInsert;


/**
 * Claim Intelligence Dataset
 * Comprehensive ML training dataset captured at final approval.
 * Used for continuous learning, model retraining, and benchmarking.
 * Phase 2: Production Hardening & Intelligence Maturity
 */
export const claimIntelligenceDataset = mysqlTable("claim_intelligence_dataset", {
  id: int("id").autoincrement().primaryKey(),
  claimId: int("claim_id").notNull(),
  tenantId: varchar("tenant_id", { length: 255 }),
  
  // Schema version for feature evolution
  schemaVersion: int("schema_version").notNull().default(1),
  
  // CLAIM CONTEXT FEATURES
  vehicleMake: varchar("vehicle_make", { length: 100 }),
  vehicleModel: varchar("vehicle_model", { length: 100 }),
  vehicleYear: int("vehicle_year"),
  vehicleMass: int("vehicle_mass"), // kg, for physics validation
  accidentType: varchar("accident_type", { length: 50 }), // 'frontal', 'rear', 'side', 'rollover', 'multi-impact'
  impactDirection: varchar("impact_direction", { length: 50 }), // 'front', 'rear', 'left', 'right', 'top'
  accidentDescriptionText: text("accident_description_text"),
  policeReportPresence: tinyint("police_report_presence").default(0),
  
  // DAMAGE FEATURES
  detectedDamageComponents: json("detected_damage_components"), // Array of component names
  damageSeverityScores: json("damage_severity_scores"), // Map of component → severity (0-100)
  llmDamageReasoning: text("llm_damage_reasoning"),
  physicsPlausibilityScore: int("physics_plausibility_score"), // 0-100
  
  // ASSESSMENT FEATURES
  aiEstimatedCost: int("ai_estimated_cost"), // cents
  assessorAdjustedCost: int("assessor_adjusted_cost"), // cents
  insurerApprovedCost: int("insurer_approved_cost"), // cents (ground truth)
  costVarianceAiVsAssessor: int("cost_variance_ai_vs_assessor"), // percentage
  costVarianceAssessorVsFinal: int("cost_variance_assessor_vs_final"), // percentage
  costVarianceAiVsFinal: int("cost_variance_ai_vs_final"), // percentage
  
  // FRAUD FEATURES
  aiFraudScore: int("ai_fraud_score"), // 0-100
  fraudExplanation: text("fraud_explanation"),
  finalFraudOutcome: varchar("final_fraud_outcome", { length: 50 }), // 'legitimate', 'fraudulent', 'suspicious', 'under_investigation'
  
  // WORKFLOW FEATURES
  assessorId: int("assessor_id"),
  assessorTier: varchar("assessor_tier", { length: 50 }), // 'free', 'premium', 'enterprise'
  assessmentTurnaroundHours: decimal("assessment_turnaround_hours", { precision: 10, scale: 2 }),
  reassignmentCount: int("reassignment_count").default(0),
  approvalTimelineHours: decimal("approval_timeline_hours", { precision: 10, scale: 2 }),
  
  // METADATA
  capturedAt: timestamp("captured_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  
  // HYBRID INTELLIGENCE GOVERNANCE LAYER
  dataScope: mysqlEnum("data_scope", ["tenant_private", "tenant_feature"]).default("tenant_private").notNull(),
  globalSharingEnabled: tinyint("global_sharing_enabled").default(0),
  anonymizedAt: timestamp("anonymized_at"),
  // incidentLocation: text("incident_location"), // For geographic aggregation - TODO: Add after migration
}, (table) => ({
  claimIdIdx: index("idx_claim_id").on(table.claimId),
  tenantIdIdx: index("idx_tenant_id").on(table.tenantId),
  capturedAtIdx: index("idx_captured_at").on(table.capturedAt),
  schemaVersionIdx: index("idx_schema_version").on(table.schemaVersion),
}));

export type ClaimIntelligenceDataset = typeof claimIntelligenceDataset.$inferSelect;
export type InsertClaimIntelligenceDataset = typeof claimIntelligenceDataset.$inferInsert;

/**
 * Claim Events
 * Immutable event log for all claim state transitions and actions.
 * Used for timeline reconstruction, turnaround calculation, and audit trail.
 * Phase 2: Production Hardening & Intelligence Maturity
 */
export const claimEvents = mysqlTable("claim_events", {
  id: int("id").autoincrement().primaryKey(),
  claimId: int("claim_id").notNull(),
  eventType: varchar("event_type", { length: 100 }).notNull(),
  eventPayload: json("event_payload"), // Flexible payload for event-specific data
  userId: int("user_id"), // Who triggered the event (NULL for system events)
  userRole: varchar("user_role", { length: 50 }), // Role at time of event
  tenantId: varchar("tenant_id", { length: 255 }),
  emittedAt: timestamp("emitted_at").defaultNow().notNull(),
}, (table) => ({
  claimIdIdx: index("idx_claim_id").on(table.claimId),
  eventTypeIdx: index("idx_event_type").on(table.eventType),
  emittedAtIdx: index("idx_emitted_at").on(table.emittedAt),
}));

export type ClaimEvent = typeof claimEvents.$inferSelect;
export type InsertClaimEvent = typeof claimEvents.$inferInsert;

/**
 * Model Training Queue
 * Queue for tracking claims ready for ML model retraining.
 * Decouples dataset capture from model training.
 * Phase 2: Production Hardening & Intelligence Maturity
 */
export const modelTrainingQueue = mysqlTable("model_training_queue", {
  id: int("id").autoincrement().primaryKey(),
  claimId: int("claim_id").notNull(),
  datasetRecordId: int("dataset_record_id").notNull(), // FK to claim_intelligence_dataset
  trainingPriority: varchar("training_priority", { length: 50 }).default("normal"), // 'high', 'normal', 'low'
  processed: tinyint("processed").default(0),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  processedIdx: index("idx_processed").on(table.processed),
  trainingPriorityIdx: index("idx_training_priority").on(table.trainingPriority),
  createdAtIdx: index("idx_created_at").on(table.createdAt),
}));

export type ModelTrainingQueue = typeof modelTrainingQueue.$inferSelect;
export type InsertModelTrainingQueue = typeof modelTrainingQueue.$inferInsert;


/**
 * Global Anonymized Dataset
 * Tier 3: Aggregated, anonymized dataset pooled across all tenants.
 * K-anonymity enforced, PII removed, POPIA/GDPR compliant.
 * Hybrid Intelligence Governance Layer
 */
export const globalAnonymizedDataset = mysqlTable("global_anonymized_dataset", {
  id: int("id").autoincrement().primaryKey(),
  anonymousRecordId: varchar("anonymous_record_id", { length: 36 }).notNull().unique(),
  
  // Temporal (generalized)
  captureMonth: varchar("capture_month", { length: 7 }).notNull(),
  
  // Vehicle context (partially generalized)
  vehicleMake: varchar("vehicle_make", { length: 100 }),
  vehicleModel: varchar("vehicle_model", { length: 100 }),
  vehicleYearBracket: varchar("vehicle_year_bracket", { length: 20 }),
  vehicleMass: int("vehicle_mass"),
  
  // Accident context
  accidentType: varchar("accident_type", { length: 50 }),
  province: varchar("province", { length: 50 }),
  
  // Damage features (retained)
  detectedDamageComponents: json("detected_damage_components"),
  damageSeverityScores: json("damage_severity_scores"),
  physicsPlausibilityScore: int("physics_plausibility_score"),
  
  // Assessment features (retained)
  aiEstimatedCost: int("ai_estimated_cost"),
  assessorAdjustedCost: int("assessor_adjusted_cost"),
  insurerApprovedCost: int("insurer_approved_cost"),
  costVarianceAiVsAssessor: int("cost_variance_ai_vs_assessor"),
  costVarianceAssessorVsFinal: int("cost_variance_assessor_vs_final"),
  costVarianceAiVsFinal: int("cost_variance_ai_vs_final"),
  
  // Fraud features (retained)
  aiFraudScore: int("ai_fraud_score"),
  finalFraudOutcome: varchar("final_fraud_outcome", { length: 50 }),
  
  // Workflow features (retained)
  assessorTier: varchar("assessor_tier", { length: 50 }),
  assessmentTurnaroundHours: decimal("assessment_turnaround_hours", { precision: 10, scale: 2 }),
  reassignmentCount: int("reassignment_count"),
  approvalTimelineHours: decimal("approval_timeline_hours", { precision: 10, scale: 2 }),
  
  // Metadata
  anonymizedAt: timestamp("anonymized_at").defaultNow().notNull(),
  schemaVersion: int("schema_version").notNull().default(1),
}, (table) => ({
  captureMonthIdx: index("idx_gad_capture_month").on(table.captureMonth),
  vehicleMakeIdx: index("idx_gad_vehicle_make").on(table.vehicleMake),
  provinceIdx: index("idx_gad_province").on(table.province),
  accidentTypeIdx: index("idx_gad_accident_type").on(table.accidentType),
  anonymizedAtIdx: index("idx_gad_anonymized_at").on(table.anonymizedAt),
}));

export type GlobalAnonymizedDataset = typeof globalAnonymizedDataset.$inferSelect;
export type InsertGlobalAnonymizedDataset = typeof globalAnonymizedDataset.$inferInsert;

/**
 * Anonymization Audit Log
 * Tracks all anonymization attempts, successes, and failures.
 * POPIA/GDPR compliance audit trail.
 * Hybrid Intelligence Governance Layer
 */
export const anonymizationAuditLog = mysqlTable("anonymization_audit_log", {
  id: int("id").autoincrement().primaryKey(),
  sourceRecordId: int("source_record_id").notNull(),
  anonymousRecordId: varchar("anonymous_record_id", { length: 36 }),
  
  status: mysqlEnum("status", [
    "success",
    "withheld_k_anonymity",
    "withheld_pii_detected",
    "withheld_tenant_opt_out"
  ]).notNull(),
  
  quasiIdentifierHash: varchar("quasi_identifier_hash", { length: 64 }),
  groupSize: int("group_size"),
  
  transformationsApplied: json("transformations_applied"),
  
  anonymizedByUserId: int("anonymized_by_user_id"),
  anonymizedAt: timestamp("anonymized_at").defaultNow().notNull(),
}, (table) => ({
  sourceRecordIdx: index("idx_aal_source_record").on(table.sourceRecordId),
  statusIdx: index("idx_aal_status").on(table.status),
  anonymizedAtIdx: index("idx_aal_anonymized_at").on(table.anonymizedAt),
}));

export type AnonymizationAuditLog = typeof anonymizationAuditLog.$inferSelect;
export type InsertAnonymizationAuditLog = typeof anonymizationAuditLog.$inferInsert;

/**
 * Dataset Access Grants
 * RBAC enforcement for dataset tier access.
 * Tracks external sharing of Tier 2 (Tenant Feature) data.
 * Hybrid Intelligence Governance Layer
 */
export const datasetAccessGrants = mysqlTable("dataset_access_grants", {
  id: int("id").autoincrement().primaryKey(),
  
  tenantId: varchar("tenant_id", { length: 255 }).notNull(),
  dataScope: mysqlEnum("data_scope", ["tenant_private", "tenant_feature", "global_anonymized"]).notNull(),
  grantedToUserId: int("granted_to_user_id"),
  grantedToRole: varchar("granted_to_role", { length: 50 }),
  grantedToOrganization: varchar("granted_to_organization", { length: 255 }),
  
  purpose: text("purpose").notNull(),
  expiryDate: date("expiry_date"),
  maxRecords: int("max_records"),
  
  grantedByUserId: int("granted_by_user_id").notNull(),
  grantedAt: timestamp("granted_at").defaultNow().notNull(),
  revokedAt: timestamp("revoked_at"),
  revokedByUserId: int("revoked_by_user_id"),
}, (table) => ({
  tenantIdIdx: index("idx_dag_tenant_id").on(table.tenantId),
  dataScopeIdx: index("idx_dag_data_scope").on(table.dataScope),
  grantedToUserIdx: index("idx_dag_granted_to_user").on(table.grantedToUserId),
  expiryDateIdx: index("idx_dag_expiry_date").on(table.expiryDate),
}));

export type DatasetAccessGrant = typeof datasetAccessGrants.$inferSelect;
export type InsertDatasetAccessGrant = typeof datasetAccessGrants.$inferInsert;

/**
 * Federated Learning Metadata
 * Tracks federated learning training rounds and model aggregation.
 * Enables privacy-preserving multi-tenant ML training.
 * Hybrid Intelligence Governance Layer
 */
export const federatedLearningMetadata = mysqlTable("federated_learning_metadata", {
  id: int("id").autoincrement().primaryKey(),
  
  roundNumber: int("round_number").notNull(),
  modelType: varchar("model_type", { length: 100 }).notNull(),
  
  participantCount: int("participant_count").notNull(),
  participantTenantIds: json("participant_tenant_ids"),
  
  globalModelVersion: varchar("global_model_version", { length: 50 }).notNull(),
  localModelContributions: json("local_model_contributions"),
  aggregationMethod: varchar("aggregation_method", { length: 50 }).default("federated_averaging"),
  
  globalModelAccuracy: decimal("global_model_accuracy", { precision: 5, scale: 4 }),
  convergenceStatus: mysqlEnum("convergence_status", ["converging", "converged", "diverged"]).default("converging"),
  
  trainingStartedAt: timestamp("training_started_at").notNull(),
  trainingCompletedAt: timestamp("training_completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  roundNumberIdx: index("idx_flm_round_number").on(table.roundNumber),
  modelTypeIdx: index("idx_flm_model_type").on(table.modelType),
  trainingStartedIdx: index("idx_flm_training_started").on(table.trainingStartedAt),
}));

export type FederatedLearningMetadata = typeof federatedLearningMetadata.$inferSelect;
export type InsertFederatedLearningMetadata = typeof federatedLearningMetadata.$inferInsert;


// ============================================================================
// CONFIDENCE-GOVERNED CLAIM AUTOMATION FRAMEWORK
// ============================================================================

/**
 * Automation Policies
 * Insurer-configurable automation policies for claim processing.
 * Defines confidence thresholds, claim type eligibility, financial limits, and vehicle rules.
 * Confidence-Governed Automation Framework
 */
export const automationPolicies = mysqlTable("automation_policies", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: varchar("tenant_id", { length: 255 }).notNull(),
  policyName: varchar("policy_name", { length: 255 }).notNull(),
  
  // Confidence Thresholds
  minAutomationConfidence: int("min_automation_confidence").notNull().default(85),
  minHybridConfidence: int("min_hybrid_confidence").notNull().default(60),
  
  // Claim Type Eligibility
  eligibleClaimTypes: json("eligible_claim_types").notNull(),
  excludedClaimTypes: json("excluded_claim_types").notNull(),
  
  // Financial Limits
  maxAiOnlyApprovalAmount: bigint("max_ai_only_approval_amount", { mode: "number" }).notNull().default(5000000),
  maxHybridApprovalAmount: bigint("max_hybrid_approval_amount", { mode: "number" }).notNull().default(20000000),
  
  // Fraud Risk Cutoff
  maxFraudScoreForAutomation: int("max_fraud_score_for_automation").notNull().default(30),
  
  // Vehicle Category Rules
  eligibleVehicleCategories: json("eligible_vehicle_categories").notNull(),
  excludedVehicleMakes: json("excluded_vehicle_makes").notNull(),
  minVehicleYear: int("min_vehicle_year").notNull().default(2010),
  maxVehicleAge: int("max_vehicle_age").notNull().default(15),
  
  // Override Controls
  requireManagerApprovalAbove: bigint("require_manager_approval_above", { mode: "number" }).notNull().default(10000000),
  allowPolicyOverride: boolean("allow_policy_override").notNull().default(true),
  
  // Metadata
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  createdByUserId: int("created_by_user_id"),
  isActive: boolean("is_active").notNull().default(true),
}, (table) => ({
  tenantActiveIdx: index("idx_tenant_active").on(table.tenantId, table.isActive),
  policyNameIdx: index("idx_policy_name").on(table.policyName),
}));

export type AutomationPolicy = typeof automationPolicies.$inferSelect;
export type InsertAutomationPolicy = typeof automationPolicies.$inferInsert;

/**
 * Claim Confidence Scores
 * Per-claim confidence score breakdown from AI confidence scoring engine.
 * Tracks 6 component scores and composite confidence score (0-100).
 * Confidence-Governed Automation Framework
 */
export const claimConfidenceScores = mysqlTable("claim_confidence_scores", {
  id: int("id").autoincrement().primaryKey(),
  claimId: int("claim_id").notNull(),
  tenantId: varchar("tenant_id", { length: 255 }).notNull(),
  
  // Component Scores (0-100)
  damageCertainty: decimal("damage_certainty", { precision: 5, scale: 2 }).notNull(),
  physicsStrength: decimal("physics_strength", { precision: 5, scale: 2 }).notNull(),
  fraudConfidence: decimal("fraud_confidence", { precision: 5, scale: 2 }).notNull(),
  historicalAccuracy: decimal("historical_accuracy", { precision: 5, scale: 2 }).notNull(),
  dataCompleteness: decimal("data_completeness", { precision: 5, scale: 2 }).notNull(),
  vehicleRiskIntelligence: decimal("vehicle_risk_intelligence", { precision: 5, scale: 2 }).notNull(),
  
  // Composite Score
  compositeConfidenceScore: decimal("composite_confidence_score", { precision: 5, scale: 2 }).notNull(),
  
  // Scoring Metadata
  scoringVersion: varchar("scoring_version", { length: 50 }).notNull().default("v1.0"),
  scoringTimestamp: timestamp("scoring_timestamp").defaultNow().notNull(),
  
  // Component Score Details (JSON)
  damageCertaintyBreakdown: json("damage_certainty_breakdown"),
  physicsValidationDetails: json("physics_validation_details"),
  fraudAnalysisDetails: json("fraud_analysis_details"),
  historicalAccuracyDetails: json("historical_accuracy_details"),
  dataCompletenessDetails: json("data_completeness_details"),
  vehicleRiskDetails: json("vehicle_risk_details"),
}, (table) => ({
  claimIdIdx: index("idx_claim_id").on(table.claimId),
  tenantIdIdx: index("idx_tenant_id").on(table.tenantId),
  compositeScoreIdx: index("idx_composite_score").on(table.compositeConfidenceScore),
  scoringTimestampIdx: index("idx_scoring_timestamp").on(table.scoringTimestamp),
}));

export type ClaimConfidenceScore = typeof claimConfidenceScores.$inferSelect;
export type InsertClaimConfidenceScore = typeof claimConfidenceScores.$inferInsert;

/**
 * Claim Routing Decisions
 * Routing decision audit trail for claim workflow assignment.
 * Tracks AI-only, hybrid, or manual workflow routing with rationale.
 * Confidence-Governed Automation Framework
 */
export const claimRoutingDecisions = mysqlTable("claim_routing_decisions", {
  id: int("id").autoincrement().primaryKey(),
  claimId: int("claim_id").notNull(),
  tenantId: varchar("tenant_id", { length: 255 }).notNull(),
  confidenceScoreId: int("confidence_score_id").notNull(),
  automationPolicyId: int("automation_policy_id").notNull(),
  
  // Routing Decision
  routedWorkflow: mysqlEnum("routed_workflow", ["ai_only", "hybrid", "manual"]).notNull(),
  routingReason: text("routing_reason").notNull(),
  
  // Policy Application Snapshot
  policyThresholdsApplied: json("policy_thresholds_applied").notNull(),
  
  // Decision Metadata
  decisionTimestamp: timestamp("decision_timestamp").defaultNow().notNull(),
  decisionMadeBySystem: boolean("decision_made_by_system").notNull().default(true),
  decisionMadeByUserId: int("decision_made_by_user_id"),
  
  // Override Tracking
  wasOverridden: boolean("was_overridden").notNull().default(false),
  overrideReason: text("override_reason"),
  overriddenByUserId: int("overridden_by_user_id"),
  overriddenAt: timestamp("overridden_at"),
}, (table) => ({
  claimIdIdx: index("idx_claim_id").on(table.claimId),
  tenantIdIdx: index("idx_tenant_id").on(table.tenantId),
  routedWorkflowIdx: index("idx_routed_workflow").on(table.routedWorkflow),
  decisionTimestampIdx: index("idx_decision_timestamp").on(table.decisionTimestamp),
}));

export type ClaimRoutingDecision = typeof claimRoutingDecisions.$inferSelect;
export type InsertClaimRoutingDecision = typeof claimRoutingDecisions.$inferInsert;

/**
 * Automation Audit Log
 * Full automation event log for regulatory compliance and performance tracking.
 * Tracks confidence scores, routing decisions, policy application, and cost variances.
 * Confidence-Governed Automation Framework
 */
export const automationAuditLog = mysqlTable("automation_audit_log", {
  id: int("id").autoincrement().primaryKey(),
  claimId: int("claim_id").notNull(),
  tenantId: varchar("tenant_id", { length: 255 }).notNull(),
  
  // Confidence Score Reference
  confidenceScoreId: int("confidence_score_id").notNull(),
  compositeConfidenceScore: decimal("composite_confidence_score", { precision: 5, scale: 2 }).notNull(),
  
  // Routing Decision Reference
  routingDecisionId: int("routing_decision_id").notNull(),
  routedWorkflow: mysqlEnum("routed_workflow", ["ai_only", "hybrid", "manual"]).notNull(),
  routingReason: text("routing_reason").notNull(),
  
  // Policy Application
  automationPolicyId: int("automation_policy_id").notNull(),
  policySnapshot: json("policy_snapshot").notNull(),
  
  // Cost Tracking
  aiEstimatedCost: bigint("ai_estimated_cost", { mode: "number" }).notNull(),
  assessorAdjustedCost: bigint("assessor_adjusted_cost", { mode: "number" }),
  finalApprovedCost: bigint("final_approved_cost", { mode: "number" }),
  costVarianceAiVsFinal: decimal("cost_variance_ai_vs_final", { precision: 5, scale: 2 }),
  
  // Timestamps
  decisionMadeAt: timestamp("decision_made_at").notNull(),
  claimApprovedAt: timestamp("claim_approved_at"),
  claimRejectedAt: timestamp("claim_rejected_at"),
  
  // Override Tracking
  wasOverridden: boolean("was_overridden").notNull().default(false),
  overrideReason: text("override_reason"),
  overriddenByUserId: int("overridden_by_user_id"),
  
  // Audit Metadata
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  claimIdIdx: index("idx_claim_id").on(table.claimId),
  tenantIdIdx: index("idx_tenant_id").on(table.tenantId),
  routedWorkflowIdx: index("idx_routed_workflow").on(table.routedWorkflow),
  compositeScoreIdx: index("idx_composite_score").on(table.compositeConfidenceScore),
  decisionMadeAtIdx: index("idx_decision_made_at").on(table.decisionMadeAt),
  wasOverriddenIdx: index("idx_was_overridden").on(table.wasOverridden),
}));

export type AutomationAuditLog = typeof automationAuditLog.$inferSelect;
export type InsertAutomationAuditLog = typeof automationAuditLog.$inferInsert;


/**
 * ============================================================================
 * Dual-Layer Reporting System Tables
 * ============================================================================
 * 
 * Supports immutable PDF snapshots and interactive living intelligence reports
 * with version control, audit hashing, and governance controls.
 */

/**
 * Report Snapshots Table
 * Stores versioned snapshots of claim intelligence with cryptographic audit hashing
 */
export const reportSnapshots = mysqlTable("report_snapshots", {
  id: varchar("id", { length: 255 }).primaryKey(),
  claimId: int("claim_id").notNull(),
  version: int("version").notNull(),
  reportType: mysqlEnum("report_type", ["insurer", "assessor", "regulatory"]).notNull(),
  intelligenceData: json("intelligence_data").notNull(),
  auditHash: varchar("audit_hash", { length: 64 }).notNull(),
  generatedBy: int("generated_by").notNull(),
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
  isImmutable: boolean("is_immutable").notNull().default(true),
  tenantId: varchar("tenant_id", { length: 255 }).notNull(),
}, (table) => ({
  claimVersionIdx: index("idx_claim_version").on(table.claimId, table.version),
  auditHashIdx: index("idx_audit_hash").on(table.auditHash),
  tenantIdIdx: index("idx_tenant_id").on(table.tenantId),
  generatedByIdx: index("idx_generated_by").on(table.generatedBy),
}));

export type ReportSnapshot = typeof reportSnapshots.$inferSelect;
export type InsertReportSnapshot = typeof reportSnapshots.$inferInsert;

/**
 * PDF Reports Table
 * Stores metadata for generated PDF reports with S3 storage references
 */
export const pdfReports = mysqlTable("pdf_reports", {
  id: varchar("id", { length: 255 }).primaryKey(),
  snapshotId: varchar("snapshot_id", { length: 255 }).notNull(),
  s3Url: text("s3_url").notNull(),
  fileSizeBytes: int("file_size_bytes").notNull(),
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"),
  tenantId: varchar("tenant_id", { length: 255 }).notNull(),
}, (table) => ({
  snapshotIdIdx: index("idx_snapshot_id").on(table.snapshotId),
  tenantIdIdx: index("idx_tenant_id").on(table.tenantId),
}));

export type PdfReport = typeof pdfReports.$inferSelect;
export type InsertPdfReport = typeof pdfReports.$inferInsert;

/**
 * Report Links Table
 * Maps PDF snapshots to interactive report URLs with access control
 */
export const reportLinks = mysqlTable("report_links", {
  id: varchar("id", { length: 255 }).primaryKey(),
  snapshotId: varchar("snapshot_id", { length: 255 }).notNull(),
  interactiveUrl: text("interactive_url").notNull(),
  accessToken: varchar("access_token", { length: 255 }).notNull(),
  qrCodeData: text("qr_code_data"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  tenantId: varchar("tenant_id", { length: 255 }).notNull(),
}, (table) => ({
  snapshotIdIdx: index("idx_snapshot_id").on(table.snapshotId),
  accessTokenIdx: index("idx_access_token").on(table.accessToken),
  tenantIdIdx: index("idx_tenant_id").on(table.tenantId),
}));

export type ReportLink = typeof reportLinks.$inferSelect;
export type InsertReportLink = typeof reportLinks.$inferInsert;

/**
 * Report Access Audit Trail
 * Logs all access events for PDF and interactive reports
 */
export const reportAccessAudit = mysqlTable("report_access_audit", {
  id: int("id").autoincrement().primaryKey(),
  reportId: varchar("report_id", { length: 255 }).notNull(),
  reportType: mysqlEnum("report_type", ["pdf", "interactive"]).notNull(),
  accessedBy: int("accessed_by").notNull(),
  accessType: mysqlEnum("access_type", ["view", "download", "export", "create"]).notNull(),
  accessedAt: timestamp("accessed_at").defaultNow().notNull(),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  tenantId: varchar("tenant_id", { length: 255 }).notNull(),
}, (table) => ({
  reportIdIdx: index("idx_report_id").on(table.reportId),
  accessedByIdx: index("idx_accessed_by").on(table.accessedBy),
  tenantIdIdx: index("idx_tenant_id").on(table.tenantId),
  accessedAtIdx: index("idx_accessed_at").on(table.accessedAt),
}));

export type ReportAccessAudit = typeof reportAccessAudit.$inferSelect;
export type InsertReportAccessAudit = typeof reportAccessAudit.$inferInsert;
