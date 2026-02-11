/**
 * Event Integration for Existing KINGA Services
 * 
 * Integrates the event-driven architecture into existing monolithic services.
 * Provides helper functions to emit events from current business logic.
 * 
 * This is a transitional module during the microservices migration.
 */

import { EventPublisher } from '../../shared/events/src/publisher/event-publisher';
import { PublishOptions } from '../../shared/events/src/types/base';
import { initializeKafkaClient } from '../../shared/events/src/utils/kafka-client';
import { getTopicName } from '../../shared/events/src/schemas/index';

/**
 * Singleton event publisher for the monolith
 */
class KingaEventIntegration {
  private static instance: KingaEventIntegration;
  private publisher: EventPublisher | null = null;
  private isInitialized: boolean = false;

  private constructor() {}

  /**
   * Get singleton instance
   */
  public static getInstance(): KingaEventIntegration {
    if (!KingaEventIntegration.instance) {
      KingaEventIntegration.instance = new KingaEventIntegration();
    }
    return KingaEventIntegration.instance;
  }

  /**
   * Initialize event system
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Initialize Kafka client from environment
      initializeKafkaClient();

      // Create publisher
      this.publisher = new EventPublisher({
        serviceName: 'kinga-monolith',
        validateEvents: true,
      });

      await this.publisher.initialize();

      this.isInitialized = true;
      console.log('[EventIntegration] Initialized successfully');
    } catch (error) {
      console.error('[EventIntegration] Failed to initialize:', error);
      // Don't throw - allow app to continue without events in development
      if (process.env.NODE_ENV === 'production') {
        throw error;
      }
    }
  }

  /**
   * Publish event (with graceful degradation if not initialized)
   */
  private async publishEvent<T>(
    eventType: string,
    payload: T,
    service: string,
    entity: string,
    event: string
  ): Promise<void> {
    if (!this.isInitialized || !this.publisher) {
      console.warn(`[EventIntegration] Skipping event ${eventType} - not initialized`);
      return;
    }

    try {
      const topic = getTopicName(service, entity, event);
      
      await this.publisher.publish(eventType, payload, {
        topic,
        key: (payload as any).claimId?.toString() || (payload as any).userId?.toString(),
      } as PublishOptions);
    } catch (error) {
      console.error(`[EventIntegration] Failed to publish ${eventType}:`, error);
      // Don't throw - allow business logic to continue
    }
  }

  // ============================================================================
  // CLAIM INTAKE EVENTS
  // ============================================================================

  /**
   * Emit ClaimSubmitted event
   */
  public async emitClaimSubmitted(payload: {
    claimId: number;
    claimNumber: string;
    claimantId: number;
    policyNumber: string;
    incidentDate: Date;
    vehicleId: number;
    damageDescription: string;
    estimatedCost?: number;
  }): Promise<void> {
    await this.publishEvent(
      'ClaimSubmitted',
      payload,
      'claim-intake',
      'claim',
      'submitted'
    );
  }

  /**
   * Emit DocumentUploaded event
   */
  public async emitDocumentUploaded(payload: {
    documentId: number;
    claimId: number;
    documentType: 'damage_photo' | 'police_report' | 'invoice' | 'other';
    fileUrl: string;
    uploadedBy: number;
  }): Promise<void> {
    await this.publishEvent(
      'DocumentUploaded',
      payload,
      'claim-intake',
      'document',
      'uploaded'
    );
  }

  /**
   * Emit ClaimStatusChanged event
   */
  public async emitClaimStatusChanged(payload: {
    claimId: number;
    previousStatus: string;
    newStatus: string;
    changedBy: number;
    reason?: string;
  }): Promise<void> {
    await this.publishEvent(
      'ClaimStatusChanged',
      payload,
      'claim-intake',
      'claim',
      'status-changed'
    );
  }

  // ============================================================================
  // AI DAMAGE EVENTS
  // ============================================================================

  /**
   * Emit AssessmentStarted event
   */
  public async emitAssessmentStarted(payload: {
    assessmentId: number;
    claimId: number;
    assessmentType: 'ai' | 'human' | 'hybrid';
    startedAt: Date;
  }): Promise<void> {
    await this.publishEvent(
      'AssessmentStarted',
      payload,
      'ai-damage',
      'assessment',
      'started'
    );
  }

  /**
   * Emit AssessmentCompleted event
   */
  public async emitAssessmentCompleted(payload: {
    assessmentId: number;
    claimId: number;
    totalCost: number;
    laborCost: number;
    partsCost: number;
    paintCost: number;
    confidence: number;
    damageAreas: string[];
    completedAt: Date;
  }): Promise<void> {
    await this.publishEvent(
      'AssessmentCompleted',
      payload,
      'ai-damage',
      'assessment',
      'completed'
    );
  }

  /**
   * Emit DamageDetected event
   */
  public async emitDamageDetected(payload: {
    assessmentId: number;
    claimId: number;
    damageType: string;
    severity: 'minor' | 'moderate' | 'severe' | 'total_loss';
    affectedParts: string[];
    confidence: number;
    imageUrl?: string;
  }): Promise<void> {
    await this.publishEvent(
      'DamageDetected',
      payload,
      'ai-damage',
      'damage',
      'detected'
    );
  }

