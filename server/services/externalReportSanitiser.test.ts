/**
 * externalReportSanitiser.test.ts
 * Stage 31 — Pre-Export Text Sanitisation Layer
 *
 * Coverage:
 *  • Every explicitly listed forbidden term (5 core + 16 extended)
 *  • Scoring / internal logic references (6 rules)
 *  • Block-only terms (4 rules — criminal, prosecution, perjury, staged accident)
 *  • Tone violation patterns (6 patterns)
 *  • Capitalisation preservation
 *  • Multi-field report sanitisation
 *  • Correction log structure
 *  • buildBlockError output
 *  • Safe passthrough (no forbidden terms)
 */

import { describe, it, expect } from "vitest";
import {
  sanitiseExternalReport,
  sanitiseReportNarrative,
  buildBlockError,
  SANITISATION_RULES,
  TONE_VIOLATION_PATTERNS,
} from "./externalReportSanitiser";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clean(text: string): string {
  return sanitiseExternalReport({ field: text }).sanitised.field;
}

function isBlocked(text: string): boolean {
  return !sanitiseExternalReport({ field: text }).safe;
}

function corrections(text: string) {
  return sanitiseExternalReport({ field: text }).corrections;
}

// ─── Core forbidden terms (Rule 1 of the spec) ────────────────────────────────

describe("Core forbidden terms — auto-replaced", () => {
  it("replaces 'fraud' with 'assessment finding'", () => {
    expect(clean("This is a fraud case.")).toContain("assessment finding");
    expect(clean("This is a fraud case.")).not.toContain("fraud");
  });

  it("replaces 'fraudulent' (variant)", () => {
    const result = clean("The claim appears fraudulent.");
    expect(result).not.toContain("fraudulent");
    expect(result).toContain("assessment finding");
  });

  it("replaces 'anomaly' with 'review outcome'", () => {
    expect(clean("An anomaly was detected.")).toContain("review outcome");
    expect(clean("An anomaly was detected.")).not.toContain("anomaly");
  });

  it("replaces 'score' with 'assessment result'", () => {
    expect(clean("The risk score is 85.")).toContain("assessment result");
    expect(clean("The risk score is 85.")).not.toContain("score");
  });

  it("replaces 'inconsistency severity' with 'requires verification'", () => {
    expect(clean("The inconsistency severity is high.")).toContain("requires verification");
    expect(clean("The inconsistency severity is high.")).not.toContain("inconsistency severity");
  });

  it("replaces 'suspicious' with 'requires verification'", () => {
    expect(clean("The behaviour is suspicious.")).toContain("requires verification");
    expect(clean("The behaviour is suspicious.")).not.toContain("suspicious");
  });

  it("replaces 'suspiciously' (variant)", () => {
    const result = clean("The damage is suspiciously localised.");
    expect(result).not.toContain("suspiciously");
  });
});

// ─── Extended suspicion / accusation terms ────────────────────────────────────

