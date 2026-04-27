/**
 * vehiclePanelDimensions.ts
 *
 * Panel area lookup table for common vehicle body types.
 * Areas are approximate geometric surface areas in m² for each panel,
 * derived from published vehicle dimensions and panel geometry studies.
 *
 * Sources:
 *  - SAE J1100 Vehicle Dimensions standard
 *  - NHTSA NCAP panel measurement datasets
 *  - Toyota/Isuzu/Honda service manual panel replacement area specs
 *
 * Usage:
 *   getPanelAreaM2(bodyType, panelName) → area in m²
 *   computeTotalDamageAreaM2(bodyType, components) → sum of (area × fraction)
 */

export type VehicleBodyType =
  | "sedan"
  | "hatchback"
  | "suv"
  | "pickup"
  | "van"
  | "bus"
  | "truck"
  | "coupe"
  | "wagon"
  | "unknown";

/** Panel surface area in m² by body type */
const PANEL_AREAS: Record<VehicleBodyType, Record<string, number>> = {
  sedan: {
    // Front
    "front bumper":          0.38,
    "front bumper cover":    0.38,
    "bonnet":                1.15,
    "hood":                  1.15,
    "front grille":          0.18,
    "headlamp":              0.08,
    "headlight":             0.08,
    "fog lamp":              0.04,
    "front fender":          0.28,
    "fender":                0.28,
    "radiator":              0.22,
    "radiator support":      0.18,
    "windshield":            0.82,
    "front windshield":      0.82,
    // Side
    "front door":            0.62,
    "rear door":             0.58,
    "door":                  0.60,
    "a-pillar":              0.12,
    "b-pillar":              0.10,
    "c-pillar":              0.10,
    "rocker panel":          0.20,
    "sill":                  0.20,
    "side mirror":           0.04,
    "wing mirror":           0.04,
    // Rear
    "rear bumper":           0.35,
    "rear bumper cover":     0.35,
    "boot lid":              0.65,
    "trunk lid":             0.65,
    "tailgate":              0.65,
    "rear windshield":       0.55,
    "rear window":           0.55,
    "tail lamp":             0.06,
    "tail light":            0.06,
    "rear fender":           0.32,
    "quarter panel":         0.32,
    // Roof
    "roof":                  1.40,
    "roof panel":            1.40,
    // Underbody
    "floor pan":             1.80,
    "chassis":               2.00,
    "suspension":            0.15,
    "wheel arch":            0.12,
    "wheel":                 0.10,
    "tyre":                  0.10,
    // Default
    "unknown":               0.20,
  },
  hatchback: {
    "front bumper":          0.36,
    "front bumper cover":    0.36,
    "bonnet":                1.05,
    "hood":                  1.05,
    "front grille":          0.16,
    "headlamp":              0.07,
    "headlight":             0.07,
    "fog lamp":              0.04,
    "front fender":          0.25,
    "fender":                0.25,
    "radiator":              0.20,
    "radiator support":      0.16,
    "windshield":            0.75,
    "front windshield":      0.75,
    "front door":            0.58,
    "rear door":             0.52,
    "door":                  0.55,
    "a-pillar":              0.10,
    "b-pillar":              0.09,
    "c-pillar":              0.09,
    "rocker panel":          0.18,
    "sill":                  0.18,
    "side mirror":           0.04,
    "wing mirror":           0.04,
    "rear bumper":           0.32,
    "rear bumper cover":     0.32,
    "boot lid":              0.55,
    "trunk lid":             0.55,
    "tailgate":              0.70,
    "rear windshield":       0.50,
    "rear window":           0.50,
    "tail lamp":             0.05,
    "tail light":            0.05,
    "rear fender":           0.28,
    "quarter panel":         0.28,
    "roof":                  1.20,
    "roof panel":            1.20,
    "floor pan":             1.60,
    "chassis":               1.80,
    "suspension":            0.15,
    "wheel arch":            0.11,
    "wheel":                 0.10,
    "tyre":                  0.10,
    "unknown":               0.18,
  },
  suv: {
    "front bumper":          0.48,
    "front bumper cover":    0.48,
    "bonnet":                1.40,
    "hood":                  1.40,
    "front grille":          0.24,
    "headlamp":              0.10,
    "headlight":             0.10,
    "fog lamp":              0.05,
    "front fender":          0.35,
    "fender":                0.35,
    "radiator":              0.28,
    "radiator support":      0.22,
    "windshield":            0.95,
    "front windshield":      0.95,
    "front door":            0.72,
    "rear door":             0.68,
    "door":                  0.70,
    "a-pillar":              0.14,
    "b-pillar":              0.12,
    "c-pillar":              0.12,
    "rocker panel":          0.25,
    "sill":                  0.25,
    "side mirror":           0.05,
    "wing mirror":           0.05,
    "rear bumper":           0.44,
    "rear bumper cover":     0.44,
    "boot lid":              0.80,
    "trunk lid":             0.80,
    "tailgate":              0.90,
    "rear windshield":       0.65,
    "rear window":           0.65,
    "tail lamp":             0.08,
    "tail light":            0.08,
    "rear fender":           0.40,
    "quarter panel":         0.40,
    "roof":                  1.80,
    "roof panel":            1.80,
    "floor pan":             2.20,
    "chassis":               2.50,
    "suspension":            0.20,
    "wheel arch":            0.15,
    "wheel":                 0.12,
    "tyre":                  0.12,
    "unknown":               0.25,
  },
  pickup: {
    // Toyota Hilux / Isuzu D-Max / Ford Ranger class
    "front bumper":          0.52,
    "front bumper cover":    0.52,
    "bonnet":                1.45,
    "hood":                  1.45,
    "front grille":          0.26,
    "headlamp":              0.11,
    "headlight":             0.11,
    "fog lamp":              0.05,
    "front fender":          0.38,
    "fender":                0.38,
    "radiator":              0.30,
    "radiator support":      0.24,
    "windshield":            0.98,
    "front windshield":      0.98,
    "front door":            0.75,
    "rear door":             0.70,
    "door":                  0.72,
    "a-pillar":              0.14,
    "b-pillar":              0.12,
    "c-pillar":              0.12,
    "rocker panel":          0.28,
    "sill":                  0.28,
    "side mirror":           0.05,
    "wing mirror":           0.05,
    "rear bumper":           0.46,
    "rear bumper cover":     0.46,
    "tailgate":              0.95,
    "rear windshield":       0.55,
    "rear window":           0.55,
    "tail lamp":             0.08,
    "tail light":            0.08,
    "rear fender":           0.45,
    "quarter panel":         0.45,
    "load bed":              2.20,
    "tub":                   2.20,
    "roof":                  1.85,
    "roof panel":            1.85,
    "floor pan":             2.40,
    "chassis":               2.80,
    "suspension":            0.22,
    "wheel arch":            0.16,
    "wheel":                 0.13,
    "tyre":                  0.13,
    "unknown":               0.28,
  },
  van: {
    "front bumper":          0.55,
    "front bumper cover":    0.55,
    "bonnet":                1.20,
    "hood":                  1.20,
    "front grille":          0.28,
    "headlamp":              0.10,
    "headlight":             0.10,
    "fog lamp":              0.05,
    "front fender":          0.30,
    "fender":                0.30,
    "radiator":              0.32,
    "radiator support":      0.25,
    "windshield":            1.10,
    "front windshield":      1.10,
    "front door":            0.90,
    "rear door":             0.85,
    "sliding door":          1.20,
    "door":                  0.90,
    "a-pillar":              0.16,
    "b-pillar":              0.14,
    "c-pillar":              0.14,
    "rocker panel":          0.35,
    "sill":                  0.35,
    "side mirror":           0.06,
    "wing mirror":           0.06,
    "rear bumper":           0.50,
    "rear bumper cover":     0.50,
    "rear windshield":       0.70,
    "rear window":           0.70,
    "tail lamp":             0.09,
    "tail light":            0.09,
    "rear fender":           0.55,
    "quarter panel":         0.55,
    "roof":                  3.50,
    "roof panel":            3.50,
    "floor pan":             4.00,
    "chassis":               4.50,
    "suspension":            0.25,
    "wheel arch":            0.18,
    "wheel":                 0.13,
    "tyre":                  0.13,
    "unknown":               0.30,
  },
  bus: {
    "front bumper":          0.80,
    "front bumper cover":    0.80,
    "windshield":            2.50,
    "front windshield":      2.50,
    "headlamp":              0.15,
    "headlight":             0.15,
    "side panel":            4.00,
    "door":                  2.00,
    "rear bumper":           0.75,
    "rear window":           1.20,
    "tail lamp":             0.12,
    "tail light":            0.12,
    "roof":                  12.00,
    "roof panel":            12.00,
    "floor pan":             14.00,
    "chassis":               16.00,
    "suspension":            0.40,
    "wheel arch":            0.25,
    "wheel":                 0.20,
    "tyre":                  0.20,
    "unknown":               0.50,
  },
  truck: {
    "front bumper":          0.70,
    "front bumper cover":    0.70,
    "bonnet":                2.20,
    "hood":                  2.20,
    "front grille":          0.50,
    "headlamp":              0.14,
    "headlight":             0.14,
    "fog lamp":              0.07,
    "front fender":          0.60,
    "fender":                0.60,
    "radiator":              0.55,
    "radiator support":      0.40,
    "windshield":            1.40,
    "front windshield":      1.40,
    "door":                  1.20,
    "rocker panel":          0.50,
    "sill":                  0.50,
    "side mirror":           0.10,
    "wing mirror":           0.10,
    "rear bumper":           0.65,
    "tail lamp":             0.12,
    "tail light":            0.12,
    "roof":                  3.00,
    "roof panel":            3.00,
    "floor pan":             6.00,
    "chassis":               8.00,
    "suspension":            0.40,
    "wheel arch":            0.22,
    "wheel":                 0.18,
    "tyre":                  0.18,
    "unknown":               0.40,
  },
  coupe: {
    "front bumper":          0.36,
    "front bumper cover":    0.36,
    "bonnet":                1.10,
    "hood":                  1.10,
    "front grille":          0.16,
    "headlamp":              0.08,
    "headlight":             0.08,
    "fog lamp":              0.04,
    "front fender":          0.26,
    "fender":                0.26,
    "radiator":              0.20,
    "radiator support":      0.16,
    "windshield":            0.78,
    "front windshield":      0.78,
    "front door":            0.68,
    "door":                  0.68,
    "a-pillar":              0.10,
    "b-pillar":              0.09,
    "c-pillar":              0.09,
    "rocker panel":          0.18,
    "sill":                  0.18,
    "side mirror":           0.04,
    "wing mirror":           0.04,
    "rear bumper":           0.33,
    "rear bumper cover":     0.33,
    "boot lid":              0.62,
    "trunk lid":             0.62,
    "rear windshield":       0.52,
    "rear window":           0.52,
    "tail lamp":             0.06,
    "tail light":            0.06,
    "rear fender":           0.30,
    "quarter panel":         0.30,
    "roof":                  1.10,
    "roof panel":            1.10,
    "floor pan":             1.55,
    "chassis":               1.75,
    "suspension":            0.14,
    "wheel arch":            0.11,
    "wheel":                 0.10,
    "tyre":                  0.10,
    "unknown":               0.18,
  },
  wagon: {
    "front bumper":          0.40,
    "front bumper cover":    0.40,
    "bonnet":                1.18,
    "hood":                  1.18,
    "front grille":          0.18,
    "headlamp":              0.08,
    "headlight":             0.08,
    "fog lamp":              0.04,
    "front fender":          0.28,
    "fender":                0.28,
    "radiator":              0.22,
    "radiator support":      0.18,
    "windshield":            0.85,
    "front windshield":      0.85,
    "front door":            0.64,
    "rear door":             0.60,
    "door":                  0.62,
    "a-pillar":              0.12,
    "b-pillar":              0.10,
    "c-pillar":              0.10,
    "rocker panel":          0.22,
    "sill":                  0.22,
    "side mirror":           0.04,
    "wing mirror":           0.04,
    "rear bumper":           0.38,
    "rear bumper cover":     0.38,
    "tailgate":              0.80,
    "rear windshield":       0.60,
    "rear window":           0.60,
    "tail lamp":             0.07,
    "tail light":            0.07,
    "rear fender":           0.35,
    "quarter panel":         0.35,
    "roof":                  1.55,
    "roof panel":            1.55,
    "floor pan":             1.90,
    "chassis":               2.10,
    "suspension":            0.16,
    "wheel arch":            0.12,
    "wheel":                 0.10,
    "tyre":                  0.10,
    "unknown":               0.22,
  },
  unknown: {
    "front bumper":          0.42,
    "front bumper cover":    0.42,
    "bonnet":                1.20,
    "hood":                  1.20,
    "front grille":          0.20,
    "headlamp":              0.09,
    "headlight":             0.09,
    "fog lamp":              0.04,
    "front fender":          0.30,
    "fender":                0.30,
    "radiator":              0.24,
    "radiator support":      0.20,
    "windshield":            0.88,
    "front windshield":      0.88,
    "front door":            0.65,
    "rear door":             0.60,
    "door":                  0.62,
    "a-pillar":              0.12,
    "b-pillar":              0.10,
    "c-pillar":              0.10,
    "rocker panel":          0.22,
    "sill":                  0.22,
    "side mirror":           0.04,
    "wing mirror":           0.04,
    "rear bumper":           0.38,
    "rear bumper cover":     0.38,
    "boot lid":              0.68,
    "trunk lid":             0.68,
    "tailgate":              0.80,
    "rear windshield":       0.58,
    "rear window":           0.58,
    "tail lamp":             0.07,
    "tail light":            0.07,
    "rear fender":           0.36,
    "quarter panel":         0.36,
    "roof":                  1.50,
    "roof panel":            1.50,
    "floor pan":             1.90,
    "chassis":               2.20,
    "suspension":            0.18,
    "wheel arch":            0.13,
    "wheel":                 0.11,
    "tyre":                  0.11,
    "unknown":               0.22,
  },
};

