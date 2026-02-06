/**
 * Unit Tests for Vehicle Market Valuation Service
 * 
 * Tests AI-powered valuation, adjustments, and total loss determination
 */

import { describe, it, expect } from "vitest";
import {
  valuateVehicle,
  calculateBetterment,
  determineTotalLoss,
  type VehicleDetails,
} from "./services/vehicleValuation";

describe("Vehicle Market Valuation Service", () => {
  it("should valuate a 2017 Toyota Hilux", async () => {
    const vehicle: VehicleDetails = {
      make: "Toyota",
      model: "Hilux",
      year: 2017,
      mileage: 120000,
      condition: "good",
      country: "Zimbabwe",
    };

    const valuation = await valuateVehicle(vehicle);

    expect(valuation.estimatedMarketValue).toBeGreaterThan(0);
    expect(valuation.valuationMethod).toBe("ai_estimation");
    expect(valuation.confidenceScore).toBeGreaterThan(0);
    expect(valuation.confidenceScore).toBeLessThanOrEqual(100);
    expect(valuation.dataPointsCount).toBeGreaterThan(0);
    expect(valuation.priceRange).toBeDefined();
    expect(valuation.priceRange.min).toBeLessThanOrEqual(valuation.priceRange.max);
  });

  it("should apply condition adjustments correctly", async () => {
    const excellentVehicle: VehicleDetails = {
      make: "Toyota",
      model: "Hilux",
      year: 2017,
      condition: "excellent",
      country: "Zimbabwe",
    };

    const poorVehicle: VehicleDetails = {
      make: "Toyota",
      model: "Hilux",
      year: 2017,
      condition: "poor",
      country: "Zimbabwe",
    };

    const excellentValuation = await valuateVehicle(excellentVehicle);
    const poorValuation = await valuateVehicle(poorVehicle);

    // Excellent should have positive adjustment
    expect(excellentValuation.conditionAdjustment).toBeGreaterThan(0);

    // Poor should have negative adjustment
    expect(poorValuation.conditionAdjustment).toBeLessThan(0);

    // Excellent final value should be higher than poor
    expect(excellentValuation.finalAdjustedValue).toBeGreaterThan(
      poorValuation.finalAdjustedValue
    );
  });

  it("should apply mileage adjustments correctly", async () => {
    const lowMileageVehicle: VehicleDetails = {
      make: "Toyota",
      model: "Hilux",
      year: 2020, // 6 years old, expected mileage: 90,000 km
      mileage: 50000, // Below expected
      condition: "good",
      country: "Zimbabwe",
    };

    const highMileageVehicle: VehicleDetails = {
      make: "Toyota",
      model: "Hilux",
      year: 2020,
      mileage: 150000, // Above expected
      condition: "good",
      country: "Zimbabwe",
    };

    const lowMileageValuation = await valuateVehicle(lowMileageVehicle);
    const highMileageValuation = await valuateVehicle(highMileageVehicle);

    // Low mileage should have negative adjustment (increases value)
    expect(lowMileageValuation.mileageAdjustment).toBeLessThan(0);

    // High mileage should have positive adjustment (decreases value)
    expect(highMileageValuation.mileageAdjustment).toBeGreaterThan(0);
  });

  it("should determine total loss correctly", async () => {
    const vehicle: VehicleDetails = {
      make: "Toyota",
      model: "Hilux",
      year: 2017,
      mileage: 120000,
      condition: "good",
      country: "Zimbabwe",
    };

    // Simulate high repair cost (should be total loss)
    const highRepairCost = 2000000; // $20,000 in cents
    const valuation = await valuateVehicle(vehicle, highRepairCost);

    // Should be flagged as total loss
    expect(valuation.isTotalLoss).toBe(true);
    expect(valuation.repairCostToValueRatio).toBeGreaterThan(60);
  });

  it("should not flag as total loss for reasonable repair costs", async () => {
    const vehicle: VehicleDetails = {
      make: "Toyota",
      model: "Hilux",
      year: 2017,
      mileage: 120000,
      condition: "good",
      country: "Zimbabwe",
    };

    // Simulate low repair cost (should NOT be total loss)
    const lowRepairCost = 50000; // $500 in cents
    const valuation = await valuateVehicle(vehicle, lowRepairCost);

    // Should NOT be flagged as total loss
    expect(valuation.isTotalLoss).toBe(false);
    expect(valuation.repairCostToValueRatio).toBeLessThan(60);
  });

  it("should calculate betterment for mechanical parts correctly", async () => {
    const newPartCost = 50000; // $500 in cents
    const vehicleAge = 7; // 7 years old

    const betterment = calculateBetterment(newPartCost, vehicleAge, "mechanical");

    expect(betterment.bettermentAmount).toBeGreaterThan(0);
    expect(betterment.netCost).toBeLessThan(newPartCost);
    expect(betterment.depreciationRate).toBe(0.15); // 15% for mechanical
    expect(betterment.explanation).toContain("7-year-old");
  });

  it("should calculate betterment for different part categories", async () => {
    const newPartCost = 100000; // $1000 in cents
    const vehicleAge = 5;

    const mechanicalBetterment = calculateBetterment(newPartCost, vehicleAge, "mechanical");
    const bodyBetterment = calculateBetterment(newPartCost, vehicleAge, "body");
    const electricalBetterment = calculateBetterment(newPartCost, vehicleAge, "electrical");

    // Electrical should have highest betterment (fastest depreciation)
    expect(electricalBetterment.bettermentAmount).toBeGreaterThan(
      mechanicalBetterment.bettermentAmount
    );

    // Body should have lowest betterment (slowest depreciation)
    expect(bodyBetterment.bettermentAmount).toBeLessThan(
      mechanicalBetterment.bettermentAmount
    );
  });

  it("should determine total loss with correct salvage value", () => {
    const vehicleMarketValue = 2000000; // $20,000 in cents
    const estimatedRepairCost = 1300000; // $13,000 in cents (65% of value)

    const result = determineTotalLoss(vehicleMarketValue, estimatedRepairCost);

    expect(result.isTotalLoss).toBe(true);
    expect(result.repairCostToValueRatio).toBe(65);
    expect(result.salvageValue).toBe(300000); // 15% of market value
    expect(result.recommendation).toContain("TOTAL LOSS");
    expect(result.recommendation).toContain("$170.00"); // Payout: $200 - $30 salvage
  });

  it("should recommend repair for economically viable repairs", () => {
    const vehicleMarketValue = 2000000; // $20,000 in cents
    const estimatedRepairCost = 800000; // $8,000 in cents (40% of value)

    const result = determineTotalLoss(vehicleMarketValue, estimatedRepairCost);

    expect(result.isTotalLoss).toBe(false);
    expect(result.repairCostToValueRatio).toBe(40);
    expect(result.recommendation).toContain("REPAIR");
  });

  it("should include AI reasoning in valuation notes", async () => {
    const vehicle: VehicleDetails = {
      make: "Toyota",
      model: "Hilux",
      year: 2017,
      mileage: 120000,
      condition: "good",
      country: "Zimbabwe",
    };

    const valuation = await valuateVehicle(vehicle);

    expect(valuation.notes).toBeDefined();
    expect(valuation.notes.length).toBeGreaterThan(0);
    expect(valuation.notes.some((note) => note.includes("AI Reasoning"))).toBe(true);
  });

  it("should set valuation expiry to 30 days", async () => {
    const vehicle: VehicleDetails = {
      make: "Toyota",
      model: "Hilux",
      year: 2017,
      country: "Zimbabwe",
    };

    const valuation = await valuateVehicle(vehicle);

    const daysDifference =
      (valuation.validUntil.getTime() - valuation.valuationDate.getTime()) /
      (1000 * 60 * 60 * 24);

    expect(daysDifference).toBe(30);
  });
});
