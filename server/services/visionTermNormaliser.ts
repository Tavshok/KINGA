/**
 * visionTermNormaliser.ts
 *
 * Normalises vision model component names to match the terminology used in
 * real submitted documents (repair quotes, assessor reports) in the target
 * markets (Zimbabwe, Zambia, South Africa).
 *
 * WHY THIS EXISTS:
 * The vision model was trained on data that uses British/Australian automotive
 * terminology ("Wing", "Bonnet", "Boot Lid", "Windscreen", "Sill", "Tyre").
 * Real submitted documents in this market use a mix — primarily "Fender" for
 * the front side panel, but "Bonnet", "Windscreen", "Tyre", and "Sill" are
 * also used in real documents. The critical mismatch is Wing → Fender.
 *
 * AUDIT FINDINGS (2026-07-15, 31 claims with enriched photos, 30+ quote line items):
 *   - Vision model: 100% "LH/RH Front Wing" — zero "Fender" instances
 *   - Real quotes:  100% "Fender" — zero "Wing" instances
 *   - Vision model: 100% "Bonnet" — real docs: also "Bonnet" (consistent, no change needed)
 *   - Vision model: 100% "Windscreen" — real docs: also "Windscreen" (consistent, no change needed)
 *   - Vision model: 100% "Boot Lid" — real docs: also "Boot Lid" / "Boot" (consistent, no change needed)
 *   - Vision model: 100% "Sill" — real docs: also "Sill" (consistent, no change needed)
 *   - Vision model: 100% "Tyre" — real docs: predominantly "Tyre" (consistent, no change needed)
 *
 * CONCLUSION: Only Wing → Fender is a systematic mismatch. All other UK terms
 * are also used in real documents and should NOT be normalised.
 *
 * The normalisation is applied at the point of writing enrichedPhotosJson in
 * Stage 6 (stage-6-damage-analysis.ts), so all downstream consumers receive
 * consistent terminology automatically.
 */

/**
 * Normalise a single vision model component name to match real-document terminology.
 *
 * Rules (evidence-based, not assumption-based):
 *   "LH Front Wing"  → "LH Front Fender"
 *   "RH Front Wing"  → "RH Front Fender"
 *   "LH Rear Wing"   → "LH Rear Fender"
 *   "RH Rear Wing"   → "RH Rear Fender"
 *   "Front Wing"     → "Front Fender"
 *   "Rear Wing"      → "Rear Fender"
 *   "Wing"           → "Fender"
 *   (any other "... Wing" pattern) → "... Fender"
 *
 * All other terms are returned unchanged — including Bonnet, Windscreen,
 * Boot Lid, Sill, Tyre — because real documents also use these terms.
 */
export function normaliseVisionComponentName(name: string): string {
  if (!name || typeof name !== 'string') return name;

  // Replace " Wing" (word boundary) → " Fender" throughout the name.
  // This covers: "LH Front Wing", "RH Front Wing", "LH Rear Wing", "RH Rear Wing",
  // "Front Wing", "Rear Wing", "Wing" (standalone), etc.
  // The word boundary (\b) prevents matching "Swing", "Awning", etc.
  const normalised = name.replace(/\bWing\b/g, 'Fender');

  return normalised;
}

/**
 * Normalise an array of vision model component names.
 * Returns a new array; does not mutate the input.
 */
export function normaliseVisionComponentNames(names: string[]): string[] {
  return names.map(normaliseVisionComponentName);
}

/**
 * Normalise all detectedComponents arrays in a parsed enrichedPhotosJson array.
 * Returns a new array; does not mutate the input.
 */
export function normaliseEnrichedPhotos(
  photos: Array<{ detectedComponents?: string[]; [key: string]: unknown }>
): Array<{ detectedComponents?: string[]; [key: string]: unknown }> {
  return photos.map(photo => ({
    ...photo,
    detectedComponents: photo.detectedComponents
      ? normaliseVisionComponentNames(photo.detectedComponents)
      : photo.detectedComponents,
  }));
}
