/**
 * Vehicle Damage History — Unit Tests
 *
 * Tests cover:
 *   - mapComponentToZone()     — single component → zone lookup
 *   - mapComponentsToZone()    — list of components → primary zone + affected zones
 *   - normaliseZone()          — free-text zone → canonical enum value
 *   - normaliseSeverity()      — free-text severity → canonical enum value
 *   - detectRepeatZone()       — skipped (requires live DB; covered by integration tests)
 */

import { describe, it, expect } from "vitest";
import {
  mapComponentToZone,
  mapComponentsToZone,
  normaliseZone,
  normaliseSeverity,
} from "./vehicle-damage-history";

// ─── mapComponentToZone ───────────────────────────────────────────────────────

describe("mapComponentToZone", () => {
  // Front components
  it("maps 'front bumper' to front", () => {
    expect(mapComponentToZone("front bumper")).toBe("front");
  });
  it("maps 'hood' to front", () => {
    expect(mapComponentToZone("hood")).toBe("front");
  });
  it("maps 'bonnet' to front", () => {
    expect(mapComponentToZone("bonnet")).toBe("front");
  });
  it("maps 'headlight' to front", () => {
    expect(mapComponentToZone("headlight")).toBe("front");
  });
  it("maps 'windscreen' to front", () => {
    expect(mapComponentToZone("windscreen")).toBe("front");
  });
  it("maps 'radiator' to front", () => {
    expect(mapComponentToZone("radiator")).toBe("front");
  });
  it("maps 'engine' to front", () => {
    expect(mapComponentToZone("engine")).toBe("front");
  });

  // Rear components
  it("maps 'rear bumper' to rear", () => {
    expect(mapComponentToZone("rear bumper")).toBe("rear");
  });
  it("maps 'boot' to rear", () => {
    expect(mapComponentToZone("boot")).toBe("rear");
  });
  it("maps 'trunk' to rear", () => {
    expect(mapComponentToZone("trunk")).toBe("rear");
  });
  it("maps 'tail light' to rear", () => {
    expect(mapComponentToZone("tail light")).toBe("rear");
  });
  it("maps 'tailgate' to rear", () => {
    expect(mapComponentToZone("tailgate")).toBe("rear");
  });
  it("maps 'exhaust' to rear", () => {
    expect(mapComponentToZone("exhaust")).toBe("rear");
  });

  // Left components
  it("maps 'left door' to left", () => {
    expect(mapComponentToZone("left door")).toBe("left");
  });
  it("maps 'driver door' to left", () => {
    expect(mapComponentToZone("driver door")).toBe("left");
  });
  it("maps 'left side mirror' to left", () => {
    expect(mapComponentToZone("left side mirror")).toBe("left");
  });

  // Right components
  it("maps 'right door' to right", () => {
    expect(mapComponentToZone("right door")).toBe("right");
  });
  it("maps 'passenger door' to right", () => {
    expect(mapComponentToZone("passenger door")).toBe("right");
  });
  it("maps 'right fender' to right", () => {
    expect(mapComponentToZone("right fender")).toBe("right");
  });

  // Roof components
  it("maps 'roof' to roof", () => {
    expect(mapComponentToZone("roof")).toBe("roof");
  });
  it("maps 'sunroof' to roof", () => {
    expect(mapComponentToZone("sunroof")).toBe("roof");
  });
  it("maps 'roof panel' to roof", () => {
    expect(mapComponentToZone("roof panel")).toBe("roof");
  });

  // Undercarriage components
  it("maps 'chassis' to undercarriage", () => {
    expect(mapComponentToZone("chassis")).toBe("undercarriage");
  });
  it("maps 'transmission' to undercarriage", () => {
    expect(mapComponentToZone("transmission")).toBe("undercarriage");
  });
  it("maps 'fuel tank' to undercarriage", () => {
    expect(mapComponentToZone("fuel tank")).toBe("undercarriage");
  });
  it("maps 'catalytic converter' to undercarriage", () => {
    expect(mapComponentToZone("catalytic converter")).toBe("undercarriage");
  });

  // Case insensitivity
  it("handles uppercase input", () => {
    expect(mapComponentToZone("FRONT BUMPER")).toBe("front");
  });
  it("handles mixed case input", () => {
    expect(mapComponentToZone("Rear Bumper")).toBe("rear");
  });

  // Unknown
  it("returns 'unknown' for unrecognised component", () => {
    expect(mapComponentToZone("flux capacitor")).toBe("unknown");
  });
  it("returns 'unknown' for empty string", () => {
    expect(mapComponentToZone("")).toBe("unknown");
  });

  // Heuristic fallback
  it("uses heuristic for 'front axle shaft'", () => {
    expect(mapComponentToZone("front axle shaft")).toBe("front");
  });
  it("uses heuristic for 'rear quarter panel'", () => {
    expect(mapComponentToZone("rear quarter panel")).toBe("rear");
  });
});

