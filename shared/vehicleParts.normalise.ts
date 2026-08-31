/**
 * Canonical vehicle-part normalisers.
 *
 * Keep all callers on these shared helpers; do not recreate local synonym maps.
 */
import { resolveComponent } from './vehicleParts.lookup';

// ─── Unified Canonical Normaliser ────────────────────────────────────────────
/**
 * Resolve any raw part name to its canonical VehiclePart.name.
 *
 * This is the **single source of truth** for part normalisation across the
 * entire pipeline. All stages — quote extraction (Stage 3), damage analysis
 * (Stage 6), cost optimisation (Stage 9), and the report renderer — must use
 * this function instead of local synonym maps.
 *
 * Resolution order:
 *   1. Exact alias match via _aliasIndex (covers all aliases in VEHICLE_PARTS)
 *   2. Substring match via resolveComponent (handles compound names)
 *   3. Returns the cleaned raw string if no match (never throws)
 *
 * @param rawName - Any raw part name from any source
 * @returns Canonical VehiclePart.name (e.g. "Front Bumper") or cleaned raw string
 */
export function resolveToCanonical(rawName: string): string {
  if (!rawName || !rawName.trim()) return rawName;
  const part = resolveComponent(rawName);
  if (part) return part.name;
  // No match — return cleaned string (lowercase, trimmed, normalised spacing)
  return rawName.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Resolve a raw part name to its canonical VehiclePart.id.
 * Returns null if the part is not in the catalogue.
 *
 * Use this for ID-based deduplication where you need to compare parts
 * across sources without string equality issues.
 */
export function resolveToCanonicalId(rawName: string): string | null {
  if (!rawName || !rawName.trim()) return null;
  const part = resolveComponent(rawName);
  return part ? part.id : null;
}

