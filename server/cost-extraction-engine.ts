/**
 * cost-extraction-engine.ts
 *
 * KINGA Cost Extraction Engine
 *
 * Guarantees a fully-populated cost object with ZERO empty fields.
 * Uses itemised component costs when available, falls back to
 * component-damage-severity estimation when AI extraction is incomplete.
 *
 * Output contract (always satisfied):
 * {
 *   ai_estimate: number,       // total repair cost in USD
 *   parts: number,             // parts subtotal in USD
 *   labour: number,            // labour subtotal in USD
 *   fair_range: { min, max },  // ±15–25% of ai_estimate
 *   confidence: number,        // 0–100%
 *   itemised_parts: [...],     // per-component breakdown (may be estimated)
 *   source: "extracted" | "estimated" | "severity_fallback"
 * }
 */

// ─── Component cost database (USD) ───────────────────────────────────────────
// Sourced from South African motor repair industry benchmarks (2024)
// Parts costs are mid-range OEM/aftermarket averages

const COMPONENT_COST_DB: Record<string, { parts: number; labour: number; severity_multiplier: Record<string, number> }> = {
  // Front end
  "front bumper":         { parts: 380,  labour: 120, severity_multiplier: { minor: 0.6, moderate: 1.0, severe: 1.4, catastrophic: 1.8 } },
  "bumper":               { parts: 380,  labour: 120, severity_multiplier: { minor: 0.6, moderate: 1.0, severe: 1.4, catastrophic: 1.8 } },
  "front bumper cover":   { parts: 380,  labour: 120, severity_multiplier: { minor: 0.6, moderate: 1.0, severe: 1.4, catastrophic: 1.8 } },
  "grill":                { parts: 220,  labour: 60,  severity_multiplier: { minor: 0.7, moderate: 1.0, severe: 1.3, catastrophic: 1.6 } },
  "grille":               { parts: 220,  labour: 60,  severity_multiplier: { minor: 0.7, moderate: 1.0, severe: 1.3, catastrophic: 1.6 } },
  "nudge bar":            { parts: 450,  labour: 90,  severity_multiplier: { minor: 0.5, moderate: 1.0, severe: 1.5, catastrophic: 2.0 } },
  "bull bar":             { parts: 450,  labour: 90,  severity_multiplier: { minor: 0.5, moderate: 1.0, severe: 1.5, catastrophic: 2.0 } },
  "hood":                 { parts: 650,  labour: 180, severity_multiplier: { minor: 0.5, moderate: 1.0, severe: 1.6, catastrophic: 2.2 } },
  "bonnet":               { parts: 650,  labour: 180, severity_multiplier: { minor: 0.5, moderate: 1.0, severe: 1.6, catastrophic: 2.2 } },
  "headlight":            { parts: 320,  labour: 80,  severity_multiplier: { minor: 0.8, moderate: 1.0, severe: 1.2, catastrophic: 1.5 } },
  "headlamp":             { parts: 320,  labour: 80,  severity_multiplier: { minor: 0.8, moderate: 1.0, severe: 1.2, catastrophic: 1.5 } },
  "fog light":            { parts: 120,  labour: 40,  severity_multiplier: { minor: 0.8, moderate: 1.0, severe: 1.2, catastrophic: 1.4 } },
  "radiator":             { parts: 480,  labour: 200, severity_multiplier: { minor: 0.6, moderate: 1.0, severe: 1.5, catastrophic: 2.0 } },
  "radiator support":     { parts: 280,  labour: 150, severity_multiplier: { minor: 0.6, moderate: 1.0, severe: 1.5, catastrophic: 2.0 } },
  "front fender":         { parts: 420,  labour: 160, severity_multiplier: { minor: 0.5, moderate: 1.0, severe: 1.6, catastrophic: 2.2 } },
  "fender":               { parts: 420,  labour: 160, severity_multiplier: { minor: 0.5, moderate: 1.0, severe: 1.6, catastrophic: 2.2 } },
  "reflector":            { parts: 80,   labour: 30,  severity_multiplier: { minor: 1.0, moderate: 1.0, severe: 1.0, catastrophic: 1.0 } },
  "reflectors":           { parts: 80,   labour: 30,  severity_multiplier: { minor: 1.0, moderate: 1.0, severe: 1.0, catastrophic: 1.0 } },
  // Rear end
  "rear bumper":          { parts: 360,  labour: 110, severity_multiplier: { minor: 0.6, moderate: 1.0, severe: 1.4, catastrophic: 1.8 } },
  "rear bumper cover":    { parts: 360,  labour: 110, severity_multiplier: { minor: 0.6, moderate: 1.0, severe: 1.4, catastrophic: 1.8 } },
  "boot lid":             { parts: 580,  labour: 170, severity_multiplier: { minor: 0.5, moderate: 1.0, severe: 1.6, catastrophic: 2.2 } },
  "trunk lid":            { parts: 580,  labour: 170, severity_multiplier: { minor: 0.5, moderate: 1.0, severe: 1.6, catastrophic: 2.2 } },
  "taillight":            { parts: 280,  labour: 70,  severity_multiplier: { minor: 0.8, moderate: 1.0, severe: 1.2, catastrophic: 1.5 } },
  "tail light":           { parts: 280,  labour: 70,  severity_multiplier: { minor: 0.8, moderate: 1.0, severe: 1.2, catastrophic: 1.5 } },
  "rear quarter panel":   { parts: 520,  labour: 200, severity_multiplier: { minor: 0.5, moderate: 1.0, severe: 1.7, catastrophic: 2.3 } },
  // Sides
  "door":                 { parts: 680,  labour: 220, severity_multiplier: { minor: 0.4, moderate: 1.0, severe: 1.7, catastrophic: 2.4 } },
  "front door":           { parts: 680,  labour: 220, severity_multiplier: { minor: 0.4, moderate: 1.0, severe: 1.7, catastrophic: 2.4 } },
  "rear door":            { parts: 620,  labour: 200, severity_multiplier: { minor: 0.4, moderate: 1.0, severe: 1.7, catastrophic: 2.4 } },
  "side mirror":          { parts: 180,  labour: 50,  severity_multiplier: { minor: 0.8, moderate: 1.0, severe: 1.2, catastrophic: 1.4 } },
  "wing mirror":          { parts: 180,  labour: 50,  severity_multiplier: { minor: 0.8, moderate: 1.0, severe: 1.2, catastrophic: 1.4 } },
  "rocker panel":         { parts: 320,  labour: 140, severity_multiplier: { minor: 0.5, moderate: 1.0, severe: 1.6, catastrophic: 2.2 } },
  // Structural
  "windshield":           { parts: 480,  labour: 120, severity_multiplier: { minor: 0.8, moderate: 1.0, severe: 1.3, catastrophic: 1.6 } },
  "windscreen":           { parts: 480,  labour: 120, severity_multiplier: { minor: 0.8, moderate: 1.0, severe: 1.3, catastrophic: 1.6 } },
  "roof":                 { parts: 900,  labour: 350, severity_multiplier: { minor: 0.4, moderate: 1.0, severe: 1.8, catastrophic: 2.5 } },
  "chassis":              { parts: 1800, labour: 600, severity_multiplier: { minor: 0.3, moderate: 1.0, severe: 2.0, catastrophic: 3.0 } },
  "frame":                { parts: 1800, labour: 600, severity_multiplier: { minor: 0.3, moderate: 1.0, severe: 2.0, catastrophic: 3.0 } },
  "subframe":             { parts: 620,  labour: 280, severity_multiplier: { minor: 0.4, moderate: 1.0, severe: 1.8, catastrophic: 2.5 } },
  // Mechanical
  "engine":               { parts: 4500, labour: 800, severity_multiplier: { minor: 0.2, moderate: 0.8, severe: 1.5, catastrophic: 2.0 } },
  "transmission":         { parts: 2800, labour: 600, severity_multiplier: { minor: 0.2, moderate: 0.8, severe: 1.5, catastrophic: 2.0 } },
  "suspension":           { parts: 680,  labour: 300, severity_multiplier: { minor: 0.4, moderate: 1.0, severe: 1.7, catastrophic: 2.3 } },
  "airbag":               { parts: 850,  labour: 250, severity_multiplier: { minor: 0.0, moderate: 0.5, severe: 1.0, catastrophic: 1.0 } },
  "airbags":              { parts: 1200, labour: 350, severity_multiplier: { minor: 0.0, moderate: 0.5, severe: 1.0, catastrophic: 1.0 } },
  // Default fallback
  "default":              { parts: 300,  labour: 100, severity_multiplier: { minor: 0.6, moderate: 1.0, severe: 1.5, catastrophic: 2.0 } },
};

