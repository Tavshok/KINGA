import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, tinyint, decimal, json, date, time, longtext, index, bigint, boolean, unique } from "drizzle-orm/mysql-core";

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
  insurerRole: mysqlEnum("insurer_role", ["claims_processor", "assessor_internal", "assessor_external", "risk_manager", "claims_manager", "executive", "insurer_admin"]), // Hierarchical roles for insurer users
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
  
  // Lodger information (who submitted the claim - may differ from claimant)
  lodgedBy: mysqlEnum("lodged_by", ["self", "broker", "agent", "company_rep", "family_member", "legal_rep", "other"]).default("self"),
  lodgerName: varchar("lodger_name", { length: 255 }),
  lodgerPhone: varchar("lodger_phone", { length: 50 }),
  lodgerEmail: varchar("lodger_email", { length: 320 }),
  lodgerCompany: varchar("lodger_company", { length: 255 }), // Broker firm, company name, law firm
  lodgerReference: varchar("lodger_reference", { length: 100 }), // Broker ref, agent code, etc.
  lodgerRelationship: varchar("lodger_relationship", { length: 255 }), // Relationship to claimant if "other"

  // Claimant personal details (the actual insured person)
  claimantIdNumber: varchar("claimant_id_number", { length: 20 }),
  claimantPhone: varchar("claimant_phone", { length: 50 }),
  claimantEmail: varchar("claimant_email", { length: 320 }),
  claimantAddress: text("claimant_address"),

  // Vehicle information
  vehicleMake: varchar("vehicle_make", { length: 100 }),
  vehicleModel: varchar("vehicle_model", { length: 100 }),
  vehicleYear: int("vehicle_year"),
  vehicleRegistration: varchar("vehicle_registration", { length: 50 }),
  vehicleVin: varchar("vehicle_vin", { length: 50 }),
  vehicleColor: varchar("vehicle_color", { length: 50 }),
  vehicleMileage: varchar("vehicle_mileage", { length: 50 }),

  // Vehicle Registration Book details (NaTIS)
  vehicleEngineNumber: varchar("vehicle_engine_number", { length: 100 }),
  vehicleGvm: varchar("vehicle_gvm", { length: 20 }), // Gross Vehicle Mass in kg
  vehicleTareWeight: varchar("vehicle_tare_weight", { length: 20 }), // Tare weight in kg
  vehicleEngineCapacity: varchar("vehicle_engine_capacity", { length: 20 }), // e.g. 1600cc
  vehicleFuelType: varchar("vehicle_fuel_type", { length: 20 }), // petrol, diesel, hybrid, electric
  vehicleFirstRegistrationDate: varchar("vehicle_first_registration_date", { length: 20 }),
  vehicleOwnerName: varchar("vehicle_owner_name", { length: 255 }), // Registered owner from reg book
  vehicleLicenceExpiryDate: varchar("vehicle_licence_expiry_date", { length: 20 }),
  
  // Incident details
  incidentDate: timestamp("incident_date"),
  incidentTime: varchar("incident_time", { length: 10 }),
  incidentDescription: text("incident_description"),
  incidentLocation: text("incident_location"),
  incidentType: mysqlEnum("incident_type", ["collision", "theft", "hail", "fire", "vandalism", "flood", "hijacking", "other"]),

  // Third party details
  thirdPartyName: varchar("third_party_name", { length: 255 }),
  thirdPartyVehicle: varchar("third_party_vehicle", { length: 255 }),
  thirdPartyRegistration: varchar("third_party_registration", { length: 50 }),
  thirdPartyInsurer: varchar("third_party_insurer", { length: 255 }),

  // Police report
  policeReportNumber: varchar("police_report_number", { length: 100 }),
  policeStation: varchar("police_station", { length: 255 }),

  // Witness
  witnessName: varchar("witness_name", { length: 255 }),
  witnessPhone: varchar("witness_phone", { length: 50 }),

  // Uploaded supporting documents (S3 URLs, stored as JSON)
  supportingDocuments: text("supporting_documents"), // JSON array of {type, url, fileName}
  
  // Damage photos (S3 URLs, stored as JSON array)
  damagePhotos: text("damage_photos"), // JSON array of S3 URLs
  
  // Policy information
  policyNumber: varchar("policy_number", { length: 100 }),
  policyVerified: tinyint("policy_verified"),  // null = pending, 1 = verified, 0 = rejected
  
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
  
  // Claim complexity for SLA adjustments
  complexity_score: mysqlEnum("complexity_score", ["simple", "moderate", "complex", "exceptional"]),
  
  // Workflow state machine
  workflowState: mysqlEnum("workflow_state", [
    "created",
    "intake_verified",
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
  
  // AI Disagreement tracking
  disagreesWithAi: boolean("disagrees_with_ai").default(false),
  aiDisagreementReason: text("ai_disagreement_reason"),
  
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
  historicalClaimId: int("historical_claim_id"), // Link to historical_claims table
  
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


// ============================================================================
// INSURANCE AGENCY PLATFORM SCHEMA
// ============================================================================

/**
 * Insurance Carriers - Insurance companies offering products through KINGA
 */
export const insuranceCarriers = mysqlTable("insurance_carriers", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  shortCode: varchar("short_code", { length: 50 }).notNull().unique(), // e.g., "ZIMNAT", "FIDELITY"
  isActive: tinyint("is_active").default(1).notNull(),
  
  // Commission structure
  defaultCommissionRate: decimal("default_commission_rate", { precision: 5, scale: 2 }).notNull(), // Percentage (e.g., 15.00 for 15%)
  
  // API integration (if carrier has API)
  apiEndpoint: varchar("api_endpoint", { length: 500 }),
  apiCredentials: text("api_credentials"), // Encrypted JSON with API keys
  apiEnabled: tinyint("api_enabled").default(0),
  
  // Contact information
  contactEmail: varchar("contact_email", { length: 320 }),
  contactPhone: varchar("contact_phone", { length: 20 }),
  
  tenantId: varchar("tenant_id", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type InsuranceCarrier = typeof insuranceCarriers.$inferSelect;
export type InsertInsuranceCarrier = typeof insuranceCarriers.$inferInsert;

/**
 * Insurance Products - Product catalog per carrier
 */
export const insuranceProducts = mysqlTable("insurance_products", {
  id: int("id").autoincrement().primaryKey(),
  carrierId: int("carrier_id").notNull(),
  
  productName: varchar("product_name", { length: 255 }).notNull(),
  productCode: varchar("product_code", { length: 50 }).notNull(),
  coverageType: mysqlEnum("coverage_type", ["comprehensive", "third_party", "third_party_fire_theft"]).notNull(),
  
  // Pricing
  basePremiumMonthly: int("base_premium_monthly"), // Base premium in cents
  basePremiumAnnual: int("base_premium_annual"), // Base premium in cents
  
  // Coverage limits (in cents)
  vehicleDamageLimit: int("vehicle_damage_limit"),
  thirdPartyLiabilityLimit: int("third_party_liability_limit"),
  personalAccidentLimit: int("personal_accident_limit"),
  
  // Excess options (JSON array of amounts in cents)
  excessOptions: text("excess_options"), // e.g., [50000, 100000, 200000]
  
  // Eligibility rules (JSON)
  eligibilityRules: text("eligibility_rules"), // Min/max vehicle age, driver age, etc.
  
  // Commission override for this product
  commissionRate: decimal("commission_rate", { precision: 5, scale: 2 }), // Overrides carrier default if set
  
  isActive: tinyint("is_active").default(1).notNull(),
  
  tenantId: varchar("tenant_id", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type InsuranceProduct = typeof insuranceProducts.$inferSelect;
export type InsertInsuranceProduct = typeof insuranceProducts.$inferInsert;

/**
 * Fleet Vehicles - Registry of all vehicles for insurance purposes
 */
export const fleetVehicles = mysqlTable("fleet_vehicles", {
  id: int("id").autoincrement().primaryKey(),
  
  // Vehicle identification
  vin: varchar("vin", { length: 17 }).unique(),
  registrationNumber: varchar("registration_number", { length: 50 }).notNull().unique(),
  
  // Vehicle details
  make: varchar("make", { length: 100 }).notNull(),
  model: varchar("model", { length: 100 }).notNull(),
  year: int("year").notNull(),
  color: varchar("color", { length: 50 }),
  engineNumber: varchar("engine_number", { length: 100 }),
  chassisNumber: varchar("chassis_number", { length: 100 }),
  
  // Valuation
  currentValuation: int("current_valuation"), // Current market value in cents
  valuationDate: timestamp("valuation_date"),
  valuationSource: varchar("valuation_source", { length: 100 }), // e.g., "KINGA AI", "Manual", "External API"
  
  // Risk assessment
  maintenanceScore: int("maintenance_score"), // 0-100 score based on maintenance records
  riskScore: int("risk_score"), // 0-100 overall risk score
  claimsHistoryCount: int("claims_history_count").default(0),
  
  // Owner information
  ownerId: int("owner_id").notNull(), // Reference to users table
  fleetId: int("fleet_id"), // Reference to fleets table
  
  // Vehicle specifications
  engineCapacity: int("engine_capacity"), // in cc
  vehicleMass: int("vehicle_mass"), // in kg
  fuelType: mysqlEnum("fuel_type", ["petrol", "diesel", "electric", "hybrid"]),
  transmissionType: mysqlEnum("transmission_type", ["manual", "automatic"]),
  
  // Vehicle origin (critical for parts sourcing strategy)
  vehicleOrigin: mysqlEnum("vehicle_origin", ["Local_Assembly", "Ex_Japanese", "Ex_European", "Ex_American", "Ex_Chinese", "Unknown"]).default("Unknown"),
  importedFrom: varchar("imported_from", { length: 100 }), // e.g., "Japan", "UK", "USA", "Germany", "China"
  importYear: int("import_year"), // Year vehicle was imported (may differ from manufacture year)
  
  // Usage classification
  usageType: mysqlEnum("usage_type", ["private", "commercial", "logistics", "mining", "agriculture", "public_transport"]),
  primaryUse: text("primary_use"),
  averageMonthlyMileage: int("average_monthly_mileage"),
  
  // Insurance details
  currentInsurer: varchar("current_insurer", { length: 255 }),
  policyNumber: varchar("policy_number", { length: 100 }),
  policyStartDate: timestamp("policy_start_date"),
  policyEndDate: timestamp("policy_end_date"),
  coverageType: mysqlEnum("coverage_type", ["comprehensive", "third_party", "third_party_fire_theft"]),
  
  // Valuation details
  purchasePrice: int("purchase_price"), // in cents
  purchaseDate: timestamp("purchase_date"),
  replacementValue: int("replacement_value"), // in cents
  
  // Status
  status: mysqlEnum("status", ["active", "inactive", "sold", "written_off", "under_repair"]).default("active"),
  lastInspectionDate: timestamp("last_inspection_date"),
  nextInspectionDue: timestamp("next_inspection_due"),
  
  // Compliance
  maintenanceComplianceScore: int("maintenance_compliance_score"), // 0-100
  
  // Vehicle images (S3 URLs, JSON array)
  vehicleImages: text("vehicle_images"), // [front, back, left, right, interior, dashboard]
  
  // Registration documents
  registrationBookUrl: varchar("registration_book_url", { length: 500 }),
  registrationBookS3Key: varchar("registration_book_s3_key", { length: 500 }),
  
  tenantId: varchar("tenant_id", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type FleetVehicle = typeof fleetVehicles.$inferSelect;
export type InsertFleetVehicle = typeof fleetVehicles.$inferInsert;

/**
 * Insurance Quotes - Quote requests and responses
 */
export const insuranceQuotes = mysqlTable("insurance_quotes", {
  id: int("id").autoincrement().primaryKey(),
  quoteNumber: varchar("quote_number", { length: 50 }).notNull().unique(),
  
  // Customer and vehicle
  customerId: int("customer_id").notNull(), // Reference to users table
  vehicleId: int("vehicle_id").notNull(), // Reference to fleet_vehicles table
  
  // Carrier and product
  carrierId: int("carrier_id").notNull(),
  productId: int("product_id").notNull(),
  
  // Quote details
  premiumAmount: int("premium_amount").notNull(), // Monthly or annual premium in cents
  premiumFrequency: mysqlEnum("premium_frequency", ["monthly", "annual"]).default("monthly").notNull(),
  excessAmount: int("excess_amount"), // Chosen excess in cents
  
  // Coverage details (JSON)
  coverageLimits: text("coverage_limits"), // Detailed coverage breakdown
  
  // Driver information (JSON)
  driverDetails: text("driver_details"), // Age, years licensed, violations, etc.
  
  // Risk assessment
  riskProfile: text("risk_profile"), // JSON with risk factors and scores
  
  // Quote validity
  quoteValidUntil: timestamp("quote_valid_until").notNull(),
  
  // Status
  status: mysqlEnum("status", ["pending", "payment_pending", "payment_submitted", "payment_verified", "accepted", "rejected", "expired"]).default("pending").notNull(),
  
  // Payment tracking
  paymentMethod: mysqlEnum("payment_method", ["cash", "bank_transfer", "ecocash", "onemoney", "rtgs", "zipit"]),
  paymentReferenceNumber: varchar("payment_reference_number", { length: 100 }), // Bank ref, mobile money ref, etc.
  paymentProofS3Key: varchar("payment_proof_s3_key", { length: 500 }), // S3 key for uploaded receipt/screenshot
  paymentProofS3Url: varchar("payment_proof_s3_url", { length: 500 }), // S3 URL for uploaded proof
  paymentAmount: int("payment_amount"), // Amount paid in cents (for verification)
  paymentDate: timestamp("payment_date"), // When customer made payment
  paymentSubmittedAt: timestamp("payment_submitted_at"), // When customer uploaded proof
  paymentVerifiedAt: timestamp("payment_verified_at"), // When insurer verified payment
  paymentVerifiedBy: int("payment_verified_by"), // User ID of insurer who verified
  paymentRejectionReason: text("payment_rejection_reason"), // If payment rejected
  
  // KINGA insights (JSON)
  kingaInsights: text("kinga_insights"), // Claims reputation, settlement times, recommendations
  
  tenantId: varchar("tenant_id", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type InsuranceQuote = typeof insuranceQuotes.$inferSelect;
export type InsertInsuranceQuote = typeof insuranceQuotes.$inferInsert;

/**
 * Insurance Policies - Active insurance policies
 */
export const insurancePolicies = mysqlTable("insurance_policies", {
  id: int("id").autoincrement().primaryKey(),
  policyNumber: varchar("policy_number", { length: 100 }).notNull().unique(),
  
  // Link to quote
  quoteId: int("quote_id"), // Reference to insurance_quotes table
  
  // Customer and vehicle
  customerId: int("customer_id").notNull(),
  vehicleId: int("vehicle_id").notNull(),
  
  // Carrier and product
  carrierId: int("carrier_id").notNull(),
  productId: int("product_id").notNull(),
  
  // Policy terms
  premiumAmount: int("premium_amount").notNull(), // In cents
  premiumFrequency: mysqlEnum("premium_frequency", ["monthly", "annual"]).default("monthly").notNull(),
  excessAmount: int("excess_amount"), // In cents
  
  // Coverage period
  coverageStartDate: timestamp("coverage_start_date").notNull(),
  coverageEndDate: timestamp("coverage_end_date").notNull(),
  
  // Coverage details (JSON)
  coverageLimits: text("coverage_limits"),
  
  // Status
  status: mysqlEnum("status", ["pending", "active", "endorsed", "cancelled", "expired", "renewed"]).default("pending").notNull(),
  
  // Cancellation
  cancellationReason: text("cancellation_reason"),
  cancellationDate: timestamp("cancellation_date"),
  cancelledBy: int("cancelled_by"), // User ID who cancelled
  
  // Renewal
  renewalReminderSent: tinyint("renewal_reminder_sent").default(0),
  renewalReminderDate: timestamp("renewal_reminder_date"),
  renewedToPolicyId: int("renewed_to_policy_id"), // Link to new policy if renewed
  
  tenantId: varchar("tenant_id", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type InsurancePolicy = typeof insurancePolicies.$inferSelect;
export type InsertInsurancePolicy = typeof insurancePolicies.$inferInsert;

/**
 * Policy Endorsements - Mid-term policy modifications
 */
export const policyEndorsements = mysqlTable("policy_endorsements", {
  id: int("id").autoincrement().primaryKey(),
  policyId: int("policy_id").notNull(),
  endorsementNumber: varchar("endorsement_number", { length: 50 }).notNull().unique(),
  
  // Endorsement type and details
  endorsementType: mysqlEnum("endorsement_type", [
    "add_driver",
    "remove_driver",
    "change_vehicle",
    "adjust_coverage",
    "change_excess",
    "other"
  ]).notNull(),
  
  endorsementDetails: text("endorsement_details").notNull(), // JSON with specific changes
  
  // Financial impact
  premiumAdjustment: int("premium_adjustment"), // Change in premium (can be negative)
  newPremiumAmount: int("new_premium_amount"), // New total premium
  
  // Effective date
  effectiveDate: timestamp("effective_date").notNull(),
  
  // Approval
  createdBy: int("created_by").notNull(), // User ID who requested endorsement
  approvedBy: int("approved_by"), // User ID who approved
  approvedAt: timestamp("approved_at"),
  
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).default("pending").notNull(),
  
  tenantId: varchar("tenant_id", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type PolicyEndorsement = typeof policyEndorsements.$inferSelect;
export type InsertPolicyEndorsement = typeof policyEndorsements.$inferInsert;

/**
 * Policy Documents - Document storage with versioning
 */
export const policyDocuments = mysqlTable("policy_documents", {
  id: int("id").autoincrement().primaryKey(),
  policyId: int("policy_id").notNull(),
  
  // Document type
  documentType: mysqlEnum("document_type", [
    "policy_schedule",
    "certificate_of_insurance",
    "endorsement",
    "cancellation_notice",
    "renewal_notice",
    "other"
  ]).notNull(),
  
  // Document storage
  documentUrl: varchar("document_url", { length: 500 }).notNull(),
  s3Key: varchar("s3_key", { length: 500 }).notNull(),
  
  // Versioning
  version: int("version").notNull().default(1),
  
  // Metadata
  fileName: varchar("file_name", { length: 255 }),
  fileSize: int("file_size"), // Bytes
  mimeType: varchar("mime_type", { length: 100 }),
  
  // Audit
  uploadedBy: int("uploaded_by"), // User ID
  
  tenantId: varchar("tenant_id", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type PolicyDocument = typeof policyDocuments.$inferSelect;
export type InsertPolicyDocument = typeof policyDocuments.$inferInsert;

/**
 * Commission Records - Track agency commissions
 */
export const commissionRecords = mysqlTable("commission_records", {
  id: int("id").autoincrement().primaryKey(),
  
  // Policy reference
  policyId: int("policy_id").notNull(),
  carrierId: int("carrier_id").notNull(),
  productId: int("product_id").notNull(),
  
  // Commission calculation
  premiumAmount: int("premium_amount").notNull(), // Policy premium in cents
  commissionRate: decimal("commission_rate", { precision: 5, scale: 2 }).notNull(), // Percentage
  commissionAmount: int("commission_amount").notNull(), // Calculated commission in cents
  
  // Commission type
  commissionType: mysqlEnum("commission_type", ["new_business", "renewal"]).notNull(),
  
  // Payment tracking
  paymentStatus: mysqlEnum("payment_status", ["pending", "paid", "disputed"]).default("pending").notNull(),
  paymentDate: timestamp("payment_date"),
  paymentReference: varchar("payment_reference", { length: 100 }),
  
  // Period
  commissionPeriod: varchar("commission_period", { length: 20 }), // e.g., "2026-02"
  
  tenantId: varchar("tenant_id", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type CommissionRecord = typeof commissionRecords.$inferSelect;
export type InsertCommissionRecord = typeof commissionRecords.$inferInsert;

/**
 * Customer Documents - KYC and verification documents
 */
export const customerDocuments = mysqlTable("customer_documents", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customer_id").notNull(),
  
  // Document type
  documentType: mysqlEnum("document_type", [
    "id_document",
    "drivers_license",
    "proof_of_residence",
    "vehicle_registration",
    "other"
  ]).notNull(),
  
  // Document storage
  documentUrl: varchar("document_url", { length: 500 }).notNull(),
  s3Key: varchar("s3_key", { length: 500 }).notNull(),
  
  // Verification
  verificationStatus: mysqlEnum("verification_status", ["pending", "verified", "rejected"]).default("pending").notNull(),
  verifiedAt: timestamp("verified_at"),
  verifiedBy: int("verified_by"), // User ID
  rejectionReason: text("rejection_reason"),
  
  // Metadata
  fileName: varchar("file_name", { length: 255 }),
  fileSize: int("file_size"),
  mimeType: varchar("mime_type", { length: 100 }),
  
  tenantId: varchar("tenant_id", { length: 255 }),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});

export type CustomerDocument = typeof customerDocuments.$inferSelect;
export type InsertCustomerDocument = typeof customerDocuments.$inferInsert;

/**
 * Insurance Audit Logs - Complete audit trail for insurance operations
 */
export const insuranceAuditLogs = mysqlTable("insurance_audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  
  // Timestamp
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  
  // User context
  userId: int("user_id").notNull(),
  userRole: varchar("user_role", { length: 50 }),
  
  // Action details
  action: varchar("action", { length: 100 }).notNull(), // e.g., "quote_created", "policy_issued", "endorsement_approved"
  entityType: varchar("entity_type", { length: 50 }).notNull(), // e.g., "policy", "quote", "document"
  entityId: int("entity_id").notNull(),
  
  // Changes (JSON)
  changes: text("changes"), // Before/after values
  
  // Request context
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  
  tenantId: varchar("tenant_id", { length: 255 }),
});

export type InsuranceAuditLog = typeof insuranceAuditLogs.$inferSelect;
export type InsertInsuranceAuditLog = typeof insuranceAuditLogs.$inferInsert;

/**
 * Customer Consent - GDPR/POPIA compliance
 */
export const customerConsent = mysqlTable("customer_consent", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customer_id").notNull(),
  
  // Consent type
  consentType: mysqlEnum("consent_type", [
    "data_processing",
    "marketing",
    "third_party_sharing",
    "credit_check",
    "automated_decision_making"
  ]).notNull(),
  
  // Consent status
  consentGiven: tinyint("consent_given").notNull(),
  consentDate: timestamp("consent_date").defaultNow().notNull(),
  
  // Withdrawal
  withdrawnDate: timestamp("withdrawn_date"),
  
  // Context
  consentMethod: varchar("consent_method", { length: 50 }), // e.g., "web_form", "email", "phone"
  consentVersion: varchar("consent_version", { length: 20 }), // Version of terms accepted
  
  tenantId: varchar("tenant_id", { length: 255 }),
});

export type CustomerConsent = typeof customerConsent.$inferSelect;
export type InsertCustomerConsent = typeof customerConsent.$inferInsert;

/**
 * Link claims to insurance policies
 */
export const policyClaimLinks = mysqlTable("policy_claim_links", {
  id: int("id").autoincrement().primaryKey(),
  policyId: int("policy_id").notNull(),
  claimId: int("claim_id").notNull(),
  
  // Verification
  coverageVerified: tinyint("coverage_verified").default(0),
  verifiedBy: int("verified_by"), // User ID
  verifiedAt: timestamp("verified_at"),
  
  // Coverage decision
  coverageApproved: tinyint("coverage_approved"),
  coverageDecisionReason: text("coverage_decision_reason"),
  
  tenantId: varchar("tenant_id", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type PolicyClaimLink = typeof policyClaimLinks.$inferSelect;
export type InsertPolicyClaimLink = typeof policyClaimLinks.$inferInsert;


// ============================================================================
// FLEET MANAGEMENT PLATFORM TABLES
// ============================================================================

/**
 * Fleets - Groups of vehicles owned by fleet owners
 */
export const fleets = mysqlTable("fleets", {
  id: int("id").autoincrement().primaryKey(),
  ownerId: int("owner_id").notNull(), // Link to users table
  tenantId: varchar("tenant_id", { length: 64 }), // Multi-tenant isolation
  
  fleetName: varchar("fleet_name", { length: 255 }).notNull(),
  fleetType: mysqlEnum("fleet_type", ["mining", "logistics", "corporate", "rental", "public_transport", "agriculture", "construction"]).notNull(),
  
  // Fleet statistics
  totalVehicles: int("total_vehicles").default(0),
  activeVehicles: int("active_vehicles").default(0),
  
  // Fleet metadata
  description: text("description"),
  primaryLocation: varchar("primary_location", { length: 255 }),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type Fleet = typeof fleets.$inferSelect;
export type InsertFleet = typeof fleets.$inferInsert;

/**
 * Fleet Documents - Documents associated with fleets and vehicles
 */
export const fleetDocuments = mysqlTable("fleet_documents", {
  id: int("id").autoincrement().primaryKey(),
  fleetId: int("fleet_id"),
  vehicleId: int("vehicle_id"),
  tenantId: varchar("tenant_id", { length: 64 }),
  
  documentType: mysqlEnum("document_type", [
    "registration_book",
    "ownership_certificate",
    "inspection_report",
    "insurance_policy",
    "service_history",
    "photo",
    "valuation_report",
    "other"
  ]).notNull(),
  
  documentName: varchar("document_name", { length: 255 }).notNull(),
  s3Key: varchar("s3_key", { length: 500 }).notNull(),
  s3Url: text("s3_url").notNull(),
  fileSize: int("file_size"), // in bytes
  mimeType: varchar("mime_type", { length: 100 }),
  
  // Verification
  verificationStatus: mysqlEnum("verification_status", ["pending", "verified", "rejected"]).default("pending"),
  verifiedBy: int("verified_by"),
  verifiedAt: timestamp("verified_at"),
  rejectionReason: text("rejection_reason"),
  
  uploadedBy: int("uploaded_by").notNull(),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});

export type FleetDocument = typeof fleetDocuments.$inferSelect;
export type InsertFleetDocument = typeof fleetDocuments.$inferInsert;

/**
 * Maintenance Schedules - Scheduled maintenance for vehicles
 */
export const maintenanceSchedules = mysqlTable("maintenance_schedules", {
  id: int("id").autoincrement().primaryKey(),
  vehicleId: int("vehicle_id").notNull(),
  tenantId: varchar("tenant_id", { length: 64 }),
  
  // Schedule definition
  maintenanceType: mysqlEnum("maintenance_type", [
    "oil_change",
    "tire_rotation",
    "brake_inspection",
    "engine_service",
    "transmission_service",
    "annual_inspection",
    "safety_inspection",
    "filter_replacement",
    "battery_check",
    "coolant_flush",
    "custom"
  ]).notNull(),
  description: text("description"),
  
  // Interval configuration
  intervalType: mysqlEnum("interval_type", ["mileage", "time", "both"]).notNull(),
  mileageInterval: int("mileage_interval"), // in km
  timeInterval: int("time_interval"), // in days
  
  // Current status
  lastServiceDate: timestamp("last_service_date"),
  lastServiceMileage: int("last_service_mileage"),
  nextDueDate: timestamp("next_due_date"),
  nextDueMileage: int("next_due_mileage"),
  
  // Alert configuration
  alertDaysBefore: int("alert_days_before").default(7),
  alertMileageBefore: int("alert_mileage_before").default(500),
  
  isActive: tinyint("is_active").default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type MaintenanceSchedule = typeof maintenanceSchedules.$inferSelect;
export type InsertMaintenanceSchedule = typeof maintenanceSchedules.$inferInsert;

/**
 * Maintenance Records - Historical maintenance performed
 */
export const maintenanceRecords = mysqlTable("maintenance_records", {
  id: int("id").autoincrement().primaryKey(),
  vehicleId: int("vehicle_id").notNull(),
  scheduleId: int("schedule_id"),
  tenantId: varchar("tenant_id", { length: 64 }),
  
  // Service details
  serviceDate: timestamp("service_date").notNull(),
  serviceMileage: int("service_mileage"),
  serviceType: varchar("service_type", { length: 255 }).notNull(),
  serviceProvider: varchar("service_provider", { length: 255 }),
  serviceLocation: varchar("service_location", { length: 255 }),
  
  // Cost information (in cents)
  laborCost: int("labor_cost"),
  partsCost: int("parts_cost"),
  totalCost: int("total_cost"),
  
  // Service items
  serviceItems: text("service_items"), // JSON array
  partsReplaced: text("parts_replaced"), // JSON array
  
  // Documentation
  invoiceUrl: text("invoice_url"),
  serviceReportUrl: text("service_report_url"),
  
  // Compliance
  isCompliant: tinyint("is_compliant").default(1),
  wasOverdue: tinyint("was_overdue").default(0),
  daysOverdue: int("days_overdue"),
  
  performedBy: int("performed_by"),
  recordedBy: int("recorded_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type MaintenanceRecord = typeof maintenanceRecords.$inferSelect;
export type InsertMaintenanceRecord = typeof maintenanceRecords.$inferInsert;

/**
 * Maintenance Alerts - Notifications for upcoming/overdue maintenance
 */
export const maintenanceAlerts = mysqlTable("maintenance_alerts", {
  id: int("id").autoincrement().primaryKey(),
  vehicleId: int("vehicle_id").notNull(),
  scheduleId: int("schedule_id"),
  tenantId: varchar("tenant_id", { length: 64 }),
  
  alertType: mysqlEnum("alert_type", [
    "upcoming_maintenance",
    "overdue_maintenance",
    "inspection_due",
    "safety_alert",
    "compliance_alert"
  ]).notNull(),
  
  severity: mysqlEnum("severity", ["low", "medium", "high", "critical"]).notNull(),
  
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  dueDate: timestamp("due_date"),
  dueMileage: int("due_mileage"),
  
  status: mysqlEnum("status", ["pending", "acknowledged", "resolved", "dismissed"]).default("pending"),
  acknowledgedBy: int("acknowledged_by"),
  acknowledgedAt: timestamp("acknowledged_at"),
  resolvedAt: timestamp("resolved_at"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type MaintenanceAlert = typeof maintenanceAlerts.$inferSelect;
export type InsertMaintenanceAlert = typeof maintenanceAlerts.$inferInsert;

/**
 * Service Requests - Requests for repairs or maintenance quotes
 */
export const serviceRequests = mysqlTable("service_requests", {
  id: int("id").autoincrement().primaryKey(),
  vehicleId: int("vehicle_id").notNull(),
  fleetId: int("fleet_id"),
  ownerId: int("owner_id").notNull(),
  tenantId: varchar("tenant_id", { length: 64 }),
  
  // Request details
  requestType: mysqlEnum("request_type", ["maintenance", "repair", "inspection", "emergency"]).notNull(),
  serviceCategory: mysqlEnum("service_category", [
    "engine",
    "transmission",
    "brakes",
    "suspension",
    "electrical",
    "bodywork",
    "tires",
    "hvac",
    "general"
  ]).notNull(),
  
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  urgency: mysqlEnum("urgency", ["low", "medium", "high", "critical"]).default("medium"),
  
  // Vehicle condition
  currentMileage: int("current_mileage"),
  problemImages: text("problem_images"), // JSON array of S3 URLs
  diagnosticCodes: text("diagnostic_codes"), // JSON array of OBD codes
  
  // Request status
  status: mysqlEnum("status", [
    "open",
    "quotes_received",
    "quote_accepted",
    "in_progress",
    "completed",
    "cancelled"
  ]).default("open"),
  quotesReceived: int("quotes_received").default(0),
  
  // Selected quote
  selectedQuoteId: int("selected_quote_id"),
  selectedProviderId: int("selected_provider_id"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export type ServiceRequest = typeof serviceRequests.$inferSelect;
export type InsertServiceRequest = typeof serviceRequests.$inferInsert;

/**
 * Service Quotes - Quotes from service providers
 */
export const serviceQuotes = mysqlTable("service_quotes", {
  id: int("id").autoincrement().primaryKey(),
  requestId: int("request_id").notNull(),
  providerId: int("provider_id").notNull(), // Link to panel_beaters or service_providers
  tenantId: varchar("tenant_id", { length: 64 }),
  
  // Quote details (in cents)
  quotedAmount: int("quoted_amount").notNull(),
  laborCost: int("labor_cost"),
  partsCost: int("parts_cost"),
  additionalCosts: int("additional_costs"),
  
  // Timeline
  estimatedDuration: int("estimated_duration"), // in hours
  availabilityDate: timestamp("availability_date"),
  completionDate: timestamp("completion_date"),
  
  // Quote items
  quoteLineItems: text("quote_line_items"), // JSON array
  partsRequired: text("parts_required"), // JSON array
  
  // Provider information
  providerName: varchar("provider_name", { length: 255 }).notNull(),
  providerLocation: varchar("provider_location", { length: 255 }),
  providerRating: decimal("provider_rating", { precision: 3, scale: 2 }),
  providerCompletedJobs: int("provider_completed_jobs"),
  
  // AI analysis
  aiCostScore: int("ai_cost_score"), // 0-100
  costDeviationPercent: decimal("cost_deviation_percent", { precision: 5, scale: 2 }),
  recommendationScore: int("recommendation_score"), // 0-100
  
  // Status
  status: mysqlEnum("status", ["pending", "accepted", "rejected", "expired"]).default("pending"),
  validUntil: timestamp("valid_until"),
  
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
  acceptedAt: timestamp("accepted_at"),
});

export type ServiceQuote = typeof serviceQuotes.$inferSelect;
export type InsertServiceQuote = typeof serviceQuotes.$inferInsert;

/**
 * Service Providers - Mechanics, dealerships, and service centers
 */
export const serviceProviders = mysqlTable("service_providers", {
  id: int("id").autoincrement().primaryKey(),
  
  providerName: varchar("provider_name", { length: 255 }).notNull(),
  providerType: mysqlEnum("provider_type", ["panel_beater", "mechanic", "dealership", "specialist"]).notNull(),
  
  // Contact information
  contactPerson: varchar("contact_person", { length: 255 }),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 20 }),
  address: text("address"),
  city: varchar("city", { length: 100 }),
  region: varchar("region", { length: 100 }),
  
  // Specializations
  specializations: text("specializations"), // JSON array
  certifications: text("certifications"), // JSON array
  
  // Performance metrics
  averageRating: decimal("average_rating", { precision: 3, scale: 2 }),
  totalJobsCompleted: int("total_jobs_completed").default(0),
  averageCompletionTime: decimal("average_completion_time", { precision: 6, scale: 2 }), // hours
  averageCostDeviation: decimal("average_cost_deviation", { precision: 5, scale: 2 }), // %
  onTimeCompletionRate: decimal("on_time_completion_rate", { precision: 5, scale: 2 }), // %
  
  // Status
  isActive: tinyint("is_active").default(1),
  isVerified: tinyint("is_verified").default(0),
  verifiedAt: timestamp("verified_at"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type ServiceProvider = typeof serviceProviders.$inferSelect;
export type InsertServiceProvider = typeof serviceProviders.$inferInsert;

/**
 * Fleet Risk Scores - Risk intelligence for vehicles
 */
export const fleetRiskScores = mysqlTable("fleet_risk_scores", {
  id: int("id").autoincrement().primaryKey(),
  vehicleId: int("vehicle_id").notNull().unique(),
  fleetId: int("fleet_id"),
  tenantId: varchar("tenant_id", { length: 64 }),
  
  // Overall risk score (0-100, higher = more risky)
  overallRiskScore: int("overall_risk_score").notNull(),
  
  // Component scores
  maintenanceRisk: int("maintenance_risk"),
  claimsRisk: int("claims_risk"),
  vehicleAgeRisk: int("vehicle_age_risk"),
  usageRisk: int("usage_risk"),
  repairCostRisk: int("repair_cost_risk"),
  
  // Risk factors
  riskFactors: text("risk_factors"), // JSON array
  
  // Insurance impact
  premiumImpact: mysqlEnum("premium_impact", ["decrease", "neutral", "increase"]),
  recommendedPremiumAdjustment: decimal("recommended_premium_adjustment", { precision: 5, scale: 2 }), // %
  
  calculatedAt: timestamp("calculated_at").defaultNow().notNull(),
  nextReviewDate: timestamp("next_review_date"),
});

export type FleetRiskScore = typeof fleetRiskScores.$inferSelect;
export type InsertFleetRiskScore = typeof fleetRiskScores.$inferInsert;

/**
 * Fleet Audit Logs - Comprehensive audit trail
 */
export const fleetAuditLogs = mysqlTable("fleet_audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: varchar("tenant_id", { length: 64 }),
  
  entityType: mysqlEnum("entity_type", [
    "fleet",
    "vehicle",
    "maintenance",
    "service_request",
    "quote",
    "document"
  ]).notNull(),
  entityId: int("entity_id").notNull(),
  
  action: mysqlEnum("action", ["create", "update", "delete", "view", "export"]).notNull(),
  userId: int("user_id").notNull(),
  userName: varchar("user_name", { length: 255 }),
  
  changesBefore: text("changes_before"), // JSON snapshot
  changesAfter: text("changes_after"), // JSON snapshot
  
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export type FleetAuditLog = typeof fleetAuditLogs.$inferSelect;
export type InsertFleetAuditLog = typeof fleetAuditLogs.$inferInsert;

/**
 * Vehicle Mileage Logs - Track odometer readings
 */
export const vehicleMileageLogs = mysqlTable("vehicle_mileage_logs", {
  id: int("id").autoincrement().primaryKey(),
  vehicleId: int("vehicle_id").notNull(),
  tenantId: varchar("tenant_id", { length: 64 }),
  
  mileage: int("mileage").notNull(), // Current odometer reading
  recordedDate: timestamp("recorded_date").notNull(),
  recordedBy: int("recorded_by").notNull(),
  
  // Context
  recordType: mysqlEnum("record_type", ["manual", "service", "inspection", "claim", "automated"]).default("manual"),
  notes: text("notes"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type VehicleMileageLog = typeof vehicleMileageLogs.$inferSelect;
export type InsertVehicleMileageLog = typeof vehicleMileageLogs.$inferInsert;




// ============================================================================
// LEARNING GOVERNANCE FRAMEWORK - Training Dataset Management
// ============================================================================

/**
 * Training Data Scores - Confidence scoring for training dataset inclusion
 */
export const trainingDataScores = mysqlTable("training_data_scores", {
  id: int("id").autoincrement().primaryKey(),
  historicalClaimId: int("historical_claim_id").notNull().unique(),
  tenantId: varchar("tenant_id", { length: 64 }),
  
  // Overall confidence score (0-100)
  trainingConfidenceScore: decimal("training_confidence_score", { precision: 5, scale: 2 }).notNull(),
  trainingConfidenceCategory: mysqlEnum("training_confidence_category", [
    "HIGH",
    "MEDIUM",
    "LOW"
  ]).notNull(),
  
  // Individual scoring components (0-100 each)
  assessorReportScore: decimal("assessor_report_score", { precision: 5, scale: 2 }).default("0.00"),
  supportingPhotosScore: decimal("supporting_photos_score", { precision: 5, scale: 2 }).default("0.00"),
  panelBeaterQuotesScore: decimal("panel_beater_quotes_score", { precision: 5, scale: 2 }).default("0.00"),
  evidenceCompletenessScore: decimal("evidence_completeness_score", { precision: 5, scale: 2 }).default("0.00"),
  handwrittenAdjustmentsScore: decimal("handwritten_adjustments_score", { precision: 5, scale: 2 }).default("0.00"),
  fraudMarkersScore: decimal("fraud_markers_score", { precision: 5, scale: 2 }).default("0.00"),
  disputeHistoryScore: decimal("dispute_history_score", { precision: 5, scale: 2 }).default("0.00"),
  competingQuotesScore: decimal("competing_quotes_score", { precision: 5, scale: 2 }).default("0.00"),
  
  // Scoring metadata
  scoringAlgorithmVersion: varchar("scoring_algorithm_version", { length: 20 }),
  scoringNotes: text("scoring_notes"), // JSON: detailed scoring breakdown
  
  // Anomaly and bias detection
  anomalyDetected: tinyint("anomaly_detected").default(0),
  anomalyReason: text("anomaly_reason"),
  biasRiskDetected: tinyint("bias_risk_detected").default(0),
  biasRiskReason: text("bias_risk_reason"),
  
  scoredAt: timestamp("scored_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type TrainingDataScore = typeof trainingDataScores.$inferSelect;
export type InsertTrainingDataScore = typeof trainingDataScores.$inferInsert;

/**
 * Claim Review Queue - Human-in-the-loop approval workflow
 */
export const claimReviewQueue = mysqlTable("claim_review_queue", {
  id: int("id").autoincrement().primaryKey(),
  historicalClaimId: int("historical_claim_id").notNull().unique(),
  tenantId: varchar("tenant_id", { length: 64 }),
  
  reviewStatus: mysqlEnum("review_status", [
    "pending_review",
    "in_review",
    "approved",
    "rejected",
    "needs_more_info"
  ]).default("pending_review"),
  
  reviewPriority: mysqlEnum("review_priority", ["low", "medium", "high"]).default("medium"),
  
  // Routing logic
  routedReason: varchar("routed_reason", { length: 255 }), // Why routed to manual review
  automatedValidationLevel: varchar("automated_validation_level", { length: 50 }), // Level 1, 2, 3
  
  // Review assignment
  assignedTo: int("assigned_to"), // User ID of reviewer
  assignedAt: timestamp("assigned_at"),
  
  // Review outcome
  reviewedBy: int("reviewed_by"), // User ID of reviewer
  reviewedAt: timestamp("reviewed_at"),
  reviewDecision: mysqlEnum("review_decision", ["approve", "reject", "request_more_info"]),
  reviewNotes: text("review_notes"),
  
  // Dataset inclusion decision
  includeInTrainingDataset: tinyint("include_in_training_dataset").default(0),
  includeInReferenceDataset: tinyint("include_in_reference_dataset").default(1), // Default: all go to reference
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type ClaimReviewQueue = typeof claimReviewQueue.$inferSelect;
export type InsertClaimReviewQueue = typeof claimReviewQueue.$inferInsert;

/**
 * Training Dataset - Claims approved for AI model training
 */
export const trainingDataset = mysqlTable("training_dataset", {
  id: int("id").autoincrement().primaryKey(),
  historicalClaimId: int("historical_claim_id").notNull().unique(),
  tenantId: varchar("tenant_id", { length: 64 }),
  
  // Dataset version tracking
  datasetVersion: varchar("dataset_version", { length: 50 }).notNull(),
  
  // Inclusion metadata
  includedAt: timestamp("included_at").defaultNow().notNull(),
  includedBy: int("included_by").notNull(), // User ID or system
  inclusionReason: text("inclusion_reason"),
  
  // Training usage tracking
  usedInModelVersions: text("used_in_model_versions"), // JSON array of model versions
  lastUsedForTraining: timestamp("last_used_for_training"),
  
  // Quality flags
  isActive: tinyint("is_active").default(1), // Can be deactivated if quality issues found
  deactivatedAt: timestamp("deactivated_at"),
  deactivationReason: text("deactivation_reason"),
  
  // Multi-Reference Truth fields
  trainingWeight: decimal("training_weight", { precision: 3, scale: 2 }).default("1.00"), // 0.00-1.00
  negotiatedAdjustment: tinyint("negotiated_adjustment").default(0), // Boolean: assessor value deviates from truth
  deviationReason: mysqlEnum("deviation_reason", [
    "none",
    "negotiation",
    "fraud",
    "regional_variance",
    "data_quality",
    "assessor_bias",
    "manual_override"
  ]).default("none"),
});

export type TrainingDatasetEntry = typeof trainingDataset.$inferSelect;
export type InsertTrainingDatasetEntry = typeof trainingDataset.$inferInsert;

/**
 * Reference Dataset - All claims for benchmarking (not for training)
 */
export const referenceDataset = mysqlTable("reference_dataset", {
  id: int("id").autoincrement().primaryKey(),
  historicalClaimId: int("historical_claim_id").notNull().unique(),
  tenantId: varchar("tenant_id", { length: 64 }),
  
  // Dataset version tracking
  datasetVersion: varchar("dataset_version", { length: 50 }).notNull(),
  
  // Inclusion metadata
  includedAt: timestamp("included_at").defaultNow().notNull(),
  
  // Usage tracking
  usedForBenchmarking: tinyint("used_for_benchmarking").default(0),
  usedForAnalytics: tinyint("used_for_analytics").default(0),
  lastAccessedAt: timestamp("last_accessed_at"),
  
  // Reference purpose tags
  referencePurpose: text("reference_purpose"), // JSON array: ["benchmarking", "analytics", "audit"]
});

export type ReferenceDatasetEntry = typeof referenceDataset.$inferSelect;
export type InsertReferenceDatasetEntry = typeof referenceDataset.$inferInsert;

/**
 * Model Version Registry - ML governance and version tracking
 */
export const modelVersionRegistry = mysqlTable("model_version_registry", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: varchar("tenant_id", { length: 64 }),
  
  modelName: varchar("model_name", { length: 255 }).notNull(),
  modelVersion: varchar("model_version", { length: 50 }).notNull().unique(),
  
  // Model metadata
  modelType: varchar("model_type", { length: 100 }), // e.g., "damage_assessment", "fraud_detection"
  algorithmUsed: varchar("algorithm_used", { length: 100 }),
  
  // Training metadata
  trainingDatasetVersion: varchar("training_dataset_version", { length: 50 }),
  trainingClaimCount: int("training_claim_count"),
  trainingStartedAt: timestamp("training_started_at"),
  trainingCompletedAt: timestamp("training_completed_at"),
  trainingDuration: int("training_duration"), // Minutes
  
  // Performance metrics
  accuracyScore: decimal("accuracy_score", { precision: 5, scale: 2 }),
  precisionScore: decimal("precision_score", { precision: 5, scale: 2 }),
  recallScore: decimal("recall_score", { precision: 5, scale: 2 }),
  f1Score: decimal("f1_score", { precision: 5, scale: 2 }),
  
  // Validation results
  biasDriftValidation: varchar("bias_drift_validation", { length: 50 }), // "passed", "failed", "warning"
  fraudDetectionStability: varchar("fraud_detection_stability", { length: 50 }),
  performanceBenchmark: text("performance_benchmark"), // JSON: detailed metrics
  
  // Deployment status
  deploymentStatus: mysqlEnum("deployment_status", [
    "training",
    "validation",
    "staging",
    "production",
    "deprecated",
    "archived"
  ]).default("training"),
  
  deployedAt: timestamp("deployed_at"),
  deployedBy: int("deployed_by"), // User ID
  
  // Approval workflow
  approvalStatus: mysqlEnum("approval_status", [
    "pending_validation",
    "pending_approval",
    "approved",
    "rejected"
  ]).default("pending_validation"),
  approvedBy: int("approved_by"), // User ID
  approvedAt: timestamp("approved_at"),
  approvalNotes: text("approval_notes"),
  
  // Model artifacts
  modelArtifactUrl: text("model_artifact_url"), // S3 URL to model file
  modelConfigUrl: text("model_config_url"), // S3 URL to config
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type ModelVersionRegistry = typeof modelVersionRegistry.$inferSelect;
export type InsertModelVersionRegistry = typeof modelVersionRegistry.$inferInsert;

/**
 * Model Training Audit Log - Full audit trail of training activities
 */
export const modelTrainingAuditLog = mysqlTable("model_training_audit_log", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: varchar("tenant_id", { length: 64 }),
  
  modelVersionId: int("model_version_id").notNull(),
  
  eventType: mysqlEnum("event_type", [
    "training_started",
    "training_completed",
    "training_failed",
    "validation_started",
    "validation_completed",
    "deployment_requested",
    "deployment_approved",
    "deployment_rejected",
    "model_deprecated",
    "dataset_added",
    "dataset_removed"
  ]).notNull(),
  
  eventDescription: text("event_description"),
  eventMetadata: text("event_metadata"), // JSON: detailed event data
  
  performedBy: int("performed_by"), // User ID or system
  performedAt: timestamp("performed_at").defaultNow().notNull(),
  
  ipAddress: varchar("ip_address", { length: 45 }),
});

export type ModelTrainingAuditLogEntry = typeof modelTrainingAuditLog.$inferSelect;
export type InsertModelTrainingAuditLogEntry = typeof modelTrainingAuditLog.$inferInsert;


// =====================================
// Multi-Reference Truth Synthesis Tables
// =====================================

/**
 * Multi-Reference Truth - Synthesized ground truth from multiple evidence sources
 * Treats assessor values as advisory, not absolute truth
 */
export const multiReferenceTruth = mysqlTable("multi_reference_truth", {
  id: int("id").primaryKey().autoincrement(),
  historicalClaimId: int("historical_claim_id").notNull(),
  
  // Synthesized truth value (consensus from all components)
  synthesizedValue: decimal("synthesized_value", { precision: 10, scale: 2 }).notNull(),
  confidenceInterval: decimal("confidence_interval", { precision: 5, scale: 2 }), // ±% range
  
  // Individual component scores (0-100)
  photoDamageSeverityScore: int("photo_damage_severity_score"),
  panelBeaterQuoteClusterScore: int("panel_beater_quote_cluster_score"),
  regionalBenchmarkScore: int("regional_benchmark_score"),
  similarClaimsScore: int("similar_claims_score"),
  fraudProbabilityScore: int("fraud_probability_score"),
  settlementAmountScore: int("settlement_amount_score"),
  
  // Component values
  photoDamageEstimate: decimal("photo_damage_estimate", { precision: 10, scale: 2 }),
  panelBeaterMedian: decimal("panel_beater_median", { precision: 10, scale: 2 }),
  regionalBenchmark: decimal("regional_benchmark", { precision: 10, scale: 2 }),
  similarClaimsAverage: decimal("similar_claims_average", { precision: 10, scale: 2 }),
  finalSettlement: decimal("final_settlement", { precision: 10, scale: 2 }),
  
  // Assessor comparison
  assessorValue: decimal("assessor_value", { precision: 10, scale: 2 }),
  assessorDeviation: decimal("assessor_deviation", { precision: 5, scale: 2 }), // % deviation
  deviationAbsolute: decimal("deviation_absolute", { precision: 10, scale: 2 }),
  
  // Synthesis metadata
  synthesisMethod: varchar("synthesis_method", { length: 50 }), // weighted_average, median, etc.
  componentsUsed: int("components_used"), // Number of components available
  synthesisQuality: mysqlEnum("synthesis_quality", ["high", "medium", "low"]),
  
  synthesizedAt: timestamp("synthesized_at").defaultNow().notNull(),
  synthesizedBy: varchar("synthesized_by", { length: 50 }), // system or user ID
  
  // Explanation
  synthesisExplanation: text("synthesis_explanation"), // Human-readable explanation
});

export type MultiReferenceTruth = typeof multiReferenceTruth.$inferSelect;
export type InsertMultiReferenceTruth = typeof multiReferenceTruth.$inferInsert;

/**
 * Assessor Deviation Metrics - Track assessor variance patterns
 * Detect systematic biases across assessors, regions, vehicle types
 */
export const assessorDeviationMetrics = mysqlTable("assessor_deviation_metrics", {
  id: int("id").primaryKey().autoincrement(),
  assessorId: int("assessor_id"),
  assessorName: varchar("assessor_name", { length: 255 }),
  
  // Time period
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  
  // Aggregated metrics
  totalClaims: int("total_claims").notNull(),
  averageDeviation: decimal("average_deviation", { precision: 5, scale: 2 }), // % avg deviation
  medianDeviation: decimal("median_deviation", { precision: 5, scale: 2 }),
  standardDeviation: decimal("standard_deviation", { precision: 5, scale: 2 }),
  
  // Bias indicators
  overvaluationRate: decimal("overvaluation_rate", { precision: 5, scale: 2 }), // % of claims overvalued
  undervaluationRate: decimal("undervaluation_rate", { precision: 5, scale: 2 }),
  consistencyScore: int("consistency_score"), // 0-100
  
  // Segmentation
  region: varchar("region", { length: 100 }),
  vehicleType: varchar("vehicle_type", { length: 50 }),
  panelBeaterId: int("panel_beater_id"), // Relationship bias
  
  // Quality indicators
  dataQualityScore: int("data_quality_score"), // 0-100
  sampleSize: int("sample_size"),
  
  calculatedAt: timestamp("calculated_at").defaultNow().notNull(),
});

export type AssessorDeviationMetrics = typeof assessorDeviationMetrics.$inferSelect;
export type InsertAssessorDeviationMetrics = typeof assessorDeviationMetrics.$inferInsert;

/**
 * Regional Benchmarks - Parts and labor cost baselines by region
 * Used for truth synthesis and deviation detection
 */
export const regionalBenchmarks = mysqlTable("regional_benchmarks", {
  id: int("id").primaryKey().autoincrement(),
  
  // Geographic
  region: varchar("region", { length: 100 }).notNull(),
  city: varchar("city", { length: 100 }),
  
  // Vehicle segmentation
  vehicleType: varchar("vehicle_type", { length: 50 }),
  vehicleMake: varchar("vehicle_make", { length: 100 }),
  vehicleModel: varchar("vehicle_model", { length: 100 }),
  yearRange: varchar("year_range", { length: 20 }), // e.g., "2018-2022"
  
  // Cost benchmarks
  laborRatePerHour: decimal("labor_rate_per_hour", { precision: 10, scale: 2 }),
  paintCostPerPanel: decimal("paint_cost_per_panel", { precision: 10, scale: 2 }),
  
  // Common parts (JSON: part_name -> avg_cost)
  commonPartsCosts: text("common_parts_costs"), // JSON object
  
  // Statistical metrics
  sampleSize: int("sample_size"),
  confidenceLevel: decimal("confidence_level", { precision: 5, scale: 2 }), // e.g., 95.0
  
  // Temporal
  effectiveFrom: date("effective_from").notNull(),
  effectiveTo: date("effective_to"),
  
  lastUpdated: timestamp("last_updated").defaultNow().notNull(),
  dataSource: varchar("data_source", { length: 255 }), // e.g., "historical_claims", "market_survey"
});

export type RegionalBenchmark = typeof regionalBenchmarks.$inferSelect;
export type InsertRegionalBenchmark = typeof regionalBenchmarks.$inferInsert;

/**
 * Similar Claims Clusters - K-nearest neighbor groups for comparison
 * Used to find similar historical claims for truth synthesis
 */
export const similarClaimsClusters = mysqlTable("similar_claims_clusters", {
  id: int("id").primaryKey().autoincrement(),
  historicalClaimId: int("historical_claim_id").notNull(),
  
  // Similarity features (used for clustering)
  vehicleMake: varchar("vehicle_make", { length: 100 }),
  vehicleModel: varchar("vehicle_model", { length: 100 }),
  vehicleYear: int("vehicle_year"),
  damageType: varchar("damage_type", { length: 100 }),
  damageSeverity: mysqlEnum("damage_severity", ["minor", "moderate", "severe", "total_loss"]),
  region: varchar("region", { length: 100 }),
  
  // Cluster assignment
  clusterId: int("cluster_id"),
  clusterSize: int("cluster_size"),
  
  // Similar claims (JSON: array of claim IDs with similarity scores)
  similarClaims: text("similar_claims"), // JSON: [{claim_id, similarity_score, cost}]
  
  // Statistical summary
  clusterMedianCost: decimal("cluster_median_cost", { precision: 10, scale: 2 }),
  clusterAverageCost: decimal("cluster_average_cost", { precision: 10, scale: 2 }),
  clusterStdDev: decimal("cluster_std_dev", { precision: 10, scale: 2 }),
  
  // Quality metrics
  similarityThreshold: decimal("similarity_threshold", { precision: 5, scale: 2 }), // e.g., 0.85
  kNeighbors: int("k_neighbors"), // Number of neighbors used
  
  clusteredAt: timestamp("clustered_at").defaultNow().notNull(),
  clusteringAlgorithm: varchar("clustering_algorithm", { length: 50 }), // e.g., "k-means", "dbscan"
});

export type SimilarClaimsCluster = typeof similarClaimsClusters.$inferSelect;
export type InsertSimilarClaimsCluster = typeof similarClaimsClusters.$inferInsert;


/**
 * Parts Pricing Baseline - SA public data scraping baseline
 * Stores baseline parts pricing from public SA sources (Supercheap, Midas, AutoTrader)
 */
export const partsPricingBaseline = mysqlTable("parts_pricing_baseline", {
  id: int("id").primaryKey().autoincrement(),
  
  // Part identification
  partName: varchar("part_name", { length: 255 }).notNull(), // e.g., "Front Bumper", "Headlight Assembly"
  partNumber: varchar("part_number", { length: 100 }), // OEM part number if available
  partCategory: varchar("part_category", { length: 100 }), // e.g., "body", "lighting", "mechanical"
  
  // Vehicle fitment
  vehicleMake: varchar("vehicle_make", { length: 100 }),
  vehicleModel: varchar("vehicle_model", { length: 100 }),
  vehicleYearFrom: int("vehicle_year_from"),
  vehicleYearTo: int("vehicle_year_to"),
  
  // Pricing
  saBasePrice: decimal("sa_base_price", { precision: 10, scale: 2 }).notNull(), // Base price
  currency: varchar("currency", { length: 3 }).default("USD").notNull(),
  partType: mysqlEnum("part_type", ["OEM", "OEM_Equivalent", "Aftermarket", "Used", "Unknown"]).default("Unknown"),
  
  // Source attribution
  source: varchar("source", { length: 100 }).notNull(), // e.g., "supercheap_auto", "midas", "manual_entry"
  sourceUrl: text("source_url"),
  scrapedAt: timestamp("scraped_at"),
  lastUpdated: timestamp("last_updated").defaultNow().notNull(),
  
  // Quality indicators
  confidence: mysqlEnum("confidence", ["low", "medium", "high"]).default("medium"),
  dataQuality: text("data_quality"), // JSON: validation notes
});

export type PartsPricingBaseline = typeof partsPricingBaseline.$inferSelect;
export type InsertPartsPricingBaseline = typeof partsPricingBaseline.$inferInsert;

/**
 * Part Stratification - OEM vs Aftermarket vs Used pricing tiers
 */
export const partStratification = mysqlTable("part_stratification", {
  id: int("id").primaryKey().autoincrement(),
  
  stratumType: mysqlEnum("stratum_type", ["OEM", "OEM_Equivalent", "Aftermarket", "Used"]).notNull(),
  priceMultiplier: decimal("price_multiplier", { precision: 5, scale: 2 }).notNull(), // e.g., 1.0 for OEM, 0.7 for Aftermarket
  
  // Quality indicators
  qualityRating: int("quality_rating"), // 1-5 scale
  warrantyMonths: int("warranty_months"),
  description: text("description"),
  
  // Applicability
  partCategory: varchar("part_category", { length: 100 }), // NULL = applies to all categories
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type PartStratification = typeof partStratification.$inferSelect;
export type InsertPartStratification = typeof partStratification.$inferInsert;

/**
 * Regional Pricing Multipliers - Country-specific cost adjustments
 */
export const regionalPricingMultipliers = mysqlTable("regional_pricing_multipliers", {
  id: int("id").primaryKey().autoincrement(),
  
  country: varchar("country", { length: 100 }).notNull().unique(), // e.g., "Zimbabwe", "Botswana", "South Africa"
  countryCode: varchar("country_code", { length: 3 }).notNull(), // ISO 3166-1 alpha-3
  
  // Cost components
  transportCostMultiplier: decimal("transport_cost_multiplier", { precision: 5, scale: 2 }).notNull(), // e.g., 1.15 = +15% for transport
  dutyRate: decimal("duty_rate", { precision: 5, scale: 2 }).notNull(), // e.g., 0.25 = 25% import duty
  handlingFeeFlat: decimal("handling_fee_flat", { precision: 10, scale: 2 }).default("0.00"), // Flat fee in local currency
  marginMultiplier: decimal("margin_multiplier", { precision: 5, scale: 2 }).default("1.10"), // e.g., 1.10 = 10% markup
  
  // Currency
  currencyCode: varchar("currency_code", { length: 3 }).notNull(), // e.g., "ZWL", "USD", "BWP"
  exchangeRateToUSD: decimal("exchange_rate_to_usd", { precision: 15, scale: 6 }).notNull(), // e.g., 1 ZWL = 0.0012 USD
  exchangeRateSource: varchar("exchange_rate_source", { length: 100 }), // e.g., "RBZ", "manual", "xe.com"
  
  // Metadata
  lastUpdated: timestamp("last_updated").defaultNow().notNull(),
  updatedBy: int("updated_by"), // Admin user ID
  notes: text("notes"),
});

export type RegionalPricingMultiplier = typeof regionalPricingMultipliers.$inferSelect;
export type InsertRegionalPricingMultiplier = typeof regionalPricingMultipliers.$inferInsert;

/**
 * Parts Pricing Overrides - Admin manual overrides for specific parts/regions
 */
export const partsPricingOverrides = mysqlTable("parts_pricing_overrides", {
  id: int("id").primaryKey().autoincrement(),
  
  // Part identification (can be specific or wildcard)
  partName: varchar("part_name", { length: 255 }),
  partNumber: varchar("part_number", { length: 100 }),
  partCategory: varchar("part_category", { length: 100 }),
  
  // Vehicle fitment (can be specific or wildcard)
  vehicleMake: varchar("vehicle_make", { length: 100 }),
  vehicleModel: varchar("vehicle_model", { length: 100 }),
  
  // Region (NULL = applies to all regions)
  country: varchar("country", { length: 100 }),
  
  // Stratum (NULL = applies to all strata)
  stratumType: mysqlEnum("stratum_type", ["OEM", "OEM_Equivalent", "Aftermarket", "Used"]),
  
  // Override pricing
  overridePrice: decimal("override_price", { precision: 10, scale: 2 }),
  overrideMultiplier: decimal("override_multiplier", { precision: 5, scale: 2 }), // Alternative: multiply baseline by this
  
  // Metadata
  reason: text("reason").notNull(), // Why this override was created
  createdBy: int("created_by").notNull(), // Admin user ID
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"), // NULL = never expires
});

export type PartsPricingOverride = typeof partsPricingOverrides.$inferSelect;
export type InsertPartsPricingOverride = typeof partsPricingOverrides.$inferInsert;

/**
 * Parts Pricing Audit Log - Track all pricing changes for transparency
 */
export const partsPricingAuditLog = mysqlTable("parts_pricing_audit_log", {
  id: int("id").primaryKey().autoincrement(),
  
  changeType: mysqlEnum("change_type", ["baseline_update", "multiplier_update", "override_created", "override_deleted", "scraper_run"]).notNull(),
  
  // What changed
  tableName: varchar("table_name", { length: 100 }).notNull(),
  recordId: int("record_id"),
  
  // Change details
  oldValue: text("old_value"), // JSON snapshot of old data
  newValue: text("new_value"), // JSON snapshot of new data
  
  // Who/when
  changedBy: int("changed_by"), // Admin user ID (NULL for automated scraper)
  changedAt: timestamp("changed_at").defaultNow().notNull(),
  
  // Context
  reason: text("reason"),
  ipAddress: varchar("ip_address", { length: 45 }),
});

export type PartsPricingAuditLog = typeof partsPricingAuditLog.$inferSelect;
export type InsertPartsPricingAuditLog = typeof partsPricingAuditLog.$inferInsert;


/**
 * Supplier Quotes - Admin-uploaded market quotes from SA/Zim suppliers
 */
export const supplierQuotes = mysqlTable("supplier_quotes", {
  id: int("id").primaryKey().autoincrement(),
  
  // Supplier information
  supplierName: varchar("supplier_name", { length: 255 }).notNull(),
  supplierCountry: varchar("supplier_country", { length: 100 }).notNull(), // e.g., "South Africa", "Zimbabwe", "Japan", "UAE", "Thailand", "Singapore"
  supplierContact: varchar("supplier_contact", { length: 255 }),
  
  // Quote metadata
  quoteDate: date("quote_date").notNull(),
  quoteNumber: varchar("quote_number", { length: 100 }),
  quoteValidUntil: date("quote_valid_until"),
  
  // Document
  documentUrl: text("document_url").notNull(), // S3 URL of uploaded PDF/Excel/image
  documentType: mysqlEnum("document_type", ["pdf", "excel", "image"]).notNull(),
  
  // Processing status
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).default("pending").notNull(),
  extractedAt: timestamp("extracted_at"),
  reviewedAt: timestamp("reviewed_at"),
  reviewedBy: int("reviewed_by"), // Admin user ID
  
  // Extraction results
  extractionConfidence: decimal("extraction_confidence", { precision: 5, scale: 2 }), // 0.00-1.00
  extractionNotes: text("extraction_notes"), // JSON: extraction issues, warnings
  
  // Metadata
  uploadedBy: int("uploaded_by").notNull(), // Admin user ID
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
  notes: text("notes"), // Admin notes about this quote
});

export type SupplierQuote = typeof supplierQuotes.$inferSelect;
export type InsertSupplierQuote = typeof supplierQuotes.$inferInsert;

/**
 * Supplier Quote Line Items - Individual parts from supplier quotes
 */
export const supplierQuoteLineItems = mysqlTable("supplier_quote_line_items", {
  id: int("id").primaryKey().autoincrement(),
  
  quoteId: int("quote_id").notNull(), // FK to supplierQuotes
  
  // Part identification
  partName: varchar("part_name", { length: 255 }).notNull(),
  partNumber: varchar("part_number", { length: 100 }),
  partDescription: text("part_description"),
  partCategory: varchar("part_category", { length: 100 }),
  
  // Vehicle fitment (may be extracted or NULL)
  vehicleMake: varchar("vehicle_make", { length: 100 }),
  vehicleModel: varchar("vehicle_model", { length: 100 }),
  vehicleYearFrom: int("vehicle_year_from"),
  vehicleYearTo: int("vehicle_year_to"),
  
  // Pricing
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull(), // e.g., "USD", "ZWL", "ZIG", "GBP", "EUR", "JPY"
  
  // Import costs (for international suppliers)
  shippingCost: decimal("shipping_cost", { precision: 10, scale: 2 }),
  customsDuty: decimal("customs_duty", { precision: 10, scale: 2 }),
  clearingFees: decimal("clearing_fees", { precision: 10, scale: 2 }),
  forexCharges: decimal("forex_charges", { precision: 10, scale: 2 }),
  leadTimeDays: int("lead_time_days"), // Estimated delivery time
  
  // Part type/quality
  partType: mysqlEnum("part_type", ["OEM", "OEM_Equivalent", "Aftermarket", "Used", "Unknown"]).default("Unknown"),
  
  // Quantity (if specified in quote)
  quantity: int("quantity").default(1),
  
  // Approval status (can approve/reject individual line items)
  approved: boolean("approved").default(false),
  rejectionReason: text("rejection_reason"),
  
  // Metadata
  extractedAt: timestamp("extracted_at").defaultNow().notNull(),
  lineNumber: int("line_number"), // Line number in original quote document
});

export type SupplierQuoteLineItem = typeof supplierQuoteLineItems.$inferSelect;
export type InsertSupplierQuoteLineItem = typeof supplierQuoteLineItems.$inferInsert;

/**
 * Supplier Performance Metrics - Track supplier quote accuracy and competitiveness
 */
export const supplierPerformanceMetrics = mysqlTable("supplier_performance_metrics", {
  id: int("id").primaryKey().autoincrement(),
  
  supplierName: varchar("supplier_name", { length: 255 }).notNull().unique(),
  supplierCountry: varchar("supplier_country", { length: 100 }),
  
  // Quote statistics
  totalQuotesSubmitted: int("total_quotes_submitted").default(0),
  totalQuotesApproved: int("total_quotes_approved").default(0),
  totalQuotesRejected: int("total_quotes_rejected").default(0),
  
  // Pricing competitiveness (vs market average)
  avgPriceVsMarket: decimal("avg_price_vs_market", { precision: 5, scale: 2 }), // e.g., 0.95 = 5% below market avg
  
  // Data quality
  avgExtractionConfidence: decimal("avg_extraction_confidence", { precision: 5, scale: 2 }),
  
  // Relationship
  firstQuoteDate: date("first_quote_date"),
  lastQuoteDate: date("last_quote_date"),
  
  // Metadata
  lastUpdated: timestamp("last_updated").defaultNow().notNull(),
});

export type SupplierPerformanceMetric = typeof supplierPerformanceMetrics.$inferSelect;
export type InsertSupplierPerformanceMetric = typeof supplierPerformanceMetrics.$inferInsert;

// ============================================================================
// TENANT CONFIGURATION TABLES
// ============================================================================
// Multi-tenant insurer platform configuration
// Note: TEXT field defaults handled in application code (TiDB limitation)

/**
 * Insurer Tenants - Insurance companies leasing the platform
 */
export const insurerTenants = mysqlTable("insurer_tenants", {
  id: varchar("id", { length: 64 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  displayName: varchar("display_name", { length: 255 }).notNull(),
  logoUrl: text("logo_url"), // S3 URL for custom logo
  primaryColor: varchar("primary_color", { length: 7 }).default("#10b981"), // Default: KINGA emerald
  secondaryColor: varchar("secondary_color", { length: 7 }).default("#64748b"), // Default: slate
  
  // Multi-currency support (Zimbabwe market: USD + ZIG)
  primaryCurrency: varchar("primary_currency", { length: 3 }).default("USD"), // ISO 4217 code
  primaryCurrencySymbol: varchar("primary_currency_symbol", { length: 10 }).default("$"),
  secondaryCurrency: varchar("secondary_currency", { length: 3 }), // Optional second currency (e.g., ZIG)
  secondaryCurrencySymbol: varchar("secondary_currency_symbol", { length: 10 }), // e.g., "ZIG" or "ZWL$"
  exchangeRate: decimal("exchange_rate", { precision: 10, scale: 4 }), // Secondary to primary rate
  
  // Document naming (default handled in app: KINGA-{DocType}-{ClaimNumber}-v{Version}-{Date}.pdf)
  documentNamingTemplate: text("document_naming_template"),
  
  // Retention policies
  documentRetentionYears: int("document_retention_years").default(7),
  fraudRetentionYears: int("fraud_retention_years").default(10),
  
  // Approval thresholds (in cents)
  requireManagerApprovalAbove: decimal("require_manager_approval_above", { precision: 10, scale: 2 }).default("10000.00"),
  highValueThreshold: decimal("high_value_threshold", { precision: 10, scale: 2 }).default("10000.00"),
  autoApproveBelow: decimal("auto_approve_below", { precision: 10, scale: 2 }).default("5000.00"),
  
  // Fraud detection
  fraudFlagThreshold: decimal("fraud_flag_threshold", { precision: 3, scale: 2 }).default("0.70"), // 0-1 scale
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type InsurerTenant = typeof insurerTenants.$inferSelect;
export type InsertInsurerTenant = typeof insurerTenants.$inferInsert;

/**
 * Tenant Role Configs - Which roles are enabled for each tenant
 */
export const tenantRoleConfigs = mysqlTable("tenant_role_configs", {
  tenantId: varchar("tenant_id", { length: 64 }).notNull(),
  roleKey: mysqlEnum("role_key", ["executive", "claims_manager", "claims_processor", "assessor_internal", "assessor_external", "risk_manager", "insurer_admin"]).notNull(),
  enabled: tinyint("enabled").default(1).notNull(),
  displayName: varchar("display_name", { length: 100 }), // Custom role name (e.g., "Senior Adjuster" instead of "Claims Manager")
  
  // Permissions (JSON array of permission keys, default handled in app)
  permissions: text("permissions"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.tenantId, table.roleKey] }),
}));

export type TenantRoleConfig = typeof tenantRoleConfigs.$inferSelect;
export type InsertTenantRoleConfig = typeof tenantRoleConfigs.$inferInsert;

/**
 * Tenant Workflow Configs - Approval thresholds and routing rules per tenant
 */
export const tenantWorkflowConfigs = mysqlTable("tenant_workflow_configs", {
  id: varchar("id", { length: 64 }).primaryKey(),
  tenantId: varchar("tenant_id", { length: 64 }).notNull().unique(),
  
  // Approval thresholds (in cents)
  requireExecutiveApprovalAbove: decimal("require_executive_approval_above", { precision: 10, scale: 2 }).default("50000.00"),
  requireManagerApprovalAbove: decimal("require_manager_approval_above", { precision: 10, scale: 2 }).default("10000.00"),
  autoApproveBelow: decimal("auto_approve_below", { precision: 10, scale: 2 }).default("5000.00"),
  
  // Fraud detection
  fraudFlagThreshold: decimal("fraud_flag_threshold", { precision: 3, scale: 2 }).default("0.70"),
  
  // Assessment routing
  requireInternalAssessment: tinyint("require_internal_assessment").default(0).notNull(), // 0 = external only, 1 = all claims
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type TenantWorkflowConfig = typeof tenantWorkflowConfigs.$inferSelect;
export type InsertTenantWorkflowConfig = typeof tenantWorkflowConfigs.$inferInsert;

/**
 * Document Naming Templates - Tenant-customizable document naming conventions
 */
export const documentNamingTemplates = mysqlTable("document_naming_templates", {
  id: varchar("id", { length: 64 }).primaryKey(),
  tenantId: varchar("tenant_id", { length: 64 }).notNull(),
  docType: mysqlEnum("doc_type", ["claim", "assessment", "report", "approval"]).notNull(),
  
  // Template string (e.g., "{TenantCode}-{DocType}-{ClaimNumber}-v{Version}-{Date}.pdf")
  template: varchar("template", { length: 500 }).notNull(),
  
  // Description (default handled in app)
  description: text("description"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  uniqueTenantDocType: unique().on(table.tenantId, table.docType),
}));

export type DocumentNamingTemplate = typeof documentNamingTemplates.$inferSelect;
export type InsertDocumentNamingTemplate = typeof documentNamingTemplates.$inferInsert;

/**
 * Document Versions - Immutable version history for all generated documents
 */
export const documentVersions = mysqlTable("document_versions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  tenantId: varchar("tenant_id", { length: 64 }).notNull(),
  claimId: int("claim_id").notNull(),
  
  documentName: varchar("document_name", { length: 500 }).notNull(),
  documentUrl: text("document_url").notNull(), // S3 URL
  docType: mysqlEnum("doc_type", ["claim", "assessment", "report", "approval"]).notNull(),
  version: int("version").notNull(),
  
  // Approval tracking
  createdBy: int("created_by").notNull(),
  approvedBy: int("approved_by"),
  approvedAt: timestamp("approved_at"),
  
  // Retention (Unix timestamp for deletion)
  retentionUntil: timestamp("retention_until").notNull(),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  uniqueClaimDocVersion: unique().on(table.claimId, table.docType, table.version),
}));

export type DocumentVersion = typeof documentVersions.$inferSelect;
export type InsertDocumentVersion = typeof documentVersions.$inferInsert;

/**
 * ISO Audit Logs - Immutable audit trail for all user actions (ISO 9001:2015 compliance)
 */
export const isoAuditLogs = mysqlTable("iso_audit_logs", {
  id: varchar("id", { length: 64 }).primaryKey(),
  tenantId: varchar("tenant_id", { length: 64 }).notNull(),
  userId: int("user_id").notNull(),
  userRole: varchar("user_role", { length: 50 }).notNull(),
  
  actionType: mysqlEnum("action_type", ["create", "update", "approve", "reject", "view", "delete"]).notNull(),
  resourceType: varchar("resource_type", { length: 50 }).notNull(), // 'claim', 'assessment', 'document', 'user'
  resourceId: varchar("resource_id", { length: 64 }).notNull(),
  
  // State snapshots (JSON, default handled in app)
  beforeState: text("before_state"),
  afterState: text("after_state"),
  
  // Session tracking
  ipAddress: varchar("ip_address", { length: 45 }),
  sessionId: varchar("session_id", { length: 64 }),
  
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  
  // Tamper detection (SHA-256 hash)
  integrityHash: varchar("integrity_hash", { length: 64 }).notNull(),
});

export type IsoAuditLog = typeof isoAuditLogs.$inferSelect;
export type InsertIsoAuditLog = typeof isoAuditLogs.$inferInsert;

/**
 * Quality Metrics - Process performance metrics for ISO compliance reporting
 */
export const qualityMetrics = mysqlTable("quality_metrics", {
  id: varchar("id", { length: 64 }).primaryKey(),
  tenantId: varchar("tenant_id", { length: 64 }).notNull(),
  
  metricType: mysqlEnum("metric_type", ["processing_time", "approval_rate", "fraud_detection", "cost_savings"]).notNull(),
  metricValue: decimal("metric_value", { precision: 10, scale: 2 }).notNull(),
  
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  calculatedAt: timestamp("calculated_at").defaultNow().notNull(),
});

export type QualityMetric = typeof qualityMetrics.$inferSelect;
export type InsertQualityMetric = typeof qualityMetrics.$inferInsert;

/**
 * Risk Register - ISO 31000 risk management tracking per claim
 */
export const riskRegister = mysqlTable("risk_register", {
  id: varchar("id", { length: 64 }).primaryKey(),
  tenantId: varchar("tenant_id", { length: 64 }).notNull(),
  claimId: int("claim_id").notNull(),
  
  riskType: mysqlEnum("risk_type", ["fraud", "cost_overrun", "compliance", "operational"]).notNull(),
  
  // Risk scoring (1-5 scale)
  likelihood: int("likelihood").notNull(),
  impact: int("impact").notNull(),
  riskScore: int("risk_score").notNull(), // likelihood * impact
  
  // Risk details (default handled in app)
  description: text("description").notNull(),
  treatmentPlan: mysqlEnum("treatment_plan", ["accept", "mitigate", "transfer", "avoid"]),
  treatmentNotes: text("treatment_notes"),
  
  // Tracking
  identifiedBy: int("identified_by").notNull(),
  identifiedAt: timestamp("identified_at").defaultNow().notNull(),
  reviewedBy: int("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  
  status: mysqlEnum("status", ["open", "mitigated", "closed"]).default("open").notNull(),
});

export type RiskRegisterEntry = typeof riskRegister.$inferSelect;
export type InsertRiskRegisterEntry = typeof riskRegister.$inferInsert;

/**
 * Training Records - User competency and training tracking
 */
export const trainingRecords = mysqlTable("training_records", {
  id: varchar("id", { length: 64 }).primaryKey(),
  tenantId: varchar("tenant_id", { length: 64 }).notNull(),
  userId: int("user_id").notNull(),
  
  trainingType: mysqlEnum("training_type", ["fraud_detection", "iso_compliance", "role_onboarding"]).notNull(),
  
  completionDate: timestamp("completion_date").notNull(),
  expiryDate: timestamp("expiry_date"), // For certifications that require renewal
  
  trainer: varchar("trainer", { length: 255 }),
  assessmentScore: decimal("assessment_score", { precision: 5, scale: 2 }),
  certificateUrl: text("certificate_url"), // S3 URL
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type TrainingRecord = typeof trainingRecords.$inferSelect;
export type InsertTrainingRecord = typeof trainingRecords.$inferInsert;


/**
 * ============================================================
 * KINGA Agency Portal - Insurance Quotation & Renewal Management
 * ============================================================
 */

/**
 * Insurance Quotation Requests - Clients requesting insurance quotes
 */
export const quotationRequests = mysqlTable("quotation_requests", {
  id: int("id").autoincrement().primaryKey(),
  requestNumber: varchar("request_number", { length: 50 }).notNull().unique(),
  tenantId: varchar("tenant_id", { length: 255 }),
  
  // Requestor info
  userId: int("user_id"), // Linked user (if logged in)
  fullName: varchar("full_name", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  phone: varchar("phone", { length: 50 }),
  idNumber: varchar("id_number", { length: 20 }),
  
  // Insurance type
  insuranceType: mysqlEnum("insurance_type", [
    "comprehensive",
    "third_party",
    "third_party_fire_theft",
    "fleet",
    "commercial"
  ]).notNull(),
  
  // Vehicle details
  vehicleMake: varchar("vehicle_make", { length: 100 }).notNull(),
  vehicleModel: varchar("vehicle_model", { length: 100 }).notNull(),
  vehicleYear: int("vehicle_year").notNull(),
  vehicleRegistration: varchar("vehicle_registration", { length: 50 }),
  vehicleVin: varchar("vehicle_vin", { length: 50 }),
  vehicleValue: int("vehicle_value"), // Estimated value in cents
  vehicleUsage: mysqlEnum("vehicle_usage", ["private", "business", "both"]).default("private"),
  
  // Driver details
  driverAge: int("driver_age"),
  driverLicenseYears: int("driver_license_years"), // Years holding license
  claimsHistory: int("claims_history").default(0), // Number of previous claims
  
  // Coverage preferences
  excessAmount: int("excess_amount"), // Preferred excess in cents
  additionalCover: text("additional_cover"), // JSON array of extras: roadside, car hire, etc.
  
  // Supporting documents (JSON array of {type, url, fileName})
  documents: text("documents"),
  
  // Quote response
  quotedPremium: int("quoted_premium"), // Monthly premium in cents
  quotedAnnualPremium: int("quoted_annual_premium"), // Annual premium in cents
  quotedExcess: int("quoted_excess"), // Excess amount in cents
  quoteValidUntil: timestamp("quote_valid_until"),
  quoteNotes: text("quote_notes"), // Agent notes on the quote
  
  // Status tracking
  status: mysqlEnum("status", [
    "pending",
    "under_review",
    "quoted",
    "accepted",
    "rejected",
    "expired"
  ]).default("pending").notNull(),
  
  assignedAgentId: int("assigned_agent_id"), // KINGA agent handling the request
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type QuotationRequest = typeof quotationRequests.$inferSelect;
export type InsertQuotationRequest = typeof quotationRequests.$inferInsert;

// insurancePolicies table already defined above at line ~2820 - reuse existing table

/**
 * Agency Documents - Documents uploaded for quotation requests and policies
 */
export const agencyDocuments = mysqlTable("agency_documents", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: varchar("tenant_id", { length: 255 }),
  
  // Link to either a quotation request or policy
  quotationRequestId: int("quotation_request_id"),
  policyId: int("policy_id"),
  
  // Document details
  documentType: mysqlEnum("document_type", [
    "id_document",
    "drivers_license",
    "vehicle_registration",
    "proof_of_address",
    "bank_statement",
    "vehicle_photos",
    "previous_policy",
    "claims_history",
    "other"
  ]).notNull(),
  
  title: varchar("title", { length: 255 }).notNull(),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  fileUrl: text("file_url").notNull(), // S3 URL
  fileSize: int("file_size"), // In bytes
  mimeType: varchar("mime_type", { length: 100 }),
  
  uploadedBy: int("uploaded_by").notNull(), // User ID
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type AgencyDocument = typeof agencyDocuments.$inferSelect;
export type InsertAgencyDocument = typeof agencyDocuments.$inferInsert;


/**
 * ========================================
 * WORKFLOW GOVERNANCE TABLES
 * ========================================
 * Tables supporting the workflow governance system
 */

/**
 * Workflow Configuration - Insurer-level workflow settings
 */
export const workflowConfiguration = mysqlTable("workflow_configuration", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: varchar("tenant_id", { length: 255 }).notNull().unique(),
  
  // Role configuration
  riskManagerEnabled: tinyint("risk_manager_enabled").default(1).notNull(),
  
  // Threshold configuration
  highValueThreshold: int("high_value_threshold").default(1000000).notNull(), // $10,000 in cents
  executiveReviewThreshold: int("executive_review_threshold").default(5000000).notNull(), // $50,000 in cents
  
  // Feature toggles
  aiFastTrackEnabled: tinyint("ai_fast_track_enabled").default(0).notNull(),
  externalAssessorEnabled: tinyint("external_assessor_enabled").default(1).notNull(),
  
  // Segregation configuration
  maxSequentialStagesByUser: int("max_sequential_stages_by_user").default(2).notNull(),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type WorkflowConfiguration = typeof workflowConfiguration.$inferSelect;
export type InsertWorkflowConfiguration = typeof workflowConfiguration.$inferInsert;

/**
 * Workflow Audit Trail - Immutable audit log for all state transitions
 */
export const workflowAuditTrail = mysqlTable("workflow_audit_trail", {
  id: int("id").autoincrement().primaryKey(),
  claimId: int("claim_id").notNull(),
  userId: int("user_id").notNull(),
  userRole: mysqlEnum("user_role", ["claims_processor", "assessor_internal", "assessor_external", "risk_manager", "claims_manager", "executive", "insurer_admin"]).notNull(),
  
  // State transition
  previousState: mysqlEnum("previous_state", [
    "created",
    "intake_verified",
    "assigned",
    "under_assessment",
    "internal_review",
    "technical_approval",
    "financial_decision",
    "payment_authorized",
    "closed",
    "disputed"
  ]),
  newState: mysqlEnum("new_state", [
    "created",
    "intake_verified",
    "assigned",
    "under_assessment",
    "internal_review",
    "technical_approval",
    "financial_decision",
    "payment_authorized",
    "closed",
    "disputed"
  ]).notNull(),
  
  // Decision context
  decisionValue: int("decision_value"), // Amount in cents
  aiScore: int("ai_score"), // AI fraud score or confidence
  confidenceScore: int("confidence_score"), // 0-100
  comments: text("comments"),
  metadata: text("metadata"), // JSON string for additional data
  
  // Executive override tracking
  executiveOverride: int("executive_override").default(0), // 0 = false, 1 = true
  overrideReason: text("override_reason"),
  
  // Immutable timestamp
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type WorkflowAuditTrail = typeof workflowAuditTrail.$inferSelect;
export type InsertWorkflowAuditTrail = typeof workflowAuditTrail.$inferInsert;

/**
 * Claim Involvement Tracking - Track user involvement for segregation of duties
 */
export const claimInvolvementTracking = mysqlTable("claim_involvement_tracking", {
  id: int("id").autoincrement().primaryKey(),
  claimId: int("claim_id").notNull(),
  userId: int("user_id").notNull(),
  
  // Critical stage tracking
  workflowStage: mysqlEnum("workflow_stage", [
    "assessment",
    "technical_approval",
    "financial_decision",
    "payment_authorization"
  ]).notNull(),
  
  actionType: mysqlEnum("action_type", [
    "transition_state",
    "approve_technical",
    "authorize_payment",
    "close_claim",
    "redirect_claim",
    "add_assessment"
  ]).notNull(),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ClaimInvolvementTracking = typeof claimInvolvementTracking.$inferSelect;
export type InsertClaimInvolvementTracking = typeof claimInvolvementTracking.$inferInsert;
