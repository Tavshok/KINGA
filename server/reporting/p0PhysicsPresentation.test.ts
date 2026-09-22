import { describe, expect, it } from "vitest";

import { generateAssessmentReportHTML } from "../pdf-export";
import {
  P0_A2_COLLISION_PHYSICS_WITHHELD,
  buildP0A2CollisionPhysicsHold,
  projectP0A2DescriptivePhotoEvidence,
  redactP0A2PhysicsReportPayload,
  renderP0A2CollisionPhysicsAbstentionMarker,
} from "./p0PhysicsPresentation";

describe("P0-A-2 collision-physics publication boundary", () => {
  it("fails closed with a specific, actionable abstention when no governing source is supplied", () => {
    const hold = buildP0A2CollisionPhysicsHold();

    expect(hold).toMatchObject({
      code: P0_A2_COLLISION_PHYSICS_WITHHELD,
      reviewRequired: true,
    });
    expect(hold?.explanation).toContain("advisory or unavailable");
    expect(hold?.requiredEvidence.join(" ")).toContain("P1-qualified");
    expect(hold?.resolver.action).toContain("human engineering review");

    const marker = renderP0A2CollisionPhysicsAbstentionMarker();
    expect(marker).toContain("Collision Physics Withheld");
    expect(marker).toContain("What is missing:");
    expect(marker).toContain("What resolves this:");
  });

  it("removes legacy, PTL, cross-validation, CGI, and causation collision fields while retaining independent evidence", () => {
    const projection = redactP0A2PhysicsReportPayload({
      vehicle: { make: "Toyota", registration: "SAFE-001" },
      cost: { selectedQuoteUsd: 4200 },
      physics_analysis: {
        impact_speed_ms: 99,
        kinetic_energy_joules: 987654,
      },
      physicsTruth: {
        speed: { canonical: { value: 123 } },
        geometry: { crushDepth: { canonical: { value: 0.88 } } },
      },
      crossValidation: {
        consensusSpeedKmh: 300,
        verdict: "PHYSICALLY_IMPOSSIBLE",
      },
      cgi_result_json: {
        forceDensityIndex: { value: 55, status: "PASS" },
      },
      claimTruth: {
        causation: { type: "rear_end_collision", confidence: 0.99 },
      },
      documentaryEvidence: { policeReportPresent: true },
      photoEvidence: {
        impactZone: "front bumper",
        caption: "Visible deformation",
      },
    }) as Record<string, unknown>;

    expect(projection.vehicle).toEqual({
      make: "Toyota",
      registration: "SAFE-001",
    });
    expect(projection.cost).toEqual({ selectedQuoteUsd: 4200 });
    expect(projection.documentaryEvidence).toEqual({
      policeReportPresent: true,
    });
    expect(projection.photoEvidence).toEqual({
      impactZone: "front bumper",
      caption: "Visible deformation",
    });
    expect(projection).not.toHaveProperty("physics_analysis");
    expect(projection).not.toHaveProperty("physicsTruth");
    expect(projection).not.toHaveProperty("crossValidation");
    expect(projection).not.toHaveProperty("cgi_result_json");
    expect(projection.claimTruth).toEqual({});
    expect(projection.collisionPhysics).toMatchObject({
      code: P0_A2_COLLISION_PHYSICS_WITHHELD,
      reviewRequired: true,
    });
  });

  it("projects descriptive photo evidence while dropping stored visual-physics eligibility and direction conclusions", () => {
    const photo = projectP0A2DescriptivePhotoEvidence({
      url: "https://evidence.invalid/rear.jpg",
      zone: "rear",
      caption: "Rear bumper damage",
      semanticType: "vehicle_damage_photo",
      detectedComponents: ["rear bumper"],
      directionContradiction: true,
      suitableForCrushDepth: true,
      physicsExclusionReason: "legacy visual physics qualification",
    });

    expect(photo).toEqual({
      url: "https://evidence.invalid/rear.jpg",
      zone: "rear",
      caption: "Rear bumper damage",
      semanticType: "vehicle_damage_photo",
      detectedComponents: ["rear bumper"],
    });
    expect(photo).not.toHaveProperty("directionContradiction");
    expect(photo).not.toHaveProperty("suitableForCrushDepth");
    expect(photo).not.toHaveProperty("physicsExclusionReason");
  });

  it("fails closed for a direct generic-PDF payload and renders the actionable hold", () => {
    const html = generateAssessmentReportHTML({
      vehicleMake: "Toyota",
      vehicleModel: "Corolla",
      vehicleYear: 2021,
      vehicleRegistration: "SAFE-001",
      damageDescription: "Front bumper damage",
      estimatedCost: 4200,
      damagedComponents: ["Front bumper"],
      collisionPhysics: buildP0A2CollisionPhysicsHold(),
      physicsAnalysis: {
        physics_analysis: {
          impact_speed_ms: 99,
          kinetic_energy_joules: 987654,
          g_force: 42,
        },
        damageConsistency: "inconsistent",
        confidence: 0.99,
      },
      crossValidation: {
        summary: { overallRiskScore: 100 },
      },
    });

    expect(html).toContain(
      "Collision Physics Withheld — Manual Review Required"
    );
    expect(html).toContain("What is missing:");
    expect(html).toContain("What resolves this:");
    expect(html).not.toContain("Toyota Corolla");
    expect(html).not.toContain("4,200");
    expect(html).not.toContain("356 km/h");
    expect(html).not.toContain("987654");
    expect(html).not.toContain("42g");
    expect(html).not.toContain("Physics check passed");
    expect(html).not.toContain("PHYSICALLY_IMPOSSIBLE");
    expect(html).not.toContain("Quote vs Photo Cross-Validation");
    expect(html).not.toContain("100/100");
  });
});
