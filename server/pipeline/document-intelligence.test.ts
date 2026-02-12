import { describe, expect, it, vi } from "vitest";
import {
  calculateDataQuality,
  type DocumentExtractionResult,
  type ExtractedCostBreakdown,
  type DocumentClassification,
} from "./document-intelligence";

// ============================================================
// DATA QUALITY SCORING TESTS
// ============================================================

describe("calculateDataQuality", () => {
  it("returns 100% for a fully populated extraction result", () => {
    const result: DocumentExtractionResult = {
      classification: {
        documentType: "panel_beater_quote",
        confidence: 0.95,
        reasoning: "Test",
        isHandwritten: false,
        language: "en",
      },
      vehicle: {
        make: "Toyota",
        model: "Corolla",
        year: 2020,
        registration: "CA 123-456",
        vin: "1HGBH41JXMN109186",
        color: "White",
        mileage: 45000,
      },
      accident: {
        incidentDate: "2025-01-15",
        incidentLocation: "Cape Town",
        incidentDescription: "Rear-end collision",
        accidentType: "rear_end",
        estimatedSpeed: 40,
      },
      claimant: {
        claimantName: "John Doe",
        claimantIdNumber: "9001015009088",
        claimantContact: "0821234567",
      },
      repairItems: [
        {
          itemNumber: 1,
          description: "Front bumper",
          partNumber: "TB-001",
          category: "parts",
          damageLocation: "front",
          repairAction: "replace",
          quantity: 1,
          unitPrice: 5000,
          lineTotal: 5000,
          laborHours: 2,
          laborRate: 450,
          partsQuality: "oem",
          bettermentPercent: null,
          extractionConfidence: 0.9,
          isHandwritten: false,
        },
      ],
      costBreakdown: {
        laborCost: 900,
        partsCost: 5000,
        paintCost: 1200,
        materialsCost: 300,
        subletCost: 0,
        sundries: 150,
        vatAmount: 1132.50,
        totalExclVat: 7550,
        totalInclVat: 8682.50,
        totalLaborHours: 2,
        averageLaborRate: 450,
        totalPartsCount: 1,
        oemPartsCount: 1,
        aftermarketPartsCount: 0,
        repairVsReplaceRatio: 0,
        totalBetterment: 0,
      },
      claimReference: "CLM-2025-001",
      policyNumber: "POL-123456",
      assessorName: "Test Assessor",
      assessorLicenseNumber: "ASS-001",
      panelBeaterName: "Test Panel Beater",
      rawText: "Test raw text",
      dataQualityScore: 0,
      fieldsExtracted: 0,
      fieldsMissing: 0,
    };

    const quality = calculateDataQuality(result);
    expect(quality.score).toBe(100);
    expect(quality.missing).toBe(0);
    expect(quality.extracted).toBeGreaterThan(0);
  });

  it("returns 0% for a completely empty extraction result", () => {
    const result: DocumentExtractionResult = {
      classification: {
        documentType: "unknown",
        confidence: 0,
        reasoning: "",
        isHandwritten: false,
        language: "en",
      },
      vehicle: {
        make: null,
        model: null,
        year: null,
        registration: null,
        vin: null,
        color: null,
        mileage: null,
      },
      accident: {
        incidentDate: null,
        incidentLocation: null,
        incidentDescription: null,
        accidentType: null,
        estimatedSpeed: null,
      },
      claimant: {
        claimantName: null,
        claimantIdNumber: null,
        claimantContact: null,
      },
      repairItems: [],
      costBreakdown: {
        laborCost: 0,
        partsCost: 0,
        paintCost: 0,
        materialsCost: 0,
        subletCost: 0,
        sundries: 0,
        vatAmount: 0,
        totalExclVat: 0,
        totalInclVat: 0,
        totalLaborHours: null,
        averageLaborRate: null,
        totalPartsCount: 0,
        oemPartsCount: 0,
        aftermarketPartsCount: 0,
        repairVsReplaceRatio: null,
        totalBetterment: 0,
      },
      claimReference: null,
      policyNumber: null,
      assessorName: null,
      assessorLicenseNumber: null,
      panelBeaterName: null,
      rawText: "",
      dataQualityScore: 0,
      fieldsExtracted: 0,
      fieldsMissing: 0,
    };

    const quality = calculateDataQuality(result);
    expect(quality.score).toBe(0);
    expect(quality.extracted).toBe(0);
    expect(quality.missing).toBeGreaterThan(0);
  });

  it("returns partial score for partially populated result", () => {
    const result: DocumentExtractionResult = {
      classification: {
        documentType: "panel_beater_quote",
        confidence: 0.8,
        reasoning: "Test",
        isHandwritten: false,
        language: "en",
      },
      vehicle: {
        make: "Toyota",
        model: "Hilux",
        year: 2019,
        registration: null,
        vin: null,
        color: null,
        mileage: null,
      },
      accident: {
        incidentDate: "2025-06-01",
        incidentLocation: null,
        incidentDescription: null,
        accidentType: null,
        estimatedSpeed: null,
      },
      claimant: {
        claimantName: "Jane Smith",
        claimantIdNumber: null,
        claimantContact: null,
      },
      repairItems: [
        {
          itemNumber: 1,
          description: "Door panel",
          partNumber: null,
          category: "parts",
          damageLocation: "left_side",
          repairAction: "repair",
          quantity: 1,
          unitPrice: 3000,
          lineTotal: 3000,
          laborHours: null,
          laborRate: null,
          partsQuality: null,
          bettermentPercent: null,
          extractionConfidence: 0.7,
          isHandwritten: true,
        },
      ],
      costBreakdown: {
        laborCost: 0,
        partsCost: 3000,
        paintCost: 0,
        materialsCost: 0,
        subletCost: 0,
        sundries: 0,
        vatAmount: 450,
        totalExclVat: 3000,
        totalInclVat: 3450,
        totalLaborHours: null,
        averageLaborRate: null,
        totalPartsCount: 1,
        oemPartsCount: 0,
        aftermarketPartsCount: 0,
        repairVsReplaceRatio: null,
        totalBetterment: 0,
      },
      claimReference: null,
      policyNumber: null,
      assessorName: null,
      assessorLicenseNumber: null,
      panelBeaterName: null,
      rawText: "Some text",
      dataQualityScore: 0,
      fieldsExtracted: 0,
      fieldsMissing: 0,
    };

    const quality = calculateDataQuality(result);
    expect(quality.score).toBeGreaterThan(0);
    expect(quality.score).toBeLessThan(100);
    expect(quality.extracted).toBeGreaterThan(0);
    expect(quality.missing).toBeGreaterThan(0);
  });

  it("counts repair items and cost total as quality indicators", () => {
    const withItems: DocumentExtractionResult = {
      classification: { documentType: "panel_beater_quote", confidence: 0.9, reasoning: "", isHandwritten: false, language: "en" },
      vehicle: { make: null, model: null, year: null, registration: null, vin: null, color: null, mileage: null },
      accident: { incidentDate: null, incidentLocation: null, incidentDescription: null, accidentType: null, estimatedSpeed: null },
      claimant: { claimantName: null, claimantIdNumber: null, claimantContact: null },
      repairItems: [{ itemNumber: 1, description: "Test", partNumber: null, category: "parts", damageLocation: null, repairAction: null, quantity: 1, unitPrice: 100, lineTotal: 100, laborHours: null, laborRate: null, partsQuality: null, bettermentPercent: null, extractionConfidence: 0.8, isHandwritten: false }],
      costBreakdown: { laborCost: 0, partsCost: 100, paintCost: 0, materialsCost: 0, subletCost: 0, sundries: 0, vatAmount: 15, totalExclVat: 100, totalInclVat: 115, totalLaborHours: null, averageLaborRate: null, totalPartsCount: 1, oemPartsCount: 0, aftermarketPartsCount: 0, repairVsReplaceRatio: null, totalBetterment: 0 },
      claimReference: null, policyNumber: null, assessorName: null, assessorLicenseNumber: null, panelBeaterName: null,
      rawText: "", dataQualityScore: 0, fieldsExtracted: 0, fieldsMissing: 0,
    };

    const withoutItems: DocumentExtractionResult = {
      ...withItems,
      repairItems: [],
      costBreakdown: { ...withItems.costBreakdown, totalInclVat: 0 },
    };

    const qualityWith = calculateDataQuality(withItems);
    const qualityWithout = calculateDataQuality(withoutItems);

    expect(qualityWith.score).toBeGreaterThan(qualityWithout.score);
  });
});

