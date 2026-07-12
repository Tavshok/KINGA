/**
 * TRE v4.0 — Enhancement 1: Trust Event Bus
 *
 * Central event-driven trust monitoring layer. Every trust-impacting event
 * publishes a typed TrustEvent. Subscribers react to events to trigger
 * downstream reconciliation, impact analysis, and SLA tracking.
 *
 * Design: in-process pub/sub (no external broker required). The bus is a
 * singleton that survives the lifetime of the Node process. For multi-instance
 * deployments, events should additionally be persisted to the DB and replayed
 * on startup — that persistence layer is handled by trustEventStore.ts.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Event types
// ─────────────────────────────────────────────────────────────────────────────

export type TrustEventType =
  | "NEW_DOCUMENT_UPLOADED"
  | "NEW_IMAGE_UPLOADED"
  | "QUOTE_CHANGED"
  | "ASSESSOR_OVERRIDE"
  | "FRAUD_MODEL_UPDATED"
  | "REGULATORY_RULE_CHANGED"
  | "ENGINE_VERSION_CHANGED"
  | "EVIDENCE_GRAPH_UPDATED"
  | "CTO_CERTIFIED"
  | "CTO_INVALIDATED"
  | "CERTIFICATE_DOWNGRADED"
  | "CONFLICT_DETECTED"
  | "CONFLICT_RESOLVED"
  | "HUMAN_REVIEW_REQUESTED"
  | "HUMAN_REVIEW_COMPLETED"
  | "SLA_BREACH_DETECTED"
  | "MODEL_DRIFT_DETECTED"
  | "RECONCILIATION_TASK_CREATED"
  | "RECONCILIATION_TASK_RESOLVED"
  | "TRUST_SCORE_CHANGED"
  | "REGULATORY_COMPLIANCE_FAILED"
  | "SIMULATION_COMPLETED";

export type TrustEventSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type CTOSection =
  | "claimIdentity"
  | "vehicle"
  | "driver"
  | "incident"
  | "damage"
  | "physics"
  | "fraud"
  | "cost"
  | "workflow"
  | "decision"
  | "evidence"
  | "confidence"
  | "consistency"
  | "auditTrail"
  | "certification";

export interface TrustEvent {
  /** Unique event identifier */
  eventId: string;
  /** ISO-8601 timestamp */
  timestamp: string;
  /** Event type */
  type: TrustEventType;
  /** Claim this event relates to */
  claimId: string;
  /** Assessment ID (if known) */
  assessmentId?: string;
  /** CTO sections affected by this event */
  affectedNodes: CTOSection[];
  /** Severity of the trust impact */
  severity: TrustEventSeverity;
  /** Human-readable description */
  description: string;
  /** Arbitrary structured payload */
  payload?: Record<string, unknown>;
  /** Source system/actor that generated the event */
  source: string;
  /** Whether this event requires human review */
  requiresHumanReview: boolean;
  /** Correlation ID for tracing related events */
  correlationId?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Event factory helpers
// ─────────────────────────────────────────────────────────────────────────────

let _eventCounter = 0;

function nextEventId(): string {
  _eventCounter += 1;
  return `EVT-${Date.now()}-${String(_eventCounter).padStart(6, "0")}`;
}

