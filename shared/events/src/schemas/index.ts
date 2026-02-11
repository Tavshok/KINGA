/**
 * KINGA Event Schemas with Versioning Support
 * 
 * Defines all domain event schemas using Zod for runtime validation.
 * Each event schema includes version information for backward compatibility.
 * 
 * Based on the service decomposition plan event definitions.
 */

import { z } from 'zod';

/**
 * Base event metadata schema
 */
export const EventMetadataSchema = z.object({
  correlationId: z.string().optional(),
  causationId: z.string().optional(),
  userId: z.number().optional(),
  source: z.string(),
});

/**
 * Base domain event schema
 */
export const DomainEventSchema = z.object({
  eventId: z.string(),
  eventType: z.string(),
  timestamp: z.date(),
  version: z.string(),
  payload: z.any(),
  metadata: EventMetadataSchema,
});

// ============================================================================
// CLAIM INTAKE SERVICE EVENTS
// ============================================================================

/**
 * Claim Submitted Event (v1.0.0)
 */
export const ClaimSubmittedPayloadSchema = z.object({
  claimId: z.number(),
  claimNumber: z.string(),
  claimantId: z.number(),
  policyNumber: z.string(),
  incidentDate: z.date(),
  vehicleId: z.number(),
  damageDescription: z.string(),
  estimatedCost: z.number().optional(),
});

export const ClaimSubmittedEventSchema = DomainEventSchema.extend({
  eventType: z.literal('ClaimSubmitted'),
  version: z.literal('1.0.0'),
  payload: ClaimSubmittedPayloadSchema,
});

export type ClaimSubmittedEvent = z.infer<typeof ClaimSubmittedEventSchema>;

/**
 * Document Uploaded Event (v1.0.0)
 */
export const DocumentUploadedPayloadSchema = z.object({
  documentId: z.number(),
  claimId: z.number(),
  documentType: z.enum(['damage_photo', 'police_report', 'invoice', 'other']),
  fileUrl: z.string(),
  uploadedBy: z.number(),
});

export const DocumentUploadedEventSchema = DomainEventSchema.extend({
  eventType: z.literal('DocumentUploaded'),
  version: z.literal('1.0.0'),
  payload: DocumentUploadedPayloadSchema,
});

export type DocumentUploadedEvent = z.infer<typeof DocumentUploadedEventSchema>;

/**
 * Claim Status Changed Event (v1.0.0)
 */
export const ClaimStatusChangedPayloadSchema = z.object({
  claimId: z.number(),
  previousStatus: z.string(),
  newStatus: z.string(),
  changedBy: z.number(),
  reason: z.string().optional(),
});

export const ClaimStatusChangedEventSchema = DomainEventSchema.extend({
  eventType: z.literal('ClaimStatusChanged'),
  version: z.literal('1.0.0'),
  payload: ClaimStatusChangedPayloadSchema,
});

export type ClaimStatusChangedEvent = z.infer<typeof ClaimStatusChangedEventSchema>;

// ============================================================================
// AI DAMAGE SERVICE EVENTS
// ============================================================================

/**
 * Assessment Started Event (v1.0.0)
 */
export const AssessmentStartedPayloadSchema = z.object({
  assessmentId: z.number(),
  claimId: z.number(),
  assessmentType: z.enum(['ai', 'human', 'hybrid']),
  startedAt: z.date(),
});

export const AssessmentStartedEventSchema = DomainEventSchema.extend({
  eventType: z.literal('AssessmentStarted'),
  version: z.literal('1.0.0'),
  payload: AssessmentStartedPayloadSchema,
});

export type AssessmentStartedEvent = z.infer<typeof AssessmentStartedEventSchema>;

/**
 * Assessment Completed Event (v1.0.0)
 */
export const AssessmentCompletedPayloadSchema = z.object({
  assessmentId: z.number(),
  claimId: z.number(),
  totalCost: z.number(),
  laborCost: z.number(),
  partsCost: z.number(),
  paintCost: z.number(),
  confidence: z.number(),
  damageAreas: z.array(z.string()),
  completedAt: z.date(),
});

export const AssessmentCompletedEventSchema = DomainEventSchema.extend({
  eventType: z.literal('AssessmentCompleted'),
  version: z.literal('1.0.0'),
  payload: AssessmentCompletedPayloadSchema,
});

export type AssessmentCompletedEvent = z.infer<typeof AssessmentCompletedEventSchema>;

/**
 * Damage Detected Event (v1.0.0)
 */
