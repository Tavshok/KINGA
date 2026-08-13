import type { ClassifiedImage } from "./imageClassifier";
import type { ScoredImage } from "./imageIntelligence";
import type { SemanticImageMeta } from "./semanticImageClassifier";
import type { DamageAnalysisComponent, ImageEvidenceEnvelope } from "./types";

const MIN_SEMANTIC_CONFIDENCE_FOR_CRUSH_DEPTH = 0.4;

function commonEnvelope(input: {
  url: string;
  source: ImageEvidenceEnvelope["source"];
  pageNumber?: number;
  classification?: string;
  classificationConfidence?: number;
  classifier: ImageEvidenceEnvelope["classifier"];
  damageLikelihoodScore?: number;
  selectionReason: string;
  fallbackWarning?: string;
  suitableForCrushDepth: boolean;
  exclusionReason?: string;
}): ImageEvidenceEnvelope {
  return {
    url: input.url,
    source: input.source,
    pageNumber: input.pageNumber,
    classification: input.classification,
    classificationConfidence: input.classificationConfidence,
    classifier: input.classifier,
    damageLikelihoodScore: input.damageLikelihoodScore,
    selectionReason: input.selectionReason,
    fallbackWarning: input.fallbackWarning,
    suitableForCrushDepth: input.suitableForCrushDepth,
    exclusionReason: input.exclusionReason,
  };
}

export function evidenceFromClassifiedImage(image: ClassifiedImage): ImageEvidenceEnvelope {
  const suitable = image.suitableForCrushDepth;
  return commonEnvelope({
    url: image.url,
    source: image.source === "direct_upload" ? "direct_upload" : "pdf_extracted",
    pageNumber: image.pageNumber,
    classification: image.category,
    classificationConfidence: image.confidence,
    classifier: image.llmClassified ? "image_classifier_llm" : "image_classifier_heuristic",
    selectionReason: "Ranked classified image selected for Stage 6 damage analysis.",
    suitableForCrushDepth: suitable,
    exclusionReason: suitable ? undefined : `Image category '${image.category}' is not eligible for crush-depth measurement.`,
  });
}

export function evidenceFromSemanticImage(meta: SemanticImageMeta): ImageEvidenceEnvelope {
  const suitable =
    meta.semanticType === "DAMAGE_PHOTO" &&
    meta.quality !== "unusable" &&
    meta.semanticConfidence >= MIN_SEMANTIC_CONFIDENCE_FOR_CRUSH_DEPTH;
  const exclusionReason = suitable
    ? undefined
    : meta.semanticType !== "DAMAGE_PHOTO"
      ? `Semantic type '${meta.semanticType}' is not a confirmed damage photograph.`
      : meta.quality === "unusable"
        ? "Image quality is unusable for crush-depth measurement."
        : "Classification confidence is below the crush-depth eligibility threshold.";
  return commonEnvelope({
    url: meta.url,
    source: "direct_upload",
    classification: meta.semanticType,
    classificationConfidence: meta.semanticConfidence,
    classifier: "semantic_image_classifier",
    selectionReason: meta.reasoning,
    suitableForCrushDepth: suitable,
    exclusionReason,
  });
}

export function evidenceFromScoredPdfPage(page: ScoredImage): ImageEvidenceEnvelope {
  const suitable =
    page.classification === "damage_photo" &&
    page.confidence !== "LOW" &&
    !page.usedSelectionFallback;
  const fallbackWarning = page.usedSelectionFallback
    ? "No confirmed damage photograph was available; this page is retained for contextual damage analysis only."
    : undefined;
  return commonEnvelope({
    url: page.url,
    source: "pdf_page_render",
    pageNumber: page.pageNumber,
    classification: page.classification,
    classificationConfidence: page.confidence === "HIGH" ? 0.85 : page.confidence === "MEDIUM" ? 0.6 : 0.25,
    classifier: "image_intelligence",
    damageLikelihoodScore: page.damageLikelihoodScore,
    selectionReason: page.selectionReason,
    fallbackWarning,
    suitableForCrushDepth: suitable,
    exclusionReason: suitable
      ? undefined
      : page.usedSelectionFallback
        ? "Fallback-selected page is not eligible for crush-depth measurement."
        : "Page is not a sufficiently confident damage photograph for crush-depth measurement.",
  });
}

/**
 * PDF-direct vision has a valid damage-analysis role but needs explicit page evidence
 * before any numeric crush-depth result is eligible for physics.
 */
export function evidenceFromPdfDirectPage(input: {
  url: string;
  pageNumber: number;
  pageType?: string;
  hasVisibleDamage?: boolean;
  photoQuality?: string;
  scanConfidence?: string;
  fallback: boolean;
  source: ImageEvidenceEnvelope["source"];
}): ImageEvidenceEnvelope {
  const suitableForCrushDepth = !input.fallback &&
    input.pageType === "vehicle_damage" &&
    input.hasVisibleDamage === true &&
    input.photoQuality === "clear" &&
    (input.scanConfidence === "high" || input.scanConfidence === "medium");
  return commonEnvelope({
    url: input.url,
    source: input.source,
    pageNumber: input.pageNumber,
    classification: input.pageType ?? "vehicle_damage",
    classificationConfidence: input.scanConfidence === "high" ? 0.85 : input.scanConfidence === "medium" ? 0.6 : 0.35,
    classifier: "pdf_direct_vision",
    selectionReason: input.fallback
      ? "PDF-direct fallback identified this page without a source-image eligibility envelope."
      : `PDF page scan identified ${input.pageType ?? "a photo"} with ${input.photoQuality ?? "unknown"} quality.`,
    fallbackWarning: input.fallback
      ? "PDF-direct fallback remains available for contextual damage analysis only."
      : undefined,
    suitableForCrushDepth,
    exclusionReason: suitableForCrushDepth
      ? undefined
      : input.fallback
        ? "PDF-direct fallback lacks page-level image eligibility evidence for crush-depth measurement."
        : "PDF page type, visible-damage status, quality, or scan confidence does not support crush-depth measurement.",
  });
}

/** Preserve damage analysis while removing unsupported numeric physics measurements. */
export function removeIneligiblePhysicsMeasurements(
  components: DamageAnalysisComponent[],
): DamageAnalysisComponent[] {
  return components.map((component) => {
    const { crushDepthM, deformationEnergyJ, structuralDisplacementM, visionConfidenceScore, damageFractionEstimate, ...damageOnly } = component;
    return damageOnly;
  });
}