// ============================================================
// DOCUMENT CLASSIFICATION TYPE TESTS
// ============================================================

describe("DocumentClassification types", () => {
  it("supports all expected document types", () => {
    const validTypes = [
      "panel_beater_quote",
      "police_report",
      "claim_form",
      "assessor_report",
      "supporting_evidence",
      "damage_image",
      "unknown",
    ];

    validTypes.forEach((type) => {
      const classification: DocumentClassification = {
        documentType: type as any,
        confidence: 0.9,
        reasoning: "Test",
        isHandwritten: false,
        language: "en",
      };
      expect(classification.documentType).toBe(type);
    });
  });

  it("tracks handwritten status correctly", () => {
    const handwritten: DocumentClassification = {
      documentType: "panel_beater_quote",
      confidence: 0.75,
      reasoning: "Contains handwritten content",
      isHandwritten: true,
      language: "af",
    };

    expect(handwritten.isHandwritten).toBe(true);
    expect(handwritten.language).toBe("af");
  });
});

// ============================================================
// COST BREAKDOWN VALIDATION TESTS
// ============================================================

describe("ExtractedCostBreakdown", () => {
  it("calculates correct totals", () => {
    const breakdown: ExtractedCostBreakdown = {
      laborCost: 5000,
      partsCost: 15000,
      paintCost: 3000,
      materialsCost: 500,
      subletCost: 2000,
      sundries: 300,
      vatAmount: 3870,
      totalExclVat: 25800,
      totalInclVat: 29670,
      totalLaborHours: 12,
      averageLaborRate: 416.67,
      totalPartsCount: 8,
      oemPartsCount: 5,
      aftermarketPartsCount: 3,
      repairVsReplaceRatio: 0.4,
      totalBetterment: 1500,
    };

    // Verify sub-totals add up
    const componentTotal = breakdown.laborCost + breakdown.partsCost + breakdown.paintCost +
      breakdown.materialsCost + breakdown.subletCost + breakdown.sundries;
    expect(componentTotal).toBe(breakdown.totalExclVat);

    // Verify VAT calculation (15% in South Africa)
    const expectedVat = breakdown.totalExclVat * 0.15;
    expect(Math.abs(breakdown.vatAmount - expectedVat)).toBeLessThan(1);

    // Verify total incl VAT
    expect(breakdown.totalInclVat).toBe(breakdown.totalExclVat + breakdown.vatAmount);

    // Verify parts counts
    expect(breakdown.oemPartsCount + breakdown.aftermarketPartsCount).toBe(breakdown.totalPartsCount);
  });

  it("handles zero-cost breakdowns", () => {
    const empty: ExtractedCostBreakdown = {
      laborCost: 0,
      partsCost: 0,
      paintCost: 0,
      materialsCost: 0,
      subletCost: 0,
      sundries: 0,
      vatAmount: 0,
      totalExclVat: 0,
      totalInclVat: 0,
      totalLaborHours: null,
      averageLaborRate: null,
      totalPartsCount: 0,
      oemPartsCount: 0,
      aftermarketPartsCount: 0,
      repairVsReplaceRatio: null,
      totalBetterment: 0,
    };

    expect(empty.totalInclVat).toBe(0);
    expect(empty.totalLaborHours).toBeNull();
  });
});

