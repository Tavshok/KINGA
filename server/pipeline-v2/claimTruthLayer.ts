/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * CLAIM TRUTH LAYER (CTL) — v1.0
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * The single source of truth for all downstream decision engines.
 * Runs AFTER all extraction stages (1-5) and BEFORE all decision stages (7-10).
 *
 * Business goals served:
 * 1. Complete Claim Understanding — unified evidence inventory
 * 2. Fraud Intelligence — consistent signals across all dimensions
 * 3. Cost Intelligence — correct quote, correct benchmark, correct verdict
 * 4. Decision Support — one coherent decision for both reports
 * 5. Risk Quantification — all dimensions scored from same data
 * 6. Recovery Opportunities — subrogation, exclusions, excess surfaced proactively
 * 7. Audit Trail — every field traces back to source
 */

import type { ClaimRecord } from "./types";
import type { Stage3Output } from "./types";
import type { EvidenceRegistry } from "./evidenceRegistryEngine";
import type { ExtractedQuote } from "./quoteExtractionEngine";
import { ECONOMIC_WRITE_OFF_THRESHOLD } from "./pipelineCostConstants"; // R-E-01: shared write-off threshold

// ─── CLAIM TRUTH TYPES ──────────────────────────────────────────────────────

export interface ClaimTruthEvidence {
  damagePhotos: { url: string; pageRef: number; classification: string }[];
  quotationScans: { url: string; pageRef: number; repairerName: string | null }[];
  documents: { type: string; pageRef: number; summary: string }[];
  totalPages: number;
  photoCount: number;
  completenessScore: number; // 0-100
  completenessBreakdown: { item: string; present: boolean; weight: number }[];
}

export interface ClaimTruthTimeline {
  incidentDate: string | null;
  claimRegistrationDate: string | null;  // from assessor/police report date (NOT system ingestion)
  assessorInspectionDate: string | null;
  authorizationDate: string | null;
  reportGenerationDate: string;
  daysToLodge: number | null;
  lateSubmission: boolean;
  lateSubmissionSource: string | null;
}

export interface ClaimTruthQuote {
  repairerName: string;
  totalUsd: number;
  isAssessorSelected: boolean;
  lineItemCount: number;
  source: string;
}

export interface ClaimTruthCostBasis {
  quotes: ClaimTruthQuote[];
  kingaEstimateUsd: number;
  kingaEstimateSource: string;
  optimisedCostUsd: number;
  optimisedCostSource: string;
  authorizedAmountUsd: number | null;
  costVerdict: "FAIR" | "OVERPRICED" | "UNDERPRICED" | "INSUFFICIENT_DATA";
  costVerdictExplanation: string;
  negotiationSavingUsd: number;
  quoteVsEstimateDeviation: { repairerName: string; quoteUsd: number; deviationPercent: number }[];
}

export interface ClaimTruthVehicle {
  make: string;
  model: string;
  year: number | null;
  vin: string | null;
  registration: string | null;
  marketValueUsd: number;
  marketValueSource: string;
  repairToValueRatio: number;
  writeOffThreshold: number;
  isEconomicWriteOff: boolean;
}

export interface PhysicsAnomaly {
  type: string;
  description: string;
  severity: "INVESTIGATE" | "ADVISORY";
  evidence: string;
  expectation: string;
}

export interface ClaimTruthFraudSignals {
  indicators: { signal: string; weight: number; source: string }[];
  physicsAnomalies: PhysicsAnomaly[];
}

export interface PolicyExclusion {
  description: string;
  source: string;
  pageRef: number | null;
}

export interface SubrogationLead {
  party: string;
  basis: string;
  source: string;
}

export interface ClaimTruthPolicyRecovery {
  exclusions: PolicyExclusion[];
  subrogationLeads: SubrogationLead[];
  excessApplicable: number | null;
  policyNumber: string | null;
  insurer: string | null;
}

export interface ClaimTruthPoliceReport {
  caseNumber: string | null;
  station: string | null;
  officerFindings: string | null;
  chargedParty: string | null;
  witnessStatements: boolean;
  witnessExpectationRealistic: boolean;
}

export interface ClaimTruthDecision {
  recommendation: "APPROVE" | "REVIEW" | "ESCALATE";
  primaryReason: string;
  confidence: number; // 0-100
  reviewTriggers: string[];
  approvalConditions: string[];
}

export interface ConflictResolved {
  field: string;
  chosen: string;
  rejected: string;
  reason: string;
}

export interface ClaimTruth {
  evidence: ClaimTruthEvidence;
  timeline: ClaimTruthTimeline;
  costBasis: ClaimTruthCostBasis;
  vehicle: ClaimTruthVehicle;
  fraudSignals: ClaimTruthFraudSignals;
  policyAndRecovery: ClaimTruthPolicyRecovery;
  policeReport: ClaimTruthPoliceReport;
  decision: ClaimTruthDecision;
  meta: {
    truthLayerVersion: string;
    generatedAt: string;
    sourceStages: string[];
    conflictsResolved: ConflictResolved[];
    /** R-D-02: Stage 8 composite fraud score carried through for physics re-evaluation */
    stage8FraudScore?: number | null;
    stage8FraudLevel?: "minimal" | "low" | "moderate" | "high" | "elevated" | null;
  };
}

