/**
 * Stage 6.5C — Structural Load Path Engine (SLPE)
 *
 * Replaces the legacy lookup-table latent damage predictor with a physics-driven
 * structural cascade model. Given a calibrated crush depth, impact zone, overlap
 * percentage, and vehicle profile, the engine traces the deformation front through
 * the vehicle's structural load path and computes per-component penetration depth,
 * energy absorption, permanent deformation probability, and hidden damage risk.
 *
 * Architecture:
 *   - Load path maps are defined per impact zone (frontal/rear/side/rollover)
 *   - Each map is a sequence of structural components with known geometry
 *   - Crush depth drives penetration through the sequence
 *   - Vehicle class defaults are used when DB geometry is incomplete
 *   - Output feeds both the latent damage probability object and the PTL
 *
 * References:
 *   - NHTSA CRASH3 methodology (stiffness coefficients, energy balance)
 *   - RICSAC barrier equivalent speed tables
 *   - IIHS small overlap test structural observations
 *   - Euro NCAP structural deformation criteria
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type ImpactZone =
  | "front_full"      // >75% overlap frontal
  | "front_offset"    // 25-75% overlap frontal
  | "front_narrow"    // <25% overlap (small overlap / pole)
  | "rear_full"
  | "rear_offset"
  | "side_front"      // B-pillar forward
  | "side_rear"       // B-pillar rearward
  | "rollover"
  | "unknown";

export type BodyType =
  | "sedan"
  | "hatchback"
  | "wagon"
  | "suv"
  | "4wd"
  | "ute"
  | "van"
  | "coupe"
  | "convertible"
  | "unknown";

export type ReplacementLikelihood = "low" | "medium" | "high" | "certain";

export interface StructuralComponent {
  /** Internal identifier used in load path maps */
  id: string;
  /** Human-readable name for reports */
  displayName: string;
  /** Structural zone category for latent damage mapping */
  systemCategory: "frame" | "engine" | "transmission" | "suspension" | "electrical" | "body";
  /** Depth from impact face to start of this component (mm) */
  depthStartMm: number;
  /** Depth from impact face to end of this component (mm) */
  depthEndMm: number;
  /** Nominal component length along crush axis (mm) */
  lengthMm: number;
  /** Is this component hidden behind visible damage? */
  isHidden: boolean;
  /** Yield strength in MPa (class default, overridden by DB profile) */
  yieldStrengthMPa: number;
  /** Cross-section area for energy calculation (cm²) */
  crossSectionCm2: number;
}

export interface ComponentResult {
  id: string;
  displayName: string;
  systemCategory: StructuralComponent["systemCategory"];
  isHidden: boolean;
  /** How deep the deformation front penetrated into this component (mm) */
  penetrationDepthMm: number;
  /** Fraction of component length that was penetrated (0-1) */
  penetrationFraction: number;
  /** Estimated energy absorbed by this component (J) */
  estimatedEnergyAbsorbedJ: number;
  /** Probability that this component has permanent deformation (0-1) */
  permanentDeformationProbability: number;
  /** Probability of hidden damage not visible in photos (0-1) */
  hiddenDamageProbability: number;
  /** Whether a physical inspection of this component is required */
  inspectionRequired: boolean;
  /** Replacement likelihood assessment */
  replacementLikelihood: ReplacementLikelihood;
  /** Reasoning chain for this component's assessment */
  reasoning: string;
}

export interface SLPEResult {
  /** Input crush depth used (mm) */
  crushDepthMm: number;
  /** Confidence in the crush depth input (0-1) */
  crushDepthConfidence: number;
  /** Impact zone used */
  impactZone: ImpactZone;
  /** Overlap percentage used (0-100) */
  overlapPct: number;
  /** Vehicle body type used */
  bodyType: BodyType;
  /** Whether vehicle profile came from DB (true) or class defaults (false) */
  usedDbProfile: boolean;
  /** Total kinetic energy estimate at impact (J) */
  totalEnergyJ: number;
  /** Components in the load path that were reached by the deformation front */
  penetratedComponents: ComponentResult[];
  /** Components in the load path that were NOT reached */
  intactComponents: ComponentResult[];
  /** Primary structural zone of concern */
  primaryPenetrationZone: string;
  /** Structural integrity risk level */
  structuralIntegrityRisk: "none" | "low" | "moderate" | "high" | "severe";
  /** Derived latent damage probabilities (% 0-100) for report compatibility */
  latentDamageProbability: {
    engine: number;
    transmission: number;
    suspension: number;
    frame: number;
    electrical: number;
  };
  /** Overall confidence in the SLPE result (0-1) */
  confidence: number;
  /** Human-readable summary of the structural assessment */
  summary: string;
  /** Warnings about data quality or model limitations */
  warnings: string[];
}