/**
 * Map severity + estimatedDepth to a damage fraction (0.0–1.0).
 * This represents what fraction of the panel surface is affected.
 *
 * Logic:
 *  - cosmetic/superficial → small surface scratches, ~10–20% of panel
 *  - minor/moderate depth → localised dents, ~20–40%
 *  - moderate/severe depth → significant deformation, ~40–70%
 *  - severe/catastrophic → panel likely needs full replacement, ~70–100%
 */
export function severityToFraction(
  severity: string,
  estimatedDepth?: string,
  panelDeformation?: boolean,
): number {
  const sev = (severity || "").toLowerCase();
  const depth = (estimatedDepth || "").toLowerCase();

  // Base fraction from severity
  let base = 0.25;
  if (sev === "cosmetic")      base = 0.12;
  else if (sev === "minor")    base = 0.22;
  else if (sev === "moderate") base = 0.45;
  else if (sev === "severe")   base = 0.72;
  else if (sev === "catastrophic") base = 0.95;

  // Adjust for depth
  if (depth === "superficial") base = Math.min(base, 0.25);
  else if (depth === "moderate") base = Math.max(base, 0.30);
  else if (depth === "severe")   base = Math.max(base, 0.55);

  // Panel deformation bumps fraction up slightly
  if (panelDeformation) base = Math.min(1.0, base + 0.08);

  return Math.min(1.0, Math.max(0.05, base));
}