// ─── INPUT CONTRACT ─────────────────────────────────────────────────────────

export interface ClaimTruthInput {
  claimRecord: ClaimRecord;
  stage3Data: Stage3Output | null;
  evidenceRegistry: EvidenceRegistry | null;
  classifiedImages: {
    damagePhotos: { url: string; pageIndex?: number }[];
    vehicleOverviews: { url: string; pageIndex?: number }[];
    quotationImages: { url: string; pageIndex?: number; repairerName?: string }[];
  } | null;
  /** Stage 6 vision-enriched photos — used as fallback when classifiedImages is null */
  enrichedPhotos?: { url: string; confidenceScore?: number }[] | null;
  extractedQuotes: ExtractedQuote[];
  /**
   * Canonical Stage 9 repair evidence. When supplied, this is the only quote
   * population that may influence cost verdicts, anomaly signals, negotiation
   * guidance, recommendations, savings, or settlement-facing conclusions.
   * Raw extracted rows remain evidence history, not decision authority.
   */
  canonicalEligibleQuotes?: Array<{
    panelBeater: string;
    totalUsd: number;
    lineItemCount?: number;
  }>;
  kingaEstimateUsd: number | null;
  kingaEstimateSource: string | null;
  systemCreatedAt: Date | null; // KINGA system ingestion date — used ONLY for metadata, never for timeline
  totalPages: number;
  /** R-D-02: Stage 8 composite fraud score (0–100 normalised). Used as the ESCALATE threshold
   * instead of the raw CTL indicator weight sum, which is on a different scale. Optional for
   * backwards-compatibility — falls back to raw sum when not provided. */
  stage8FraudScore?: number | null;
  /** R-D-02: Stage 8 five-tier fraud risk level. Used for tier-aware ESCALATE/REVIEW decisions. */
  stage8FraudLevel?: "minimal" | "low" | "moderate" | "high" | "elevated" | null;
}

// ─── RESOLUTION ENGINE ──────────────────────────────────────────────────────

const CTL_VERSION = "1.0.0";
const OVERPRICED_THRESHOLD = 0.10; // 10% above KINGA estimate
const UNDERPRICED_THRESHOLD = -0.15; // 15% below KINGA estimate
// R-E-01: local WRITE_OFF_THRESHOLD removed — using ECONOMIC_WRITE_OFF_THRESHOLD from pipelineCostConstants.ts

/**
 * Build the unified Claim Truth from all extraction outputs.
 * This is the ONLY function downstream engines should call.
 */
export function buildClaimTruth(input: ClaimTruthInput): ClaimTruth {
  const conflicts: ConflictResolved[] = [];
  const sourceStages: string[] = [];

  // ─── EVIDENCE RESOLUTION ────────────────────────────────────────────────
  const evidence = resolveEvidence(input, conflicts);
  sourceStages.push("evidence");

  // ─── TIMELINE RESOLUTION ────────────────────────────────────────────────
  const timeline = resolveTimeline(input, conflicts);
  sourceStages.push("timeline");

  // ─── COST RESOLUTION ────────────────────────────────────────────────────
  const costBasis = resolveCostBasis(input, conflicts);
  sourceStages.push("cost");

  // ─── VEHICLE RESOLUTION ─────────────────────────────────────────────────
  const vehicle = resolveVehicle(input, costBasis);
  sourceStages.push("vehicle");

  // ─── FRAUD SIGNALS ──────────────────────────────────────────────────────
  const fraudSignals = resolveFraudSignals(input, timeline, costBasis);
  sourceStages.push("fraud");

  // ─── POLICY & RECOVERY ──────────────────────────────────────────────────
  const policyAndRecovery = resolvePolicyRecovery(input);
  sourceStages.push("policy");

  // ─── POLICE REPORT ──────────────────────────────────────────────────────
  const policeReport = resolvePoliceReport(input);
  sourceStages.push("police");

  // ─── UNIFIED DECISION ───────────────────────────────────────────────────
  const decision = resolveDecision(evidence, timeline, costBasis, vehicle, fraudSignals, policyAndRecovery, policeReport, input.stage8FraudScore, input.stage8FraudLevel);
  sourceStages.push("decision");

  return {
    evidence,
    timeline,
    costBasis,
    vehicle,
    fraudSignals,
    policyAndRecovery,
    policeReport,
    decision,
    meta: {
      truthLayerVersion: CTL_VERSION,
      generatedAt: new Date().toISOString(),
      sourceStages,
      conflictsResolved: conflicts,
      stage8FraudScore: input.stage8FraudScore ?? null,
      stage8FraudLevel: input.stage8FraudLevel ?? null,
    },
  };
}

