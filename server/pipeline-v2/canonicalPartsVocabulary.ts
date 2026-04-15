/**
 * pipeline-v2/canonicalPartsVocabulary.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * SINGLE SOURCE OF TRUTH for vehicle part names used across the KINGA pipeline.
 *
 * Nomenclature standard: SA / Audatex ZA
 *   - "Bonnet" (not Hood)
 *   - "Boot Lid" (not Trunk Lid)
 *   - "Windscreen" (not Windshield)
 *   - "Rear Windscreen" (not Back Glass / Rear Windshield)
 *   - "Wing" (not Fender) — front body panel
 *   - "Quarter Panel" (rear body panel, no "Rear Fender")
 *   - "Sill" (not Rocker Panel)
 *   - "Bumper Bar" (not Bumper Cover / Bumper Fascia)
 *   - "Fog Lamp" (not Fog Light)
 *   - "Tail Lamp" (not Tail Light)
 *   - "Headlamp" (not Headlight)
 *   - "LH" = left-hand / driver side, "RH" = right-hand / passenger side
 *
 * ALL stages that produce or consume part names MUST use this module:
 *   - Stage 6 (damage analysis) — normalise LLM-extracted names at output
 *   - Stage 9 (cost engine) — match component names to COMPONENT_BASE_INDEX
 *   - quoteOptimisationEngine — normalise quote line item names
 *   - Stage 10 (report) — display canonical names
 *
 * DESIGN RULES:
 *   1. Canonical names are the authoritative display form (SA/Audatex ZA Title Case)
 *   2. The synonym map covers common abbreviations, typos, US/UK variants
 *   3. The normaliser uses: exact match → synonym map → token similarity → original
 *   4. A name that cannot be normalised is returned as-is (never silently dropped)
 *   5. Side prefixes (LH/RH) are preserved through normalisation
 */

// ─────────────────────────────────────────────────────────────────────────────
// CANONICAL PARTS LIST — SA / Audatex ZA nomenclature
// ─────────────────────────────────────────────────────────────────────────────
export const CANONICAL_PARTS: readonly string[] = [
  // ── Front end ──────────────────────────────────────────────────────────────
  "Front Bumper Bar",
  "Front Bumper Reinforcement",
  "Front Grille",
  "Bonnet",
  "Bonnet Hinge",
  "Bonnet Lock",
  "LH Headlamp",
  "RH Headlamp",
  "LH Fog Lamp",
  "RH Fog Lamp",
  "Radiator",
  "Radiator Support Panel",
  "AC Condenser",
  "Intercooler",
  "Front Subframe",
  "Front Crossmember",
  // ── Glass ─────────────────────────────────────────────────────────────────
  "Windscreen",
  "Rear Windscreen",
  "LH Front Door Glass",
  "RH Front Door Glass",
  "LH Rear Door Glass",
  "RH Rear Door Glass",
  "LH Quarter Glass",
  "RH Quarter Glass",
  "Sunroof Glass",
  // ── Doors ─────────────────────────────────────────────────────────────────
  "LH Front Door",
  "RH Front Door",
  "LH Rear Door",
  "RH Rear Door",
  "LH Front Door Skin",
  "RH Front Door Skin",
  "LH Rear Door Skin",
  "RH Rear Door Skin",
  // ── Wings / Quarter Panels ────────────────────────────────────────────────
  "LH Front Wing",
  "RH Front Wing",
  "LH Quarter Panel",
  "RH Quarter Panel",
  // ── Pillars ───────────────────────────────────────────────────────────────
  "LH A-Pillar",
  "RH A-Pillar",
  "LH B-Pillar",
  "RH B-Pillar",
  "LH C-Pillar",
  "RH C-Pillar",
  "LH D-Pillar",
  "RH D-Pillar",
  // ── Sills ─────────────────────────────────────────────────────────────────
  "LH Sill",
  "RH Sill",
  // ── Roof ──────────────────────────────────────────────────────────────────
  "Roof Panel",
  "Roof Lining",
  // ── Rear end ──────────────────────────────────────────────────────────────
  "Boot Lid",
  "Rear Bumper Bar",
  "Rear Bumper Reinforcement",
  "Rear Valance",
  "LH Tail Lamp",
  "RH Tail Lamp",
  // ── Mirrors ───────────────────────────────────────────────────────────────
  "LH Door Mirror",
  "RH Door Mirror",
  // ── Structural ────────────────────────────────────────────────────────────
  "Chassis/Frame",
  "LH Chassis Rail",
  "RH Chassis Rail",
  "Firewall/Bulkhead",
  "Floor Pan",
  // ── Suspension ────────────────────────────────────────────────────────────
  "LH Front Strut",
  "RH Front Strut",
  "LH Rear Strut",
  "RH Rear Strut",
  "LH Front Control Arm",
  "RH Front Control Arm",
  "LH Rear Control Arm",
  "RH Rear Control Arm",
  "LH Front Strut Tower",
  "RH Front Strut Tower",
  // ── Safety ────────────────────────────────────────────────────────────────
  "Airbag Module",
  "Driver Airbag",
  "Passenger Airbag",
  "Side Curtain Airbag",
  "Seatbelt Assembly",
  // ── Drivetrain ────────────────────────────────────────────────────────────
  "Engine",
  "Gearbox",
  "Differential",
  "Propshaft",
  // ── Body trim / mouldings ─────────────────────────────────────────────────
  "Body Moulding",
  "Body Trim",
  "Bumper Moulding",
  "Door Moulding",
  "Wheel Arch Moulding",
  // ── Wheels ────────────────────────────────────────────────────────────────
  "LH Front Wheel",
  "RH Front Wheel",
  "LH Rear Wheel",
  "RH Rear Wheel",
  "Tyre",
];

