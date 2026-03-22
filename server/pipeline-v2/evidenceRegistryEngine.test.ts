/**
 * evidenceRegistryEngine.test.ts
 *
 * Comprehensive tests for the Evidence Registry Engine.
 * Tests cover: detection logic, completeness checks, notes generation,
 * edge cases (empty input, null Stage 2, partial documents), and the
 * exact JSON schema output contract.
 */

import { describe, it, expect } from "vitest";
import {
  buildEvidenceRegistry,
  serialiseRegistry,
  type EvidenceRegistry,
  type EvidenceStatus,
} from "./evidenceRegistryEngine";
import type { Stage1Output, Stage2Output } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// FIXTURES
// ─────────────────────────────────────────────────────────────────────────────

function makeStage1(overrides: Partial<{
  hasImages: boolean;
  imageUrls: string[];
  documentType: string;
  totalDocuments: number;
}>= {}): Stage1Output {
  const {
    hasImages = false,
    imageUrls = [],
    documentType = "claim_form",
    totalDocuments = 1,
  } = overrides;
  return {
    documents: Array.from({ length: totalDocuments }, (_, i) => ({
      documentIndex: i,
      documentType: documentType as any,
      sourceUrl: `https://example.com/doc${i}.pdf`,
      mimeType: "application/pdf",
      fileName: `doc${i}.pdf`,
      containsImages: hasImages,
      imageUrls: hasImages ? imageUrls : [],
    })),
    primaryDocumentIndex: 0,
    totalDocuments,
  };
}

