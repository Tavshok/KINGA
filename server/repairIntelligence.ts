/**
 * server/repairIntelligence.ts
 *
 * Repair Intelligence Module
 *
 * Encapsulates repair action classification, labour hour estimation,
 * and parts reconciliation logic. Called by the pipeline runner (Stage 7).
 *
 * All cost constants are market-rate benchmarks for Sub-Saharan Africa / ZW.
 * Labour rate: USD 15/hour (panel beater rate, ZW market).
 * Parts benchmarks: USD, sourced from regional parts distributor data.
 */

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface RepairAction {
  component: string;
  location: string;
  damageType: string;
  severity: string;
  action: "repair" | "replace" | "inspect" | "total_loss";
  rationale: string;
  estimatedLaborHours: number;
}

export interface PartsReconciliationItem {
  component: string;
  status: "matched" | "detected_not_quoted" | "quoted_not_detected";
  repairAction: "repair" | "replace" | "inspect" | "total_loss";
  aiBenchmarkUsd: number;
  quotedCost: number;
  variancePct: number;
  flag: "ok" | "overpriced" | "underpriced" | "missing" | "not_in_quote";
  notes: string;
}

export interface RepairIntelligenceOutput {
  actions: RepairAction[];
  laborHoursEstimate: number;
  laborRateUsdPerHour: number;
  laborCostUsd: number;
  replaceCount: number;
  repairCount: number;
  inspectCount: number;
  partsReconciliation: PartsReconciliationItem[];
}

