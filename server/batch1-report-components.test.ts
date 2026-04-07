/**
 * Batch 1 Report Components — Unit Tests
 *
 * Tests the pure helper logic extracted from Batch1ReportComponents.tsx
 * (zone classification, severity mapping, pattern matching, decision colour)
 * without requiring a DOM environment.
 */

import { describe, it, expect } from "vitest";

// ─── Replicate helpers under test ─────────────────────────────────────────────

const ZONE_KEYWORDS: Record<string, string[]> = {
  front: ["front", "bonnet", "hood", "bumper", "grille", "headlight", "radiator", "fender_front", "wing_front"],
  rear: ["rear", "boot", "trunk", "tail", "back bumper", "tailgate", "tow"],
  left: ["left", "driver", "offside", "door_left", "mirror_left", "wing_left", "fender_left"],
  right: ["right", "passenger", "nearside", "door_right", "mirror_right", "wing_right", "fender_right"],
  roof: ["roof", "sunroof", "windscreen", "windshield", "a-pillar", "b-pillar"],
  underbody: ["underbody", "chassis", "axle", "suspension", "exhaust", "sump"],
};

function classifyZone(component: string): string {
  const lc = component.toLowerCase();
  for (const [zone, keywords] of Object.entries(ZONE_KEYWORDS)) {
    if (keywords.some((k) => lc.includes(k))) return zone;
  }
  return "front";
}

type Severity = "severe" | "moderate" | "minor" | "none";

function severityFromLabel(label: string): Severity {
  const lc = (label ?? "").toLowerCase();
  if (lc.includes("severe") || lc.includes("major") || lc.includes("critical")) return "severe";
  if (lc.includes("moderate") || lc.includes("medium")) return "moderate";
  if (lc.includes("minor") || lc.includes("light") || lc.includes("low")) return "minor";
  return "moderate";
}

function decisionColour(d: string): { bg: string; text: string; border: string } {
  const u = (d ?? "").toUpperCase();
  if (u === "ESCALATE" || u === "REJECT")
    return { bg: "#991B1B", text: "#FFFFFF", border: "#7F1D1D" };
  if (u === "REVIEW")
    return { bg: "#D97706", text: "#FFFFFF", border: "#B45309" };
  if (u === "APPROVE")
    return { bg: "#059669", text: "#FFFFFF", border: "#047857" };
  return { bg: "#475569", text: "#FFFFFF", border: "#334155" };
}

