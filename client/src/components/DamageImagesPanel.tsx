/**
 * DamageImagesPanel
 *
 * Renders damage photos with two tiers of metadata:
 *   Tier 1 — AI-classified DamagePhoto[] (from earlier pipeline stages)
 *   Tier 2 — Vision-enriched EnrichedPhoto[] (Stage 11 photo enrichment)
 *
 * When enrichment data is available, each card shows:
 *   - Impact zone badge
 *   - Detected component chips with severity colour coding
 *   - Confidence score pill
 *   - Image quality indicator
 *   - AI-generated caption
 *
 * An "Analyse Photos" button triggers Stage 11 enrichment for assessors/
 * insurers/admins. An inconsistency panel shows cross-check findings.
 */
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X, ZoomIn, Camera, FileText, Upload, Sparkles, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import type { DamagePhoto } from "../../../shared/damage-photo-types";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

// ─── Types ────────────────────────────────────────────────────────────────────

interface EnrichedPhoto {
  url: string;
  index: number;
  impactZone: string;
  detectedComponents: string[];
  severity: 'minor' | 'moderate' | 'severe' | 'critical';
  confidenceScore: number;
  caption: string;
  imageQuality: 'good' | 'poor' | 'unusable';
  enrichedAt: string;
}

interface PhotoInconsistency {
  photoIndex: number;
  photoUrl: string;
  type: 'zone_mismatch' | 'component_mismatch' | 'severity_mismatch' | 'unreported_damage';
  description: string;
  severity: 'low' | 'medium' | 'high';
  photoFinding: string;
  reportedValue: string;
}

// ─── Colour maps ──────────────────────────────────────────────────────────────

const SEVERITY_COLOURS: Record<string, string> = {
  minor:      "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 border-yellow-300 dark:border-yellow-700",
  moderate:   "bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200 border-orange-300 dark:border-orange-700",
  severe:     "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 border-red-300 dark:border-red-700",
  critical:   "bg-red-900 text-white border-red-900",
  total_loss: "bg-red-900 text-white border-red-900",
};

const ZONE_COLOURS: Record<string, string> = {
  front:         "bg-red-600 text-white",
  rear:          "bg-red-600 text-white",
  left:          "bg-orange-500 text-white",
  left_side:     "bg-orange-500 text-white",
  right:         "bg-orange-500 text-white",
  right_side:    "bg-orange-500 text-white",
  roof:          "bg-purple-600 text-white",
  undercarriage: "bg-gray-700 text-white",
  underbody:     "bg-gray-700 text-white",
  interior:      "bg-blue-600 text-white",
  engine_bay:    "bg-amber-600 text-white",
  unknown:       "bg-gray-400 text-white",
};

const INCONSISTENCY_COLOURS: Record<string, string> = {
  high:   "border-red-400 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-300",
  medium: "border-amber-400 bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300",
  low:    "border-blue-300 bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300",
};

const CONFIDENCE_COLOUR = (score: number) =>
  score >= 75 ? "text-green-600 dark:text-green-400"
  : score >= 50 ? "text-amber-600 dark:text-amber-400"
  : "text-red-500 dark:text-red-400";

// ─── Source badge ─────────────────────────────────────────────────────────────

function SourceBadge({ source }: { source?: string }) {
  if (!source) return null;
  if (source === "pdf_embedded") return (
    <span className="flex items-center gap-1 text-xs text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded px-1.5 py-0.5">
      <FileText className="w-3 h-3" /> PDF embedded
    </span>
  );
  if (source === "pdf_page_render") return (
    <span className="flex items-center gap-1 text-xs text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded px-1.5 py-0.5">
      <Camera className="w-3 h-3" /> PDF page
    </span>
  );
  return (
    <span className="flex items-center gap-1 text-xs text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded px-1.5 py-0.5">
      <Upload className="w-3 h-3" /> Uploaded
    </span>
  );
}

// ─── Enriched photo card ──────────────────────────────────────────────────────

interface EnrichedCardProps {
  photo: EnrichedPhoto;
  onOpen: () => void;
}