/**
 * Infer vehicle body type from model name string.
 */
export function inferBodyType(vehicleModel: string): VehicleBodyType {
  const m = (vehicleModel || "").toLowerCase();

  if (/hilux|d.?max|ranger|navara|l200|triton|amarok|frontier|tacoma|tundra|tunland|kb\s*\d|kb\d|kb240|kb300|kb250/.test(m)) return "pickup";
  if (/land.?cruiser|prado|fortuner|pajero|patrol|discovery|defender|wrangler|4runner|rav4|crv|cr.?v|hrv|hr.?v|cx.?5|cx5|tucson|sportage|outlander|captiva|rush|terios|duster|tiguan|q3|q5|x1|x3|x5|gls|gle|glc|glb|gla/.test(m)) return "suv";
  if (/sprinter|hiace|transit|master|trafic|vivaro|nv200|nv300|nv400|quantum|h100|h200|h300|h1|h2|h3|starex|bus|minibus|coaster/.test(m)) return "van";
  if (/axio|corolla|camry|civic|accord|mazda3|mazda6|lancer|galant|almera|sunny|sentra|jetta|golf.?sedan|polo.?sedan|belta|vitz|yaris.?sedan|fiesta.?sedan|focus.?sedan|c180|c200|c220|c250|c300|e200|e220|e250|e300|320i|318i|520i|525i|a4|a6|passat|altis/.test(m)) return "sedan";
  if (/golf|polo|fit|jazz|swift|baleno|vitz|yaris|runx|allex|ist|auris|blade|hatch|corolla.?hatch|civic.?hatch|mazda2|demio|note|march|micra|clio|fiesta|focus.?hatch|punto|bravo|stilo|a3|a1|208|207|206|205|c3|c2/.test(m)) return "hatchback";
  if (/wagon|estate|touring|avant|combi|sw|break|variant|allroad|outback|legacy|forester|xv|impreza.?wagon|corolla.?wagon|avensis.?wagon/.test(m)) return "wagon";
  if (/coupe|cabrio|convertible|roadster|z4|slk|clk|cls|rc|86|brz|mustang|camaro|corvette/.test(m)) return "coupe";
  if (/truck|lorry|tipper|flatbed|rigid|semi|hino|isuzu.?ftr|isuzu.?fvr|isuzu.?fvz|man|daf|volvo.?fh|mercedes.?actros|scania/.test(m)) return "truck";
  if (/bus|coach|omnibus/.test(m)) return "bus";

  return "unknown";
}

