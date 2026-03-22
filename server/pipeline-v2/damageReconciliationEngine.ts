/**
 * damageReconciliationEngine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Vehicle Damage Reconciliation Engine
 *
 * Compares the official damage component list (from the assessor/claim form)
 * against the repair quote component list (from the panel beater quote).
 *
 * Uses semantic similarity — NOT exact string matching — so that:
 *   "rear bumper assembly" ↔ "B/bar" ↔ "back bumper" all resolve to the same component.
 *
 * Structural components (radiator support panel, bumper brackets, chassis rails,
 * firewall, sill, A/B/C-pillar) are treated with strict matching:
 *   - A structural component in the damage list that is absent from the quote
 *     is always flagged as MISSING (never silently dropped).
 *
 * CONTRACT:
 *   - Never infer components that are not in either list
 *   - coverage_ratio = matched.length / damage_components.length
 *   - If damage_components is empty, coverage_ratio = 1.0 (nothing to cover)
 *
 * OUTPUT SCHEMA:
 *   {
 *     matched:         MatchedComponent[],
 *     missing:         ComponentFlag[],
 *     extra:           ComponentFlag[],
 *     coverage_ratio:  number (0–1, 2 decimal places),
 *     structural_gaps: string[],   // structural components that are missing from quote
 *     summary:         string
 *   }
 */

// ─── Public types ─────────────────────────────────────────────────────────────

export interface MatchedComponent {
  /** Normalised name from the damage list */
  damage_component: string;
  /** Normalised name from the quote list */
  quote_component: string;
  /** Similarity score 0–1 */
  similarity: number;
  /** Whether this is a structural component */
  is_structural: boolean;
}

export interface ComponentFlag {
  component: string;
  is_structural: boolean;
  reason: string;
}

export interface ReconciliationResult {
  matched: MatchedComponent[];
  missing: ComponentFlag[];
  extra: ComponentFlag[];
  coverage_ratio: number;
  /** Structural components present in damage list but absent from quote */
  structural_gaps: string[];
  summary: string;
}

// ─── Structural component registry ───────────────────────────────────────────
// Any component whose canonical form contains one of these keywords is treated
// as structural and will always be flagged if missing from the quote.

const STRUCTURAL_KEYWORDS = [
  "radiator support",
  "bumper bracket",
  "bumper mount",
  "chassis rail",
  "chassis leg",
  "firewall",
  "bulkhead",
  "sill",
  "rocker panel",
  "a-pillar",
  "b-pillar",
  "c-pillar",
  "d-pillar",
  "strut tower",
  "shock tower",
  "floor pan",
  "cross member",
  "subframe",
  "engine mount",
  "transmission mount",
  "diff mount",
  "diff connector",
  "differential connector",
  "axle",
  "control arm",
  "suspension arm",
  "steering rack",
  "tie rod",
  "knuckle",
];

// ─── Synonym / alias map ──────────────────────────────────────────────────────
// Maps common shorthand and regional variants to a canonical form.
// Keys are lowercase. Values are canonical lowercase strings.