function EnrichedPhotoCard({ photo, onOpen }: EnrichedCardProps) {
  const [imgError, setImgError] = useState(false);
  const zone = photo.impactZone?.replace(/_/g, ' ');
  const topComponents = photo.detectedComponents.slice(0, 3);
  const moreCount = photo.detectedComponents.length - topComponents.length;

  return (
    <div className="relative rounded-xl overflow-hidden border border-border bg-card shadow-sm hover:shadow-md transition-shadow group">
      {/* Image */}
      <div className="relative h-44 bg-muted overflow-hidden cursor-pointer" onClick={onOpen}>
        {imgError ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
            <Camera className="w-8 h-8" />
            <span className="text-xs">Image unavailable</span>
          </div>
        ) : (
          <img
            src={photo.url}
            alt={photo.caption || `Damage photo ${photo.index + 1}`}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={() => setImgError(true)}
          />
        )}
        {/* Zoom overlay */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
          <ZoomIn className="w-8 h-8 text-white drop-shadow-lg" />
        </div>
        {/* Impact zone — top-left */}
        {zone && zone !== 'unknown' && (
          <div className={`absolute top-2 left-2 text-xs font-bold px-2 py-0.5 rounded uppercase tracking-wide shadow ${ZONE_COLOURS[photo.impactZone] || ZONE_COLOURS.unknown}`}>
            {zone}
          </div>
        )}
        {/* Confidence — top-right */}
        <div className={`absolute top-2 right-2 text-xs font-bold px-1.5 py-0.5 rounded bg-black/60 ${CONFIDENCE_COLOUR(photo.confidenceScore)}`}>
          {photo.confidenceScore}%
        </div>
        {/* Image quality warning */}
        {photo.imageQuality !== 'good' && (
          <div className="absolute bottom-2 right-2 text-xs bg-amber-500 text-white px-1.5 py-0.5 rounded">
            {photo.imageQuality === 'unusable' ? 'Unusable' : 'Poor quality'}
          </div>
        )}
      </div>

      {/* Metadata footer */}
      <div className="p-2 space-y-1.5">
        {/* Severity badge */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`text-xs border rounded px-1.5 py-0.5 font-semibold ${SEVERITY_COLOURS[photo.severity] || SEVERITY_COLOURS.minor}`}>
            {photo.severity}
          </span>
          <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
            <Sparkles className="w-3 h-3" /> AI enriched
          </span>
        </div>

        {/* Caption */}
        {photo.caption && (
          <p className="text-xs text-foreground/80 font-medium line-clamp-2">{photo.caption}</p>
        )}

        {/* Component chips */}
        {topComponents.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {topComponents.map((comp, i) => (
              <span key={i} className="text-xs border border-border rounded px-1.5 py-0.5 bg-muted text-foreground/80">
                {comp}
              </span>
            ))}
            {moreCount > 0 && (
              <span className="text-xs text-muted-foreground px-1">+{moreCount} more</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Legacy DamagePhoto card (Tier 1) ────────────────────────────────────────

interface LegacyCardProps {
  photo: DamagePhoto;
  index: number;
  onOpen: () => void;
}

function LegacyPhotoCard({ photo, index, onOpen }: LegacyCardProps) {
  const [imgError, setImgError] = useState(false);
  const zone = photo.impactZone?.zone;
  const topComponents = (photo.detectedComponents || []).slice(0, 3);
  const moreCount = (photo.detectedComponents || []).length - topComponents.length;

  return (
    <div className="relative rounded-xl overflow-hidden border border-border bg-card shadow-sm hover:shadow-md transition-shadow group">
      <div className="relative h-44 bg-muted overflow-hidden cursor-pointer" onClick={onOpen}>
        {imgError ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
            <Camera className="w-8 h-8" />
            <span className="text-xs">Image unavailable</span>
          </div>
        ) : (
          <img
            src={photo.imageUrl}
            alt={photo.caption || `Damage photo ${index + 1}`}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={() => setImgError(true)}
          />
        )}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
          <ZoomIn className="w-8 h-8 text-white drop-shadow-lg" />
        </div>
        {zone && zone !== "unknown" && (
          <div className={`absolute top-2 left-2 text-xs font-bold px-2 py-0.5 rounded uppercase tracking-wide shadow ${ZONE_COLOURS[zone] || ZONE_COLOURS.unknown}`}>
            {zone}
          </div>
        )}
        {photo.pageNumber && (
          <div className="absolute top-2 right-2 text-xs bg-black/60 text-white px-1.5 py-0.5 rounded">
            p.{photo.pageNumber}
          </div>
        )}
      </div>
      <div className="p-2 space-y-1.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <SourceBadge source={photo.source} />
        </div>
        {photo.detectedDamageArea && (
          <p className="text-xs text-foreground/80 font-medium line-clamp-1">{photo.detectedDamageArea}</p>
        )}
        {topComponents.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {topComponents.map((comp, i) => (
              <span key={i} className={`text-xs border rounded px-1.5 py-0.5 ${SEVERITY_COLOURS[comp.severity] || SEVERITY_COLOURS.minor}`}>
                {comp.name}
              </span>
            ))}
            {moreCount > 0 && <span className="text-xs text-muted-foreground px-1">+{moreCount} more</span>}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Enriched lightbox ────────────────────────────────────────────────────────

function EnrichedLightbox({ photo, onClose }: { photo: EnrichedPhoto; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <div className="relative max-w-4xl w-full bg-white dark:bg-card rounded-xl overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 bg-gray-900 text-white">
          <div className="flex items-center gap-2 flex-wrap">
            {photo.impactZone && photo.impactZone !== 'unknown' && (
              <span className={`text-xs font-semibold px-2 py-0.5 rounded uppercase tracking-wide ${ZONE_COLOURS[photo.impactZone] || ZONE_COLOURS.unknown}`}>
                {photo.impactZone.replace(/_/g, ' ')} impact
              </span>
            )}
            <span className={`text-xs font-bold ${CONFIDENCE_COLOUR(photo.confidenceScore)}`}>
              {photo.confidenceScore}% confidence
            </span>
            <span className={`text-xs border rounded px-1.5 py-0.5 ${SEVERITY_COLOURS[photo.severity]}`}>
              {photo.severity}
            </span>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="text-white hover:bg-white/20">
            <X className="w-5 h-5" />
          </Button>
        </div>
        <div className="relative bg-gray-100 dark:bg-muted">
          <img src={photo.url} alt={photo.caption || "Damage photo"} className="w-full max-h-[60vh] object-contain" />
        </div>
        <div className="p-4 space-y-3">
          {photo.caption && <p className="text-sm font-medium text-foreground">{photo.caption}</p>}
          {photo.detectedComponents.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Detected components</p>
              <div className="flex flex-wrap gap-1.5">
                {photo.detectedComponents.map((comp, i) => (
                  <span key={i} className="text-xs border border-border rounded px-2 py-0.5 bg-muted text-foreground/80">{comp}</span>
                ))}
              </div>
            </div>
          )}
          <p className="text-xs text-muted-foreground border-t pt-2">
            Enriched by vision AI · {new Date(photo.enrichedAt).toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Legacy lightbox ──────────────────────────────────────────────────────────

function LegacyLightbox({ photo, onClose }: { photo: DamagePhoto; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <div className="relative max-w-4xl w-full bg-white dark:bg-card rounded-xl overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 bg-gray-900 text-white">
          <div className="flex items-center gap-2 flex-wrap">
            {photo.impactZone && (
              <span className={`text-xs font-semibold px-2 py-0.5 rounded uppercase tracking-wide ${ZONE_COLOURS[photo.impactZone.zone] || ZONE_COLOURS.unknown}`}>
                {photo.impactZone.zone} impact
              </span>
            )}
            <SourceBadge source={photo.source} />
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="text-white hover:bg-white/20">
            <X className="w-5 h-5" />
          </Button>
        </div>
        <div className="relative bg-gray-100 dark:bg-muted">
          <img src={photo.imageUrl} alt={photo.caption || "Damage photo"} className="w-full max-h-[60vh] object-contain" />
        </div>
        <div className="p-4 space-y-3">
          {photo.caption && <p className="text-sm font-medium text-foreground">{photo.caption}</p>}
          {photo.detectedDamageArea && (
            <p className="text-sm text-foreground/80"><span className="font-semibold">Damage area: </span>{photo.detectedDamageArea}</p>
          )}
          {photo.detectedComponents && photo.detectedComponents.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Detected components</p>
              <div className="flex flex-wrap gap-1.5">
                {photo.detectedComponents.map((comp, i) => (
                  <span key={i} className={`text-xs border rounded px-2 py-0.5 font-medium ${SEVERITY_COLOURS[comp.severity] || SEVERITY_COLOURS.minor}`}>
                    {comp.name}{comp.severity !== "minor" && <span className="ml-1 opacity-70">({comp.severity})</span>}
                  </span>
                ))}
              </div>
            </div>
          )}
          {photo.overallAssessment && (
            <p className="text-xs text-muted-foreground italic border-t pt-2">{photo.overallAssessment}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Inconsistency panel ──────────────────────────────────────────────────────

function InconsistencyPanel({ inconsistencies }: { inconsistencies: PhotoInconsistency[] }) {
  const [expanded, setExpanded] = useState(false);
  if (inconsistencies.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 border border-green-300 dark:border-green-700 rounded-lg px-3 py-2 bg-green-50 dark:bg-green-950/20 mt-4">
        <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
        All photo findings are consistent with the reported damage and AI assessment.
      </div>
    );
  }

  const highCount = inconsistencies.filter(i => i.severity === 'high').length;
  const medCount  = inconsistencies.filter(i => i.severity === 'medium').length;

  return (
    <div className="mt-4 border border-amber-300 dark:border-amber-700 rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-3 py-2 bg-amber-50 dark:bg-amber-950/20 text-left"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
          <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">
            {inconsistencies.length} photo inconsistenc{inconsistencies.length !== 1 ? 'ies' : 'y'} detected
          </span>
          {highCount > 0 && (
            <span className="text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-700 rounded px-1.5 py-0.5">
              {highCount} high
            </span>
          )}
          {medCount > 0 && (
            <span className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700 rounded px-1.5 py-0.5">
              {medCount} medium
            </span>
          )}
        </div>
        <span className="text-xs text-muted-foreground">{expanded ? '▲ Hide' : '▼ Show'}</span>
      </button>

      {expanded && (
        <div className="p-3 space-y-2 bg-card">
          {inconsistencies.map((inc, i) => (
            <div key={i} className={`rounded-lg border p-2.5 text-xs ${INCONSISTENCY_COLOURS[inc.severity]}`}>
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold">{inc.description}</p>
                <span className="flex-shrink-0 text-xs uppercase font-bold opacity-70">{inc.type.replace(/_/g, ' ')}</span>
              </div>
              <div className="mt-1.5 grid grid-cols-2 gap-2 opacity-80">
                <div><span className="font-semibold">Found in photo: </span>{inc.photoFinding}</div>
                <div><span className="font-semibold">Expected: </span>{inc.reportedValue}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface DamageImagesPanelProps {
  /** AI-classified DamagePhoto[] JSON string from aiAssessments.damagePhotosJson */
  damagePhotosJson?: string | null;
  /** Raw photo URL array JSON string from claims.damagePhotos (fallback) */
  rawDamagePhotos?: string | null;
  /** Vision-enriched EnrichedPhoto[] JSON string from aiAssessments.enrichedPhotosJson */
  enrichedPhotosJson?: string | null;
  /** Cross-check inconsistencies JSON string from aiAssessments.photoInconsistenciesJson */
  photoInconsistenciesJson?: string | null;
  /** Claim ID — required to trigger enrichment */
  claimId?: number;
}

export function DamageImagesPanel({
  damagePhotosJson,
  rawDamagePhotos,
  enrichedPhotosJson,
  photoInconsistenciesJson,
  claimId,
}: DamageImagesPanelProps) {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [lightboxEnriched, setLightboxEnriched] = useState<EnrichedPhoto | null>(null);
  const [lightboxLegacy, setLightboxLegacy] = useState<DamagePhoto | null>(null);
  const [showAll, setShowAll] = useState(false);

  // Parse enriched photos (Stage 11)
  let enrichedPhotos: EnrichedPhoto[] = [];
  if (enrichedPhotosJson) {
    try {
      const parsed = JSON.parse(enrichedPhotosJson);
      if (Array.isArray(parsed)) enrichedPhotos = parsed;
    } catch { /* ignore */ }
  }

  // Parse inconsistencies
  let inconsistencies: PhotoInconsistency[] = [];
  if (photoInconsistenciesJson) {
    try {
      const parsed = JSON.parse(photoInconsistenciesJson);
      if (Array.isArray(parsed)) inconsistencies = parsed;
    } catch { /* ignore */ }
  }

  // Parse legacy DamagePhoto[] (Tier 1)
  let legacyPhotos: DamagePhoto[] = [];
  if (damagePhotosJson) {
    try {
      const parsed = JSON.parse(damagePhotosJson);
      if (Array.isArray(parsed) && parsed.length > 0) {
        if (typeof parsed[0] === 'string') {
          legacyPhotos = (parsed as string[]).map(url => ({
            imageUrl: url,
            caption: "Damage photo",
            detectedDamageArea: "",
            detectedComponents: [],
            source: "uploaded" as const,
            classification: "damage_photo" as const,
          }));
        } else {
          legacyPhotos = parsed as DamagePhoto[];
        }
      }
    } catch { /* ignore */ }
  }
  if (legacyPhotos.length === 0 && rawDamagePhotos) {
    try {
      const raw = JSON.parse(rawDamagePhotos);
      if (Array.isArray(raw)) {
        legacyPhotos = raw.map((url: string) => ({
          imageUrl: url,
          caption: "Uploaded damage photo",
          detectedDamageArea: "",
          detectedComponents: [],
          source: "uploaded" as const,
          classification: "damage_photo" as const,
        }));
      }
    } catch { /* ignore */ }
  }

  // Enrichment mutation
  const enrichMutation = (trpc.aiAssessments as any).enrichPhotos.useMutation({
    onSuccess: () => {
      if (claimId) utils.aiAssessments.byClaim.invalidate({ claimId });
    },
  });

  const canEnrich = claimId && user && ['admin', 'insurer', 'assessor'].includes(user.role ?? '');
  const hasEnriched = enrichedPhotos.length > 0;

  // Decide which photos to display
  const useEnriched = hasEnriched;
  const displayPhotos = useEnriched
    ? enrichedPhotos.filter(p => p.imageQuality !== 'unusable')
    : legacyPhotos.filter(p => p.classification !== "document");
  const docPages = useEnriched ? [] : legacyPhotos.filter(p => p.classification === "document");

  if (displayPhotos.length === 0 && legacyPhotos.length === 0) return null;

  const visiblePhotos = showAll ? displayPhotos : displayPhotos.slice(0, 8);

  // Stats
  const totalPhotos = useEnriched ? enrichedPhotos.length : legacyPhotos.filter(p => p.classification !== "document").length;
  const avgConfidence = useEnriched && enrichedPhotos.length > 0
    ? Math.round(enrichedPhotos.reduce((s, p) => s + p.confidenceScore, 0) / enrichedPhotos.length)
    : null;

  return (
    <>
      {/* Header row: stats + Analyse button */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="gap-1">
            <Camera className="w-3 h-3" />
            {totalPhotos} photo{totalPhotos !== 1 ? "s" : ""}
          </Badge>
          {hasEnriched && avgConfidence !== null && (
            <Badge variant="outline" className={`gap-1 ${CONFIDENCE_COLOUR(avgConfidence)}`}>
              <Sparkles className="w-3 h-3" />
              Avg confidence: {avgConfidence}%
            </Badge>
          )}
          {hasEnriched && inconsistencies.length > 0 && (
            <Badge className="bg-amber-500 text-white gap-1">
              <AlertTriangle className="w-3 h-3" />
              {inconsistencies.length} inconsistenc{inconsistencies.length !== 1 ? 'ies' : 'y'}
            </Badge>
          )}
          {hasEnriched && inconsistencies.length === 0 && (
            <Badge className="bg-green-600 text-white gap-1">
              <CheckCircle2 className="w-3 h-3" /> Consistent
            </Badge>
          )}
        </div>

        {canEnrich && (
          <Button
            size="sm"
            variant={hasEnriched ? "outline" : "default"}
            disabled={enrichMutation.isPending}
            onClick={() => enrichMutation.mutate({ claimId: claimId! })}
            className="gap-1.5"
          >
            {enrichMutation.isPending ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Analysing…</>
            ) : hasEnriched ? (
              <><Sparkles className="w-3.5 h-3.5" /> Re-analyse Photos</>
            ) : (
              <><Sparkles className="w-3.5 h-3.5" /> Analyse Photos</>
            )}
          </Button>
        )}
      </div>

      {/* Error message */}
      {enrichMutation.isError && (
        <div className="mb-3 text-sm text-red-600 dark:text-red-400 border border-red-300 dark:border-red-700 rounded px-3 py-2 bg-red-50 dark:bg-red-950/20">
          Photo analysis failed: {enrichMutation.error?.message ?? 'Unknown error'}
        </div>
      )}

      {/* Photo grid */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {useEnriched
          ? (visiblePhotos as EnrichedPhoto[]).map((photo, idx) => (
              <EnrichedPhotoCard
                key={idx}
                photo={photo}
                onOpen={() => setLightboxEnriched(photo)}
              />
            ))
          : (visiblePhotos as DamagePhoto[]).map((photo, idx) => (
              <LegacyPhotoCard
                key={idx}
                photo={photo}
                index={idx}
                onOpen={() => setLightboxLegacy(photo)}
              />
            ))
        }
      </div>

      {/* Show more / less */}
      {displayPhotos.length > 8 && (
        <div className="mt-3 text-center">
          <Button variant="outline" size="sm" onClick={() => setShowAll(v => !v)}>
            {showAll ? "Show less" : `Show all ${displayPhotos.length} photos`}
          </Button>
        </div>
      )}

      {/* Document pages (legacy only) */}
      {docPages.length > 0 && (
        <div className="mt-4 pt-3 border-t">
          <p className="text-xs text-muted-foreground mb-2">
            {docPages.length} document page{docPages.length !== 1 ? "s" : ""} also extracted
          </p>
          <div className="grid gap-2 grid-cols-3 md:grid-cols-5">
            {docPages.slice(0, 5).map((photo, idx) => (
              <div
                key={idx}
                className="relative rounded border border-border overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => setLightboxLegacy(photo)}
              >
                <img
                  src={photo.imageUrl}
                  alt={`Document page ${idx + 1}`}
                  className="w-full h-20 object-cover"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
                <p className="text-xs text-center text-muted-foreground py-0.5">p.{photo.pageNumber || idx + 1}</p>
              </div>
            ))}
            {docPages.length > 5 && (
              <div className="flex items-center justify-center text-xs text-muted-foreground/70">
                +{docPages.length - 5} more
              </div>
            )}
          </div>
        </div>
      )}

      {/* Inconsistency panel (shown after enrichment) */}
      {hasEnriched && <InconsistencyPanel inconsistencies={inconsistencies} />}

      {/* Lightboxes */}
      {lightboxEnriched && (
        <EnrichedLightbox photo={lightboxEnriched} onClose={() => setLightboxEnriched(null)} />
      )}
      {lightboxLegacy && (
        <LegacyLightbox photo={lightboxLegacy} onClose={() => setLightboxLegacy(null)} />
      )}
    </>
  );
}
