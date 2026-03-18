/**
 * DamageImagesPanel
 *
 * Renders damage photos extracted from PDF documents or uploaded by users.
 * Supports two data sources:
 *   1. damagePhotosJson — AI-classified DamagePhoto[] objects with metadata
 *   2. damagePhotos     — raw string[] of photo URLs (fallback)
 *
 * Features:
 *   - Impact zone badge (front / rear / left / right / roof / undercarriage)
 *   - Detected component chips with severity colour coding
 *   - Source badge (PDF embedded / PDF page render / uploaded)
 *   - Full-screen lightbox with caption and component list
 *   - Graceful fallback for images that fail to load
 */
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X, ZoomIn, Camera, FileText, Upload } from "lucide-react";
import type { DamagePhoto } from "../../../shared/damage-photo-types";

// ─── Severity colour map ─────────────────────────────────────────────────────
const SEVERITY_COLOURS: Record<string, string> = {
  minor:       "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 border-yellow-300 dark:border-yellow-700",
  moderate:    "bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200 border-orange-300 dark:border-orange-700",
  severe:      "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 border-red-300 dark:border-red-700",
  total_loss:  "bg-red-900 text-white border-red-900",
};

// ─── Impact zone colour map ───────────────────────────────────────────────────
const ZONE_COLOURS: Record<string, string> = {
  front:         "bg-red-600 text-white",
  rear:          "bg-red-600 text-white",
  left:          "bg-orange-500 text-white",
  right:         "bg-orange-500 text-white",
  roof:          "bg-purple-600 text-white",
  undercarriage: "bg-gray-700 text-white",
  unknown:       "bg-gray-400 text-white",
};

// ─── Source icon / label ──────────────────────────────────────────────────────
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

// ─── Lightbox ────────────────────────────────────────────────────────────────
interface LightboxProps {
  photo: DamagePhoto;
  onClose: () => void;
}