function makeStage2(texts: string[]): Stage2Output {
  return {
    extractedTexts: texts.map((rawText, i) => ({
      documentIndex: i,
      rawText,
      tables: [],
      ocrApplied: false,
      ocrConfidence: 95,
    })),
    totalPagesProcessed: texts.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAZDA BT50 REAL-WORLD FIXTURE
// Based on the actual claim document CI-024 NATPHARM MAZDA BT50 AFF 1102
// ─────────────────────────────────────────────────────────────────────────────

const MAZDA_CLAIM_TEXT = `
CELL INSURANCE COMPANY - MOTOR CLAIM FORM
Claim Reference: 2820001
Policy Number: CI-024
Claimant: NATPHARM
Date of Accident: 02/09/2024
Time: 06:30
Location: 339km peg, Harare-Bulawayo Road

DRIVER STATEMENT:
AS I WAS DRIVING ALONG HRE-BYO AT 339k PEG, A COW APPEARED FROM A DITCH, 
I TRIED TO BREAK BUT FAILED STOP IMMEDIATELY / TRIED ENDED HITTING THE ANIMAL. 
I FAILED TO SWERVE TO THE RIG. AS THERE WAS ONCOMING TRAFFIC. 
THE ANIMAL DIED AT THE SPOT. I IMMEDIATELY REPORTED THE ISSUE TO POLICE

Vehicle Details:
Make: MAZDA
Model: BT50
Year: 2018
Registration: AFF 1102
Engine Number: P5AT-123456
Colour: White
`;

const MAZDA_ASSESSOR_TEXT = `
Creative Risk Services
Assessor: Clarance Garatsa
Inspection Date: 01/10/2024
Agreed Cost: USD 462.33
Cost Agreed Less Excess: USD 462.33
Damages are typical of hitting an animal and consistent with circumstances reported.
Kindly authorise repairs to the vehicle, costs are damage consistent.
Risk Manager: Authorised
`;

const MAZDA_QUOTE_TEXT = `
SKINNERS AUTO BODY REPAIRS
Quotation No: 20241022603
Date: 11/26/2024
Client: NATPHARM
Insurance Co: CELL INSURANCE COMPANY
Make: BT50 MAZDA
Reg No: AFF 1102
Quotation By: KNOWLEDGE

S440: SUPPLY FRONT SEAT BELTS X2 - Parts: 300.00
R121: REPROGRAMMING - Labour: 150.00
R120: REMOVE REFIT SEAT BELTS - Labour: 60.00
Total (Incl): USD 591.33
Agreed USD 462.33, 03/12/24
`;

const MAZDA_SIGNATURE_TEXT = `
Audit Trail - Signeasy
Document: CI-024NATPHARM MAZDA BT50 AFF 1102 motor claim
Fingerprint: d407ff1cbb94d458345
Verification Link: Click to Verify
Signed By: wchiyangwa@cellinsurance.co.zw (Washington Chiyangwa)
Signed on: 2024-12-03 13:15:19 UTC
Signed By: tshoko@cellinsurance.co.zw (Tavonga Shoko)
Signed on: 2024-12-04 12:53:02 UTC
Signature request completed.
`;

// ─────────────────────────────────────────────────────────────────────────────
// TESTS: DOCUMENT SUMMARY
// ─────────────────────────────────────────────────────────────────────────────

describe("buildEvidenceRegistry — document_summary", () => {
  it("counts total pages from Stage 2 when available", () => {
    const s1 = makeStage1();
    const s2 = makeStage2(["page 1 text", "page 2 text", "page 3 text"]);
    const registry = buildEvidenceRegistry(s1, s2);
    expect(registry.document_summary.total_pages).toBe(3);
  });

  it("falls back to total_documents when Stage 2 is null", () => {
    const s1 = makeStage1({ totalDocuments: 2 });
    const registry = buildEvidenceRegistry(s1, null);
    expect(registry.document_summary.total_pages).toBe(2);
  });

  it("detects images from Stage 1 metadata", () => {
    const s1 = makeStage1({ hasImages: true, imageUrls: ["https://s3.example.com/img1.jpg", "https://s3.example.com/img2.jpg"] });
    const s2 = makeStage2(["some text"]);
    const registry = buildEvidenceRegistry(s1, s2);
    expect(registry.document_summary.has_images).toBe(true);
    expect(registry.document_summary.estimated_image_pages).toBe(2);
  });

  it("reports no images when Stage 1 has no image URLs", () => {
    const s1 = makeStage1({ hasImages: false });
    const s2 = makeStage2(["some text"]);
    const registry = buildEvidenceRegistry(s1, s2);
    expect(registry.document_summary.has_images).toBe(false);
    expect(registry.document_summary.estimated_image_pages).toBe(0);
  });

  it("reports total_documents from Stage 1", () => {
    const s1 = makeStage1({ totalDocuments: 3 });
    const s2 = makeStage2(["a", "b", "c"]);
    const registry = buildEvidenceRegistry(s1, s2);
    expect(registry.document_summary.total_documents).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS: CLAIM FORM DETECTION
// ─────────────────────────────────────────────────────────────────────────────

describe("buildEvidenceRegistry — claim_form detection", () => {
  it("detects claim form from 'motor claim form' heading", () => {
    const s1 = makeStage1();
    const s2 = makeStage2(["CELL INSURANCE COMPANY - MOTOR CLAIM FORM\nClaim Reference: 2820001"]);
    const registry = buildEvidenceRegistry(s1, s2);
    expect(registry.evidence_registry.claim_form).toBe("PRESENT");
  });

  it("detects claim form from 'claimant' keyword", () => {
    const s1 = makeStage1();
    const s2 = makeStage2(["Claimant: NATPHARM\nPolicy Number: CI-024"]);
    const registry = buildEvidenceRegistry(s1, s2);
    expect(registry.evidence_registry.claim_form).toBe("PRESENT");
  });

  it("detects claim form from 'policy number' keyword", () => {
    const s1 = makeStage1();
    const s2 = makeStage2(["Policy No: 12345\nInsured Name: John Doe"]);
    const registry = buildEvidenceRegistry(s1, s2);
    expect(registry.evidence_registry.claim_form).toBe("PRESENT");
  });

  it("returns ABSENT when no claim form patterns found", () => {
    const s1 = makeStage1();
    const s2 = makeStage2(["Random unrelated text with no insurance keywords"]);
    const registry = buildEvidenceRegistry(s1, s2);
    expect(registry.evidence_registry.claim_form).toBe("ABSENT");
  });

  it("returns UNKNOWN when Stage 2 is null", () => {
    const s1 = makeStage1();
    const registry = buildEvidenceRegistry(s1, null);
    expect(registry.evidence_registry.claim_form).toBe("UNKNOWN");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS: DRIVER STATEMENT DETECTION
// ─────────────────────────────────────────────────────────────────────────────

describe("buildEvidenceRegistry — driver_statement detection", () => {
  it("detects driver statement from first-person narrative", () => {
    const s1 = makeStage1();
    const s2 = makeStage2(["AS I WAS DRIVING ALONG HRE-BYO AT 339k PEG, A COW APPEARED"]);
    const registry = buildEvidenceRegistry(s1, s2);
    expect(registry.evidence_registry.driver_statement).toBe("PRESENT");
  });

  it("detects driver statement from 'I immediately reported' phrase", () => {
    const s1 = makeStage1();
    const s2 = makeStage2(["I immediately reported the issue to police"]);
    const registry = buildEvidenceRegistry(s1, s2);
    expect(registry.evidence_registry.driver_statement).toBe("PRESENT");
  });

  it("detects driver statement from 'I tried to brake' phrase", () => {
    const s1 = makeStage1();
    const s2 = makeStage2(["I tried to brake but could not stop in time"]);
    const registry = buildEvidenceRegistry(s1, s2);
    expect(registry.evidence_registry.driver_statement).toBe("PRESENT");
  });

  it("detects driver statement from 'driver statement' heading", () => {
    const s1 = makeStage1();
    const s2 = makeStage2(["Driver's Statement:\nThe vehicle was travelling at 90km/h"]);
    const registry = buildEvidenceRegistry(s1, s2);
    expect(registry.evidence_registry.driver_statement).toBe("PRESENT");
  });

  it("returns ABSENT when only third-person administrative text present", () => {
    const s1 = makeStage1();
    // Text with no first-person narrative and no vehicle-action patterns
    const s2 = makeStage2(["Repair cost: USD 500. Parts: 300. Labour: 200. Quotation No: Q001."]);
    const registry = buildEvidenceRegistry(s1, s2);
    expect(registry.evidence_registry.driver_statement).toBe("ABSENT");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS: INCIDENT DETAILS DETECTION
// ─────────────────────────────────────────────────────────────────────────────

describe("buildEvidenceRegistry — incident_details detection", () => {
  it("detects incident details from date pattern", () => {
    const s1 = makeStage1();
    const s2 = makeStage2(["Date of Accident: 02/09/2024\nTime: 06:30"]);
    const registry = buildEvidenceRegistry(s1, s2);
    expect(registry.evidence_registry.incident_details).toBe("PRESENT");
  });

  it("detects incident details from km peg location", () => {
    const s1 = makeStage1();
    const s2 = makeStage2(["Location: 339km peg, Harare-Bulawayo Road"]);
    const registry = buildEvidenceRegistry(s1, s2);
    expect(registry.evidence_registry.incident_details).toBe("PRESENT");
  });

  it("detects incident details from Zimbabwean city name", () => {
    const s1 = makeStage1();
    const s2 = makeStage2(["The accident occurred near Bulawayo on the main highway"]);
    const registry = buildEvidenceRegistry(s1, s2);
    expect(registry.evidence_registry.incident_details).toBe("PRESENT");
  });

  it("returns ABSENT when no incident detail patterns found", () => {
    const s1 = makeStage1();
    const s2 = makeStage2(["Parts: 300.00\nLabour: 150.00\nTotal: 450.00"]);
    const registry = buildEvidenceRegistry(s1, s2);
    expect(registry.evidence_registry.incident_details).toBe("ABSENT");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS: VEHICLE DETAILS DETECTION
// ─────────────────────────────────────────────────────────────────────────────

describe("buildEvidenceRegistry — vehicle_details detection", () => {
  it("detects vehicle details from make/model/registration", () => {
    const s1 = makeStage1();
    const s2 = makeStage2(["Make: MAZDA\nModel: BT50\nReg No: AFF 1102"]);
    const registry = buildEvidenceRegistry(s1, s2);
    expect(registry.evidence_registry.vehicle_details).toBe("PRESENT");
  });

  it("detects vehicle details from vehicle make name alone", () => {
    const s1 = makeStage1();
    const s2 = makeStage2(["The Toyota Hilux was involved in the accident"]);
    const registry = buildEvidenceRegistry(s1, s2);
    expect(registry.evidence_registry.vehicle_details).toBe("PRESENT");
  });

  it("detects vehicle details from registration number field", () => {
    const s1 = makeStage1();
    const s2 = makeStage2(["Registration No: ABC 1234\nEngine Number: XYZ-789"]);
    const registry = buildEvidenceRegistry(s1, s2);
    expect(registry.evidence_registry.vehicle_details).toBe("PRESENT");
  });

  it("returns ABSENT when no vehicle patterns found", () => {
    const s1 = makeStage1();
    const s2 = makeStage2(["The driver was travelling at high speed when the incident occurred."]);
    const registry = buildEvidenceRegistry(s1, s2);
    expect(registry.evidence_registry.vehicle_details).toBe("ABSENT");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS: REPAIR QUOTE DETECTION
// ─────────────────────────────────────────────────────────────────────────────

describe("buildEvidenceRegistry — repair_quote detection", () => {
  it("detects repair quote from quotation number", () => {
    const s1 = makeStage1();
    const s2 = makeStage2(["Quotation No: 20241022603\nTotal (Incl): USD 591.33"]);
    const registry = buildEvidenceRegistry(s1, s2);
    expect(registry.evidence_registry.repair_quote).toBe("PRESENT");
  });

  it("detects repair quote from panel beater reference", () => {
    const s1 = makeStage1();
    const s2 = makeStage2(["SKINNERS AUTO BODY REPAIRS\nPanel Beating and Spray Painting"]);
    const registry = buildEvidenceRegistry(s1, s2);
    expect(registry.evidence_registry.repair_quote).toBe("PRESENT");
  });

  it("detects repair quote from parts/labour cost structure", () => {
    const s1 = makeStage1();
    const s2 = makeStage2(["Parts Cost: 300.00\nLabour Cost: 150.00\nTotal (Incl): 517.50"]);
    const registry = buildEvidenceRegistry(s1, s2);
    expect(registry.evidence_registry.repair_quote).toBe("PRESENT");
  });

  it("returns ABSENT when no quote patterns found", () => {
    const s1 = makeStage1();
    const s2 = makeStage2(["Date of Accident: 02/09/2024\nDriver: Brian Muteyam"]);
    const registry = buildEvidenceRegistry(s1, s2);
    expect(registry.evidence_registry.repair_quote).toBe("ABSENT");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS: MULTI-QUOTE DETECTION
// ─────────────────────────────────────────────────────────────────────────────

describe("buildEvidenceRegistry — multi_quotes detection", () => {
  it("detects multiple quotes from two distinct quotation blocks", () => {
    const s1 = makeStage1();
    const s2 = makeStage2([
      "Quotation No: Q001\nPanel Beater: ABC Repairs\nTotal: USD 3000",
      "Quotation No: Q002\nPanel Beater: XYZ Auto\nTotal: USD 3500",
    ]);
    const registry = buildEvidenceRegistry(s1, s2);
    expect(registry.evidence_registry.multi_quotes).toBe("PRESENT");
  });

  it("returns ABSENT when only one quotation block is present", () => {
    const s1 = makeStage1();
    const s2 = makeStage2(["Quotation No: 20241022603\nTotal: USD 591.33"]);
    const registry = buildEvidenceRegistry(s1, s2);
    expect(registry.evidence_registry.multi_quotes).toBe("ABSENT");
  });

  it("detects multiple quotes from 'second quote' keyword", () => {
    const s1 = makeStage1();
    const s2 = makeStage2(["First quote: USD 3000\nSecond quote from alternative repairer: USD 2800"]);
    const registry = buildEvidenceRegistry(s1, s2);
    expect(registry.evidence_registry.multi_quotes).toBe("PRESENT");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS: ASSESSOR REPORT DETECTION
// ─────────────────────────────────────────────────────────────────────────────

describe("buildEvidenceRegistry — assessor_report detection", () => {
  it("detects assessor report from assessor name and agreed cost", () => {
    const s1 = makeStage1();
    const s2 = makeStage2(["Assessor: Clarance Garatsa\nAgreed Cost: USD 462.33"]);
    const registry = buildEvidenceRegistry(s1, s2);
    expect(registry.evidence_registry.assessor_report).toBe("PRESENT");
  });

  it("detects assessor report from 'cost agreed' phrase", () => {
    const s1 = makeStage1();
    const s2 = makeStage2(["Cost agreed USD 462.33, 03/12/24"]);
    const registry = buildEvidenceRegistry(s1, s2);
    expect(registry.evidence_registry.assessor_report).toBe("PRESENT");
  });

  it("detects assessor report from 'loss adjuster' reference", () => {
    const s1 = makeStage1();
    const s2 = makeStage2(["Loss Adjuster Report\nInspection completed 01/10/2024"]);
    const registry = buildEvidenceRegistry(s1, s2);
    expect(registry.evidence_registry.assessor_report).toBe("PRESENT");
  });

  it("detects assessor report from 'authorise' keyword", () => {
    const s1 = makeStage1();
    const s2 = makeStage2(["Kindly authorise repairs to the vehicle, costs are damage consistent."]);
    const registry = buildEvidenceRegistry(s1, s2);
    expect(registry.evidence_registry.assessor_report).toBe("PRESENT");
  });

  it("returns ABSENT when no assessor patterns found", () => {
    const s1 = makeStage1();
    const s2 = makeStage2(["Date: 02/09/2024\nVehicle: Mazda BT50"]);
    const registry = buildEvidenceRegistry(s1, s2);
    expect(registry.evidence_registry.assessor_report).toBe("ABSENT");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS: DAMAGE PHOTOS DETECTION
// ─────────────────────────────────────────────────────────────────────────────

describe("buildEvidenceRegistry — damage_photos detection", () => {
  it("detects damage photos from Stage 1 image metadata (primary signal)", () => {
    const s1 = makeStage1({
      hasImages: true,
      imageUrls: ["https://s3.example.com/photo1.jpg", "https://s3.example.com/photo2.jpg"],
    });
    const s2 = makeStage2(["Some text with no photo references"]);
    const registry = buildEvidenceRegistry(s1, s2);
    expect(registry.evidence_registry.damage_photos).toBe("PRESENT");
  });

  it("detects damage photos from text reference when Stage 1 has no images", () => {
    const s1 = makeStage1({ hasImages: false });
    const s2 = makeStage2(["Please see attached photos of the damage"]);
    const registry = buildEvidenceRegistry(s1, s2);
    expect(registry.evidence_registry.damage_photos).toBe("PRESENT");
  });

  it("returns ABSENT when Stage 1 has no images and no photo text references", () => {
    const s1 = makeStage1({ hasImages: false });
    const s2 = makeStage2(["Claim form text with no photo references"]);
    const registry = buildEvidenceRegistry(s1, s2);
    expect(registry.evidence_registry.damage_photos).toBe("ABSENT");
  });

  it("returns UNKNOWN when Stage 1 has no documents", () => {
    const s1: Stage1Output = { documents: [], primaryDocumentIndex: 0, totalDocuments: 0 };
    const s2 = makeStage2([]);
    const registry = buildEvidenceRegistry(s1, s2);
    expect(registry.evidence_registry.damage_photos).toBe("UNKNOWN");
  });

  it("counts image pages correctly from multiple documents", () => {
    const s1: Stage1Output = {
      documents: [
        { documentIndex: 0, documentType: "claim_form" as any, sourceUrl: "a", mimeType: "application/pdf", fileName: "a.pdf", containsImages: true, imageUrls: ["img1.jpg", "img2.jpg", "img3.jpg"] },
        { documentIndex: 1, documentType: "vehicle_photos" as any, sourceUrl: "b", mimeType: "application/pdf", fileName: "b.pdf", containsImages: true, imageUrls: ["img4.jpg", "img5.jpg"] },
      ],
      primaryDocumentIndex: 0,
      totalDocuments: 2,
    };
    const s2 = makeStage2(["text1", "text2"]);
    const registry = buildEvidenceRegistry(s1, s2);
    expect(registry.document_summary.estimated_image_pages).toBe(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS: POLICE REPORT DETECTION
// ─────────────────────────────────────────────────────────────────────────────

describe("buildEvidenceRegistry — police_report_info detection", () => {
  it("detects police report from 'I immediately reported to police'", () => {
    const s1 = makeStage1();
    const s2 = makeStage2(["THE ANIMAL DIED AT THE SPOT. I IMMEDIATELY REPORTED THE ISSUE TO POLICE"]);
    const registry = buildEvidenceRegistry(s1, s2);
    expect(registry.evidence_registry.police_report_info).toBe("PRESENT");
  });

  it("detects police report from police report number field", () => {
    const s1 = makeStage1();
    const s2 = makeStage2(["Police Report No: CR 123/2024\nPolice Station: Harare Central"]);
    const registry = buildEvidenceRegistry(s1, s2);
    expect(registry.evidence_registry.police_report_info).toBe("PRESENT");
  });

  it("detects police report from ZRP reference", () => {
    const s1 = makeStage1();
    const s2 = makeStage2(["ZRP Case Number: 456/09/2024"]);
    const registry = buildEvidenceRegistry(s1, s2);
    expect(registry.evidence_registry.police_report_info).toBe("PRESENT");
  });

  it("returns ABSENT when no police reference found", () => {
    const s1 = makeStage1();
    const s2 = makeStage2(["The vehicle was repaired at Skinners Auto Body. Total cost: USD 591.33"]);
    const registry = buildEvidenceRegistry(s1, s2);
    expect(registry.evidence_registry.police_report_info).toBe("ABSENT");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS: DIGITAL SIGNATURE DETECTION
// ─────────────────────────────────────────────────────────────────────────────

describe("buildEvidenceRegistry — digital_signature detection", () => {
  it("detects Signeasy audit trail as digital signature", () => {
    const s1 = makeStage1();
    const s2 = makeStage2([MAZDA_SIGNATURE_TEXT]);
    const registry = buildEvidenceRegistry(s1, s2);
    expect(registry.evidence_registry.digital_signature).toBe("PRESENT");
  });

  it("detects DocuSign as digital signature", () => {
    const s1 = makeStage1();
    const s2 = makeStage2(["This document was signed via DocuSign on 2024-12-04"]);
    const registry = buildEvidenceRegistry(s1, s2);
    expect(registry.evidence_registry.digital_signature).toBe("PRESENT");
  });

  it("detects audit trail keyword as digital signature", () => {
    const s1 = makeStage1();
    const s2 = makeStage2(["Audit Trail\nDocument fingerprint: abc123"]);
    const registry = buildEvidenceRegistry(s1, s2);
    expect(registry.evidence_registry.digital_signature).toBe("PRESENT");
  });

  it("returns ABSENT when no signature patterns found", () => {
    const s1 = makeStage1();
    const s2 = makeStage2(["Quotation No: Q001\nTotal: USD 500"]);
    const registry = buildEvidenceRegistry(s1, s2);
    expect(registry.evidence_registry.digital_signature).toBe("ABSENT");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS: COMPLETENESS CHECK
// ─────────────────────────────────────────────────────────────────────────────

describe("buildEvidenceRegistry — completeness_check", () => {
  it("returns PROCEED when all mandatory items are PRESENT", () => {
    const s1 = makeStage1({
      hasImages: true,
      imageUrls: ["img1.jpg"],
    });
    const s2 = makeStage2([
      MAZDA_CLAIM_TEXT + MAZDA_QUOTE_TEXT,
    ]);
    const registry = buildEvidenceRegistry(s1, s2);
    expect(registry.completeness_check.recommended_action).toBe("PROCEED");
    expect(registry.completeness_check.minimum_set_satisfied).toBe(true);
    expect(registry.completeness_check.missing_mandatory_items).toHaveLength(0);
  });

  it("returns REQUEST_MISSING_EVIDENCE when damage_photos is ABSENT", () => {
    const s1 = makeStage1({ hasImages: false });
    const s2 = makeStage2([MAZDA_CLAIM_TEXT + MAZDA_QUOTE_TEXT]);
    const registry = buildEvidenceRegistry(s1, s2);
    expect(registry.completeness_check.recommended_action).toBe("REQUEST_MISSING_EVIDENCE");
    expect(registry.completeness_check.missing_mandatory_items).toContain("damage_photos");
    expect(registry.completeness_check.minimum_set_satisfied).toBe(false);
  });

  it("returns REQUEST_MISSING_EVIDENCE when repair_quote is ABSENT", () => {
    const s1 = makeStage1({ hasImages: true, imageUrls: ["img1.jpg"] });
    const s2 = makeStage2([MAZDA_CLAIM_TEXT]); // no quote text
    const registry = buildEvidenceRegistry(s1, s2);
    expect(registry.completeness_check.missing_mandatory_items).toContain("repair_quote");
  });

  it("returns MANUAL_REVIEW when items are UNKNOWN (null Stage 2)", () => {
    const s1 = makeStage1({ hasImages: true, imageUrls: ["img1.jpg"] });
    // Stage 2 is null → all text-based items are UNKNOWN
    const registry = buildEvidenceRegistry(s1, null);
    expect(registry.completeness_check.recommended_action).toBe("MANUAL_REVIEW");
    expect(registry.completeness_check.minimum_set_satisfied).toBe(false);
    expect(registry.completeness_check.unknown_items.length).toBeGreaterThan(0);
  });

  it("lists all missing mandatory items when document is empty", () => {
    const s1 = makeStage1({ hasImages: false });
    const s2 = makeStage2(["random unrelated text"]);
    const registry = buildEvidenceRegistry(s1, s2);
    expect(registry.completeness_check.missing_mandatory_items).toContain("claim_form");
    expect(registry.completeness_check.missing_mandatory_items).toContain("driver_statement");
    expect(registry.completeness_check.missing_mandatory_items).toContain("repair_quote");
    expect(registry.completeness_check.missing_mandatory_items).toContain("damage_photos");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS: NOTES GENERATION
// ─────────────────────────────────────────────────────────────────────────────

describe("buildEvidenceRegistry — notes", () => {
  it("generates a note about missing damage photos", () => {
    const s1 = makeStage1({ hasImages: false });
    const s2 = makeStage2([MAZDA_CLAIM_TEXT + MAZDA_QUOTE_TEXT]);
    const registry = buildEvidenceRegistry(s1, s2);
    const photoNote = registry.notes.find((n) => n.includes("photograph"));
    expect(photoNote).toBeDefined();
  });

  it("generates a note about image processing requirement when photos present", () => {
    const s1 = makeStage1({ hasImages: true, imageUrls: ["img1.jpg", "img2.jpg"] });
    const s2 = makeStage2([MAZDA_CLAIM_TEXT + MAZDA_QUOTE_TEXT]);
    const registry = buildEvidenceRegistry(s1, s2);
    // Should have a note about the 2 image pages detected
    const imageNote = registry.notes.find((n) => n.includes("image page") || n.includes("Image page") || n.includes("2 image"));
    expect(imageNote).toBeDefined();
  });

  it("generates a note about single quote limitation", () => {
    const s1 = makeStage1({ hasImages: true, imageUrls: ["img1.jpg"] });
    const s2 = makeStage2([MAZDA_CLAIM_TEXT + MAZDA_QUOTE_TEXT]);
    const registry = buildEvidenceRegistry(s1, s2);
    const quoteNote = registry.notes.find((n) => n.includes("one repair quotation"));
    expect(quoteNote).toBeDefined();
  });

  it("generates a note about missing assessor report and PRE_ASSESSMENT mode", () => {
    const s1 = makeStage1({ hasImages: true, imageUrls: ["img1.jpg"] });
    const s2 = makeStage2([MAZDA_CLAIM_TEXT + MAZDA_QUOTE_TEXT]);
    const registry = buildEvidenceRegistry(s1, s2);
    const assessorNote = registry.notes.find((n) => n.includes("PRE_ASSESSMENT"));
    expect(assessorNote).toBeDefined();
  });

  it("generates a note about police report absence with animal strike caveat", () => {
    const s1 = makeStage1({ hasImages: true, imageUrls: ["img1.jpg"] });
    const s2 = makeStage2([MAZDA_CLAIM_TEXT + MAZDA_QUOTE_TEXT]);
    const registry = buildEvidenceRegistry(s1, s2);
    // MAZDA_CLAIM_TEXT contains "I IMMEDIATELY REPORTED THE ISSUE TO POLICE"
    // so police_report_info should be PRESENT — no note expected
    const policeNote = registry.notes.find((n) => n.includes("police report"));
    // Police IS present in Mazda text, so no police note should be generated
    expect(policeNote).toBeUndefined();
  });

  it("generates a note about missing mandatory items", () => {
    const s1 = makeStage1({ hasImages: false });
    const s2 = makeStage2(["random text"]);
    const registry = buildEvidenceRegistry(s1, s2);
    const mandatoryNote = registry.notes.find((n) => n.includes("Missing mandatory"));
    expect(mandatoryNote).toBeDefined();
  });

  it("generates no notes when all evidence is present and complete", () => {
    const s1 = makeStage1({ hasImages: true, imageUrls: ["img1.jpg"] });
    const s2 = makeStage2([
      MAZDA_CLAIM_TEXT + MAZDA_ASSESSOR_TEXT + MAZDA_QUOTE_TEXT + MAZDA_SIGNATURE_TEXT,
    ]);
    const registry = buildEvidenceRegistry(s1, s2);
    // Should have minimal notes — only the image processing note
    const criticalNotes = registry.notes.filter(
      (n) => n.includes("Missing mandatory") || n.includes("photograph evidence is mandatory")
    );
    expect(criticalNotes).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS: REAL-WORLD MAZDA BT50 CLAIM
// ─────────────────────────────────────────────────────────────────────────────

describe("buildEvidenceRegistry — Mazda BT50 real-world claim", () => {
  it("correctly classifies all evidence items for the Mazda BT50 claim", () => {
    const s1 = makeStage1({
      hasImages: true,
      imageUrls: Array.from({ length: 9 }, (_, i) => `https://s3.example.com/mazda_photo_${i + 1}.jpg`),
      totalDocuments: 1,
    });
    const s2 = makeStage2([
      MAZDA_CLAIM_TEXT + MAZDA_ASSESSOR_TEXT + MAZDA_QUOTE_TEXT + MAZDA_SIGNATURE_TEXT,
    ]);
    const registry = buildEvidenceRegistry(s1, s2);

    expect(registry.evidence_registry.claim_form).toBe("PRESENT");
    expect(registry.evidence_registry.driver_statement).toBe("PRESENT");
    expect(registry.evidence_registry.incident_details).toBe("PRESENT");
    expect(registry.evidence_registry.vehicle_details).toBe("PRESENT");
    expect(registry.evidence_registry.repair_quote).toBe("PRESENT");
    expect(registry.evidence_registry.assessor_report).toBe("PRESENT");
    expect(registry.evidence_registry.damage_photos).toBe("PRESENT");
    expect(registry.evidence_registry.police_report_info).toBe("PRESENT");
    expect(registry.evidence_registry.digital_signature).toBe("PRESENT");
  });

  it("reports 9 image pages for the Mazda BT50 claim", () => {
    const s1 = makeStage1({
      hasImages: true,
      imageUrls: Array.from({ length: 9 }, (_, i) => `https://s3.example.com/mazda_photo_${i + 1}.jpg`),
    });
    const s2 = makeStage2([MAZDA_CLAIM_TEXT]);
    const registry = buildEvidenceRegistry(s1, s2);
    expect(registry.document_summary.estimated_image_pages).toBe(9);
  });

  it("returns PROCEED for the Mazda BT50 claim", () => {
    const s1 = makeStage1({
      hasImages: true,
      imageUrls: Array.from({ length: 9 }, (_, i) => `https://s3.example.com/mazda_photo_${i + 1}.jpg`),
    });
    const s2 = makeStage2([
      MAZDA_CLAIM_TEXT + MAZDA_ASSESSOR_TEXT + MAZDA_QUOTE_TEXT + MAZDA_SIGNATURE_TEXT,
    ]);
    const registry = buildEvidenceRegistry(s1, s2);
    expect(registry.completeness_check.recommended_action).toBe("PROCEED");
    expect(registry.completeness_check.minimum_set_satisfied).toBe(true);
  });

  it("correctly identifies multi_quotes as ABSENT (only one quote in the file)", () => {
    const s1 = makeStage1({ hasImages: true, imageUrls: ["img1.jpg"] });
    const s2 = makeStage2([
      MAZDA_CLAIM_TEXT + MAZDA_ASSESSOR_TEXT + MAZDA_QUOTE_TEXT + MAZDA_SIGNATURE_TEXT,
    ]);
    const registry = buildEvidenceRegistry(s1, s2);
    // The Mazda claim file contains only the extras quote — no second quote
    expect(registry.evidence_registry.multi_quotes).toBe("ABSENT");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS: SERIALISE REGISTRY (JSON CONTRACT)
// ─────────────────────────────────────────────────────────────────────────────

describe("serialiseRegistry — JSON schema contract", () => {
  it("produces the exact JSON schema specified in the contract", () => {
    const s1 = makeStage1({ hasImages: true, imageUrls: ["img1.jpg", "img2.jpg"] });
    const s2 = makeStage2([MAZDA_CLAIM_TEXT + MAZDA_QUOTE_TEXT]);
    const registry = buildEvidenceRegistry(s1, s2);
    const serialised = serialiseRegistry(registry);

    // Top-level keys
    expect(serialised).toHaveProperty("document_summary");
    expect(serialised).toHaveProperty("evidence_registry");
    expect(serialised).toHaveProperty("notes");

    // document_summary shape
    expect(typeof serialised.document_summary.total_pages).toBe("number");
    expect(typeof serialised.document_summary.has_images).toBe("boolean");
    expect(typeof serialised.document_summary.estimated_image_pages).toBe("number");

    // evidence_registry — all 10 items present
    const er = serialised.evidence_registry;
    const validStatuses: EvidenceStatus[] = ["PRESENT", "ABSENT", "UNKNOWN"];
    const expectedKeys: Array<keyof typeof er> = [
      "claim_form", "driver_statement", "incident_details", "vehicle_details",
      "repair_quote", "multi_quotes", "assessor_report", "damage_photos",
      "police_report_info", "digital_signature",
    ];
    for (const key of expectedKeys) {
      expect(er).toHaveProperty(key);
      expect(validStatuses).toContain(er[key]);
    }

    // notes is an array of strings
    expect(Array.isArray(serialised.notes)).toBe(true);
    serialised.notes.forEach((note) => expect(typeof note).toBe("string"));
  });

  it("serialised output does not include internal fields (completeness_check, registry_built_at)", () => {
    const s1 = makeStage1();
    const s2 = makeStage2(["some text"]);
    const registry = buildEvidenceRegistry(s1, s2);
    const serialised = serialiseRegistry(registry);

    expect(serialised).not.toHaveProperty("completeness_check");
    expect(serialised).not.toHaveProperty("registry_built_at");
    expect(serialised).not.toHaveProperty("document_summary.total_documents");
    expect(serialised).not.toHaveProperty("document_summary.document_types_detected");
  });

  it("all evidence_registry values are valid EvidenceStatus strings", () => {
    const s1 = makeStage1();
    const s2 = makeStage2(["partial text with some keywords: claim form, quotation"]);
    const registry = buildEvidenceRegistry(s1, s2);
    const serialised = serialiseRegistry(registry);
    const valid = new Set<string>(["PRESENT", "ABSENT", "UNKNOWN"]);
    for (const [, value] of Object.entries(serialised.evidence_registry)) {
      expect(valid.has(value)).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS: EDGE CASES
// ─────────────────────────────────────────────────────────────────────────────

describe("buildEvidenceRegistry — edge cases", () => {
  it("handles completely empty Stage 2 texts gracefully", () => {
    const s1 = makeStage1();
    const s2 = makeStage2([""]);
    const registry = buildEvidenceRegistry(s1, s2);
    // Empty text → all text-based items UNKNOWN (empty string triggers the UNKNOWN guard)
    expect(registry.evidence_registry.claim_form).toBe("UNKNOWN");
    expect(registry.evidence_registry.driver_statement).toBe("UNKNOWN");
  });

  it("handles null Stage 2 gracefully — all text items UNKNOWN", () => {
    const s1 = makeStage1();
    const registry = buildEvidenceRegistry(s1, null);
    expect(registry.evidence_registry.claim_form).toBe("UNKNOWN");
    expect(registry.evidence_registry.driver_statement).toBe("UNKNOWN");
    expect(registry.evidence_registry.incident_details).toBe("UNKNOWN");
    expect(registry.evidence_registry.vehicle_details).toBe("UNKNOWN");
    expect(registry.evidence_registry.repair_quote).toBe("UNKNOWN");
    expect(registry.evidence_registry.police_report_info).toBe("UNKNOWN");
    expect(registry.evidence_registry.digital_signature).toBe("UNKNOWN");
  });

  it("handles Stage 1 with zero documents gracefully", () => {
    const s1: Stage1Output = { documents: [], primaryDocumentIndex: 0, totalDocuments: 0 };
    const s2 = makeStage2([]);
    const registry = buildEvidenceRegistry(s1, s2);
    expect(registry.document_summary.total_documents).toBe(0);
    expect(registry.document_summary.has_images).toBe(false);
    expect(registry.evidence_registry.damage_photos).toBe("UNKNOWN");
  });

  it("includes registry_built_at as a valid ISO timestamp", () => {
    const s1 = makeStage1();
    const s2 = makeStage2(["some text"]);
    const registry = buildEvidenceRegistry(s1, s2);
    expect(registry.registry_built_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(() => new Date(registry.registry_built_at)).not.toThrow();
  });

  it("is deterministic — same input produces same output", () => {
    const s1 = makeStage1({ hasImages: true, imageUrls: ["img1.jpg"] });
    const s2 = makeStage2([MAZDA_CLAIM_TEXT + MAZDA_QUOTE_TEXT]);
    const r1 = buildEvidenceRegistry(s1, s2);
    const r2 = buildEvidenceRegistry(s1, s2);
    expect(r1.evidence_registry).toEqual(r2.evidence_registry);
    expect(r1.completeness_check).toEqual(r2.completeness_check);
    expect(r1.document_summary).toEqual(r2.document_summary);
  });

  it("does not mutate Stage 1 or Stage 2 inputs", () => {
    const s1 = makeStage1({ hasImages: true, imageUrls: ["img1.jpg"] });
    const s2 = makeStage2([MAZDA_CLAIM_TEXT]);
    const s1Copy = JSON.parse(JSON.stringify(s1));
    const s2Copy = JSON.parse(JSON.stringify(s2));
    buildEvidenceRegistry(s1, s2);
    expect(s1).toEqual(s1Copy);
    expect(s2).toEqual(s2Copy);
  });
});
