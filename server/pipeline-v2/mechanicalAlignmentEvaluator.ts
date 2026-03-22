/**
 * mechanicalAlignmentEvaluator.ts
 *
 * Forensic Mechanical Alignment Evaluator
 *
 * Determines whether a repair quote is mechanically consistent with the
 * accident damage, given the physics summary (impact direction/zones).
 *
 * Produces:
 *   - alignment_status: FULLY_ALIGNED | PARTIALLY_ALIGNED | MISALIGNED
 *   - critical_missing: structural components required by the accident mechanism
 *     but absent from the quote
 *   - unrelated_items: components in the quote that cannot be explained by the
 *     accident mechanism
 *   - engineering_comment: one-sentence mechanical explanation
 *
 * Rules:
 *   - Structural components missing from quote → PARTIALLY_ALIGNED or MISALIGNED
 *   - Unrelated structural components in quote → MISALIGNED
 *   - Cosmetic unrelated items → noted but do not change alignment status alone
 *   - FULLY_ALIGNED requires: all structural damage components quoted AND
 *     no unrelated structural items
 */

import { normalise, isStructural } from "./damageReconciliationEngine";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AlignmentStatus = "FULLY_ALIGNED" | "PARTIALLY_ALIGNED" | "MISALIGNED";

export interface AlignmentResult {
  alignment_status: AlignmentStatus;
  critical_missing: CriticalMissingItem[];
  unrelated_items: UnrelatedItem[];
  engineering_comment: string;
  coverage_ratio: number;
  structural_coverage_ratio: number;
  physics_zones_covered: boolean;
}

export interface CriticalMissingItem {
  component: string;
  reason: string;
  is_structural: boolean;
  expected_zone: string;
}

export interface UnrelatedItem {
  component: string;
  reason: string;
  is_structural: boolean;
  risk_level: "low" | "medium" | "high";
}

// ─── Zone-to-component mapping ────────────────────────────────────────────────
// Maps impact zones to the components that are mechanically expected to be
// damaged in that zone. Used to detect components that cannot be explained
// by the accident mechanism.

const ZONE_EXPECTED_COMPONENTS: Record<string, string[]> = {
  rear: [
    "rear bumper", "rear bumper bracket", "rear bumper sensor", "parking sensor",
    "tail lamp", "tail light", "tailgate", "boot lid", "trunk lid",
    "rear end piece", "rear end panel", "loading panel", "load panel",
    "rear quarter panel", "rear fender", "spare wheel carrier",
    "tow bar", "tow hitch", "tow hinge", "tow bracket",
    "rear crossmember", "rear chassis rail", "rear sill",
    "reverse camera", "rear diffuser",
  ],
  front: [
    "front bumper", "front bumper bracket", "front bumper sensor", "parking sensor",
    "headlamp", "headlight", "fog light", "fog lamp",
    "grille", "front grille", "radiator grille",
    "hood", "bonnet",
    "radiator", "condenser", "intercooler",
    "radiator support panel", "rad support panel",
    "front crossmember", "front chassis rail", "front subframe",
    "front fender", "front wing",
    "bumper slides", "bumper absorber",
    "differential connector", "diff connector",
    "skid plate", "underbody guard",
    "tow hitch", "tow hinge",
  ],
  side_left: [
    "lhs door", "lhs front door", "lhs rear door",
    "lhs fender", "lhs wing", "lhs quarter panel",
    "lhs mirror", "driver side mirror",
    "lhs sill", "lhs rocker panel",
    "lhs tail lamp", "lhs headlamp",
  ],
  side_right: [
    "rhs door", "rhs front door", "rhs rear door",
    "rhs fender", "rhs wing", "rhs quarter panel",
    "rhs mirror", "passenger side mirror",
    "rhs sill", "rhs rocker panel",
    "rhs tail lamp", "rhs headlamp",
    "rhs loading panel", "rhs load panel",
  ],
  // Multi-zone: chain collision — rear primary + front reaction
  multi_zone: [
    // All rear + all front components are expected
    "rear bumper", "rear bumper bracket", "rear bumper sensor", "parking sensor",
    "tail lamp", "tail light", "tailgate", "boot lid", "trunk lid",
    "rear end piece", "rear end panel", "loading panel", "load panel",
    "tow bar", "tow hitch", "tow hinge",
    "front bumper", "front bumper bracket",
    "headlamp", "headlight", "grille", "front grille", "radiator grille",
    "hood", "bonnet", "radiator", "condenser",
    "radiator support panel", "rad support panel",
    "bumper slides", "bumper absorber",
    "differential connector", "diff connector",
    "skid plate",
  ],
};

