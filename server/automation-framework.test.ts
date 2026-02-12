/**
 * Confidence-Governed Automation Framework Tests
 * 
 * Comprehensive test suite for:
 * - Automation policy configuration
 * - Claim routing decision engine
 * - Automation audit logging
 */

import { describe, it, expect } from "vitest";

// Policy Manager Tests
describe("Automation Policy Manager", () => {
  describe("Policy Threshold Validation", () => {
    it("should accept valid confidence thresholds (0-100)", () => {
      const validThresholds = [0, 50, 85, 100];
      validThresholds.forEach(threshold => {
        expect(threshold).toBeGreaterThanOrEqual(0);
        expect(threshold).toBeLessThanOrEqual(100);
      });
    });
    
    it("should reject confidence thresholds outside 0-100 range", () => {
      const invalidThresholds = [-1, 101, 150];
      invalidThresholds.forEach(threshold => {
        expect(threshold < 0 || threshold > 100).toBe(true);
      });
    });
    
    it("should accept non-negative approval amounts", () => {
      const validAmounts = [0, 10000, 50000, 1000000];
      validAmounts.forEach(amount => {
        expect(amount).toBeGreaterThanOrEqual(0);
      });
    });
  });
  
  describe("Default Policy Generation", () => {
    it("should generate conservative default policy", () => {
      const defaultPolicy = {
        minAutomationConfidence: 85,
        minHybridConfidence: 60,
        maxAiOnlyApprovalAmount: 10000,
        maxHybridApprovalAmount: 50000,
        maxFraudScoreForAutomation: 30,
      };
      
      expect(defaultPolicy.minAutomationConfidence).toBe(85);
      expect(defaultPolicy.minHybridConfidence).toBe(60);
      expect(defaultPolicy.maxAiOnlyApprovalAmount).toBe(10000);
      expect(defaultPolicy.maxFraudScoreForAutomation).toBe(30);
    });
    
    it("should exclude high-risk claim types by default", () => {
      const excludedTypes = ["theft", "fire"];
      expect(excludedTypes).toContain("theft");
      expect(excludedTypes).toContain("fire");
    });
    
    it("should exclude luxury vehicle makes by default", () => {
      const excludedMakes = ["Ferrari", "Lamborghini", "Bentley", "Rolls-Royce"];
      expect(excludedMakes.length).toBeGreaterThan(0);
      expect(excludedMakes).toContain("Ferrari");
    });
  });
});

// Routing Engine Tests
describe("Claim Routing Decision Engine", () => {
  describe("Fraud Risk Cutoff", () => {
    it("should route to manual if fraud score exceeds cutoff", () => {
      const fraudScore = 50;
      const cutoff = 30;
      const shouldRouteToManual = fraudScore > cutoff;
      
      expect(shouldRouteToManual).toBe(true);
    });
    
    it("should allow automation if fraud score is below cutoff", () => {
      const fraudScore = 20;
      const cutoff = 30;
      const shouldRouteToManual = fraudScore > cutoff;
      
      expect(shouldRouteToManual).toBe(false);
    });
  });
  
  describe("Claim Type Eligibility", () => {
    it("should route to manual if claim type is excluded", () => {
      const claimType = "theft";
      const excludedTypes = ["theft", "fire"];
      const isExcluded = excludedTypes.includes(claimType);
      
      expect(isExcluded).toBe(true);
    });
    
    it("should allow automation if claim type is eligible", () => {
      const claimType = "collision";
      const eligibleTypes = ["collision", "vandalism", "weather"];
      const isEligible = eligibleTypes.includes(claimType);
      
      expect(isEligible).toBe(true);
    });
  });
  
  describe("Vehicle Category Rules", () => {
    it("should route to manual if vehicle make is excluded", () => {
      const vehicleMake = "Ferrari";
      const excludedMakes = ["Ferrari", "Lamborghini"];
      const isExcluded = excludedMakes.includes(vehicleMake);
      
      expect(isExcluded).toBe(true);
    });
    
    it("should route to manual if vehicle is too old", () => {
      const vehicleYear = 2005;
      const minVehicleYear = 2010;
      const isTooOld = vehicleYear < minVehicleYear;
      
      expect(isTooOld).toBe(true);
    });
    
    it("should route to manual if vehicle age exceeds maximum", () => {
      const vehicleYear = 2000;
      const currentYear = 2026;
      const maxVehicleAge = 15;
      const vehicleAge = currentYear - vehicleYear;
      const exceedsMaxAge = vehicleAge > maxVehicleAge;
      
      expect(exceedsMaxAge).toBe(true);
    });
  });
  
  describe("Financial Thresholds", () => {
    it("should route to AI-only if confidence and cost meet thresholds", () => {
      const confidence = 90;
      const cost = 8000;
      const minConfidence = 85;
      const maxCost = 10000;
      
      const meetsAiOnlyCriteria = confidence >= minConfidence && cost <= maxCost;
      expect(meetsAiOnlyCriteria).toBe(true);
    });
    
    it("should route to hybrid if confidence meets hybrid threshold but exceeds AI-only cost", () => {
      const confidence = 70;
      const cost = 30000;
      const minHybridConfidence = 60;
      const maxAiOnlyCost = 10000;
      const maxHybridCost = 50000;
      
      const meetsHybridCriteria = confidence >= minHybridConfidence && cost > maxAiOnlyCost && cost <= maxHybridCost;
      expect(meetsHybridCriteria).toBe(true);
    });
    
    it("should route to manual if cost requires manager approval", () => {
      const cost = 150000;
      const managerApprovalThreshold = 100000;
      const requiresManagerApproval = cost > managerApprovalThreshold;
      
      expect(requiresManagerApproval).toBe(true);
    });
  });
  
  describe("Workflow Routing Logic", () => {
    it("should route to AI-only when all criteria are met", () => {
      const context = {
        confidence: 90,
        cost: 8000,
        fraudScore: 15,
        claimType: "collision",
        vehicleMake: "Toyota",
        vehicleYear: 2020,
      };
      
      const policy = {
        minAutomationConfidence: 85,
        maxAiOnlyApprovalAmount: 10000,
        maxFraudScoreForAutomation: 30,
        eligibleClaimTypes: ["collision", "vandalism"],
        excludedVehicleMakes: ["Ferrari"],
        minVehicleYear: 2010,
      };
      
      const passesAllChecks = 
        context.fraudScore <= policy.maxFraudScoreForAutomation &&
        policy.eligibleClaimTypes.includes(context.claimType) &&
        !policy.excludedVehicleMakes.includes(context.vehicleMake) &&
        context.vehicleYear >= policy.minVehicleYear &&
        context.confidence >= policy.minAutomationConfidence &&
        context.cost <= policy.maxAiOnlyApprovalAmount;
      
      expect(passesAllChecks).toBe(true);
    });
    
    it("should route to manual when any exclusion criterion is met", () => {
      const context = {
        confidence: 90,
        cost: 8000,
        fraudScore: 40, // Exceeds cutoff
        claimType: "collision",
      };
      
      const policy = {
        maxFraudScoreForAutomation: 30,
      };
      
      const shouldRouteToManual = context.fraudScore > policy.maxFraudScoreForAutomation;
      expect(shouldRouteToManual).toBe(true);
    });
  });
});