export const DamageDetectedPayloadSchema = z.object({
  assessmentId: z.number(),
  claimId: z.number(),
  damageType: z.string(),
  severity: z.enum(['minor', 'moderate', 'severe', 'total_loss']),
  affectedParts: z.array(z.string()),
  confidence: z.number(),
  imageUrl: z.string().optional(),
});

export const DamageDetectedEventSchema = DomainEventSchema.extend({
  eventType: z.literal('DamageDetected'),
  version: z.literal('1.0.0'),
  payload: DamageDetectedPayloadSchema,
});

export type DamageDetectedEvent = z.infer<typeof DamageDetectedEventSchema>;

// ============================================================================
// FRAUD DETECTION SERVICE EVENTS
// ============================================================================

/**
 * Fraud Alert Raised Event (v1.0.0)
 */
export const FraudAlertRaisedPayloadSchema = z.object({
  alertId: z.number(),
  claimId: z.number(),
  fraudScore: z.number(),
  riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
  indicators: z.array(z.string()),
  assignedTo: z.number().optional(),
  requiresInvestigation: z.boolean(),
});

export const FraudAlertRaisedEventSchema = DomainEventSchema.extend({
  eventType: z.literal('FraudAlertRaised'),
  version: z.literal('1.0.0'),
  payload: FraudAlertRaisedPayloadSchema,
});

export type FraudAlertRaisedEvent = z.infer<typeof FraudAlertRaisedEventSchema>;

/**
 * Fraud Investigation Completed Event (v1.0.0)
 */
export const FraudInvestigationCompletedPayloadSchema = z.object({
  investigationId: z.number(),
  claimId: z.number(),
  outcome: z.enum(['cleared', 'suspicious', 'confirmed_fraud']),
  investigatedBy: z.number(),
  findings: z.string(),
  completedAt: z.date(),
});

export const FraudInvestigationCompletedEventSchema = DomainEventSchema.extend({
  eventType: z.literal('FraudInvestigationCompleted'),
  version: z.literal('1.0.0'),
  payload: FraudInvestigationCompletedPayloadSchema,
});

export type FraudInvestigationCompletedEvent = z.infer<typeof FraudInvestigationCompletedEventSchema>;

// ============================================================================
// PHYSICS SIMULATION SERVICE EVENTS
// ============================================================================

/**
 * Physics Validation Completed Event (v1.0.0)
 */
export const PhysicsValidationCompletedPayloadSchema = z.object({
  validationId: z.number(),
  claimId: z.number(),
  isConsistent: z.boolean(),
  confidence: z.number(),
  inconsistencies: z.array(z.string()),
  simulationData: z.any(),
});

export const PhysicsValidationCompletedEventSchema = DomainEventSchema.extend({
  eventType: z.literal('PhysicsValidationCompleted'),
  version: z.literal('1.0.0'),
  payload: PhysicsValidationCompletedPayloadSchema,
});

export type PhysicsValidationCompletedEvent = z.infer<typeof PhysicsValidationCompletedEventSchema>;

// ============================================================================
// COST OPTIMISATION SERVICE EVENTS
// ============================================================================

/**
 * Quote Received Event (v1.0.0)
 */
export const QuoteReceivedPayloadSchema = z.object({
  quoteId: z.number(),
  claimId: z.number(),
  panelBeaterId: z.number(),
  totalCost: z.number(),
  laborCost: z.number(),
  partsCost: z.number(),
  estimatedDays: z.number(),
  receivedAt: z.date(),
});

export const QuoteReceivedEventSchema = DomainEventSchema.extend({
  eventType: z.literal('QuoteReceived'),
  version: z.literal('1.0.0'),
  payload: QuoteReceivedPayloadSchema,
});

export type QuoteReceivedEvent = z.infer<typeof QuoteReceivedEventSchema>;

/**
 * Quote Comparison Completed Event (v1.0.0)
 */
export const QuoteComparisonCompletedPayloadSchema = z.object({
  claimId: z.number(),
  quotes: z.array(z.object({
    quoteId: z.number(),
    panelBeaterId: z.number(),
    totalCost: z.number(),
    score: z.number(),
  })),
  recommendedQuoteId: z.number(),
  potentialSavings: z.number(),
});

export const QuoteComparisonCompletedEventSchema = DomainEventSchema.extend({
  eventType: z.literal('QuoteComparisonCompleted'),
  version: z.literal('1.0.0'),
  payload: QuoteComparisonCompletedPayloadSchema,
});

export type QuoteComparisonCompletedEvent = z.infer<typeof QuoteComparisonCompletedEventSchema>;

// ============================================================================
// WORKFLOW ENGINE SERVICE EVENTS
// ============================================================================

