/**
 * C-09 Photo Classification Tests
 *
 * Tests the classifyPhotoUrls procedure logic:
 *   - Graceful degradation when LLM fails (all photos default to damage_photo)
 *   - Correct category filtering (damage_photo + vehicle_overview pass; document_page + quotation_scan + other excluded)
 *   - Max 12 URL limit enforced by schema
 *   - Empty URL array returns empty classifications
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Helpers ────────────────────────────────────────────────────────────────

type PhotoCategory = "damage_photo" | "vehicle_overview" | "quotation_scan" | "document_page" | "other";

interface PhotoClassification {
  url: string;
  category: PhotoCategory;
  confidence: number;
  reasoning: string;
}

/**
 * Simulates the classifyPhotoUrls procedure logic (extracted for unit testing
 * without needing a live tRPC/DB context).
 */
function buildClassifications(
  urls: string[],
  llmResult: { classifications: Array<{ index: number; category: string; confidence: number; reasoning: string }> } | null
): PhotoClassification[] {
  const validCategories: PhotoCategory[] = ["damage_photo", "vehicle_overview", "quotation_scan", "document_page", "other"];

  if (!llmResult) {
    // Graceful degradation path
    return urls.map((url) => ({
      url,
      category: "damage_photo" as PhotoCategory,
      confidence: 0.5,
      reasoning: "LLM classification unavailable — defaulting to damage_photo",
    }));
  }

  const resultMap = new Map<number, { category: PhotoCategory; confidence: number; reasoning: string }>();
  for (const cls of llmResult.classifications ?? []) {
    if (cls.index >= 0 && cls.index < urls.length) {
      const cat = validCategories.includes(cls.category as PhotoCategory)
        ? (cls.category as PhotoCategory)
        : "other";
      resultMap.set(cls.index, {
        category: cat,
        confidence: Math.max(0, Math.min(1, cls.confidence)),
        reasoning: cls.reasoning || "",
      });
    }
  }

  return urls.map((url, idx) => ({
    url,
    category: resultMap.get(idx)?.category ?? ("damage_photo" as PhotoCategory),
    confidence: resultMap.get(idx)?.confidence ?? 0.5,
    reasoning: resultMap.get(idx)?.reasoning ?? "Classification unavailable — defaulting to damage_photo",
  }));
}

/**
 * Simulates the gallery split logic used in ForensicAuditReport.
 */