function Lightbox({ photo, onClose }: LightboxProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <div
        className="relative max-w-4xl w-full bg-white dark:bg-card rounded-xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-900 text-white">
          <div className="flex items-center gap-2 flex-wrap">
            {photo.impactZone && (
              <span className={`text-xs font-semibold px-2 py-0.5 rounded uppercase tracking-wide ${ZONE_COLOURS[photo.impactZone.zone] || ZONE_COLOURS.unknown}`}>
                {photo.impactZone.zone} impact
              </span>
            )}
            <SourceBadge source={photo.source} />
            {photo.pageNumber && (
              <span className="text-xs text-gray-400 dark:text-muted-foreground/70">Page {photo.pageNumber}</span>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="text-white hover:bg-white/20 dark:bg-card/20">
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Image */}
        <div className="relative bg-gray-100 dark:bg-muted">
          <img
            src={photo.imageUrl}
            alt={photo.caption || "Damage photo"}
            className="w-full max-h-[60vh] object-contain"
          />
        </div>

        {/* Footer */}
        <div className="p-4 space-y-3">
          {photo.caption && (
            <p className="text-sm font-medium text-foreground">{photo.caption}</p>
          )}
          {photo.detectedDamageArea && (
            <p className="text-sm text-foreground/80">
              <span className="font-semibold">Damage area: </span>{photo.detectedDamageArea}
            </p>
          )}
          {photo.detectedComponents && (photo.detectedComponents ?? []).length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Detected components</p>
              <div className="flex flex-wrap gap-1.5">
                {(photo.detectedComponents ?? []).map((comp, i) => (
                  <span
                    key={i}
                    className={`text-xs border rounded px-2 py-0.5 font-medium ${SEVERITY_COLOURS[comp.severity] || SEVERITY_COLOURS.minor}`}
                  >
                    {comp.name}
                    {comp.severity !== "minor" && (
                      <span className="ml-1 opacity-70">({comp.severity})</span>
                    )}
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

// ─── Photo card ───────────────────────────────────────────────────────────────
interface PhotoCardProps {
  photo: DamagePhoto;
  index: number;
  onOpen: () => void;
}

function PhotoCard({ photo, index, onOpen }: PhotoCardProps) {
  const [imgError, setImgError] = useState(false);
  const zone = photo.impactZone?.zone;
  const topComponents = (photo.detectedComponents || []).slice(0, 3);
  const moreCount = (photo.detectedComponents || []).length - topComponents.length;

  return (
    <div className="relative rounded-xl overflow-hidden border border-border bg-card shadow-sm hover:shadow-md transition-shadow group">
      {/* Image area */}
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

        {/* Zoom overlay */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
          <ZoomIn className="w-8 h-8 text-white drop-shadow-lg" />
        </div>

        {/* Impact zone badge — top-left */}
        {zone && zone !== "unknown" && (
          <div className={`absolute top-2 left-2 text-xs font-bold px-2 py-0.5 rounded uppercase tracking-wide shadow ${ZONE_COLOURS[zone] || ZONE_COLOURS.unknown}`}>
            {zone}
          </div>
        )}

        {/* Page number — top-right */}
        {photo.pageNumber && (
          <div className="absolute top-2 right-2 text-xs bg-black/60 text-white px-1.5 py-0.5 rounded">
            p.{photo.pageNumber}
          </div>
        )}
      </div>

      {/* Metadata footer */}
      <div className="p-2 space-y-1.5">
        {/* Source + classification */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <SourceBadge source={photo.source} />
          {photo.classification === "document" && (
            <Badge variant="outline" className="text-xs text-muted-foreground">Document</Badge>
          )}
        </div>

        {/* Caption */}
        {photo.detectedDamageArea && (
          <p className="text-xs text-foreground/80 font-medium line-clamp-1">{photo.detectedDamageArea}</p>
        )}

        {/* Component chips */}
        {topComponents.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {topComponents.map((comp, i) => (
              <span
                key={i}
                className={`text-xs border rounded px-1.5 py-0.5 ${SEVERITY_COLOURS[comp.severity] || SEVERITY_COLOURS.minor}`}
              >
                {comp.name}
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

// ─── Main component ───────────────────────────────────────────────────────────
interface DamageImagesPanelProps {
  /** AI-classified DamagePhoto[] JSON string from aiAssessments.damagePhotosJson */
  damagePhotosJson?: string | null;
  /** Raw photo URL array JSON string from claims.damagePhotos (fallback) */
  rawDamagePhotos?: string | null;
}

export function DamageImagesPanel({ damagePhotosJson, rawDamagePhotos }: DamageImagesPanelProps) {
  const [lightboxPhoto, setLightboxPhoto] = useState<DamagePhoto | null>(null);
  const [showAll, setShowAll] = useState(false);

  // Parse photos — prefer AI-classified, fall back to raw URLs
  let photos: DamagePhoto[] = [];
  if (damagePhotosJson) {
    try {
      const parsed = JSON.parse(damagePhotosJson);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Handle both DamagePhoto[] objects and plain string[] URLs
        if (typeof parsed[0] === 'string') {
          // Plain URL array — convert to minimal DamagePhoto objects
          photos = (parsed as string[]).map((url) => ({
            imageUrl: url,
            caption: "Damage photo",
            detectedDamageArea: "",
            detectedComponents: [],
            source: "uploaded" as const,
            classification: "damage_photo" as const,
          }));
        } else {
          photos = parsed as DamagePhoto[];
        }
      }
    } catch { /* ignore */ }
  }

  // Fallback: convert raw URL strings to minimal DamagePhoto objects
  if (photos.length === 0 && rawDamagePhotos) {
    try {
      const raw = JSON.parse(rawDamagePhotos);
      if (Array.isArray(raw)) {
        photos = raw.map((url: string) => ({
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

  if (photos.length === 0) return null;

  // Separate damage photos from document pages for display
  const damageOnly = photos.filter(p => p.classification !== "document");
  const docPages   = photos.filter(p => p.classification === "document");
  const displayPhotos = damageOnly.length > 0 ? damageOnly : photos;
  const visiblePhotos = showAll ? displayPhotos : displayPhotos.slice(0, 8);

  // Stats
  const zoneCount: Record<string, number> = {};
  for (const p of damageOnly) {
    const z = p.impactZone?.zone || "unknown";
    zoneCount[z] = (zoneCount[z] || 0) + 1;
  }
  const allComponents = damageOnly.flatMap(p => p.detectedComponents || []);
  const severeCount = allComponents.filter(c => c.severity === "severe" || c.severity === "total_loss").length;

  return (
    <>
      {/* Stats bar */}
      <div className="flex flex-wrap gap-2 mb-4">
        <Badge variant="outline" className="gap-1">
          <Camera className="w-3 h-3" />
          {damageOnly.length} damage photo{damageOnly.length !== 1 ? "s" : ""}
        </Badge>
        {docPages.length > 0 && (
          <Badge variant="outline" className="gap-1 text-muted-foreground">
            <FileText className="w-3 h-3" />
            {docPages.length} document page{docPages.length !== 1 ? "s" : ""}
          </Badge>
        )}
        {Object.entries(zoneCount).filter(([z]) => z !== "unknown").map(([zone, count]) => (
          <span key={zone} className={`text-xs font-semibold px-2 py-0.5 rounded uppercase tracking-wide ${ZONE_COLOURS[zone] || ZONE_COLOURS.unknown}`}>
            {zone} ×{count}
          </span>
        ))}
        {severeCount > 0 && (
          <Badge className="bg-red-600 text-white gap-1">
            {severeCount} severe component{severeCount !== 1 ? "s" : ""}
          </Badge>
        )}
      </div>

      {/* Photo grid */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {visiblePhotos.map((photo, idx) => (
          <PhotoCard
            key={idx}
            photo={photo}
            index={idx}
            onOpen={() => setLightboxPhoto(photo)}
          />
        ))}
      </div>

      {/* Show more / less */}
      {displayPhotos.length > 8 && (
        <div className="mt-3 text-center">
          <Button variant="outline" size="sm" onClick={() => setShowAll(v => !v)}>
            {showAll ? "Show less" : `Show all ${displayPhotos.length} photos`}
          </Button>
        </div>
      )}

      {/* Document pages toggle */}
      {docPages.length > 0 && damageOnly.length > 0 && (
        <div className="mt-4 pt-3 border-t">
          <p className="text-xs text-gray-500 dark:text-muted-foreground mb-2">
            {docPages.length} document page{docPages.length !== 1 ? "s" : ""} also extracted (quote sheets, police reports, assessor forms)
          </p>
          <div className="grid gap-2 grid-cols-3 md:grid-cols-5">
            {docPages.slice(0, 5).map((photo, idx) => (
              <div
                key={idx}
                className="relative rounded border border-gray-200 dark:border-border overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => setLightboxPhoto(photo)}
              >
                <img
                  src={photo.imageUrl}
                  alt={`Document page ${idx + 1}`}
                  className="w-full h-20 object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
                <p className="text-xs text-center text-gray-500 dark:text-muted-foreground py-0.5">p.{photo.pageNumber || idx + 1}</p>
              </div>
            ))}
            {docPages.length > 5 && (
              <div className="flex items-center justify-center text-xs text-gray-400 dark:text-muted-foreground/70">
                +{docPages.length - 5} more
              </div>
            )}
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightboxPhoto && (
        <Lightbox photo={lightboxPhoto} onClose={() => setLightboxPhoto(null)} />
      )}
    </>
  );
}