  // ============================================================================
  // FRAUD DETECTION EVENTS
  // ============================================================================

  /**
   * Emit FraudAlertRaised event
   */
  public async emitFraudAlertRaised(payload: {
    alertId: number;
    claimId: number;
    fraudScore: number;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    indicators: string[];
    assignedTo?: number;
    requiresInvestigation: boolean;
  }): Promise<void> {
    await this.publishEvent(
      'FraudAlertRaised',
      payload,
      'fraud-detection',
      'alert',
      'raised'
    );
  }

  /**
   * Emit FraudInvestigationCompleted event
   */
  public async emitFraudInvestigationCompleted(payload: {
    investigationId: number;
    claimId: number;
    outcome: 'cleared' | 'suspicious' | 'confirmed_fraud';
    investigatedBy: number;
    findings: string;
    completedAt: Date;
  }): Promise<void> {
    await this.publishEvent(
      'FraudInvestigationCompleted',
      payload,
      'fraud-detection',
      'investigation',
      'completed'
    );
  }

  // ============================================================================
  // PHYSICS VALIDATION EVENTS
  // ============================================================================

  /**
   * Emit PhysicsValidationCompleted event
   */
  public async emitPhysicsValidationCompleted(payload: {
    validationId: number;
    claimId: number;
    isConsistent: boolean;
    confidence: number;
    inconsistencies: string[];
    simulationData: any;
  }): Promise<void> {
    await this.publishEvent(
      'PhysicsValidationCompleted',
      payload,
      'physics-simulation',
      'validation',
      'completed'
    );
  }

  // ============================================================================
  // COST OPTIMISATION EVENTS
  // ============================================================================

  /**
   * Emit QuoteReceived event
   */
  public async emitQuoteReceived(payload: {
    quoteId: number;
    claimId: number;
    panelBeaterId: number;
    totalCost: number;
    laborCost: number;
    partsCost: number;
    estimatedDays: number;
    receivedAt: Date;
  }): Promise<void> {
    await this.publishEvent(
      'QuoteReceived',
      payload,
      'cost-optimisation',
      'quote',
      'received'
    );
  }

  /**
   * Emit QuoteComparisonCompleted event
   */
  public async emitQuoteComparisonCompleted(payload: {
    claimId: number;
    quotes: Array<{
      quoteId: number;
      panelBeaterId: number;
      totalCost: number;
      score: number;
    }>;
    recommendedQuoteId: number;
    potentialSavings: number;
  }): Promise<void> {
    await this.publishEvent(
      'QuoteComparisonCompleted',
      payload,
      'cost-optimisation',
      'comparison',
      'completed'
    );
  }

  // ============================================================================
  // WORKFLOW EVENTS
  // ============================================================================

  /**
   * Emit ApprovalRequested event
   */
  public async emitApprovalRequested(payload: {
    approvalId: number;
    claimId: number;
    approvalType: 'cost_threshold' | 'fraud_alert' | 'policy_exception' | 'total_loss';
    requiredApprovers: number[];
    requestedBy: number;
    deadline?: Date;
  }): Promise<void> {
    await this.publishEvent(
      'ApprovalRequested',
      payload,
      'workflow-engine',
      'approval',
      'requested'
    );
  }

  /**
   * Emit ApprovalDecisionMade event
   */
  public async emitApprovalDecisionMade(payload: {
    approvalId: number;
    claimId: number;
    decision: 'approved' | 'rejected' | 'escalated';
    decidedBy: number;
    comments?: string;
    decidedAt: Date;
  }): Promise<void> {
    await this.publishEvent(
      'ApprovalDecisionMade',
      payload,
      'workflow-engine',
      'approval',
      'decision-made'
    );
  }

  // ============================================================================
  // IDENTITY EVENTS
  // ============================================================================

  /**
   * Emit UserCreated event
   */
  public async emitUserCreated(payload: {
    userId: number;
    email: string;
    role: string;
    organizationId?: number;
  }): Promise<void> {
    await this.publishEvent(
      'UserCreated',
      payload,
      'identity-access',
      'user',
      'created'
    );
  }

  /**
   * Emit UserLoggedIn event
   */
  public async emitUserLoggedIn(payload: {
    userId: number;
    ipAddress: string;
    userAgent: string;
  }): Promise<void> {
    await this.publishEvent(
      'UserLoggedIn',
      payload,
      'identity-access',
      'user',
      'logged-in'
    );
  }

  /**
   * Graceful shutdown
   */
  public async shutdown(): Promise<void> {
    if (this.publisher) {
      await this.publisher.shutdown();
    }
    this.isInitialized = false;
  }
}

/**
 * Export singleton instance
 */
export const eventIntegration = KingaEventIntegration.getInstance();

/**
 * Initialize event system on module load (async)
 */
if (process.env.KAFKA_ENABLED !== 'false') {
  eventIntegration.initialize().catch((error) => {
    console.error('[EventIntegration] Initialization failed:', error);
  });
}