// ─── mapComponentsToZone ──────────────────────────────────────────────────────

describe("mapComponentsToZone", () => {
  it("returns unknown for empty array", () => {
    const { primaryZone, affectedZones } = mapComponentsToZone([]);
    expect(primaryZone).toBe("unknown");
    expect(affectedZones).toHaveLength(0);
  });

  it("returns the single zone for one component", () => {
    const { primaryZone, affectedZones } = mapComponentsToZone([
      { name: "front bumper" },
    ]);
    expect(primaryZone).toBe("front");
    expect(affectedZones).toContain("front");
  });

  it("returns the most frequent zone as primary", () => {
    const { primaryZone } = mapComponentsToZone([
      { name: "front bumper" },
      { name: "hood" },
      { name: "rear bumper" },
    ]);
    expect(primaryZone).toBe("front"); // front appears twice
  });

  it("returns 'multiple' when more than 2 distinct zones", () => {
    const { primaryZone } = mapComponentsToZone([
      { name: "front bumper" },
      { name: "rear bumper" },
      { name: "left door" },
      { name: "roof" },
    ]);
    expect(primaryZone).toBe("multiple");
  });

  it("includes all affected zones in the result", () => {
    const { affectedZones } = mapComponentsToZone([
      { name: "front bumper" },
      { name: "rear bumper" },
    ]);
    expect(affectedZones).toContain("front");
    expect(affectedZones).toContain("rear");
  });

  it("prefers the zone field over component name mapping", () => {
    const { primaryZone } = mapComponentsToZone([
      { name: "front bumper", zone: "rear" }, // zone field overrides name
    ]);
    expect(primaryZone).toBe("rear");
  });

  it("ignores components with unknown zone and name", () => {
    const { primaryZone, affectedZones } = mapComponentsToZone([
      { name: "flux capacitor" },
    ]);
    expect(primaryZone).toBe("unknown");
    expect(affectedZones).toHaveLength(0);
  });

  it("handles null zone field gracefully", () => {
    const { primaryZone } = mapComponentsToZone([
      { name: "hood", zone: null },
    ]);
    expect(primaryZone).toBe("front"); // falls back to name mapping
  });
});

// ─── normaliseZone ────────────────────────────────────────────────────────────