/**
 * Approval Requested Event (v1.0.0)
 */
export const ApprovalRequestedPayloadSchema = z.object({
  approvalId: z.number(),
  claimId: z.number(),
  approvalType: z.enum(['cost_threshold', 'fraud_alert', 'policy_exception', 'total_loss']),
  requiredApprovers: z.array(z.number()),
  requestedBy: z.number(),
  deadline: z.date().optional(),
});

export const ApprovalRequestedEventSchema = DomainEventSchema.extend({
  eventType: z.literal('ApprovalRequested'),
  version: z.literal('1.0.0'),
  payload: ApprovalRequestedPayloadSchema,
});

export type ApprovalRequestedEvent = z.infer<typeof ApprovalRequestedEventSchema>;

/**
 * Approval Decision Made Event (v1.0.0)
 */
export const ApprovalDecisionMadePayloadSchema = z.object({
  approvalId: z.number(),
  claimId: z.number(),
  decision: z.enum(['approved', 'rejected', 'escalated']),
  decidedBy: z.number(),
  comments: z.string().optional(),
  decidedAt: z.date(),
});

export const ApprovalDecisionMadeEventSchema = DomainEventSchema.extend({
  eventType: z.literal('ApprovalDecisionMade'),
  version: z.literal('1.0.0'),
  payload: ApprovalDecisionMadePayloadSchema,
});

export type ApprovalDecisionMadeEvent = z.infer<typeof ApprovalDecisionMadeEventSchema>;

/**
 * Workflow State Changed Event (v1.0.0)
 */
export const WorkflowStateChangedPayloadSchema = z.object({
  workflowId: z.number(),
  claimId: z.number(),
  previousState: z.string(),
  newState: z.string(),
  triggeredBy: z.string(),
});

export const WorkflowStateChangedEventSchema = DomainEventSchema.extend({
  eventType: z.literal('WorkflowStateChanged'),
  version: z.literal('1.0.0'),
  payload: WorkflowStateChangedPayloadSchema,
});

export type WorkflowStateChangedEvent = z.infer<typeof WorkflowStateChangedEventSchema>;

// ============================================================================
// FLEET RISK SERVICE EVENTS
// ============================================================================

/**
 * Fleet Risk Score Updated Event (v1.0.0)
 */
export const FleetRiskScoreUpdatedPayloadSchema = z.object({
  fleetId: z.number(),
  riskScore: z.number(),
  previousScore: z.number().optional(),
  factors: z.array(z.string()),
  updatedAt: z.date(),
});

export const FleetRiskScoreUpdatedEventSchema = DomainEventSchema.extend({
  eventType: z.literal('FleetRiskScoreUpdated'),
  version: z.literal('1.0.0'),
  payload: FleetRiskScoreUpdatedPayloadSchema,
});

export type FleetRiskScoreUpdatedEvent = z.infer<typeof FleetRiskScoreUpdatedEventSchema>;

// ============================================================================
// INSURER INTEGRATION SERVICE EVENTS
// ============================================================================

/**
 * External System Synced Event (v1.0.0)
 */
export const ExternalSystemSyncedPayloadSchema = z.object({
  syncId: z.number(),
  systemName: z.string(),
  entityType: z.string(),
  entityId: z.number(),
  syncStatus: z.enum(['success', 'failed', 'partial']),
  syncedAt: z.date(),
});

export const ExternalSystemSyncedEventSchema = DomainEventSchema.extend({
  eventType: z.literal('ExternalSystemSynced'),
  version: z.literal('1.0.0'),
  payload: ExternalSystemSyncedPayloadSchema,
});

export type ExternalSystemSyncedEvent = z.infer<typeof ExternalSystemSyncedEventSchema>;

// ============================================================================
// IDENTITY ACCESS SERVICE EVENTS
// ============================================================================

/**
 * User Created Event (v1.0.0)
 */
export const UserCreatedPayloadSchema = z.object({
  userId: z.number(),
  email: z.string(),
  role: z.string(),
  organizationId: z.number().optional(),
});

export const UserCreatedEventSchema = DomainEventSchema.extend({
  eventType: z.literal('UserCreated'),
  version: z.literal('1.0.0'),
  payload: UserCreatedPayloadSchema,
});

export type UserCreatedEvent = z.infer<typeof UserCreatedEventSchema>;

/**
 * User Logged In Event (v1.0.0)
 */
export const UserLoggedInPayloadSchema = z.object({
  userId: z.number(),
  ipAddress: z.string(),
  userAgent: z.string(),
});

export const UserLoggedInEventSchema = DomainEventSchema.extend({
  eventType: z.literal('UserLoggedIn'),
  version: z.literal('1.0.0'),
  payload: UserLoggedInPayloadSchema,
});