describe("Extended suspicion terms — auto-replaced", () => {
  it("replaces 'misreported'", () => {
    expect(clean("The damage was misreported.")).not.toContain("misreported");
    expect(clean("The damage was misreported.")).toContain("further review required");
  });

  it("replaces 'undisclosed'", () => {
    expect(clean("There is an undisclosed condition.")).not.toContain("undisclosed");
    expect(clean("There is an undisclosed condition.")).toContain("additional verification needed");
  });

  it("replaces 'pre-existing condition'", () => {
    expect(clean("This is a pre-existing condition.")).not.toContain("pre-existing condition");
    expect(clean("This is a pre-existing condition.")).toContain("condition noted for review");
  });

  it("replaces 'inflated'", () => {
    expect(clean("The costs appear inflated.")).not.toContain("inflated");
    expect(clean("The costs appear inflated.")).toContain("further review required");
  });

  it("replaces 'tampered'", () => {
    expect(clean("The vehicle was tampered with.")).not.toContain("tampered");
    expect(clean("The vehicle was tampered with.")).toContain("additional verification needed");
  });

  it("replaces 'concealed'", () => {
    expect(clean("The damage was concealed.")).not.toContain("concealed");
    expect(clean("The damage was concealed.")).toContain("additional verification needed");
  });

  it("replaces 'omitted'", () => {
    expect(clean("Key details were omitted.")).not.toContain("omitted");
    expect(clean("Key details were omitted.")).toContain("not included in available documentation");
  });

  it("replaces 'falsified'", () => {
    expect(clean("Documents were falsified.")).not.toContain("falsified");
    expect(clean("Documents were falsified.")).toContain("requires verification");
  });

  it("replaces 'deceptive'", () => {
    expect(clean("The narrative is deceptive.")).not.toContain("deceptive");
    expect(clean("The narrative is deceptive.")).toContain("requires further review");
  });

  it("replaces 'deliberate'", () => {
    expect(clean("This was a deliberate act.")).not.toContain("deliberate");
    expect(clean("This was a deliberate act.")).toContain("noted for review");
  });

  it("replaces 'intentional'", () => {
    expect(clean("The damage was intentional.")).not.toContain("intentional");
    expect(clean("The damage was intentional.")).toContain("noted for review");
  });

  it("replaces 'wrongdoing'", () => {
    expect(clean("Evidence of wrongdoing was found.")).not.toContain("wrongdoing");
    expect(clean("Evidence of wrongdoing was found.")).toContain("matter requiring review");
  });

  it("replaces 'misrepresentation'", () => {
    expect(clean("There is a misrepresentation in the claim.")).not.toContain("misrepresentation");
    expect(clean("There is a misrepresentation in the claim.")).toContain("additional verification needed");
  });
});

// ─── Scoring / internal logic references ─────────────────────────────────────

describe("Scoring and internal logic references — auto-replaced", () => {
  it("replaces 'fraud risk score'", () => {
    expect(clean("The fraud risk score is 72.")).not.toContain("fraud risk score");
    expect(clean("The fraud risk score is 72.")).toContain("assessment result");
  });

  it("replaces 'confidence score'", () => {
    expect(clean("The confidence score is 0.85.")).not.toContain("confidence score");
    expect(clean("The confidence score is 0.85.")).toContain("assessment result");
  });

  it("replaces 'weighted score'", () => {
    expect(clean("The weighted score indicates risk.")).not.toContain("weighted score");
    expect(clean("The weighted score indicates risk.")).toContain("assessment result");
  });

  it("replaces 'high risk'", () => {
    expect(clean("This is a high risk claim.")).not.toContain("high risk");
    expect(clean("This is a high risk claim.")).toContain("requires verification");
  });

  it("replaces 'medium risk'", () => {
    expect(clean("This is a medium risk claim.")).not.toContain("medium risk");
  });

  it("replaces 'flagged'", () => {
    expect(clean("The claim was flagged for review.")).not.toContain("flagged");
    expect(clean("The claim was flagged for review.")).toContain("noted for review");
  });

  it("replaces 'red flag'", () => {
    expect(clean("There is a red flag in the documentation.")).not.toContain("red flag");
    expect(clean("There is a red flag in the documentation.")).toContain("item noted for review");
  });
});

// ─── Block-only terms ─────────────────────────────────────────────────────────

describe("Block-only terms — export blocked, not replaced", () => {
  it("blocks export when 'criminal' is present", () => {
    expect(isBlocked("This may be criminal behaviour.")).toBe(true);
  });

  it("blocks export when 'prosecution' is present", () => {
    expect(isBlocked("The matter is referred for prosecution.")).toBe(true);
  });

  it("blocks export when 'perjury' is present", () => {
    expect(isBlocked("The claimant committed perjury.")).toBe(true);
  });

  it("blocks export when 'staged accident' is present", () => {
    expect(isBlocked("This appears to be a staged accident.")).toBe(true);
  });

  it("does NOT replace the blocked term in the sanitised output", () => {
    const result = sanitiseExternalReport({ field: "This may be criminal." });
    // The word is still in the sanitised output (not replaced) — the block prevents export
    expect(result.sanitised.field).toContain("criminal");
    expect(result.safe).toBe(false);
  });

  it("includes the blocked phrase in blockedPhrases", () => {
    const result = sanitiseExternalReport({ field: "Referred for prosecution." });
    expect(result.blockedPhrases.length).toBeGreaterThan(0);
    expect(result.blockedPhrases[0].phrase.toLowerCase()).toContain("prosecution");
  });
});