// Components that are NEVER expected from a single-impact collision
// (require rollover, fire, or multi-vehicle pileup)
const IMPLAUSIBLE_SINGLE_IMPACT: string[] = [
  "roof panel", "roof lining", "sunroof", "windscreen", "windshield",
  "engine block", "transmission", "gearbox", "catalytic converter",
  "fuel tank", "fuel pump", "airbag", "srs module",
  "steering column", "steering wheel", "dashboard", "instrument cluster",
];

// ─── Zone detection from physics summary ─────────────────────────────────────

function detectZonesFromPhysics(physicsSummary: string): string[] {
  const s = physicsSummary.toLowerCase();
  const zones: string[] = [];

  if (/rear|back|behind|chain|struck from/.test(s)) zones.push("rear");
  if (/front|head.?on|forward|nose/.test(s)) zones.push("front");
  if (/left|lhs|driver.?side|nearside/.test(s)) zones.push("side_left");
  if (/right|rhs|passenger.?side|offside/.test(s)) zones.push("side_right");
  if (/multi.?zone|both ends|chain collision|rear.*front|front.*rear/.test(s)) {
    if (!zones.includes("rear")) zones.push("rear");
    if (!zones.includes("front")) zones.push("front");
  }

  // Default to multi_zone if both rear and front are present
  if (zones.includes("rear") && zones.includes("front")) {
    return ["multi_zone"];
  }

  return zones.length > 0 ? zones : ["unknown"];
}

// ─── Build expected component set from zones ─────────────────────────────────

function buildExpectedSet(zones: string[]): Set<string> {
  const expected = new Set<string>();
  for (const zone of zones) {
    const components = ZONE_EXPECTED_COMPONENTS[zone] ?? ZONE_EXPECTED_COMPONENTS["multi_zone"];
    components.forEach(c => expected.add(normalise(c)));
  }
  return expected;
}

// ─── Main evaluation function ─────────────────────────────────────────────────

/**
 * evaluateMechanicalAlignment
 *
 * @param damageComponents  Official damage component list (from Stage 6)
 * @param quoteComponents   Components listed in the repair quote (from Stage 3 / input recovery)
 * @param physicsSummary    Short description of the accident mechanism (e.g. "rear chain collision")
 */
