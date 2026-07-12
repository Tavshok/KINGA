/**
 * TRE v4.0 — Enhancement 2: Trust Impact Analysis Engine
 *
 * Determines what parts of the CTO become invalid after a trust event.
 * Models the causal dependency graph between CTO sections so that when
 * one section changes, all downstream sections are correctly flagged.
 *
 * Dependency graph (directed edges: A → B means "A change invalidates B"):
 *
 *   evidence  → damage → physics → fraud → decision → certification
 *   evidence  → cost   → decision
 *   incident  → physics
 *   vehicle   → physics
 *   vehicle   → cost
 *   fraud     → certification
 *   cost      → certification
 *   decision  → certification
 *   physics   → certification
 */

import type { CTOSection, TrustEvent, TrustEventType } from "./trustEventBus";

// ─────────────────────────────────────────────────────────────────────────────
// Dependency graph
// ─────────────────────────────────────────────────────────────────────────────

/** Directed dependency graph: key is invalidated when any of its dependencies change */
const SECTION_DEPENDENCIES: Record<CTOSection, CTOSection[]> = {
  claimIdentity: [],
  vehicle: [],
  driver: [],
  incident: [],
  evidence: [],
  damage: ["evidence"],
  physics: ["damage", "incident", "vehicle"],
  fraud: ["physics", "damage", "evidence"],
  cost: ["evidence", "vehicle", "damage"],
  workflow: [],
  decision: ["fraud", "cost", "physics"],
  confidence: ["physics", "fraud", "cost", "damage"],
  consistency: ["physics", "fraud", "cost", "damage", "incident"],
  auditTrail: [],
  certification: ["decision", "fraud", "cost", "physics", "damage"],
};

/** Reverse dependency graph: key change propagates to these sections */
const PROPAGATION_MAP: Record<CTOSection, CTOSection[]> = (() => {
  const map: Record<string, CTOSection[]> = {};
  for (const section of Object.keys(SECTION_DEPENDENCIES) as CTOSection[]) {
    map[section] = [];
  }
  for (const [section, deps] of Object.entries(SECTION_DEPENDENCIES) as [CTOSection, CTOSection[]][]) {
    for (const dep of deps) {
      map[dep].push(section);
    }
  }
  return map as Record<CTOSection, CTOSection[]>;
})();

// ─────────────────────────────────────────────────────────────────────────────
// Event → directly affected sections mapping
// ─────────────────────────────────────────────────────────────────────────────

const EVENT_DIRECT_IMPACT: Record<TrustEventType, CTOSection[]> = {
  NEW_DOCUMENT_UPLOADED: ["evidence"],
  NEW_IMAGE_UPLOADED: ["evidence", "damage"],
  QUOTE_CHANGED: ["cost"],
  ASSESSOR_OVERRIDE: ["decision", "auditTrail"],
  FRAUD_MODEL_UPDATED: ["fraud"],
  REGULATORY_RULE_CHANGED: ["certification"],
  ENGINE_VERSION_CHANGED: ["physics", "fraud", "damage"],
  EVIDENCE_GRAPH_UPDATED: ["evidence"],
  CTO_CERTIFIED: [],
  CTO_INVALIDATED: ["certification"],
  CERTIFICATE_DOWNGRADED: ["certification"],
  CONFLICT_DETECTED: ["consistency"],
  CONFLICT_RESOLVED: ["consistency", "certification"],
  HUMAN_REVIEW_REQUESTED: ["workflow"],
  HUMAN_REVIEW_COMPLETED: ["decision", "certification"],
  SLA_BREACH_DETECTED: ["workflow"],
  MODEL_DRIFT_DETECTED: ["fraud", "physics", "damage"],
  RECONCILIATION_TASK_CREATED: ["workflow"],
  RECONCILIATION_TASK_RESOLVED: ["decision", "certification"],
  TRUST_SCORE_CHANGED: ["confidence"],
  REGULATORY_COMPLIANCE_FAILED: ["certification"],
  SIMULATION_COMPLETED: [],
};

// ─────────────────────────────────────────────────────────────────────────────
// Impact result types
// ─────────────────────────────────────────────────────────────────────────────

export type CertificateImpactStatus =
  | "VALID"
  | "REQUIRES_REVIEW"
  | "INVALIDATED"
  | "REGENERATION_REQUIRED";

export interface SectionImpact {
  section: CTOSection;
  impactType: "DIRECT" | "PROPAGATED";
  invalidated: boolean;
  requiresRecomputation: boolean;
  description: string;
}