export type UserLoggedInEvent = z.infer<typeof UserLoggedInEventSchema>;

/**
 * Role Assigned Event (v1.0.0)
 */
export const RoleAssignedPayloadSchema = z.object({
  userId: z.number(),
  roleId: z.number(),
  roleName: z.string(),
  assignedBy: z.number(),
});

export const RoleAssignedEventSchema = DomainEventSchema.extend({
  eventType: z.literal('RoleAssigned'),
  version: z.literal('1.0.0'),
  payload: RoleAssignedPayloadSchema,
});

export type RoleAssignedEvent = z.infer<typeof RoleAssignedEventSchema>;

// ============================================================================
// NOTIFICATION SERVICE EVENTS
// ============================================================================

/**
 * Notification Sent Event (v1.0.0)
 */
export const NotificationSentPayloadSchema = z.object({
  notificationId: z.number(),
  userId: z.number(),
  channel: z.enum(['email', 'sms', 'push', 'in_app']),
  templateId: z.string(),
});

export const NotificationSentEventSchema = DomainEventSchema.extend({
  eventType: z.literal('NotificationSent'),
  version: z.literal('1.0.0'),
  payload: NotificationSentPayloadSchema,
});

export type NotificationSentEvent = z.infer<typeof NotificationSentEventSchema>;

// ============================================================================
// SCHEMA REGISTRY
// ============================================================================

/**
 * Schema registry for event validation
 */
export const EventSchemaRegistry = {
  // Claim Intake
  'ClaimSubmitted': ClaimSubmittedEventSchema,
  'DocumentUploaded': DocumentUploadedEventSchema,
  'ClaimStatusChanged': ClaimStatusChangedEventSchema,
  
  // AI Damage
  'AssessmentStarted': AssessmentStartedEventSchema,
  'AssessmentCompleted': AssessmentCompletedEventSchema,
  'DamageDetected': DamageDetectedEventSchema,
  
  // Fraud Detection
  'FraudAlertRaised': FraudAlertRaisedEventSchema,
  'FraudInvestigationCompleted': FraudInvestigationCompletedEventSchema,
  
  // Physics Simulation
  'PhysicsValidationCompleted': PhysicsValidationCompletedEventSchema,
  
  // Cost Optimisation
  'QuoteReceived': QuoteReceivedEventSchema,
  'QuoteComparisonCompleted': QuoteComparisonCompletedEventSchema,
  
  // Workflow Engine
  'ApprovalRequested': ApprovalRequestedEventSchema,
  'ApprovalDecisionMade': ApprovalDecisionMadeEventSchema,
  'WorkflowStateChanged': WorkflowStateChangedEventSchema,
  
  // Fleet Risk
  'FleetRiskScoreUpdated': FleetRiskScoreUpdatedEventSchema,
  
  // Insurer Integration
  'ExternalSystemSynced': ExternalSystemSyncedEventSchema,
  
  // Identity Access
  'UserCreated': UserCreatedEventSchema,
  'UserLoggedIn': UserLoggedInEventSchema,
  'RoleAssigned': RoleAssignedEventSchema,
  
  // Notification
  'NotificationSent': NotificationSentEventSchema,
} as const;

/**
 * Validate event against schema
 */
export function validateEvent(event: any): void {
  const schema = EventSchemaRegistry[event.eventType as keyof typeof EventSchemaRegistry];
  
  if (!schema) {
    throw new Error(`No schema found for event type: ${event.eventType}`);
  }
  
  schema.parse(event);
}

/**
 * Topic naming convention
 */
export function getTopicName(service: string, entity: string, event: string): string {
  return `${service}.${entity}.${event}`.toLowerCase();
}

/**
 * Export all event types
 */
export type KingaEvent =
  | ClaimSubmittedEvent
  | DocumentUploadedEvent
  | ClaimStatusChangedEvent
  | AssessmentStartedEvent
  | AssessmentCompletedEvent
  | DamageDetectedEvent
  | FraudAlertRaisedEvent
  | FraudInvestigationCompletedEvent
  | PhysicsValidationCompletedEvent
  | QuoteReceivedEvent
  | QuoteComparisonCompletedEvent
  | ApprovalRequestedEvent
  | ApprovalDecisionMadeEvent
  | WorkflowStateChangedEvent
  | FleetRiskScoreUpdatedEvent
  | ExternalSystemSyncedEvent
  | UserCreatedEvent
  | UserLoggedInEvent
  | RoleAssignedEvent
  | NotificationSentEvent;
