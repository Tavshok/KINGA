/**
 * inferCollisionDirection.test.ts
 *
 * Unit tests for the NLP-based collision direction inference logic
 * embedded in stage-5-assembly.ts.
 *
 * We inline the helpers here so we can unit-test them in isolation
 * without importing the full stage module.
 */
import { describe, it, expect } from "vitest";

type CollisionDirection =
  | "frontal" | "rear" | "side_driver" | "side_passenger"
  | "rollover" | "multi_impact" | "unknown";

function classifyCollisionDirection(raw: string): CollisionDirection {
  const r = (raw || "").toLowerCase().trim();
  if (r === "frontal" || r === "front" || r === "head-on" || r === "head_on") return "frontal";
  if (r === "rear" || r === "rear-end" || r === "rear_end") return "rear";
  if (r === "side_driver" || r === "driver_side" || r === "left") return "side_driver";
  if (r === "side_passenger" || r === "passenger_side" || r === "right") return "side_passenger";
  if (r === "rollover" || r === "roll_over" || r === "overturn") return "rollover";
  if (r === "multi_impact" || r === "multiple" || r === "multi") return "multi_impact";
  return "unknown";
}

function inferCollisionDirectionFromDescription(description: string): CollisionDirection {
  const d = (description || "").toLowerCase();
  if (d.includes("roll") || d.includes("overturn") || d.includes("flip") ||
      d.includes("topple") || d.includes("capsize")) return "rollover";
  if (d.includes("rear") || d.includes("behind") || d.includes("from behind") ||
      d.includes("back of") || d.includes("tailgat")) return "rear";
  if (d.includes("driver side") || d.includes("left side") ||
      d.includes("driver's side") || d.includes("scratched on the left") ||
      d.includes("hit on the left")) return "side_driver";
  if (d.includes("passenger side") || d.includes("right side") ||
      d.includes("passenger's side") || d.includes("scratched on the right") ||
      d.includes("hit on the right")) return "side_passenger";
  if (d.includes("bull bar") || d.includes("bonnet") || d.includes("front") ||
      d.includes("head-on") || d.includes("head on") || d.includes("windscreen") ||
      d.includes("windshield") || d.includes("grille") || d.includes("bumper") ||
      d.includes("cow") || d.includes("goat") || d.includes("donkey") ||
      d.includes("animal") || d.includes("livestock") ||
      d.includes("tree") || d.includes("pole") || d.includes("wall") ||
      d.includes("fence") || d.includes("ditch") || d.includes("pothole")) return "frontal";
  return "unknown";
}

describe("classifyCollisionDirection", () => {
  it("maps 'frontal' -> 'frontal'", () => expect(classifyCollisionDirection("frontal")).toBe("frontal"));
  it("maps 'front' -> 'frontal'", () => expect(classifyCollisionDirection("front")).toBe("frontal"));
  it("maps 'head-on' -> 'frontal'", () => expect(classifyCollisionDirection("head-on")).toBe("frontal"));
  it("maps 'rear' -> 'rear'", () => expect(classifyCollisionDirection("rear")).toBe("rear"));
  it("maps 'rear-end' -> 'rear'", () => expect(classifyCollisionDirection("rear-end")).toBe("rear"));
  it("maps 'side_driver' -> 'side_driver'", () => expect(classifyCollisionDirection("side_driver")).toBe("side_driver"));
  it("maps 'left' -> 'side_driver'", () => expect(classifyCollisionDirection("left")).toBe("side_driver"));
  it("maps 'side_passenger' -> 'side_passenger'", () => expect(classifyCollisionDirection("side_passenger")).toBe("side_passenger"));
  it("maps 'right' -> 'side_passenger'", () => expect(classifyCollisionDirection("right")).toBe("side_passenger"));
  it("maps 'rollover' -> 'rollover'", () => expect(classifyCollisionDirection("rollover")).toBe("rollover"));
  it("maps 'multi_impact' -> 'multi_impact'", () => expect(classifyCollisionDirection("multi_impact")).toBe("multi_impact"));
  it("returns 'unknown' for null-ish input", () => expect(classifyCollisionDirection("")).toBe("unknown"));
  it("returns 'unknown' for unrecognised value", () => expect(classifyCollisionDirection("xyz")).toBe("unknown"));
});