export interface TrustImpactResult {
  /** Claim this impact analysis relates to */
  claimId: string;
  /** Event that triggered the analysis */
  triggeringEvent: TrustEvent;
  /** All sections directly impacted */
  directlyAffectedSections: CTOSection[];
  /** All sections impacted via propagation */
  propagatedSections: CTOSection[];
  /** Union of all affected sections */
  affectedSections: CTOSection[];
  /** Detailed per-section impact */
  sectionImpacts: SectionImpact[];
  /** Certificate status after this event */
  certificateStatus: CertificateImpactStatus;
  /** Whether the CTO needs full re-run */
  requiresFullRecomputation: boolean;
  /** Whether only specific sections need re-run */
  requiresPartialRecomputation: boolean;
  /** Sections that can be recomputed in isolation */
  recomputationTargets: CTOSection[];
  /** Impact severity */
  impactSeverity: "MINIMAL" | "MODERATE" | "SIGNIFICANT" | "CRITICAL";
  /** Human-readable impact summary */
  impactSummary: string;
  /** Timestamp of analysis */
  analysedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Propagation engine
// ─────────────────────────────────────────────────────────────────────────────

function propagateSections(
  directSections: CTOSection[],
  visited: Set<CTOSection> = new Set()
): CTOSection[] {
  const propagated: CTOSection[] = [];
  const queue = [...directSections];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const downstream = PROPAGATION_MAP[current] ?? [];
    for (const ds of downstream) {
      if (!visited.has(ds)) {
        propagated.push(ds);
        queue.push(ds);
      }
    }
  }

  return [...new Set(propagated)];
}

function determineCertificateStatus(
  affectedSections: CTOSection[],
  event: TrustEvent
): CertificateImpactStatus {
  if (
    event.type === "CTO_INVALIDATED" ||
    event.type === "REGULATORY_COMPLIANCE_FAILED" ||
    event.severity === "CRITICAL"
  ) {
    return "INVALIDATED";
  }

  if (affectedSections.includes("certification")) {
    if (
      affectedSections.includes("decision") ||
      affectedSections.includes("fraud") ||
      affectedSections.includes("physics")
    ) {
      return "REGENERATION_REQUIRED";
    }
    return "REQUIRES_REVIEW";
  }

  if (
    affectedSections.includes("decision") ||
    affectedSections.includes("fraud")
  ) {
    return "REQUIRES_REVIEW";
  }

  return "VALID";
}

function determineImpactSeverity(
  affectedSections: CTOSection[],
  event: TrustEvent
): "MINIMAL" | "MODERATE" | "SIGNIFICANT" | "CRITICAL" {
  if (
    event.severity === "CRITICAL" ||
    affectedSections.includes("certification") && affectedSections.includes("decision")
  ) {
    return "CRITICAL";
  }
  if (affectedSections.length >= 5 || affectedSections.includes("decision")) {
    return "SIGNIFICANT";
  }
  if (affectedSections.length >= 3) {
    return "MODERATE";
  }
  return "MINIMAL";
}

function buildSectionImpacts(
  directSections: CTOSection[],
  propagatedSections: CTOSection[]
): SectionImpact[] {
  const impacts: SectionImpact[] = [];

  for (const section of directSections) {
    impacts.push({
      section,
      impactType: "DIRECT",
      invalidated: true,
      requiresRecomputation: true,
      description: `Section directly affected by trust event`,
    });
  }

  for (const section of propagatedSections) {
    if (!directSections.includes(section)) {
      impacts.push({
        section,
        impactType: "PROPAGATED",
        invalidated: section === "certification" || section === "decision",
        requiresRecomputation: true,
        description: `Section invalidated via dependency propagation`,
      });
    }
  }

  return impacts;
}