// ─── Vehicle Profile ──────────────────────────────────────────────────────────

interface VehicleProfile {
  massKg: number;
  bodyType: BodyType;
  /** Front rail length from bumper face to firewall (mm) */
  frontRailLengthMm: number;
  /** Crash box length (mm) */
  crashBoxLengthMm: number;
  /** Bumper beam depth (mm) */
  bumperBeamDepthMm: number;
  /** Rear rail length (mm) */
  rearRailLengthMm: number;
  /** B-pillar intrusion depth before rocker contact (mm) */
  bPillarDepthMm: number;
  /** Rocker sill depth (mm) */
  rockerDepthMm: number;
  /** Is body-on-frame construction (utes, some 4WDs) */
  isBodyOnFrame: boolean;
  /** Front stiffness coefficient A (N/m) — CRASH3 */
  stiffnessA: number;
  /** Front stiffness coefficient B (N/m²) — CRASH3 */
  stiffnessB: number;
}

/** Class-level structural defaults when DB profile is incomplete */
const CLASS_DEFAULTS: Record<BodyType, VehicleProfile> = {
  sedan: {
    massKg: 1450, bodyType: "sedan",
    frontRailLengthMm: 450, crashBoxLengthMm: 80, bumperBeamDepthMm: 40,
    rearRailLengthMm: 380, bPillarDepthMm: 120, rockerDepthMm: 80,
    isBodyOnFrame: false, stiffnessA: 12000, stiffnessB: 1800,
  },
  hatchback: {
    massKg: 1280, bodyType: "hatchback",
    frontRailLengthMm: 400, crashBoxLengthMm: 75, bumperBeamDepthMm: 35,
    rearRailLengthMm: 320, bPillarDepthMm: 110, rockerDepthMm: 75,
    isBodyOnFrame: false, stiffnessA: 11000, stiffnessB: 1600,
  },
  wagon: {
    massKg: 1550, bodyType: "wagon",
    frontRailLengthMm: 460, crashBoxLengthMm: 82, bumperBeamDepthMm: 42,
    rearRailLengthMm: 420, bPillarDepthMm: 125, rockerDepthMm: 82,
    isBodyOnFrame: false, stiffnessA: 12500, stiffnessB: 1900,
  },
  suv: {
    massKg: 1850, bodyType: "suv",
    frontRailLengthMm: 520, crashBoxLengthMm: 90, bumperBeamDepthMm: 50,
    rearRailLengthMm: 440, bPillarDepthMm: 140, rockerDepthMm: 90,
    isBodyOnFrame: false, stiffnessA: 15000, stiffnessB: 2200,
  },
  "4wd": {
    massKg: 2100, bodyType: "4wd",
    frontRailLengthMm: 560, crashBoxLengthMm: 95, bumperBeamDepthMm: 55,
    rearRailLengthMm: 480, bPillarDepthMm: 150, rockerDepthMm: 95,
    isBodyOnFrame: true, stiffnessA: 18000, stiffnessB: 2600,
  },
  ute: {
    massKg: 2000, bodyType: "ute",
    frontRailLengthMm: 540, crashBoxLengthMm: 85, bumperBeamDepthMm: 50,
    rearRailLengthMm: 460, bPillarDepthMm: 145, rockerDepthMm: 88,
    isBodyOnFrame: true, stiffnessA: 17000, stiffnessB: 2500,
  },
  van: {
    massKg: 2300, bodyType: "van",
    frontRailLengthMm: 600, crashBoxLengthMm: 100, bumperBeamDepthMm: 55,
    rearRailLengthMm: 500, bPillarDepthMm: 160, rockerDepthMm: 100,
    isBodyOnFrame: false, stiffnessA: 16000, stiffnessB: 2300,
  },
  coupe: {
    massKg: 1400, bodyType: "coupe",
    frontRailLengthMm: 440, crashBoxLengthMm: 78, bumperBeamDepthMm: 38,
    rearRailLengthMm: 360, bPillarDepthMm: 115, rockerDepthMm: 78,
    isBodyOnFrame: false, stiffnessA: 12000, stiffnessB: 1750,
  },
  convertible: {
    massKg: 1500, bodyType: "convertible",
    frontRailLengthMm: 440, crashBoxLengthMm: 78, bumperBeamDepthMm: 38,
    rearRailLengthMm: 360, bPillarDepthMm: 115, rockerDepthMm: 78,
    isBodyOnFrame: false, stiffnessA: 12000, stiffnessB: 1750,
  },
  unknown: {
    massKg: 1500, bodyType: "unknown",
    frontRailLengthMm: 460, crashBoxLengthMm: 82, bumperBeamDepthMm: 42,
    rearRailLengthMm: 380, bPillarDepthMm: 120, rockerDepthMm: 80,
    isBodyOnFrame: false, stiffnessA: 13000, stiffnessB: 1900,
  },
};

