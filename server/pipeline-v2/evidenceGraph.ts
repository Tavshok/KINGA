/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * EVIDENCE GRAPH — TRE v3.0 Enhancement 2
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Implements a directed acyclic graph (DAG) of evidence relationships.
 * Every conclusion in the CTO must have traceable evidence relationships.
 *
 * Architecture position:
 *   All Analytical Engines → Truth Rule Engine → TRE → Evidence Graph + Truth Lineage → CTO
 *
 * Graph structure:
 *   Vehicle Photo → Damage Detection → Damage Severity → Physics Estimate → Fraud Assessment → Final Decision
 *
 * Each node contains: id, type, source, confidence, timestamp, engineVersion, dependencies
 */

// ─────────────────────────────────────────────────────────────────────────────
// NODE TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type EvidenceNodeType =
  | "raw_document"       // PDF, image, or other uploaded document
  | "extracted_field"    // Field extracted from a document by an engine
  | "computed_value"     // Value computed by an engine from other values
  | "reconciled_value"   // Value produced by TRE reconciliation
  | "certified_value"    // Final certified value in the CTO
  | "external_lookup"    // Value from an external data source (e.g. NHTSA, weather)
  | "manual_override";   // Value set by a human analyst

export type EvidenceNodeStatus =
  | "active"      // Currently used in the CTO
  | "superseded"  // Replaced by a later reconciliation
  | "conflicted"  // In conflict with another node for the same field
  | "missing"     // Expected but not found
  | "invalid";    // Failed validation

export interface EvidenceNode {
  /** Unique node ID, e.g. "stage6.damage.frontBumper.severity" */
  id: string;
  /** Human-readable label */
  label: string;
  /** Node type */
  type: EvidenceNodeType;
  /** Engine or source that produced this node */
  source: string;
  /** Engine version that produced this node */
  engineVersion: string;
  /** Confidence score 0–100 for this specific evidence item */
  confidence: number;
  /** ISO timestamp when this evidence was produced */
  timestamp: string;
  /** IDs of nodes this node depends on (its inputs) */
  dependencies: string[];
  /** The actual value this node represents (serialisable) */
  value: unknown;
  /** CTO field path this node contributes to, e.g. "damage.components[0].severity" */
  ctoField: string | null;
  /** Current status of this node */
  status: EvidenceNodeStatus;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

export interface EvidenceEdge {
  /** Source node ID */
  from: string;
  /** Target node ID */
  to: string;
  /** Relationship type */
  relationship: "derived_from" | "conflicts_with" | "validates" | "supersedes" | "aggregates";
  /** Confidence of this relationship */
  confidence: number;
  /** Optional label */
  label?: string;
}

export interface EvidenceGraph {
  /** All nodes in the graph */
  nodes: EvidenceNode[];
  /** All edges in the graph */
  edges: EvidenceEdge[];
  /** Root nodes (no dependencies) */
  rootNodeIds: string[];
  /** Leaf nodes (no dependents) — these are the certified CTO values */
  leafNodeIds: string[];
  /** Nodes with status "missing" — evidence gaps */
  missingNodeIds: string[];
  /** Nodes with status "conflicted" */
  conflictedNodeIds: string[];
  /** Total node count */
  nodeCount: number;
  /** Total edge count */
  edgeCount: number;
  /** Graph creation timestamp */
  createdAt: string;
  /** CTO fields that have no evidence path (untraced) */
  untracedCtoFields: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// EVIDENCE GRAPH BUILDER
// ─────────────────────────────────────────────────────────────────────────────

export class EvidenceGraphBuilder {
  private nodes: Map<string, EvidenceNode> = new Map();
  private edges: EvidenceEdge[] = [];
  private readonly engineVersion: string;

  constructor(engineVersion = "3.0.0") {
    this.engineVersion = engineVersion;
  }

  addNode(node: EvidenceNode): this {
    this.nodes.set(node.id, node);
    return this;
  }

  addEdge(edge: EvidenceEdge): this {
    this.edges.push(edge);
    return this;
  }