// ─────────────────────────────────────────────────────────────────────────────
// SYNONYM MAP — maps non-SA / abbreviated / misspelled names → canonical SA name
// Keys are lowercase. Values are canonical SA names.
// ─────────────────────────────────────────────────────────────────────────────
export const PARTS_SYNONYM_MAP: Record<string, string> = {
  // Bonnet / Hood (US → SA)
  "bonnet": "Bonnet",
  "hood": "Bonnet",
  "engine hood": "Bonnet",
  "engine bonnet": "Bonnet",
  "bonnet panel": "Bonnet",

  // Boot Lid / Trunk (US → SA)
  "boot": "Boot Lid",
  "boot lid": "Boot Lid",
  "trunk": "Boot Lid",
  "trunk lid": "Boot Lid",
  "tailgate": "Boot Lid",
  "rear hatch": "Boot Lid",
  "hatch": "Boot Lid",
  "liftgate": "Boot Lid",

  // Windscreen (US → SA)
  "windscreen": "Windscreen",
  "windshield": "Windscreen",
  "front glass": "Windscreen",
  "front windscreen": "Windscreen",
  "front windshield": "Windscreen",
  "w/screen": "Windscreen",
  "w/shield": "Windscreen",

  // Rear Windscreen
  "rear windscreen": "Rear Windscreen",
  "rear windshield": "Rear Windscreen",
  "rear glass": "Rear Windscreen",
  "back glass": "Rear Windscreen",
  "r/windscreen": "Rear Windscreen",

  // Headlamps (US → SA)
  "headlight": "LH Headlamp",
  "headlamp": "LH Headlamp",
  "head light": "LH Headlamp",
  "head lamp": "LH Headlamp",
  "lh headlight": "LH Headlamp",
  "rh headlight": "RH Headlamp",
  "lh headlamp": "LH Headlamp",
  "rh headlamp": "RH Headlamp",
  "lh headlamp assembly": "LH Headlamp",
  "rh headlamp assembly": "RH Headlamp",
  "headlamp assembly": "LH Headlamp",

  // Fog Lamps
  "fog lamp": "LH Fog Lamp",
  "fog light": "LH Fog Lamp",
  "lh fog lamp": "LH Fog Lamp",
  "rh fog lamp": "RH Fog Lamp",
  "lh fog light": "LH Fog Lamp",
  "rh fog light": "RH Fog Lamp",

  // Tail Lamps (US → SA)
  "tail light": "LH Tail Lamp",
  "taillight": "LH Tail Lamp",
  "tail lamp": "LH Tail Lamp",
  "rear light": "LH Tail Lamp",
  "lh tail light": "LH Tail Lamp",
  "rh tail light": "RH Tail Lamp",
  "lh tail lamp": "LH Tail Lamp",
  "rh tail lamp": "RH Tail Lamp",
  "lh tail lamp assembly": "LH Tail Lamp",
  "rh tail lamp assembly": "RH Tail Lamp",
  "tail lamp assembly": "LH Tail Lamp",

  // Front Bumper Bar (US → SA)
  "front bumper": "Front Bumper Bar",
  "bumper cover": "Front Bumper Bar",
  "bumper bar": "Front Bumper Bar",
  "bumper fascia": "Front Bumper Bar",
  "f/bar": "Front Bumper Bar",
  "front bar": "Front Bumper Bar",
  "front bumper assembly": "Front Bumper Bar",
  "front bumper bar": "Front Bumper Bar",

  // Rear Bumper Bar
  "rear bumper": "Rear Bumper Bar",
  "b/bar": "Rear Bumper Bar",
  "rear bar": "Rear Bumper Bar",
  "back bumper": "Rear Bumper Bar",
  "rear bumper cover": "Rear Bumper Bar",
  "rear bumper assembly": "Rear Bumper Bar",
  "rear bumper bar": "Rear Bumper Bar",
  "rear bumper fascia": "Rear Bumper Bar",

  // Front Grille
  "grille": "Front Grille",
  "grill": "Front Grille",
  "radiator grille": "Front Grille",
  "front grille": "Front Grille",
  "front grill": "Front Grille",

  // Wings / Fenders (US → SA)
  "fender": "LH Front Wing",
  "wing": "LH Front Wing",
  "front wing": "LH Front Wing",
  "lh fender": "LH Front Wing",
  "rh fender": "RH Front Wing",
  "lh wing": "LH Front Wing",
  "rh wing": "RH Front Wing",
  "lh front fender": "LH Front Wing",
  "rh front fender": "RH Front Wing",
  "lh front wing": "LH Front Wing",
  "rh front wing": "RH Front Wing",

  // Quarter Panels (US "Rear Fender" → SA "Quarter Panel")
  "quarter panel": "LH Quarter Panel",
  "rear fender": "LH Quarter Panel",
  "lh quarter panel": "LH Quarter Panel",
  "rh quarter panel": "RH Quarter Panel",
  "lh rear quarter": "LH Quarter Panel",
  "rh rear quarter": "RH Quarter Panel",
  "lh rear quarter panel": "LH Quarter Panel",
  "rh rear quarter panel": "RH Quarter Panel",

  // Doors
  "lh front door": "LH Front Door",
  "rh front door": "RH Front Door",
  "lh rear door": "LH Rear Door",
  "rh rear door": "RH Rear Door",
  "driver door": "LH Front Door",
  "passenger door": "RH Front Door",
  "lh door": "LH Front Door",
  "rh door": "RH Front Door",
  "front door": "LH Front Door",
  "rear door": "LH Rear Door",

  // Door skins
  "lh front door skin": "LH Front Door Skin",
  "rh front door skin": "RH Front Door Skin",
  "lh rear door skin": "LH Rear Door Skin",
  "rh rear door skin": "RH Rear Door Skin",

  // Mirrors
  "mirror": "LH Door Mirror",
  "wing mirror": "LH Door Mirror",
  "side mirror": "LH Door Mirror",
  "door mirror": "LH Door Mirror",
  "lh mirror": "LH Door Mirror",
  "rh mirror": "RH Door Mirror",
  "lh door mirror": "LH Door Mirror",
  "rh door mirror": "RH Door Mirror",

  // Sills (US "Rocker Panel" → SA "Sill")
  "sill": "LH Sill",
  "sill panel": "LH Sill",
  "rocker panel": "LH Sill",
  "lh sill": "LH Sill",
  "rh sill": "RH Sill",
  "lh sill panel": "LH Sill",
  "rh sill panel": "RH Sill",

  // Pillars
  "a-pillar": "LH A-Pillar",
  "b-pillar": "LH B-Pillar",
  "c-pillar": "LH C-Pillar",
  "lh a-pillar": "LH A-Pillar",
  "rh a-pillar": "RH A-Pillar",
  "lh b-pillar": "LH B-Pillar",
  "rh b-pillar": "RH B-Pillar",
  "lh c-pillar": "LH C-Pillar",
  "rh c-pillar": "RH C-Pillar",

  // Structural
  "chassis": "Chassis/Frame",
  "frame": "Chassis/Frame",
  "chassis/frame": "Chassis/Frame",
  "chassis frame": "Chassis/Frame",
  "subframe": "Front Subframe",
  "front subframe": "Front Subframe",
  "radiator support": "Radiator Support Panel",
  "rad support": "Radiator Support Panel",
  "radiator support panel": "Radiator Support Panel",
  "firewall": "Firewall/Bulkhead",
  "bulkhead": "Firewall/Bulkhead",
  "floor pan": "Floor Pan",

  // Struts / Suspension (US → SA)
  "strut": "LH Front Strut",
  "shock absorber": "LH Front Strut",
  "shock": "LH Front Strut",
  "suspension strut": "LH Front Strut",
  "lh strut": "LH Front Strut",
  "rh strut": "RH Front Strut",
  "lh front strut": "LH Front Strut",
  "rh front strut": "RH Front Strut",
  "lh rear strut": "LH Rear Strut",
  "rh rear strut": "RH Rear Strut",
  "lh suspension strut": "LH Front Strut",
  "rh suspension strut": "RH Front Strut",
  "control arm": "LH Front Control Arm",
  "lower control arm": "LH Front Control Arm",
  "lh control arm": "LH Front Control Arm",
  "rh control arm": "RH Front Control Arm",

  // Safety
  "airbag": "Airbag Module",
  "srs airbag": "Airbag Module",
  "airbag module": "Airbag Module",
  "driver airbag": "Driver Airbag",
  "passenger airbag": "Passenger Airbag",
  "side curtain airbag": "Side Curtain Airbag",

  // Cooling
  "radiator": "Radiator",
  "condenser": "AC Condenser",
  "ac condenser": "AC Condenser",
  "intercooler": "Intercooler",

  // Roof
  "roof": "Roof Panel",
  "roof panel": "Roof Panel",
  "roof lining": "Roof Lining",

  // Drivetrain
  "engine": "Engine",
  "gearbox": "Gearbox",
  "transmission": "Gearbox",
  "differential": "Differential",
  "diff": "Differential",
  "propshaft": "Propshaft",
  "prop shaft": "Propshaft",

  // Body trim
  "moulding": "Body Moulding",
  "trim": "Body Trim",
  "body moulding": "Body Moulding",
  "body trim": "Body Trim",
};