// ─── Load Path Maps ───────────────────────────────────────────────────────────

/**
 * Build the structural component sequence for a given impact zone and vehicle profile.
 * depthStartMm / depthEndMm are measured from the impact face.
 */
function buildLoadPath(zone: ImpactZone, p: VehicleProfile): StructuralComponent[] {
  const bb = p.bumperBeamDepthMm;
  const cb = p.crashBoxLengthMm;
  const rl = p.frontRailLengthMm;
  const rrl = p.rearRailLengthMm;
  const bp = p.bPillarDepthMm;
  const rk = p.rockerDepthMm;

  switch (zone) {
    case "front_full":
      return [
        { id: "bumper_beam",    displayName: "Bumper Beam",          systemCategory: "body",         depthStartMm: 0,          depthEndMm: bb,          lengthMm: bb,  isHidden: false, yieldStrengthMPa: 350, crossSectionCm2: 18 },
        { id: "energy_absorb",  displayName: "Energy Absorber Foam", systemCategory: "body",         depthStartMm: bb,         depthEndMm: bb + 20,     lengthMm: 20,  isHidden: false, yieldStrengthMPa: 5,   crossSectionCm2: 80 },
        { id: "crash_box_lh",   displayName: "Crash Box (LH)",       systemCategory: "frame",        depthStartMm: bb + 20,    depthEndMm: bb + 20 + cb, lengthMm: cb, isHidden: true,  yieldStrengthMPa: 420, crossSectionCm2: 12 },
        { id: "crash_box_rh",   displayName: "Crash Box (RH)",       systemCategory: "frame",        depthStartMm: bb + 20,    depthEndMm: bb + 20 + cb, lengthMm: cb, isHidden: true,  yieldStrengthMPa: 420, crossSectionCm2: 12 },
        { id: "front_rail_lh",  displayName: "Front Chassis Rail (LH)", systemCategory: "frame",    depthStartMm: bb + 20 + cb, depthEndMm: bb + 20 + cb + rl * 0.6, lengthMm: rl * 0.6, isHidden: true, yieldStrengthMPa: 550, crossSectionCm2: 20 },
        { id: "front_rail_rh",  displayName: "Front Chassis Rail (RH)", systemCategory: "frame",    depthStartMm: bb + 20 + cb, depthEndMm: bb + 20 + cb + rl * 0.6, lengthMm: rl * 0.6, isHidden: true, yieldStrengthMPa: 550, crossSectionCm2: 20 },
        { id: "engine_cradle",  displayName: "Engine Cradle / Subframe", systemCategory: "engine",  depthStartMm: bb + 20 + cb + rl * 0.3, depthEndMm: bb + 20 + cb + rl * 0.7, lengthMm: rl * 0.4, isHidden: true, yieldStrengthMPa: 480, crossSectionCm2: 25 },
        { id: "engine_block",   displayName: "Engine Block",          systemCategory: "engine",      depthStartMm: bb + 20 + cb + rl * 0.5, depthEndMm: bb + 20 + cb + rl * 0.9, lengthMm: rl * 0.4, isHidden: true, yieldStrengthMPa: 800, crossSectionCm2: 60 },
        { id: "firewall",       displayName: "Firewall / Dash Panel", systemCategory: "frame",       depthStartMm: bb + 20 + cb + rl * 0.85, depthEndMm: bb + 20 + cb + rl, lengthMm: rl * 0.15, isHidden: true, yieldStrengthMPa: 600, crossSectionCm2: 120 },
        { id: "front_floor",    displayName: "Front Floor / Toeboard", systemCategory: "frame",      depthStartMm: bb + 20 + cb + rl, depthEndMm: bb + 20 + cb + rl + 80, lengthMm: 80, isHidden: true, yieldStrengthMPa: 500, crossSectionCm2: 200 },
      ];

    case "front_offset":
      // Asymmetric — one rail takes most load, engine cradle contact at lower depth
      return [
        { id: "bumper_beam",    displayName: "Bumper Beam (partial)", systemCategory: "body",        depthStartMm: 0,          depthEndMm: bb,          lengthMm: bb,  isHidden: false, yieldStrengthMPa: 350, crossSectionCm2: 10 },
        { id: "crash_box",      displayName: "Crash Box (loaded side)", systemCategory: "frame",     depthStartMm: bb,         depthEndMm: bb + cb,     lengthMm: cb,  isHidden: true,  yieldStrengthMPa: 420, crossSectionCm2: 12 },
        { id: "front_rail",     displayName: "Front Chassis Rail (loaded side)", systemCategory: "frame", depthStartMm: bb + cb, depthEndMm: bb + cb + rl * 0.65, lengthMm: rl * 0.65, isHidden: true, yieldStrengthMPa: 550, crossSectionCm2: 20 },
        { id: "engine_cradle",  displayName: "Engine Cradle",         systemCategory: "engine",      depthStartMm: bb + cb + rl * 0.25, depthEndMm: bb + cb + rl * 0.65, lengthMm: rl * 0.4, isHidden: true, yieldStrengthMPa: 480, crossSectionCm2: 25 },
        { id: "firewall",       displayName: "Firewall (torsional load)", systemCategory: "frame",   depthStartMm: bb + cb + rl * 0.7, depthEndMm: bb + cb + rl, lengthMm: rl * 0.3, isHidden: true, yieldStrengthMPa: 600, crossSectionCm2: 120 },
        { id: "strut_tower",    displayName: "Front Strut Tower",     systemCategory: "suspension",  depthStartMm: bb + cb + rl * 0.1, depthEndMm: bb + cb + rl * 0.5, lengthMm: rl * 0.4, isHidden: true, yieldStrengthMPa: 500, crossSectionCm2: 30 },
      ];

    case "front_narrow":
      // Small overlap — wheel/strut tower takes primary load, chassis rail largely bypassed
      return [
        { id: "bumper_end",     displayName: "Bumper End Cap",        systemCategory: "body",        depthStartMm: 0,          depthEndMm: bb * 0.5,    lengthMm: bb * 0.5, isHidden: false, yieldStrengthMPa: 250, crossSectionCm2: 5 },
        { id: "strut_tower",    displayName: "Front Strut Tower",     systemCategory: "suspension",  depthStartMm: bb * 0.5,   depthEndMm: bb * 0.5 + 120, lengthMm: 120, isHidden: false, yieldStrengthMPa: 500, crossSectionCm2: 30 },
        { id: "wheel_arch",     displayName: "Wheel Arch / Inner Wing", systemCategory: "body",      depthStartMm: bb * 0.5 + 40, depthEndMm: bb * 0.5 + 180, lengthMm: 140, isHidden: false, yieldStrengthMPa: 350, crossSectionCm2: 15 },
        { id: "a_pillar_base",  displayName: "A-Pillar Base",         systemCategory: "frame",       depthStartMm: bb * 0.5 + 100, depthEndMm: bb * 0.5 + 250, lengthMm: 150, isHidden: false, yieldStrengthMPa: 700, crossSectionCm2: 25 },
        { id: "steering_rack",  displayName: "Steering Rack",         systemCategory: "suspension",  depthStartMm: bb + cb,    depthEndMm: bb + cb + 80, lengthMm: 80, isHidden: true, yieldStrengthMPa: 600, crossSectionCm2: 20 },
      ];

    case "rear_full":
      return [
        { id: "rear_bumper",    displayName: "Rear Bumper Beam",      systemCategory: "body",        depthStartMm: 0,          depthEndMm: bb,          lengthMm: bb,  isHidden: false, yieldStrengthMPa: 350, crossSectionCm2: 16 },
        { id: "rear_absorber",  displayName: "Rear Energy Absorber",  systemCategory: "body",        depthStartMm: bb,         depthEndMm: bb + 25,     lengthMm: 25,  isHidden: false, yieldStrengthMPa: 5,   crossSectionCm2: 70 },
        { id: "rear_rail_lh",   displayName: "Rear Chassis Rail (LH)", systemCategory: "frame",      depthStartMm: bb + 25,    depthEndMm: bb + 25 + rrl * 0.7, lengthMm: rrl * 0.7, isHidden: true, yieldStrengthMPa: 520, crossSectionCm2: 18 },
        { id: "rear_rail_rh",   displayName: "Rear Chassis Rail (RH)", systemCategory: "frame",      depthStartMm: bb + 25,    depthEndMm: bb + 25 + rrl * 0.7, lengthMm: rrl * 0.7, isHidden: true, yieldStrengthMPa: 520, crossSectionCm2: 18 },
        { id: "spare_well",     displayName: "Spare Wheel Well",      systemCategory: "body",        depthStartMm: bb + 25 + rrl * 0.5, depthEndMm: bb + 25 + rrl * 0.8, lengthMm: rrl * 0.3, isHidden: true, yieldStrengthMPa: 400, crossSectionCm2: 50 },
        { id: "fuel_tank_zone", displayName: "Fuel Tank Zone",        systemCategory: "electrical",  depthStartMm: bb + 25 + rrl * 0.6, depthEndMm: bb + 25 + rrl, lengthMm: rrl * 0.4, isHidden: true, yieldStrengthMPa: 300, crossSectionCm2: 40 },
        { id: "rear_floor",     displayName: "Rear Floor Pan",        systemCategory: "frame",       depthStartMm: bb + 25 + rrl * 0.85, depthEndMm: bb + 25 + rrl + 60, lengthMm: 60, isHidden: true, yieldStrengthMPa: 480, crossSectionCm2: 180 },
      ];

    case "rear_offset":
      return [
        { id: "rear_bumper",    displayName: "Rear Bumper (partial)", systemCategory: "body",        depthStartMm: 0,          depthEndMm: bb,          lengthMm: bb,  isHidden: false, yieldStrengthMPa: 350, crossSectionCm2: 9 },
        { id: "rear_rail",      displayName: "Rear Chassis Rail (loaded side)", systemCategory: "frame", depthStartMm: bb, depthEndMm: bb + rrl * 0.75, lengthMm: rrl * 0.75, isHidden: true, yieldStrengthMPa: 520, crossSectionCm2: 18 },
        { id: "fuel_tank_zone", displayName: "Fuel Tank Zone",        systemCategory: "electrical",  depthStartMm: bb + rrl * 0.55, depthEndMm: bb + rrl, lengthMm: rrl * 0.45, isHidden: true, yieldStrengthMPa: 300, crossSectionCm2: 40 },
      ];

    case "side_front":
      // B-pillar forward — door beam → B-pillar → rocker sill
      return [
        { id: "door_skin",      displayName: "Door Outer Skin",       systemCategory: "body",        depthStartMm: 0,          depthEndMm: 8,           lengthMm: 8,   isHidden: false, yieldStrengthMPa: 200, crossSectionCm2: 60 },
        { id: "door_beam",      displayName: "Door Impact Beam",      systemCategory: "body",        depthStartMm: 8,          depthEndMm: 8 + 50,      lengthMm: 50,  isHidden: false, yieldStrengthMPa: 700, crossSectionCm2: 8 },
        { id: "door_inner",     displayName: "Door Inner Panel",      systemCategory: "body",        depthStartMm: 58,         depthEndMm: 58 + 20,     lengthMm: 20,  isHidden: false, yieldStrengthMPa: 350, crossSectionCm2: 25 },
        { id: "b_pillar",       displayName: "B-Pillar",              systemCategory: "frame",       depthStartMm: 78,         depthEndMm: 78 + bp,     lengthMm: bp,  isHidden: false, yieldStrengthMPa: 800, crossSectionCm2: 22 },
        { id: "rocker_sill",    displayName: "Rocker Sill",           systemCategory: "frame",       depthStartMm: 78 + bp * 0.6, depthEndMm: 78 + bp + rk, lengthMm: rk, isHidden: true, yieldStrengthMPa: 700, crossSectionCm2: 30 },
        { id: "floor_cross",    displayName: "Floor Cross-Member",    systemCategory: "frame",       depthStartMm: 78 + bp + rk * 0.5, depthEndMm: 78 + bp + rk + 60, lengthMm: 60, isHidden: true, yieldStrengthMPa: 550, crossSectionCm2: 35 },
      ];

    case "side_rear":
      return [
        { id: "rear_door_skin", displayName: "Rear Door Outer Skin",  systemCategory: "body",        depthStartMm: 0,          depthEndMm: 8,           lengthMm: 8,   isHidden: false, yieldStrengthMPa: 200, crossSectionCm2: 55 },
        { id: "rear_door_beam", displayName: "Rear Door Impact Beam", systemCategory: "body",        depthStartMm: 8,          depthEndMm: 8 + 45,      lengthMm: 45,  isHidden: false, yieldStrengthMPa: 650, crossSectionCm2: 7 },
        { id: "c_pillar",       displayName: "C-Pillar",              systemCategory: "frame",       depthStartMm: 53,         depthEndMm: 53 + bp * 0.8, lengthMm: bp * 0.8, isHidden: false, yieldStrengthMPa: 750, crossSectionCm2: 18 },
        { id: "rear_rocker",    displayName: "Rear Rocker Sill",      systemCategory: "frame",       depthStartMm: 53 + bp * 0.5, depthEndMm: 53 + bp * 0.8 + rk, lengthMm: rk, isHidden: true, yieldStrengthMPa: 700, crossSectionCm2: 28 },
        { id: "rear_floor_cross", displayName: "Rear Floor Cross-Member", systemCategory: "frame",   depthStartMm: 53 + bp + rk * 0.4, depthEndMm: 53 + bp + rk + 55, lengthMm: 55, isHidden: true, yieldStrengthMPa: 520, crossSectionCm2: 32 },
      ];

    case "rollover":
      return [
        { id: "roof_skin",      displayName: "Roof Skin",             systemCategory: "body",        depthStartMm: 0,          depthEndMm: 15,          lengthMm: 15,  isHidden: false, yieldStrengthMPa: 180, crossSectionCm2: 200 },
        { id: "roof_bow",       displayName: "Roof Bow / Cross-Rail", systemCategory: "frame",       depthStartMm: 15,         depthEndMm: 15 + 40,     lengthMm: 40,  isHidden: false, yieldStrengthMPa: 500, crossSectionCm2: 15 },
        { id: "a_pillar_top",   displayName: "A-Pillar (upper)",      systemCategory: "frame",       depthStartMm: 20,         depthEndMm: 20 + 80,     lengthMm: 80,  isHidden: false, yieldStrengthMPa: 700, crossSectionCm2: 20 },
        { id: "b_pillar_top",   displayName: "B-Pillar (upper)",      systemCategory: "frame",       depthStartMm: 20,         depthEndMm: 20 + 80,     lengthMm: 80,  isHidden: false, yieldStrengthMPa: 800, crossSectionCm2: 22 },
        { id: "side_glass",     displayName: "Side Window Glass",     systemCategory: "electrical",  depthStartMm: 0,          depthEndMm: 10,          lengthMm: 10,  isHidden: false, yieldStrengthMPa: 50,  crossSectionCm2: 30 },
        { id: "wiring_harness", displayName: "Roof Wiring Harness",   systemCategory: "electrical",  depthStartMm: 15,         depthEndMm: 15 + 60,     lengthMm: 60,  isHidden: true,  yieldStrengthMPa: 10,  crossSectionCm2: 5 },
      ];

    default:
      // Unknown — return a minimal generic path
      return [
        { id: "outer_panel",    displayName: "Outer Panel",           systemCategory: "body",        depthStartMm: 0,          depthEndMm: 30,          lengthMm: 30,  isHidden: false, yieldStrengthMPa: 250, crossSectionCm2: 40 },
        { id: "inner_structure", displayName: "Inner Structure",      systemCategory: "frame",       depthStartMm: 30,         depthEndMm: 150,         lengthMm: 120, isHidden: true,  yieldStrengthMPa: 500, crossSectionCm2: 20 },
      ];
  }
}