// ─── Tone violation patterns ──────────────────────────────────────────────────

describe("Tone violation patterns — export blocked", () => {
  it("blocks 'proven to be false'", () => {
    expect(isBlocked("The statement was proven to be false.")).toBe(true);
  });

  it("blocks 'knowingly'", () => {
    expect(isBlocked("The claimant knowingly submitted false documents.")).toBe(true);
  });

  it("blocks 'willfully'", () => {
    expect(isBlocked("The damage was willfully caused.")).toBe(true);
  });

  it("blocks 'with intent to'", () => {
    expect(isBlocked("The claim was made with intent to deceive.")).toBe(true);
  });

  it("blocks 'for personal gain'", () => {
    expect(isBlocked("The claim was inflated for personal gain.")).toBe(true);
  });

  it("blocks 'to defraud'", () => {
    expect(isBlocked("An attempt was made to defraud the insurer.")).toBe(true);
  });
});

// ─── Capitalisation preservation ─────────────────────────────────────────────

describe("Capitalisation preservation", () => {
  it("preserves sentence-start capitalisation when replacing 'Fraud'", () => {
    const result = clean("Fraud was detected in this claim.");
    expect(result.charAt(0)).toBe(result.charAt(0).toUpperCase());
    expect(result).not.toContain("Fraud");
  });

  it("keeps lowercase replacement when term is mid-sentence", () => {
    const result = clean("The claim shows fraud indicators.");
    // 'fraud' is mid-sentence — replacement should be lowercase
    expect(result).toContain("assessment finding");
    expect(result.charAt(0)).toBe("T");
  });

  it("preserves capitalisation for 'Anomaly' at sentence start", () => {
    const result = clean("Anomaly detected in the report.");
    expect(result.charAt(0)).toBe("R"); // 'Review outcome detected...'
  });
});

// ─── Correction log ───────────────────────────────────────────────────────────

describe("Correction log", () => {
  it("logs each substitution with field, original, corrected, rule", () => {
    const result = sanitiseExternalReport({ summary: "The fraud score is suspicious." });
    expect(result.corrections.length).toBeGreaterThan(0);
    const fraudCorrection = result.corrections.find((c) => c.rule === "fraud-language");
    expect(fraudCorrection).toBeDefined();
    expect(fraudCorrection!.field).toBe("summary");
    expect(fraudCorrection!.original.toLowerCase()).toContain("fraud");
    expect(fraudCorrection!.corrected.toLowerCase()).toContain("assessment finding");
  });

  it("logs multiple corrections from the same field", () => {
    const result = sanitiseExternalReport({
      text: "The anomaly score is suspicious and the fraud is confirmed.",
    });
    expect(result.corrections.length).toBeGreaterThanOrEqual(3);
  });

  it("logs corrections from different fields separately", () => {
    const result = sanitiseExternalReport({
      fieldA: "fraud detected",
      fieldB: "anomaly found",
    });
    const fields = result.corrections.map((c) => c.field);
    expect(fields).toContain("fieldA");
    expect(fields).toContain("fieldB");
  });
});

// ─── Multi-field report sanitisation ─────────────────────────────────────────

