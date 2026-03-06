/**
 * Shared type definitions for damage photos extracted from PDFs or uploaded directly.
 * Used across server pipeline (assessment-processor.ts, db.ts) and client UI.
 */

/** A detected component within a damage photo */
export interface DetectedComponent {
  /** Component name, e.g. "Front Bumper", "Bonnet", "Left Door" */
  name: string;
  /** Damage severity for this component */
  severity: 'minor' | 'moderate' | 'severe' | 'total_loss';
  /** Impact zone this component belongs to */
  zone: 'front' | 'rear' | 'left' | 'right' | 'roof' | 'undercarriage' | 'interior' | 'unknown';
  /**
   * Bounding box as percentage of image dimensions (0–100).
   * Optional — present when the LLM provides spatial estimates.
   */
  boundingBox?: {
    x: number;      // left edge %
    y: number;      // top edge %
    width: number;  // width %
    height: number; // height %
  };
}

/** Impact zone overlay for a damage photo */
export interface ImpactZoneOverlay {
  /** Primary impact zone label */
  zone: string;
  /** Colour class for the overlay badge */
  colorClass: 'red' | 'orange' | 'yellow' | 'blue' | 'gray';
  /** Confidence that this is the primary impact zone (0–100) */
  confidence: number;
}

/**
 * A single damage photo with enriched metadata.
 * Stored as JSON in aiAssessments.damagePhotosJson.
 */
export interface DamagePhoto {
  /** S3 URL of the image */
  imageUrl: string;
  /** Human-readable caption describing what the photo shows */
  caption: string;
  /**
   * Primary damage area visible in this photo.
   * e.g. "Front bumper and bonnet deformation"
   */
  detectedDamageArea: string;
  /** List of detected components with optional bounding boxes */
  detectedComponents: DetectedComponent[];
  /** Impact zone overlay metadata */
  impactZone?: ImpactZoneOverlay;
  /** Source of the image */
  source: 'pdf_page_render' | 'pdf_embedded' | 'uploaded';
  /** PDF page number (1-based) if extracted from a PDF */
  pageNumber?: number;
  /** Whether this photo was classified as a damage photo (vs document) */
  classification: 'damage_photo' | 'document';
  /** Overall damage assessment summary from LLM */
  overallAssessment?: string;
}