// ─── EVIDENCE RESOLVER ──────────────────────────────────────────────────────

function resolveEvidence(input: ClaimTruthInput, conflicts: ConflictResolved[]): ClaimTruthEvidence {
  const { classifiedImages, evidenceRegistry, claimRecord, totalPages } = input;

  // Priority: classified images (Stage 2.6) > evidence registry (Stage 0) > claimRecord metadata
  const damagePhotos: ClaimTruthEvidence["damagePhotos"] = [];
  const quotationScans: ClaimTruthEvidence["quotationScans"] = [];

  if (classifiedImages) {
    // Authoritative source: image classifier actually looked at the images
    for (const photo of classifiedImages.damagePhotos) {
      damagePhotos.push({ url: photo.url, pageRef: photo.pageIndex ?? 0, classification: "damage_photo" });
    }
    for (const vo of classifiedImages.vehicleOverviews) {
      damagePhotos.push({ url: vo.url, pageRef: vo.pageIndex ?? 0, classification: "vehicle_overview" });
    }
    for (const qs of classifiedImages.quotationImages) {
      quotationScans.push({ url: qs.url, pageRef: qs.pageIndex ?? 0, repairerName: qs.repairerName ?? null });
    }

    // Conflict: if evidence registry said "no photos" but classifier found them
    if (evidenceRegistry?.evidence_registry?.damage_photos === "ABSENT" && damagePhotos.length > 0) {
      conflicts.push({
        field: "evidence.damagePhotos",
        chosen: `${damagePhotos.length} photos found by image classifier`,
        rejected: "Evidence registry reported MISSING",
        reason: "Image classifier (Stage 2.6) is authoritative — it actually inspected the images",
      });
    }
  } else if (input.enrichedPhotos && input.enrichedPhotos.length > 0) {
    // Fallback: Stage 6 vision-enriched photos (found by PDF direct vision or page analysis)
    for (const photo of input.enrichedPhotos) {
      damagePhotos.push({ url: photo.url, pageRef: 0, classification: "damage_photo" });
    }
  } else if (claimRecord.damage?.imageUrls?.length > 0) {
    // Fallback: use claimRecord image URLs if classifier didn't run
    for (const url of claimRecord.damage.imageUrls) {
      damagePhotos.push({ url, pageRef: 0, classification: "unclassified" });
    }
  }

  // Completeness scoring — what's present vs what's expected
  const completenessItems = [
    { item: "Claim form", present: true, weight: 15 }, // always present (it's the PDF)
    { item: "Damage photos", present: damagePhotos.length > 0, weight: 20 },
    { item: "Repair quote(s)", present: input.extractedQuotes.length > 0 || quotationScans.length > 0, weight: 20 },
    { item: "Police report", present: !!claimRecord.policeReport?.reportNumber, weight: 15 },
    { item: "Driver licence", present: !!claimRecord.driver?.licenseNumber, weight: 10 },
    { item: "Vehicle registration", present: !!claimRecord.vehicle?.registration, weight: 5 },
    { item: "VIN", present: !!claimRecord.vehicle?.vin, weight: 5 },
    { item: "Assessor report", present: !!claimRecord.repairQuote?.assessorName, weight: 10 },
  ];

  const completenessScore = completenessItems.reduce(
    (sum, item) => sum + (item.present ? item.weight : 0), 0
  );

  return {
    damagePhotos,
    quotationScans,
    documents: [], // populated from page classification if available
    totalPages,
    photoCount: damagePhotos.length,
    completenessScore,
    completenessBreakdown: completenessItems,
  };
}

// ─── TIMELINE RESOLVER ──────────────────────────────────────────────────────

