/**
 * confidence-scoring.ts
 *
 * Standardised AI confidence scoring engine for KINGA AI.
 *
 * Confidence is derived from 8 weighted inputs:
 *   1. Image Quality            22%
 *   2. Damage Detection         18%
 *   3. Physics Consistency      18%
 *   4. Quote Reconciliation     14%
 *   5. Vehicle Data Completeness 12%
 *   6. Document Completeness     8%
 *   7. Data Consistency          5%
 *   8. Fraud Signal Clarity      3%
 *
 * Adaptive weighting: when an input is unavailable (e.g. no quote uploaded),
 * its weight is redistributed proportionally to the remaining inputs.
 *
 * Hard penalty gates cap the final score regardless of the weighted total.
 *
 * Each input produces an ImprovementComment[] describing what is missing and
 * what the adjuster can do to improve the score.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type ConfidenceLevel = "very_high" | "high" | "moderate" | "low" | "very_low";

export interface ImprovementComment {
  /** Short label shown in the UI */
  field: string;
  /** Plain-language description of what is missing */
  issue: string;
  /** Actionable instruction for the adjuster */
  action: string;
  /** Estimated score gain if this item is resolved (0–100 scale pts) */
  potentialGain: number;
  /** Severity of the gap */
  severity: "critical" | "high" | "medium" | "low";
}

export interface ActivePenalty {
  /** Short label for the penalty */
  label: string;
  /** What triggered the penalty */
  reason: string;
  /** The cap applied (0–100) */
  cap: number;
}

export interface ConfidenceInputScore {
  /** Input name */
  name: string;
  /** Human-readable label */
  label: string;
  /** Raw score for this input (0–100) */
  score: number;
  /** Maximum possible score (100 if available, 0 if N/A) */
  maxScore: number;
  /** Whether this input was available (false = weight redistributed) */
  available: boolean;
  /** Weight applied (after redistribution) */
  weight: number;
  /** Contribution to the final score (score × weight) */
  contribution: number;
  /** Improvement comments for this input */
  improvements: ImprovementComment[];
}

export interface ConfidenceScoreBreakdown {
  /** Final confidence score (0–100) */
  finalScore: number;
  /** Confidence level label */
  level: ConfidenceLevel;
  /** Pre-penalty weighted score */
  rawWeightedScore: number;
  /** Per-input scores */
  inputs: Record<string, ConfidenceInputScore>;
  /** Active hard penalty gates */
  activePenalties: ActivePenalty[];
  /** All improvement comments sorted by potentialGain desc */
  allImprovements: ImprovementComment[];
  /** Total potential score gain if all improvements are addressed */
  totalPotentialGain: number;
  /** Summary sentence for the UI */
  summary: string;
}

// ─── Input shape ──────────────────────────────────────────────────────────────

export interface ConfidenceScoringInput {
  // Image quality signals
  image: {
    qualityScore: number;           // 0–100 from LLM
    scaleCalibrationConfidence: number; // 0–100
    photoAnglesCount: number;       // number of distinct angles
    referenceObjectsCount: number;  // number of reference objects detected
    recommendResubmission: boolean;
    crushDepthConfidence: number;   // 0–100
  };

  // Damage detection signals
  damage: {
    damagedComponentsCount: number;
    crushDepthConfidence: number;   // 0–100
    severitySpread: number;         // 0–100: how well distributed severity labels are
    hasStructuralDamage: boolean;
    missingDataFlagsCount: number;  // from LLM missingDataFlags array
  };

  // Physics consistency signals
  physics: {
    consistencyScore: number;       // 0–100 from physics engine
    deviationScore: number;         // 0–100: higher = more deviation (bad)
    speedEstimateConfidence: number; // 0–100
    massSource: "explicit" | "inferred_model" | "inferred_class" | "not_available";
    available: boolean;             // false if physics engine was skipped
  };

  // Quote reconciliation signals
  quote: {
    totalComponents: number;
    matchedCount: number;
    extraInQuoteCount: number;      // quoted but not detected
    missingFromQuoteCount: number;  // detected but not quoted
    costDeviationPct: number;       // abs % difference between AI estimate and quoted total
    available: boolean;             // false if no quote was uploaded
  };

  // Vehicle data completeness signals
  vehicle: {
    vinPresent: boolean;
    vinValidFormat: boolean;
    registrationPresent: boolean;
    engineNumberPresent: boolean;
    yearPresent: boolean;
    colourPresent: boolean;
    makePresent: boolean;
    modelPresent: boolean;
    massKg: number | null;          // null = not provided
    massSource: "explicit" | "inferred_model" | "inferred_class" | "not_available";
  };

  // Document completeness signals
  document: {
    ownerNamePresent: boolean;
    incidentDatePresent: boolean;
    repairerNamePresent: boolean;
    incidentDescriptionPresent: boolean;
    incidentLocationPresent: boolean;
    thirdPartyDetailsPresent: boolean;
    policeReportPresent: boolean;
  };

  // Data consistency signals
  consistency: {
    makeModelMatchesClaim: boolean;   // LLM extraction matches claim record
    incidentDatePlausible: boolean;   // date is not in the future, not > 5 years ago
    vinFormatValid: boolean;
    registrationFormatValid: boolean;
  };