// ============================================================
// REPAIR ITEM EXTRACTION TESTS
// ============================================================

describe("ExtractedRepairItem structure", () => {
  it("supports all repair action types", () => {
    const actions = ["repair", "replace", "refinish", "blend", "remove_refit"];
    actions.forEach((action) => {
      const item = {
        itemNumber: 1,
        description: "Test item",
        partNumber: null,
        category: "parts" as const,
        damageLocation: "front",
        repairAction: action,
        quantity: 1,
        unitPrice: 1000,
        lineTotal: 1000,
        laborHours: null,
        laborRate: null,
        partsQuality: null,
        bettermentPercent: null,
        extractionConfidence: 0.9,
        isHandwritten: false,
      };
      expect(item.repairAction).toBe(action);
    });
  });

  it("supports all parts quality types", () => {
    const qualities = ["oem", "genuine", "aftermarket", "used", "reconditioned"];
    qualities.forEach((quality) => {
      const item = {
        itemNumber: 1,
        description: "Test",
        partNumber: null,
        category: "parts" as const,
        damageLocation: null,
        repairAction: "replace",
        quantity: 1,
        unitPrice: 500,
        lineTotal: 500,
        laborHours: null,
        laborRate: null,
        partsQuality: quality,
        bettermentPercent: null,
        extractionConfidence: 0.85,
        isHandwritten: false,
      };
      expect(item.partsQuality).toBe(quality);
    });
  });

  it("supports all item categories", () => {
    const categories = ["parts", "labor", "paint", "diagnostic", "sundries", "sublet", "other"];
    categories.forEach((cat) => {
      const item = {
        itemNumber: 1,
        description: "Test",
        partNumber: null,
        category: cat,
        damageLocation: null,
        repairAction: null,
        quantity: 1,
        unitPrice: null,
        lineTotal: null,
        laborHours: null,
        laborRate: null,
        partsQuality: null,
        bettermentPercent: null,
        extractionConfidence: 0.5,
        isHandwritten: false,
      };
      expect(item.category).toBe(cat);
    });
  });

  it("tracks handwritten items correctly", () => {
    const handwrittenItem = {
      itemNumber: 1,
      description: "Handwritten bumper repair",
      partNumber: null,
      category: "parts" as const,
      damageLocation: "front",
      repairAction: "repair",
      quantity: 1,
      unitPrice: 2500,
      lineTotal: 2500,
      laborHours: 3,
      laborRate: 400,
      partsQuality: null,
      bettermentPercent: null,
      extractionConfidence: 0.65,
      isHandwritten: true,
    };

    expect(handwrittenItem.isHandwritten).toBe(true);
    // Handwritten items typically have lower confidence
    expect(handwrittenItem.extractionConfidence).toBeLessThan(0.8);
  });
});

