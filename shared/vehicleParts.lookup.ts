/**
 * Vehicle-parts lookup and canonical matching helpers.
 *
 * Depends on the catalogue, but must not alter catalogue records.
 */
import type { VehiclePart, VehicleSubPart, VehicleZone } from './vehicleParts.types';
import { VEHICLE_PARTS } from './vehicleParts.catalogue';

// ─── Lookup Utilities ────────────────────────────────────────────────

/** Build a flat index: lowercase alias → VehiclePart */
const _aliasIndex = new Map<string, VehiclePart>();
for (const part of VEHICLE_PARTS) {
  _aliasIndex.set(part.name.toLowerCase(), part);
  _aliasIndex.set(part.id, part);
  for (const alias of part.aliases) {
    _aliasIndex.set(alias.toLowerCase(), part);
  }
  for (const sub of part.subParts) {
    _aliasIndex.set(sub.name.toLowerCase(), part);
    _aliasIndex.set(sub.id, part);
    for (const alias of sub.aliases) {
      _aliasIndex.set(alias.toLowerCase(), part);
    }
  }
}

/**
 * Resolve a free-text component name to a structured VehiclePart.
 * Uses exact match first, then fuzzy substring matching.
 */
export function resolveComponent(rawName: string): VehiclePart | null {
  const lower = rawName.trim().toLowerCase();
  
  // 1. Exact match
  if (_aliasIndex.has(lower)) return _aliasIndex.get(lower)!;
  
  // 2. Substring match (e.g. "left front door" matches "Front Door (Left / Passenger)")
  // Guard: only attempt substring match for alias keys >= 4 characters.
  // Short abbreviations like "RB", "AP", "LH" would otherwise match as
  // substrings inside unrelated words (e.g. "tuRBo", "cAPacitor").
  for (const [key, part] of Array.from(_aliasIndex.entries())) {
    if (key.length >= 4 && (lower.includes(key) || key.includes(lower))) {
      return part;
    }
  }
  
  // 3. Token overlap (at least 2 tokens must match)
  const tokens = lower.split(/[\s\/\-_,()]+/).filter(t => t.length > 2);
  let bestMatch: VehiclePart | null = null;
  let bestScore = 0;
  
  for (const part of VEHICLE_PARTS) {
    const partTokens = [
      ...part.name.toLowerCase().split(/[\s\/\-_,()]+/),
      ...part.aliases.flatMap(a => a.toLowerCase().split(/[\s\/\-_,()]+/)),
    ].filter(t => t.length > 2);
    
    const overlap = tokens.filter(t => partTokens.some(pt => pt.includes(t) || t.includes(pt))).length;
    if (overlap > bestScore && overlap >= 2) {
      bestScore = overlap;
      bestMatch = part;
    }
  }
  
  return bestMatch;
}

/**
 * Resolve a component name to its zone.
 */
export function resolveComponentZone(rawName: string): VehicleZone | null {
  const part = resolveComponent(rawName);
  return part ? part.zone : null;
}

/**
 * Get all parts in a specific zone.
 */
export function getPartsByZone(zone: VehicleZone): VehiclePart[] {
  return VEHICLE_PARTS.filter(p => p.zone === zone);
}

/**
 * Normalize a raw component name to its canonical form.
 * Returns the official part name if found, otherwise the original string.
 */
export function normalizeComponentName(rawName: string): string {
  const part = resolveComponent(rawName);
  return part ? part.name : rawName;
}

/**
 * Get sub-parts for a given component.
 */
export function getSubParts(rawName: string): VehicleSubPart[] {
  const part = resolveComponent(rawName);
  return part ? part.subParts : [];
}

/**
 * Resolve multiple raw component names and group by zone.
 */
export function groupComponentsByZone(rawNames: string[]): Map<VehicleZone, { part: VehiclePart; rawName: string }[]> {
  const grouped = new Map<VehicleZone, { part: VehiclePart; rawName: string }[]>();
  
  for (const raw of rawNames) {
    const part = resolveComponent(raw);
    if (part) {
      const existing = grouped.get(part.zone) || [];
      // Avoid duplicates
      if (!existing.some(e => e.part.id === part.id)) {
        existing.push({ part, rawName: raw });
        grouped.set(part.zone, existing);
      }
    }
  }
  
  return grouped;
}