function resolveTimeline(input: ClaimTruthInput, conflicts: ConflictResolved[]): ClaimTruthTimeline {
  const { claimRecord, stage3Data, systemCreatedAt } = input;

  const incidentDate = claimRecord.accidentDetails?.date || null;
  const policeReportDate = claimRecord.policeReport?.reportDate || null;
  // Extract assessor inspection date from Stage 3 data
  const assessorDate = stage3Data?.perDocumentExtractions
    ?.map(e => e.assessorInspectionDate)
    .find(d => d != null) ?? null;

  // Claim registration date: use the EARLIEST document-derived date after the incident
  // Priority: assessor inspection date > police report date > authorization date
  // NEVER use system ingestion date (systemCreatedAt) as claim registration
  let claimRegistrationDate: string | null = null;
  let registrationSource: string | null = null;

  if (assessorDate) {
    claimRegistrationDate = assessorDate;
    registrationSource = "assessor inspection date";
  } else if (policeReportDate) {
    claimRegistrationDate = policeReportDate;
    registrationSource = "police report date";
  }

  // Late submission calculation
  let daysToLodge: number | null = null;
  let lateSubmission = false;
  let lateSubmissionSource: string | null = null;

  if (incidentDate && claimRegistrationDate) {
    const incident = new Date(incidentDate);
    const registration = new Date(claimRegistrationDate);
    if (!isNaN(incident.getTime()) && !isNaN(registration.getTime())) {
      daysToLodge = Math.round((registration.getTime() - incident.getTime()) / (1000 * 60 * 60 * 24));
      // Only flag as late if > 30 days AND dates are from reliable sources
      lateSubmission = daysToLodge > 30;
      lateSubmissionSource = `Incident: ${incidentDate} → Registration: ${claimRegistrationDate} (from ${registrationSource})`;
    }
  }

  // Conflict: if system would have flagged late submission using ingestion date
  if (systemCreatedAt && incidentDate && !lateSubmission) {
    const incident = new Date(incidentDate);
    const ingestion = systemCreatedAt;
    const ingestionDays = Math.round((ingestion.getTime() - incident.getTime()) / (1000 * 60 * 60 * 24));
    if (ingestionDays > 30) {
      conflicts.push({
        field: "timeline.lateSubmission",
        chosen: `Not late (${daysToLodge ?? "unknown"} days based on ${registrationSource ?? "document dates"})`,
        rejected: `Would have been flagged as ${ingestionDays} days late using system ingestion date`,
        reason: "System ingestion date is when KINGA processed the file, not when the claim was lodged",
      });
    }
  }

  return {
    incidentDate,
    claimRegistrationDate,
    assessorInspectionDate: assessorDate || policeReportDate, // prefer assessor date when available
    authorizationDate: null, // would need explicit extraction
    reportGenerationDate: new Date().toISOString().split("T")[0],
    daysToLodge,
    lateSubmission,
    lateSubmissionSource,
  };
}

// ─── COST RESOLVER ──────────────────────────────────────────────────────────

