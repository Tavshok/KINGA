/**
 * Quote AI Optimisation Module
 *
 * Triggered when all 3 panel beater quotes are submitted for a claim.
 * Combines the deterministic cost-optimization engine with an LLM analysis
 * to produce:
 *   - Per-quote cost deviation %
 *   - Overpricing / parts inflation / labour inflation flags
 *   - Recommended repairer (marketplace_profile_id)
 *   - Risk score (0-100 + categorical)
 *   - Human-readable optimisation summary
 *
 * AI assists; insurer makes the final decision.
 */

import { invokeLLM } from "./_core/llm";
import { optimizeQuotes, type QuoteAnalysis } from "./cost-optimization";
import { getDb } from "./db";
import { quoteOptimisationResults, panelBeaterQuotes, marketplaceProfiles } from "../drizzle/schema";
import { eq, and, inArray } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QuoteInput {
  profileId: string;        // marketplace_profiles.id
  companyName: string;
  totalAmount: number;      // cents
  partsAmount: number;      // cents
  labourAmount: number;     // cents
  labourHours: number;
  itemizedBreakdown: string | null;
  partsQuality: string;
}

export interface PerQuoteAnalysis {
  profileId: string;
  companyName: string;
  totalAmount: number;
  partsAmount: number;
  labourAmount: number;
  costDeviationPct: number;   // % deviation from median (positive = above median)
  flags: string[];            // e.g. ["overpricing","parts_inflation","labour_inflation"]
}

export interface OptimisationOutput {
  quoteAnalysis: PerQuoteAnalysis[];
  recommendedProfileId: string;
  recommendedCompanyName: string;
  overallRiskScore: "low" | "medium" | "high" | "critical";
  riskScoreNumeric: number;   // 0-100
  overpricingDetected: boolean;
  partsInflationDetected: boolean;
  labourInflationDetected: boolean;
  optimisationSummary: string;
}

// ─── LLM Prompt ──────────────────────────────────────────────────────────────

function buildPrompt(
  claimContext: { vehicleMake: string; vehicleModel: string; vehicleYear: number },
  quotes: QuoteInput[],
  engineResult: ReturnType<typeof optimizeQuotes>
): string {
  const quoteLines = quotes.map((q, i) =>
    `Quote ${i + 1}: ${q.companyName}
  - Total: R${(q.totalAmount / 100).toFixed(2)}
  - Parts: R${(q.partsAmount / 100).toFixed(2)}
  - Labour: R${(q.labourAmount / 100).toFixed(2)} (${q.labourHours}h)
  - Parts quality: ${q.partsQuality}
  - Breakdown: ${q.itemizedBreakdown ?? "Not provided"}`
  ).join("\n\n");

  return `You are an expert insurance cost analyst for motor vehicle claims in South Africa.

VEHICLE: ${claimContext.vehicleYear} ${claimContext.vehicleMake} ${claimContext.vehicleModel}

THREE PANEL BEATER QUOTES:
${quoteLines}

STATISTICAL ANALYSIS (pre-computed):
- Median cost: R${(engineResult.medianCost / 100).toFixed(2)}
- Average cost: R${(engineResult.averageCost / 100).toFixed(2)}
- Cost spread: R${(engineResult.costSpread / 100).toFixed(2)} (${engineResult.spreadPercentage.toFixed(1)}%)
- Recommended quote (lowest risk-adjusted): ${engineResult.recommendedQuote.panelBeaterName}
- Fraud flags: ${engineResult.fraudFlags.length > 0 ? engineResult.fraudFlags.join(", ") : "None"}
- Suspicious patterns: ${engineResult.suspiciousPatterns.length > 0 ? engineResult.suspiciousPatterns.join(", ") : "None"}

HISTORICAL BENCHMARKS (South African motor repair industry):
- Average labour rate: R450-R650/hour (panel beating)
- OEM parts typically 15-25% above aftermarket
- Typical repair duration for moderate damage: 5-15 labour hours
- Parts inflation flag threshold: >30% above median parts cost
- Labour inflation flag threshold: >40% above median labour cost
- Overpricing flag threshold: total cost >25% above median

TASK:
Analyse the three quotes and return a JSON object with EXACTLY this structure:
{
  "perQuoteAnalysis": [
    {
      "profileId": "<use the profileId values provided>",
      "companyName": "<name>",
      "costDeviationPct": <number, % above/below median, negative=below>,
      "flags": ["overpricing"|"parts_inflation"|"labour_inflation"],
      "reasoning": "<1-2 sentences>"
    }
  ],
  "recommendedProfileId": "<profileId of best value repairer>",
  "recommendedCompanyName": "<name>",
  "riskScoreNumeric": <0-100, higher=more risk>,
  "overallRiskScore": "low"|"medium"|"high"|"critical",
  "overpricingDetected": true|false,
  "partsInflationDetected": true|false,
  "labourInflationDetected": true|false,
  "optimisationSummary": "<3-5 sentence professional narrative for the insurer review page>"
}

RULES:
- riskScoreNumeric: 0-20=low, 21-50=medium, 51-75=high, 76-100=critical
- Only flag genuine anomalies — do not flag minor variance within normal range
- optimisationSummary must be professional, factual, and actionable
- Return ONLY the JSON object, no markdown fences`;
}