export function evaluateMechanicalAlignment(
  damageComponents: string[],
  quoteComponents: string[],
  physicsSummary: string
): AlignmentResult {
  // Normalise all inputs
  const normDamage = damageComponents.map(normalise);
  const normQuote = quoteComponents.map(normalise);
  const quoteSet = new Set(normQuote);

  // Detect zones from physics summary
  const zones = detectZonesFromPhysics(physicsSummary);
  const expectedSet = buildExpectedSet(zones);

  // ── STEP 1: Find critical missing components ──────────────────────────────
  // A component is "critical missing" if:
  //   (a) it is in the damage list, AND
  //   (b) it is structural, AND
  //   (c) it is NOT in the quote
  const criticalMissing: CriticalMissingItem[] = [];
  const structuralDamageCount = normDamage.filter(isStructural).length;
  let structuralQuotedCount = 0;

  for (let i = 0; i < normDamage.length; i++) {
    const nd = normDamage[i];
    const original = damageComponents[i];
    const structural = isStructural(nd);

    // Check if quoted (exact or substring match)
    const isQuoted = quoteSet.has(nd) ||
      normQuote.some(q => q.includes(nd) || nd.includes(q));

    if (structural) {
      if (isQuoted) {
        structuralQuotedCount++;
      } else {
        // Determine expected zone
        let expectedZone = "unknown";
        for (const [zone, components] of Object.entries(ZONE_EXPECTED_COMPONENTS)) {
          if (components.map(normalise).some(c => c === nd || c.includes(nd) || nd.includes(c))) {
            expectedZone = zone;
            break;
          }
        }
        criticalMissing.push({
          component: original,
          reason: `Structural component present in damage list but not found in repair quote. Required for load-path integrity.`,
          is_structural: true,
          expected_zone: expectedZone,
        });
      }
    }
  }

  // ── STEP 2: Find unrelated items in quote ─────────────────────────────────
  // A component is "unrelated" if:
  //   (a) it is in the quote, AND
  //   (b) it is NOT in the damage list (no match), AND
  //   (c) it is NOT in the expected set for the accident zones
  const unrelatedItems: UnrelatedItem[] = [];

  for (let i = 0; i < normQuote.length; i++) {
    const nq = normQuote[i];
    const original = quoteComponents[i];

    // Check if it matches anything in the damage list
    const inDamageList = normDamage.some(nd => nd === nq || nd.includes(nq) || nq.includes(nd));
    if (inDamageList) continue;

    // Check if it is in the expected set for the accident zones
    const inExpectedSet = expectedSet.has(nq) ||
      Array.from(expectedSet).some(e => e.includes(nq) || nq.includes(e));
    if (inExpectedSet) continue;

    // Check if it is implausible for a single-impact collision
    const isImplausible = IMPLAUSIBLE_SINGLE_IMPACT.map(normalise).some(
      imp => imp === nq || imp.includes(nq) || nq.includes(imp)
    );

    const structural = isStructural(nq);
    const riskLevel: "low" | "medium" | "high" = isImplausible
      ? "high"
      : structural
      ? "medium"
      : "low";

    unrelatedItems.push({
      component: original,
      reason: isImplausible
        ? `Component (${original}) is not consistent with a single-impact collision mechanism. Requires independent justification.`
        : structural
        ? `Structural component (${original}) not present in damage list and not expected from the reported accident zones (${zones.join(", ")}).`
        : `Cosmetic component (${original}) not present in damage list. May be pre-existing or incidental.`,
      is_structural: structural,
      risk_level: riskLevel,
    });
  }

  // ── STEP 3: Compute coverage ratios ──────────────────────────────────────
  const totalDamage = normDamage.length;
  const quotedDamageCount = normDamage.filter(nd => {
    return quoteSet.has(nd) || normQuote.some(q => q.includes(nd) || nd.includes(q));
  }).length;

  const coverageRatio = totalDamage > 0 ? quotedDamageCount / totalDamage : 1;
  const structuralCoverageRatio = structuralDamageCount > 0
    ? structuralQuotedCount / structuralDamageCount
    : 1;

  // ── STEP 4: Check if physics zones are covered ────────────────────────────
  const physicsZonesCovered = zones.every(zone => {
    if (zone === "unknown") return true;
    const zoneComponents = (ZONE_EXPECTED_COMPONENTS[zone] ?? []).map(normalise);
    // At least one expected component from this zone must be in the quote
    return zoneComponents.some(ec => quoteSet.has(ec) ||
      normQuote.some(q => q.includes(ec) || ec.includes(q)));
  });

  // ── STEP 5: Determine alignment status ───────────────────────────────────
  const hasHighRiskUnrelated = unrelatedItems.some(u => u.risk_level === "high");
  const hasMediumRiskUnrelated = unrelatedItems.some(u => u.risk_level === "medium");
  const hasCriticalMissing = criticalMissing.length > 0;

  let alignmentStatus: AlignmentStatus;

  if (hasHighRiskUnrelated) {
    // Implausible components → MISALIGNED regardless
    alignmentStatus = "MISALIGNED";
  } else if (hasCriticalMissing && hasMediumRiskUnrelated) {
    // Both structural gaps and unrelated structural items → MISALIGNED
    alignmentStatus = "MISALIGNED";
  } else if (hasCriticalMissing || hasMediumRiskUnrelated) {
    // One or the other → PARTIALLY_ALIGNED
    alignmentStatus = "PARTIALLY_ALIGNED";
  } else if (coverageRatio < 0.7) {
    // Low overall coverage even without structural issues → PARTIALLY_ALIGNED
    alignmentStatus = "PARTIALLY_ALIGNED";
  } else {
    alignmentStatus = "FULLY_ALIGNED";
  }

  // ── STEP 6: Generate engineering comment ─────────────────────────────────
  const engineeringComment = buildEngineeringComment(
    alignmentStatus,
    criticalMissing,
    unrelatedItems,
    zones,
    coverageRatio,
    structuralCoverageRatio
  );

  return {
    alignment_status: alignmentStatus,
    critical_missing: criticalMissing,
    unrelated_items: unrelatedItems,
    engineering_comment: engineeringComment,
    coverage_ratio: Math.round(coverageRatio * 100) / 100,
    structural_coverage_ratio: Math.round(structuralCoverageRatio * 100) / 100,
    physics_zones_covered: physicsZonesCovered,
  };
}