function resolveCostBasis(input: ClaimTruthInput, conflicts: ConflictResolved[]): ClaimTruthCostBasis {
  const { extractedQuotes, claimRecord, kingaEstimateUsd, kingaEstimateSource, canonicalEligibleQuotes } = input;

  // Canonical Stage 9 authority takes precedence. Where it is available,
  // historical, rejected, superseded, duplicate, and explicitly ineligible
  // raw rows must never re-enter Claim Truth decision calculations.
  const quotes: ClaimTruthQuote[] = [];
  const hasCanonicalQuoteAuthority = canonicalEligibleQuotes !== undefined;

  if (hasCanonicalQuoteAuthority) {
    for (const quote of canonicalEligibleQuotes) {
      if (Number.isFinite(quote.totalUsd) && quote.totalUsd > 0) {
        quotes.push({
          repairerName: quote.panelBeater || "Unknown Repairer",
          totalUsd: quote.totalUsd,
          isAssessorSelected: false,
          lineItemCount: quote.lineItemCount ?? 0,
          source: "canonical_stage9_eligible_quote",
        });
      }
    }
  }

  if (!hasCanonicalQuoteAuthority) {
    // Legacy direct callers without a Stage 9 ledger retain their historic
    // extraction fallback. The live orchestrator always supplies the canonical
    // population above.
    for (const eq of extractedQuotes) {
      if (eq.total_cost && eq.total_cost > 0) {
        quotes.push({
          repairerName: eq.panel_beater || "Unknown Repairer",
          totalUsd: eq.total_cost,
          isAssessorSelected: false,
          lineItemCount: eq.line_items?.length || 0,
          source: "extracted_quote",
        });
      }
    }

    // Source 2: ClaimRecord repairQuote (legacy direct callers only).
    if (claimRecord.repairQuote?.quoteTotalCents && claimRecord.repairQuote.quoteTotalCents > 0) {
      const existingRepairer = (claimRecord.repairQuote.repairerCompany || claimRecord.repairQuote.repairerName || "").toLowerCase();
      const alreadyExists = quotes.some(q =>
        q.repairerName.toLowerCase() === existingRepairer && existingRepairer !== ""
      );
      if (!alreadyExists && existingRepairer) {
        quotes.push({
          repairerName: claimRecord.repairQuote.repairerCompany || claimRecord.repairQuote.repairerName || "Unknown",
          totalUsd: claimRecord.repairQuote.quoteTotalCents / 100,
          isAssessorSelected: !!claimRecord.repairQuote.assessorName,
          lineItemCount: claimRecord.repairQuote.lineItems?.length || 0,
          source: "claim_record_assembly",
        });
      }
    }
  }

  // Mark assessor-selected quote: if assessorName exists and repairerCompany matches a quote
  const assessorRepairer = (claimRecord.repairQuote?.repairerCompany || "").toLowerCase();
  if (!hasCanonicalQuoteAuthority && assessorRepairer) {
    for (const q of quotes) {
      if (q.repairerName.toLowerCase() === assessorRepairer) {
        q.isAssessorSelected = true;
      }
    }
  }

  // Authorized/agreed amount (if available — retrospective/test files)
  const authorizedAmountUsd = claimRecord.repairQuote?.agreedCostCents
    ? claimRecord.repairQuote.agreedCostCents / 100
    : null;

  // KINGA estimate
  const estimate = kingaEstimateUsd || 0;
  const estimateSource = kingaEstimateSource || "not_available";

  // Optimised cost = lowest of {all quotes, KINGA estimate}
  const allCosts = [...quotes.map(q => q.totalUsd)];
  if (estimate > 0) allCosts.push(estimate);

  const optimisedCostUsd = allCosts.length > 0 ? Math.min(...allCosts) : 0;
  let optimisedCostSource = "no_data";
  if (optimisedCostUsd === estimate && estimate > 0) {
    optimisedCostSource = "kinga_estimate";
  } else {
    const matchingQuote = quotes.find(q => q.totalUsd === optimisedCostUsd);
    optimisedCostSource = matchingQuote ? `quote_${matchingQuote.repairerName}` : "unknown";
  }

  // Cost verdict: compare lowest quote vs KINGA estimate
  const lowestQuote = quotes.length > 0 ? Math.min(...quotes.map(q => q.totalUsd)) : null;
  let costVerdict: ClaimTruthCostBasis["costVerdict"] = "INSUFFICIENT_DATA";
  let costVerdictExplanation = "";
  let negotiationSavingUsd = 0;

  if (lowestQuote !== null && estimate > 0) {
    const deviation = (lowestQuote - estimate) / estimate;
    if (deviation > OVERPRICED_THRESHOLD) {
      costVerdict = "OVERPRICED";
      negotiationSavingUsd = lowestQuote - estimate;
      costVerdictExplanation = `Lowest quote ($${lowestQuote.toLocaleString()}) exceeds KINGA estimate ($${estimate.toLocaleString()}) by ${(deviation * 100).toFixed(1)}%. Negotiate down.`;
    } else if (deviation < UNDERPRICED_THRESHOLD) {
      costVerdict = "UNDERPRICED";
      costVerdictExplanation = `Lowest quote ($${lowestQuote.toLocaleString()}) is ${(Math.abs(deviation) * 100).toFixed(1)}% below KINGA estimate ($${estimate.toLocaleString()}). Verify repair scope is complete.`;
    } else {
      costVerdict = "FAIR";
      costVerdictExplanation = `Lowest quote ($${lowestQuote.toLocaleString()}) is within acceptable range of KINGA estimate ($${estimate.toLocaleString()}). Deviation: ${(deviation * 100).toFixed(1)}%.`;
    }

    // If authorized amount exists and is <= optimised, override to FAIR
    if (authorizedAmountUsd !== null && authorizedAmountUsd <= optimisedCostUsd) {
      if (costVerdict === "OVERPRICED") {
        conflicts.push({
          field: "costBasis.costVerdict",
          chosen: "FAIR (authorized amount is at or below optimised cost)",
          rejected: `OVERPRICED (based on quote vs estimate comparison)`,
          reason: `Insurer already negotiated to $${authorizedAmountUsd.toLocaleString()} which is at/below the optimised cost of $${optimisedCostUsd.toLocaleString()}`,
        });
        costVerdict = "FAIR";
        costVerdictExplanation = `Insurer authorized $${authorizedAmountUsd.toLocaleString()}, which is at or below the optimised cost of $${optimisedCostUsd.toLocaleString()}. Good negotiation.`;
        negotiationSavingUsd = 0;
      }
    }
  } else if (lowestQuote !== null && estimate === 0) {
    costVerdict = "INSUFFICIENT_DATA";
    costVerdictExplanation = "KINGA estimate unavailable — cannot assess whether quotes are fair.";
  } else {
    costVerdict = "INSUFFICIENT_DATA";
    costVerdictExplanation = "No quotes extracted from claim file.";
  }

  // Per-quote deviation from KINGA estimate
  const quoteVsEstimateDeviation = estimate > 0
    ? quotes.map(q => ({
        repairerName: q.repairerName,
        quoteUsd: q.totalUsd,
        deviationPercent: Math.round(((q.totalUsd - estimate) / estimate) * 1000) / 10,
      }))
    : [];

  return {
    quotes,
    kingaEstimateUsd: estimate,
    kingaEstimateSource: estimateSource,
    optimisedCostUsd,
    optimisedCostSource,
    authorizedAmountUsd,
    costVerdict,
    costVerdictExplanation,
    negotiationSavingUsd,
    quoteVsEstimateDeviation,
  };
}

// ─── VEHICLE RESOLVER ───────────────────────────────────────────────────────

