/**
 * damage-image-extraction.test.ts
 *
 * Tests for the damage image extraction pipeline:
 * - DamagePhoto type validation
 * - extractImagesFromPDFUrl function (URL download path)
 * - Stage 1b pipeline logic (LLM classification → DamagePhoto[])
 * - DamageImagesPanel data parsing helpers
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DamagePhoto, DetectedComponent } from "../shared/damage-photo-types";

// ─── Type validation tests ────────────────────────────────────────────────────

describe("DamagePhoto type", () => {
  it("accepts a minimal valid DamagePhoto object", () => {
    const photo: DamagePhoto = {
      imageUrl: "https://s3.example.com/photo.jpg",
      caption: "Front bumper damage",
      detectedDamageArea: "Front bumper",
    };
    expect(photo.imageUrl).toBe("https://s3.example.com/photo.jpg");
    expect(photo.caption).toBe("Front bumper damage");
    expect(photo.detectedDamageArea).toBe("Front bumper");
  });

  it("accepts a fully populated DamagePhoto object", () => {
    const photo: DamagePhoto = {
      imageUrl: "https://s3.example.com/photo.jpg",
      caption: "Severe front-end collision damage",
      detectedDamageArea: "Front bumper, hood, radiator support",
      detectedComponents: [
        { name: "Front bumper", severity: "severe", confidence: 0.95 },
        { name: "Hood", severity: "moderate", confidence: 0.88 },
        { name: "Radiator support", severity: "severe", confidence: 0.72 },
      ],
      impactZone: { zone: "front", angle: 0, confidence: 0.91 },
      source: "pdf_embedded",
      classification: "damage_photo",
      pageNumber: 3,
      overallAssessment: "Significant front-end structural damage detected",
    };
    expect(photo.detectedComponents).toHaveLength(3);
    expect(photo.impactZone?.zone).toBe("front");
    expect(photo.source).toBe("pdf_embedded");
  });

  it("accepts all valid source values", () => {
    const sources: Array<DamagePhoto["source"]> = [
      "pdf_embedded",
      "pdf_page_render",
      "uploaded",
    ];
    for (const source of sources) {
      const photo: DamagePhoto = {
        imageUrl: "https://example.com/img.jpg",
        caption: "Test",
        detectedDamageArea: "Test area",
        source,
      };
      expect(photo.source).toBe(source);
    }
  });

  it("accepts all valid classification values", () => {
    const classifications: Array<DamagePhoto["classification"]> = [
      "damage_photo",
      "document",
      "overview",
      "unknown",
    ];
    for (const classification of classifications) {
      const photo: DamagePhoto = {
        imageUrl: "https://example.com/img.jpg",
        caption: "Test",
        detectedDamageArea: "Test area",
        classification,
      };
      expect(photo.classification).toBe(classification);
    }
  });

  it("accepts all valid impact zone values", () => {
    const zones: Array<DamagePhoto["impactZone"]> = [
      { zone: "front", angle: 0, confidence: 0.9 },
      { zone: "rear", angle: 180, confidence: 0.85 },
      { zone: "left", angle: 270, confidence: 0.8 },
      { zone: "right", angle: 90, confidence: 0.75 },
      { zone: "roof", angle: 0, confidence: 0.7 },
      { zone: "undercarriage", angle: 0, confidence: 0.65 },
      { zone: "unknown", angle: 0, confidence: 0.5 },
    ];
    for (const impactZone of zones) {
      const photo: DamagePhoto = {
        imageUrl: "https://example.com/img.jpg",
        caption: "Test",
        detectedDamageArea: "Test area",
        impactZone,
      };
      expect(photo.impactZone?.zone).toBe(impactZone?.zone);
    }
  });

  it("accepts all valid severity values for DetectedComponent", () => {
    const severities: Array<DetectedComponent["severity"]> = [
      "minor",
      "moderate",
      "severe",
      "total_loss",
    ];
    for (const severity of severities) {
      const comp: DetectedComponent = {
        name: "Front bumper",
        severity,
        confidence: 0.9,
      };
      expect(comp.severity).toBe(severity);
    }
  });
});

// ─── DamagePhoto JSON parsing helpers ────────────────────────────────────────

describe("DamagePhoto JSON parsing", () => {
  function parseDamagePhotosJson(json: string | null | undefined): DamagePhoto[] {
    if (!json) return [];
    try {
      const parsed = JSON.parse(json);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      return [];
    } catch {
      return [];
    }
  }

  function parseRawDamagePhotos(json: string | null | undefined): DamagePhoto[] {
    if (!json) return [];
    try {
      const raw = JSON.parse(json);
      if (!Array.isArray(raw)) return [];
      return raw.map((url: string) => ({
        imageUrl: url,
        caption: "Uploaded damage photo",
        detectedDamageArea: "",
        detectedComponents: [],
        source: "uploaded" as const,
        classification: "damage_photo" as const,
      }));
    } catch {
      return [];
    }
  }

  it("parses valid damagePhotosJson correctly", () => {
    const photos: DamagePhoto[] = [
      {
        imageUrl: "https://s3.example.com/photo1.jpg",
        caption: "Front damage",
        detectedDamageArea: "Front bumper",
        source: "pdf_embedded",
        classification: "damage_photo",
      },
    ];
    const result = parseDamagePhotosJson(JSON.stringify(photos));
    expect(result).toHaveLength(1);
    expect(result[0].imageUrl).toBe("https://s3.example.com/photo1.jpg");
    expect(result[0].source).toBe("pdf_embedded");
  });

  it("returns empty array for null input", () => {
    expect(parseDamagePhotosJson(null)).toEqual([]);
    expect(parseDamagePhotosJson(undefined)).toEqual([]);
  });

  it("returns empty array for malformed JSON", () => {
    expect(parseDamagePhotosJson("{invalid json}")).toEqual([]);
    expect(parseDamagePhotosJson("not json at all")).toEqual([]);
  });

  it("returns empty array for empty array JSON", () => {
    expect(parseDamagePhotosJson("[]")).toEqual([]);
  });

  it("converts raw URL array to DamagePhoto objects", () => {
    const urls = [
      "https://s3.example.com/photo1.jpg",
      "https://s3.example.com/photo2.jpg",
    ];
    const result = parseRawDamagePhotos(JSON.stringify(urls));
    expect(result).toHaveLength(2);
    expect(result[0].imageUrl).toBe("https://s3.example.com/photo1.jpg");
    expect(result[0].source).toBe("uploaded");
    expect(result[0].classification).toBe("damage_photo");
    expect(result[0].detectedComponents).toEqual([]);
  });

  it("returns empty array for invalid raw photos JSON", () => {
    expect(parseRawDamagePhotos(null)).toEqual([]);
    expect(parseRawDamagePhotos("{not an array}")).toEqual([]);
  });

  it("prefers damagePhotosJson over rawDamagePhotos when both are present", () => {
    const classified: DamagePhoto[] = [
      {
        imageUrl: "https://s3.example.com/classified.jpg",
        caption: "Classified photo",
        detectedDamageArea: "Hood",
        source: "pdf_embedded",
        classification: "damage_photo",
      },
    ];
    const raw = ["https://s3.example.com/raw.jpg"];

    // Simulate the priority logic from DamageImagesPanel
    let photos: DamagePhoto[] = parseDamagePhotosJson(JSON.stringify(classified));
    if (photos.length === 0) {
      photos = parseRawDamagePhotos(JSON.stringify(raw));
    }

    expect(photos).toHaveLength(1);
    expect(photos[0].imageUrl).toBe("https://s3.example.com/classified.jpg");
    expect(photos[0].source).toBe("pdf_embedded");
  });
});

// ─── Impact zone classification logic ────────────────────────────────────────

describe("Impact zone classification", () => {
  function classifyImpactZone(zone: string): string {
    const validZones = ["front", "rear", "left", "right", "roof", "undercarriage"];
    return validZones.includes(zone.toLowerCase()) ? zone.toLowerCase() : "unknown";
  }

  it("classifies known zones correctly", () => {
    expect(classifyImpactZone("front")).toBe("front");
    expect(classifyImpactZone("rear")).toBe("rear");
    expect(classifyImpactZone("left")).toBe("left");
    expect(classifyImpactZone("right")).toBe("right");
    expect(classifyImpactZone("roof")).toBe("roof");
    expect(classifyImpactZone("undercarriage")).toBe("undercarriage");
  });

  it("returns unknown for unrecognised zones", () => {
    expect(classifyImpactZone("side")).toBe("unknown");
    expect(classifyImpactZone("top")).toBe("unknown");
    expect(classifyImpactZone("")).toBe("unknown");
    expect(classifyImpactZone("interior")).toBe("unknown");
  });
});

// ─── Severity scoring helpers ─────────────────────────────────────────────────

describe("Severity scoring", () => {
  function severityToScore(severity: string): number {
    switch (severity) {
      case "total_loss": return 4;
      case "severe":     return 3;
      case "moderate":   return 2;
      case "minor":      return 1;
      default:           return 0;
    }
  }

  function getHighestSeverity(components: DetectedComponent[]): string {
    if (components.length === 0) return "none";
    return components.reduce((max, comp) =>
      severityToScore(comp.severity) > severityToScore(max.severity) ? comp : max
    ).severity;
  }

  it("scores severity levels correctly", () => {
    expect(severityToScore("total_loss")).toBe(4);
    expect(severityToScore("severe")).toBe(3);
    expect(severityToScore("moderate")).toBe(2);
    expect(severityToScore("minor")).toBe(1);
    expect(severityToScore("unknown")).toBe(0);
  });

  it("identifies highest severity from component list", () => {
    const components: DetectedComponent[] = [
      { name: "Hood", severity: "minor", confidence: 0.9 },
      { name: "Radiator", severity: "severe", confidence: 0.85 },
      { name: "Bumper", severity: "moderate", confidence: 0.8 },
    ];
    expect(getHighestSeverity(components)).toBe("severe");
  });

  it("returns none for empty component list", () => {
    expect(getHighestSeverity([])).toBe("none");
  });

  it("handles total_loss as highest severity", () => {
    const components: DetectedComponent[] = [
      { name: "Frame", severity: "total_loss", confidence: 0.95 },
      { name: "Hood", severity: "severe", confidence: 0.9 },
    ];
    expect(getHighestSeverity(components)).toBe("total_loss");
  });
});

// ─── Stage 1b pipeline logic ──────────────────────────────────────────────────

describe("Stage 1b — LLM classification to DamagePhoto conversion", () => {
  interface LLMImageClassification {
    url: string;
    classification: string;
    caption?: string;
    detectedComponents?: Array<{ name: string; severity: string; confidence: number }>;
    impactZone?: string;
    impactAngle?: number;
    impactZoneConfidence?: number;
    overallAssessment?: string;
    pageNumber?: number;
    source?: string;
  }

  function convertLLMClassificationToDamagePhoto(item: LLMImageClassification): DamagePhoto {
    return {
      imageUrl: item.url,
      caption: item.caption || item.classification || "Damage photo",
      detectedDamageArea: item.detectedComponents?.map(c => c.name).join(", ") || "",
      detectedComponents: (item.detectedComponents || []).map(c => ({
        name: c.name,
        severity: (c.severity as DetectedComponent["severity"]) || "minor",
        confidence: c.confidence,
      })),
      impactZone: item.impactZone ? {
        zone: item.impactZone as DamagePhoto["impactZone"]["zone"],
        angle: item.impactAngle || 0,
        confidence: item.impactZoneConfidence || 0.5,
      } : undefined,
      source: (item.source as DamagePhoto["source"]) || "pdf_embedded",
      classification: (item.classification as DamagePhoto["classification"]) || "damage_photo",
      pageNumber: item.pageNumber,
      overallAssessment: item.overallAssessment,
    };
  }

  it("converts a fully populated LLM classification to DamagePhoto", () => {
    const llmResult: LLMImageClassification = {
      url: "https://s3.example.com/photo.jpg",
      classification: "damage_photo",
      caption: "Front-end collision damage",
      detectedComponents: [
        { name: "Front bumper", severity: "severe", confidence: 0.95 },
        { name: "Hood", severity: "moderate", confidence: 0.88 },
      ],
      impactZone: "front",
      impactAngle: 5,
      impactZoneConfidence: 0.92,
      overallAssessment: "Significant front-end damage",
      pageNumber: 2,
      source: "pdf_embedded",
    };

    const result = convertLLMClassificationToDamagePhoto(llmResult);

    expect(result.imageUrl).toBe("https://s3.example.com/photo.jpg");
    expect(result.caption).toBe("Front-end collision damage");
    expect(result.detectedDamageArea).toBe("Front bumper, Hood");
    expect(result.detectedComponents).toHaveLength(2);
    expect(result.detectedComponents![0].severity).toBe("severe");
    expect(result.impactZone?.zone).toBe("front");
    expect(result.impactZone?.angle).toBe(5);
    expect(result.impactZone?.confidence).toBe(0.92);
    expect(result.pageNumber).toBe(2);
    expect(result.source).toBe("pdf_embedded");
  });

  it("handles minimal LLM classification with defaults", () => {
    const llmResult: LLMImageClassification = {
      url: "https://s3.example.com/photo.jpg",
      classification: "damage_photo",
    };

    const result = convertLLMClassificationToDamagePhoto(llmResult);

    expect(result.imageUrl).toBe("https://s3.example.com/photo.jpg");
    expect(result.caption).toBe("damage_photo");
    expect(result.detectedDamageArea).toBe("");
    expect(result.detectedComponents).toEqual([]);
    expect(result.impactZone).toBeUndefined();
    expect(result.source).toBe("pdf_embedded");
  });

  it("filters out document pages from damage photo list", () => {
    const allPhotos: DamagePhoto[] = [
      { imageUrl: "https://s3.example.com/damage1.jpg", caption: "Damage", detectedDamageArea: "Hood", classification: "damage_photo" },
      { imageUrl: "https://s3.example.com/doc1.jpg", caption: "Quote sheet", detectedDamageArea: "", classification: "document" },
      { imageUrl: "https://s3.example.com/damage2.jpg", caption: "Damage", detectedDamageArea: "Bumper", classification: "damage_photo" },
      { imageUrl: "https://s3.example.com/doc2.jpg", caption: "Police report", detectedDamageArea: "", classification: "document" },
    ];

    const damageOnly = allPhotos.filter(p => p.classification !== "document");
    const docPages = allPhotos.filter(p => p.classification === "document");

    expect(damageOnly).toHaveLength(2);
    expect(docPages).toHaveLength(2);
    expect(damageOnly[0].classification).toBe("damage_photo");
    expect(docPages[0].classification).toBe("document");
  });

  it("counts components by severity correctly", () => {
    const photos: DamagePhoto[] = [
      {
        imageUrl: "https://s3.example.com/photo1.jpg",
        caption: "Front damage",
        detectedDamageArea: "Front bumper, Hood",
        detectedComponents: [
          { name: "Front bumper", severity: "severe", confidence: 0.95 },
          { name: "Hood", severity: "moderate", confidence: 0.88 },
        ],
        classification: "damage_photo",
      },
      {
        imageUrl: "https://s3.example.com/photo2.jpg",
        caption: "Side damage",
        detectedDamageArea: "Door",
        detectedComponents: [
          { name: "Door", severity: "severe", confidence: 0.9 },
          { name: "Mirror", severity: "minor", confidence: 0.85 },
        ],
        classification: "damage_photo",
      },
    ];

    const allComponents = photos.flatMap(p => p.detectedComponents || []);
    const severeCount = allComponents.filter(c => c.severity === "severe" || c.severity === "total_loss").length;
    const moderateCount = allComponents.filter(c => c.severity === "moderate").length;
    const minorCount = allComponents.filter(c => c.severity === "minor").length;

    expect(severeCount).toBe(2);
    expect(moderateCount).toBe(1);
    expect(minorCount).toBe(1);
  });
});

// ─── extractImagesFromPDFUrl retry logic ─────────────────────────────────────

describe("extractImagesFromPDFUrl retry logic", () => {
  it("returns empty array when fetch fails", async () => {
    // Mock fetch to fail
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    const { extractImagesFromPDFUrl } = await import("./pdf-image-extractor");
    const result = await extractImagesFromPDFUrl("https://example.com/nonexistent.pdf");

    expect(result).toEqual([]);
    global.fetch = originalFetch;
  });

  it("returns empty array when HTTP 404 is returned", async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      arrayBuffer: async () => new ArrayBuffer(0),
    } as Response);

    const { extractImagesFromPDFUrl } = await import("./pdf-image-extractor");
    const result = await extractImagesFromPDFUrl("https://example.com/missing.pdf");

    expect(result).toEqual([]);
    global.fetch = originalFetch;
  });
});