export function makeEvent(
  partial: Omit<TrustEvent, "eventId" | "timestamp">
): TrustEvent {
  return {
    eventId: nextEventId(),
    timestamp: new Date().toISOString(),
    ...partial,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Predefined event constructors
// ─────────────────────────────────────────────────────────────────────────────

export function newDocumentUploadedEvent(
  claimId: string,
  documentType: string,
  source = "document-ingestion"
): TrustEvent {
  return makeEvent({
    type: "NEW_DOCUMENT_UPLOADED",
    claimId,
    affectedNodes: ["evidence", "damage", "cost", "certification"],
    severity: "MEDIUM",
    description: `New document uploaded: ${documentType}`,
    payload: { documentType },
    source,
    requiresHumanReview: false,
  });
}

export function newImageUploadedEvent(
  claimId: string,
  imageCount: number,
  source = "image-pipeline"
): TrustEvent {
  return makeEvent({
    type: "NEW_IMAGE_UPLOADED",
    claimId,
    affectedNodes: ["evidence", "damage", "physics", "fraud", "certification"],
    severity: "HIGH",
    description: `${imageCount} new damage image(s) uploaded`,
    payload: { imageCount },
    source,
    requiresHumanReview: false,
  });
}

export function quoteChangedEvent(
  claimId: string,
  previousAmountUsd: number,
  newAmountUsd: number,
  source = "quote-engine"
): TrustEvent {
  const delta = Math.abs(newAmountUsd - previousAmountUsd);
  const pctChange = previousAmountUsd > 0 ? delta / previousAmountUsd : 1;
  const severity: TrustEventSeverity =
    pctChange > 0.3 ? "HIGH" : pctChange > 0.1 ? "MEDIUM" : "LOW";
  return makeEvent({
    type: "QUOTE_CHANGED",
    claimId,
    affectedNodes: ["cost", "decision", "certification"],
    severity,
    description: `Quote changed from $${previousAmountUsd.toFixed(2)} to $${newAmountUsd.toFixed(2)} (${(pctChange * 100).toFixed(1)}% change)`,
    payload: { previousAmountUsd, newAmountUsd, deltaUsd: newAmountUsd - previousAmountUsd, pctChange },
    source,
    requiresHumanReview: pctChange > 0.3,
  });
}

export function assessorOverrideEvent(
  claimId: string,
  assessorId: string,
  overriddenField: string,
  previousValue: unknown,
  newValue: unknown,
  reason: string
): TrustEvent {
  return makeEvent({
    type: "ASSESSOR_OVERRIDE",
    claimId,
    affectedNodes: ["decision", "certification", "auditTrail"],
    severity: "HIGH",
    description: `Assessor ${assessorId} overrode ${overriddenField}: ${String(previousValue)} → ${String(newValue)}`,
    payload: { assessorId, overriddenField, previousValue, newValue, reason },
    source: `assessor:${assessorId}`,
    requiresHumanReview: true,
  });
}

export function fraudModelUpdatedEvent(
  modelVersion: string,
  affectedClaimIds: string[],
  confidenceDelta: number
): TrustEvent {
  return makeEvent({
    type: "FRAUD_MODEL_UPDATED",
    claimId: "SYSTEM",
    affectedNodes: ["fraud", "decision", "certification"],
    severity: Math.abs(confidenceDelta) > 0.1 ? "HIGH" : "MEDIUM",
    description: `Fraud model updated to ${modelVersion}. Confidence delta: ${(confidenceDelta * 100).toFixed(1)}%. ${affectedClaimIds.length} claims affected.`,
    payload: { modelVersion, affectedClaimIds, confidenceDelta },
    source: "model-governance",
    requiresHumanReview: Math.abs(confidenceDelta) > 0.15,
  });
}

export function regulatoryRuleChangedEvent(
  jurisdiction: string,
  ruleId: string,
  description: string
): TrustEvent {
  return makeEvent({
    type: "REGULATORY_RULE_CHANGED",
    claimId: "SYSTEM",
    affectedNodes: ["certification", "decision"],
    severity: "HIGH",
    description: `Regulatory rule ${ruleId} changed for ${jurisdiction}: ${description}`,
    payload: { jurisdiction, ruleId },
    source: "regulatory-governance",
    requiresHumanReview: true,
  });
}

export function engineVersionChangedEvent(
  engineName: string,
  previousVersion: string,
  newVersion: string,
  affectedClaimIds: string[]
): TrustEvent {
  return makeEvent({
    type: "ENGINE_VERSION_CHANGED",
    claimId: "SYSTEM",
    affectedNodes: ["certification", "physics", "fraud", "damage"],
    severity: "MEDIUM",
    description: `${engineName} updated from ${previousVersion} to ${newVersion}. ${affectedClaimIds.length} claims may need re-certification.`,
    payload: { engineName, previousVersion, newVersion, affectedClaimIds },
    source: "deployment-pipeline",
    requiresHumanReview: false,
  });
}

export function ctoInvalidatedEvent(
  claimId: string,
  reason: string,
  affectedNodes: CTOSection[],
  source = "trust-impact-engine"
): TrustEvent {
  return makeEvent({
    type: "CTO_INVALIDATED",
    claimId,
    affectedNodes,
    severity: "CRITICAL",
    description: `CTO invalidated for claim ${claimId}: ${reason}`,
    payload: { reason },
    source,
    requiresHumanReview: true,
  });
}

export function conflictDetectedEvent(
  claimId: string,
  conflictDescription: string,
  affectedNodes: CTOSection[],
  severity: TrustEventSeverity
): TrustEvent {
  return makeEvent({
    type: "CONFLICT_DETECTED",
    claimId,
    affectedNodes,
    severity,
    description: `Truth conflict detected: ${conflictDescription}`,
    payload: { conflictDescription },
    source: "truth-reconciliation-engine",
    requiresHumanReview: severity === "CRITICAL" || severity === "HIGH",
  });
}

export function humanReviewRequestedEvent(
  claimId: string,
  reviewType: string,
  reason: string,
  assignedTo: string
): TrustEvent {
  return makeEvent({
    type: "HUMAN_REVIEW_REQUESTED",
    claimId,
    affectedNodes: ["certification", "decision"],
    severity: "HIGH",
    description: `Human review requested (${reviewType}): ${reason}. Assigned to: ${assignedTo}`,
    payload: { reviewType, reason, assignedTo },
    source: "human-trust-approval",
    requiresHumanReview: true,
  });
}

export function slaBreachEvent(
  claimId: string,
  slaType: string,
  targetMinutes: number,
  actualMinutes: number
): TrustEvent {
  return makeEvent({
    type: "SLA_BREACH_DETECTED",
    claimId,
    affectedNodes: ["workflow", "certification"],
    severity: "HIGH",
    description: `SLA breach: ${slaType} took ${actualMinutes}min (target: ${targetMinutes}min)`,
    payload: { slaType, targetMinutes, actualMinutes, overageMinutes: actualMinutes - targetMinutes },
    source: "trust-sla-engine",
    requiresHumanReview: false,
  });
}

export function modelDriftEvent(
  modelName: string,
  modelVersion: string,
  driftScore: number,
  affectedClaimIds: string[]
): TrustEvent {
  return makeEvent({
    type: "MODEL_DRIFT_DETECTED",
    claimId: "SYSTEM",
    affectedNodes: ["fraud", "damage", "physics", "certification"],
    severity: driftScore > 0.2 ? "CRITICAL" : driftScore > 0.1 ? "HIGH" : "MEDIUM",
    description: `Model drift detected in ${modelName} v${modelVersion}: drift score ${(driftScore * 100).toFixed(1)}%. ${affectedClaimIds.length} claims affected.`,
    payload: { modelName, modelVersion, driftScore, affectedClaimIds },
    source: "ai-model-governance",
    requiresHumanReview: driftScore > 0.15,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Event Bus (in-process pub/sub singleton)
// ─────────────────────────────────────────────────────────────────────────────

export type TrustEventHandler = (event: TrustEvent) => void | Promise<void>;

export interface TrustEventSubscription {
  subscriptionId: string;
  eventTypes: TrustEventType[] | "*";
  handler: TrustEventHandler;
  filter?: (event: TrustEvent) => boolean;
}

export interface TrustEventBusStats {
  totalPublished: number;
  totalDelivered: number;
  totalErrors: number;
  subscriberCount: number;
  eventTypeCounts: Record<string, number>;
}

class TrustEventBusImpl {
  private subscriptions: Map<string, TrustEventSubscription> = new Map();
  private eventHistory: TrustEvent[] = [];
  private readonly maxHistorySize = 10_000;
  private stats: TrustEventBusStats = {
    totalPublished: 0,
    totalDelivered: 0,
    totalErrors: 0,
    subscriberCount: 0,
    eventTypeCounts: {},
  };

  /** Publish an event to all matching subscribers */
  async publish(event: TrustEvent): Promise<void> {
    this.stats.totalPublished += 1;
    this.stats.eventTypeCounts[event.type] =
      (this.stats.eventTypeCounts[event.type] ?? 0) + 1;

    // Store in history (ring buffer)
    this.eventHistory.push(event);
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }

    // Deliver to subscribers
    const promises: Promise<void>[] = [];
    for (const sub of this.subscriptions.values()) {
      const typeMatch =
        sub.eventTypes === "*" || sub.eventTypes.includes(event.type);
      const filterMatch = !sub.filter || sub.filter(event);
      if (typeMatch && filterMatch) {
        promises.push(
          Promise.resolve(sub.handler(event)).then(
            () => { this.stats.totalDelivered += 1; },
            (err) => {
              this.stats.totalErrors += 1;
              console.error(`[TrustEventBus] Handler error for ${event.type}:`, err);
            }
          )
        );
      }
    }
    await Promise.allSettled(promises);
  }

  /** Subscribe to specific event types (or all with "*") */
  subscribe(
    eventTypes: TrustEventType[] | "*",
    handler: TrustEventHandler,
    filter?: (event: TrustEvent) => boolean
  ): string {
    const subscriptionId = `SUB-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.subscriptions.set(subscriptionId, { subscriptionId, eventTypes, handler, filter });
    this.stats.subscriberCount = this.subscriptions.size;
    return subscriptionId;
  }

  /** Unsubscribe by subscription ID */
  unsubscribe(subscriptionId: string): boolean {
    const removed = this.subscriptions.delete(subscriptionId);
    this.stats.subscriberCount = this.subscriptions.size;
    return removed;
  }

  /** Get recent events for a claim */
  getClaimEvents(claimId: string, limit = 50): TrustEvent[] {
    return this.eventHistory
      .filter((e) => e.claimId === claimId || e.claimId === "SYSTEM")
      .slice(-limit);
  }

  /** Get all recent events */
  getRecentEvents(limit = 100): TrustEvent[] {
    return this.eventHistory.slice(-limit);
  }

  /** Get events by type */
  getEventsByType(type: TrustEventType, limit = 100): TrustEvent[] {
    return this.eventHistory.filter((e) => e.type === type).slice(-limit);
  }

  /** Get events requiring human review */
  getPendingHumanReviewEvents(claimId?: string): TrustEvent[] {
    return this.eventHistory.filter(
      (e) =>
        e.requiresHumanReview &&
        (!claimId || e.claimId === claimId)
    );
  }

  /** Get bus statistics */
  getStats(): TrustEventBusStats {
    return { ...this.stats };
  }

  /** Clear event history (for testing) */
  clearHistory(): void {
    this.eventHistory = [];
  }

  /** Reset stats (for testing) */
  resetStats(): void {
    this.stats = {
      totalPublished: 0,
      totalDelivered: 0,
      totalErrors: 0,
      subscriberCount: this.subscriptions.size,
      eventTypeCounts: {},
    };
  }
}

/** Singleton Trust Event Bus instance */
export const trustEventBus = new TrustEventBusImpl();

// ─────────────────────────────────────────────────────────────────────────────
// Claim-scoped event publisher (convenience wrapper)
// ─────────────────────────────────────────────────────────────────────────────

export class ClaimTrustPublisher {
  constructor(
    private readonly claimId: string,
    private readonly source: string
  ) {}

  async documentUploaded(documentType: string): Promise<void> {
    await trustEventBus.publish(
      newDocumentUploadedEvent(this.claimId, documentType, this.source)
    );
  }

  async imageUploaded(imageCount: number): Promise<void> {
    await trustEventBus.publish(
      newImageUploadedEvent(this.claimId, imageCount, this.source)
    );
  }

  async quoteChanged(previousAmountUsd: number, newAmountUsd: number): Promise<void> {
    await trustEventBus.publish(
      quoteChangedEvent(this.claimId, previousAmountUsd, newAmountUsd, this.source)
    );
  }

  async assessorOverride(
    assessorId: string,
    field: string,
    prev: unknown,
    next: unknown,
    reason: string
  ): Promise<void> {
    await trustEventBus.publish(
      assessorOverrideEvent(this.claimId, assessorId, field, prev, next, reason)
    );
  }

  async conflictDetected(
    description: string,
    nodes: CTOSection[],
    severity: TrustEventSeverity
  ): Promise<void> {
    await trustEventBus.publish(
      conflictDetectedEvent(this.claimId, description, nodes, severity)
    );
  }

  async ctoInvalidated(reason: string, nodes: CTOSection[]): Promise<void> {
    await trustEventBus.publish(
      ctoInvalidatedEvent(this.claimId, reason, nodes, this.source)
    );
  }
}
