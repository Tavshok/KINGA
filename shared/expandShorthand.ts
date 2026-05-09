/**
 * KINGA Professional Text Expansion Utility
 *
 * Expands automotive part abbreviations, shorthand codes, and informal
 * descriptions into full professional text suitable for insurance reports
 * and quotation documents.
 *
 * Sources:
 *  1. Reverse-lookup from vehicleParts.ts aliases → canonical name
 *  2. Hardcoded automotive shorthand dictionary (R/H, L/H, F/W, etc.)
 *  3. Labour / operation code expansion
 *  4. Title-case normalisation
 */

import { VEHICLE_PARTS } from "./vehicleParts";

// ─── Build alias → canonical map from vehicleParts taxonomy ──────────────────
const ALIAS_MAP = new Map<string, string>();

function registerPart(canonical: string, aliases: string[]) {
  const key = canonical.trim().toLowerCase();
  ALIAS_MAP.set(key, canonical);
  for (const alias of aliases) {
    ALIAS_MAP.set(alias.trim().toLowerCase(), canonical);
  }
}

// Walk the full taxonomy once at module load
for (const part of VEHICLE_PARTS) {
  registerPart(part.name, part.aliases);
  for (const sub of part.subParts) {
    registerPart(sub.name, sub.aliases);
  }
}