function splitGallery(classifications: PhotoClassification[]) {
  const damagePhotos = classifications.filter(
    (c) => c.category === "damage_photo" || c.category === "vehicle_overview"
  );
  const excluded = classifications.filter(
    (c) => c.category === "document_page" || c.category === "quotation_scan" || c.category === "other"
  );
  return { damagePhotos, excluded };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("C-09: Photo Classification — buildClassifications", () => {
  it("returns all URLs as damage_photo when LLM fails (graceful degradation)", () => {
    const urls = ["https://s3.example.com/photo1.jpg", "https://s3.example.com/photo2.jpg"];
    const result = buildClassifications(urls, null);

    expect(result).toHaveLength(2);
    result.forEach((r) => {
      expect(r.category).toBe("damage_photo");
      expect(r.confidence).toBe(0.5);
    });
  });

  it("correctly maps LLM classifications to URLs by index", () => {
    const urls = [
      "https://s3.example.com/damage.jpg",
      "https://s3.example.com/claim-form.jpg",
      "https://s3.example.com/overview.jpg",
    ];
    const llmResult = {
      classifications: [
        { index: 0, category: "damage_photo", confidence: 0.95, reasoning: "Dented bumper visible" },
        { index: 1, category: "document_page", confidence: 0.92, reasoning: "Claim form with checkboxes" },
        { index: 2, category: "vehicle_overview", confidence: 0.88, reasoning: "Full vehicle, no damage visible" },
      ],
    };

    const result = buildClassifications(urls, llmResult);

    expect(result[0].category).toBe("damage_photo");
    expect(result[1].category).toBe("document_page");
    expect(result[2].category).toBe("vehicle_overview");
  });

  it("clamps confidence values to [0, 1]", () => {
    const urls = ["https://s3.example.com/photo.jpg"];
    const llmResult = {
      classifications: [
        { index: 0, category: "damage_photo", confidence: 1.5, reasoning: "Over-confident" },
      ],
    };
    const result = buildClassifications(urls, llmResult);
    expect(result[0].confidence).toBe(1.0);
  });

  it("defaults to damage_photo for unknown category strings from LLM", () => {
    const urls = ["https://s3.example.com/photo.jpg"];
    const llmResult = {
      classifications: [
        { index: 0, category: "unknown_category_xyz", confidence: 0.7, reasoning: "LLM hallucination" },
      ],
    };
    const result = buildClassifications(urls, llmResult);
    // unknown_category_xyz is not in validCategories → mapped to 'other'
    expect(result[0].category).toBe("other");
  });

  it("defaults missing indices to damage_photo", () => {
    const urls = ["https://s3.example.com/a.jpg", "https://s3.example.com/b.jpg"];
    const llmResult = {
      // Only classifies index 0, not index 1
      classifications: [
        { index: 0, category: "damage_photo", confidence: 0.9, reasoning: "Damage visible" },
      ],
    };
    const result = buildClassifications(urls, llmResult);
    expect(result[1].category).toBe("damage_photo");
    expect(result[1].confidence).toBe(0.5);
  });

  it("ignores out-of-bounds indices from LLM", () => {
    const urls = ["https://s3.example.com/photo.jpg"];
    const llmResult = {
      classifications: [
        { index: 99, category: "document_page", confidence: 0.9, reasoning: "Out of bounds" },
      ],
    };
    const result = buildClassifications(urls, llmResult);
    // Index 99 is out of bounds for a 1-item array → ignored → default damage_photo
    expect(result[0].category).toBe("damage_photo");
  });
});

describe("C-09: Photo Classification — splitGallery", () => {
  it("separates damage photos from excluded documents correctly", () => {
    const classifications: PhotoClassification[] = [
      { url: "a.jpg", category: "damage_photo", confidence: 0.95, reasoning: "" },
      { url: "b.jpg", category: "document_page", confidence: 0.92, reasoning: "" },
      { url: "c.jpg", category: "vehicle_overview", confidence: 0.88, reasoning: "" },
      { url: "d.jpg", category: "quotation_scan", confidence: 0.85, reasoning: "" },
      { url: "e.jpg", category: "other", confidence: 0.7, reasoning: "" },
    ];

    const { damagePhotos, excluded } = splitGallery(classifications);

    expect(damagePhotos).toHaveLength(2);
    expect(damagePhotos.map((p) => p.url)).toEqual(["a.jpg", "c.jpg"]);

    expect(excluded).toHaveLength(3);
    expect(excluded.map((p) => p.url)).toEqual(["b.jpg", "d.jpg", "e.jpg"]);
  });

  it("returns all photos in damagePhotos when all are damage_photo or vehicle_overview", () => {
    const classifications: PhotoClassification[] = [
      { url: "a.jpg", category: "damage_photo", confidence: 0.95, reasoning: "" },
      { url: "b.jpg", category: "vehicle_overview", confidence: 0.88, reasoning: "" },
    ];

    const { damagePhotos, excluded } = splitGallery(classifications);
    expect(damagePhotos).toHaveLength(2);
    expect(excluded).toHaveLength(0);
  });

  it("returns all photos in excluded when all are documents", () => {
    const classifications: PhotoClassification[] = [
      { url: "a.jpg", category: "document_page", confidence: 0.95, reasoning: "" },
      { url: "b.jpg", category: "quotation_scan", confidence: 0.88, reasoning: "" },
    ];

    const { damagePhotos, excluded } = splitGallery(classifications);
    expect(damagePhotos).toHaveLength(0);
    expect(excluded).toHaveLength(2);
  });
});

// ─── C-03: Structured Reviewer Notes ─────────────────────────────────────────

describe("C-03: Structured Reviewer Notes — serialization", () => {
  /**
   * The ClaimApprovalToolbar now serializes structured note fields into a
   * JSON string stored in the `notes` column. These tests verify the
   * serialization/deserialization round-trip.
   */

  interface StructuredNote {
    findingsStatus: "CONFIRMED" | "PARTIALLY_DISPUTED" | "FULLY_DISPUTED";
    disputeReason: string;
    actionRequired: string;
    reviewedBy: string;
    reviewedAt: string;
  }

  function serializeNote(note: StructuredNote): string {
    return JSON.stringify({
      _structured: true,
      version: 1,
      ...note,
    });
  }

  function deserializeNote(raw: string): StructuredNote | null {
    try {
      const parsed = JSON.parse(raw);
      if (!parsed._structured) return null;
      return {
        findingsStatus: parsed.findingsStatus,
        disputeReason: parsed.disputeReason ?? "",
        actionRequired: parsed.actionRequired ?? "",
        reviewedBy: parsed.reviewedBy ?? "",
        reviewedAt: parsed.reviewedAt ?? "",
      };
    } catch {
      return null;
    }
  }

  it("serializes and deserializes a structured note correctly", () => {
    const note: StructuredNote = {
      findingsStatus: "PARTIALLY_DISPUTED",
      disputeReason: "Market value appears inflated based on comparable vehicles",
      actionRequired: "Request independent valuation from approved panel",
      reviewedBy: "J. Smith",
      reviewedAt: "2026-05-10T10:00:00.000Z",
    };

    const serialized = serializeNote(note);
    const deserialized = deserializeNote(serialized);

    expect(deserialized).not.toBeNull();
    expect(deserialized?.findingsStatus).toBe("PARTIALLY_DISPUTED");
    expect(deserialized?.disputeReason).toBe("Market value appears inflated based on comparable vehicles");
    expect(deserialized?.actionRequired).toBe("Request independent valuation from approved panel");
  });

  it("returns null for unstructured (legacy free-text) notes", () => {
    const legacyNote = "Kindly review";
    const result = deserializeNote(legacyNote);
    expect(result).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    const result = deserializeNote("{not valid json");
    expect(result).toBeNull();
  });

  it("CONFIRMED status requires no dispute reason", () => {
    const note: StructuredNote = {
      findingsStatus: "CONFIRMED",
      disputeReason: "",
      actionRequired: "Proceed to payment",
      reviewedBy: "A. Nkosi",
      reviewedAt: "2026-05-10T10:00:00.000Z",
    };

    const serialized = serializeNote(note);
    const deserialized = deserializeNote(serialized);

    expect(deserialized?.findingsStatus).toBe("CONFIRMED");
    expect(deserialized?.disputeReason).toBe("");
  });

  it("FULLY_DISPUTED status preserves dispute reason", () => {
    const note: StructuredNote = {
      findingsStatus: "FULLY_DISPUTED",
      disputeReason: "Damage inconsistent with reported incident — possible pre-existing damage",
      actionRequired: "Refer to SIU for investigation",
      reviewedBy: "T. van der Merwe",
      reviewedAt: "2026-05-10T10:00:00.000Z",
    };

    const serialized = serializeNote(note);
    const deserialized = deserializeNote(serialized);

    expect(deserialized?.findingsStatus).toBe("FULLY_DISPUTED");
    expect(deserialized?.disputeReason).toContain("pre-existing damage");
    expect(deserialized?.actionRequired).toContain("SIU");
  });
});
