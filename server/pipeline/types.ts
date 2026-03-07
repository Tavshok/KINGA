/**
 * pipeline/types.ts
 *
 * Single source of truth for the KINGA AI analysis pipeline.
 *
 * Architecture rules:
 *   1. Every stage imports ONLY from this file and its own direct dependencies.
 *   2. No stage imports from another stage.
 *   3. All thresholds, constants, and shared interfaces live here.
 *   4. PipelineContext is built once by the runner and passed to every stage.
 *   5. StageResult<T> is the universal return type for every stage.
 */

import type { VehicleComponentSet } from "../vehicle-components";

// ─────────────────────────────────────────────────────────────────────────────
// CANONICAL TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type CanonicalIncidentType =
  | "collision"
  | "theft"
  | "vandalism"
  | "flood"
  | "fire"
  | "unknown";

export type PowertrainType = "ice" | "bev" | "phev" | "hev";

export type VehicleBodyType =
  | "sedan"
  | "hatchback"
  | "suv"
  | "pickup"
  | "van"
  | "truck"
  | "sports"
  | "compact";

export type AccidentSeverity =
  | "none"
  | "cosmetic"
  | "minor"
  | "moderate"
  | "severe"
  | "catastrophic";

export type CollisionDirection =
  | "frontal"
  | "rear"
  | "side_driver"
  | "side_passenger"
  | "rollover"
  | "multi_impact"
  | "unknown";

export type HiddenDamageChain =
  | "front"
  | "rear"
  | "side_driver"
  | "side_passenger"
  | "rollover"
  | "general";

export type ConfidenceLabel = "High" | "Medium" | "Low";

// ─────────────────────────────────────────────────────────────────────────────
// PHYSICS FORCE THRESHOLDS (kN)
// Source: IIHS/NHTSA structural deformation onset data
// ─────────────────────────────────────────────────────────────────────────────