// ─── Hardcoded shorthand dictionary ──────────────────────────────────────────
// Covers abbreviations that appear in South African panel beater quotes.
const SHORTHAND_DICT: Record<string, string> = {
  // Side/position codes
  "r/h":   "Right-Hand",
  "l/h":   "Left-Hand",
  "rh":    "Right-Hand",
  "lh":    "Left-Hand",
  "r/h panel":  "Right-Hand Panel",
  "l/h panel":  "Left-Hand Panel",
  "r/h door":   "Right-Hand Door",
  "l/h door":   "Left-Hand Door",
  "r/h fender": "Right-Hand Fender",
  "l/h fender": "Left-Hand Fender",
  "r/h wing":   "Right-Hand Front Fender",
  "l/h wing":   "Left-Hand Front Fender",
  "r/h quarter panel": "Right-Hand Quarter Panel",
  "l/h quarter panel": "Left-Hand Quarter Panel",
  "r/h rear door":  "Right-Hand Rear Door",
  "l/h rear door":  "Left-Hand Rear Door",
  "r/h front door": "Right-Hand Front Door",
  "l/h front door": "Left-Hand Front Door",
  "r/h b-pillar":   "Right-Hand B-Pillar",
  "l/h b-pillar":   "Left-Hand B-Pillar",
  "r/h a-pillar":   "Right-Hand A-Pillar",
  "l/h a-pillar":   "Left-Hand A-Pillar",
  "r/h c-pillar":   "Right-Hand C-Pillar",
  "l/h c-pillar":   "Left-Hand C-Pillar",
  "r/h sill":       "Right-Hand Sill Panel",
  "l/h sill":       "Left-Hand Sill Panel",
  "r/h rocker":     "Right-Hand Rocker Panel",
  "l/h rocker":     "Left-Hand Rocker Panel",
  "r/h headlamp":   "Right-Hand Headlight Assembly",
  "l/h headlamp":   "Left-Hand Headlight Assembly",
  "r/h tail lamp":  "Right-Hand Tail Light Assembly",
  "l/h tail lamp":  "Left-Hand Tail Light Assembly",
  "r/h tail light": "Right-Hand Tail Light Assembly",
  "l/h tail light": "Left-Hand Tail Light Assembly",
  "r/h mirror":     "Right-Hand Door Mirror Assembly",
  "l/h mirror":     "Left-Hand Door Mirror Assembly",
  "r/h strut":      "Right-Hand Front Strut Assembly",
  "l/h strut":      "Left-Hand Front Strut Assembly",

  // Common panel/body abbreviations
  "f/w":     "Front Windscreen",
  "r/w":     "Rear Windscreen",
  "f/b":     "Front Bumper Assembly",
  "r/b":     "Rear Bumper Assembly",
  "f/bumper": "Front Bumper Assembly",
  "r/bumper": "Rear Bumper Assembly",
  "bonnet":  "Bonnet (Hood)",
  "boot lid": "Boot Lid (Trunk Lid)",
  "boot":    "Boot Lid (Trunk Lid)",
  "slam panel": "Radiator Support Panel",
  "rad support": "Radiator Support Panel",
  "rad":     "Radiator Assembly",
  "a/c":     "Air Conditioning",
  "a/c condenser": "Air Conditioning Condenser",
  "aircon":  "Air Conditioning",
  "aircon condenser": "Air Conditioning Condenser",

  // Labour / operation codes
  "r&r":     "Remove and Refit",
  "r & r":   "Remove and Refit",
  "r&i":     "Remove and Install",
  "r & i":   "Remove and Install",
  "r/r":     "Remove and Refit",
  "r/i":     "Remove and Install",
  "strip & fit": "Strip and Refit",
  "s&f":     "Strip and Refit",
  "s & f":   "Strip and Refit",
  "p&p":     "Paint and Polish",
  "p & p":   "Paint and Polish",
  "prep":    "Surface Preparation",
  "prep & paint": "Surface Preparation and Paint",
  "blend":   "Blend Paint (Adjacent Panel)",
  "blending": "Blend Paint (Adjacent Panel)",
  "dent repair": "Paintless Dent Repair",
  "pdr":     "Paintless Dent Repair",
  "spot weld": "Spot Weld Repair",
  "mig weld": "MIG Weld Repair",
  "straighten": "Panel Straightening",
  "str":     "Panel Straightening",
  "align":   "Panel Alignment",
  "realign": "Panel Re-alignment",
  "refinish": "Panel Refinishing",
  "respray": "Full Panel Respray",
  "clear coat": "Clear Coat Application",
  "cc":      "Clear Coat Application",
  "primer":  "Primer Application",
  "sealer":  "Seam Sealer Application",

  // Mechanical abbreviations
  "abs":     "Anti-lock Braking System",
  "airbag":  "Airbag Assembly",
  "srs":     "Supplemental Restraint System (Airbag)",
  "ecu":     "Engine Control Unit",
  "bcm":     "Body Control Module",
  "adas":    "Advanced Driver Assistance Systems",
  "acc":     "Adaptive Cruise Control",
  "ldw":     "Lane Departure Warning System",
  "fcw":     "Forward Collision Warning System",
  "bsd":     "Blind Spot Detection System",
  "oem":     "Original Equipment Manufacturer Part",
  "oe":      "Original Equipment Part",
  "am":      "Aftermarket Part",
  "recon":   "Reconditioned Part",
  "s/h":     "Second-Hand Part",
  "used":    "Used / Second-Hand Part",

  // Tyre / wheel
  "tyre":    "Tyre",
  "rim":     "Alloy Wheel Rim",
  "alloy":   "Alloy Wheel",
  "hub cap": "Wheel Hub Cap",
  "wheel nut": "Wheel Nut",
  "lug nut": "Wheel Lug Nut",

  // Glass
  "w/screen": "Windscreen",
  "w/shield": "Windshield",
  "d/glass":  "Door Glass",
  "q/glass":  "Quarter Glass",
  "s/glass":  "Side Window Glass",

  // Misc
  "misc":    "Miscellaneous",
  "misc parts": "Miscellaneous Parts",
  "consumables": "Consumable Materials",
  "sundries": "Sundry Materials",
  "labour":  "Labour",
  "labor":   "Labour",
  "hrs":     "Hours",
  "hr":      "Hour",
  "incl":    "Including",
  "excl":    "Excluding",
  "vat":     "VAT",
  "gst":     "GST",
  "tax":     "Tax",
  "sub-total": "Sub-Total",
  "subtotal": "Sub-Total",
  "total":   "Total",
  // South African / Zimbabwe regional terms
  "r/h rear q/panel": "Right-Hand Rear Quarter Panel",
  "l/h rear q/panel": "Left-Hand Rear Quarter Panel",
  "r/h front q/panel": "Right-Hand Front Quarter Panel",
  "l/h front q/panel": "Left-Hand Front Quarter Panel",
  "bakkie":  "Light Delivery Vehicle (Bakkie)",
  "canopy":  "Canopy / Load Bin Cover",
  "load bin": "Load Bin (Bakkie Tray)",
  "tow bar": "Tow Bar Assembly",
  "towbar":  "Tow Bar Assembly",
  "nudge bar": "Nudge Bar / Bull Bar",
  "bull bar": "Bull Bar Assembly",
  "side step": "Running Board / Side Step",
  "running board": "Running Board",
  "diff":    "Differential Assembly",
  "gearbox": "Gearbox Assembly",
  "g/box":   "Gearbox Assembly",
  "prop shaft": "Propeller Shaft",
  "prop":    "Propeller Shaft",
  "cv joint": "Constant Velocity Joint",
  "cv":      "Constant Velocity Joint",
  "tie rod":  "Tie Rod End",
  "track rod": "Track Rod End",
  "ball joint": "Ball Joint",
  "control arm": "Control Arm Assembly",
  "wishbone": "Wishbone (Control Arm)",
  "shock":   "Shock Absorber",
  "shock absorber": "Shock Absorber Assembly",
  "coil spring": "Coil Spring",
  "leaf spring": "Leaf Spring Assembly",
  "caliper": "Brake Caliper Assembly",
  "disc":    "Brake Disc (Rotor)",
  "rotor":   "Brake Disc (Rotor)",
  "brake pad": "Brake Pad Set",
  "brake shoe": "Brake Shoe Set",
  "handbrake cable": "Handbrake Cable",
  "e-brake": "Electronic Parking Brake",
  "cat":     "Catalytic Converter",
  "cat converter": "Catalytic Converter",
  "dpf":     "Diesel Particulate Filter",
  "egr":     "Exhaust Gas Recirculation Valve",
  "turbo":   "Turbocharger Assembly",
  "intercooler": "Intercooler Assembly",
  "coolant":  "Coolant / Antifreeze",
  "radiator hose": "Radiator Hose",
  "heater core": "Heater Core",
  "water pump": "Water Pump Assembly",
  "thermostat": "Thermostat Assembly",
  "alternator": "Alternator Assembly",
  "starter motor": "Starter Motor Assembly",
  "battery":  "Battery",
  "wiring harness": "Wiring Harness",
  "loom":    "Wiring Loom / Harness",
  "fuse box": "Fuse Box / Junction Box",
  "relay":   "Relay",
  // Insurer-specific codes
  "excess":  "Policy Excess (Deductible)",
  "ded":     "Deductible (Excess)",
  "deduct":  "Deductible (Excess)",
  "p/a":     "Personal Accident Cover",
  "tpd":     "Third-Party Damage",
  "tp":      "Third Party",
  "comp":    "Comprehensive Cover",
  "tpft":    "Third-Party, Fire and Theft Cover",
  "salvage":  "Salvage Value",
  "write-off": "Total Write-Off (Total Loss)",
  "w/off":   "Total Write-Off (Total Loss)",
  "total loss": "Total Loss Declaration",
  "agreed value": "Agreed Value (Insured Value)",
  "market value": "Market Value",
  "retail value": "Retail Market Value",
  "trade value": "Trade Market Value",
  "nag":     "National Automobile Gazette (NAG) Value",
  "nada":    "NADA Market Value",
  "cpi":     "Consumer Price Index Adjustment",
  "betterment": "Betterment Deduction (Improvement Contribution)",
};

