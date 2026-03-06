/**
 * Unit tests for the physics-based hidden damage propagation engine.
 *
 * The engine lives inline in db.ts (inferHiddenDamages) but the logic is
 * mirrored here so it can be tested in isolation without a database.
 */

import { describe, it, expect } from "vitest";

// ─── Mirror of inferHiddenDamages from db.ts ─────────────────────────────────

interface InferredHiddenDamage {
  component: string;
  reason: string;
  probability: number;
  confidenceLabel: "High" | "Medium" | "Low";
  propagationStep: number;
  chain: "front" | "rear" | "side_driver" | "side_passenger" | "rollover" | "general";
  estimatedCostUsd: number;
}

type CanonicalIncidentType = "collision" | "theft" | "fire" | "flood" | "hail" | "vandalism" | "other";

function inferHiddenDamages(
  components: Array<{ name?: string; damageType?: string; severity?: string }>,
  impactPoint: string,
  incidentType: CanonicalIncidentType,
  impactForceKn: number = 0,
  accidentSev: string = "unknown"
): InferredHiddenDamage[] {
  if (incidentType !== "collision") return [];

  const hidden: InferredHiddenDamage[] = [];
  const detected = components.map((c) => (c.name || "").toLowerCase());
  const impact = (impactPoint || "").toLowerCase();

  const hasFront =
    impact.includes("front") ||
    detected.some(
      (n) =>
        n.includes("bumper") ||
        n.includes("bonnet") ||
        n.includes("hood") ||
        n.includes("grille") ||
        n.includes("headlight") ||
        n.includes("fender")
    );
  const hasRear =
    impact.includes("rear") ||
    detected.some(
      (n) =>
        n.includes("boot") ||
        n.includes("trunk") ||
        n.includes("rear bumper") ||
        n.includes("tailgate") ||
        n.includes("tail light")
    );
  const hasSideDriver =
    (impact.includes("side") && (impact.includes("driver") || impact.includes("left"))) ||
    detected.some(
      (n) => (n.includes("driver") || n.includes("left")) && (n.includes("door") || n.includes("sill"))
    );
  const hasSidePassenger =
    (impact.includes("side") && (impact.includes("passenger") || impact.includes("right"))) ||
    detected.some(
      (n) => (n.includes("passenger") || n.includes("right")) && (n.includes("door") || n.includes("sill"))
    );
  const hasSide =
    hasSideDriver ||
    hasSidePassenger ||
    (impact.includes("side") && !hasFront && !hasRear) ||
    detected.some((n) => n.includes("door") || n.includes("sill") || n.includes("quarter panel"));
  const hasRollover = impact.includes("rollover") || accidentSev === "rollover";

  const forceGateKn = 20;
  const highForce = impactForceKn >= forceGateKn;
  const severeForce = impactForceKn >= 40;
  const catastrophic = impactForceKn >= 70 || accidentSev === "catastrophic";

  const alreadyDetected = (...keywords: string[]): boolean =>
    keywords.some((kw) => detected.some((n) => n.includes(kw)));

  const add = (
    chain: InferredHiddenDamage["chain"],
    step: number,
    component: string,
    reason: string,
    probability: number,
    estimatedCostUsd: number
  ) => {
    if (probability < 5) return;
    const confidenceLabel: InferredHiddenDamage["confidenceLabel"] =
      probability >= 70 ? "High" : probability >= 40 ? "Medium" : "Low";
    hidden.push({ component, reason, probability, confidenceLabel, propagationStep: step, chain, estimatedCostUsd });
  };

  // ── Front impact chain ──────────────────────────────────────────────────
  if (hasFront) {
    if (!alreadyDetected("crash bar", "bumper beam", "front beam"))
      add("front", 1, "Front crash bar / bumper beam", "First structural energy absorber", 82, 280);

    if (!alreadyDetected("radiator support", "subframe", "front subframe"))
      add("front", 2, "Radiator support / front subframe", "Force propagates from crash bar", highForce ? 78 : 62, 420);

    if (!alreadyDetected("radiator"))
      add("front", 3, "Radiator", "Cooling unit behind radiator support", highForce ? 72 : 55, 350);

    if (!alreadyDetected("condenser", "ac condenser"))
      add("front", 3, "AC condenser", "Mounted alongside radiator", highForce ? 68 : 48, 290);

    if (highForce && !alreadyDetected("engine mount"))
      add("front", 4, "Engine mounts", "Absorbs residual structural loads", severeForce ? 74 : 58, 320);

    if (severeForce && !alreadyDetected("steering rack", "steering column", "rack"))
      add("front", 5, "Steering rack / column", "Severe impact displaces steering geometry", 52, 480);

    if (catastrophic && !alreadyDetected("transmission", "gearbox"))
      add("front", 5, "Transmission / gearbox mounts", "Catastrophic impact displaces powertrain", 45, 600);
  }

  // ── Rear impact chain ───────────────────────────────────────────────────
  if (hasRear) {
    if (!alreadyDetected("rear bumper beam", "rear beam", "rear reinforcement"))
      add("rear", 1, "Rear bumper reinforcement bar", "First structural absorber in rear impacts", 80, 220);

    if (!alreadyDetected("boot floor", "trunk floor", "boot panel"))
      add("rear", 2, "Boot floor / trunk floor", "Force propagates into boot floor", highForce ? 74 : 55, 380);

    if (!alreadyDetected("chassis rail", "rear rail", "rear frame"))
      add("rear", 3, "Rear chassis rails", "Absorbs residual energy after boot floor", highForce ? 70 : 45, 550);

    if (highForce && !alreadyDetected("fuel tank", "fuel", "tank"))
      add("rear", 4, "Fuel tank / filler neck", "Impact deforms fuel tank brackets", 58, 420);

    if (severeForce && !alreadyDetected("differential", "rear axle", "axle"))
      add("rear", 5, "Rear differential / axle geometry", "High-energy rear impact misaligns axle", 48, 520);
  }

  // ── Side impact chain ───────────────────────────────────────────────────
  if (hasSide) {
    const side = hasSideDriver ? "driver" : hasSidePassenger ? "passenger" : "impact";
    const sideChain: InferredHiddenDamage["chain"] = hasSideDriver ? "side_driver" : "side_passenger";

    if (!alreadyDetected("intrusion beam", "side impact beam", "door beam"))
      add(sideChain, 1, `Door intrusion beam (${side} side)`, "First structural absorber in lateral collisions", 78, 200);

    if (!alreadyDetected("b-pillar", "b pillar"))
      add(sideChain, 2, `B-pillar (${side} side)`, "Force propagates from door into B-pillar", highForce ? 72 : 55, 650);

    if (!alreadyDetected("floor structure", "rocker", "sill beam"))
      add(sideChain, 3, "Floor structure / rocker sill", "Lateral loads transfer to floor structure", highForce ? 65 : 42, 480);

    if (severeForce && !alreadyDetected("a-pillar", "a pillar", "roof rail"))
      add(sideChain, 4, `A-pillar / roof rail (${side} side)`, "Severe lateral force propagates to A-pillar", 50, 720);
  }

  // ── Rollover chain ──────────────────────────────────────────────────────
  if (hasRollover) {
    if (!alreadyDetected("roof structure", "roof panel"))
      add("general", 1, "Roof structure / pillars", "Compressive loading on all pillars", 85, 900);
    if (!alreadyDetected("windshield", "windscreen"))
      add("general", 2, "Windshield / rear glass", "Typically shattered during rollover", 75, 350);
  }

  // ── General high-energy propagation ────────────────────────────────────
  if (highForce) {
    if (!alreadyDetected("wheel alignment", "suspension geometry", "alignment"))
      add("general", 1, "Wheel alignment / suspension geometry", "Structural deformation affects suspension", 88, 130);
    if (!alreadyDetected("wiring harness", "wiring", "harness"))
      add("general", 2, "Wiring harness (impact zone)", "Impact can pinch or sever wiring harnesses", 58, 220);
  }

  hidden.sort((a, b) => b.probability - a.probability || a.propagationStep - b.propagationStep);
  return hidden;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Non-collision incidents → no hidden damage inferred", () => {
  it("theft → empty", () => expect(inferHiddenDamages([], "front", "theft")).toHaveLength(0));
  it("fire → empty", () => expect(inferHiddenDamages([], "front", "fire")).toHaveLength(0));
  it("flood → empty", () => expect(inferHiddenDamages([], "rear", "flood")).toHaveLength(0));
});

