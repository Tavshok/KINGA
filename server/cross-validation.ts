// @ts-nocheck
/**
 * KINGA Cross-Validation Engine
 * 
 * Compares quoted repair parts against damage visible in photos using
 * LLM vision analysis. Produces a detailed validation report with
 * four categories:
 * 
 * 1. CONFIRMED — Quoted AND visible in photos (high confidence)
 * 2. QUOTED_NOT_VISIBLE — Quoted but not seen in photos
 *    - Could be hidden/internal damage (legitimate) or fraud indicator
 * 3. VISIBLE_NOT_QUOTED — Damage visible in photos but not quoted
 *    - Possible underquoting or missed damage
 * 4. UNAFFECTED — Neither quoted nor visible (no concern)
 * 
 * The engine distinguishes between externally visible parts (bumper, fender,
 * headlight) and hidden/internal parts (subframe, suspension, wiring) to
 * provide intelligent risk scoring.
 */

import { invokeLLM } from "./_core/llm";
import {
  resolveComponent,
  normalizeComponentName,
  type VehiclePart,
  type VehicleZone,
} from "../shared/vehicleParts";

// ─── Types ───────────────────────────────────────────────────────────

export type ValidationCategory =
  | "confirmed"           // Quoted AND visible
  | "quoted_not_visible"  // Quoted but NOT visible in photos
  | "visible_not_quoted"  // Visible damage but NOT in quote
  | "unaffected";         // Neither quoted nor visible

export type RiskLevel = "none" | "low" | "medium" | "high" | "critical";

export interface CrossValidationItem {
  /** Canonical part name */
  partName: string;
  /** Original raw name from quote or photo analysis */
  rawName: string;
  /** Resolved vehicle part (null if unrecognized) */
  resolvedPart: VehiclePart | null;
  /** Which zone on the vehicle */
  zone: VehicleZone | null;
  /** Validation category */
  category: ValidationCategory;
  /** Whether this part is typically externally visible */
  isExternallyVisible: boolean;
  /** Risk level for this specific item */
  riskLevel: RiskLevel;
  /** Human-readable explanation */
  explanation: string;
  /** Confidence score 0-1 */
  confidence: number;
  /** Quoted cost if available */
  quotedCost?: number;
  /** Quoted repair action (repair/replace/refinish) */
  quotedAction?: string;
}

export interface PhotoAnalysisResult {
  /** URL of the analyzed photo */
  photoUrl: string;
  /** Parts/damage detected in this specific photo */
  visibleDamage: {
    partName: string;
    damageDescription: string;
    severity: "minor" | "moderate" | "severe" | "critical";
    confidence: number;
  }[];
  /** Overall description of damage visible */
  overallDescription: string;
  /** Zones visible in this photo */
  visibleZones: VehicleZone[];
}

export interface CrossValidationReport {
  /** Timestamp of validation */
  timestamp: string;
  /** Summary statistics */
  summary: {
    totalQuotedParts: number;
    totalVisibleDamage: number;
    confirmedCount: number;
    quotedNotVisibleCount: number;
    visibleNotQuotedCount: number;
    /** Legitimate hidden parts (subframe, suspension, etc.) */
    legitimateHiddenCount: number;
    /** Suspicious quoted-not-visible (externally visible parts not seen) */
    suspiciousCount: number;
    overallRiskScore: number; // 0-100
    overallRiskLevel: RiskLevel;
  };
  /** Individual item validations */
  items: CrossValidationItem[];
  /** Photo analysis results */
  photoAnalyses: PhotoAnalysisResult[];
  /** Fraud indicators specific to cross-validation */
  fraudIndicators: string[];
  /** Recommendations for the insurer */
  recommendations: string[];
}

// ─── Part Visibility Classification ──────────────────────────────────

/**
 * Parts that MUST be visible in exterior photos if damaged.
 * If these are quoted but not visible, it's a strong fraud indicator.
 */