function resolveVehicle(input: ClaimTruthInput, costBasis: ClaimTruthCostBasis): ClaimTruthVehicle {
  const { claimRecord } = input;
  const v = claimRecord.vehicle;
  const valuation = claimRecord.valuation;

  const marketValueUsd = valuation?.marketValueUsd || v.marketValueUsd || v.valueUsd || 0;
  const marketValueSource = valuation?.valuationMethod || "not_available";

  const repairCost = costBasis.optimisedCostUsd;
  const repairToValueRatio = marketValueUsd > 0 ? repairCost / marketValueUsd : 0;

  return {
    make: v.make || "Unknown",
    model: v.model || "Unknown",
    year: v.year,
    vin: v.vin,
    registration: v.registration,
    marketValueUsd,
    marketValueSource,
    repairToValueRatio,
    writeOffThreshold: ECONOMIC_WRITE_OFF_THRESHOLD,
    isEconomicWriteOff: repairToValueRatio >= ECONOMIC_WRITE_OFF_THRESHOLD,
  };
}

// ─── FRAUD SIGNALS RESOLVER ─────────────────────────────────────────────────

function resolveFraudSignals(
  input: ClaimTruthInput,
  timeline: ClaimTruthTimeline,
  costBasis: ClaimTruthCostBasis
): ClaimTruthFraudSignals {
  const { claimRecord } = input;
  const indicators: ClaimTruthFraudSignals["indicators"] = [];
  const physicsAnomalies: PhysicsAnomaly[] = [];

  // Airbag anomaly: if airbags deployed but delta-V is below threshold
  const airbagDeployed = claimRecord.accidentDetails?.airbagDeployment === true;
  const estimatedSpeed = claimRecord.accidentDetails?.estimatedSpeedKmh;

  if (airbagDeployed && estimatedSpeed !== null && estimatedSpeed !== undefined) {
    // Delta-V is typically much lower than impact speed for pothole/depression impacts
    // The key check: if the physics engine calculated a delta-V < 25 km/h but airbags deployed
    // This is populated later by the physics engine — for now, flag as needing investigation
    // The CTL will be enriched after Stage 7 runs
  }

  // Late submission as fraud indicator (only if genuinely late)
  if (timeline.lateSubmission && timeline.daysToLodge !== null && timeline.daysToLodge > 90) {
    indicators.push({
      signal: `Claim lodged ${timeline.daysToLodge} days after incident`,
      weight: 15,
      source: "timeline_analysis",
    });
  }

  // Cost anomaly indicator
  if (costBasis.costVerdict === "OVERPRICED") {
    indicators.push({
      signal: `Repair cost exceeds KINGA estimate by ${costBasis.quoteVsEstimateDeviation[0]?.deviationPercent ?? 0}%`,
      weight: 10,
      source: "cost_analysis",
    });
  }

  return { indicators, physicsAnomalies };
}

// ─── POLICY & RECOVERY RESOLVER ─────────────────────────────────────────────

function resolvePolicyRecovery(input: ClaimTruthInput): ClaimTruthPolicyRecovery {
  const { claimRecord } = input;
  const exclusions: PolicyExclusion[] = [];
  const subrogationLeads: SubrogationLead[] = [];

  // Subrogation: if police charged a third party
  const chargedParty = claimRecord.policeReport?.chargedParty;
  if (chargedParty && chargedParty.toLowerCase() !== "unknown" && chargedParty.toLowerCase() !== "not stated") {
    // Check if the charged party is NOT the insured driver
    const insuredDriver = (claimRecord.driver?.name || "").toLowerCase();
    if (chargedParty.toLowerCase() !== insuredDriver.toLowerCase()) {
      subrogationLeads.push({
        party: chargedParty,
        basis: `Police charged "${chargedParty}" at scene. Case: ${claimRecord.policeReport?.reportNumber || "N/A"}, Station: ${claimRecord.policeReport?.station || "N/A"}`,
        source: "police_report",
      });
    }
  }

  // Subrogation: if third party is named and incident is multi-vehicle
  const thirdParty = claimRecord.thirdParty;
  if (thirdParty?.driverName && claimRecord.accidentDetails?.incidentType !== "single_vehicle") {
    const alreadyListed = subrogationLeads.some(s => s.party.toLowerCase() === (thirdParty.driverName || "").toLowerCase());
    if (!alreadyListed) {
      subrogationLeads.push({
        party: thirdParty.driverName,
        basis: `Third party identified: ${thirdParty.driverName}. Vehicle: ${thirdParty.vehicleDescription || "unknown"}. Registration: ${thirdParty.registration || "unknown"}.`,
        source: "claim_extraction",
      });
    }
  }

  // Policy exclusions: extract from Stage 3 policyExclusions field
  const { stage3Data } = input;
  if (stage3Data?.perDocumentExtractions) {
    for (const extraction of stage3Data.perDocumentExtractions) {
      if (extraction.policyExclusions) {
        const parts = extraction.policyExclusions.split(" | ");
        for (const part of parts) {
          const trimmed = part.trim();
          if (trimmed && !exclusions.some(e => e.description === trimmed)) {
            exclusions.push({
              description: trimmed,
              source: "assessor_notes",
              pageRef: null,
            });
          }
        }
      }
    }
  }

  return {
    exclusions,
    subrogationLeads,
    excessApplicable: claimRecord.insuranceContext?.excessAmountUsd || null,
    policyNumber: claimRecord.insuranceContext?.policyNumber || null,
    insurer: claimRecord.insuranceContext?.insurerName || null,
  };
}

