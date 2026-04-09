/**
 * pipeline-v2/stage-6-damage-analysis.ts
 *
 * STAGE 6 — DAMAGE ANALYSIS ENGINE (Self-Healing + Vision)
 *
 * Using vehicle photos and damage descriptions from the ClaimRecord:
 *   - Identify damaged components (from structured data OR LLM vision on photos)
 *   - Create damage zones
 *   - Compute severity scores
 *
 * VISION PATH: When damagePhotoUrls are present in the pipeline context,
 * the LLM is called with the actual damage photos to extract components
 * directly from the images. Vision results are merged with any structured
 * components from the claim record (structured data takes precedence for
 * components already identified; vision adds newly detected components).
 *
 * NEVER halts — if no damage data exists, produces empty analysis with assumptions.
 */

import { ensureDamageContract } from "./engineFallback";
import { invokeLLM } from "../_core/llm";
import type {
  PipelineContext,
  StageResult,
  ClaimRecord,
  Stage6Output,
  DamageAnalysisComponent,
  DamageZone,
  AccidentSeverity,
  Assumption,
  RecoveryAction,
} from "./types";

const MAX_VISION_PHOTOS = 2; // Cap at 2 to keep pipeline latency bounded

function normaliseSeverity(raw: string): AccidentSeverity {
  const s = (raw || "").toLowerCase().trim();
  if (s === "catastrophic") return "catastrophic";
  if (s === "severe" || s === "major") return "severe";
  if (s === "moderate" || s === "medium") return "moderate";
  if (s === "minor" || s === "light" || s === "slight") return "minor";
  if (s === "cosmetic" || s === "superficial") return "cosmetic";
  return "moderate";
}

function inferZone(location: string): string {
  const loc = (location || "").toLowerCase();
  // SA/Audatex ZA nomenclature — bonnet=front, boot lid=rear, sill=side, loadbox=rear, canopy=roof
  if (/front|bumper front|hood|bonnet|headl|grille|radiator|fender front|wing front/.test(loc)) return "front";
  if (/rear|bumper rear|tail|trunk|boot|boot.?lid|loadbox|fender rear|wing rear/.test(loc)) return "rear";
  if (/left|driver|lh|l\/h/.test(loc)) return "left_side";
  if (/right|passenger|rh|r\/h/.test(loc)) return "right_side";
  if (/roof|top|overhead|canopy|roof.?lin/.test(loc)) return "roof";
  if (/sill|rocker/.test(loc)) return "left_side"; // sill panels default to side
  if (/under|bottom|chassis|subframe/.test(loc)) return "undercarriage";
  return "general";
}

function calculateOverallSeverity(components: DamageAnalysisComponent[]): number {
  if (components.length === 0) return 0;

  const severityWeights: Record<AccidentSeverity, number> = {
    none: 0, cosmetic: 10, minor: 25, moderate: 50, severe: 75, catastrophic: 100,
  };

  const total = components.reduce((sum, c) => sum + (severityWeights[c.severity] || 50), 0);
  const avg = total / components.length;
  const countBoost = Math.min(20, components.length * 2);
  return Math.min(100, Math.round(avg + countBoost));
}

/**
 * Use LLM vision to read damage components from actual damage photos.
 * Returns an array of DamageAnalysisComponent extracted from the images.
 * Fails silently — returns empty array on any error.
 */