// ─── Energy Model ─────────────────────────────────────────────────────────────

/**
 * Estimate energy absorbed by a component given penetration depth.
 * Uses simplified plastic deformation model: E = σ_y × A × δ
 * where σ_y = yield strength, A = cross-section, δ = penetration depth
 */
function estimateComponentEnergy(
  component: StructuralComponent,
  penetrationMm: number
): number {
  if (penetrationMm <= 0) return 0;
  const penetrationM = penetrationMm / 1000;
  const areaCm2 = component.crossSectionCm2;
  const areaM2 = areaCm2 / 10000;
  const yieldPa = component.yieldStrengthMPa * 1e6;
  // E = σ × A × δ (simplified — actual is integral of force over displacement)
  return yieldPa * areaM2 * penetrationM;
}

/**
 * Estimate total kinetic energy from mass and delta-V.
 * Uses ½mv² with delta-V as the effective speed change.
 */
function estimateTotalEnergy(massKg: number, deltaVKmh: number): number {
  const deltaVMs = deltaVKmh / 3.6;
  return 0.5 * massKg * deltaVMs * deltaVMs;
}

// ─── Replacement Likelihood ───────────────────────────────────────────────────

function replacementLikelihood(permanentDeformProb: number): ReplacementLikelihood {
  if (permanentDeformProb >= 0.85) return "certain";
  if (permanentDeformProb >= 0.60) return "high";
  if (permanentDeformProb >= 0.35) return "medium";
  return "low";
}