export interface RepairIntelligenceInput {
  claimId: number;
  damagedComponents: Array<{
    name: string;
    severity?: string;
    damageType?: string;
    location?: string;
    repairAction?: string;
    quotedCost?: number;
  }>;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number;
  physicsImpactForceKn: number;
  physicsEnergyKj: number;
  marketRegion: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

/** Labour rate USD/hour — ZW panel beater market rate */
export const LABOUR_RATE_USD_PER_HOUR = 15;

/**
 * Part benchmark costs (USD) by component keyword.
 * repair = PDR / straightening cost
 * replace = OEM/aftermarket replacement cost
 * Source: ZW/SA regional parts distributor averages (2024)
 */
export const PART_BENCHMARK_USD: Record<string, { repair: number; replace: number }> = {
  // Body panels
  "bumper": { repair: 60, replace: 180 },
  "fender": { repair: 120, replace: 280 },
  "bonnet": { repair: 150, replace: 350 },
  "hood": { repair: 150, replace: 350 },
  "door": { repair: 180, replace: 420 },
  "quarter panel": { repair: 200, replace: 500 },
  "rocker panel": { repair: 100, replace: 220 },
  "trunk": { repair: 150, replace: 350 },
  "boot": { repair: 150, replace: 350 },
  "roof": { repair: 200, replace: 600 },
  "sill": { repair: 100, replace: 220 },
  // Lighting
  "headlamp": { repair: 30, replace: 120 },
  "headlight": { repair: 30, replace: 120 },
  "taillight": { repair: 30, replace: 80 },
  "tail lamp": { repair: 30, replace: 80 },
  "fog light": { repair: 20, replace: 60 },
  "fog lamp": { repair: 20, replace: 60 },
  // Glass
  "windshield": { repair: 50, replace: 200 },
  "windscreen": { repair: 50, replace: 200 },
  "window": { repair: 40, replace: 120 },
  "mirror": { repair: 30, replace: 90 },
  // Structural
  "frame": { repair: 500, replace: 1500 },
  "subframe": { repair: 300, replace: 800 },
  "pillar": { repair: 400, replace: 1200 },
  "crossmember": { repair: 200, replace: 600 },
  "radiator support": { repair: 250, replace: 700 },
  "crash bar": { repair: 80, replace: 200 },
  "reinforcement": { repair: 80, replace: 200 },
  // Mechanical
  "radiator": { repair: 80, replace: 250 },
  "condenser": { repair: 60, replace: 180 },
  "suspension": { repair: 150, replace: 400 },
  "wheel": { repair: 50, replace: 150 },
  "tyre": { repair: 20, replace: 80 },
  "tire": { repair: 20, replace: 80 },
  "axle": { repair: 200, replace: 600 },
  "engine mount": { repair: 60, replace: 150 },
  "steering": { repair: 150, replace: 480 },
  "rack": { repair: 150, replace: 480 },
  // Interior
  "dashboard": { repair: 100, replace: 400 },
  "airbag": { repair: 0, replace: 600 },
  "seat": { repair: 80, replace: 300 },
  // Default fallback
  "default": { repair: 100, replace: 250 },
};

/** Severity multiplier applied to replacement cost */
export const SEVERITY_MULTIPLIER: Record<string, number> = {
  "minor": 0.5,
  "moderate": 0.8,
  "severe": 1.0,
  "total_loss": 1.2,
  "catastrophic": 1.5,
};

// ─────────────────────────────────────────────────────────────────────────────
// REPAIR ACTION CLASSIFIER
// ─────────────────────────────────────────────────────────────────────────────

export function classifyRepairAction(comp: {
  name?: string;
  component?: string;
  severity?: string;
  damageType?: string;
  location?: string;
  repairAction?: string;
  quotedCost?: number;
}): RepairAction {
  const sev = (comp.severity || "").toLowerCase();
  const type = (comp.damageType || "").toLowerCase();
  const name = (comp.name || comp.component || "").toLowerCase();

  const base = {
    component: comp.name || comp.component || "",
    location: comp.location || "",
    damageType: comp.damageType || "",
    severity: comp.severity || "",
  };

  if (sev === "total_loss") {
    return { ...base, action: "total_loss", rationale: "Component damage exceeds economic repair threshold", estimatedLaborHours: 0 };
  }

  // Structural components
  if (type === "structural" || name.includes("frame") || name.includes("pillar") || name.includes("subframe") || name.includes("sill") || name.includes("crossmember")) {
    if (sev === "severe" || sev === "catastrophic") return { ...base, action: "replace", rationale: "Severe structural damage compromises vehicle safety; replacement mandatory", estimatedLaborHours: 8 };
    if (sev === "moderate") return { ...base, action: "inspect", rationale: "Moderate structural damage requires specialist inspection before repair decision", estimatedLaborHours: 2 };
    return { ...base, action: "repair", rationale: "Minor structural damage — panel straightening and reinforcement", estimatedLaborHours: 4 };
  }

  // Mechanical components
  if (type === "mechanical" || name.includes("engine") || name.includes("transmission") || name.includes("axle") || name.includes("suspension") || name.includes("steering") || name.includes("radiator") || name.includes("condenser")) {
    if (sev === "severe" || sev === "catastrophic") return { ...base, action: "replace", rationale: "Severe mechanical damage — component integrity compromised", estimatedLaborHours: 6 };
    return { ...base, action: "inspect", rationale: "Mechanical component requires diagnostic inspection", estimatedLaborHours: 1.5 };
  }

  // Electrical components
  if (type === "electrical" || name.includes("wiring") || name.includes("harness") || name.includes("module") || name.includes("ecu") || name.includes("airbag")) {
    if (sev === "severe" || sev === "catastrophic") return { ...base, action: "replace", rationale: "Severe electrical damage — wiring/module replacement required", estimatedLaborHours: 4 };
    return { ...base, action: "inspect", rationale: "Electrical fault diagnosis required", estimatedLaborHours: 1 };
  }

  // Cosmetic / body panels (default)
  if (sev === "severe" || sev === "catastrophic") return { ...base, action: "replace", rationale: "Severe cosmetic damage — panel replacement more economical than repair", estimatedLaborHours: 3 };
  if (sev === "moderate") return { ...base, action: "repair", rationale: "Moderate cosmetic damage — panel beating and refinishing", estimatedLaborHours: 2 };
  return { ...base, action: "repair", rationale: "Minor cosmetic damage — PDR or spot repair", estimatedLaborHours: 1 };
}

// ─────────────────────────────────────────────────────────────────────────────
// BENCHMARK COST LOOKUP
// ─────────────────────────────────────────────────────────────────────────────

export function lookupBenchmarkCostUsd(
  componentName: string,
  action: "repair" | "replace" | "inspect" | "total_loss",
  severity: string
): number {
  const nameLower = componentName.toLowerCase();
  const benchmarkKey = Object.keys(PART_BENCHMARK_USD).find((k) => nameLower.includes(k)) || "default";
  const benchmark = PART_BENCHMARK_USD[benchmarkKey];
  const baseUsd = action === "repair" ? benchmark.repair : benchmark.replace;
  const multiplier = SEVERITY_MULTIPLIER[severity.toLowerCase()] ?? 1.0;
  return Math.round(baseUsd * multiplier);
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────────

export async function computeRepairIntelligence(
  input: RepairIntelligenceInput
): Promise<RepairIntelligenceOutput> {
  const actions = input.damagedComponents.map(classifyRepairAction);

  const replaceCount = actions.filter((r) => r.action === "replace" || r.action === "total_loss").length;
  const repairCount = actions.filter((r) => r.action === "repair").length;
  const inspectCount = actions.filter((r) => r.action === "inspect").length;
  const laborHoursEstimate = actions.reduce((sum, r) => sum + r.estimatedLaborHours, 0);
  const laborCostUsd = Math.round(laborHoursEstimate * LABOUR_RATE_USD_PER_HOUR);

  // Parts reconciliation
  const partsReconciliation: PartsReconciliationItem[] = input.damagedComponents.map((comp) => {
    const action = actions.find((a) => a.component.toLowerCase() === (comp.name || "").toLowerCase());
    const repairAction = action?.action || "replace";
    const aiBenchmarkUsd = lookupBenchmarkCostUsd(comp.name || "", repairAction, comp.severity || "moderate");
    const quotedCost = comp.quotedCost || 0;
    const variancePct = quotedCost > 0 ? Math.round(((quotedCost - aiBenchmarkUsd) / aiBenchmarkUsd) * 100) : 0;

    let status: PartsReconciliationItem["status"] = "matched";
    let flag: PartsReconciliationItem["flag"] = "ok";
    let notes = "";

    if (quotedCost === 0) {
      status = "detected_not_quoted";
      flag = "missing";
      notes = "Component detected by AI but not found in submitted quote";
    } else if (variancePct > 30) {
      flag = "overpriced";
      notes = `Quoted ${variancePct}% above AI benchmark (USD ${aiBenchmarkUsd})`;
    } else if (variancePct < -30) {
      flag = "underpriced";
      notes = `Quoted ${Math.abs(variancePct)}% below AI benchmark — possible underquoting`;
    } else {
      notes = "Within acceptable range of AI benchmark";
    }

    return {
      component: comp.name || "",
      status,
      repairAction,
      aiBenchmarkUsd,
      quotedCost,
      variancePct,
      flag,
      notes,
    };
  });

  return {
    actions,
    laborHoursEstimate,
    laborRateUsdPerHour: LABOUR_RATE_USD_PER_HOUR,
    laborCostUsd,
    replaceCount,
    repairCount,
    inspectCount,
    partsReconciliation,
  };
}