const EXTERNALLY_VISIBLE_PARTS = new Set([
  "front_bumper", "rear_bumper", "bonnet", "boot_lid", "tailgate",
  "headlight_l", "headlight_r", "tail_light_l", "tail_light_r",
  "grille", "front_fender_l", "front_fender_r",
  "fog_light_l", "fog_light_r", "indicator_l", "indicator_r",
  "left_front_door", "left_rear_door", "right_front_door", "right_rear_door",
  "left_mirror", "right_mirror",
  "left_quarter_panel", "right_quarter_panel",
  "windscreen", "rear_windscreen",
  "roof_panel", "bull_bar", "rear_canopy",
  "left_side_panel", "number_plate_light",
  "rear_panel",
]);

/**
 * Parts that are typically hidden/internal and may not be visible in photos.
 * Quoting these without photo evidence is more acceptable.
 */
const HIDDEN_INTERNAL_PARTS = new Set([
  "radiator", "chassis_frame", "suspension_front", "suspension_rear",
  "exhaust_system", "drivetrain", "engine_sump", "fuel_tank",
  "wiper_assembly",
]);

/**
 * Parts that are partially visible — some sub-parts visible, some hidden.
 */
const PARTIALLY_VISIBLE_PARTS = new Set([
  "left_sill", "right_sill", "a_pillar", "b_pillar", "c_pillar",
  "sunroof", "wheels_tyres",
]);

function isExternallyVisible(partId: string): boolean {
  return EXTERNALLY_VISIBLE_PARTS.has(partId);
}

function isHiddenInternal(partId: string): boolean {
  return HIDDEN_INTERNAL_PARTS.has(partId);
}

// ─── LLM Photo Analysis ─────────────────────────────────────────────

/**
 * Analyze a single damage photo using LLM vision to detect visible damage.
 */