// ─── Title-case helper ────────────────────────────────────────────────────────
const LOWERCASE_WORDS = new Set([
  "a", "an", "the", "and", "but", "or", "for", "nor", "on", "at",
  "to", "by", "in", "of", "up", "as", "is", "it",
]);

function toTitleCase(str: string): string {
  return str
    .split(" ")
    .map((word, i) => {
      if (i === 0) return word.charAt(0).toUpperCase() + word.slice(1);
      if (LOWERCASE_WORDS.has(word.toLowerCase())) return word.toLowerCase();
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

// ─── Main export ─────────────────────────────────────────────────────────────
/**
 * Expands a part name or quote line item description from shorthand to
 * full professional text.
 *
 * Algorithm:
 *  1. Exact match in SHORTHAND_DICT (case-insensitive)
 *  2. Exact match in vehicleParts alias map
 *  3. Token-by-token expansion of shorthand tokens within the string
 *  4. Title-case normalisation of the result
 *
 * @param input - Raw description string (e.g. "R/H panel", "r&r bonnet")
 * @returns Expanded professional description (e.g. "Right-Hand Panel", "Remove and Refit Bonnet (Hood)")
 */
export function expandShorthand(input: string): string {
  if (!input || typeof input !== "string") return input;

  const trimmed = input.trim();
  const lower = trimmed.toLowerCase();

  // 1. Exact match in shorthand dict
  if (SHORTHAND_DICT[lower]) return SHORTHAND_DICT[lower];

  // 2. Exact match in alias map
  if (ALIAS_MAP.has(lower)) return ALIAS_MAP.get(lower)!;

  // 3. Token-by-token expansion
  // Split on spaces, slashes, and hyphens while preserving structure
  const tokens = trimmed.split(/\s+/);
  const expanded = tokens.map((token) => {
    const t = token.toLowerCase().replace(/[.,;:!?]$/, ""); // strip trailing punctuation
    if (SHORTHAND_DICT[t]) return SHORTHAND_DICT[t];
    if (ALIAS_MAP.has(t)) return ALIAS_MAP.get(t)!;
    return token; // keep original if no match
  });

  // Re-join and attempt a second pass on the full expanded string
  const rejoined = expanded.join(" ");
  const rejoinedLower = rejoined.toLowerCase();
  if (SHORTHAND_DICT[rejoinedLower]) return SHORTHAND_DICT[rejoinedLower];
  if (ALIAS_MAP.has(rejoinedLower)) return ALIAS_MAP.get(rejoinedLower)!;

  // 4. Title-case the result
  return toTitleCase(rejoined);
}

/**
 * Expands all descriptions in a quote line items array.
 * Returns a new array with expanded descriptions; all other fields unchanged.
 */
export function expandLineItems<T extends { description?: string }>(items: T[]): T[] {
  return items.map((item) => ({
    ...item,
    description: item.description ? expandShorthand(item.description) : item.description,
  }));
}