// ─── Structural Integrity Risk ────────────────────────────────────────────────

function structuralIntegrityRisk(
  penetratedComponents: ComponentResult[],
  zone: ImpactZone
): SLPEResult["structuralIntegrityRisk"] {
  const frameComponents = penetratedComponents.filter(c => c.systemCategory === "frame");
  const highProbFrame = frameComponents.filter(c => c.permanentDeformationProbability >= 0.6);
  const firewallHit = penetratedComponents.some(c => c.id === "firewall" && c.permanentDeformationProbability > 0.3);
  const bPillarHit = penetratedComponents.some(c => c.id === "b_pillar" && c.permanentDeformationProbability > 0.4);
  const rockerHit = penetratedComponents.some(c => (c.id === "rocker_sill" || c.id === "rear_rocker") && c.permanentDeformationProbability > 0.3);

  if (firewallHit || (zone === "rollover" && penetratedComponents.length >= 4)) return "severe";
  if (bPillarHit && rockerHit) return "high";
  if (highProbFrame.length >= 3) return "high";
  if (highProbFrame.length >= 2 || bPillarHit || rockerHit) return "moderate";
  if (highProbFrame.length >= 1) return "low";
  return "none";
}

// ─── Latent Damage Probability Derivation ────────────────────────────────────

/**
 * Derive the legacy { engine, transmission, suspension, frame, electrical } probabilities
 * from the SLPE component results. This replaces the lookup table in accidentPhysics.ts.
 */