describe("Multi-field report sanitisation (sanitiseReportNarrative)", () => {
  const mockNarrative = {
    executiveSummary: "The fraud risk score is elevated.",
    damageAssessmentAnalysis: "An anomaly was found in the damage pattern.",
    aiIntelligenceExplanation: "The AI flagged suspicious indicators.",
    costComparisonAnalysis: "Costs appear inflated based on the weighted score.",
    fraudRiskEvaluation: "The fraud risk score is 78 out of 100.",
    physicsValidationSummary: "Physics analysis is consistent.",
    workflowAuditTrail: "No issues detected.",
    recommendations: "Further review recommended.",
  };

  it("sanitises all eight narrative fields", () => {
    const result = sanitiseReportNarrative(mockNarrative);
    for (const [key, value] of Object.entries(result.sanitised)) {
      expect(value).not.toMatch(/\bfraud\b/i);
      expect(value).not.toMatch(/\banomaly\b/i);
      expect(value).not.toMatch(/\bsuspicious\b/i);
      expect(value).not.toMatch(/\binflated\b/i);
    }
  });

  it("returns safe === true when all terms are replaceable", () => {
    const result = sanitiseReportNarrative(mockNarrative);
    expect(result.safe).toBe(true);
  });

  it("returns safe === false when a block-only term is present", () => {
    const blockedNarrative = {
      ...mockNarrative,
      recommendations: "Refer for criminal prosecution.",
    };
    const result = sanitiseReportNarrative(blockedNarrative);
    expect(result.safe).toBe(false);
    expect(result.blockedPhrases.some((b) => b.field === "recommendations")).toBe(true);
  });
});

// ─── Safe passthrough ─────────────────────────────────────────────────────────

describe("Safe passthrough — no forbidden terms", () => {
  it("returns safe === true for clean text", () => {
    const result = sanitiseExternalReport({
      summary: "The claim has been reviewed and additional verification is required.",
      details: "All documentation has been assessed and the findings are noted for review.",
    });
    expect(result.safe).toBe(true);
    expect(result.corrections.length).toBe(0);
    expect(result.blockedPhrases.length).toBe(0);
  });

  it("passes through non-string values unchanged", () => {
    const result = sanitiseExternalReport({
      count: 42 as any,
      flag: true as any,
      label: "assessment finding",
    });
    expect(result.sanitised.count).toBe("42");
    expect(result.sanitised.flag).toBe("true");
    expect(result.sanitised.label).toBe("assessment finding");
  });
});

// ─── buildBlockError ──────────────────────────────────────────────────────────

describe("buildBlockError", () => {
  it("returns code EXPORT_BLOCKED", () => {
    const err = buildBlockError([{ field: "summary", phrase: "criminal" }]);
    expect(err.code).toBe("EXPORT_BLOCKED");
  });

  it("includes phrase and field in message", () => {
    const err = buildBlockError([{ field: "summary", phrase: "criminal" }]);
    expect(err.message).toContain("criminal");
    expect(err.message).toContain("summary");
  });

  it("includes all blocked phrases in details", () => {
    const blocked = [
      { field: "f1", phrase: "criminal" },
      { field: "f2", phrase: "prosecution" },
    ];
    const err = buildBlockError(blocked);
    expect(err.details).toHaveLength(2);
    expect(err.details[0].phrase).toBe("criminal");
    expect(err.details[1].phrase).toBe("prosecution");
  });
});

// ─── Rule completeness ────────────────────────────────────────────────────────

describe("Rule registry completeness", () => {
  it("has at least 25 sanitisation rules", () => {
    expect(SANITISATION_RULES.length).toBeGreaterThanOrEqual(25);
  });

  it("has at least 6 tone violation patterns", () => {
    expect(TONE_VIOLATION_PATTERNS.length).toBeGreaterThanOrEqual(6);
  });

  it("every non-block rule has a non-empty replacement string", () => {
    for (const rule of SANITISATION_RULES) {
      if (!rule.blockIfFound) {
        expect(rule.replacement.length).toBeGreaterThan(0);
      }
    }
  });

  it("every rule has a unique label", () => {
    const labels = SANITISATION_RULES.map((r) => r.label);
    const unique = new Set(labels);
    expect(unique.size).toBe(labels.length);
  });
});