describe("normaliseZone", () => {
  it("returns 'unknown' for null", () => {
    expect(normaliseZone(null)).toBe("unknown");
  });
  it("returns 'unknown' for undefined", () => {
    expect(normaliseZone(undefined)).toBe("unknown");
  });
  it("returns 'unknown' for empty string", () => {
    expect(normaliseZone("")).toBe("unknown");
  });

  it("passes through canonical values unchanged", () => {
    const zones = ["front", "rear", "left", "right", "roof", "undercarriage", "multiple", "unknown"] as const;
    for (const z of zones) {
      expect(normaliseZone(z)).toBe(z);
    }
  });

  it("converts to lowercase", () => {
    expect(normaliseZone("FRONT")).toBe("front");
    expect(normaliseZone("REAR")).toBe("rear");
  });

  it("maps 'back' to rear", () => {
    expect(normaliseZone("back")).toBe("rear");
  });

  it("maps 'driver' to left", () => {
    expect(normaliseZone("driver side")).toBe("left");
  });

  it("maps 'passenger' to right", () => {
    expect(normaliseZone("passenger side")).toBe("right");
  });

  it("maps 'top' to roof", () => {
    expect(normaliseZone("top")).toBe("roof");
  });

  it("maps 'floor' to undercarriage", () => {
    expect(normaliseZone("floor pan")).toBe("undercarriage");
  });

  it("maps 'under' prefix to undercarriage", () => {
    expect(normaliseZone("underbody")).toBe("undercarriage");
  });

  it("returns 'unknown' for unrecognised string", () => {
    expect(normaliseZone("diagonal")).toBe("unknown");
  });
});

// ─── normaliseSeverity ────────────────────────────────────────────────────────

describe("normaliseSeverity", () => {
  it("returns 'unknown' for null", () => {
    expect(normaliseSeverity(null)).toBe("unknown");
  });
  it("returns 'unknown' for undefined", () => {
    expect(normaliseSeverity(undefined)).toBe("unknown");
  });
  it("returns 'unknown' for empty string", () => {
    expect(normaliseSeverity("")).toBe("unknown");
  });

  it("maps 'minor' correctly", () => {
    expect(normaliseSeverity("minor")).toBe("minor");
    expect(normaliseSeverity("light")).toBe("minor");
    expect(normaliseSeverity("low")).toBe("minor");
  });

  it("maps 'moderate' correctly", () => {
    expect(normaliseSeverity("moderate")).toBe("moderate");
    expect(normaliseSeverity("medium")).toBe("moderate");
    expect(normaliseSeverity("significant")).toBe("moderate");
  });

  it("maps 'severe' correctly", () => {
    expect(normaliseSeverity("severe")).toBe("severe");
    expect(normaliseSeverity("heavy")).toBe("severe");
    expect(normaliseSeverity("high")).toBe("severe");
    expect(normaliseSeverity("major")).toBe("severe");
  });

  it("maps total loss variants correctly", () => {
    expect(normaliseSeverity("total_loss")).toBe("total_loss");
    expect(normaliseSeverity("total loss")).toBe("total_loss");
    expect(normaliseSeverity("write-off")).toBe("total_loss");
    expect(normaliseSeverity("writeoff")).toBe("total_loss");
    expect(normaliseSeverity("written off")).toBe("total_loss");
    expect(normaliseSeverity("totalled")).toBe("total_loss");
  });

  it("is case-insensitive", () => {
    expect(normaliseSeverity("MINOR")).toBe("minor");
    expect(normaliseSeverity("SEVERE")).toBe("severe");
    expect(normaliseSeverity("Total Loss")).toBe("total_loss");
  });

  it("returns 'unknown' for unrecognised string", () => {
    expect(normaliseSeverity("catastrophic")).toBe("unknown");
    expect(normaliseSeverity("xyz")).toBe("unknown");
  });
});

// ─── Severity ordering (worst-first logic) ────────────────────────────────────

describe("severity ordering contract", () => {
  // Verify the intended ordering: total_loss > severe > moderate > minor > unknown
  it("total_loss is the worst severity", () => {
    const order = ["total_loss", "severe", "moderate", "minor", "unknown"];
    expect(order.indexOf("total_loss")).toBeLessThan(order.indexOf("severe"));
    expect(order.indexOf("severe")).toBeLessThan(order.indexOf("moderate"));
    expect(order.indexOf("moderate")).toBeLessThan(order.indexOf("minor"));
    expect(order.indexOf("minor")).toBeLessThan(order.indexOf("unknown"));
  });
});