describe("Front impact propagation chain", () => {
  it("Step 1: crash bar is always inferred for front impact", () => {
    const result = inferHiddenDamages([], "front", "collision", 10);
    const crashBar = result.find(h => h.component.includes("crash bar"));
    expect(crashBar).toBeDefined();
    expect(crashBar!.propagationStep).toBe(1);
    expect(crashBar!.chain).toBe("front");
    expect(crashBar!.probability).toBe(82);
    expect(crashBar!.confidenceLabel).toBe("High");
  });

  it("Step 2: radiator support is inferred for front impact", () => {
    const result = inferHiddenDamages([], "front", "collision", 10);
    const support = result.find(h => h.component.includes("Radiator support"));
    expect(support).toBeDefined();
    expect(support!.propagationStep).toBe(2);
  });

  it("Step 2 probability is higher when force > 20 kN", () => {
    const low  = inferHiddenDamages([], "front", "collision", 10).find(h => h.component.includes("Radiator support"))!;
    const high = inferHiddenDamages([], "front", "collision", 25).find(h => h.component.includes("Radiator support"))!;
    expect(high.probability).toBeGreaterThan(low.probability);
  });

  it("Step 3: radiator and AC condenser are inferred", () => {
    const result = inferHiddenDamages([], "front", "collision", 10);
    const radiator = result.find(h => h.component === "Radiator");
    const condenser = result.find(h => h.component === "AC condenser");
    expect(radiator).toBeDefined();
    expect(condenser).toBeDefined();
    expect(radiator!.propagationStep).toBe(3);
    expect(condenser!.propagationStep).toBe(3);
  });

  it("Step 4: engine mounts only appear when force > 20 kN", () => {
    const below = inferHiddenDamages([], "front", "collision", 15);
    const above = inferHiddenDamages([], "front", "collision", 25);
    expect(below.find(h => h.component.includes("Engine mount"))).toBeUndefined();
    expect(above.find(h => h.component.includes("Engine mount"))).toBeDefined();
  });

  it("Step 5: steering rack only appears when force >= 40 kN", () => {
    const below = inferHiddenDamages([], "front", "collision", 35);
    const above = inferHiddenDamages([], "front", "collision", 45);
    expect(below.find(h => h.component.includes("Steering rack"))).toBeUndefined();
    expect(above.find(h => h.component.includes("Steering rack"))).toBeDefined();
  });

  it("Transmission mounts only appear at catastrophic force (>= 70 kN)", () => {
    const below = inferHiddenDamages([], "front", "collision", 65);
    const above = inferHiddenDamages([], "front", "collision", 75);
    expect(below.find(h => h.component.includes("Transmission"))).toBeUndefined();
    expect(above.find(h => h.component.includes("Transmission"))).toBeDefined();
  });

  it("Already-detected components are not re-inferred", () => {
    const components = [{ name: "Radiator" }, { name: "AC condenser" }];
    const result = inferHiddenDamages(components, "front", "collision", 25);
    expect(result.find(h => h.component === "Radiator")).toBeUndefined();
    expect(result.find(h => h.component === "AC condenser")).toBeUndefined();
  });
});