  // Fraud signal clarity
  fraud: {
    fraudScore: number;             // 0–100 from fraud engine
    fraudLevel: string;             // "minimal" | "low" | "moderate" | "high" | "very_high"
    indicatorCount: number;         // number of triggered indicators
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BASE_WEIGHTS: Record<string, number> = {
  image:       0.22,
  damage:      0.18,
  physics:     0.18,
  quote:       0.14,
  vehicle:     0.12,
  document:    0.08,
  consistency: 0.05,
  fraud:       0.03,
};

// ─── Individual input scorers ─────────────────────────────────────────────────

function scoreImage(img: ConfidenceScoringInput["image"]): { score: number; improvements: ImprovementComment[] } {
  const improvements: ImprovementComment[] = [];

  // Quality score: 0–100 from LLM (40% of input)
  const qualityContrib = (img.qualityScore || 0) * 0.40;

  // Scale calibration: 0–100 (20%)
  const scaleContrib = (img.scaleCalibrationConfidence || 0) * 0.20;

  // Photo angles: 3+ = full credit, 2 = 70%, 1 = 40%, 0 = 10% (20%)
  const angleScore = img.photoAnglesCount >= 4 ? 100
    : img.photoAnglesCount === 3 ? 85
    : img.photoAnglesCount === 2 ? 65
    : img.photoAnglesCount === 1 ? 40
    : 10;
  const angleContrib = angleScore * 0.20;

  // Reference objects: 2+ = full, 1 = 60%, 0 = 20% (10%)
  const refScore = img.referenceObjectsCount >= 2 ? 100
    : img.referenceObjectsCount === 1 ? 60
    : 20;
  const refContrib = refScore * 0.10;

  // Crush depth confidence (10%)
  const crushContrib = (img.crushDepthConfidence || 0) * 0.10;

  const score = Math.round(qualityContrib + scaleContrib + angleContrib + refContrib + crushContrib);

  // Improvement comments
  if (img.recommendResubmission) {
    improvements.push({
      field: "Photo Quality",
      issue: "AI recommends photo resubmission — current images are insufficient for accurate analysis.",
      action: "Upload higher-resolution photos from at least 3 angles (front, side, rear) with a reference object (e.g. ruler or coin) visible.",
      potentialGain: 18,
      severity: "critical",
    });
  } else if (img.qualityScore < 60) {
    improvements.push({
      field: "Photo Quality",
      issue: `Image quality score is ${img.qualityScore}/100 — low quality reduces damage detection accuracy.`,
      action: "Upload clearer photos in good lighting. Avoid blurry or heavily compressed images.",
      potentialGain: Math.round((80 - img.qualityScore) * 0.40 * 0.22),
      severity: "high",
    });
  }

  if (img.photoAnglesCount < 3) {
    improvements.push({
      field: "Photo Angles",
      issue: `Only ${img.photoAnglesCount} distinct photo angle(s) detected. More angles improve damage mapping accuracy.`,
      action: "Upload photos from at least 4 angles: front, rear, driver side, and passenger side. Include close-ups of damaged areas.",
      potentialGain: Math.round((100 - angleScore) * 0.20 * 0.22),
      severity: img.photoAnglesCount === 0 ? "critical" : "high",
    });
  }

  if (img.referenceObjectsCount === 0) {
    improvements.push({
      field: "Scale Reference",
      issue: "No reference objects detected in photos. Scale calibration is unavailable, reducing crush depth accuracy.",
      action: "Place a ruler, coin, or standard object next to the damaged area in at least one photo.",
      potentialGain: Math.round(80 * 0.10 * 0.22),
      severity: "medium",
    });
  }

  if (img.scaleCalibrationConfidence < 50) {
    improvements.push({
      field: "Scale Calibration",
      issue: `Scale calibration confidence is ${img.scaleCalibrationConfidence}/100. Crush depth measurements may be inaccurate.`,
      action: "Include a photo with a clearly visible reference object (ruler, coin, or hand) next to the damage.",
      potentialGain: Math.round((80 - img.scaleCalibrationConfidence) * 0.20 * 0.22),
      severity: "medium",
    });
  }

  return { score: Math.min(100, Math.max(0, score)), improvements };
}

function scoreDamage(dmg: ConfidenceScoringInput["damage"]): { score: number; improvements: ImprovementComment[] } {
  const improvements: ImprovementComment[] = [];

  // Crush depth confidence (30%)
  const crushContrib = (dmg.crushDepthConfidence || 0) * 0.30;

  // Component count: 5+ = 100, 3–4 = 75, 1–2 = 50, 0 = 0 (25%)
  const compScore = dmg.damagedComponentsCount >= 5 ? 100
    : dmg.damagedComponentsCount >= 3 ? 75
    : dmg.damagedComponentsCount >= 1 ? 50
    : 0;
  const compContrib = compScore * 0.25;

  // Severity spread (20%): 0–100 from caller
  const spreadContrib = (dmg.severitySpread || 0) * 0.20;

  // Structural damage flag (15%): structural damage = more complete analysis
  const structuralContrib = dmg.hasStructuralDamage ? 100 * 0.15 : 60 * 0.15;

  // Missing data flags penalty (10%): each flag reduces score
  const missingPenalty = Math.min(100, dmg.missingDataFlagsCount * 20);
  const missingContrib = Math.max(0, 100 - missingPenalty) * 0.10;

  const score = Math.round(crushContrib + compContrib + spreadContrib + structuralContrib + missingContrib);

  if (dmg.damagedComponentsCount === 0) {
    improvements.push({
      field: "Damaged Components",
      issue: "No damaged components were detected. The AI could not identify specific damage areas.",
      action: "Upload clearer close-up photos of each damaged area. Ensure damage is visible and not obscured.",
      potentialGain: Math.round(50 * 0.25 * 0.18),
      severity: "critical",
    });
  }

  if (dmg.missingDataFlagsCount >= 2) {
    improvements.push({
      field: "Missing Data Flags",
      issue: `${dmg.missingDataFlagsCount} data gaps flagged by the AI (e.g. missing impact point, unclear accident type).`,
      action: "Review the AI Intelligence Summary for flagged items and provide the missing information via the claim form or additional uploads.",
      potentialGain: Math.round(missingPenalty * 0.10 * 0.18),
      severity: dmg.missingDataFlagsCount >= 3 ? "high" : "medium",
    });
  }

  if (dmg.crushDepthConfidence < 50) {
    improvements.push({
      field: "Crush Depth Measurement",
      issue: `Crush depth confidence is ${dmg.crushDepthConfidence}/100. Physics force calculations will be less accurate.`,
      action: "Upload a close-up photo of the deepest damage point with a ruler or reference object for scale.",
      potentialGain: Math.round((80 - dmg.crushDepthConfidence) * 0.30 * 0.18),
      severity: "high",
    });
  }

  return { score: Math.min(100, Math.max(0, score)), improvements };
}

function scorePhysics(phys: ConfidenceScoringInput["physics"]): { score: number; improvements: ImprovementComment[]; available: boolean } {
  if (!phys.available) {
    return {
      score: 0,
      available: false,
      improvements: [{
        field: "Physics Analysis",
        issue: "Physics analysis was not completed for this claim.",
        action: "Re-run the AI assessment to trigger the physics engine.",
        potentialGain: 18,
        severity: "high",
      }],
    };
  }

  const improvements: ImprovementComment[] = [];

  // Consistency score (40%)
  const consistencyContrib = (phys.consistencyScore || 50) * 0.40;

  // Deviation score: inverted (lower deviation = higher confidence) (30%)
  const deviationScore = Math.max(0, 100 - (phys.deviationScore || 0));
  const deviationContrib = deviationScore * 0.30;

  // Speed estimate confidence (20%)
  const speedContrib = (phys.speedEstimateConfidence || 50) * 0.20;

  // Mass source (10%): explicit = full, inferred_model = 80%, inferred_class = 55%, not_available = 20%
  const massScore = phys.massSource === "explicit" ? 100
    : phys.massSource === "inferred_model" ? 80
    : phys.massSource === "inferred_class" ? 55
    : 20;
  const massContrib = massScore * 0.10;

  const score = Math.round(consistencyContrib + deviationContrib + speedContrib + massContrib);

  if (phys.massSource === "not_available") {
    improvements.push({
      field: "Vehicle Mass",
      issue: "Vehicle mass could not be inferred — make and model are missing or unrecognised. Physics calculations (F=Δp/Δt, E=½mv²) are unreliable.",
      action: "Provide the vehicle make, model, and year in the claim form. This enables mass inference and improves physics accuracy by up to 12 pts.",
      potentialGain: Math.round(80 * 0.10 * 0.18),
      severity: "critical",
    });
  } else if (phys.massSource === "inferred_class") {
    improvements.push({
      field: "Vehicle Mass",
      issue: "Vehicle mass was inferred from vehicle class only (make/model not recognised). Physics accuracy is reduced.",
      action: "Confirm the exact vehicle make and model in the claim form to enable precise mass lookup.",
      potentialGain: Math.round(45 * 0.10 * 0.18),
      severity: "medium",
    });
  } else if (phys.massSource === "inferred_model") {
    improvements.push({
      field: "Vehicle Mass",
      issue: "Vehicle mass was inferred from make/model (not provided explicitly). Providing the actual kerb weight improves physics precision.",
      action: "Add the vehicle's kerb weight (kg) to the claim form or upload the vehicle registration document.",
      potentialGain: Math.round(20 * 0.10 * 0.18),
      severity: "low",
    });
  }

  if (phys.deviationScore > 50) {
    improvements.push({
      field: "Physics Deviation",
      issue: `Physics deviation score is ${phys.deviationScore}/100 — damage pattern is inconsistent with the reported impact. This reduces confidence.`,
      action: "Review the Physics Validation section for specific inconsistencies. Provide additional photos or a police report to clarify the impact scenario.",
      potentialGain: Math.round((phys.deviationScore - 20) * 0.30 * 0.18),
      severity: phys.deviationScore > 70 ? "high" : "medium",
    });
  }

  return { score: Math.min(100, Math.max(0, score)), improvements, available: true };
}

function scoreQuote(q: ConfidenceScoringInput["quote"]): { score: number; improvements: ImprovementComment[]; available: boolean } {
  if (!q.available || q.totalComponents === 0) {
    return {
      score: 0,
      available: false,
      improvements: [{
        field: "Repair Quote",
        issue: "No repair quote was uploaded. Quote reconciliation cannot be performed.",
        action: "Upload the panel beater's repair quote (PDF or image) to enable quote reconciliation and improve confidence by up to 14 pts.",
        potentialGain: 14,
        severity: "high",
      }],
    };
  }

  const improvements: ImprovementComment[] = [];

  // Match ratio (40%): matched / total
  const matchRatio = q.totalComponents > 0 ? q.matchedCount / q.totalComponents : 0;
  const matchContrib = matchRatio * 100 * 0.40;

  // Extra in quote penalty (25%): each extra item reduces score
  const extraPenalty = Math.min(100, q.extraInQuoteCount * 15);
  const extraContrib = Math.max(0, 100 - extraPenalty) * 0.25;

  // Missing from quote (15%): detected but not quoted — reduces reconciliation accuracy
  const missingPenalty = Math.min(100, q.missingFromQuoteCount * 10);
  const missingContrib = Math.max(0, 100 - missingPenalty) * 0.15;

  // Cost deviation (20%): 0% = 100, 10% = 85, 25% = 65, 50% = 40, 100%+ = 10
  const costScore = q.costDeviationPct <= 5 ? 100
    : q.costDeviationPct <= 15 ? 85
    : q.costDeviationPct <= 30 ? 65
    : q.costDeviationPct <= 60 ? 40
    : 10;
  const costContrib = costScore * 0.20;

  const score = Math.round(matchContrib + extraContrib + missingContrib + costContrib);

  if (q.extraInQuoteCount > 0) {
    improvements.push({
      field: "Extra Items in Quote",
      issue: `${q.extraInQuoteCount} item(s) in the quote were not detected in the damage analysis. This may indicate quote inflation.`,
      action: "Request the panel beater to justify each undetected item with supporting photos or a supplementary report.",
      potentialGain: Math.round(extraPenalty * 0.25 * 0.14),
      severity: q.extraInQuoteCount >= 3 ? "high" : "medium",
    });
  }

  if (q.missingFromQuoteCount > 0) {
    improvements.push({
      field: "Unquoted Detected Damage",
      issue: `${q.missingFromQuoteCount} detected component(s) are missing from the repair quote.`,
      action: "Request a revised quote that includes all detected damaged components, or confirm these items are not being claimed.",
      potentialGain: Math.round(missingPenalty * 0.15 * 0.14),
      severity: "medium",
    });
  }

  if (q.costDeviationPct > 25) {
    improvements.push({
      field: "Cost Deviation",
      issue: `Quoted cost deviates ${q.costDeviationPct.toFixed(0)}% from the AI estimate. This reduces reconciliation confidence.`,
      action: "Request the panel beater to provide itemised labour and parts costs. Compare against market rates for each component.",
      potentialGain: Math.round((costScore < 65 ? 65 - costScore : 0) * 0.20 * 0.14),
      severity: q.costDeviationPct > 50 ? "high" : "medium",
    });
  }

  return { score: Math.min(100, Math.max(0, score)), improvements, available: true };
}

function scoreVehicle(v: ConfidenceScoringInput["vehicle"]): { score: number; improvements: ImprovementComment[] } {
  const improvements: ImprovementComment[] = [];

  // VIN: present + valid = 2.5 pts, present + invalid = 1.0 pt, absent = 0 (out of 12 max → normalise to 100)
  const vinScore = v.vinPresent && v.vinValidFormat ? 100
    : v.vinPresent ? 40
    : 0;
  const vinContrib = vinScore * 0.21; // 21% of input

  // Registration (17%)
  const regContrib = v.registrationPresent ? 100 * 0.17 : 0;

  // Engine number (13%)
  const engContrib = v.engineNumberPresent ? 100 * 0.13 : 0;

  // Year (13%)
  const yearContrib = v.yearPresent ? 100 * 0.13 : 0;

  // Colour (4%)
  const colourContrib = v.colourPresent ? 100 * 0.04 : 0;

  // Make + model (16%)
  const makeModelScore = v.makePresent && v.modelPresent ? 100
    : v.makePresent ? 50
    : 0;
  const makeModelContrib = makeModelScore * 0.16;

  // Vehicle mass (16%)
  const massScore = v.massSource === "explicit" ? 100
    : v.massSource === "inferred_model" ? 70
    : v.massSource === "inferred_class" ? 45
    : 0;
  const massContrib = massScore * 0.16;

  const score = Math.round(vinContrib + regContrib + engContrib + yearContrib + colourContrib + makeModelContrib + massContrib);

  // Improvement comments
  if (!v.vinPresent) {
    improvements.push({
      field: "VIN",
      issue: "Vehicle Identification Number (VIN) is not recorded on this claim.",
      action: "Add the 17-character VIN from the vehicle registration document or dashboard plate. This is required for accurate vehicle identification.",
      potentialGain: Math.round(100 * 0.21 * 0.12),
      severity: "critical",
    });
  } else if (!v.vinValidFormat) {
    improvements.push({
      field: "VIN Format",
      issue: "The VIN recorded does not match the standard 17-character format.",
      action: "Verify and correct the VIN from the vehicle registration document. Ensure no spaces or special characters are included.",
      potentialGain: Math.round(60 * 0.21 * 0.12),
      severity: "high",
    });
  }

  if (!v.registrationPresent) {
    improvements.push({
      field: "Registration Number",
      issue: "Vehicle registration number is not recorded.",
      action: "Add the registration number from the licence plate or registration document.",
      potentialGain: Math.round(100 * 0.17 * 0.12),
      severity: "high",
    });
  }

  if (!v.engineNumberPresent) {
    improvements.push({
      field: "Engine Number",
      issue: "Engine number is not recorded. This is required for vehicle identity verification.",
      action: "Upload the vehicle registration document or provide the engine number from the engine bay plate.",
      potentialGain: Math.round(100 * 0.13 * 0.12),
      severity: "medium",
    });
  }

  if (!v.yearPresent) {
    improvements.push({
      field: "Vehicle Year",
      issue: "Vehicle year is not recorded. Year affects mass inference and repair cost estimates.",
      action: "Add the vehicle year of manufacture to the claim form.",
      potentialGain: Math.round(100 * 0.13 * 0.12),
      severity: "medium",
    });
  }

  if (!v.makePresent || !v.modelPresent) {
    improvements.push({
      field: "Make & Model",
      issue: !v.makePresent
        ? "Vehicle make is not recorded. Mass inference and physics calculations require at minimum the make."
        : "Vehicle model is not recorded. Providing the model enables precise mass lookup (Tier 1/2) instead of class-based inference (Tier 4).",
      action: "Add the vehicle make and model to the claim form (e.g. 'Toyota Hilux', 'Honda Fit').",
      potentialGain: Math.round((100 - makeModelScore) * 0.16 * 0.12),
      severity: !v.makePresent ? "critical" : "high",
    });
  }

  if (v.massSource === "not_available") {
    improvements.push({
      field: "Vehicle Mass",
      issue: "Vehicle mass could not be inferred — make and model are missing or unrecognised. Physics force and energy calculations are unreliable without mass.",
      action: "Provide the vehicle make, model, and year. If the vehicle is unusual or modified, add the kerb weight (kg) directly to the claim form.",
      potentialGain: Math.round(100 * 0.16 * 0.12),
      severity: "critical",
    });
  } else if (v.massSource === "inferred_class") {
    improvements.push({
      field: "Vehicle Mass (Inferred)",
      issue: "Vehicle mass was estimated from vehicle class only. Providing the exact make and model improves physics accuracy.",
      action: "Confirm the vehicle make and model in the claim form for a more precise mass lookup.",
      potentialGain: Math.round(55 * 0.16 * 0.12),
      severity: "medium",
    });
  } else if (v.massSource === "inferred_model") {
    improvements.push({
      field: "Vehicle Mass (Inferred)",
      issue: "Vehicle mass was inferred from make/model. For modified or unusual vehicles, the actual kerb weight may differ.",
      action: "If the vehicle is modified or non-standard, add the actual kerb weight (kg) to the claim form.",
      potentialGain: Math.round(30 * 0.16 * 0.12),
      severity: "low",
    });
  }

  return { score: Math.min(100, Math.max(0, score)), improvements };
}

function scoreDocument(doc: ConfidenceScoringInput["document"]): { score: number; improvements: ImprovementComment[] } {
  const improvements: ImprovementComment[] = [];

  // Each field contributes equally (7 fields = ~14.3% each)
  const fields: Array<{ key: keyof typeof doc; label: string; action: string; severity: ImprovementComment["severity"] }> = [
    { key: "ownerNamePresent",          label: "Owner Name",           action: "Add the vehicle owner's full name to the claim form.",                                                                severity: "high" },
    { key: "incidentDatePresent",       label: "Incident Date",        action: "Add the date of the accident to the claim form.",                                                                      severity: "high" },
    { key: "repairerNamePresent",       label: "Repairer Name",        action: "Add the panel beater's name and company to the claim form or ensure it is visible on the uploaded quote.",            severity: "medium" },
    { key: "incidentDescriptionPresent",label: "Incident Description", action: "Add a description of how the accident occurred. This is used to validate the physics analysis.",                      severity: "high" },
    { key: "incidentLocationPresent",   label: "Incident Location",    action: "Add the location where the accident occurred (road name, suburb, or GPS coordinates).",                               severity: "medium" },
    { key: "thirdPartyDetailsPresent",  label: "Third Party Details",  action: "If a third party was involved, add their name, vehicle registration, and insurer details.",                           severity: "low" },
    { key: "policeReportPresent",       label: "Police Report",        action: "Upload the police accident report (case number or full report). This significantly improves claim credibility.",      severity: "medium" },
  ];

  let presentCount = 0;
  for (const f of fields) {
    if (doc[f.key]) {
      presentCount++;
    } else {
      const gain = Math.round((100 / fields.length) * 0.08);
      improvements.push({
        field: f.label,
        issue: `${f.label} is not recorded on this claim.`,
        action: f.action,
        potentialGain: gain,
        severity: f.severity,
      });
    }
  }

  const score = Math.round((presentCount / fields.length) * 100);
  return { score: Math.min(100, Math.max(0, score)), improvements };
}

function scoreConsistency(con: ConfidenceScoringInput["consistency"]): { score: number; improvements: ImprovementComment[] } {
  const improvements: ImprovementComment[] = [];

  const makeModelScore = con.makeModelMatchesClaim ? 100 : 40;
  const dateScore = con.incidentDatePlausible ? 100 : 20;
  const vinScore = con.vinFormatValid ? 100 : 50;
  const regScore = con.registrationFormatValid ? 100 : 60;

  const score = Math.round(
    makeModelScore * 0.35 +
    dateScore * 0.30 +
    vinScore * 0.20 +
    regScore * 0.15
  );

  if (!con.makeModelMatchesClaim) {
    improvements.push({
      field: "Make/Model Mismatch",
      issue: "The vehicle make/model extracted from the uploaded document does not match the claim record.",
      action: "Verify the vehicle make and model in the claim form matches the uploaded documents. Update the claim form if there is an error.",
      potentialGain: Math.round(60 * 0.35 * 0.05),
      severity: "high",
    });
  }

  if (!con.incidentDatePlausible) {
    improvements.push({
      field: "Incident Date",
      issue: "The incident date is implausible (future date or more than 5 years ago).",
      action: "Verify and correct the incident date in the claim form.",
      potentialGain: Math.round(80 * 0.30 * 0.05),
      severity: "high",
    });
  }

  if (!con.vinFormatValid) {
    improvements.push({
      field: "VIN Consistency",
      issue: "VIN format is invalid or inconsistent with the vehicle year/make.",
      action: "Re-enter the VIN from the vehicle registration document. Ensure it is exactly 17 characters.",
      potentialGain: Math.round(50 * 0.20 * 0.05),
      severity: "medium",
    });
  }

  return { score: Math.min(100, Math.max(0, score)), improvements };
}

function scoreFraud(fraud: ConfidenceScoringInput["fraud"]): { score: number; improvements: ImprovementComment[] } {
  const improvements: ImprovementComment[] = [];

  // Low fraud score = high clarity (confidence in legitimacy)
  // High fraud score = uncertainty (reduces confidence)
  const clarityScore = Math.max(0, 100 - fraud.fraudScore);

  // Multiple triggered indicators reduce clarity further
  const indicatorPenalty = Math.min(30, fraud.indicatorCount * 5);
  const score = Math.round(Math.max(0, clarityScore - indicatorPenalty));

  if (fraud.fraudScore > 50) {
    improvements.push({
      field: "Fraud Indicators",
      issue: `Fraud score is ${fraud.fraudScore}/100 with ${fraud.indicatorCount} indicator(s) triggered. High fraud risk reduces AI confidence in the assessment.`,
      action: "Review the Fraud Analysis section and address each triggered indicator. Providing additional documentation (police report, photos, invoices) can reduce the fraud score.",
      potentialGain: Math.round(Math.min(3, fraud.fraudScore * 0.03)),
      severity: fraud.fraudScore > 70 ? "high" : "medium",
    });
  }

  return { score: Math.min(100, Math.max(0, score)), improvements };
}

// ─── Hard penalty gates ───────────────────────────────────────────────────────

function applyPenaltyGates(
  rawScore: number,
  input: ConfidenceScoringInput
): { finalScore: number; activePenalties: ActivePenalty[] } {
  const penalties: ActivePenalty[] = [];
  let cap = 100;

  if (input.image.recommendResubmission) {
    cap = Math.min(cap, 65);
    penalties.push({
      label: "Photo Resubmission Required",
      reason: "AI flagged current photos as insufficient for accurate analysis.",
      cap: 65,
    });
  }

  if (input.image.qualityScore < 40) {
    cap = Math.min(cap, 55);
    penalties.push({
      label: "Very Low Image Quality",
      reason: `Image quality score is ${input.image.qualityScore}/100.`,
      cap: 55,
    });
  }

  if (input.damage.missingDataFlagsCount >= 3) {
    cap = Math.min(cap, 70);
    penalties.push({
      label: "Multiple Data Gaps",
      reason: `${input.damage.missingDataFlagsCount} data gaps flagged by the AI.`,
      cap: 70,
    });
  }

  if (input.physics.available && input.physics.deviationScore > 70) {
    cap = Math.min(cap, 75);
    penalties.push({
      label: "High Physics Deviation",
      reason: `Physics deviation score is ${input.physics.deviationScore}/100 — damage pattern is inconsistent with reported impact.`,
      cap: 75,
    });
  }

  if (input.fraud.fraudScore > 70) {
    cap = Math.min(cap, 80);
    penalties.push({
      label: "High Fraud Risk",
      reason: `Fraud score is ${input.fraud.fraudScore}/100.`,
      cap: 80,
    });
  }

  if (input.vehicle.massSource === "not_available" && input.physics.available) {
    // Physics sub-score is already penalised; apply a soft cap on overall
    cap = Math.min(cap, 78);
    penalties.push({
      label: "Vehicle Mass Unknown",
      reason: "Vehicle mass could not be inferred — physics force/energy calculations are unreliable.",
      cap: 78,
    });
  }

  const finalScore = Math.min(rawScore, cap);
  return { finalScore, activePenalties: penalties };
}

// ─── Level classification ─────────────────────────────────────────────────────

function classifyLevel(score: number): ConfidenceLevel {
  if (score >= 85) return "very_high";
  if (score >= 70) return "high";
  if (score >= 55) return "moderate";
  if (score >= 40) return "low";
  return "very_low";
}

function levelLabel(level: ConfidenceLevel): string {
  switch (level) {
    case "very_high": return "Very High";
    case "high":      return "High";
    case "moderate":  return "Moderate";
    case "low":       return "Low";
    case "very_low":  return "Very Low";
  }
}

// ─── Main function ────────────────────────────────────────────────────────────

export function computeConfidenceScore(input: ConfidenceScoringInput): ConfidenceScoreBreakdown {
  // Score each input
  const imageResult   = scoreImage(input.image);
  const damageResult  = scoreDamage(input.damage);
  const physicsResult = scorePhysics(input.physics);
  const quoteResult   = scoreQuote(input.quote);
  const vehicleResult = scoreVehicle(input.vehicle);
  const documentResult = scoreDocument(input.document);
  const consistencyResult = scoreConsistency(input.consistency);
  const fraudResult   = scoreFraud(input.fraud);

  // Determine availability
  const availability: Record<string, boolean> = {
    image:       true,
    damage:      true,
    physics:     physicsResult.available,
    quote:       quoteResult.available,
    vehicle:     true,
    document:    true,
    consistency: true,
    fraud:       true,
  };

  // Adaptive weighting: redistribute unavailable weights
  const unavailableWeight = Object.entries(availability)
    .filter(([, avail]) => !avail)
    .reduce((sum, [key]) => sum + BASE_WEIGHTS[key], 0);

  const availableBaseTotal = 1 - unavailableWeight;
  const adjustedWeights: Record<string, number> = {};
  for (const [key, baseWeight] of Object.entries(BASE_WEIGHTS)) {
    if (!availability[key]) {
      adjustedWeights[key] = 0;
    } else {
      adjustedWeights[key] = availableBaseTotal > 0
        ? baseWeight / availableBaseTotal
        : 0;
    }
  }

  // Compute weighted score
  const scores: Record<string, number> = {
    image:       imageResult.score,
    damage:      damageResult.score,
    physics:     physicsResult.score,
    quote:       quoteResult.score,
    vehicle:     vehicleResult.score,
    document:    documentResult.score,
    consistency: consistencyResult.score,
    fraud:       fraudResult.score,
  };

  const rawWeightedScore = Math.round(
    Object.entries(scores).reduce((sum, [key, score]) => sum + score * adjustedWeights[key], 0)
  );

  // Apply penalty gates
  const { finalScore, activePenalties } = applyPenaltyGates(rawWeightedScore, input);

  // Build inputs record
  const labels: Record<string, string> = {
    image:       "Image Quality",
    damage:      "Damage Detection",
    physics:     "Physics Consistency",
    quote:       "Quote Reconciliation",
    vehicle:     "Vehicle Data",
    document:    "Document Completeness",
    consistency: "Data Consistency",
    fraud:       "Fraud Signal Clarity",
  };

  const allImprovements = [
    ...imageResult.improvements,
    ...damageResult.improvements,
    ...physicsResult.improvements,
    ...quoteResult.improvements,
    ...vehicleResult.improvements,
    ...documentResult.improvements,
    ...consistencyResult.improvements,
    ...fraudResult.improvements,
  ].sort((a, b) => b.potentialGain - a.potentialGain);

  const totalPotentialGain = Math.min(
    100 - finalScore,
    allImprovements.reduce((sum, i) => sum + i.potentialGain, 0)
  );

  const inputs: Record<string, ConfidenceInputScore> = {};
  const improvementsByInput: Record<string, ImprovementComment[]> = {
    image:       imageResult.improvements,
    damage:      damageResult.improvements,
    physics:     physicsResult.improvements,
    quote:       quoteResult.improvements,
    vehicle:     vehicleResult.improvements,
    document:    documentResult.improvements,
    consistency: consistencyResult.improvements,
    fraud:       fraudResult.improvements,
  };

  for (const key of Object.keys(BASE_WEIGHTS)) {
    const w = adjustedWeights[key];
    const s = scores[key];
    inputs[key] = {
      name: key,
      label: labels[key],
      score: s,
      maxScore: availability[key] ? 100 : 0,
      available: availability[key],
      weight: Math.round(w * 100),
      contribution: Math.round(s * w),
      improvements: improvementsByInput[key],
    };
  }

  const level = classifyLevel(finalScore);

  // Build summary sentence
  const criticalCount = allImprovements.filter(i => i.severity === "critical").length;
  const summary = criticalCount > 0
    ? `${levelLabel(level)} confidence (${finalScore}%). ${criticalCount} critical gap(s) are limiting accuracy — see the improvement list below.`
    : allImprovements.length > 0
    ? `${levelLabel(level)} confidence (${finalScore}%). ${allImprovements.length} improvement(s) available — resolving them could add up to ${totalPotentialGain} pts.`
    : `${levelLabel(level)} confidence (${finalScore}%). All key data fields are complete.`;

  return {
    finalScore,
    level,
    rawWeightedScore,
    inputs,
    activePenalties,
    allImprovements,
    totalPotentialGain,
    summary,
  };
}

// ─── Pipeline adapter ─────────────────────────────────────────────────────────

/**
 * Builds a ConfidenceScoringInput from the raw pipeline data available in db.ts.
 * This adapter is the single point of translation between pipeline shapes and the engine.
 */
export function buildConfidenceScoringInput(params: {
  imageQuality: {
    score: number;
    scaleCalibrationConfidence: number;
    photoAnglesAvailable: string[];
    referenceObjectsDetected: string[];
    recommendResubmission: boolean;
    crushDepthConfidence: number;
  };
  damagedComponents: Array<{ severity?: string; damageType?: string }>;
  missingDataFlags: string[];
  physicsAnalysis: {
    consistencyScore?: number;
    overallConsistency?: number;
    speedEstimate?: { confidence?: number };
    available: boolean;
  } | null;
  physicsDeviationScore: number;
  massSource: "explicit" | "inferred_model" | "inferred_class" | "not_available";
  partsReconciliation: Array<{ status: string; quotedCost?: number }>;
  estimatedRepairCost: number;
  quoteTotal: number;
  quoteAvailable: boolean;
  vehicle: {
    vin?: string | null;
    registration?: string | null;
    engineNumber?: string | null;
    year?: number | null;
    colour?: string | null;
    make?: string | null;
    model?: string | null;
    massKg?: number | null;
  };
  extractedVehicle: {
    make?: string;
    model?: string;
  };
  claimVehicle: {
    make?: string;
    model?: string;
  };
  document: {
    ownerName?: string | null;
    incidentDate?: string | null;
    repairerName?: string | null;
    incidentDescription?: string | null;
    incidentLocation?: string | null;
    thirdPartyDetails?: string | null;
    policeReportUrl?: string | null;
  };
  fraudScore: number;
  fraudLevel: string;
  fraudIndicatorCount: number;
}): ConfidenceScoringInput {
  const {
    imageQuality, damagedComponents, missingDataFlags,
    physicsAnalysis, physicsDeviationScore, massSource,
    partsReconciliation, estimatedRepairCost, quoteTotal, quoteAvailable,
    vehicle, extractedVehicle, claimVehicle, document: doc,
    fraudScore, fraudLevel, fraudIndicatorCount,
  } = params;

  // Severity spread: how many distinct severity levels are present
  const severities = new Set(damagedComponents.map((c: any) => c.severity || "unknown"));
  const severitySpread = Math.min(100, (severities.size / 4) * 100);

  // Quote reconciliation
  const matched = partsReconciliation.filter(r => r.status === "matched").length;
  const extraInQuote = partsReconciliation.filter(r => r.status === "quoted_not_detected").length;
  const missingFromQuote = partsReconciliation.filter(r => r.status === "detected_not_quoted").length;
  const costDeviationPct = quoteTotal > 0
    ? Math.abs((estimatedRepairCost - quoteTotal) / quoteTotal) * 100
    : 0;

  // VIN validation: 17 alphanumeric chars, no I/O/Q
  const vinRaw = vehicle.vin || "";
  const vinValid = /^[A-HJ-NPR-Z0-9]{17}$/i.test(vinRaw);

  // Registration format: at least 4 chars
  const regRaw = vehicle.registration || "";
  const regValid = regRaw.length >= 4;

  // Make/model consistency
  const extractedMake = (extractedVehicle.make || "").toLowerCase().trim();
  const claimMake = (claimVehicle.make || "").toLowerCase().trim();
  const makeModelMatches = extractedMake.length > 0 && claimMake.length > 0
    ? extractedMake.includes(claimMake) || claimMake.includes(extractedMake)
    : true; // if either is missing, don't penalise consistency

  // Incident date plausibility
  let datePlausible = true;
  if (doc.incidentDate) {
    try {
      const d = new Date(doc.incidentDate);
      const now = new Date();
      const fiveYearsAgo = new Date(now.getFullYear() - 5, now.getMonth(), now.getDate());
      datePlausible = d <= now && d >= fiveYearsAgo;
    } catch {
      datePlausible = false;
    }
  }

  return {
    image: {
      qualityScore: imageQuality.score,
      scaleCalibrationConfidence: imageQuality.scaleCalibrationConfidence,
      photoAnglesCount: imageQuality.photoAnglesAvailable.length,
      referenceObjectsCount: imageQuality.referenceObjectsDetected.length,
      recommendResubmission: imageQuality.recommendResubmission,
      crushDepthConfidence: imageQuality.crushDepthConfidence,
    },
    damage: {
      damagedComponentsCount: damagedComponents.length,
      crushDepthConfidence: imageQuality.crushDepthConfidence,
      severitySpread,
      hasStructuralDamage: damagedComponents.some((c: any) => c.damageType === "structural"),
      missingDataFlagsCount: missingDataFlags.length,
    },
    physics: {
      consistencyScore: physicsAnalysis?.consistencyScore ?? physicsAnalysis?.overallConsistency ?? 50,
      deviationScore: physicsDeviationScore,
      speedEstimateConfidence: physicsAnalysis?.speedEstimate?.confidence ?? 50,
      massSource,
      available: !!physicsAnalysis && physicsAnalysis.available !== false,
    },
    quote: {
      totalComponents: partsReconciliation.length,
      matchedCount: matched,
      extraInQuoteCount: extraInQuote,
      missingFromQuoteCount: missingFromQuote,
      costDeviationPct,
      available: quoteAvailable,
    },
    vehicle: {
      vinPresent: vinRaw.length > 0,
      vinValidFormat: vinValid,
      registrationPresent: regRaw.length > 0,
      engineNumberPresent: !!(vehicle.engineNumber && vehicle.engineNumber.length > 0),
      yearPresent: !!(vehicle.year && vehicle.year > 1900),
      colourPresent: !!(vehicle.colour && vehicle.colour.length > 0),
      makePresent: !!(vehicle.make && vehicle.make.length > 0),
      modelPresent: !!(vehicle.model && vehicle.model.length > 0),
      massKg: vehicle.massKg ?? null,
      massSource,
    },
    document: {
      ownerNamePresent: !!(doc.ownerName && doc.ownerName.length > 0),
      incidentDatePresent: !!(doc.incidentDate && doc.incidentDate.length > 0),
      repairerNamePresent: !!(doc.repairerName && doc.repairerName.length > 0),
      incidentDescriptionPresent: !!(doc.incidentDescription && doc.incidentDescription.length > 3),
      incidentLocationPresent: !!(doc.incidentLocation && doc.incidentLocation.length > 0),
      thirdPartyDetailsPresent: !!(doc.thirdPartyDetails && doc.thirdPartyDetails.length > 0),
      policeReportPresent: !!(doc.policeReportUrl && doc.policeReportUrl.length > 0),
    },
    consistency: {
      makeModelMatchesClaim: makeModelMatches,
      incidentDatePlausible: datePlausible,
      vinFormatValid: vinRaw.length === 0 || vinValid, // only penalise if VIN is present but invalid
      registrationFormatValid: regRaw.length === 0 || regValid,
    },
    fraud: {
      fraudScore,
      fraudLevel,
      indicatorCount: fraudIndicatorCount,
    },
  };
}
