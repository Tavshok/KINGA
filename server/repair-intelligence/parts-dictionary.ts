/**
 * SA Parts Dictionary
 *
 * Canonical South African automotive parts naming standard used by the
 * computer vision damage detection pipeline.
 *
 * Provides:
 *   - CANONICAL_PARTS: master list of canonical part names
 *   - PARTS_ALIASES: mapping from free-text variants → canonical name
 *   - normalisePart(): normalise any free-text part name to a canonical name
 */

// ─── Canonical Parts List ─────────────────────────────────────────────────────
// These names match the values produced by the AI damage detection pipeline
// (damagedComponentsJson[].name). Any new part added to the CV pipeline should
// also be added here.

export const CANONICAL_PARTS = [
  // Front end
  "Front Bumper",
  "Front Bumper Cover",
  "Front Bumper Reinforcement",
  "Front Grille",
  "Front Fender Left",
  "Front Fender Right",
  "Hood",
  "Bonnet",
  "Headlight Left",
  "Headlight Right",
  "Fog Light Left",
  "Fog Light Right",
  "Front Apron",
  "Radiator Support",
  "Radiator",
  "Condenser",
  "Front Crossmember",
  // Doors
  "Door Front Left",
  "Door Front Right",
  "Door Rear Left",
  "Door Rear Right",
  "Door Handle Front Left",
  "Door Handle Front Right",
  "Door Handle Rear Left",
  "Door Handle Rear Right",
  "Door Mirror Left",
  "Door Mirror Right",
  // Rear end
  "Rear Bumper",
  "Rear Bumper Cover",
  "Rear Bumper Reinforcement",
  "Boot Lid",
  "Tailgate",
  "Tail Light Left",
  "Tail Light Right",
  "Rear Quarter Panel Left",
  "Rear Quarter Panel Right",
  "Rear Apron",
  "Rear Crossmember",
  // Roof & pillars
  "Roof Panel",
  "A-Pillar Left",
  "A-Pillar Right",
  "B-Pillar Left",
  "B-Pillar Right",
  "C-Pillar Left",
  "C-Pillar Right",
  // Underbody & structural
  "Sill Left",
  "Sill Right",
  "Rocker Panel Left",
  "Rocker Panel Right",
  "Floor Pan",
  "Firewall",
  "Subframe Front",
  "Subframe Rear",
  "Chassis Rail Left",
  "Chassis Rail Right",
  // Glass
  "Windscreen",
  "Rear Window",
  "Door Glass Front Left",
  "Door Glass Front Right",
  "Door Glass Rear Left",
  "Door Glass Rear Right",
  "Sunroof Glass",
  // Wheels & suspension
  "Wheel Front Left",
  "Wheel Front Right",
  "Wheel Rear Left",
  "Wheel Rear Right",
  "Tyre Front Left",
  "Tyre Front Right",
  "Tyre Rear Left",
  "Tyre Rear Right",
  "Suspension Strut Front Left",
  "Suspension Strut Front Right",
  "Control Arm Front Left",
  "Control Arm Front Right",
  // Mechanical
  "Engine",
  "Gearbox",
  "Differential",
  "Exhaust System",
  "Catalytic Converter",
  // Interior
  "Dashboard",
  "Airbag Driver",
  "Airbag Passenger",
  "Seat Front Left",
  "Seat Front Right",
  // Electrical
  "ECU",
  "Battery",
  "Alternator",
  "Starter Motor",
] as const;

export type CanonicalPart = typeof CANONICAL_PARTS[number];

// ─── Alias Map ────────────────────────────────────────────────────────────────
// Keys are lower-cased, stripped of punctuation variants.
// Values are canonical names.