describe("Rear impact propagation chain", () => {
  it("Step 1: rear bumper reinforcement is always inferred", () => {
    const result = inferHiddenDamages([], "rear", "collision", 10);
    const bar = result.find(h => h.component.includes("Rear bumper reinforcement"));
    expect(bar).toBeDefined();
    expect(bar!.propagationStep).toBe(1);
    expect(bar!.chain).toBe("rear");
  });

  it("Step 2: boot floor is inferred", () => {
    const result = inferHiddenDamages([], "rear", "collision", 10);
    expect(result.find(h => h.component.includes("Boot floor"))).toBeDefined();
  });

  it("Step 3: rear chassis rails are inferred", () => {
    const result = inferHiddenDamages([], "rear", "collision", 10);
    expect(result.find(h => h.component.includes("Rear chassis rails"))).toBeDefined();
  });

  it("Step 4: fuel tank only appears when force > 20 kN", () => {
    const below = inferHiddenDamages([], "rear", "collision", 15);
    const above = inferHiddenDamages([], "rear", "collision", 25);
    expect(below.find(h => h.component.includes("Fuel tank"))).toBeUndefined();
    expect(above.find(h => h.component.includes("Fuel tank"))).toBeDefined();
  });

  it("Step 5: rear differential only appears at severe force (>= 40 kN)", () => {
    const below = inferHiddenDamages([], "rear", "collision", 35);
    const above = inferHiddenDamages([], "rear", "collision", 45);
    expect(below.find(h => h.component.includes("differential"))).toBeUndefined();
    expect(above.find(h => h.component.includes("differential"))).toBeDefined();
  });
});