function buildImpactSummary(
  directSections: CTOSection[],
  propagatedSections: CTOSection[],
  certStatus: CertificateImpactStatus,
  event: TrustEvent
): string {
  const total = new Set([...directSections, ...propagatedSections]).size;
  const certNote =
    certStatus === "INVALIDATED"
      ? "Certificate INVALIDATED — full re-certification required."
      : certStatus === "REGENERATION_REQUIRED"
        ? "Certificate must be regenerated."
        : certStatus === "REQUIRES_REVIEW"
          ? "Certificate requires review."
          : "Certificate remains valid.";

  return (
    `Event "${event.type}" (severity: ${event.severity}) directly affected ` +
    `${directSections.length} section(s) and propagated to ${propagatedSections.length} ` +
    `additional section(s) (${total} total). ${certNote}`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main analysis function
// ─────────────────────────────────────────────────────────────────────────────

export function analyseImpact(event: TrustEvent): TrustImpactResult {
  // Combine event's own affectedNodes with the event-type direct impact map
  const eventTypeDirect = EVENT_DIRECT_IMPACT[event.type] ?? [];
  const directSections = [
    ...new Set([...event.affectedNodes, ...eventTypeDirect]),
  ] as CTOSection[];

  // Propagate through dependency graph
  const directSet = new Set(directSections);
  const propagatedSections = propagateSections(directSections, new Set(directSections));
  const allAffected = [...new Set([...directSections, ...propagatedSections])];

  const certStatus = determineCertificateStatus(allAffected, event);
  const impactSeverity = determineImpactSeverity(allAffected, event);
  const sectionImpacts = buildSectionImpacts(directSections, propagatedSections);

  const requiresFullRecomputation =
    certStatus === "INVALIDATED" ||
    (allAffected.includes("physics") && allAffected.includes("fraud"));

  const requiresPartialRecomputation =
    !requiresFullRecomputation && allAffected.length > 0;

  // Recomputation targets: sections that need re-run (in dependency order)
  const recomputationOrder: CTOSection[] = [
    "evidence", "damage", "physics", "fraud", "cost",
    "decision", "confidence", "consistency", "certification",
  ];
  const recomputationTargets = recomputationOrder.filter((s) =>
    allAffected.includes(s) && !directSet.has(s)
  );

  return {
    claimId: event.claimId,
    triggeringEvent: event,
    directlyAffectedSections: directSections,
    propagatedSections,
    affectedSections: allAffected,
    sectionImpacts,
    certificateStatus: certStatus,
    requiresFullRecomputation,
    requiresPartialRecomputation,
    recomputationTargets,
    impactSeverity,
    impactSummary: buildImpactSummary(directSections, propagatedSections, certStatus, event),
    analysedAt: new Date().toISOString(),
  };
}

/**
 * Analyse the cumulative impact of multiple events on a single claim.
 * Events are processed in order; later events may supersede earlier ones.
 */
export function analyseMultiEventImpact(events: TrustEvent[]): {
  claimId: string;
  totalAffectedSections: CTOSection[];
  certificateStatus: CertificateImpactStatus;
  impactSeverity: "MINIMAL" | "MODERATE" | "SIGNIFICANT" | "CRITICAL";
  individualImpacts: TrustImpactResult[];
  cumulativeSummary: string;
} {
  if (events.length === 0) {
    return {
      claimId: "UNKNOWN",
      totalAffectedSections: [],
      certificateStatus: "VALID",
      impactSeverity: "MINIMAL",
      individualImpacts: [],
      cumulativeSummary: "No events to analyse.",
    };
  }

  const claimId = events[0].claimId;
  const individualImpacts = events.map(analyseImpact);

  const allSections = new Set<CTOSection>();
  for (const impact of individualImpacts) {
    for (const s of impact.affectedSections) {
      allSections.add(s);
    }
  }

  const totalAffected = [...allSections];

  // Worst-case certificate status
  const statusPriority: CertificateImpactStatus[] = [
    "VALID",
    "REQUIRES_REVIEW",
    "REGENERATION_REQUIRED",
    "INVALIDATED",
  ];
  let certStatus: CertificateImpactStatus = "VALID";
  for (const impact of individualImpacts) {
    if (
      statusPriority.indexOf(impact.certificateStatus) >
      statusPriority.indexOf(certStatus)
    ) {
      certStatus = impact.certificateStatus;
    }
  }

  const impactSeverity = determineImpactSeverity(
    totalAffected,
    events.reduce((worst, e) =>
      e.severity === "CRITICAL" ? e : worst
    )
  );

  return {
    claimId,
    totalAffectedSections: totalAffected,
    certificateStatus: certStatus,
    impactSeverity,
    individualImpacts,
    cumulativeSummary:
      `${events.length} events affected ${totalAffected.length} CTO sections. ` +
      `Certificate status: ${certStatus}. Severity: ${impactSeverity}.`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Dependency graph inspection utilities
// ─────────────────────────────────────────────────────────────────────────────

export function getDependencies(section: CTOSection): CTOSection[] {
  return SECTION_DEPENDENCIES[section] ?? [];
}

export function getDependents(section: CTOSection): CTOSection[] {
  return PROPAGATION_MAP[section] ?? [];
}

export function getFullDependencyChain(section: CTOSection): CTOSection[] {
  const visited = new Set<CTOSection>();
  const queue = [section];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const dep of SECTION_DEPENDENCIES[current] ?? []) {
      queue.push(dep);
    }
  }
  visited.delete(section);
  return [...visited];
}

export function getFullPropagationChain(section: CTOSection): CTOSection[] {
  const visited = new Set<CTOSection>();
  const queue = [section];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const dep of PROPAGATION_MAP[current] ?? []) {
      queue.push(dep);
    }
  }
  visited.delete(section);
  return [...visited];
}