describe("inferCollisionDirectionFromDescription", () => {
  // Rollover
  it("infers 'rollover' from 'vehicle rolled over'", () =>
    expect(inferCollisionDirectionFromDescription("vehicle rolled over")).toBe("rollover"));
  it("infers 'rollover' from 'car overturned on gravel'", () =>
    expect(inferCollisionDirectionFromDescription("car overturned on gravel")).toBe("rollover"));
  it("infers 'rollover' from 'vehicle flipped'", () =>
    expect(inferCollisionDirectionFromDescription("vehicle flipped")).toBe("rollover"));

  // Rear
  it("infers 'rear' from 'hit from behind'", () =>
    expect(inferCollisionDirectionFromDescription("hit from behind")).toBe("rear"));
  it("infers 'rear' from 'rear-ended at traffic light'", () =>
    expect(inferCollisionDirectionFromDescription("rear-ended at traffic light")).toBe("rear"));
  it("infers 'rear' from 'vehicle behind crashed into back of my car'", () =>
    expect(inferCollisionDirectionFromDescription("vehicle behind crashed into back of my car")).toBe("rear"));

  // Side driver
  it("infers 'side_driver' from 'hit on the left side'", () =>
    expect(inferCollisionDirectionFromDescription("hit on the left side")).toBe("side_driver"));
  it("infers 'side_driver' from 'damage on driver side'", () =>
    expect(inferCollisionDirectionFromDescription("damage on driver side")).toBe("side_driver"));

  // Side passenger
  it("infers 'side_passenger' from 'hit on the right side'", () =>
    expect(inferCollisionDirectionFromDescription("hit on the right side")).toBe("side_passenger"));
  it("infers 'side_passenger' from 'passenger side impact'", () =>
    expect(inferCollisionDirectionFromDescription("passenger side impact")).toBe("side_passenger"));

  // Frontal — animal strikes
  it("infers 'frontal' from 'hit a cow on the road'", () =>
    expect(inferCollisionDirectionFromDescription("hit a cow on the road")).toBe("frontal"));
  it("infers 'frontal' from 'struck a goat'", () =>
    expect(inferCollisionDirectionFromDescription("struck a goat")).toBe("frontal"));
  it("infers 'frontal' from 'donkey ran in front of vehicle'", () =>
    expect(inferCollisionDirectionFromDescription("donkey ran in front of vehicle")).toBe("frontal"));
  it("infers 'frontal' from 'animal on road'", () =>
    expect(inferCollisionDirectionFromDescription("animal on road")).toBe("frontal"));

  // Frontal — off-road / single vehicle
  it("infers 'frontal' from 'hit a tree'", () =>
    expect(inferCollisionDirectionFromDescription("hit a tree")).toBe("frontal"));
  it("infers 'frontal' from 'ran into a pole'", () =>
    expect(inferCollisionDirectionFromDescription("ran into a pole")).toBe("frontal"));
  it("infers 'frontal' from 'crashed into a wall'", () =>
    expect(inferCollisionDirectionFromDescription("crashed into a wall")).toBe("frontal"));
  it("infers 'frontal' from 'fell into a ditch'", () =>
    expect(inferCollisionDirectionFromDescription("fell into a ditch")).toBe("frontal"));
  it("infers 'frontal' from 'bull bar damaged'", () =>
    expect(inferCollisionDirectionFromDescription("bull bar damaged")).toBe("frontal"));
  it("infers 'frontal' from 'bonnet crumpled'", () =>
    expect(inferCollisionDirectionFromDescription("bonnet crumpled")).toBe("frontal"));
  it("infers 'frontal' from 'front bumper damage'", () =>
    expect(inferCollisionDirectionFromDescription("front bumper damage")).toBe("frontal"));
  it("infers 'frontal' from 'windscreen cracked'", () =>
    expect(inferCollisionDirectionFromDescription("windscreen cracked")).toBe("frontal"));

  // Unknown
  it("returns 'unknown' for empty string", () =>
    expect(inferCollisionDirectionFromDescription("")).toBe("unknown"));
  it("returns 'unknown' for unrelated text", () =>
    expect(inferCollisionDirectionFromDescription("vehicle was parked")).toBe("unknown"));
});