function deriveLatentDamageProbability(
  penetratedComponents: ComponentResult[],
  totalEnergyJ: number,
  vehicleAgeYears: number,
  isBodyOnFrame: boolean
): SLPEResult["latentDamageProbability"] {
  const categoryEnergy: Record<string, number> = {
    engine: 0, transmission: 0, suspension: 0, frame: 0, electrical: 0, body: 0,
  };
  let totalAbsorbed = 0;

  for (const c of penetratedComponents) {
    const cat = c.systemCategory === "body" ? "body" : c.systemCategory;
    categoryEnergy[cat] = (categoryEnergy[cat] ?? 0) + c.estimatedEnergyAbsorbedJ * c.permanentDeformationProbability;
    totalAbsorbed += c.estimatedEnergyAbsorbedJ;
  }

  const base = totalAbsorbed > 0 ? Math.min(totalAbsorbed / Math.max(totalEnergyJ, 1), 1) : 0;

  // Age multiplier: older vehicles have reduced crush zone compliance — more energy reaches structural components
  const ageMult = Math.min(1 + vehicleAgeYears * 0.015, 1.4);
  // Body-on-frame multiplier: ladder frame transmits more energy to body mounts
  const frameMult = isBodyOnFrame ? 1.15 : 1.0;

  const scale = (raw: number) => Math.min(Math.round(raw * ageMult * frameMult * 100), 100);

  return {
    engine:       scale(categoryEnergy.engine / Math.max(totalEnergyJ, 1) + base * 0.15),
    transmission: scale(categoryEnergy.transmission / Math.max(totalEnergyJ, 1) + base * 0.10),
    suspension:   scale(categoryEnergy.suspension / Math.max(totalEnergyJ, 1) + base * 0.20),
    frame:        scale(categoryEnergy.frame / Math.max(totalEnergyJ, 1) + base * 0.25),
    electrical:   scale(categoryEnergy.electrical / Math.max(totalEnergyJ, 1) + base * 0.12),
  };
}