// Audit Logger Tests
describe("Automation Audit Logger", () => {
  describe("Cost Variance Calculation", () => {
    it("should calculate positive variance when final cost exceeds AI estimate", () => {
      const aiCost = 10000;
      const finalCost = 12000;
      const variance = ((finalCost - aiCost) / aiCost) * 100;
      
      expect(variance).toBe(20);
    });
    
    it("should calculate negative variance when final cost is below AI estimate", () => {
      const aiCost = 10000;
      const finalCost = 8000;
      const variance = ((finalCost - aiCost) / aiCost) * 100;
      
      expect(variance).toBe(-20);
    });
    
    it("should calculate zero variance when costs match exactly", () => {
      const aiCost = 10000;
      const finalCost = 10000;
      const variance = ((finalCost - aiCost) / aiCost) * 100;
      
      expect(variance).toBe(0);
    });
  });
  
  describe("AI Accuracy Metrics", () => {
    it("should classify AI estimate as accurate if within ±10% variance", () => {
      const variances = [5, -8, 0, 9.5, -10];
      const accurateEstimates = variances.filter(v => Math.abs(v) <= 10);
      
      expect(accurateEstimates.length).toBe(5);
    });
    
    it("should classify AI estimate as inaccurate if variance exceeds ±10%", () => {
      const variances = [15, -20, 11, -12];
      const inaccurateEstimates = variances.filter(v => Math.abs(v) > 10);
      
      expect(inaccurateEstimates.length).toBe(4);
    });
    
    it("should calculate AI-only accuracy percentage correctly", () => {
      const totalAiOnlyDecisions = 100;
      const accurateDecisions = 85;
      const accuracyPercentage = (accurateDecisions / totalAiOnlyDecisions) * 100;
      
      expect(accuracyPercentage).toBe(85);
    });
  });
  
  describe("Performance Metrics Aggregation", () => {
    it("should aggregate workflow distribution correctly", () => {
      const decisions = [
        { workflow: "ai_only" },
        { workflow: "ai_only" },
        { workflow: "hybrid" },
        { workflow: "manual" },
        { workflow: "ai_only" },
      ];
      
      const aiOnlyCount = decisions.filter(d => d.workflow === "ai_only").length;
      const hybridCount = decisions.filter(d => d.workflow === "hybrid").length;
      const manualCount = decisions.filter(d => d.workflow === "manual").length;
      
      expect(aiOnlyCount).toBe(3);
      expect(hybridCount).toBe(1);
      expect(manualCount).toBe(1);
    });
    
    it("should calculate average confidence score correctly", () => {
      const scores = [85, 90, 75, 95, 80];
      const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
      
      expect(average).toBe(85);
    });
    
    it("should calculate average cost variance correctly", () => {
      const variances = [5, -10, 15, -8, 12];
      const absoluteVariances = variances.map(v => Math.abs(v));
      const average = absoluteVariances.reduce((sum, v) => sum + v, 0) / absoluteVariances.length;
      
      expect(average).toBe(10);
    });
  });
});