// ─────────────────────────────────────────────────────────────────────────────
// NORMALISER
// Maps any LLM-produced part name to the closest canonical SA name.
// Priority: exact synonym match → side-prefix + synonym → token similarity → original
// ─────────────────────────────────────────────────────────────────────────────

function tokenise(s: string): Set<string> {
  return new Set(
    s.toLowerCase()
      .replace(/[^a-z0-9\s\-\/]/g, " ")
      .split(/\s+/)
      .filter(t => t.length > 1)
  );
}

function tokenSimilarity(a: string, b: string): number {
  const ta = tokenise(a);
  const tb = tokenise(b);
  if (ta.size === 0 && tb.size === 0) return 1;
  if (ta.size === 0 || tb.size === 0) return 0;
  let intersection = 0;
  for (const t of Array.from(ta)) {
    if (tb.has(t)) intersection++;
  }
  return intersection / Math.max(ta.size, tb.size);
}

/**
 * Normalise a single part name to the closest canonical SA name.
 *
 * @param rawName - The raw part name from LLM or quote extraction
 * @returns The canonical SA name, or the original if no match found (confidence < 0.5)
 */
export function normalisePartName(rawName: string): string {
  if (!rawName || rawName.trim().length === 0) return rawName;

  const trimmed = rawName.trim();
  const lower = trimmed.toLowerCase();

  // 1. Exact synonym map match
  if (PARTS_SYNONYM_MAP[lower]) {
    return PARTS_SYNONYM_MAP[lower];
  }

  // 2. Side-prefix + synonym match
  // Handles: "Left Front Wing", "Right B-Pillar", "Driver Door", "Passenger Mirror"
  const sideMatch = lower.match(/^(lh|rh|left|right|driver|passenger)\s+(.+)$/);
  if (sideMatch) {
    const sidePrefix = sideMatch[1];
    const rest = sideMatch[2];
    const normalisedSide =
      sidePrefix === "left" || sidePrefix === "driver" ? "LH" :
      sidePrefix === "right" || sidePrefix === "passenger" ? "RH" :
      sidePrefix.toUpperCase();

    // Try synonym map on the rest
    if (PARTS_SYNONYM_MAP[rest]) {
      const canonicalBase = PARTS_SYNONYM_MAP[rest];
      // If canonical already has LH/RH prefix, replace it with the correct side
      if (/^(LH|RH)\s/.test(canonicalBase)) {
        return `${normalisedSide} ${canonicalBase.replace(/^(LH|RH)\s/, "")}`;
      }
      return `${normalisedSide} ${canonicalBase}`;
    }

    // Try exact canonical match on the rest
    for (const canonical of CANONICAL_PARTS) {
      const canonicalLower = canonical.toLowerCase();
      const canonicalWithoutSide = canonicalLower.replace(/^(lh|rh)\s/, "");
      if (canonicalWithoutSide === rest) {
        if (/^(LH|RH)\s/.test(canonical)) {
          return `${normalisedSide} ${canonical.replace(/^(LH|RH)\s/, "")}`;
        }
        return `${normalisedSide} ${canonical}`;
      }
    }
  }

  // 3. Token similarity against canonical list
  let bestMatch = "";
  let bestScore = 0;
  for (const canonical of CANONICAL_PARTS) {
    const score = tokenSimilarity(trimmed, canonical);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = canonical;
    }
  }

  // Only use similarity match if confidence is high enough (≥0.5)
  if (bestScore >= 0.5 && bestMatch) {
    return bestMatch;
  }

  // 4. Return original trimmed — never silently drop a part name
  return trimmed;
}

/**
 * Normalise an array of part names, deduplicating after normalisation.
 */
export function normalisePartNames(rawNames: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const name of rawNames) {
    const normalised = normalisePartName(name);
    const key = normalised.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(normalised);
    }
  }
  return result;
}

/**
 * The canonical parts list formatted as a compact string for LLM prompts.
 * Used in Stage 6 system prompt to constrain LLM output to SA nomenclature.
 */
export const CANONICAL_PARTS_PROMPT_LIST: string = CANONICAL_PARTS.join(", ");