// ─── Main Engine ──────────────────────────────────────────────────────────────

export interface SLPEInput {
  /** Calibrated crush depth in metres (from PTL) */
  crushDepthM: number;
  /** Confidence in crush depth (0-1) */
  crushDepthConfidence: number;
  /** Impact zone */
  impactZone: ImpactZone;
  /** Overlap percentage (0-100); defaults to 100 for unknown */
  overlapPct?: number;
  /** Vehicle body type */
  bodyType?: BodyType;
  /** Vehicle mass in kg (from vehicle profile or claim) */
  massKg?: number;
  /** Delta-V in km/h (from PTL speed consensus) */
  deltaVKmh?: number;
  /** Vehicle age in years (for compliance degradation) */
  vehicleAgeYears?: number;
  /** Whether vehicle is body-on-frame construction */
  isBodyOnFrame?: boolean;
  /** Whether the vehicle profile came from the DB */
  usedDbProfile?: boolean;
}

export function runSLPE(input: SLPEInput): SLPEResult {
  const warnings: string[] = [];

  // ── Resolve vehicle profile ────────────────────────────────────────────────
  const bodyType: BodyType = input.bodyType ?? "unknown";
  const profile = CLASS_DEFAULTS[bodyType] ?? CLASS_DEFAULTS.unknown;
  const massKg = input.massKg ?? profile.massKg;
  const overlapPct = input.overlapPct ?? 100;
  const deltaVKmh = input.deltaVKmh ?? 0;
  const vehicleAgeYears = input.vehicleAgeYears ?? 5;
  const isBodyOnFrame = input.isBodyOnFrame ?? profile.isBodyOnFrame;

  if (!input.massKg) warnings.push("Vehicle mass not available — using class default.");
  if (!input.deltaVKmh) warnings.push("Delta-V not available — energy model uses crush depth only.");
  if (input.crushDepthConfidence < 0.5) warnings.push("Crush depth confidence below 50% — SLPE results have elevated uncertainty.");

  // ── Resolve impact zone from overlap if needed ─────────────────────────────
  let zone = input.impactZone;
  if (zone === "front_full" && overlapPct < 25) zone = "front_narrow";
  else if (zone === "front_full" && overlapPct < 75) zone = "front_offset";
  if (zone === "rear_full" && overlapPct < 75) zone = "rear_offset";

  // ── Build load path ────────────────────────────────────────────────────────
  const loadPath = buildLoadPath(zone, profile);
  const crushDepthMm = input.crushDepthM * 1000;

  // ── Total energy ───────────────────────────────────────────────────────────
  const totalEnergyJ = deltaVKmh > 0
    ? estimateTotalEnergy(massKg, deltaVKmh)
    : estimateTotalEnergy(massKg, Math.sqrt(2 * 9.81 * crushDepthMm / 1000) * 3.6); // fallback from crush depth

  // ── Trace deformation front through load path ──────────────────────────────
  const penetratedComponents: ComponentResult[] = [];
  const intactComponents: ComponentResult[] = [];

  for (const comp of loadPath) {
    if (crushDepthMm <= comp.depthStartMm) {
      // Deformation front did not reach this component
      intactComponents.push({
        id: comp.id,
        displayName: comp.displayName,
        systemCategory: comp.systemCategory,
        isHidden: comp.isHidden,
        penetrationDepthMm: 0,
        penetrationFraction: 0,
        estimatedEnergyAbsorbedJ: 0,
        permanentDeformationProbability: 0,
        hiddenDamageProbability: comp.isHidden ? 0.05 : 0,
        inspectionRequired: false,
        replacementLikelihood: "low",
        reasoning: "Deformation front did not reach this component.",
      });
      continue;
    }

    // How deep did the front penetrate into this component?
    const penetrationMm = Math.min(
      crushDepthMm - comp.depthStartMm,
      comp.lengthMm
    );
    const penetrationFraction = penetrationMm / comp.lengthMm;
    const energyAbsorbed = estimateComponentEnergy(comp, penetrationMm);

    // Permanent deformation probability: sigmoid on penetration fraction
    // Full penetration (fraction=1) → ~95% probability; 50% penetration → ~65%
    const permanentDeformProb = Math.min(
      0.05 + 0.90 * (1 / (1 + Math.exp(-6 * (penetrationFraction - 0.4)))),
      0.97
    );

    // Hidden damage probability: higher for hidden components and deep penetration
    const hiddenDamageProb = comp.isHidden
      ? Math.min(permanentDeformProb * 1.1, 0.95)
      : Math.min(permanentDeformProb * 0.4, 0.6);

    const inspectionRequired = hiddenDamageProb > 0.35 || permanentDeformProb > 0.5;

    let reasoning = `Crush depth ${crushDepthMm.toFixed(0)}mm penetrated ${penetrationMm.toFixed(0)}mm into this component (${(penetrationFraction * 100).toFixed(0)}% of component length). `;
    if (permanentDeformProb > 0.7) reasoning += "Permanent deformation is highly probable. ";
    if (comp.isHidden) reasoning += "Component is not visible in photos — physical inspection required. ";
    if (energyAbsorbed > 5000) reasoning += `Estimated ${(energyAbsorbed / 1000).toFixed(1)} kJ absorbed.`;

    penetratedComponents.push({
      id: comp.id,
      displayName: comp.displayName,
      systemCategory: comp.systemCategory,
      isHidden: comp.isHidden,
      penetrationDepthMm: penetrationMm,
      penetrationFraction,
      estimatedEnergyAbsorbedJ: energyAbsorbed,
      permanentDeformationProbability: permanentDeformProb,
      hiddenDamageProbability: hiddenDamageProb,
      inspectionRequired,
      replacementLikelihood: replacementLikelihood(permanentDeformProb),
      reasoning,
    });
  }

  // ── Derive outputs ─────────────────────────────────────────────────────────
  const integrityRisk = structuralIntegrityRisk(penetratedComponents, zone);
  const latentDamageProb = deriveLatentDamageProbability(
    penetratedComponents, totalEnergyJ, vehicleAgeYears, isBodyOnFrame
  );

  // Primary penetration zone: deepest component reached
  const deepest = penetratedComponents.sort((a, b) => b.penetrationDepthMm - a.penetrationDepthMm)[0];
  const primaryZone = deepest?.displayName ?? "Outer panel only";

  // Overall SLPE confidence: combination of crush depth confidence and profile completeness
  const profileConfidence = input.usedDbProfile ? 0.85 : 0.65;
  const confidence = Math.min(input.crushDepthConfidence * 0.6 + profileConfidence * 0.4, 0.95);

  // Summary
  const componentCount = penetratedComponents.length;
  const hiddenCount = penetratedComponents.filter(c => c.isHidden).length;
  const summary = `${crushDepthMm.toFixed(0)}mm crush depth traced through ${componentCount} structural component${componentCount !== 1 ? "s" : ""} (${hiddenCount} hidden). ` +
    `Structural integrity risk: ${integrityRisk.toUpperCase()}. ` +
    `Primary zone of concern: ${primaryZone}. ` +
    `Frame deformation probability: ${latentDamageProb.frame}%.`;

  return {
    crushDepthMm,
    crushDepthConfidence: input.crushDepthConfidence,
    impactZone: zone,
    overlapPct,
    bodyType,
    usedDbProfile: input.usedDbProfile ?? false,
    totalEnergyJ,
    penetratedComponents,
    intactComponents,
    primaryPenetrationZone: primaryZone,
    structuralIntegrityRisk: integrityRisk,
    latentDamageProbability: latentDamageProb,
    confidence,
    summary,
    warnings,
  };
}