// ─── Core Function ────────────────────────────────────────────────────────────

/**
 * Run AI cost optimisation for a claim's 3 panel beater quotes.
 * Persists results to quote_optimisation_results.
 * Returns the optimisation output.
 */
export async function runQuoteOptimisation(
  claimId: number,
  claimContext: { vehicleMake: string; vehicleModel: string; vehicleYear: number },
  quotes: QuoteInput[],
  triggeredBy?: number
): Promise<OptimisationOutput> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  // 1. Insert a pending record
  await db.insert(quoteOptimisationResults).values({
    claimId,
    triggeredBy: triggeredBy ?? null,
    status: "processing",
    createdAt: new Date().toISOString().slice(0, 19).replace("T", " "),
    updatedAt: new Date().toISOString().slice(0, 19).replace("T", " "),
  });

  // Retrieve the inserted row id
  const [pendingRow] = await db
    .select({ id: quoteOptimisationResults.id })
    .from(quoteOptimisationResults)
    .where(and(
      eq(quoteOptimisationResults.claimId, claimId),
      eq(quoteOptimisationResults.status, "processing")
    ))
    .orderBy(quoteOptimisationResults.id)
    .limit(1);

  const resultId = pendingRow?.id;

  try {
    // 2. Run deterministic engine
    const engineQuotes: QuoteAnalysis[] = quotes.map((q, i) => ({
      quoteId: i + 1,
      panelBeaterId: i + 1,
      panelBeaterName: q.companyName,
      totalCost: q.totalAmount,
      components: [],
      partsQuality: q.partsQuality,
      warrantyMonths: 0,
      estimatedDuration: q.labourHours,
    }));

    const engineResult = optimizeQuotes(engineQuotes);

    // 3. Call LLM
    const prompt = buildPrompt(claimContext, quotes, engineResult);
    const llmResponse = await invokeLLM({
      messages: [
        { role: "system", content: "You are an expert insurance cost analyst. Return only valid JSON." },
        { role: "user", content: prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "quote_optimisation",
          strict: true,
          schema: {
            type: "object",
            properties: {
              perQuoteAnalysis: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    profileId: { type: "string" },
                    companyName: { type: "string" },
                    costDeviationPct: { type: "number" },
                    flags: { type: "array", items: { type: "string" } },
                    reasoning: { type: "string" },
                  },
                  required: ["profileId", "companyName", "costDeviationPct", "flags", "reasoning"],
                  additionalProperties: false,
                },
              },
              recommendedProfileId: { type: "string" },
              recommendedCompanyName: { type: "string" },
              riskScoreNumeric: { type: "number" },
              overallRiskScore: { type: "string" },
              overpricingDetected: { type: "boolean" },
              partsInflationDetected: { type: "boolean" },
              labourInflationDetected: { type: "boolean" },
              optimisationSummary: { type: "string" },
            },
            required: [
              "perQuoteAnalysis", "recommendedProfileId", "recommendedCompanyName",
              "riskScoreNumeric", "overallRiskScore", "overpricingDetected",
              "partsInflationDetected", "labourInflationDetected", "optimisationSummary"
            ],
            additionalProperties: false,
          },
        },
      },
    });

    const rawContent = llmResponse?.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent));

    // 4. Build per-quote analysis with deviation %
    const medianCost = engineResult.medianCost;
    const perQuoteAnalysis: PerQuoteAnalysis[] = quotes.map((q) => {
      const llmEntry = parsed.perQuoteAnalysis?.find(
        (p: { profileId: string }) => p.profileId === q.profileId
      );
      const deviationPct = medianCost > 0
        ? ((q.totalAmount - medianCost) / medianCost) * 100
        : 0;
      return {
        profileId: q.profileId,
        companyName: q.companyName,
        totalAmount: q.totalAmount,
        partsAmount: q.partsAmount,
        labourAmount: q.labourAmount,
        costDeviationPct: Math.round(deviationPct * 10) / 10,
        flags: llmEntry?.flags ?? [],
      };
    });

    const output: OptimisationOutput = {
      quoteAnalysis: perQuoteAnalysis,
      recommendedProfileId: parsed.recommendedProfileId ?? quotes[0].profileId,
      recommendedCompanyName: parsed.recommendedCompanyName ?? quotes[0].companyName,
      overallRiskScore: (["low", "medium", "high", "critical"].includes(parsed.overallRiskScore)
        ? parsed.overallRiskScore
        : "medium") as OptimisationOutput["overallRiskScore"],
      riskScoreNumeric: Math.min(100, Math.max(0, Number(parsed.riskScoreNumeric) || 0)),
      overpricingDetected: Boolean(parsed.overpricingDetected),
      partsInflationDetected: Boolean(parsed.partsInflationDetected),
      labourInflationDetected: Boolean(parsed.labourInflationDetected),
      optimisationSummary: parsed.optimisationSummary ?? "Analysis completed.",
    };

    // 5. Persist completed result
    if (resultId) {
      const now = new Date().toISOString().slice(0, 19).replace("T", " ");
      await db
        .update(quoteOptimisationResults)
        .set({
          status: "completed",
          quoteAnalysis: output.quoteAnalysis,
          recommendedProfileId: output.recommendedProfileId,
          recommendedCompanyName: output.recommendedCompanyName,
          overallRiskScore: output.overallRiskScore,
          riskScoreNumeric: String(output.riskScoreNumeric),
          overpricingDetected: output.overpricingDetected ? 1 : 0,
          partsInflationDetected: output.partsInflationDetected ? 1 : 0,
          labourInflationDetected: output.labourInflationDetected ? 1 : 0,
          optimisationSummary: output.optimisationSummary,
          rawLlmResponse: parsed,
          updatedAt: now,
        })
        .where(eq(quoteOptimisationResults.id, resultId));
    }

    console.log(`[QuoteOptimisation] Completed for claim ${claimId} — risk: ${output.overallRiskScore} (${output.riskScoreNumeric})`);
    return output;

  } catch (err) {
    // Mark as failed
    if (resultId) {
      await db
        .update(quoteOptimisationResults)
        .set({ status: "failed", updatedAt: new Date().toISOString().slice(0, 19).replace("T", " ") })
        .where(eq(quoteOptimisationResults.id, resultId));
    }
    console.error(`[QuoteOptimisation] Failed for claim ${claimId}:`, err);
    throw err;
  }
}

/**
 * Fetch the latest optimisation result for a claim.
 */
export async function getLatestOptimisationResult(claimId: number) {
  const db = await getDb();
  if (!db) return null;

  const [result] = await db
    .select()
    .from(quoteOptimisationResults)
    .where(eq(quoteOptimisationResults.claimId, claimId))
    .orderBy(quoteOptimisationResults.id)
    .limit(1);

  return result ?? null;
}