export const PARTS_ALIASES: Record<string, string> = {
  // Front bumper variants
  "front bumper": "Front Bumper",
  "front bumper cover": "Front Bumper Cover",
  "bumper front": "Front Bumper",
  "bumper cover front": "Front Bumper Cover",
  "front facia": "Front Bumper Cover",
  "front fascia": "Front Bumper Cover",
  "front bumper reinforcement": "Front Bumper Reinforcement",
  "bumper reinforcement front": "Front Bumper Reinforcement",
  "front bumper bar": "Front Bumper Reinforcement",
  // Grille
  "grille": "Front Grille",
  "front grille": "Front Grille",
  "radiator grille": "Front Grille",
  "grill": "Front Grille",
  // Fenders
  "front fender lh": "Front Fender Left",
  "front fender rh": "Front Fender Right",
  "front fender left": "Front Fender Left",
  "front fender right": "Front Fender Right",
  "left front fender": "Front Fender Left",
  "right front fender": "Front Fender Right",
  "front wing left": "Front Fender Left",
  "front wing right": "Front Fender Right",
  "wing left": "Front Fender Left",
  "wing right": "Front Fender Right",
  // Hood / bonnet
  "hood": "Hood",
  "bonnet": "Hood",
  "engine hood": "Hood",
  "engine cover": "Hood",
  // Headlights
  "headlight left": "Headlight Left",
  "headlight right": "Headlight Right",
  "headlamp left": "Headlight Left",
  "headlamp right": "Headlight Right",
  "lh headlight": "Headlight Left",
  "rh headlight": "Headlight Right",
  "left headlight": "Headlight Left",
  "right headlight": "Headlight Right",
  "front light left": "Headlight Left",
  "front light right": "Headlight Right",
  // Fog lights
  "fog light left": "Fog Light Left",
  "fog light right": "Fog Light Right",
  "fog lamp left": "Fog Light Left",
  "fog lamp right": "Fog Light Right",
  // Radiator
  "radiator": "Radiator",
  "radiator support": "Radiator Support",
  "front panel": "Radiator Support",
  "lock carrier": "Radiator Support",
  // Condenser
  "condenser": "Condenser",
  "ac condenser": "Condenser",
  "aircon condenser": "Condenser",
  // Doors
  "front door left": "Door Front Left",
  "front door right": "Door Front Right",
  "rear door left": "Door Rear Left",
  "rear door right": "Door Rear Right",
  "door front lh": "Door Front Left",
  "door front rh": "Door Front Right",
  "door rear lh": "Door Rear Left",
  "door rear rh": "Door Rear Right",
  "lh front door": "Door Front Left",
  "rh front door": "Door Front Right",
  "lh rear door": "Door Rear Left",
  "rh rear door": "Door Rear Right",
  // Mirrors
  "door mirror left": "Door Mirror Left",
  "door mirror right": "Door Mirror Right",
  "side mirror left": "Door Mirror Left",
  "side mirror right": "Door Mirror Right",
  "wing mirror left": "Door Mirror Left",
  "wing mirror right": "Door Mirror Right",
  "lh mirror": "Door Mirror Left",
  "rh mirror": "Door Mirror Right",
  // Rear bumper
  "rear bumper": "Rear Bumper",
  "rear bumper cover": "Rear Bumper Cover",
  "bumper rear": "Rear Bumper",
  "rear facia": "Rear Bumper Cover",
  "rear fascia": "Rear Bumper Cover",
  "rear bumper reinforcement": "Rear Bumper Reinforcement",
  // Boot / tailgate
  "boot lid": "Boot Lid",
  "boot": "Boot Lid",
  "trunk lid": "Boot Lid",
  "tailgate": "Tailgate",
  "rear hatch": "Tailgate",
  "rear gate": "Tailgate",
  // Tail lights
  "tail light left": "Tail Light Left",
  "tail light right": "Tail Light Right",
  "tail lamp left": "Tail Light Left",
  "tail lamp right": "Tail Light Right",
  "rear light left": "Tail Light Left",
  "rear light right": "Tail Light Right",
  "lh tail light": "Tail Light Left",
  "rh tail light": "Tail Light Right",
  // Quarter panels
  "rear quarter panel left": "Rear Quarter Panel Left",
  "rear quarter panel right": "Rear Quarter Panel Right",
  "quarter panel left": "Rear Quarter Panel Left",
  "quarter panel right": "Rear Quarter Panel Right",
  "rear fender left": "Rear Quarter Panel Left",
  "rear fender right": "Rear Quarter Panel Right",
  "rear wing left": "Rear Quarter Panel Left",
  "rear wing right": "Rear Quarter Panel Right",
  // Roof
  "roof": "Roof Panel",
  "roof panel": "Roof Panel",
  "roof skin": "Roof Panel",
  // Sills / rockers
  "sill left": "Sill Left",
  "sill right": "Sill Right",
  "rocker panel left": "Rocker Panel Left",
  "rocker panel right": "Rocker Panel Right",
  "side sill left": "Sill Left",
  "side sill right": "Sill Right",
  // Glass
  "windscreen": "Windscreen",
  "windshield": "Windscreen",
  "front windscreen": "Windscreen",
  "front glass": "Windscreen",
  "rear window": "Rear Window",
  "rear windscreen": "Rear Window",
  "rear glass": "Rear Window",
  "back glass": "Rear Window",
  // Wheels
  "wheel front left": "Wheel Front Left",
  "wheel front right": "Wheel Front Right",
  "wheel rear left": "Wheel Rear Left",
  "wheel rear right": "Wheel Rear Right",
  "rim front left": "Wheel Front Left",
  "rim front right": "Wheel Front Right",
  // Tyres
  "tyre front left": "Tyre Front Left",
  "tyre front right": "Tyre Front Right",
  "tyre rear left": "Tyre Rear Left",
  "tyre rear right": "Tyre Rear Right",
  "tire front left": "Tyre Front Left",
  "tire front right": "Tyre Front Right",
  // Suspension
  "strut front left": "Suspension Strut Front Left",
  "strut front right": "Suspension Strut Front Right",
  "shock absorber front left": "Suspension Strut Front Left",
  "shock absorber front right": "Suspension Strut Front Right",
  "control arm front left": "Control Arm Front Left",
  "control arm front right": "Control Arm Front Right",
  // Mechanical
  "engine": "Engine",
  "motor": "Engine",
  "gearbox": "Gearbox",
  "transmission": "Gearbox",
  "diff": "Differential",
  "differential": "Differential",
  "exhaust": "Exhaust System",
  "exhaust system": "Exhaust System",
  "cat": "Catalytic Converter",
  "catalytic converter": "Catalytic Converter",
  // Interior
  "dashboard": "Dashboard",
  "dash": "Dashboard",
  "instrument panel": "Dashboard",
  "airbag driver": "Airbag Driver",
  "driver airbag": "Airbag Driver",
  "airbag passenger": "Airbag Passenger",
  "passenger airbag": "Airbag Passenger",
  // Electrical
  "ecu": "ECU",
  "engine control unit": "ECU",
  "battery": "Battery",
  "alternator": "Alternator",
  "starter motor": "Starter Motor",
  "starter": "Starter Motor",
};

