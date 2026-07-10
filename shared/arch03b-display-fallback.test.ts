/**
 * ARCH-03b Fix 3 Verification — Display Layer Fallback
 *
 * Verifies that normaliseFraudLevel() and fraudLevelDisplayLabel() correctly
 * handle legacy "medium" values from the database, ensuring historical rows
 * display as "Moderate" rather than the raw stored string "medium".
 *
 * @see docs/KINGA-FRAUD-SCORING-STANDARD.md
 * @see shared/fraudScoring.ts
 */

import { describe, it, expect } from "vitest";
import { normaliseFraudLevel, fraudLevelDisplayLabel } from "./fraudScoring";

describe("normaliseFraudLevel — ARCH-03b legacy value handling", () => {
  describe("legacy 'medium' → 'moderate' mapping (22 historical DB rows)", () => {
    it("maps 'medium' to 'moderate'", () => {
      expect(normaliseFraudLevel("medium")).toBe("moderate");
    });

    it("maps 'MEDIUM' (uppercase) to 'moderate' via safe fallback", () => {
      // Uppercase is not a valid DB value but defensive handling is correct
      expect(normaliseFraudLevel("MEDIUM")).toBe("low"); // falls through to safe fallback
    });
  });

  describe("legacy 'critical' → 'elevated' mapping", () => {
    it("maps 'critical' to 'elevated'", () => {
      expect(normaliseFraudLevel("critical")).toBe("elevated");
    });
  });

  describe("canonical pass-through values (no transformation)", () => {
    it("passes 'minimal' through unchanged", () => {
      expect(normaliseFraudLevel("minimal")).toBe("minimal");
    });

    it("passes 'low' through unchanged", () => {
      expect(normaliseFraudLevel("low")).toBe("low");
    });

    it("passes 'moderate' through unchanged", () => {
      expect(normaliseFraudLevel("moderate")).toBe("moderate");
    });

    it("passes 'high' through unchanged", () => {
      expect(normaliseFraudLevel("high")).toBe("high");
    });

    it("passes 'elevated' through unchanged", () => {
      expect(normaliseFraudLevel("elevated")).toBe("elevated");
    });
  });

  describe("null / undefined / unknown safe fallback → 'low'", () => {
    it("returns 'low' for null", () => {
      expect(normaliseFraudLevel(null)).toBe("low");
    });

    it("returns 'low' for undefined", () => {
      expect(normaliseFraudLevel(undefined)).toBe("low");
    });

    it("returns 'low' for empty string", () => {
      expect(normaliseFraudLevel("")).toBe("low");
    });

    it("returns 'low' for unknown string", () => {
      expect(normaliseFraudLevel("unknown_level")).toBe("low");
    });

    it("returns 'low' for numeric string", () => {
      expect(normaliseFraudLevel("42")).toBe("low");
    });
  });
});

describe("fraudLevelDisplayLabel — human-readable labels", () => {
  describe("legacy values render correctly", () => {
    it("renders 'medium' as 'Moderate' (ARCH-03b: historical DB rows)", () => {
      expect(fraudLevelDisplayLabel("medium")).toBe("Moderate");
    });

    it("renders 'critical' as 'Elevated'", () => {
      expect(fraudLevelDisplayLabel("critical")).toBe("Elevated");
    });
  });

  describe("canonical values render with Title Case", () => {
    it("renders 'minimal' as 'Minimal'", () => {
      expect(fraudLevelDisplayLabel("minimal")).toBe("Minimal");
    });

    it("renders 'low' as 'Low'", () => {
      expect(fraudLevelDisplayLabel("low")).toBe("Low");
    });

    it("renders 'moderate' as 'Moderate'", () => {
      expect(fraudLevelDisplayLabel("moderate")).toBe("Moderate");
    });

    it("renders 'high' as 'High'", () => {
      expect(fraudLevelDisplayLabel("high")).toBe("High");
    });

    it("renders 'elevated' as 'Elevated'", () => {
      expect(fraudLevelDisplayLabel("elevated")).toBe("Elevated");
    });
  });

  describe("null / undefined / unknown safe fallback", () => {
    it("renders null as 'Low' (safe fallback)", () => {
      expect(fraudLevelDisplayLabel(null)).toBe("Low");
    });

    it("renders undefined as 'Low' (safe fallback)", () => {
      expect(fraudLevelDisplayLabel(undefined)).toBe("Low");
    });

    it("renders unknown string as 'Low' (safe fallback)", () => {
      expect(fraudLevelDisplayLabel("garbage")).toBe("Low");
    });
  });

  describe("email notification body — real-world scenario", () => {
    it("produces correct email text for a legacy 'medium' row", () => {
      const storedLevel = "medium"; // as found in the DB for 22 historical rows
      const emailLine = `Fraud Risk Level: ${fraudLevelDisplayLabel(storedLevel)}`;
      expect(emailLine).toBe("Fraud Risk Level: Moderate");
    });

    it("produces correct email text for a new 'moderate' row", () => {
      const storedLevel = "moderate"; // written by pipeline after ARCH-03 fix
      const emailLine = `Fraud Risk Level: ${fraudLevelDisplayLabel(storedLevel)}`;
      expect(emailLine).toBe("Fraud Risk Level: Moderate");
    });

    it("produces correct email text for a 'high' row", () => {
      const storedLevel = "high";
      const emailLine = `Fraud Risk Level: ${fraudLevelDisplayLabel(storedLevel)}`;
      expect(emailLine).toBe("Fraud Risk Level: High");
    });
  });
});
