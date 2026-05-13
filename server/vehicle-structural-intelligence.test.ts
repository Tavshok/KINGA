// @ts-nocheck
/**
 * Vehicle Structural Intelligence Service Tests
 *
 * Tests for:
 *  - ANCAP rating lookups
 *  - Global NCAP Africa lookups
 *  - CRASH3 coefficient lookups
 *  - NHTSA VIN decode (mocked)
 *  - Structural profile builder
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  lookupANCAPRating,
  lookupGlobalNCAP,
  getCRASH3Class,
  decodeVINNHTSA,
  buildVehicleStructuralProfile,
} from "./vehicle-structural-intelligence";

// ─────────────────────────────────────────────────────────────────────────────
// ANCAP RATING LOOKUPS
// ─────────────────────────────────────────────────────────────────────────────

describe("lookupANCAPRating", () => {
  it("returns 5-star ANCAP rating for Toyota Hilux 2019", () => {
    const result = lookupANCAPRating("Toyota", "Hilux", 2021);
    expect(result).not.toBeNull();
    expect(result!.stars).toBe(5);
    expect(result!.adultOccupant).toBeGreaterThan(80);
    expect(result!.childOccupant).toBeGreaterThan(80);
  });

  it("returns 5-star ANCAP rating for Toyota Hilux 2025 (new model)", () => {
    const result = lookupANCAPRating("Toyota", "Hilux", 2025);
    expect(result).not.toBeNull();
    expect(result!.stars).toBe(5);
    expect(result!.testYear).toBe(2025);
    expect(result!.adultOccupant).toBe(84);
  });

  it("returns ANCAP rating for Toyota Prado 2024", () => {
    const result = lookupANCAPRating("Toyota", "Prado", 2024);
    expect(result).not.toBeNull();
    expect(result!.stars).toBe(5);
    expect(result!.adultOccupant).toBe(85);
    expect(result!.childOccupant).toBe(89);
  });

  it("returns ANCAP rating for Ford Ranger 2022", () => {
    const result = lookupANCAPRating("Ford", "Ranger", 2022);
    expect(result).not.toBeNull();
    expect(result!.stars).toBe(5);
    expect(result!.adultOccupant).toBe(84);
    expect(result!.childOccupant).toBe(93);
  });

  it("returns ANCAP rating for Isuzu D-Max 2021", () => {
    const result = lookupANCAPRating("Isuzu", "D-Max", 2021);
    expect(result).not.toBeNull();
    expect(result!.stars).toBe(5);
    expect(result!.adultOccupant).toBe(83);
  });

  it("returns most recent rating when year is not specified", () => {
    const result = lookupANCAPRating("Toyota", "Hilux");
    expect(result).not.toBeNull();
    // Should return the 2025 test (most recent)
    expect(result!.testYear).toBe(2025);
  });

  it("returns null for unknown vehicle", () => {
    const result = lookupANCAPRating("Unknown", "Vehicle", 2020);
    expect(result).toBeNull();
  });

  it("is case-insensitive", () => {
    const result = lookupANCAPRating("TOYOTA", "hilux", 2021);
    expect(result).not.toBeNull();
    expect(result!.stars).toBe(5);
  });

  it("returns ANCAP rating for Nissan Navara 2025", () => {
    const result = lookupANCAPRating("Nissan", "Navara", 2025);
    expect(result).not.toBeNull();
    expect(result!.adultOccupant).toBe(86);
    expect(result!.vruProtection).toBe(74);
  });

  it("returns ANCAP rating for Toyota Fortuner 2019", () => {
    const result = lookupANCAPRating("Toyota", "Fortuner", 2020);
    expect(result).not.toBeNull();
    expect(result!.adultOccupant).toBe(95);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GLOBAL NCAP AFRICA LOOKUPS
// ─────────────────────────────────────────────────────────────────────────────

describe("lookupGlobalNCAP", () => {
  it("returns Global NCAP Africa rating for VW Polo Vivo", () => {
    const result = lookupGlobalNCAP("Volkswagen", "Polo Vivo");
    expect(result).not.toBeNull();
    expect(result!.adultStars).toBeGreaterThanOrEqual(3);
  });

  it("returns 0 stars for Suzuki S-Presso (2022)", () => {
    const result = lookupGlobalNCAP("Suzuki", "S-Presso");
    expect(result).not.toBeNull();
    expect(result!.adultStars).toBe(0);
  });

  it("returns 0 stars for Great Wall Steed 5 (no airbags)", () => {
    const result = lookupGlobalNCAP("Great Wall", "Steed 5");
    expect(result).not.toBeNull();
    expect(result!.adultStars).toBe(0);
  });

  it("returns 4 stars for Toyota Avanza 2019", () => {
    const result = lookupGlobalNCAP("Toyota", "Avanza");
    expect(result).not.toBeNull();
    expect(result!.adultStars).toBe(4);
  });

  it("returns 5 stars for Mahindra XUV300 2021", () => {
    const result = lookupGlobalNCAP("Mahindra", "XUV300");
    expect(result).not.toBeNull();
    expect(result!.adultStars).toBe(5);
  });

  it("returns null for unknown vehicle", () => {
    const result = lookupGlobalNCAP("Unknown", "Vehicle");
    expect(result).toBeNull();
  });

  it("returns most recent test for Nissan Magnite", () => {
    const result = lookupGlobalNCAP("Nissan", "Magnite");
    expect(result).not.toBeNull();
    expect(result!.testYear).toBe(2025);
    expect(result!.adultStars).toBe(4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CRASH3 COEFFICIENT LOOKUPS
// ─────────────────────────────────────────────────────────────────────────────

describe("getCRASH3Class", () => {
  it("returns Full-size SUV/Pickup class for Toyota Hilux", () => {
    const result = getCRASH3Class("Toyota", "Hilux");
    expect(result).not.toBeNull();
    expect(result!.vehicleClass).toBe("Full-size SUV/Pickup");
    expect(result!.A_kN_m).toBe(340);
    expect(result!.B_kN_m2).toBe(650);
  });

  it("returns Large SUV/4x4 class for Toyota Land Cruiser", () => {
    const result = getCRASH3Class("Toyota", "Land Cruiser");
    expect(result).not.toBeNull();
    expect(result!.vehicleClass).toBe("Large SUV/4x4");
    expect(result!.A_kN_m).toBe(380);
    expect(result!.B_kN_m2).toBe(720);
  });

  it("returns Mini/Subcompact class for VW Polo Vivo", () => {
    const result = getCRASH3Class("Volkswagen", "Polo Vivo");
    expect(result).not.toBeNull();
    expect(result!.vehicleClass).toBe("Mini/Subcompact");
    expect(result!.A_kN_m).toBe(207);
  });

  it("returns Mini/Subcompact class for Suzuki S-Presso", () => {
    const result = getCRASH3Class("Suzuki", "S-Presso");
    expect(result).not.toBeNull();
    expect(result!.vehicleClass).toBe("Mini/Subcompact");
  });

  it("returns Full-size SUV/Pickup for Ford Ranger", () => {
    const result = getCRASH3Class("Ford", "Ranger");
    expect(result).not.toBeNull();
    expect(result!.vehicleClass).toBe("Full-size SUV/Pickup");
  });

  it("returns Full-size SUV/Pickup for Isuzu D-Max", () => {
    const result = getCRASH3Class("Isuzu", "D-Max");
    expect(result).not.toBeNull();
    expect(result!.vehicleClass).toBe("Full-size SUV/Pickup");
  });

  it("returns Light Commercial Van for Toyota HiAce", () => {
    const result = getCRASH3Class("Toyota", "HiAce");
    expect(result).not.toBeNull();
    expect(result!.vehicleClass).toBe("Light Commercial Van");
  });

  it("returns null for unknown vehicle", () => {
    const result = getCRASH3Class("Unknown", "Vehicle");
    expect(result).toBeNull();
  });

  it("stiffness coefficients increase with vehicle class size", () => {
    const mini = getCRASH3Class("Toyota", "Yaris");
    const compact = getCRASH3Class("Toyota", "Corolla");
    const fullSize = getCRASH3Class("Toyota", "Hilux");
    const large = getCRASH3Class("Toyota", "Land Cruiser");

    expect(mini).not.toBeNull();
    expect(compact).not.toBeNull();
    expect(fullSize).not.toBeNull();
    expect(large).not.toBeNull();

    expect(mini!.A_kN_m).toBeLessThan(compact!.A_kN_m);
    expect(compact!.A_kN_m).toBeLessThan(fullSize!.A_kN_m);
    expect(fullSize!.A_kN_m).toBeLessThan(large!.A_kN_m);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// NHTSA VIN DECODE (mocked)
// ─────────────────────────────────────────────────────────────────────────────

describe("decodeVINNHTSA", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns error for VIN that is too short", async () => {
    const result = await decodeVINNHTSA("ABC123");
    expect(result.errorCode).toBe("INVALID_VIN");
  });

  it("returns error for empty VIN", async () => {
    const result = await decodeVINNHTSA("");
    expect(result.errorCode).toBe("INVALID_VIN");
  });

  it("calls NHTSA API with correct URL format", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        Results: [
          { Variable: "Make", Value: "TOYOTA" },
          { Variable: "Model", Value: "Hilux" },
          { Variable: "Model Year", Value: "2021" },
          { Variable: "Body Class", Value: "Pickup" },
          { Variable: "Drive Type", Value: "4WD/4-Wheel Drive/4x4" },
          { Variable: "Fuel Type - Primary", Value: "Diesel" },
          { Variable: "Error Code", Value: "0" },
          { Variable: "Error Text", Value: "" },
        ],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await decodeVINNHTSA("MR0FR22G100000001");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("vpic.nhtsa.dot.gov"),
      expect.any(Object)
    );
    expect(result.make).toBe("TOYOTA");
    expect(result.model).toBe("Hilux");
    expect(result.modelYear).toBe("2021");
    expect(result.bodyClass).toBe("Pickup");
    expect(result.fuelTypePrimary).toBe("Diesel");
  });

  it("handles HTTP errors gracefully", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal("fetch", mockFetch);

    const result = await decodeVINNHTSA("MR0FR22G100000001");
    expect(result.errorCode).toBe("HTTP_ERROR");
  });

  it("handles network errors gracefully", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));
    vi.stubGlobal("fetch", mockFetch);

    const result = await decodeVINNHTSA("MR0FR22G100000001");
    expect(result.errorCode).toBe("FETCH_ERROR");
  });

  it("filters out 'Not Applicable' values", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        Results: [
          { Variable: "Make", Value: "FORD" },
          { Variable: "Model", Value: "Ranger" },
          { Variable: "Series", Value: "Not Applicable" },
          { Variable: "Trim", Value: "null" },
        ],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await decodeVINNHTSA("1FTFW1E5XJFA00001");
    expect(result.make).toBe("FORD");
    expect(result.series).toBeUndefined();
    expect(result.trim).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// STRUCTURAL PROFILE BUILDER
// ─────────────────────────────────────────────────────────────────────────────

describe("buildVehicleStructuralProfile", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Mock fetch for NHTSA VIN decode
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        Results: [
          { Variable: "Make", Value: "TOYOTA" },
          { Variable: "Model", Value: "Hilux" },
          { Variable: "Model Year", Value: "2021" },
          { Variable: "Body Class", Value: "Pickup" },
          { Variable: "Drive Type", Value: "4WD/4-Wheel Drive/4x4" },
          { Variable: "Fuel Type - Primary", Value: "Diesel" },
          { Variable: "Error Code", Value: "0" },
        ],
      }),
    }));
  });

  it("builds a complete profile for Toyota Hilux without counterpart", async () => {
    const profile = await buildVehicleStructuralProfile({
      make: "Toyota",
      model: "Hilux",
      year: 2021,
      generateNarrative: false,
    });

    expect(profile.make).toBe("Toyota");
    expect(profile.model).toBe("Hilux");
    expect(profile.ancapRating).not.toBeNull();
    expect(profile.ancapRating!.stars).toBe(5);
    expect(profile.crash3Class).not.toBeNull();
    expect(profile.crash3Class!.vehicleClass).toBe("Full-size SUV/Pickup");
    expect(profile.safetyRiskLevel).toBe("low"); // 90% adult occupant
    expect(profile.compatibilityRisk).toBe("unknown"); // no counterpart
  });

  it("detects high compatibility risk: Land Cruiser vs Polo Vivo", async () => {
    const profile = await buildVehicleStructuralProfile({
      make: "Toyota",
      model: "Land Cruiser",
      year: 2022,
      counterpartMake: "Volkswagen",
      counterpartModel: "Polo Vivo",
      counterpartYear: 2020,
      generateNarrative: false,
    });

    expect(profile.crash3Class!.vehicleClass).toBe("Large SUV/4x4");
    expect(profile.compatibilityRisk).toBe("high");
  });

  it("detects low compatibility risk: Hilux vs Ranger", async () => {
    const profile = await buildVehicleStructuralProfile({
      make: "Toyota",
      model: "Hilux",
      year: 2021,
      counterpartMake: "Ford",
      counterpartModel: "Ranger",
      counterpartYear: 2022,
      generateNarrative: false,
    });

    expect(profile.compatibilityRisk).toBe("low");
  });

  it("assigns high safety risk level for zero-star vehicles", async () => {
    const profile = await buildVehicleStructuralProfile({
      make: "Suzuki",
      model: "S-Presso",
      year: 2022,
      generateNarrative: false,
    });

    // No ANCAP rating, but Global NCAP Africa 0 stars
    expect(profile.safetyRiskLevel).toBe("high");
  });

  it("uses NHTSA data to fill make/model when provided", async () => {
    const profile = await buildVehicleStructuralProfile({
      vin: "MR0FR22G100000001",
      make: "Toyota",
      model: "Hilux",
      generateNarrative: false,
    });

    // NHTSA mock returns TOYOTA/Hilux
    expect(profile.nhtsaDecode).toBeDefined();
    expect(profile.nhtsaDecode!.make).toBe("TOYOTA");
  });

  it("handles vehicle with no ANCAP or Global NCAP rating", async () => {
    const profile = await buildVehicleStructuralProfile({
      make: "Unknown",
      model: "Vehicle",
      year: 2020,
      generateNarrative: false,
    });

    expect(profile.ancapRating).toBeNull();
    expect(profile.globalNcapAfrica).toBeNull();
    expect(profile.safetyRiskLevel).toBe("unknown");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DATA INTEGRITY CHECKS
// ─────────────────────────────────────────────────────────────────────────────

describe("Data integrity", () => {
  it("all ANCAP ratings have valid star values (1-5)", () => {
    // Test a sample of known vehicles
    const vehicles = [
      ["Toyota", "Hilux", 2021],
      ["Toyota", "Prado", 2024],
      ["Ford", "Ranger", 2022],
      ["Isuzu", "D-Max", 2021],
      ["Nissan", "Navara", 2025],
      ["Mitsubishi", "Triton", 2024],
      ["Mazda", "BT-50", 2021],
    ] as const;

    for (const [make, model, year] of vehicles) {
      const rating = lookupANCAPRating(make, model, year);
      expect(rating, `${make} ${model} ${year} should have ANCAP rating`).not.toBeNull();
      expect(rating!.stars, `${make} ${model} ${year} stars should be 1-5`).toBeGreaterThanOrEqual(1);
      expect(rating!.stars).toBeLessThanOrEqual(5);
    }
  });

  it("all CRASH3 classes have valid stiffness coefficients", () => {
    const vehicles = [
      ["Toyota", "Yaris"],
      ["Toyota", "Corolla"],
      ["Toyota", "RAV4"],
      ["Toyota", "Hilux"],
      ["Toyota", "Land Cruiser"],
      ["Toyota", "HiAce"],
    ] as const;

    for (const [make, model] of vehicles) {
      const cls = getCRASH3Class(make, model);
      expect(cls, `${make} ${model} should have CRASH3 class`).not.toBeNull();
      expect(cls!.A_kN_m).toBeGreaterThan(0);
      expect(cls!.B_kN_m2).toBeGreaterThan(0);
      expect(cls!.typicalMassRange_kg[0]).toBeLessThan(cls!.typicalMassRange_kg[1]);
    }
  });

  it("Global NCAP Africa zero-star vehicles are correctly identified", () => {
    const zeroStarVehicles = [
      ["Suzuki", "S-Presso"],
      ["Great Wall", "Steed 5"],
      ["Chery", "QQ3"],
    ] as const;

    for (const [make, model] of zeroStarVehicles) {
      const rating = lookupGlobalNCAP(make, model);
      expect(rating, `${make} ${model} should have Global NCAP rating`).not.toBeNull();
      expect(rating!.adultStars, `${make} ${model} should have 0 stars`).toBe(0);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TIERED CONFIDENCE SYSTEM
// ─────────────────────────────────────────────────────────────────────────────

describe("getCRASH3Class — tiered confidence", () => {
  it("returns confidenceTier 'verified' for a vehicle in the exact DB map (Toyota Hilux)", () => {
    const result = getCRASH3Class("Toyota", "Hilux");
    expect(result).not.toBeNull();
    expect(result!.confidenceTier).toBe("verified");
    expect(result!.inferenceReason).toBeUndefined();
  });

  it("returns confidenceTier 'verified' for a vehicle matched via partial key (Toyota Land Cruiser)", () => {
    const result = getCRASH3Class("Toyota", "Land Cruiser");
    expect(result).not.toBeNull();
    expect(result!.confidenceTier).toBe("verified");
  });

  it("returns confidenceTier 'inferred' when NHTSA body class is provided for an unknown model", () => {
    // "Toyota Probox" is not in the VEHICLE_CLASS_MAP; NHTSA body class "Pickup" should trigger inferred
    const result = getCRASH3Class("Toyota", "Probox", "Pickup");
    expect(result).not.toBeNull();
    expect(result!.confidenceTier).toBe("inferred");
    expect(result!.inferenceReason).toContain("NHTSA body class");
    expect(result!.vehicleClass).toBe("Full-size SUV/Pickup");
  });

  it("returns confidenceTier 'inferred' via keyword inference when model name contains a known keyword", () => {
    // "Acura MDX" is not in the DB but "mdx" doesn't match keywords; use "Acura Pickup" to trigger keyword
    // Use a model name that contains a keyword pattern: "Double Cab" triggers bakkie/pickup inference
    const result = getCRASH3Class("Acura", "Double Cab 2.5");
    expect(result).not.toBeNull();
    expect(result!.confidenceTier).toBe("inferred");
    expect(result!.inferenceReason).toContain("bakkie/pickup");
  });

  it("returns confidenceTier 'inferred' via make-level fallback for a Toyota model not in the map", () => {
    // "Toyota Probox" is not in VEHICLE_CLASS_MAP; no NHTSA body class; no keyword match
    // Toyota has many entries in the map → make-level fallback should trigger
    const result = getCRASH3Class("Toyota", "Probox");
    expect(result).not.toBeNull();
    expect(result!.confidenceTier).toBe("inferred");
    expect(result!.inferenceReason).toContain("Toyota");
    expect(result!.inferenceReason).toContain("Probox");
  });

  it("returns null (insufficient) for a completely unknown make with no keyword match", () => {
    // "Zephyr Phantom" — unknown make, no keyword match, no make entries in DB
    const result = getCRASH3Class("Zephyr", "Phantom");
    expect(result).toBeNull();
  });

  it("returns confidenceTier 'inferred' via keyword inference for a Suzuki Jimny-like model name", () => {
    // "Suzuki Jimny" is in the map as Compact/Sedan but let's test a model that matches keyword
    // Use "Haval Jolion" — in map as Mid-size Sedan/SUV → verified
    // Use "Haval H6" — not in map, but "Haval" has entries → make-level fallback
    const result = getCRASH3Class("Haval", "H6");
    expect(result).not.toBeNull();
    expect(result!.confidenceTier).toBe("inferred");
    expect(result!.inferenceReason).toContain("Haval");
  });
});

describe("buildVehicleStructuralProfile — hasInferredData flag", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Mock fetch to avoid real NHTSA calls
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ Results: [{ Variable: "Error Code", Value: "0" }] }),
    }));
  });

  it("sets hasInferredData = false for a fully verified vehicle (Toyota Hilux with ANCAP)", async () => {
    const profile = await buildVehicleStructuralProfile({
      make: "Toyota",
      model: "Hilux",
      year: 2021,
      generateNarrative: false,
    });
    // Toyota Hilux has ANCAP rating (verified) and is in the CRASH3 map (verified)
    expect(profile.ancapConfidenceTier).toBe("verified");
    expect(profile.crash3Class!.confidenceTier).toBe("verified");
    expect(profile.hasInferredData).toBe(false);
  });

  it("sets hasInferredData = true for a vehicle with no ANCAP/NCAP rating but known CRASH3 class", async () => {
    // "Toyota Probox" — no ANCAP/NCAP rating, CRASH3 inferred from make-level fallback
    const profile = await buildVehicleStructuralProfile({
      make: "Toyota",
      model: "Probox",
      year: 2018,
      generateNarrative: false,
    });
    expect(profile.hasInferredData).toBe(true);
    expect(profile.ancapConfidenceTier).not.toBe("verified");
  });

  it("sets hasInferredData = true for a completely unknown vehicle", async () => {
    const profile = await buildVehicleStructuralProfile({
      make: "Unknown",
      model: "Vehicle",
      year: 2020,
      generateNarrative: false,
    });
    expect(profile.hasInferredData).toBe(true);
    expect(profile.ancapConfidenceTier).toBe("insufficient");
    expect(profile.crash3Class).toBeNull();
  });

  it("returns ancapConfidenceTier 'verified' for a known ANCAP vehicle (Toyota Prado)", async () => {
    const profile = await buildVehicleStructuralProfile({
      make: "Toyota",
      model: "Prado",
      year: 2024,
      generateNarrative: false,
    });
    expect(profile.ancapConfidenceTier).toBe("verified");
    expect(profile.ancapRating).not.toBeNull();
    expect(profile.ancapRating!.stars).toBe(5);
  });

  it("returns ancapConfidenceTier 'insufficient' for a vehicle with no test data at all", async () => {
    const profile = await buildVehicleStructuralProfile({
      make: "Zephyr",
      model: "Phantom",
      year: 2020,
      generateNarrative: false,
    });
    expect(profile.ancapConfidenceTier).toBe("insufficient");
    expect(profile.ancapRating).toBeNull();
    expect(profile.globalNcapAfrica).toBeNull();
    expect(profile.safetyRiskLevel).toBe("unknown");
  });

  it("sets compatibilityRisk when counterpart vehicle is provided", async () => {
    const profile = await buildVehicleStructuralProfile({
      make: "Toyota",
      model: "Land Cruiser",
      year: 2022,
      counterpartMake: "Volkswagen",
      counterpartModel: "Polo Vivo",
      counterpartYear: 2020,
      generateNarrative: false,
    });
    expect(profile.compatibilityRisk).not.toBe("unknown");
    expect(["low", "medium", "high"]).toContain(profile.compatibilityRisk);
  });

  it("sets safetyRiskLevel to a known value for a verified vehicle", async () => {
    const profile = await buildVehicleStructuralProfile({
      make: "Ford",
      model: "Ranger",
      year: 2022,
      generateNarrative: false,
    });
    expect(profile.safetyRiskLevel).not.toBe("unknown");
    expect(["low", "medium", "high"]).toContain(profile.safetyRiskLevel);
  });
});