// ─── Engineering comment builder ─────────────────────────────────────────────

function buildEngineeringComment(
  status: AlignmentStatus,
  criticalMissing: CriticalMissingItem[],
  unrelated: UnrelatedItem[],
  zones: string[],
  coverageRatio: number,
  structuralCoverageRatio: number
): string {
  const zoneDesc = zones.includes("multi_zone")
    ? "a chain rear-and-front collision"
    : zones.map(z => z.replace("_", " ")).join(" and ") + " impact";

  if (status === "FULLY_ALIGNED") {
    return `Quote components are mechanically consistent with ${zoneDesc}: all structural load-path components are present and no items outside the expected damage zones were identified. Coverage ratio: ${Math.round(coverageRatio * 100)}%.`;
  }

  if (status === "PARTIALLY_ALIGNED") {
    const parts: string[] = [];
    if (criticalMissing.length > 0) {
      const names = criticalMissing.map(c => c.component).join(", ");
      parts.push(`${criticalMissing.length} structural component(s) present in the damage list are absent from the quote (${names}), creating an incomplete load-path repair`);
    }
    if (unrelated.filter(u => u.risk_level === "medium").length > 0) {
      const names = unrelated.filter(u => u.risk_level === "medium").map(u => u.component).join(", ");
      parts.push(`${unrelated.filter(u => u.risk_level === "medium").length} structural component(s) in the quote cannot be attributed to the ${zoneDesc} mechanism (${names})`);
    }
    if (coverageRatio < 0.7) {
      parts.push(`overall damage coverage is ${Math.round(coverageRatio * 100)}%, below the 70% threshold for full alignment`);
    }
    return `Quote is partially aligned with ${zoneDesc}: ${parts.join("; ")}.`;
  }

  // MISALIGNED
  const parts: string[] = [];
  const highRisk = unrelated.filter(u => u.risk_level === "high");
  if (highRisk.length > 0) {
    const names = highRisk.map(u => u.component).join(", ");
    parts.push(`${highRisk.length} component(s) in the quote (${names}) are mechanically implausible for a single-impact collision and require independent justification`);
  }
  if (criticalMissing.length > 0 && unrelated.some(u => u.risk_level === "medium")) {
    parts.push(`structural components are simultaneously missing from the quote and unrelated structural items are present, indicating the quote may not correspond to the reported accident`);
  }
  return `Quote is mechanically misaligned with ${zoneDesc}: ${parts.join("; ")}.`;
}
