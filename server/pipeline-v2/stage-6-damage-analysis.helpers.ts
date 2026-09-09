import type { AccidentSeverity, DamageAnalysisComponent } from "./types";

/**
 * Normalise structured and vision-derived severity labels to the Stage 6
 * canonical severity vocabulary. Unknown labels intentionally remain moderate
 * so the stage can preserve a usable, reviewable analysis instead of failing.
 */
export function normaliseSeverity(raw: string): AccidentSeverity {
  const value = (raw || "").toLowerCase().trim();
  if (value === "catastrophic") return "catastrophic";
  if (value === "severe" || value === "major") return "severe";
  if (value === "moderate" || value === "medium") return "moderate";
  if (value === "minor" || value === "light" || value === "slight") return "minor";
  if (value === "cosmetic" || value === "superficial") return "cosmetic";
  return "moderate";
}

/** Map a component location to the shared Stage 6 damage-zone vocabulary. */
export function inferZone(location: string): string {
  const value = (location || "").toLowerCase();
  if (/front|bumper front|hood|bonnet|headl|grille|radiator|fender front|wing front/.test(value)) return "front";
  if (/rear|bumper rear|tail|trunk|boot|boot.?lid|loadbox|fender rear|wing rear/.test(value)) return "rear";
  if (/left|driver|lh|l\/h/.test(value)) return "left_side";
  if (/right|passenger|rh|r\/h/.test(value)) return "right_side";
  if (/roof|top|overhead|canopy|roof.?lin/.test(value)) return "roof";
  if (/sill|rocker/.test(value)) return "left_side";
  if (/under|bottom|chassis|subframe/.test(value)) return "undercarriage";
  return "general";
}

/**
 * Produce the bounded aggregate damage-severity score used in Stage 6 output.
 * It is not a settlement or write-off decision; downstream evidence gates make
 * any decision treatment explicitly.
 */
export function calculateOverallSeverity(components: DamageAnalysisComponent[]): number {
  if (components.length === 0) return 0;

  const weights: Record<AccidentSeverity, number> = {
    none: 0,
    cosmetic: 10,
    minor: 25,
    moderate: 50,
    severe: 75,
    catastrophic: 100,
  };
  const average = components.reduce((sum, component) => sum + (weights[component.severity] || 50), 0) / components.length;
  const countBoost = Math.min(20, components.length * 2);
  return Math.min(100, Math.round(average + countBoost));
}