function formatCurrency(v: number | null | undefined): string {
  if (v == null || isNaN(v)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(v);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("classifyZone", () => {
  it("maps bonnet to front", () => {
    expect(classifyZone("Bonnet")).toBe("front");
  });

  it("maps front bumper to front", () => {
    expect(classifyZone("Front Bumper")).toBe("front");
  });

  it("maps boot lid to rear", () => {
    expect(classifyZone("Boot Lid")).toBe("rear");
  });

  it("maps tailgate to rear", () => {
    expect(classifyZone("Tailgate")).toBe("rear");
  });

  it("maps driver door to left", () => {
    expect(classifyZone("Driver Door")).toBe("left");
  });

  it("maps passenger window to right", () => {
    expect(classifyZone("Passenger Window")).toBe("right");
  });

  it("maps windscreen to roof", () => {
    expect(classifyZone("Windscreen")).toBe("roof");
  });

  it("maps suspension to underbody", () => {
    expect(classifyZone("Suspension Arm")).toBe("underbody");
  });

  it("defaults unknown component to front", () => {
    expect(classifyZone("Unknown Component XYZ")).toBe("front");
  });

  it("is case-insensitive", () => {
    expect(classifyZone("RADIATOR")).toBe("front");
    expect(classifyZone("ROOF")).toBe("roof");
  });
});

describe("severityFromLabel", () => {
  it("returns severe for 'severe'", () => {
    expect(severityFromLabel("severe")).toBe("severe");
  });

  it("returns severe for 'major'", () => {
    expect(severityFromLabel("major damage")).toBe("severe");
  });

  it("returns severe for 'critical'", () => {
    expect(severityFromLabel("critical")).toBe("severe");
  });

  it("returns moderate for 'moderate'", () => {
    expect(severityFromLabel("moderate")).toBe("moderate");
  });

  it("returns moderate for 'medium'", () => {
    expect(severityFromLabel("medium impact")).toBe("moderate");
  });

  it("returns minor for 'minor'", () => {
    expect(severityFromLabel("minor scratch")).toBe("minor");
  });

  it("returns minor for 'light'", () => {
    expect(severityFromLabel("light damage")).toBe("minor");
  });

  it("returns minor for 'low'", () => {
    expect(severityFromLabel("low severity")).toBe("minor");
  });

  it("defaults to moderate for empty string", () => {
    expect(severityFromLabel("")).toBe("moderate");
  });

  it("defaults to moderate for unknown label", () => {
    expect(severityFromLabel("unknown")).toBe("moderate");
  });
});

describe("decisionColour", () => {
  it("returns red palette for ESCALATE", () => {
    const c = decisionColour("ESCALATE");
    expect(c.bg).toBe("#991B1B");
    expect(c.text).toBe("#FFFFFF");
  });

  it("returns red palette for REJECT", () => {
    const c = decisionColour("REJECT");
    expect(c.bg).toBe("#991B1B");
  });

  it("returns amber palette for REVIEW", () => {
    const c = decisionColour("REVIEW");
    expect(c.bg).toBe("#D97706");
  });

  it("returns green palette for APPROVE", () => {
    const c = decisionColour("APPROVE");
    expect(c.bg).toBe("#059669");
  });

  it("returns neutral palette for unknown decision", () => {
    const c = decisionColour("UNKNOWN");
    expect(c.bg).toBe("#475569");
  });

  it("is case-insensitive", () => {
    expect(decisionColour("approve").bg).toBe("#059669");
    expect(decisionColour("review").bg).toBe("#D97706");
  });
});

describe("formatCurrency", () => {
  it("formats a positive number as USD", () => {
    expect(formatCurrency(1234.56)).toBe("$1,234.56");
  });

  it("returns em-dash for null", () => {
    expect(formatCurrency(null)).toBe("—");
  });

  it("returns em-dash for undefined", () => {
    expect(formatCurrency(undefined)).toBe("—");
  });

  it("returns em-dash for NaN", () => {
    expect(formatCurrency(NaN)).toBe("—");
  });

  it("formats zero correctly", () => {
    expect(formatCurrency(0)).toBe("$0.00");
  });
});

describe("zone severity ranking", () => {
  const severityRank: Record<Severity, number> = { none: 0, minor: 1, moderate: 2, severe: 3 };

  it("severe outranks moderate", () => {
    expect(severityRank["severe"]).toBeGreaterThan(severityRank["moderate"]);
  });

  it("moderate outranks minor", () => {
    expect(severityRank["moderate"]).toBeGreaterThan(severityRank["minor"]);
  });

  it("minor outranks none", () => {
    expect(severityRank["minor"]).toBeGreaterThan(severityRank["none"]);
  });

  it("zone map correctly takes highest severity when multiple components in same zone", () => {
    const components = [
      { name: "Front Bumper", severity: "minor" },
      { name: "Bonnet", severity: "severe" },
      { name: "Radiator", severity: "moderate" },
    ];

    const zoneMap: Record<string, Severity> = {
      front: "none",
      rear: "none",
      left: "none",
      right: "none",
      roof: "none",
      underbody: "none",
    };

    for (const comp of components) {
      const zone = classifyZone(comp.name);
      const sev = severityFromLabel(comp.severity);
      if (severityRank[sev] > severityRank[zoneMap[zone] as Severity]) {
        zoneMap[zone] = sev;
      }
    }

    expect(zoneMap.front).toBe("severe");
    expect(zoneMap.rear).toBe("none");
  });
});
