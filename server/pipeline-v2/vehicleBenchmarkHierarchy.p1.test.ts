import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildVehicleBenchmarkStrata,
  classifyBenchmarkYearBand,
} from "./vehicleBenchmarkHierarchy";

describe("vehicle-specific benchmark hierarchy", () => {
  it("uses the approved full-to-global internal fallback order", () => {
    const levels = buildVehicleBenchmarkStrata({
      vehicleMake: "Toyota",
      vehicleModel: "Corolla",
      vehicleYear: 2021,
      vehicleVariant: "1.8 Hybrid",
      bodyType: "sedan",
      marketRegion: "ZW",
      currencyCode: "USD",
    }).map((stratum) => stratum.level);

    expect(levels).toEqual([
      "exact_vehicle",
      "make_model_year_band",
      "make_body_year_band",
      "make_market_currency",
      "global_component",
    ]);
  });

  it("does not claim unavailable variant or year precision", () => {
    const levels = buildVehicleBenchmarkStrata({
      vehicleMake: "Toyota",
      vehicleModel: "Corolla",
      bodyType: "sedan",
      marketRegion: "ZW",
      currencyCode: "USD",
    }).map((stratum) => stratum.level);

    expect(levels).toEqual(["make_market_currency", "global_component"]);
  });

  it("uses stable, controlled year bands", () => {
    expect(classifyBenchmarkYearBand(1998)).toBe("pre2000");
    expect(classifyBenchmarkYearBand(2008)).toBe("2000-2009");
    expect(classifyBenchmarkYearBand(2018)).toBe("2010-2019");
    expect(classifyBenchmarkYearBand(2024)).toBe("2020plus");
    expect(classifyBenchmarkYearBand(null)).toBeNull();
  });

  it("passes make, model, year, variant, body, market, and currency context into Stage 9 benchmark lookup", () => {
    const source = readFileSync(new URL("./stage-9-cost.ts", import.meta.url), "utf8");

    expect(source).toContain("getVehicleSpecificComponentBenchmarks");
    expect(source).toContain("getVehicleSpecificTrainingBenchmarks");
    expect(source).toContain("vehicleModel");
    expect(source).toContain("vehicleVariant");
    expect(source).toContain("bodyType: vehicleBodyType");
    expect(source).toContain("marketRegion: region");
    expect(source).toContain("currencyCode: quoteCurrencyCode");
  });
});
