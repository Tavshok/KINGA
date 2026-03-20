/**
 * classifyIncidentType.test.ts
 *
 * Unit tests for classifyIncidentType — verifying NLP-based inference
 * for non-standard incident descriptions (animal strikes, off-road, etc.)
 */
import { describe, it, expect } from "vitest";
import { classifyIncidentType } from "./types";

describe("classifyIncidentType", () => {
  // Standard DB enum values
  it("maps 'collision' -> 'collision'", () => {
    expect(classifyIncidentType("collision")).toBe("collision");
  });
  it("maps 'theft' -> 'theft'", () => {
    expect(classifyIncidentType("theft")).toBe("theft");
  });
  it("maps 'hijacking' -> 'theft'", () => {
    expect(classifyIncidentType("hijacking")).toBe("theft");
  });
  it("maps 'hail' -> 'flood'", () => {
    expect(classifyIncidentType("hail")).toBe("flood");
  });
  it("maps 'fire' -> 'fire'", () => {
    expect(classifyIncidentType("fire")).toBe("fire");
  });
  it("maps 'vandalism' -> 'vandalism'", () => {
    expect(classifyIncidentType("vandalism")).toBe("vandalism");
  });

  // "other" DB enum value
  it("maps 'other' -> 'collision'", () => {
    expect(classifyIncidentType("other")).toBe("collision");
  });

  // NLP fallback — animal strikes
  it("infers 'collision' from 'hit a cow'", () => {
    expect(classifyIncidentType("hit a cow")).toBe("collision");
  });
  it("infers 'collision' from 'struck a goat on the road'", () => {
    expect(classifyIncidentType("struck a goat on the road")).toBe("collision");
  });
  it("infers 'collision' from 'vehicle hit a donkey'", () => {
    expect(classifyIncidentType("vehicle hit a donkey")).toBe("collision");
  });
  it("infers 'collision' from 'animal on road'", () => {
    expect(classifyIncidentType("animal on road")).toBe("collision");
  });

  // NLP fallback — off-road / single vehicle
  it("infers 'collision' from 'ran off the road into a ditch'", () => {
    expect(classifyIncidentType("ran off the road into a ditch")).toBe("collision");
  });
  it("infers 'collision' from 'veered off road and hit a tree'", () => {
    expect(classifyIncidentType("veered off road and hit a tree")).toBe("collision");
  });
  it("infers 'collision' from 'hit a pole'", () => {
    expect(classifyIncidentType("hit a pole")).toBe("collision");
  });
  it("infers 'collision' from 'crashed into a wall'", () => {
    expect(classifyIncidentType("crashed into a wall")).toBe("collision");
  });
  it("infers 'collision' from 'vehicle rolled over'", () => {
    expect(classifyIncidentType("vehicle rolled over")).toBe("collision");
  });
  it("infers 'collision' from 'overturned on gravel road'", () => {
    expect(classifyIncidentType("overturned on gravel road")).toBe("collision");
  });

  // NLP fallback — pedestrian
  it("infers 'collision' from 'hit a pedestrian'", () => {
    expect(classifyIncidentType("hit a pedestrian")).toBe("collision");
  });

  // Theft/hijacking NLP
  it("maps 'stolen' -> 'theft'", () => {
    expect(classifyIncidentType("stolen")).toBe("theft");
  });

  // Unknown / empty
  it("returns 'unknown' for empty string", () => {
    expect(classifyIncidentType("")).toBe("unknown");
  });
  it("returns 'unknown' for unrecognised text", () => {
    expect(classifyIncidentType("some random text xyz")).toBe("unknown");
  });
});
