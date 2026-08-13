export type CanonicalPhotoEvidence = {
  url: string;
  sourceKey: string;
  originalIndex: number;
  zone?: string;
  impactZone?: string;
  caption?: string;
  severity?: string;
  componentCount?: number | null;
  usable: boolean;
  directionContradiction: boolean;
  semanticType?: string | null;
  detectedComponents?: string[];
  classificationConfidence?: number | null;
  confidenceScore?: number | null;
  classifier?: string | null;
  selectionReason?: string | null;
  fallbackWarning?: string | null;
  suitableForCrushDepth?: boolean | null;
  physicsExclusionReason?: string | null;
  sourcePage?: number | null;
  uncertainty?: "zone_unclassified" | "direction_conflict" | null;
};

export type CanonicalPhotoEvidenceSummary = {
  photos: CanonicalPhotoEvidence[];
  totalPhotos: number;
  usablePhotos: number;
  unclassifiedZoneCount: number;
  directionConflictCount: number;
};

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * Normalises only source-recorded photo evidence. It never invents a zone,
 * component, severity, usable state, or replacement image count.
 */
export function normaliseCanonicalPhotoEvidence(raw: unknown): CanonicalPhotoEvidenceSummary {
  const input = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  const photos: CanonicalPhotoEvidence[] = [];

  input.forEach((value, originalIndex) => {
    const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
    const url = text(source.url) ?? text(source.fileUrl) ?? text(source.file_url);
    if (!url) return;
    const sourcePage = Number.isFinite(Number(source.sourcePage ?? source.source_page)) ? Number(source.sourcePage ?? source.source_page) : null;
    const sourceKey = url;
    if (seen.has(sourceKey)) return;
    seen.add(sourceKey);

    const zone = text(source.impactZone) ?? text(source.zone);
    const confidence = Number.isFinite(Number(source.confidenceScore ?? source.classificationConfidence))
      ? Number(source.confidenceScore ?? source.classificationConfidence)
      : null;
    const confidencePercent = confidence !== null && confidence <= 1 ? confidence * 100 : confidence;
    const directionContradiction = source.directionContradiction === true;
    const uncertainty = directionContradiction ? "direction_conflict" as const : !zone ? "zone_unclassified" as const : null;
    const components = Array.isArray(source.detectedComponents)
      ? source.detectedComponents.filter((component): component is string => typeof component === "string" && component.trim().length > 0)
      : Array.isArray(source.components)
        ? source.components.filter((component): component is string => typeof component === "string" && component.trim().length > 0)
        : undefined;

    photos.push({
      url,
      sourceKey,
      originalIndex,
      zone,
      impactZone: zone,
      caption: text(source.caption) ?? text(source.description),
      severity: text(source.severity),
      componentCount: Number.isFinite(Number(source.componentCount ?? source.component_count)) ? Number(source.componentCount ?? source.component_count) : null,
      usable: source.usable === false ? false : confidencePercent === null ? true : confidencePercent >= 70,
      directionContradiction,
      semanticType: text(source.semanticType) ?? null,
      detectedComponents: components,
      classificationConfidence: confidence,
      confidenceScore: confidence,
      classifier: text(source.classifier) ?? null,
      selectionReason: text(source.selectionReason) ?? null,
      fallbackWarning: text(source.fallbackWarning) ?? (!zone ? "Zone classification unavailable." : null),
      suitableForCrushDepth: typeof source.suitableForCrushDepth === "boolean" ? source.suitableForCrushDepth : null,
      physicsExclusionReason: text(source.physicsExclusionReason) ?? null,
      sourcePage,
      uncertainty,
    });
  });

  return {
    photos,
    totalPhotos: photos.length,
    usablePhotos: photos.filter((photo) => photo.usable).length,
    unclassifiedZoneCount: photos.filter((photo) => photo.uncertainty === "zone_unclassified").length,
    directionConflictCount: photos.filter((photo) => photo.uncertainty === "direction_conflict").length,
  };
}