const SYNONYM_MAP: Record<string, string> = {
  // Bumpers
  "b/bar": "rear bumper",
  "f/bar": "front bumper",
  "back bumper": "rear bumper",
  "rear bumper assembly": "rear bumper",
  "front bumper assembly": "front bumper",
  "bumper bar": "rear bumper",
  "bumper cover": "bumper",
  "bumper fascia": "bumper",
  // Lights
  "r/h tail lamp": "rhs tail lamp",
  "l/h tail lamp": "lhs tail lamp",
  "r/h headlamp": "rhs headlamp",
  "l/h headlamp": "lhs headlamp",
  "tail light": "tail lamp",
  "taillight": "tail lamp",
  "headlight": "headlamp",
  "fog lamp": "fog light",
  // Panels
  "loading panel": "load panel",
  "rhs loading panel": "rhs load panel",
  "lhs loading panel": "lhs load panel",
  "rear end panel": "rear end piece",
  "front end panel": "front end piece",
  "quarter panel": "quarter panel",
  "fender": "front fender",
  "wing": "front fender",
  "bonnet": "hood",
  "boot lid": "trunk lid",
  "boot": "trunk",
  // Structural
  "rad support panel": "radiator support panel",
  "rad support": "radiator support panel",
  "bumper brackets": "bumper bracket",
  "bumper mounts": "bumper bracket",
  // Glazing
  "w/screen": "windscreen",
  "windshield": "windscreen",
  "rear screen": "rear windscreen",
  "rear glass": "rear windscreen",
  // Mirrors
  "o/s mirror": "driver side mirror",
  "n/s mirror": "passenger side mirror",
  "door mirror": "side mirror",
  // Sensors / electronics
  "pdc sensor": "parking sensor",
  "parking distance sensor": "parking sensor",
  "bumper sensor": "parking sensor",
  "rear bumper sensors": "parking sensor",
  "front bumper sensors": "parking sensor",
  "parking sensors": "parking sensor",
  // Mechanical
  "diff": "differential",
  "diff connector": "differential connector",
  "diff housing": "differential housing",
  "gearbox": "transmission",
  "trans": "transmission",
  // Doors
  "r/h door": "rhs door",
  "l/h door": "lhs door",
  "r/f door": "right front door",
  "l/f door": "left front door",
  "r/r door": "right rear door",
  "l/r door": "left rear door",
  // Grille
  "front grille": "grille",
  "radiator grille": "grille",
  // Tow
  "tow bar": "tow hitch",
  "tow hinge": "tow hitch",
  "tow hook": "tow hitch",
};

// ─── Normalisation ────────────────────────────────────────────────────────────

/**
 * normalise
 *
 * Converts a raw component name to a canonical lowercase form by:
 * 1. Lowercasing
 * 2. Removing noise words (assembly, unit, assy, lh, rh prefix patterns)
 * 3. Applying the synonym map
 * 4. Collapsing whitespace
 */