describe("Side impact propagation chain", () => {
  it("Step 1: door intrusion beam is always inferred for side impact", () => {
    const result = inferHiddenDamages([], "side", "collision", 10);
    const beam = result.find(h => h.component.includes("intrusion beam"));
    expect(beam).toBeDefined();
    expect(beam!.propagationStep).toBe(1);
  });

  it("Driver-side chain uses side_driver", () => {
    const result = inferHiddenDamages([], "side driver", "collision", 10);
    const beam = result.find(h => h.component.includes("intrusion beam"));
    expect(beam?.chain).toBe("side_driver");
  });

  it("Passenger-side chain uses side_passenger", () => {
    const result = inferHiddenDamages([], "side passenger", "collision", 10);
    const beam = result.find(h => h.component.includes("intrusion beam"));
    expect(beam?.chain).toBe("side_passenger");
  });

  it("Step 2: B-pillar is inferred", () => {
    const result = inferHiddenDamages([], "side", "collision", 10);
    expect(result.find(h => h.component.includes("B-pillar"))).toBeDefined();
  });

  it("Step 4: A-pillar only appears at severe force (>= 40 kN)", () => {
    const below = inferHiddenDamages([], "side", "collision", 35);
    const above = inferHiddenDamages([], "side", "collision", 45);
    expect(below.find(h => h.component.includes("A-pillar"))).toBeUndefined();
    expect(above.find(h => h.component.includes("A-pillar"))).toBeDefined();
  });
});

describe("General high-energy propagation (force-gated at 20 kN)", () => {
  it("Wheel alignment NOT inferred below 20 kN", () => {
    const result = inferHiddenDamages([], "front", "collision", 15);
    expect(result.find(h => h.component.includes("alignment"))).toBeUndefined();
  });

  it("Wheel alignment IS inferred above 20 kN", () => {
    const result = inferHiddenDamages([], "front", "collision", 25);
    const item = result.find(h => h.component.includes("alignment"));
    expect(item).toBeDefined();
    expect(item!.probability).toBe(88);
    expect(item!.confidenceLabel).toBe("High");
  });

  it("Wiring harness IS inferred above 20 kN", () => {
    const result = inferHiddenDamages([], "front", "collision", 25);
    expect(result.find(h => h.component.includes("Wiring harness"))).toBeDefined();
  });
});

describe("Probability scoring and confidence labels", () => {
  it("probability >= 70 → High confidence", () => {
    const result = inferHiddenDamages([], "front", "collision", 10);
    const high = result.filter(h => h.confidenceLabel === "High");
    expect(high.every(h => h.probability >= 70)).toBe(true);
  });

  it("probability 40–69 → Medium confidence", () => {
    const result = inferHiddenDamages([], "front", "collision", 10);
    const medium = result.filter(h => h.confidenceLabel === "Medium");
    expect(medium.every(h => h.probability >= 40 && h.probability < 70)).toBe(true);
  });

  it("probability < 40 → Low confidence", () => {
    const result = inferHiddenDamages([], "front", "collision", 10);
    const low = result.filter(h => h.confidenceLabel === "Low");
    expect(low.every(h => h.probability < 40)).toBe(true);
  });

  it("results are sorted by probability descending", () => {
    const result = inferHiddenDamages([], "front", "collision", 50);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].probability).toBeLessThanOrEqual(result[i - 1].probability);
    }
  });
});

describe("Rollover chain", () => {
  it("Roof structure is inferred for rollover", () => {
    const result = inferHiddenDamages([], "rollover", "collision", 0, "rollover");
    expect(result.find(h => h.component.includes("Roof structure"))).toBeDefined();
  });

  it("Windshield is inferred for rollover", () => {
    const result = inferHiddenDamages([], "rollover", "collision", 0, "rollover");
    expect(result.find(h => h.component.includes("Windshield"))).toBeDefined();
  });
});

describe("Impact detection from damaged components", () => {
  it("Hood in components → triggers front chain", () => {
    const result = inferHiddenDamages([{ name: "Hood" }], "", "collision", 10);
    expect(result.find(h => h.chain === "front")).toBeDefined();
  });

  it("Boot in components → triggers rear chain", () => {
    const result = inferHiddenDamages([{ name: "Boot lid" }], "", "collision", 10);
    expect(result.find(h => h.chain === "rear")).toBeDefined();
  });

  it("Driver door in components → triggers side_driver chain", () => {
    const result = inferHiddenDamages([{ name: "Driver door" }], "", "collision", 10);
    expect(result.find(h => h.chain === "side_driver")).toBeDefined();
  });
});