async function readDamageFromPhotos(
  photoUrls: string[],
  claimRecord: ClaimRecord,
  ctx: PipelineContext,
  assumptions: Assumption[],
  recoveryActions: RecoveryAction[]
): Promise<DamageAnalysisComponent[]> {
  const urls = photoUrls.slice(0, MAX_VISION_PHOTOS);
  if (urls.length === 0) return [];

  ctx.log("Stage 6", `Vision: analysing ${urls.length} damage photo(s) with LLM`);

  const vehicleContext = [
    claimRecord.vehicle.make,
    claimRecord.vehicle.model,
    claimRecord.vehicle.year,
  ].filter(Boolean).join(" ");

  const imageParts = urls.map(url => ({
    type: "image_url" as const,
    image_url: { url, detail: "high" as const },
  }));

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are an expert vehicle damage assessor for insurance claims.
Analyse the provided vehicle damage photo(s) and identify every visibly damaged component.
Use South African / Audatex ZA parts nomenclature (e.g. "Bonnet" not "Hood", "Boot Lid" not "Trunk Lid",
"Windscreen" not "Windshield", "LH/RH" for left/right).
For each component provide: name, location (front/rear/left/right/roof/undercarriage/general),
damageType (impact/deformation/breakage/shatter/scratch/bend/other), and severity.
Return ONLY a JSON object matching the schema — no prose.`,
        },
        {
          role: "user",
          content: [
            {
              type: "text" as const,
              text: `Vehicle: ${vehicleContext || "Unknown vehicle"}.
Collision direction: ${claimRecord.accidentDetails.collisionDirection || "unknown"}.
Analyse the damage visible in the photo(s) and list every damaged component.`,
            },
            ...imageParts,
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "vision_damage_extraction",
          strict: true,
          schema: {
            type: "object",
            properties: {
              components: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    location: { type: "string" },
                    damageType: { type: "string" },
                    severity: {
                      type: "string",
                      enum: ["cosmetic", "minor", "moderate", "severe", "catastrophic"],
                    },
                    visible: { type: "boolean" },
                    notes: { type: "string" },
                  },
                  required: ["name", "location", "damageType", "severity", "visible"],
                  additionalProperties: false,
                },
              },
              overall_severity_assessment: { type: "string" },
              structural_damage_suspected: { type: "boolean" },
              confidence: { type: "string", enum: ["high", "medium", "low"] },
            },
            required: ["components", "overall_severity_assessment", "structural_damage_suspected", "confidence"],
            additionalProperties: false,
          },
        },
      },
    });

    const rawContent = response.choices?.[0]?.message?.content || "{}";
    // content may be a multimodal array when the model echoes back structured data;
    // coerce to string before parsing.
    const content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
    const parsed = JSON.parse(content);
    const rawComponents: Array<{
      name: string; location: string; damageType: string;
      severity: string; visible: boolean; notes?: string;
    }> = parsed.components || [];

    const visionComponents: DamageAnalysisComponent[] = rawComponents.map((c, i) => ({
      name: c.name || "Unknown Component",
      location: c.location || "general",
      damageType: c.damageType || "impact",
      severity: normaliseSeverity(c.severity),
      visible: c.visible !== false,
      distanceFromImpact: i * 0.3,
    }));

    ctx.log("Stage 6", `Vision: extracted ${visionComponents.length} components (confidence: ${parsed.confidence ?? "unknown"})`);

    if (visionComponents.length > 0) {
      assumptions.push({
        field: "damagedParts",
        assumedValue: `${visionComponents.length} vision-extracted components`,
        reason: `LLM vision analysis of ${urls.length} damage photo(s) identified ${visionComponents.length} damaged components. Confidence: ${parsed.confidence ?? "unknown"}.`,
        strategy: "llm_vision",
        confidence: parsed.confidence === "high" ? 85 : parsed.confidence === "medium" ? 65 : 40,
        stage: "Stage 6",
      });
      recoveryActions.push({
        target: "damagedParts",
        strategy: "llm_vision",
        success: true,
        description: `Vision analysis of ${urls.length} photo(s) extracted ${visionComponents.length} damage components.`,
      });
    }

    return visionComponents;
  } catch (err) {
    ctx.log("Stage 6", `Vision analysis failed: ${String(err)} — continuing without vision data`);
    recoveryActions.push({
      target: "vision_damage_extraction",
      strategy: "skip",
      success: false,
      description: `LLM vision damage extraction failed: ${String(err)}. Falling back to structured data.`,
    });
    return [];
  }
}

/**
 * Infer damage components from accident description when no components are available.
 */
function inferDamageFromDescription(
  claimRecord: ClaimRecord,
  assumptions: Assumption[]
): DamageAnalysisComponent[] {
  const desc = (claimRecord.accidentDetails.description || "").toLowerCase();
  const impactPoint = (claimRecord.accidentDetails.impactPoint || "").toLowerCase();
  const direction = claimRecord.accidentDetails.collisionDirection;

  const inferred: DamageAnalysisComponent[] = [];

  // Infer from collision direction — SA/Audatex ZA parts nomenclature throughout
  if (direction === "frontal" || /front/i.test(impactPoint)) {
    // ── FRONTAL IMPACT ────────────────────────────────────────────────────────
    inferred.push(
      { name: "Front Bumper", location: "front", damageType: "impact", severity: "moderate", visible: true, distanceFromImpact: 0 },
      { name: "Bonnet", location: "front", damageType: "deformation", severity: "moderate", visible: true, distanceFromImpact: 0.3 },
      { name: "Grille", location: "front", damageType: "breakage", severity: "moderate", visible: true, distanceFromImpact: 0.1 },
      { name: "LH Headlamp", location: "front", damageType: "breakage", severity: "moderate", visible: true, distanceFromImpact: 0.2 },
      { name: "RH Headlamp", location: "front", damageType: "breakage", severity: "moderate", visible: true, distanceFromImpact: 0.2 },
    );
  } else if (direction === "rear" || /rear|back/i.test(impactPoint)) {
    // ── REAR IMPACT ───────────────────────────────────────────────────────────
    inferred.push(
      { name: "Rear Bumper", location: "rear", damageType: "impact", severity: "moderate", visible: true, distanceFromImpact: 0 },
      { name: "Boot Lid", location: "rear", damageType: "deformation", severity: "moderate", visible: true, distanceFromImpact: 0.3 },
      { name: "LH Tail Lamp", location: "rear", damageType: "breakage", severity: "moderate", visible: true, distanceFromImpact: 0.2 },
      { name: "RH Tail Lamp", location: "rear", damageType: "breakage", severity: "moderate", visible: true, distanceFromImpact: 0.2 },
    );
  } else if (direction === "side_driver" || direction === "side_passenger") {
    // ── SIDESWIPE / SIDE IMPACT — SA/Audatex ZA nomenclature ─────────────────
    // Driver side (LH) = left; Passenger side (RH) = right
    const side = direction === "side_driver" ? "LH" : "RH";
    const sideLabel = direction === "side_driver" ? "left" : "right";
    inferred.push(
      { name: `${side} Front Door`, location: sideLabel, damageType: "impact", severity: "moderate", visible: true, distanceFromImpact: 0 },
      { name: `${side} Rear Door`, location: sideLabel, damageType: "impact", severity: "moderate", visible: true, distanceFromImpact: 0.5 },
      { name: `${side} B-Pillar`, location: sideLabel, damageType: "deformation", severity: "moderate", visible: true, distanceFromImpact: 0.3 },
      { name: `${side} Sill Panel`, location: sideLabel, damageType: "deformation", severity: "minor", visible: true, distanceFromImpact: 0.4 },
      { name: `${side} Front Fender`, location: sideLabel, damageType: "deformation", severity: "minor", visible: true, distanceFromImpact: 0.6 },
      { name: `${side} Rear Quarter Panel`, location: sideLabel, damageType: "deformation", severity: "minor", visible: true, distanceFromImpact: 0.7 },
      { name: `${side} Door Glass`, location: sideLabel, damageType: "shatter", severity: "moderate", visible: true, distanceFromImpact: 0.2 },
      { name: `${side} Door Mirror`, location: sideLabel, damageType: "breakage", severity: "minor", visible: true, distanceFromImpact: 0.1 },
    );
  } else if (direction === "rollover") {
    // ── ROLLOVER — SA/Audatex ZA nomenclature ────────────────────────────────
    // Rollover damage is distributed across roof, pillars, and all sides.
    inferred.push(
      { name: "Roof Panel", location: "roof", damageType: "deformation", severity: "severe", visible: true, distanceFromImpact: 0 },
      { name: "Roof Lining", location: "roof", damageType: "deformation", severity: "moderate", visible: true, distanceFromImpact: 0.1 },
      { name: "LH A-Pillar", location: "left", damageType: "bend", severity: "severe", visible: true, distanceFromImpact: 0.2 },
      { name: "RH A-Pillar", location: "right", damageType: "bend", severity: "severe", visible: true, distanceFromImpact: 0.2 },
      { name: "LH B-Pillar", location: "left", damageType: "bend", severity: "severe", visible: true, distanceFromImpact: 0.3 },
      { name: "RH B-Pillar", location: "right", damageType: "bend", severity: "severe", visible: true, distanceFromImpact: 0.3 },
      { name: "LH Front Door", location: "left", damageType: "deformation", severity: "moderate", visible: true, distanceFromImpact: 0.4 },
      { name: "RH Front Door", location: "right", damageType: "deformation", severity: "moderate", visible: true, distanceFromImpact: 0.4 },
      { name: "Windscreen", location: "front", damageType: "shatter", severity: "severe", visible: true, distanceFromImpact: 0.5 },
      { name: "Rear Windscreen", location: "rear", damageType: "shatter", severity: "moderate", visible: true, distanceFromImpact: 0.5 },
      { name: "LH Sill Panel", location: "left", damageType: "deformation", severity: "moderate", visible: true, distanceFromImpact: 0.6 },
      { name: "RH Sill Panel", location: "right", damageType: "deformation", severity: "moderate", visible: true, distanceFromImpact: 0.6 },
    );
  } else {
    // Generic — assume front impact as most common
    inferred.push(
      { name: "Front Bumper", location: "front", damageType: "impact", severity: "moderate", visible: true, distanceFromImpact: 0 },
    );
  }

  if (inferred.length > 0) {
    assumptions.push({
      field: "damagedParts",
      assumedValue: `${inferred.length} inferred components`,
      reason: `No damage components extracted from documents. Inferred ${inferred.length} likely damaged components from collision direction (${direction}) and impact point.`,
      strategy: "contextual_inference",
      confidence: 35,
      stage: "Stage 6",
    });
  }

  return inferred;
}

/**
 * Merge vision-extracted components with structured components.
 * Structured components take precedence; vision adds newly detected parts
 * not already present in the structured list (deduplication by name).
 */
function mergeComponents(
  structured: DamageAnalysisComponent[],
  vision: DamageAnalysisComponent[]
): DamageAnalysisComponent[] {
  if (vision.length === 0) return structured;
  if (structured.length === 0) return vision;

  const existingNames = new Set(structured.map(c => c.name.toLowerCase().trim()));
  const newFromVision = vision.filter(c => !existingNames.has(c.name.toLowerCase().trim()));

  return [...structured, ...newFromVision];
}

export async function runDamageAnalysisStage(
  ctx: PipelineContext,
  claimRecord: ClaimRecord
): Promise<StageResult<Stage6Output>> {
  const start = Date.now();
  ctx.log("Stage 6", "Damage analysis starting");

  const assumptions: Assumption[] = [];
  const recoveryActions: RecoveryAction[] = [];
  let isDegraded = false;

  try {
    // ── STEP 1: Structured components from claim record ───────────────────────
    let structuredParts: DamageAnalysisComponent[] = [];
    if (claimRecord.damage.components.length > 0) {
      structuredParts = claimRecord.damage.components.map((comp, index) => ({
        name: comp.name || "Unknown Component",
        location: comp.location || "general",
        damageType: comp.damageType || "impact",
        severity: normaliseSeverity(comp.severity),
        visible: true,
        distanceFromImpact: index * 0.3,
      }));
      ctx.log("Stage 6", `Structured: ${structuredParts.length} components from claim record`);
    }

    // ── STEP 2: LLM vision — read damage from photos ─────────────────────────
    const photoUrls = ctx.damagePhotoUrls ?? [];
    let visionParts: DamageAnalysisComponent[] = [];
    if (photoUrls.length > 0) {
      visionParts = await readDamageFromPhotos(photoUrls, claimRecord, ctx, assumptions, recoveryActions);
    }

    // ── STEP 3: Determine final component list ────────────────────────────────
    let damagedParts: DamageAnalysisComponent[];

    if (structuredParts.length > 0 || visionParts.length > 0) {
      // Merge: structured takes precedence, vision adds newly detected parts
      damagedParts = mergeComponents(structuredParts, visionParts);
      if (visionParts.length > 0 && structuredParts.length > 0) {
        ctx.log("Stage 6", `Merged: ${structuredParts.length} structured + ${visionParts.length} vision = ${damagedParts.length} total components`);
      }
    } else {
      // Self-healing: no components at all — infer from description/direction
      isDegraded = true;
      ctx.log("Stage 6", "DEGRADED: No damage components available — inferring from accident details");
      damagedParts = inferDamageFromDescription(claimRecord, assumptions);
      recoveryActions.push({
        target: "damagedParts",
        strategy: "contextual_inference",
        success: damagedParts.length > 0,
        description: `No damage components in extraction or vision. Inferred ${damagedParts.length} components from collision direction and impact point.`,
      });
    }

    // ── STEP 4: Group into damage zones ──────────────────────────────────────
    const zoneMap = new Map<string, { components: DamageAnalysisComponent[] }>();
    for (const part of damagedParts) {
      const zone = inferZone(part.location);
      if (!zoneMap.has(zone)) {
        zoneMap.set(zone, { components: [] });
      }
      zoneMap.get(zone)!.components.push(part);
    }

    const damageZones: DamageZone[] = Array.from(zoneMap.entries()).map(([zone, data]) => {
      const severityOrder: AccidentSeverity[] = ["none", "cosmetic", "minor", "moderate", "severe", "catastrophic"];
      const maxSev = data.components.reduce((max, c) => {
        const maxIdx = severityOrder.indexOf(max);
        const curIdx = severityOrder.indexOf(c.severity);
        return curIdx > maxIdx ? c.severity : max;
      }, "none" as AccidentSeverity);

      return { zone, componentCount: data.components.length, maxSeverity: maxSev };
    });

    const overallSeverityScore = calculateOverallSeverity(damagedParts);
    const structuralDamageDetected = claimRecord.accidentDetails.structuralDamage ||
      damagedParts.some(p => /frame|chassis|subframe|pillar|rail|structural|unibody/.test((p.name || "").toLowerCase()));

    // Stage 26: apply defensive contract — ensure at least 1 zone or explicit sentinel
    const rawOutput: Stage6Output = {
      damagedParts,
      damageZones,
      overallSeverityScore,
      structuralDamageDetected,
      totalDamageArea: claimRecord.accidentDetails.totalDamageAreaM2 || 0,
    };
    const output = ensureDamageContract(rawOutput, isDegraded ? "inferred_components" : "success");

    const visionNote = visionParts.length > 0 ? `, vision: ${visionParts.length} photo-detected` : "";
    ctx.log("Stage 6", `Damage analysis complete. ${damagedParts.length} parts${visionNote}, ${damageZones.length} zones, severity: ${overallSeverityScore}/100, structural: ${structuralDamageDetected}`);

    return {
      status: isDegraded ? "degraded" : "success",
      data: output,
      durationMs: Date.now() - start,
      savedToDb: false,
      assumptions,
      recoveryActions,
      degraded: isDegraded,
    };
  } catch (err) {
    ctx.log("Stage 6", `Damage analysis failed: ${String(err)} — producing fallback analysis`);

    // Stage 26: apply defensive contract — NEVER return empty damageZones
    // Rule: at least 1 zone OR explicit "no visible damage detected" sentinel
    const fallbackOutput = ensureDamageContract({}, `engine_failure: ${String(err)}`);

    return {
      status: "degraded",
      data: fallbackOutput,
      error: String(err),
      durationMs: Date.now() - start,
      savedToDb: false,
      assumptions: [{
        field: "damageAnalysis",
        assumedValue: "fallback_sentinel_zone",
        reason: `Damage analysis failed: ${String(err)}. Producing fallback output with sentinel zone — further review required.`,
        strategy: "default_value",
        confidence: 5,
        stage: "Stage 6",
      }],
      recoveryActions: [{
        target: "damage_analysis_error",
        strategy: "default_value",
        success: true,
        description: `Damage analysis error caught. Fallback output produced with sentinel zone to ensure UI renderability.`,
      }],
      degraded: true,
    };
  }
}