  /** Add a node and automatically create dependency edges */
  addDerivedNode(
    id: string,
    label: string,
    type: EvidenceNodeType,
    source: string,
    confidence: number,
    value: unknown,
    ctoField: string | null,
    dependencyIds: string[],
    metadata?: Record<string, unknown>
  ): this {
    const node: EvidenceNode = {
      id,
      label,
      type,
      source,
      engineVersion: this.engineVersion,
      confidence,
      timestamp: new Date().toISOString(),
      dependencies: dependencyIds,
      value,
      ctoField,
      status: "active",
      metadata,
    };
    this.nodes.set(id, node);
    for (const depId of dependencyIds) {
      this.edges.push({ from: depId, to: id, relationship: "derived_from", confidence });
    }
    return this;
  }

  markConflict(nodeId1: string, nodeId2: string, confidence = 100): this {
    const n1 = this.nodes.get(nodeId1);
    const n2 = this.nodes.get(nodeId2);
    if (n1) n1.status = "conflicted";
    if (n2) n2.status = "conflicted";
    this.edges.push({ from: nodeId1, to: nodeId2, relationship: "conflicts_with", confidence });
    return this;
  }

  markSuperseded(oldNodeId: string, newNodeId: string): this {
    const old = this.nodes.get(oldNodeId);
    if (old) old.status = "superseded";
    this.edges.push({ from: newNodeId, to: oldNodeId, relationship: "supersedes", confidence: 100 });
    return this;
  }

  addMissingEvidence(id: string, label: string, ctoField: string): this {
    const node: EvidenceNode = {
      id,
      label,
      type: "extracted_field",
      source: "evidence_gap_detector",
      engineVersion: this.engineVersion,
      confidence: 0,
      timestamp: new Date().toISOString(),
      dependencies: [],
      value: null,
      ctoField,
      status: "missing",
    };
    this.nodes.set(id, node);
    return this;
  }