export function normalise(raw: string): string {
  let s = raw.toLowerCase().trim();

  // Apply synonym map (longest match first, exact boundary match only)
  const synonymKeys = Object.keys(SYNONYM_MAP).sort((a, b) => b.length - a.length);
  for (const key of synonymKeys) {
    if (s === key) {
      s = SYNONYM_MAP[key];
      break;
    }
    // Boundary-safe replacement: only replace when surrounded by word boundaries
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?<![\\w/])${escaped}(?![\\w/])`);
    if (re.test(s)) {
      s = s.replace(re, SYNONYM_MAP[key]);
      break;
    }
  }

  // Remove trailing noise words
  s = s
    .replace(/\b(assembly|assy|unit|module|panel\s+assy)\b/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return s;
}

/**
 * isStructural
 *
 * Returns true if the normalised component name contains a structural keyword.
 */
export function isStructural(normalisedName: string): boolean {
  return STRUCTURAL_KEYWORDS.some(kw => normalisedName.includes(kw));
}

// ─── Similarity scoring ───────────────────────────────────────────────────────

/**
 * similarity
 *
 * Returns a similarity score (0–1) between two normalised component names.
 *
 * Strategy (in order of precedence):
 * 1. Exact match → 1.0
 * 2. One contains the other → 0.9
 * 3. Token overlap (Jaccard) → 0.0–0.85
 *
 * Structural components require a minimum score of 0.7 to be considered matched.
 * Non-structural components require a minimum score of 0.5.
 */
export function similarity(a: string, b: string): number {
  if (a === b) return 1.0;
  if (a.includes(b) || b.includes(a)) return 0.9;

  const tokensA = new Set(a.split(/\s+/).filter(t => t.length > 1));
  const tokensB = new Set(b.split(/\s+/).filter(t => t.length > 1));

  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  tokensA.forEach(t => { if (tokensB.has(t)) intersection++; });

  const union = tokensA.size + tokensB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// ─── Main reconciliation function ────────────────────────────────────────────

/**
 * reconcileDamageComponents
 *
 * Compares the official damage component list against the quote component list.
 *
 * @param damageComponents  Components from the assessor / claim form
 * @param quoteComponents   Components from the panel beater quote
 * @returns                 ReconciliationResult
 */
export function reconcileDamageComponents(
  damageComponents: string[],
  quoteComponents: string[]
): ReconciliationResult {
  // Handle edge cases
  if (damageComponents.length === 0) {
    return {
      matched: [],
      missing: [],
      extra: quoteComponents.map(c => ({
        component: normalise(c),
        is_structural: isStructural(normalise(c)),
        reason: "Component appears in quote but damage list is empty",
      })),
      coverage_ratio: 1.0,
      structural_gaps: [],
      summary: "Damage component list is empty — no reconciliation possible.",
    };
  }

  // Normalise both lists
  const normDamage = damageComponents.map(normalise);
  const normQuote = quoteComponents.map(normalise);

  // Minimum similarity thresholds
  const STRUCTURAL_THRESHOLD = 0.70;
  const STANDARD_THRESHOLD = 0.50;

  const matched: MatchedComponent[] = [];
  const missing: ComponentFlag[] = [];
  const usedQuoteIndices = new Set<number>();

  // For each damage component, find the best matching quote component
  for (let di = 0; di < normDamage.length; di++) {
    const dc = normDamage[di];
    const structural = isStructural(dc);
    const threshold = structural ? STRUCTURAL_THRESHOLD : STANDARD_THRESHOLD;

    let bestScore = 0;
    let bestQi = -1;

    for (let qi = 0; qi < normQuote.length; qi++) {
      if (usedQuoteIndices.has(qi)) continue;
      const score = similarity(dc, normQuote[qi]);
      if (score > bestScore) {
        bestScore = score;
        bestQi = qi;
      }
    }

    if (bestQi >= 0 && bestScore >= threshold) {
      matched.push({
        damage_component: dc,
        quote_component: normQuote[bestQi],
        similarity: Math.round(bestScore * 100) / 100,
        is_structural: structural,
      });
      usedQuoteIndices.add(bestQi);
    } else {
      missing.push({
        component: dc,
        is_structural: structural,
        reason: structural
          ? `Structural component not found in quote (best match score: ${Math.round(bestScore * 100)}%)`
          : `Component not found in quote (best match score: ${Math.round(bestScore * 100)}%)`,
      });
    }
  }

  // Extra components: quote items that were not matched to any damage component
  const extra: ComponentFlag[] = [];
  for (let qi = 0; qi < normQuote.length; qi++) {
    if (!usedQuoteIndices.has(qi)) {
      const qc = normQuote[qi];
      extra.push({
        component: qc,
        is_structural: isStructural(qc),
        reason: "Component appears in quote but not in official damage list",
      });
    }
  }

  const coverageRatio =
    damageComponents.length === 0
      ? 1.0
      : Math.round((matched.length / damageComponents.length) * 100) / 100;

  const structuralGaps = missing
    .filter(m => m.is_structural)
    .map(m => m.component);

  // Build summary
  const summaryParts: string[] = [];
  summaryParts.push(
    `${matched.length} of ${damageComponents.length} damage components matched in quote (coverage: ${Math.round(coverageRatio * 100)}%).`
  );
  if (missing.length > 0) {
    summaryParts.push(
      `${missing.length} component(s) missing from quote${structuralGaps.length > 0 ? `, including ${structuralGaps.length} structural` : ""}.`
    );
  }
  if (extra.length > 0) {
    summaryParts.push(
      `${extra.length} extra component(s) in quote not in damage list.`
    );
  }
  if (structuralGaps.length > 0) {
    summaryParts.push(
      `STRUCTURAL GAPS: ${structuralGaps.join(", ")} — require manual review.`
    );
  }

  return {
    matched,
    missing,
    extra,
    coverage_ratio: coverageRatio,
    structural_gaps: structuralGaps,
    summary: summaryParts.join(" "),
  };
}