// ============================================================
// VARIANCE CATEGORIZATION TESTS
// ============================================================

describe("Variance categorization logic", () => {
  // Testing the categorization logic that's used in generateVarianceDatasets
  function categorizeVariance(absPercent: number): string {
    if (absPercent < 5) return "within_threshold";
    if (absPercent < 15) return "minor_variance";
    if (absPercent < 30) return "significant_variance";
    if (absPercent < 50) return "major_variance";
    return "extreme_variance";
  }

  it("categorizes within threshold (< 5%)", () => {
    expect(categorizeVariance(0)).toBe("within_threshold");
    expect(categorizeVariance(2.5)).toBe("within_threshold");
    expect(categorizeVariance(4.99)).toBe("within_threshold");
  });

  it("categorizes minor variance (5-15%)", () => {
    expect(categorizeVariance(5)).toBe("minor_variance");
    expect(categorizeVariance(10)).toBe("minor_variance");
    expect(categorizeVariance(14.99)).toBe("minor_variance");
  });

  it("categorizes significant variance (15-30%)", () => {
    expect(categorizeVariance(15)).toBe("significant_variance");
    expect(categorizeVariance(25)).toBe("significant_variance");
    expect(categorizeVariance(29.99)).toBe("significant_variance");
  });

  it("categorizes major variance (30-50%)", () => {
    expect(categorizeVariance(30)).toBe("major_variance");
    expect(categorizeVariance(40)).toBe("major_variance");
    expect(categorizeVariance(49.99)).toBe("major_variance");
  });

  it("categorizes extreme variance (>= 50%)", () => {
    expect(categorizeVariance(50)).toBe("extreme_variance");
    expect(categorizeVariance(75)).toBe("extreme_variance");
    expect(categorizeVariance(100)).toBe("extreme_variance");
    expect(categorizeVariance(200)).toBe("extreme_variance");
  });
});

// ============================================================
// PIPELINE PROCESSING RESULT STRUCTURE TESTS
// ============================================================

describe("PipelineProcessingResult structure", () => {
  it("tracks document processing counts correctly", () => {
    const result = {
      historicalClaimId: 42,
      documentsProcessed: 3,
      documentsFailed: 1,
      extractionResults: [],
      pipelineStatus: "extraction_complete",
      errors: ["Document 4: OCR failed"],
    };

    expect(result.documentsProcessed + result.documentsFailed).toBe(4);
    expect(result.errors).toHaveLength(1);
    expect(result.pipelineStatus).toBe("extraction_complete");
  });

  it("handles all-failed scenario", () => {
    const result = {
      historicalClaimId: 0,
      documentsProcessed: 0,
      documentsFailed: 5,
      extractionResults: [],
      pipelineStatus: "failed",
      errors: [
        "Document 1: not found",
        "Document 2: OCR failed",
        "Document 3: classification failed",
        "Document 4: extraction failed",
        "Document 5: timeout",
      ],
    };

    expect(result.documentsProcessed).toBe(0);
    expect(result.pipelineStatus).toBe("failed");
    expect(result.errors).toHaveLength(5);
  });
});