  build(): EvidenceGraph {
    const allNodes = Array.from(this.nodes.values());
    const dependentIds = new Set(this.edges.map(e => e.to));
    const dependencyIds = new Set(this.edges.map(e => e.from));

    const rootNodeIds = allNodes.filter(n => n.dependencies.length === 0 && n.status !== "missing").map(n => n.id);
    const leafNodeIds = allNodes.filter(n => !dependentIds.has(n.id) && n.status === "active").map(n => n.id);
    const missingNodeIds = allNodes.filter(n => n.status === "missing").map(n => n.id);
    const conflictedNodeIds = allNodes.filter(n => n.status === "conflicted").map(n => n.id);

    // CTO fields that have active nodes but no certified_value leaf
    const activeCtoFields = new Set(allNodes.filter(n => n.ctoField && n.status === "active").map(n => n.ctoField!));
    const certifiedCtoFields = new Set(allNodes.filter(n => n.ctoField && (n.type === "certified_value" || n.status === "active")).map(n => n.ctoField!));
    const untracedCtoFields = [...activeCtoFields].filter(f => !certifiedCtoFields.has(f));

    return {
      nodes: allNodes,
      edges: this.edges,
      rootNodeIds,
      leafNodeIds,
      missingNodeIds,
      conflictedNodeIds,
      nodeCount: allNodes.length,
      edgeCount: this.edges.length,
      createdAt: new Date().toISOString(),
      untracedCtoFields,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// EVIDENCE GRAPH ANALYSER
// ─────────────────────────────────────────────────────────────────────────────

export interface EvidencePathResult {
  ctoField: string;
  path: EvidenceNode[];
  rootSources: string[];
  minConfidence: number;
  hasGaps: boolean;
  hasMissingEvidence: boolean;
  hasConflicts: boolean;
}

/**
 * Trace the full evidence path from root to a given CTO field.
 */
export function traceEvidencePath(graph: EvidenceGraph, ctoField: string): EvidencePathResult {
  const nodeMap = new Map(graph.nodes.map(n => [n.id, n]));
  const edgeMap = new Map<string, string[]>(); // to → [from, ...]
  for (const edge of graph.edges) {
    if (edge.relationship === "derived_from") {
      if (!edgeMap.has(edge.to)) edgeMap.set(edge.to, []);
      edgeMap.get(edge.to)!.push(edge.from);
    }
  }

  // Find all nodes contributing to this CTO field
  const fieldNodes = graph.nodes.filter(n => n.ctoField === ctoField);
  if (fieldNodes.length === 0) {
    return { ctoField, path: [], rootSources: [], minConfidence: 0, hasGaps: true, hasMissingEvidence: true, hasConflicts: false };
  }

  // BFS backwards from field nodes to roots
  const visited = new Set<string>();
  const queue = fieldNodes.map(n => n.id);
  const pathNodes: EvidenceNode[] = [];

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);
    const node = nodeMap.get(nodeId);
    if (node) {
      pathNodes.push(node);
      const parents = edgeMap.get(nodeId) ?? [];
      queue.push(...parents.filter(p => !visited.has(p)));
    }
  }

  const rootSources = pathNodes.filter(n => n.dependencies.length === 0).map(n => n.source);
  const activeNodes = pathNodes.filter(n => n.status === "active" || n.type === "certified_value");
  const minConfidence = activeNodes.length > 0 ? Math.min(...activeNodes.map(n => n.confidence)) : 0;

  return {
    ctoField,
    path: pathNodes,
    rootSources: [...new Set(rootSources)],
    minConfidence,
    hasGaps: graph.untracedCtoFields.includes(ctoField),
    hasMissingEvidence: pathNodes.some(n => n.status === "missing"),
    hasConflicts: pathNodes.some(n => n.status === "conflicted"),
  };
}

/**
 * Detect missing evidence nodes — expected evidence that was not found.
 */
export function detectMissingEvidence(graph: EvidenceGraph): Array<{ field: string; impact: "HIGH" | "MEDIUM" | "LOW" }> {
  const CRITICAL_FIELDS: Record<string, "HIGH" | "MEDIUM" | "LOW"> = {
    "damage.components": "HIGH",
    "physics.estimatedSpeedKmh": "HIGH",
    "fraud.fraudRiskScore": "HIGH",
    "cost.optimisedCostUsd": "HIGH",
    "vehicle.make": "MEDIUM",
    "claim.incidentType": "MEDIUM",
    "evidence.photoCount": "MEDIUM",
    "workflow.lateSubmission": "LOW",
  };

  return graph.missingNodeIds
    .map(id => {
      const node = graph.nodes.find(n => n.id === id);
      const field = node?.ctoField ?? id;
      return { field, impact: CRITICAL_FIELDS[field] ?? "LOW" as "HIGH" | "MEDIUM" | "LOW" };
    })
    .sort((a, b) => {
      const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      return order[a.impact] - order[b.impact];
    });
}

/**
 * Build a standard evidence graph from pipeline outputs.
 * This is the canonical builder used by the TRE.
 */
export function buildStandardEvidenceGraph(params: {
  claimId: string;
  photoCount: number;
  documentCount: number;
  hasQuotation: boolean;
  damageComponents: Array<{ name: string; severity: string; confidence: number }>;
  physicsSpeedKmh: number | null;
  physicsConfidence: number | null;
  fraudScore: number;
  fraudLevel: string;
  costUsd: number;
  finalDecision: string;
  visionSourceReliability: "HIGH" | "MEDIUM" | "LOW" | "NONE";
  engineVersion: string;
}): EvidenceGraph {
  const builder = new EvidenceGraphBuilder(params.engineVersion);
  const now = new Date().toISOString();

  // ── ROOT NODES: Raw evidence ──────────────────────────────────────────────
  if (params.photoCount > 0) {
    builder.addNode({
      id: `raw.photos.${params.claimId}`,
      label: `${params.photoCount} damage photo(s)`,
      type: "raw_document",
      source: "document_ingestion",
      engineVersion: params.engineVersion,
      confidence: params.visionSourceReliability === "HIGH" ? 90 : params.visionSourceReliability === "MEDIUM" ? 70 : 40,
      timestamp: now,
      dependencies: [],
      value: { count: params.photoCount },
      ctoField: "evidence.photoCount",
      status: "active",
    });
  } else {
    builder.addMissingEvidence(`raw.photos.${params.claimId}`, "Damage photos (missing)", "evidence.photoCount");
  }

  if (params.documentCount > 0) {
    builder.addNode({
      id: `raw.documents.${params.claimId}`,
      label: `${params.documentCount} document(s)`,
      type: "raw_document",
      source: "document_ingestion",
      engineVersion: params.engineVersion,
      confidence: 85,
      timestamp: now,
      dependencies: [],
      value: { count: params.documentCount },
      ctoField: "evidence.documentCount",
      status: "active",
    });
  }

  if (params.hasQuotation) {
    builder.addNode({
      id: `raw.quotation.${params.claimId}`,
      label: "Repair quotation",
      type: "raw_document",
      source: "document_ingestion",
      engineVersion: params.engineVersion,
      confidence: 90,
      timestamp: now,
      dependencies: [],
      value: { present: true },
      ctoField: "evidence.hasQuotation",
      status: "active",
    });
  }

  // ── STAGE 6: Damage detection ─────────────────────────────────────────────
  const photoDeps = params.photoCount > 0 ? [`raw.photos.${params.claimId}`] : [];
  const docDeps = params.documentCount > 0 ? [`raw.documents.${params.claimId}`] : [];

  for (const comp of params.damageComponents) {
    const compId = `stage6.damage.${comp.name.replace(/\s+/g, "_").toLowerCase()}`;
    builder.addDerivedNode(
      compId,
      `Damage: ${comp.name} (${comp.severity})`,
      "extracted_field",
      "stage6_damage_analysis",
      comp.confidence,
      { name: comp.name, severity: comp.severity },
      `damage.components.${comp.name}`,
      [...photoDeps, ...docDeps]
    );
  }

  // ── STAGE 7: Physics estimate ─────────────────────────────────────────────
  const damageNodeIds = params.damageComponents.map(c => `stage6.damage.${c.name.replace(/\s+/g, "_").toLowerCase()}`);
  if (params.physicsSpeedKmh !== null) {
    builder.addDerivedNode(
      `stage7.physics.speed.${params.claimId}`,
      `Physics speed estimate: ${params.physicsSpeedKmh} km/h`,
      "computed_value",
      "stage7_physics",
      params.physicsConfidence ?? 50,
      params.physicsSpeedKmh,
      "physics.estimatedSpeedKmh",
      damageNodeIds.length > 0 ? damageNodeIds : [...photoDeps, ...docDeps]
    );
  } else {
    builder.addMissingEvidence(`stage7.physics.speed.${params.claimId}`, "Physics speed estimate (unavailable)", "physics.estimatedSpeedKmh");
  }

  // ── STAGE 8: Fraud assessment ─────────────────────────────────────────────
  const physicsNodeId = `stage7.physics.speed.${params.claimId}`;
  builder.addDerivedNode(
    `stage8.fraud.score.${params.claimId}`,
    `Fraud score: ${params.fraudScore}% (${params.fraudLevel})`,
    "computed_value",
    "stage8_fraud",
    100 - params.fraudScore, // confidence inversely related to fraud score
    params.fraudScore,
    "fraud.fraudRiskScore",
    [physicsNodeId, ...damageNodeIds.slice(0, 3), ...docDeps.slice(0, 1)]
  );

  // ── STAGE 9: Cost estimate ────────────────────────────────────────────────
  const quoteDeps = params.hasQuotation ? [`raw.quotation.${params.claimId}`] : [];
  builder.addDerivedNode(
    `stage9.cost.${params.claimId}`,
    `Cost estimate: USD ${params.costUsd.toFixed(2)}`,
    "computed_value",
    "stage9_cost",
    params.hasQuotation ? 85 : 60,
    params.costUsd,
    "cost.optimisedCostUsd",
    [...quoteDeps, ...damageNodeIds.slice(0, 3)]
  );

  // ── TRE: Final decision ───────────────────────────────────────────────────
  builder.addDerivedNode(
    `tre.decision.${params.claimId}`,
    `Final decision: ${params.finalDecision}`,
    "certified_value",
    "truth_reconciliation_engine",
    80,
    params.finalDecision,
    "decision.recommendation",
    [
      `stage8.fraud.score.${params.claimId}`,
      `stage9.cost.${params.claimId}`,
      ...(params.physicsSpeedKmh !== null ? [physicsNodeId] : []),
    ]
  );

  return builder.build();
}