export const FORCE_THRESHOLDS = {
  /** Bumper beam deformation onset — parking bump / low-speed */
  BUMPER_BEAM: 8,
  /** Radiator support deformation onset — urban collision */
  RADIATOR_SUPPORT: 15,
  /** Engine mount stress threshold — moderate collision */
  ENGINE_MOUNTS: 25,
  /** Steering rack displacement threshold */
  STEERING_RACK: 35,
  /** Frame rail deformation onset */
  FRAME_RAIL: 45,
  /** Transmission mount failure threshold */
  TRANSMISSION: 60,
  /** Catastrophic structural collapse */
  CATASTROPHIC: 75,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// VEHICLE MASS TABLE
// Used by Stage 2 (classification) to resolve vehicle mass for physics engine.
// Keyed by "make model" lowercase. Fallback tiers: exact → model-only →
// make-only → keyword scan → class heuristic → year adjustment.
// ─────────────────────────────────────────────────────────────────────────────

export const VEHICLE_MASS_TABLE: Record<string, number> = {
  // ── Honda ──
  "honda fit": 1050, "honda jazz": 1050, "honda city": 1150, "honda civic": 1250,
  "honda accord": 1500, "honda cr-v": 1550, "honda hr-v": 1300, "honda pilot": 2000,
  "honda passport": 1900, "honda ridgeline": 2000, "honda odyssey": 1900,
  "honda element": 1550, "honda insight": 1250, "honda freed": 1200,
  // ── Toyota ──
  "toyota vitz": 980, "toyota yaris": 1050, "toyota corolla": 1300,
  "toyota corolla cross": 1450, "toyota camry": 1600, "toyota avalon": 1700,
  "toyota rav4": 1700, "toyota c-hr": 1400, "toyota rush": 1500,
  "toyota hilux": 1900, "toyota fortuner": 2100, "toyota land cruiser": 2500,
  "toyota land cruiser prado": 2200, "toyota prado": 2200, "toyota 4runner": 2100,
  "toyota tundra": 2300, "toyota tacoma": 1800, "toyota sienna": 2100,
  "toyota hiace": 1900, "toyota quantum": 1900, "toyota probox": 1100,
  "toyota starlet": 900, "toyota etios": 1050, "toyota agya": 900,
  // ── Nissan ──
  "nissan np200": 900, "nissan np300": 1700, "nissan navara": 1900,
  "nissan x-trail": 1600, "nissan qashqai": 1450, "nissan juke": 1250,
  "nissan micra": 950, "nissan note": 1100, "nissan tiida": 1200,
  "nissan almera": 1200, "nissan sentra": 1300, "nissan altima": 1600,
  "nissan patrol": 2600, "nissan murano": 1900, "nissan pathfinder": 2100,
  "nissan leaf": 1600, "nissan ariya": 2100, "nissan kicks": 1350,
  "nissan hardbody": 1400, "nissan frontier": 1900, "nissan ad": 1050,
  "nissan ad wagon": 1050, "nissan latio": 1150,
  // ── Isuzu ──
  "isuzu d-max": 1900, "isuzu d-teq": 1900, "isuzu kb": 1900,
  "isuzu mu-x": 2100, "isuzu trooper": 2000, "isuzu rodeo": 1800,
  // ── Mazda ──
  "mazda 2": 1050, "mazda 3": 1300, "mazda 6": 1500, "mazda cx-3": 1250,
  "mazda cx-5": 1600, "mazda cx-7": 1700, "mazda cx-9": 2000,
  "mazda bt-50": 1900, "mazda mx-5": 1100,
  // ── Ford ──
  "ford ka": 1000, "ford fiesta": 1050, "ford focus": 1300, "ford fusion": 1600,
  "ford mustang": 1800, "ford mondeo": 1600, "ford edge": 1900,
  "ford escape": 1600, "ford explorer": 2100, "ford expedition": 2600,
  "ford ranger": 1950, "ford f-150": 2300, "ford f-250": 2900,
  "ford everest": 2200, "ford transit": 2000, "ford tourneo": 1900,
  "ford ecosport": 1300,
  // ── Volkswagen ──
  "volkswagen polo": 1100, "volkswagen polo vivo": 1050, "volkswagen up": 950,
  "volkswagen golf": 1300, "volkswagen jetta": 1400, "volkswagen passat": 1600,
  "volkswagen tiguan": 1600, "volkswagen touareg": 2100, "volkswagen t-cross": 1250,
  "volkswagen t-roc": 1400, "volkswagen amarok": 2100, "volkswagen caddy": 1400,
  "volkswagen transporter": 1900, "volkswagen touran": 1600,
  // ── Mitsubishi ──
  "mitsubishi mirage": 950, "mitsubishi lancer": 1200, "mitsubishi galant": 1500,
  "mitsubishi colt": 1100, "mitsubishi triton": 1900, "mitsubishi l200": 1900,
  "mitsubishi outlander": 1700, "mitsubishi eclipse cross": 1600,
  "mitsubishi pajero": 2200, "mitsubishi pajero sport": 2000,
  "mitsubishi asx": 1400, "mitsubishi rvr": 1400,
  // ── Suzuki ──
  "suzuki alto": 750, "suzuki celerio": 850, "suzuki swift": 900,
  "suzuki baleno": 1000, "suzuki ciaz": 1100, "suzuki vitara": 1100,
  "suzuki grand vitara": 1500, "suzuki jimny": 1100, "suzuki s-cross": 1300,
  "suzuki ertiga": 1200, "suzuki xl7": 1400,
  // ── Hyundai ──
  "hyundai i10": 900, "hyundai grand i10": 950, "hyundai i20": 1050,
  "hyundai i30": 1300, "hyundai elantra": 1350, "hyundai sonata": 1600,
  "hyundai accent": 1100, "hyundai verna": 1100, "hyundai atos": 850,
  "hyundai tucson": 1600, "hyundai santa fe": 1900, "hyundai creta": 1350,
  "hyundai venue": 1200, "hyundai kona": 1350, "hyundai ioniq": 1500,
  "hyundai ioniq 5": 2100, "hyundai h100": 1500, "hyundai h1": 2000,
  "hyundai staria": 2100,
  // ── Kia ──
  "kia picanto": 900, "kia morning": 900, "kia rio": 1050,
  "kia cerato": 1350, "kia optima": 1600, "kia stinger": 1800,
  "kia sportage": 1600, "kia sorento": 1900, "kia telluride": 2100,
  "kia seltos": 1400, "kia stonic": 1250, "kia carnival": 2100,
  "kia soul": 1350, "kia niro": 1500, "kia ev6": 2000,
  // ── BMW ──
  "bmw 1 series": 1400, "bmw 2 series": 1500, "bmw 3 series": 1500,
  "bmw 4 series": 1600, "bmw 5 series": 1700, "bmw 6 series": 1800,
  "bmw 7 series": 2000, "bmw 8 series": 1900, "bmw x1": 1500,
  "bmw x2": 1550, "bmw x3": 1700, "bmw x4": 1800, "bmw x5": 2100,
  "bmw x6": 2100, "bmw x7": 2400, "bmw z4": 1400, "bmw m3": 1600,
  "bmw m5": 1900, "bmw i3": 1200, "bmw i4": 2100, "bmw ix": 2500,
  // ── Mercedes-Benz ──
  "mercedes a-class": 1400, "mercedes b-class": 1500, "mercedes c-class": 1500,
  "mercedes e-class": 1700, "mercedes s-class": 2100, "mercedes cla": 1500,
  "mercedes cls": 1800, "mercedes gla": 1500, "mercedes glb": 1700,
  "mercedes glc": 1800, "mercedes gle": 2100, "mercedes gls": 2500,
  "mercedes g-class": 2500, "mercedes vito": 1900, "mercedes sprinter": 2200,
  "mercedes amg gt": 1700,
  // ── Audi ──
  "audi a1": 1200, "audi a3": 1400, "audi a4": 1600, "audi a5": 1700,
  "audi a6": 1800, "audi a7": 1900, "audi a8": 2100, "audi q2": 1300,
  "audi q3": 1500, "audi q5": 1800, "audi q7": 2200, "audi q8": 2300,
  "audi tt": 1400, "audi r8": 1600, "audi e-tron": 2500,
  // ── Chevrolet / Opel ──
  "chevrolet spark": 900, "chevrolet aveo": 1100, "chevrolet cruze": 1400,
  "chevrolet malibu": 1600, "chevrolet impala": 1800, "chevrolet equinox": 1700,
  "chevrolet trailblazer": 2000, "chevrolet silverado": 2300, "chevrolet tahoe": 2600,
  "chevrolet suburban": 2800, "chevrolet traverse": 2100, "chevrolet colorado": 1900,
  "opel corsa": 1100, "opel astra": 1300, "opel insignia": 1600,
  "opel mokka": 1400, "opel crossland": 1300, "opel grandland": 1600,
  // ── Renault ──
  "renault kwid": 800, "renault sandero": 1050, "renault logan": 1100,
  "renault clio": 1100, "renault megane": 1300, "renault fluence": 1400,
  "renault duster": 1300, "renault captur": 1300, "renault koleos": 1700,
  "renault scenic": 1500, "renault trafic": 1900,
  // ── Peugeot ──
  "peugeot 107": 850, "peugeot 208": 1100, "peugeot 308": 1300,
  "peugeot 408": 1500, "peugeot 508": 1600, "peugeot 2008": 1300,
  "peugeot 3008": 1500, "peugeot 5008": 1700, "peugeot boxer": 2000,
  // ── Citroën ──
  "citroen c1": 850, "citroen c3": 1100, "citroen c4": 1300,
  "citroen c5": 1600, "citroen berlingo": 1400,
  // ── Fiat ──
  "fiat 500": 900, "fiat punto": 1100, "fiat tipo": 1300,
  "fiat bravo": 1300, "fiat doblo": 1500, "fiat ducato": 2100,
  // ── Volvo ──
  "volvo s60": 1700, "volvo s90": 2000, "volvo v40": 1500,
  "volvo v60": 1700, "volvo v90": 2000, "volvo xc40": 1700,
  "volvo xc60": 1900, "volvo xc90": 2300,
  // ── Land Rover / Range Rover ──
  "land rover defender": 2200, "land rover discovery": 2300,
  "land rover discovery sport": 1900, "land rover freelander": 1700,
  "range rover": 2500, "range rover sport": 2300, "range rover evoque": 1800,
  "range rover velar": 2000,
  // ── Jeep ──
  "jeep renegade": 1400, "jeep compass": 1600, "jeep cherokee": 1900,
  "jeep grand cherokee": 2200, "jeep wrangler": 2000, "jeep gladiator": 2200,
  // ── Tesla ──
  "tesla model 3": 1850, "tesla model s": 2250, "tesla model x": 2500,
  "tesla model y": 2000, "tesla cybertruck": 3000,
  // ── Chinese brands ──
  "chery tiggo": 1500, "chery arrizo": 1300, "chery qq": 900,
  "haval h1": 1100, "haval h2": 1300, "haval h6": 1600, "haval jolion": 1450,
  "great wall wingle": 1800, "great wall steed": 1800,
  "byd atto 3": 1750, "byd seal": 2000, "byd han": 2200,
  "mg zs": 1350, "mg hs": 1600, "mg 5": 1300, "mg 6": 1500,
  "geely emgrand": 1300, "geely coolray": 1400,
  "dfsk glory": 1300, "dfsk 580": 1600,
  // ── Commercial / Minibus ──
  "nissan urvan": 1900, "ford transit connect": 1500, "volkswagen crafter": 2100,
  "iveco daily": 2200, "man tge": 2100,
};

/**
 * Resolve vehicle mass (kg) using multi-tier fallback:
 * Tier 1: exact "make model" key
 * Tier 2: model-only or make-only key
 * Tier 3: partial keyword scan
 * Tier 4: vehicle class heuristic
 * Tier 5: year-based adjustment (+50 kg for post-2019 safety features)
 */
export function resolveVehicleMass(
  make: string,
  model: string,
  year: number | null
): { massKg: number; tier: "explicit" | "inferred_model" | "inferred_class" | "not_available" } {
  const m = make.toLowerCase().trim();
  const mo = model.toLowerCase().trim();
  const key = `${m} ${mo}`;

  function findByKeyword(keyword: string): number | undefined {
    if (!keyword || keyword === "unknown") return undefined;
    const direct = Object.entries(VEHICLE_MASS_TABLE).find(([k]) => k.includes(keyword));
    if (direct) return direct[1];
    const words = keyword.split(/\s+/).filter((w) => w.length >= 4);
    for (const word of words) {
      const entry = Object.entries(VEHICLE_MASS_TABLE).find(([k]) => k.includes(word));
      if (entry) return entry[1];
    }
    return undefined;
  }

  function classMass(make: string, model: string): number {
    const combined = `${make} ${model}`;
    if (/hilux|ranger|navara|d-max|d-teq|triton|l200|bt-50|np300|amarok|frontier|tacoma|tundra|f-150|f-250|wingle|steed|np200|hardbody/.test(combined)) return 1900;
    if (/land cruiser|prado|fortuner|patrol|pajero|defender|discovery|grand cherokee|wrangler|expedition|suburban|tahoe|4runner|trooper/.test(combined)) return 2300;
    if (/cr-v|rav4|tucson|santa fe|sorento|cx-5|tiguan|x-trail|qashqai|outlander|mu-x|everest|explorer|edge|koleos|duster|haval h6|jolion|mg hs/.test(combined)) return 1700;
    if (/hr-v|vitara|jimny|juke|kona|venue|seltos|stonic|creta|ecosport|captur|2008|t-cross|t-roc|gla|glb|q3|x1|x2|asx|rvr|mg zs|haval h2/.test(combined)) return 1400;
    if (/hiace|quantum|h1|staria|urvan|sprinter|transit|transporter|trafic|berlingo|caddy|vito|crafter|daily/.test(combined)) return 2000;
    if (/polo|vivo|swift|celerio|alto|kwid|sandero|picanto|morning|i10|i20|atos|vitz|yaris|starlet|etios|agya|fiesta|ka|up|clio|208|punto|500|micra|note|spark|aveo|baleno|city/.test(combined)) return 1050;
    return 1300;
  }

  function yearAdjust(base: number, yr: number | null): number {
    if (!yr) return base;
    if (yr < 1990) return Math.max(base - 100, 700);
    if (yr >= 2020) return base + 50;
    return base;
  }

  const raw =
    VEHICLE_MASS_TABLE[key] ||
    VEHICLE_MASS_TABLE[mo] ||
    VEHICLE_MASS_TABLE[m] ||
    findByKeyword(mo) ||
    findByKeyword(m);

  if (raw) {
    return { massKg: yearAdjust(raw, year), tier: "inferred_model" };
  }
  const cls = classMass(m, mo);
  return { massKg: yearAdjust(cls, year), tier: "inferred_class" };
}

/**
 * Classify a raw incident type string into a CanonicalIncidentType.
 */
export function classifyIncidentType(raw: string): CanonicalIncidentType {
  const r = (raw || "").toLowerCase().trim();
  if (
    r === "collision" || r === "frontal" || r === "rear" || r === "side" ||
    r === "side_driver" || r === "side_passenger" || r === "rollover" ||
    r === "multi_impact" || r === "accident"
  ) return "collision";
  if (r === "theft" || r === "hijacking" || r === "stolen") return "theft";
  if (r === "vandalism" || r === "malicious") return "vandalism";
  if (r === "flood" || r === "water" || r === "hail") return "flood";
  if (r === "fire" || r === "burn") return "fire";
  return "unknown";
}

/**
 * Infer vehicle body type from make+model string.
 */
export function inferVehicleBodyType(make: string, model: string): VehicleBodyType {
  const combined = `${make} ${model}`.toLowerCase();
  if (/hilux|ranger|navara|d-max|d-teq|triton|l200|bt-50|np300|np200|amarok|frontier|tacoma|tundra|f-150|f-250|wingle|steed|hardbody/.test(combined)) return "pickup";
  if (/land cruiser|prado|fortuner|patrol|pajero|defender|discovery|grand cherokee|wrangler|expedition|suburban|tahoe|4runner|trooper|mu-x|everest|explorer|edge|sorento|santa fe|cx-9|cx-7|cx-5|rav4|cr-v|tucson|x-trail|qashqai|outlander|tiguan|touareg|x5|x7|q7|q8|glc|gle|gls|g-class|xc90|xc60|haval h6|jolion|mg hs/.test(combined)) return "suv";
  if (/hiace|quantum|h1|staria|urvan|sprinter|transit|transporter|trafic|berlingo|caddy|vito|crafter|daily|odyssey|sienna|carnival|tourneo/.test(combined)) return "van";
  if (/mx-5|z4|tt|r8|mustang|stinger|amg gt|boxster|cayman|911|corvette/.test(combined)) return "sports";
  if (/polo|vivo|swift|celerio|alto|kwid|sandero|picanto|morning|i10|i20|atos|vitz|yaris|starlet|etios|agya|fiesta|ka|up|clio|208|punto|500|micra|note|spark|aveo|baleno/.test(combined)) return "compact";
  return "sedan";
}

/**
 * Infer powertrain type from make+model string.
 */
export function inferPowertrainType(make: string, model: string): PowertrainType {
  const combined = `${make} ${model}`.toLowerCase();
  if (/tesla|leaf|ariya|ioniq 5|ioniq5|ev6|atto 3|byd seal|byd han|e-tron|i3|i4|ix|model 3|model s|model x|model y|cybertruck/.test(combined)) return "bev";
  if (/prius|insight|niro|ioniq(?! 5)|kona electric|outlander phev|rav4 hybrid|tucson hybrid/.test(combined)) return "hev";
  return "ice";
}

// ─────────────────────────────────────────────────────────────────────────────
// PIPELINE CONTEXT
// Built once by the runner, passed immutably to every stage.
// ─────────────────────────────────────────────────────────────────────────────

export interface PipelineVehicle {
  make: string;
  model: string;
  year: number | null;
  powertrain: PowertrainType;
  bodyType: VehicleBodyType;
  massKg: number;
  massTier: "explicit" | "inferred_model" | "inferred_class" | "not_available";
  components: VehicleComponentSet;
}

export interface PipelineSourceDocument {
  url: string | null;
  type: "pdf" | "photos" | "manual";
  photos: string[];
}

export interface PipelineContext {
  claimId: number;
  tenantId: number;
  assessmentId: number;
  claim: Record<string, any>;       // Full Drizzle claim row
  sourceDocument: PipelineSourceDocument;
  vehicle: PipelineVehicle;
  db: any;                          // Drizzle DB instance
  log: (stage: string, msg: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE RESULT
// Universal return type for every pipeline stage.
// ─────────────────────────────────────────────────────────────────────────────

export interface StageResult<T> {
  status: "success" | "failed" | "skipped";
  data: T | null;
  error?: string;
  durationMs: number;
  savedToDb: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE OUTPUT TYPES
// Each stage defines its own output type here. Stages only import from types.ts.
// ─────────────────────────────────────────────────────────────────────────────

/** Stage 1: Document extraction (LLM vision / PDF parsing) */
export interface ExtractedDocumentData {
  // Vehicle
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number | null;
  vehicleRegistration: string;
  vehicleVin: string;
  vehicleColour: string;
  vehicleEngineNumber: string;
  // Incident
  incidentDate: string;
  incidentDescription: string;
  incidentLocation: string;
  incidentType: string;           // Raw string from LLM
  accidentType: CollisionDirection | "unknown";  // Collision sub-type (photo mode)
  impactPoint: string;
  // Parties
  ownerName: string;
  repairerName: string;
  repairerCompany: string;
  thirdPartyVehicle: string;
  thirdPartyRegistration: string;
  // Damage
  damagedComponents: DamagedComponent[];
  totalDamageArea: number;
  maxCrushDepth: number;
  structuralDamage: boolean;
  airbagDeployment: boolean;
  // Financial (PDF mode only)
  extractedQuotedCostCents: number | null;
  extractedLabourCostCents: number | null;
  extractedPartsCostCents: number | null;
  // Photos extracted from PDF
  damagePhotoUrls: string[];
  // Repairer quote lines
  quotedParts: QuotedPart[];
  // Source
  sourceMode: "pdf" | "photos" | "manual";
}

export interface DamagedComponent {
  name: string;
  location: string;
  damageType: string;
  severity: string;
  visible: boolean;
  distanceFromImpact: number;
}

export interface QuotedPart {
  partName: string;
  partNumber: string;
  quantity: number;
  unitPriceCents: number;
  totalPriceCents: number;
  labourHours: number;
  labourRateCents: number;
  isOem: boolean;
  isAftermarket: boolean;
  isUsed: boolean;
}

/** Stage 2: Claim classification */
export interface ClassifiedClaimData {
  incidentType: CanonicalIncidentType;
  collisionDirection: CollisionDirection;
  runPhysics: boolean;             // true iff incidentType === 'collision'
  vehicle: PipelineVehicle;        // Resolved vehicle with mass + components
}

/** Stage 3: Physics analysis */
export interface PhysicsResult {
  impactForceN: number;            // Newtons
  impactForceKn: number;           // kN (convenience)
  energyDissipatedJ: number;       // Joules
  energyDissipatedKj: number;      // kJ (convenience)
  kineticEnergyJ: number;
  estimatedSpeedKmh: number;
  deltaVKmh: number;
  decelerationG: number;
  accidentSeverity: AccidentSeverity;
  collisionType: string;
  primaryImpactZone: string;
  latentDamageProbability: {
    engine: number;       // 0–100
    transmission: number;
    suspension: number;
    frame: number;
    electrical: number;
  };
  damageConsistencyScore: number;  // 0–100
  rawPhysicsOutput: Record<string, any>;  // Full output from accidentPhysics.ts
}

/** Stage 4: Hidden damage inference */
export interface InferredHiddenDamage {
  component: string;               // Vehicle-specific part name
  reason: string;                  // Physics-derived explanation with actual quantities
  probability: number;             // 0–100
  confidenceLabel: ConfidenceLabel;
  propagationStep: number;         // 1 = first node in chain
  chain: HiddenDamageChain;
  estimatedCostUsd: number;        // Scaled with energyDissipated kJ × repair index
  // Physics traceability
  physicsForceKn: number;
  physicsEnergyKj: number;
  physicsSpeedKmh: number;
  physicsDeltaV: number;
}

export interface HiddenDamageResult {
  damages: InferredHiddenDamage[];
  totalEstimatedCostUsd: number;
  physicsUsed: boolean;            // true if physics data was available
  energySeverityIndex: number;     // √(E_kJ/10), 1.0–3.0
}

/** Stage 5: Forensic / fraud analysis */
export interface ForensicResult {
  fraudRiskScore: number;          // 0–100
  fraudRiskLevel: "low" | "medium" | "high" | "critical";
  fraudIndicators: string[];
  damageConsistencyScore: number;
  damageConsistencyNotes: string;
  vehicleAgeRiskFactor: number;
  mileageAnomalyFlag: boolean;
  repairerRiskFlag: boolean;
  claimHistoryRiskFlag: boolean;
}

/** Stage 6: Repair intelligence */
export interface RepairIntelligenceResult {
  laborHoursEstimate: number;
  laborRateUsd: number;
  laborCostUsd: number;
  partsCostUsd: number;
  totalRepairCostUsd: number;
  repairComplexity: "straightforward" | "moderate" | "complex" | "specialist";
  recommendedRepairMethod: string;
  partsReconciliation: PartsReconciliationItem[];
  repairTimeDays: number;
}

export interface PartsReconciliationItem {
  partName: string;
  quotedPriceCents: number;
  aiBenchmarkCents: number;
  variancePct: number;
  flag: "ok" | "overpriced" | "underpriced" | "missing" | "not_in_quote";
  notes: string;
}

/** Stage 7: Cost intelligence */
export interface CostIntelligenceResult {
  // Document-extracted cost (from PDF quote — what was submitted)
  documentQuotedCostCents: number | null;
  // AI independent benchmark (computed from components × market rates)
  aiBenchmarkCostCents: number;
  aiBenchmarkBreakdown: {
    partsUsd: number;
    labourUsd: number;
    hiddenDamageUsd: number;
    paintUsd: number;
    totalUsd: number;
  };
  // Fair range (benchmark ± confidence interval)
  fairRangeLowCents: number;
  fairRangeHighCents: number;
  // Variance analysis
  variancePct: number | null;       // null if no document quote
  varianceFlag: "within_range" | "overpriced" | "underpriced" | "no_quote";
  // Market context
  marketRegion: string;
  labourRateUsdPerHour: number;
  currency: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// PIPELINE RESULTS MAP
// Keyed by stage name. Used by the runner to pass previous stage outputs.
// ─────────────────────────────────────────────────────────────────────────────

export interface PipelineResults {
  extraction?: StageResult<ExtractedDocumentData>;
  classification?: StageResult<ClassifiedClaimData>;
  physics?: StageResult<PhysicsResult>;
  hiddenDamage?: StageResult<HiddenDamageResult>;
  forensics?: StageResult<ForensicResult>;
  repair?: StageResult<RepairIntelligenceResult>;
  cost?: StageResult<CostIntelligenceResult>;
}

// ─────────────────────────────────────────────────────────────────────────────
// PIPELINE RUN SUMMARY
// ─────────────────────────────────────────────────────────────────────────────

export interface PipelineStageSummary {
  status: "success" | "failed" | "skipped";
  durationMs: number;
  savedToDb: boolean;
  error?: string;
}

export interface PipelineRunSummary {
  claimId: number;
  stages: Record<string, PipelineStageSummary>;
  allSavedToDb: boolean;
  totalDurationMs: number;
  completedAt: string;
}
