/**
 * Quote Intelligence Orchestrator
 *
 * Combines all Repair Quote Intelligence sub-services into a single call:
 *   1. Fetch detected parts from ai_assessments.damaged_components_json
 *   2. Fetch quoted parts from panel_beater_quotes.components_json
 *   3. Reconcile detected vs quoted parts
 *   4. Calculate historical cost deviation
 *   5. Fetch country repair context
 *   6. Classify risk
 *
 * Returns an IntelligenceReport that is advisory only — it does NOT
 * modify any existing table or block any claim workflow.
 */

import { getDb } from "../db";
import { aiAssessments, panelBeaterQuotes, claims } from "../../drizzle/schema";
import { eq, desc } from "drizzle-orm";
import { reconcileParts, type DetectedPart, type QuotedPart } from "./part-reconciliation";
import { calculateHistoricalDeviation, type DeviationResult } from "./cost-deviation";
import { getCountryRepairContext, type CountryRepairContext } from "./country-repair-index";
import { classifyRisk, type RiskLevel } from "./risk-classifier";
import type { ReconciliationResult } from "./part-reconciliation";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IntelligenceReport {
  claimId: number;
  detectedParts: DetectedPart[];
  quotedParts: QuotedPart[];
  reconciliation: ReconciliationResult;
  historicalDeviation: DeviationResult;
  countryContext: CountryRepairContext | null;
  riskLevel: RiskLevel;
  riskFactors: string[];
  generatedAt: string;
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

/**
 * Generate the Repair Quote Intelligence report for a claim.
 *
 * @param claimId  - The claim to analyse
 * @param tenantId - Tenant scope
 * @param countryCode - Country for repair context (default "ZA")
 */
export async function generateIntelligenceReport(
  claimId: number,
  tenantId: string,
  countryCode: string = "ZA"
): Promise<IntelligenceReport> {
  const db = await getDb();

  // ── 1. Fetch claim for vehicle info ──────────────────────────────────────
  let vehicleMake: string | null = null;
  let vehicleModel: string | null = null;
  let totalQuoted = 0;

  if (db) {
    const [claim] = await db
      .select({
        vehicleMake: claims.vehicleMake,
        vehicleModel: claims.vehicleModel,
      })
      .from(claims)
      .where(eq(claims.id, claimId))
      .limit(1);

    if (claim) {
      vehicleMake = claim.vehicleMake ?? null;
      vehicleModel = claim.vehicleModel ?? null;
    }
  }

  // ── 2. Fetch detected parts from latest AI assessment ────────────────────
  let detectedParts: DetectedPart[] = [];

  if (db) {
    const [assessment] = await db
      .select({ damagedComponentsJson: aiAssessments.damagedComponentsJson })
      .from(aiAssessments)
      .where(eq(aiAssessments.claimId, claimId))
      .orderBy(desc(aiAssessments.id))
      .limit(1);

    if (assessment?.damagedComponentsJson) {
      try {
        const parsed = JSON.parse(assessment.damagedComponentsJson);
        if (Array.isArray(parsed)) {
          detectedParts = parsed as DetectedPart[];
        }
      } catch {
        // Malformed JSON — treat as no detected parts
      }
    }
  }

  // ── 3. Fetch quoted parts from submitted panel beater quotes ─────────────
  let quotedParts: QuotedPart[] = [];

  if (db) {
    const quotes = await db
      .select({
        quotedAmount: panelBeaterQuotes.quotedAmount,
        componentsJson: panelBeaterQuotes.componentsJson,
        status: panelBeaterQuotes.status,
      })
      .from(panelBeaterQuotes)
      .where(eq(panelBeaterQuotes.claimId, claimId));

    // Use submitted/accepted quotes only; fall back to all if none submitted
    const submitted = quotes.filter((q) =>
      ["submitted", "accepted", "modified"].includes(q.status)
    );
    const relevantQuotes = submitted.length > 0 ? submitted : quotes;

    // Aggregate total quoted amount (use first accepted quote, or lowest)
    if (relevantQuotes.length > 0) {
      const sorted = [...relevantQuotes].sort(
        (a, b) => (a.quotedAmount ?? 0) - (b.quotedAmount ?? 0)
      );
      totalQuoted = sorted[0].quotedAmount ?? 0;
    }

    // Merge all components from all relevant quotes (deduplicated later in reconcile)
    for (const q of relevantQuotes) {
      if (q.componentsJson) {
        try {
          const parsed = JSON.parse(q.componentsJson);
          if (Array.isArray(parsed)) {
            quotedParts.push(...(parsed as QuotedPart[]));
          }
        } catch {
          // Skip malformed JSON
        }
      }
    }
  }

  // ── 4. Reconcile parts ───────────────────────────────────────────────────
  const reconciliation = reconcileParts(detectedParts, quotedParts);

  // ── 5. Historical deviation ──────────────────────────────────────────────
  const historicalDeviation = await calculateHistoricalDeviation(
    tenantId,
    totalQuoted,
    vehicleMake,
    vehicleModel
  );

  // ── 6. Country context ───────────────────────────────────────────────────
  let countryContext: CountryRepairContext | null = null;
  try {
    countryContext = await getCountryRepairContext(countryCode);
  } catch {
    // Non-fatal — proceed without country context
  }

  // ── 7. Risk classification ───────────────────────────────────────────────
  const { riskLevel, riskFactors } = classifyRisk(reconciliation, historicalDeviation);

  return {
    claimId,
    detectedParts,
    quotedParts,
    reconciliation,
    historicalDeviation,
    countryContext,
    riskLevel,
    riskFactors,
    generatedAt: new Date().toISOString(),
  };
}