// ─── Normalisation Function ───────────────────────────────────────────────────

/**
 * Normalise a free-text part name to its canonical SA standard name.
 *
 * Steps:
 *   1. Lower-case and strip leading/trailing whitespace
 *   2. Remove common noise words (assembly, assy, panel, unit, complete, new)
 *   3. Look up in PARTS_ALIASES
 *   4. If not found, return the original (title-cased) as-is
 *
 * @param rawName - Free-text part name from a quote or AI detection output
 * @returns Canonical part name, or the cleaned original if no mapping exists
 */
export function normalisePart(rawName: string): string {
  const cleaned = rawName
    .toLowerCase()
    .trim()
    // Remove common noise suffixes/prefixes that don't change identity
    .replace(/\b(assembly|assy|complete|new|genuine|oem|aftermarket|used)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (PARTS_ALIASES[cleaned]) {
    return PARTS_ALIASES[cleaned];
  }

  // Partial match: check if any alias key is contained in the cleaned name
  for (const [alias, canonical] of Object.entries(PARTS_ALIASES)) {
    if (cleaned.includes(alias) || alias.includes(cleaned)) {
      return canonical;
    }
  }

  // Return title-cased original as fallback
  return rawName
    .trim()
    .replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase());
}

/**
 * Check whether a normalised part name is in the canonical list.
 */
export function isCanonicalPart(name: string): boolean {
  return (CANONICAL_PARTS as readonly string[]).includes(name);
}