// ─── POLICE REPORT RESOLVER ─────────────────────────────────────────────────

function resolvePoliceReport(input: ClaimTruthInput): ClaimTruthPoliceReport {
  const { claimRecord } = input;
  const pr = claimRecord.policeReport;
  const accident = claimRecord.accidentDetails;

  // Witness expectation: context-aware
  // Single-vehicle on rural/remote road → unrealistic to expect witnesses
  const isSingleVehicle = accident?.collisionScenario === "single_vehicle" || accident?.incidentType === "single_vehicle";
  const isRuralRoad = (accident?.roadSurface || "").toLowerCase().includes("dust") ||
    (accident?.location || "").toLowerCase().includes("rural") ||
    (accident?.description || "").toLowerCase().includes("rural") ||
    (accident?.description || "").toLowerCase().includes("peg"); // "25km peg" = rural road marker

  const witnessExpectationRealistic = !(isSingleVehicle && isRuralRoad);

  return {
    caseNumber: pr?.reportNumber || null,
    station: pr?.station || null,
    officerFindings: pr?.officerFindings || null,
    chargedParty: pr?.chargedParty || null,
    witnessStatements: false, // would need explicit extraction
    witnessExpectationRealistic,
  };
}

// ─── UNIFIED DECISION RESOLVER ──────────────────────────────────────────────

function resolveDecision(
  evidence: ClaimTruthEvidence,
  timeline: ClaimTruthTimeline,
  costBasis: ClaimTruthCostBasis,
  vehicle: ClaimTruthVehicle,
  fraudSignals: ClaimTruthFraudSignals,
  policyAndRecovery: ClaimTruthPolicyRecovery,
  policeReport: ClaimTruthPoliceReport,
  // R-D-02: Stage 8 composite fraud score and level (optional, for backwards-compatibility)
  stage8FraudScore?: number | null,
  stage8FraudLevel?: "minimal" | "low" | "moderate" | "high" | "elevated" | null
): ClaimTruthDecision {
  const reviewTriggers: string[] = [];
  const approvalConditions: string[] = [];
  let recommendation: ClaimTruthDecision["recommendation"] = "APPROVE";

  // ─── ESCALATION TRIGGERS (highest priority) ─────────────────────
  // R-D-02: Use Stage 8 composite score (0–100 normalised) when available.
  // Fall back to raw CTL indicator weight sum for backwards-compatibility.
  const fraudScore = stage8FraudScore ?? fraudSignals.indicators.reduce((sum, i) => sum + i.weight, 0);
  // R-D-02: Tier-aware ESCALATE: composite score ≥65 (= 'elevated') or level is 'elevated'/'high'
  const isEscalateTier = stage8FraudLevel === "elevated" || stage8FraudLevel === "high";
  if (fraudScore >= 65 || isEscalateTier) {
    recommendation = "ESCALATE";
    reviewTriggers.push(`High fraud risk: score ${fraudScore}/100 (${stage8FraudLevel ?? "computed"})`);
  } else if (fraudScore >= 45) {
    // 'medium' tier: REVIEW, not ESCALATE
    if ((recommendation as string) !== "ESCALATE") recommendation = "REVIEW";
    reviewTriggers.push(`Elevated fraud risk: score ${fraudScore}/100 (${stage8FraudLevel ?? "moderate"}) — manual review required`);
  }

  // Active physics anomalies that need investigation
  const investigateAnomalies = fraudSignals.physicsAnomalies.filter(a => a.severity === "INVESTIGATE");
  if (investigateAnomalies.length > 0) {
    if (recommendation !== "ESCALATE") recommendation = "REVIEW";
    reviewTriggers.push(...investigateAnomalies.map(a => a.description));
  }

  // ─── REVIEW TRIGGERS ──────────────────────────────────────────────────
  // Cost verdict
  if (costBasis.costVerdict === "OVERPRICED") {
    if (recommendation !== "ESCALATE") recommendation = "REVIEW";
    reviewTriggers.push(`Cost: ${costBasis.costVerdictExplanation}`);
  }

  // Economic write-off
  if (vehicle.isEconomicWriteOff) {
    if (recommendation !== "ESCALATE") recommendation = "REVIEW";
    reviewTriggers.push(`Repair-to-value ratio ${(vehicle.repairToValueRatio * 100).toFixed(0)}% exceeds write-off threshold ${(vehicle.writeOffThreshold * 100).toFixed(0)}%`);
  }

  // Late submission (only if genuinely late with reliable dates)
  if (timeline.lateSubmission) {
    if (recommendation !== "ESCALATE") recommendation = "REVIEW";
    reviewTriggers.push(`Late submission: ${timeline.daysToLodge} days after incident (${timeline.lateSubmissionSource})`);
  }

  // Low evidence completeness
  if (evidence.completenessScore < 50) {
    if (recommendation !== "ESCALATE") recommendation = "REVIEW";
    reviewTriggers.push(`Low evidence completeness: ${evidence.completenessScore}%`);
  }

  // ─── APPROVAL CONDITIONS ──────────────────────────────────────────────
  if (recommendation === "APPROVE") {
    // Standard conditions for approval
    if (policyAndRecovery.subrogationLeads.length > 0) {
      approvalConditions.push(`Pursue subrogation against: ${policyAndRecovery.subrogationLeads.map(s => s.party).join(", ")}`);
    }
    if (policyAndRecovery.excessApplicable && policyAndRecovery.excessApplicable > 0) {
      approvalConditions.push(`Apply excess: $${policyAndRecovery.excessApplicable.toLocaleString()}`);
    }
    if (policyAndRecovery.exclusions.length > 0) {
      approvalConditions.push(`Apply exclusions: ${policyAndRecovery.exclusions.map(e => e.description).join("; ")}`);
    }
  }

  // Primary reason
  let primaryReason = "";
  if (recommendation === "APPROVE") {
    primaryReason = "Low risk — proceed to standard settlement checks";
    if (approvalConditions.length > 0) {
      primaryReason += ` (with ${approvalConditions.length} condition(s))`;
    }
  } else if (recommendation === "REVIEW") {
    primaryReason = reviewTriggers[0] || "Manual review required";
  } else {
    primaryReason = `Escalate: ${reviewTriggers[0] || "Multiple high-risk indicators"}`;
  }

  // Confidence: higher when more data is available and consistent
  let confidence = evidence.completenessScore;
  if (costBasis.costVerdict !== "INSUFFICIENT_DATA") confidence = Math.min(confidence + 10, 100);
  if (policeReport.caseNumber) confidence = Math.min(confidence + 5, 100);

  return {
    recommendation,
    primaryReason,
    confidence,
    reviewTriggers,
    approvalConditions,
  };
}