// Severity-based total cost benchmarks (USD) when no component data available
const SEVERITY_TOTAL_COST: Record<string, { min: number; base: number; max: number }> = {
  none:         { min: 0,     base: 0,     max: 0     },
  minor:        { min: 300,   base: 650,   max: 1200  },
  moderate:     { min: 1200,  base: 3500,  max: 8000  },
  severe:       { min: 8000,  base: 18000, max: 35000 },
  catastrophic: { min: 35000, base: 55000, max: 90000 },
  total_loss:   { min: 50000, base: 80000, max: 120000 },
  unknown:      { min: 500,   base: 2000,  max: 6000  },
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ItemisedPart {
  component: string;
  parts_cost: number;
  labour_cost: number;
  total: number;
  source: "extracted" | "estimated";
}

export interface CostExtractionResult {
  ai_estimate: number;
  parts: number;
  labour: number;
  fair_range: { min: number; max: number };
  confidence: number;
  itemised_parts: ItemisedPart[];
  source: "extracted" | "estimated" | "severity_fallback";
  basis: string;
}

export interface CostExtractionInput {
  /** AI-extracted total cost in USD (0 if not available) */
  aiEstimatedCost: number;
  /** AI-extracted parts cost in USD (0 if not available) */
  aiPartsCost: number;
  /** AI-extracted labour cost in USD (0 if not available) */
  aiLabourCost: number;
  /** Damage components detected by AI vision */
  damageComponents: string[];
  /** Accident severity from physics engine */
  accidentSeverity: string;
  /** AI extraction confidence (0–100) */
  extractionConfidence: number;
  /** Quoted amounts from panel beaters in USD */
  quotedAmounts: number[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function lookupComponent(name: string): { parts: number; labour: number; severity_multiplier: Record<string, number> } {
  const key = name.toLowerCase().trim();
  // Exact match
  if (COMPONENT_COST_DB[key]) return COMPONENT_COST_DB[key];
  // Partial match
  for (const [dbKey, costs] of Object.entries(COMPONENT_COST_DB)) {
    if (key.includes(dbKey) || dbKey.includes(key)) return costs;
  }
  return COMPONENT_COST_DB["default"];
}

function applyMultiplier(base: number, severity: string, multiplierMap: Record<string, number>): number {
  const m = multiplierMap[severity] ?? multiplierMap["minor"] ?? 1.0;
  return Math.round(base * m);
}

function computeFairRange(
  estimate: number,
  confidence: number,
  hasQuotes: boolean
): { min: number; max: number } {
  // ±15% when high confidence or quotes available, ±25% when low confidence
  const spread = (confidence >= 80 || hasQuotes) ? 0.15 : 0.25;
  return {
    min: Math.round(estimate * (1 - spread)),
    max: Math.round(estimate * (1 + spread)),
  };
}

// ─── Main extraction function ─────────────────────────────────────────────────

export function extractCosts(input: CostExtractionInput): CostExtractionResult {
  const {
    aiEstimatedCost,
    aiPartsCost,
    aiLabourCost,
    damageComponents,
    accidentSeverity,
    extractionConfidence,
    quotedAmounts,
  } = input;

  const hasQuotes = quotedAmounts.length > 0;
  const severity = accidentSeverity || "minor";

  // ── CASE 1: Full AI extraction available ─────────────────────────────────
  if (aiEstimatedCost > 0 && aiPartsCost > 0 && aiLabourCost > 0) {
    const itemised_parts: ItemisedPart[] = damageComponents.map(comp => {
      const db = lookupComponent(comp);
      const partsCost = applyMultiplier(db.parts, severity, db.severity_multiplier);
      const labourCost = applyMultiplier(db.labour, severity, db.severity_multiplier);
      return {
        component: comp,
        parts_cost: partsCost,
        labour_cost: labourCost,
        total: partsCost + labourCost,
        source: "estimated" as const,
      };
    });

    // Scale itemised parts to match AI total (preserve ratio)
    const itemisedTotal = itemised_parts.reduce((s, p) => s + p.total, 0);
    if (itemisedTotal > 0 && Math.abs(itemisedTotal - aiEstimatedCost) / aiEstimatedCost > 0.3) {
      // Scale each item proportionally to match AI total
      const scale = aiEstimatedCost / itemisedTotal;
      for (const item of itemised_parts) {
        item.parts_cost = Math.round(item.parts_cost * scale);
        item.labour_cost = Math.round(item.labour_cost * scale);
        item.total = item.parts_cost + item.labour_cost;
      }
    }

    const confidence = Math.min(95, extractionConfidence);
    return {
      ai_estimate: aiEstimatedCost,
      parts: aiPartsCost,
      labour: aiLabourCost,
      fair_range: computeFairRange(aiEstimatedCost, confidence, hasQuotes),
      confidence,
      itemised_parts: itemised_parts.length > 0 ? itemised_parts : [{
        component: "General repairs",
        parts_cost: aiPartsCost,
        labour_cost: aiLabourCost,
        total: aiEstimatedCost,
        source: "extracted",
      }],
      source: "extracted",
      basis: `AI-extracted from claim document (${extractionConfidence}% confidence)`,
    };
  }

  // ── CASE 2: AI total available but parts/labour split missing ────────────
  if (aiEstimatedCost > 0) {
    // Use severity-based parts/labour ratio
    const ratios: Record<string, { parts: number; labour: number }> = {
      minor:        { parts: 0.65, labour: 0.35 },
      moderate:     { parts: 0.60, labour: 0.40 },
      severe:       { parts: 0.55, labour: 0.45 },
      catastrophic: { parts: 0.50, labour: 0.50 },
      total_loss:   { parts: 0.70, labour: 0.30 },
      unknown:      { parts: 0.62, labour: 0.38 },
    };
    const ratio = ratios[severity] ?? ratios.unknown;
    const parts = Math.round(aiEstimatedCost * ratio.parts);
    const labour = Math.round(aiEstimatedCost * ratio.labour);

    // Build itemised parts from components
    const itemised_parts: ItemisedPart[] = damageComponents.length > 0
      ? damageComponents.map(comp => {
          const db = lookupComponent(comp);
          const partsCost = applyMultiplier(db.parts, severity, db.severity_multiplier);
          const labourCost = applyMultiplier(db.labour, severity, db.severity_multiplier);
          return {
            component: comp,
            parts_cost: partsCost,
            labour_cost: labourCost,
            total: partsCost + labourCost,
            source: "estimated" as const,
          };
        })
      : [{
          component: "General vehicle repairs",
          parts_cost: parts,
          labour_cost: labour,
          total: aiEstimatedCost,
          source: "estimated" as const,
        }];

    const confidence = Math.min(80, extractionConfidence > 0 ? extractionConfidence - 10 : 65);
    return {
      ai_estimate: aiEstimatedCost,
      parts,
      labour,
      fair_range: computeFairRange(aiEstimatedCost, confidence, hasQuotes),
      confidence,
      itemised_parts,
      source: "estimated",
      basis: `AI total extracted; parts/labour split estimated from ${severity} severity ratio`,
    };
  }

  // ── CASE 3: Component-based estimation (no AI cost) ──────────────────────
  if (damageComponents.length > 0) {
    const itemised_parts: ItemisedPart[] = damageComponents.map(comp => {
      const db = lookupComponent(comp);
      const partsCost = applyMultiplier(db.parts, severity, db.severity_multiplier);
      const labourCost = applyMultiplier(db.labour, severity, db.severity_multiplier);
      return {
        component: comp,
        parts_cost: partsCost,
        labour_cost: labourCost,
        total: partsCost + labourCost,
        source: "estimated" as const,
      };
    });

    const totalParts = itemised_parts.reduce((s, p) => s + p.parts_cost, 0);
    const totalLabour = itemised_parts.reduce((s, p) => s + p.labour_cost, 0);
    const totalEstimate = totalParts + totalLabour;

    const confidence = Math.max(40, Math.min(65, 40 + damageComponents.length * 5));
    return {
      ai_estimate: totalEstimate,
      parts: totalParts,
      labour: totalLabour,
      fair_range: computeFairRange(totalEstimate, confidence, hasQuotes),
      confidence,
      itemised_parts,
      source: "estimated",
      basis: `Estimated from ${damageComponents.length} detected component(s) using industry cost database`,
    };
  }

  // ── CASE 4: Severity-only fallback (no components, no AI cost) ───────────
  const severityBenchmark = SEVERITY_TOTAL_COST[severity] ?? SEVERITY_TOTAL_COST.unknown;
  const estimate = severityBenchmark.base;
  const parts = Math.round(estimate * 0.62);
  const labour = Math.round(estimate * 0.38);

  const confidence = 30; // Low confidence — no component or AI data
  return {
    ai_estimate: estimate,
    parts,
    labour,
    fair_range: {
      min: severityBenchmark.min,
      max: severityBenchmark.max,
    },
    confidence,
    itemised_parts: [{
      component: `${severity.charAt(0).toUpperCase() + severity.slice(1)} vehicle damage (severity benchmark)`,
      parts_cost: parts,
      labour_cost: labour,
      total: estimate,
      source: "estimated",
    }],
    source: "severity_fallback",
    basis: `Severity-only benchmark (${severity}) — no component or AI cost data available`,
  };
}