async function analyzePhotoForDamage(
  photoUrl: string,
): Promise<PhotoAnalysisResult> {
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are a vehicle damage analysis assistant.

Your task is to describe visible damage objectively.

Rules:
- Only describe what is visible
- Do NOT infer cause
- Do NOT speculate about unseen areas
- Use precise mechanical terms where possible

Use these EXACT part naming conventions:
- Front Bumper, Rear Bumper (include sub-parts: cover, reinforcement bar, energy absorber)
- Bonnet (Hood), Boot Lid (Trunk Lid), Tailgate
- Headlight Assembly (Left/Right), Tail Light (Left/Right)
- Front Grille (upper/lower)
- Front Fender (Left/Right) — also called "wing"
- Front Door (Left/Right), Rear Door (Left/Right)
- Side Mirror (Left/Right)
- Quarter Panel (Left/Right)
- Windscreen (Windshield), Rear Windscreen
- Roof Panel, A-Pillar, B-Pillar, C-Pillar
- Sill Panel / Rocker Panel (Left/Right)
- Fog Light (Left/Right), Indicator (Left/Right)
- Bull Bar / Nudge Bar, Canopy (Bakkie)
- Radiator Assembly, Suspension, Wheels & Tyres

For each damaged part, assess severity based on what is visible:
- minor: Scratches, small dents, scuffs
- moderate: Medium dents, cracked plastic, misalignment
- severe: Large deformation, broken components, structural bending
- critical: Complete destruction, detachment, structural failure

Also identify which vehicle zones are visible in the photo:
front, rear, left_side, right_side, roof, windshield, rear_glass, undercarriage

Respond in JSON format ONLY.`,
        },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: photoUrl, detail: "high" },
            },
            {
              type: "text",
              text: "Analyze this vehicle damage photo. List every damaged part you can see with its severity and your confidence level (0-1). Also list which zones of the vehicle are visible in this photo.",
            },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "photo_damage_analysis",
          strict: true,
          schema: {
            type: "object",
            properties: {
              visible_damage: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    part_name: { type: "string", description: "Canonical part name" },
                    damage_description: { type: "string", description: "Brief description of the damage observed" },
                    severity: { type: "string", enum: ["minor", "moderate", "severe", "critical"] },
                    confidence: { type: "number", description: "Confidence 0.0 to 1.0" },
                  },
                  required: ["part_name", "damage_description", "severity", "confidence"],
                  additionalProperties: false,
                },
              },
              overall_description: { type: "string", description: "Overall summary of visible damage" },
              visible_zones: {
                type: "array",
                items: {
                  type: "string",
                  enum: ["front", "rear", "left_side", "right_side", "roof", "windshield", "rear_glass", "undercarriage"],
                },
              },
            },
            required: ["visible_damage", "overall_description", "visible_zones"],
            additionalProperties: false,
          },
        },
      },
    });

    const rawContent = response.choices[0].message.content;
    const contentStr = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
    const parsed = JSON.parse(contentStr || "{}");

    return {
      photoUrl,
      visibleDamage: (parsed.visible_damage || []).map((d: any) => ({
        partName: d.part_name,
        damageDescription: d.damage_description,
        severity: d.severity,
        confidence: d.confidence,
      })),
      overallDescription: parsed.overall_description || "No damage description available",
      visibleZones: parsed.visible_zones || [],
    };
  } catch (error) {
    console.error("Photo analysis failed for", photoUrl, error);
    return {
      photoUrl,
      visibleDamage: [],
      overallDescription: "Photo analysis failed — manual review required",
      visibleZones: [],
    };
  }
}

// ─── Cross-Validation Logic ─────────────────────────────────────────

interface QuotedPart {
  name: string;
  cost?: number;
  action?: string; // repair, replace, refinish
}

/**
 * Run the full cross-validation pipeline.
 * 
 * @param quotedParts — Parts listed in the repair quote(s)
 * @param photoUrls — URLs of damage photos to analyze
 * @param existingPhotoAnalyses — Pre-analyzed photo results (skip re-analysis)
 */
export async function crossValidateQuotesVsPhotos(
  quotedParts: QuotedPart[],
  photoUrls: string[],
  existingPhotoAnalyses?: PhotoAnalysisResult[],
): Promise<CrossValidationReport> {
  // Step 1: Analyze all photos (or use existing analyses)
  let photoAnalyses: PhotoAnalysisResult[];
  if (existingPhotoAnalyses && existingPhotoAnalyses.length > 0) {
    photoAnalyses = existingPhotoAnalyses;
  } else {
    photoAnalyses = await Promise.all(
      photoUrls.map(url => analyzePhotoForDamage(url))
    );
  }

  // Step 2: Aggregate all visible damage across all photos
  const allVisibleDamage = new Map<string, {
    partName: string;
    descriptions: string[];
    maxSeverity: string;
    maxConfidence: number;
    photoUrls: string[];
  }>();

  // Track which zones were photographed (important for determining if absence is meaningful)
  const photographedZones = new Set<VehicleZone>();

  for (const analysis of photoAnalyses) {
    for (const zone of analysis.visibleZones) {
      photographedZones.add(zone);
    }
    for (const damage of analysis.visibleDamage) {
      const normalized = normalizeComponentName(damage.partName);
      const key = normalized.toLowerCase();
      const existing = allVisibleDamage.get(key);
      if (existing) {
        existing.descriptions.push(damage.damageDescription);
        if (severityRank(damage.severity) > severityRank(existing.maxSeverity)) {
          existing.maxSeverity = damage.severity;
        }
        existing.maxConfidence = Math.max(existing.maxConfidence, damage.confidence);
        existing.photoUrls.push(analysis.photoUrl);
      } else {
        allVisibleDamage.set(key, {
          partName: normalized,
          descriptions: [damage.damageDescription],
          maxSeverity: damage.severity,
          maxConfidence: damage.confidence,
          photoUrls: [analysis.photoUrl],
        });
      }
    }
  }

  // Step 3: Resolve all quoted parts
  const resolvedQuoted = quotedParts.map(qp => ({
    ...qp,
    normalized: normalizeComponentName(qp.name),
    resolved: resolveComponent(qp.name),
  }));

  // Step 4: Cross-validate
  const items: CrossValidationItem[] = [];
  const matchedVisibleKeys = new Set<string>();
  const fraudIndicators: string[] = [];
  const recommendations: string[] = [];

  let confirmedCount = 0;
  let quotedNotVisibleCount = 0;
  let visibleNotQuotedCount = 0;
  let legitimateHiddenCount = 0;
  let suspiciousCount = 0;

  // 4a: Check each quoted part against visible damage
  for (const qp of resolvedQuoted) {
    const key = qp.normalized.toLowerCase();
    const visibleMatch = allVisibleDamage.get(key);
    const partId = qp.resolved?.id || "";
    const partIsExternal = isExternallyVisible(partId);
    const partIsHidden = isHiddenInternal(partId);
    const partZone = qp.resolved?.zone || null;
    const zoneWasPhotographed = partZone ? photographedZones.has(partZone) : false;

    if (visibleMatch) {
      // ── CONFIRMED: Quoted AND visible ──
      matchedVisibleKeys.add(key);
      confirmedCount++;
      items.push({
        partName: qp.normalized,
        rawName: qp.name,
        resolvedPart: qp.resolved,
        zone: partZone,
        category: "confirmed",
        isExternallyVisible: partIsExternal,
        riskLevel: "none",
        explanation: `Damage confirmed in photos: ${visibleMatch.descriptions.join("; ")}`,
        confidence: visibleMatch.maxConfidence,
        quotedCost: qp.cost,
        quotedAction: qp.action,
      });
    } else {
      // ── QUOTED BUT NOT VISIBLE ──
      quotedNotVisibleCount++;

      let riskLevel: RiskLevel;
      let explanation: string;

      if (partIsHidden) {
        // Hidden/internal part — legitimate to quote without photo evidence
        riskLevel = "low";
        explanation = `Internal/hidden component — not typically visible in exterior photos. May require physical inspection to verify.`;
        legitimateHiddenCount++;
      } else if (!zoneWasPhotographed) {
        // The zone wasn't even photographed — can't conclude anything
        riskLevel = "low";
        explanation = `The ${partZone || "relevant"} zone was not captured in any submitted photos. Cannot confirm or deny damage. Request additional photos of this area.`;
        recommendations.push(`Request photos of the ${partZone || "relevant"} area to verify ${qp.normalized}`);
      } else if (partIsExternal) {
        // SUSPICIOUS: Externally visible part, zone was photographed, but no damage seen
        riskLevel = "high";
        explanation = `This externally visible part was NOT detected as damaged in any photo, yet the ${partZone} zone was photographed. This is a potential fraud indicator — the part may not actually be damaged.`;
        suspiciousCount++;
        fraudIndicators.push(
          `QUOTED_NOT_VISIBLE: "${qp.normalized}" (${qp.action || "replace"}, $${(qp.cost || 0).toLocaleString()}) is quoted but no damage was detected in photos covering the ${partZone} zone.`
        );
      } else {
        // Partially visible or unknown — moderate concern
        riskLevel = "medium";
        explanation = `This part may have hidden damage not visible in photos. Physical inspection recommended to confirm.`;
      }

      items.push({
        partName: qp.normalized,
        rawName: qp.name,
        resolvedPart: qp.resolved,
        zone: partZone,
        category: "quoted_not_visible",
        isExternallyVisible: partIsExternal,
        riskLevel,
        explanation,
        confidence: 0.5,
        quotedCost: qp.cost,
        quotedAction: qp.action,
      });
    }
  }

  // 4b: Check for visible damage NOT in any quote
  for (const [key, visible] of Array.from(allVisibleDamage.entries())) {
    if (!matchedVisibleKeys.has(key)) {
      visibleNotQuotedCount++;
      const resolved = resolveComponent(visible.partName);
      const partZone = resolved?.zone || null;

      items.push({
        partName: visible.partName,
        rawName: visible.partName,
        resolvedPart: resolved,
        zone: partZone,
        category: "visible_not_quoted",
        isExternallyVisible: resolved ? isExternallyVisible(resolved.id) : true,
        riskLevel: severityRank(visible.maxSeverity) >= 2 ? "medium" : "low",
        explanation: `Damage visible in photos but NOT included in any repair quote: ${visible.descriptions.join("; ")}. This may indicate underquoting or missed damage.`,
        confidence: visible.maxConfidence,
      });

      if (severityRank(visible.maxSeverity) >= 2) {
        fraudIndicators.push(
          `VISIBLE_NOT_QUOTED: "${visible.partName}" shows ${visible.maxSeverity} damage in photos but is not included in any repair quote. Possible underquoting.`
        );
      }
    }
  }

  // Step 5: Calculate overall risk score
  let riskScore = 0;
  const totalParts = resolvedQuoted.length;

  // Suspicious externally visible parts not in photos: +15 points each
  riskScore += suspiciousCount * 15;

  // Visible damage not quoted (moderate+): +8 points each
  riskScore += items.filter(i => i.category === "visible_not_quoted" && severityRank(i.explanation.includes("severe") ? "severe" : "moderate") >= 2).length * 8;

  // High ratio of quoted-not-visible to total: additional penalty
  if (totalParts > 0) {
    const qnvRatio = quotedNotVisibleCount / totalParts;
    if (qnvRatio > 0.5) {
      riskScore += 20;
      fraudIndicators.push(
        `HIGH_UNVERIFIED_RATIO: ${(qnvRatio * 100).toFixed(0)}% of quoted parts could not be verified in photos.`
      );
    }
  }

  // Cap at 100
  riskScore = Math.min(100, riskScore);

  let overallRiskLevel: RiskLevel;
  if (riskScore >= 70) overallRiskLevel = "critical";
  else if (riskScore >= 50) overallRiskLevel = "high";
  else if (riskScore >= 30) overallRiskLevel = "medium";
  else if (riskScore >= 10) overallRiskLevel = "low";
  else overallRiskLevel = "none";

  // Step 6: Generate recommendations
  if (suspiciousCount > 0) {
    recommendations.push(
      `${suspiciousCount} quoted part(s) appear undamaged in photos. Request physical re-inspection or additional close-up photos.`
    );
  }
  if (visibleNotQuotedCount > 0) {
    recommendations.push(
      `${visibleNotQuotedCount} visible damage item(s) are not included in the repair quote. Request updated quotation covering all damage.`
    );
  }
  if (photographedZones.size < 4) {
    recommendations.push(
      `Only ${photographedZones.size} vehicle zone(s) were photographed. Request comprehensive photos covering all sides of the vehicle.`
    );
  }
  if (confirmedCount === 0 && totalParts > 0) {
    recommendations.push(
      `CRITICAL: None of the ${totalParts} quoted parts could be confirmed in photos. This claim requires immediate physical inspection.`
    );
  }

  return {
    timestamp: new Date().toISOString(),
    summary: {
      totalQuotedParts: totalParts,
      totalVisibleDamage: allVisibleDamage.size,
      confirmedCount,
      quotedNotVisibleCount,
      visibleNotQuotedCount,
      legitimateHiddenCount,
      suspiciousCount,
      overallRiskScore: riskScore,
      overallRiskLevel,
    },
    items,
    photoAnalyses,
    fraudIndicators,
    recommendations,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────

function severityRank(severity: string): number {
  switch (severity) {
    case "critical": return 4;
    case "severe": return 3;
    case "moderate": return 2;
    case "minor": return 1;
    default: return 0;
  }
}