// ─── POST-PHYSICS ENRICHMENT ────────────────────────────────────────────────

/**
 * Enrich the ClaimTruth with physics results AFTER Stage 7 runs.
 * This adds airbag anomalies and speed-related fraud signals.
 * The decision is re-evaluated with the new information.
 */
export function enrichClaimTruthWithPhysics(
  truth: ClaimTruth,
  physicsResult: {
    deltaVKmh: number | null;
    airbagDeployed: boolean;
    airbagThresholdKmh: number;
    estimatedSpeedKmh: number | null;
    damageConsistencyScore: number | null;
  }
): ClaimTruth {
  const enriched = { ...truth };
  const anomalies = [...truth.fraudSignals.physicsAnomalies];

  // Airbag anomaly: deployed but delta-V below threshold
  if (physicsResult.airbagDeployed && physicsResult.deltaVKmh !== null) {
    if (physicsResult.deltaVKmh < physicsResult.airbagThresholdKmh) {
      anomalies.push({
        type: "airbag_deployment_vs_delta_v",
        description: `Airbags deployed at ${physicsResult.deltaVKmh.toFixed(1)} km/h Delta-V, below the ${physicsResult.airbagThresholdKmh} km/h deployment threshold. This requires investigation.`,
        severity: "INVESTIGATE",
        evidence: `Airbag deployment confirmed (claim form/photos). Calculated Delta-V: ${physicsResult.deltaVKmh.toFixed(1)} km/h.`,
        expectation: `Airbags typically deploy at Delta-V ≥ ${physicsResult.airbagThresholdKmh} km/h (FMVSS 208).`,
      });
    }
  }

  // Low damage consistency
  if (physicsResult.damageConsistencyScore !== null && physicsResult.damageConsistencyScore < 40) {
    anomalies.push({
      type: "damage_consistency_low",
      description: `Damage consistency score ${physicsResult.damageConsistencyScore}/100 — reported damage pattern does not align well with physics model.`,
      severity: physicsResult.damageConsistencyScore < 25 ? "INVESTIGATE" : "ADVISORY",
      evidence: `Damage consistency: ${physicsResult.damageConsistencyScore}/100`,
      expectation: "Expected ≥ 60/100 for consistent claims",
    });
  }

  enriched.fraudSignals = {
    ...truth.fraudSignals,
    physicsAnomalies: anomalies,
  };

  // Re-evaluate decision with physics information
  // R-D-02: preserve stage8FraudScore/Level through the re-evaluation so tier-aware thresholds are maintained
  enriched.decision = resolveDecision(
    enriched.evidence,
    enriched.timeline,
    enriched.costBasis,
    enriched.vehicle,
    enriched.fraudSignals,
    enriched.policyAndRecovery,
    enriched.policeReport,
    truth.meta.stage8FraudScore,
    truth.meta.stage8FraudLevel
  );

  return enriched;
}