/**
 * Get the panel area in m² for a given body type and panel name.
 * Falls back to body type "unknown" if body type not found,
 * then to "unknown" panel if panel name not found.
 */
export function getPanelAreaM2(bodyType: VehicleBodyType, panelName: string): number {
  const table = PANEL_AREAS[bodyType] ?? PANEL_AREAS["unknown"];
  const key = (panelName || "").toLowerCase().trim();

  // Direct lookup
  if (table[key] !== undefined) return table[key];

  // Fuzzy match — find the closest key that contains or is contained by the panel name
  for (const [tableKey, area] of Object.entries(table)) {
    if (key.includes(tableKey) || tableKey.includes(key)) return area;
  }

  // Fall back to unknown panel area for this body type
  return table["unknown"] ?? 0.22;
}

/**
 * Compute total damage area in m² from a list of damaged components.
 *
 * For each component:
 *   areaM2 = panelArea(bodyType, componentName) × damageFraction(severity, depth)
 *
 * Deduplicates by component name (takes the worst severity if same panel appears twice).
 */
export function computeTotalDamageAreaM2(
  bodyType: VehicleBodyType,
  components: Array<{
    name: string;
    severity: string;
    estimatedDepth?: string;
    panelDeformation?: boolean;
    damageFractionOverride?: number; // 0.0–1.0, from LLM if available
  }>,
): {
  totalAreaM2: number;
  perComponent: Array<{
    name: string;
    panelAreaM2: number;
    damageFraction: number;
    contributionM2: number;
  }>;
} {
  // Deduplicate: keep worst severity per panel name
  const deduped = new Map<string, typeof components[0]>();
  const severityOrder = ["cosmetic", "minor", "moderate", "severe", "catastrophic"];
  for (const c of components) {
    const key = (c.name || "").toLowerCase().trim();
    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, c);
    } else {
      const existingIdx = severityOrder.indexOf((existing.severity || "").toLowerCase());
      const newIdx = severityOrder.indexOf((c.severity || "").toLowerCase());
      if (newIdx > existingIdx) deduped.set(key, c);
    }
  }

  const perComponent: Array<{
    name: string;
    panelAreaM2: number;
    damageFraction: number;
    contributionM2: number;
  }> = [];

  let totalAreaM2 = 0;

  for (const c of deduped.values()) {
    const panelAreaM2 = getPanelAreaM2(bodyType, c.name);
    const damageFraction = c.damageFractionOverride !== undefined
      ? Math.min(1.0, Math.max(0.0, c.damageFractionOverride))
      : severityToFraction(c.severity, c.estimatedDepth, c.panelDeformation);
    const contributionM2 = panelAreaM2 * damageFraction;
    perComponent.push({ name: c.name, panelAreaM2, damageFraction, contributionM2 });
    totalAreaM2 += contributionM2;
  }

  return { totalAreaM2, perComponent };
}
