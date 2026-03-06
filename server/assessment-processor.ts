// @ts-nocheck
/**
 * KINGA Assessment Processor — LLM-First Architecture with ML-Ready Plugin System
 * 
 * Architecture:
 *   Primary Intelligence: LLM (vision + structured output)
 *   Fallback: Inline TypeScript calculations (deterministic)
 *   Future: Pluggable ML models (scikit-learn, TensorFlow) via IModelPlugin interface
 * 
 * Pipeline:
 * 1. Upload PDF to S3
 * 2. Extract text from PDF (Node.js pdf-parse — no Python)
 * 3. Extract structured data with LLM (text + PDF vision)
 * 4. Classify and extract images from PDF via LLM vision
 * 5. Generate component repair/replace recommendations (LLM)
 * 6. Run physics validation (LLM-first, TypeScript fallback)
 * 7. Run fraud detection (LLM-first, TypeScript fallback)
 * 8. Return comprehensive assessment result with multi-quote comparison
 * 
 * ML-Ready: When trained models become available, implement IModelPlugin
 * and register them via registerPlugin(). They will take priority over
 * LLM analysis for their respective domains.
 */

import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { nanoid } from 'nanoid';
import { storagePut } from './storage';
import { invokeLLM } from './_core/llm';
import { resolveComponent, normalizeComponentName, type VehiclePart } from '../shared/vehicleParts';
import { crossValidateQuotesVsPhotos, type CrossValidationReport } from './cross-validation';
import { extendPhysicsValidationOutput } from './physics-quantitative-output';
import { validatePhysicsAnalysis, type PhysicsAnalysis as TypedPhysicsAnalysis } from '../shared/physics-types';

// ============================================================
// TYPE DEFINITIONS
// ============================================================

/**
 * Calculate impact angle in degrees (0-360) from primary impact zone.
 * 0° = front, 90° = right, 180° = rear, 270° = left
 */
function calculateImpactAngleDegrees(primaryImpactZone?: string): number {
  if (!primaryImpactZone) return 0;
  
  const zone = primaryImpactZone.toLowerCase();
  
  // Front zones (0° ± 45°)
  if (zone.includes('front')) {
    if (zone.includes('left')) return 315; // Front-left
    if (zone.includes('right')) return 45; // Front-right
    return 0; // Front center
  }
  
  // Rear zones (180° ± 45°)
  if (zone.includes('rear')) {
    if (zone.includes('left')) return 225; // Rear-left
    if (zone.includes('right')) return 135; // Rear-right
    return 180; // Rear center
  }
  
  // Side zones
  if (zone.includes('left')) return 270; // Left side
  if (zone.includes('right')) return 90; // Right side
  
  // Default to front
  return 0;
}

/**
 * Calculate normalized impact location (0-1 range) from primary impact zone.
 * relativeX: 0 = left, 0.5 = center, 1 = right
 * relativeY: 0 = top, 0.5 = middle, 1 = bottom
 */
function calculateImpactLocationNormalized(primaryImpactZone?: string): { relativeX: number; relativeY: number } {
  if (!primaryImpactZone) return { relativeX: 0.5, relativeY: 0.5 };
  
  const zone = primaryImpactZone.toLowerCase();
  
  // Front zones
  if (zone.includes('front')) {
    if (zone.includes('left')) return { relativeX: 0.25, relativeY: 0.5 };
    if (zone.includes('right')) return { relativeX: 0.75, relativeY: 0.5 };
    return { relativeX: 0.5, relativeY: 0.5 }; // Front center
  }
  
  // Rear zones
  if (zone.includes('rear')) {
    if (zone.includes('left')) return { relativeX: 0.25, relativeY: 0.5 };
    if (zone.includes('right')) return { relativeX: 0.75, relativeY: 0.5 };
    return { relativeX: 0.5, relativeY: 0.5 }; // Rear center
  }
  
  // Side zones
  if (zone.includes('left')) return { relativeX: 0.0, relativeY: 0.5 };
  if (zone.includes('right')) return { relativeX: 1.0, relativeY: 0.5 };
  
  // Default to center
  return { relativeX: 0.5, relativeY: 0.5 };
}

interface ItemizedCost {
  description: string;
  amount: number;
  category?: string;
}

interface CostBreakdown {
  labor?: number;
  parts?: number;
  materials?: number;
  paint?: number;
  sublet?: number;
  other?: number;
}

interface ComponentRecommendation {
  component: string;
  action: 'repair' | 'replace';
  severity: 'minor' | 'moderate' | 'severe';
  estimatedCost: number;
  laborHours: number;
  reasoning: string;
}

interface QuoteFigure {
  label: string;
  amount: number;
  source: string;
  type: 'original' | 'agreed' | 'ai' | 'reference';
  description?: string;
}

interface PhotoWithClassification {
  url: string;
  classification: 'damage_photo' | 'document';
  page?: number;
  caption?: string;
  detectedDamageArea?: string;
  detectedComponents?: Array<{
    name: string;
    severity: string;
    zone: string;
  }>;
  impactZone?: string;
  source?: 'pdf_page_render' | 'pdf_embedded' | 'uploaded';
  overallAssessment?: string;
}

interface PhysicsAnalysis {
  is_valid: boolean;
  confidence: number;
  damageConsistency: string;
  flags: string[];
  physics_analysis: {
    kinetic_energy_joules: number;
    vehicle_mass_kg: number;
    impact_speed_ms: number;
    deceleration_ms2: number;
    g_force: number;
  };
  recommendations: string[];
  impactSpeed: number;
  impactForce: number;
  energyDissipated: number;
  deceleration: number;
  physicsScore: number;
}

interface FraudAnalysis {
  fraud_probability: number;
  risk_level: string;
  risk_score: number;
  confidence: number;
  top_risk_factors: string[];
  recommendations: string[];
  indicators: {
    claimHistory: number;
    damageConsistency: number;
    documentAuthenticity: number;
    behavioralPatterns: number;
    ownershipVerification: number;
    geographicRisk: number;
  };
  physics_cross_reference: {
    physics_flags_count: number;
    physics_score: number;
    physics_contributes_to_fraud: boolean;
    physics_notes: string;
  };
  analysis_notes: string;
}

interface AssessmentResult {
  pdfUrl: string;
  crossValidation?: CrossValidationReport;
  normalizedComponents?: { raw: string; normalized: string; partId: string | null; zone: string | null }[];
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number;
  vehicleRegistration: string;
  vehicleMass?: string;
  claimantName?: string;
  accidentDate?: string;
  accidentLocation?: string;
  accidentDescription?: string;
  policeReportReference?: string;
  damageDescription?: string;
  damageLocation?: string;
  estimatedCost?: number;
  originalQuote?: number;
  agreedCost?: number;
  marketValue?: number;
  savings?: number;
  excessAmount?: number;
  betterment?: number;
  assessorName?: string;
  repairerName?: string;
  itemizedCosts?: ItemizedCost[];
  costBreakdown?: CostBreakdown;
  componentRecommendations?: ComponentRecommendation[];
  quotes?: QuoteFigure[];
  damagePhotos: string[];
  allPhotos?: PhotoWithClassification[];
  accidentType?: string;
  damagedComponents: string[];
  physicsAnalysis: PhysicsAnalysis;
  fraudAnalysis: FraudAnalysis;
  incidentClassification?: {
    incidentType: string;
    isCollision: boolean;
    vehicleWasStationary: boolean;
    confidence: number;
    reasoning: string;
  };
  narrativeValidation?: {
    narrativeScore: number;
    isPlausible: boolean;
    supports: string[];
    concerns: string[];
    deductions: string[];
  };
  missingData: string[];
  dataQuality: Record<string, boolean>;
  dataCompleteness: number;
}

// ============================================================
// ML-READY PLUGIN INTERFACE
// ============================================================
// When trained models are available (from KINGA-CLP-2026-021
// Continuous Learning Pipeline), implement this interface and
// register via registerPlugin(). Plugins take priority over LLM.

export interface IModelPlugin {
  /** Unique identifier for this plugin */
  id: string;
  /** Domain: 'physics', 'fraud', 'cost', 'classification' */
  domain: 'physics' | 'fraud' | 'cost' | 'classification';
  /** Semantic version of the trained model */
  version: string;
  /** Whether the model is trained and ready */
  isReady(): boolean;
  /** Run prediction. Returns null if model can't handle this input. */
  predict(input: Record<string, any>): Promise<Record<string, any> | null>;
  /** Model metadata for audit trail */
  metadata(): { trainedOn: string; accuracy: number; datasetSize: number };
}

/** Registry of ML model plugins */
const modelPlugins: Map<string, IModelPlugin> = new Map();

/** Register a trained ML model plugin */
export function registerPlugin(plugin: IModelPlugin): void {
  console.log(`🔌 Registered ML plugin: ${plugin.id} (${plugin.domain} v${plugin.version})`);
  modelPlugins.set(plugin.domain, plugin);
}

/** Get a registered plugin for a domain, if available and ready */
function getPlugin(domain: string): IModelPlugin | null {
  const plugin = modelPlugins.get(domain);
  if (plugin && plugin.isReady()) {
    return plugin;
  }
  return null;
}

// ============================================================
// VEHICLE PHYSICS CONSTANTS (TypeScript — no numpy needed)
// ============================================================

const VEHICLE_MASSES: Record<string, number> = {
  sedan: 1500, suv: 2000, truck: 2500, van: 1800, hatchback: 1200, coupe: 1400,
};

const TYPICAL_SPEEDS: Record<string, [number, number]> = {
  rear_end: [20, 60], side_impact: [30, 80], head_on: [40, 100],
  parking_lot: [5, 20], highway: [80, 120], rollover: [40, 100],
};

const SEVERITY_ENERGY_RANGES: Record<string, [number, number]> = {
  minor: [0, 50000], moderate: [50000, 150000], severe: [150000, 400000],
  total_loss: [400000, Infinity],
};

const EXPECTED_DAMAGE_LOCATIONS: Record<string, string[]> = {
  rear_end: ['rear'], side_impact: ['left_side', 'right_side'],
  head_on: ['front'], parking_lot: ['rear', 'front', 'left_side', 'right_side'],
  highway: ['front', 'rear'],
};

const GRAVITY = 9.81;
const CRUMPLE_DISTANCE = 0.5; // meters

// ============================================================
// INCIDENT TYPE CLASSIFICATION
// ============================================================

/** Non-collision incident types that should NOT use collision dynamics */
const NON_COLLISION_TYPES = new Set([
  'theft', 'break_in', 'vandalism', 'hijacking', 'forced_entry',
  'attempted_theft', 'fire', 'hail', 'flood', 'storm', 'falling_object',
  'animal_damage', 'malicious_damage', 'burglary',
]);

/** Keywords in accident descriptions that indicate non-collision incidents */
const NON_COLLISION_KEYWORDS: Record<string, string[]> = {
  break_in: ['broke into', 'break-in', 'break in', 'broken into', 'forced entry', 'forced open', 'pried open', 'smashed window', 'broke the window', 'broke window', 'jimmied', 'lock tampered', 'lock damaged', 'lock broken', 'key lock', 'locking system', 'burglary', 'burglar'],
  theft: ['stolen', 'theft', 'stole', 'missing', 'removed', 'took', 'stripped', 'looted', 'robbed'],
  vandalism: ['vandal', 'keyed', 'scratched deliberately', 'graffiti', 'malicious damage', 'intentional damage', 'slashed tire', 'smashed'],
  hijacking: ['hijack', 'carjack', 'gunpoint', 'held up', 'armed robbery', 'ambush'],
  fire: ['fire', 'arson', 'burnt', 'burned', 'engulfed', 'flames', 'combustion'],
  hail: ['hail', 'hailstorm', 'hail damage', 'dents from hail'],
  flood: ['flood', 'submerged', 'water damage', 'waterlogged', 'inundated'],
  storm: ['storm', 'wind damage', 'tree fell', 'branch fell', 'lightning'],
  animal_damage: ['animal', 'hit a deer', 'hit an animal', 'bird strike'],
  stationary: ['stationary', 'parked', 'was parked', 'standing still', 'not moving', 'vehicle was with'],
};

/** Expected damage patterns for non-collision incident types */
const NON_COLLISION_EXPECTED_DAMAGE: Record<string, { components: string[]; description: string }> = {
  break_in: { components: ['door lock', 'window', 'locking system', 'key lock', 'ignition', 'steering column', 'door handle'], description: 'Lock/window damage from forced entry' },
  theft: { components: ['door lock', 'window', 'ignition', 'steering column', 'wheels', 'battery', 'radio', 'catalytic converter'], description: 'Component removal or entry damage' },
  vandalism: { components: ['paint', 'body panel', 'window', 'mirror', 'tire', 'headlight', 'taillight'], description: 'Surface/cosmetic damage from deliberate acts' },
  hijacking: { components: ['door', 'window', 'mirror', 'body panel', 'ignition'], description: 'Forced entry and possible collision damage during escape' },
  fire: { components: ['engine', 'wiring', 'interior', 'paint', 'body panel', 'dashboard'], description: 'Heat/fire damage to vehicle systems' },
  hail: { components: ['roof', 'hood', 'trunk', 'body panel', 'windshield', 'window'], description: 'Dent patterns on horizontal surfaces' },
  flood: { components: ['engine', 'electrical', 'interior', 'carpet', 'seats', 'ECU'], description: 'Water ingress damage to electronics and interior' },
};

interface IncidentClassification {
  isCollision: boolean;
  incidentType: string;
  confidence: number;
  reasoning: string;
  vehicleWasStationary: boolean;
}

interface NarrativeValidation {
  isPlausible: boolean;
  narrativeScore: number; // 0-100
  deductions: string[];   // Logical deductions made
  concerns: string[];     // Issues found
  supports: string[];     // Evidence supporting the narrative
}

/**
 * Classify the incident type from the accident description.
 * Determines whether collision dynamics should be applied.
 */
function classifyIncidentType(
  accidentDescription: string,
  accidentType: string,
  damageDescription: string,
  damagedComponents: string[],
): IncidentClassification {
  const text = `${accidentDescription} ${damageDescription} ${damagedComponents.join(' ')}`.toLowerCase();
  
  // Check if the LLM already classified it as non-collision
  if (NON_COLLISION_TYPES.has(accidentType)) {
    return {
      isCollision: false,
      incidentType: accidentType,
      confidence: 0.95,
      reasoning: `Classified as non-collision incident type: ${accidentType}`,
      vehicleWasStationary: true,
    };
  }
  
  // Scan description for non-collision keywords
  let bestMatch = '';
  let bestScore = 0;
  let wasStationary = false;
  
  // Check for stationary vehicle indicators
  for (const keyword of NON_COLLISION_KEYWORDS.stationary) {
    if (text.includes(keyword)) {
      wasStationary = true;
      break;
    }
  }
  
  for (const [type, keywords] of Object.entries(NON_COLLISION_KEYWORDS)) {
    if (type === 'stationary') continue;
    let matchCount = 0;
    for (const keyword of keywords) {
      if (text.includes(keyword)) matchCount++;
    }
    if (matchCount > bestScore) {
      bestScore = matchCount;
      bestMatch = type;
    }
  }
  
  if (bestScore >= 2 || (bestScore >= 1 && wasStationary)) {
    return {
      isCollision: false,
      incidentType: bestMatch,
      confidence: Math.min(0.95, 0.6 + bestScore * 0.15),
      reasoning: `Description contains ${bestScore} keyword(s) indicating ${bestMatch.replace(/_/g, ' ')} incident${wasStationary ? '; vehicle was stationary' : ''}`,
      vehicleWasStationary: wasStationary,
    };
  }
  
  // Default: treat as collision
  return {
    isCollision: true,
    incidentType: accidentType || 'other',
    confidence: bestScore === 0 ? 0.8 : 0.5,
    reasoning: bestScore === 0 
      ? 'No non-collision indicators found; treating as collision'
      : `Weak non-collision signal (${bestScore} keyword); defaulting to collision analysis`,
    vehicleWasStationary: wasStationary,
  };
}

/**
 * Validate the claimant's narrative against physical evidence.
 * Cross-references the accident description with damage type, location, components, and cost.
 */
function validateNarrative(
  accidentDescription: string,
  damageDescription: string,
  damagedComponents: string[],
  incidentClassification: IncidentClassification,
  totalCost: number,
  marketValue: number,
  hasPoliceReport: boolean,
  hasPhotos: boolean,
): NarrativeValidation {
  const deductions: string[] = [];
  const concerns: string[] = [];
  const supports: string[] = [];
  let score = 70; // Start with a neutral-positive score
  
  const desc = `${accidentDescription} ${damageDescription}`.toLowerCase();
  const components = damagedComponents.map(c => c.toLowerCase());
  
  if (!incidentClassification.isCollision) {
    const expectedDamage = NON_COLLISION_EXPECTED_DAMAGE[incidentClassification.incidentType];
    
    if (expectedDamage) {
      // Check if damaged components match expected patterns for this incident type
      const matchingComponents = components.filter(c => 
        expectedDamage.components.some(exp => c.includes(exp) || exp.includes(c))
      );
      
      if (matchingComponents.length > 0) {
        supports.push(`Damaged components (${matchingComponents.join(', ')}) are consistent with ${incidentClassification.incidentType.replace(/_/g, ' ')} incident`);
        score += 10;
      } else if (components.length > 0) {
        concerns.push(`Damaged components (${components.join(', ')}) are not typical for ${incidentClassification.incidentType.replace(/_/g, ' ')} incidents. Expected: ${expectedDamage.components.join(', ')}`);
        score -= 15;
      }
      
      deductions.push(`${incidentClassification.incidentType.replace(/_/g, ' ')} incident typically causes: ${expectedDamage.description}`);
    }
    
    // For break-in/theft: check if narrative mentions stolen items
    if (['break_in', 'theft', 'attempted_theft'].includes(incidentClassification.incidentType)) {
      if (desc.includes('stole') || desc.includes('stolen') || desc.includes('missing') || desc.includes('took')) {
        supports.push('Narrative mentions stolen items, consistent with theft/break-in claim');
        score += 5;
      }
      if (desc.includes('police') || desc.includes('reported') || desc.includes('reference')) {
        supports.push('Incident was reported to police, adding credibility');
        score += 5;
      }
      // Break-in with only lock damage and low cost is very plausible
      if (totalCost < 1000 && components.some(c => c.includes('lock') || c.includes('door'))) {
        supports.push(`Low repair cost ($${totalCost}) is consistent with forced entry damage to locks/doors`);
        score += 10;
      }
    }
    
    // Stationary vehicle should NOT have collision-type damage
    if (incidentClassification.vehicleWasStationary) {
      deductions.push('Vehicle was stationary at time of incident — collision dynamics are not applicable');
      const collisionDamage = components.filter(c => 
        ['bumper', 'fender', 'radiator', 'grille', 'hood'].some(cd => c.includes(cd))
      );
      if (collisionDamage.length > 0 && !['vandalism', 'hail', 'storm'].includes(incidentClassification.incidentType)) {
        concerns.push(`Collision-type damage (${collisionDamage.join(', ')}) reported on a stationary vehicle during a ${incidentClassification.incidentType.replace(/_/g, ' ')} incident`);
        score -= 10;
      }
    }
  } else {
    // Collision-type validation
    if (incidentClassification.vehicleWasStationary) {
      concerns.push('Narrative indicates vehicle was stationary, but damage pattern suggests a collision');
      score -= 15;
    }
  }
  
  // General checks applicable to all incident types
  if (hasPoliceReport) {
    supports.push('Police report reference provided');
    score += 5;
  } else if (totalCost > 5000) {
    concerns.push('No police report for a high-value claim');
    score -= 5;
  }
  
  if (hasPhotos) {
    supports.push('Photographic evidence available');
    score += 5;
  } else {
    concerns.push('No photographic evidence provided');
    score -= 10;
  }
  
  // Cost vs market value check
  if (marketValue > 0 && totalCost > marketValue * 0.7) {
    concerns.push(`Repair cost ($${totalCost}) exceeds 70% of market value ($${marketValue}) — consider write-off`);
    score -= 5;
  }
  
  score = Math.max(0, Math.min(100, score));
  
  return {
    isPlausible: score >= 50,
    narrativeScore: score,
    deductions,
    concerns,
    supports,
  };
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/** Clean "null" strings from LLM output */
function cleanNullStrings(value: any): any {
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();
    if (trimmed === 'null' || trimmed === 'n/a' || trimmed === 'none' || trimmed === 'unknown' || trimmed === '') {
      return null;
    }
    return value;
  }
  return value;
}

/** Normalize damage location to general area */
function normalizeDamageLocation(loc: string): string {
  const lower = loc.toLowerCase();
  // Check rear BEFORE front because 'rear bumper' contains 'bumper' which would match front
  if (['rear', 'trunk', 'taillight', 'back'].some(x => lower.includes(x))) return 'rear';
  if (['front', 'bumper', 'hood', 'radiator', 'grille', 'headlight'].some(x => lower.includes(x))) return 'front';
  if (['left', 'driver'].some(x => lower.includes(x))) return 'left_side';
  if (['right', 'passenger'].some(x => lower.includes(x))) return 'right_side';
  if (['roof', 'top'].some(x => lower.includes(x))) return 'roof';
  return lower;
}

/** Determine vehicle type from model name */
function inferVehicleType(model: string): string {
  const lower = (model || '').toLowerCase();
  if (['ranger', 'hilux', 'truck', 'pickup', 'navara', 'triton', 'bt-50'].some(x => lower.includes(x))) return 'truck';
  if (['suv', 'fortuner', 'pajero', 'rav4', 'tucson', 'sportage', 'x-trail'].some(x => lower.includes(x))) return 'suv';
  if (['van', 'quantum', 'hiace', 'transporter'].some(x => lower.includes(x))) return 'van';
  if (['polo', 'jazz', 'swift', 'i20', 'fiesta'].some(x => lower.includes(x))) return 'hatchback';
  return 'sedan';
}

// ============================================================
// PHYSICS VALIDATION ENGINE (TypeScript — replaces Python)
// ============================================================

/**
 * Inline physics validation using collision dynamics.
 * Same formulas as physics_validator.py but runs natively in Node.js.
 * Uses: KE = 0.5mv², F = mΔv/Δt, a = v²/2d, G = a/9.81
 */
function validatePhysicsInline(
  vehicleType: string,
  accidentType: string,
  estimatedSpeed: number,
  damageSeverity: string,
  damageLocations: string[],
): PhysicsAnalysis {
  const flags: string[] = [];
  
  // 1. Calculate kinetic energy
  const vehicleMass = VEHICLE_MASSES[vehicleType.toLowerCase()] || 1500;
  const speedMs = estimatedSpeed / 3.6;
  const kineticEnergy = 0.5 * vehicleMass * (speedMs * speedMs);
  
  // 2. Validate speed vs damage severity
  const expectedRange = SEVERITY_ENERGY_RANGES[damageSeverity] || [0, Infinity];
  if (kineticEnergy < expectedRange[0] || kineticEnergy > expectedRange[1]) {
    flags.push(
      `MISMATCH: Reported ${damageSeverity} damage inconsistent with impact energy (${(kineticEnergy / 1000).toFixed(1)} kJ). Expected range: ${(expectedRange[0] / 1000).toFixed(1)}-${expectedRange[1] === Infinity ? '∞' : (expectedRange[1] / 1000).toFixed(1)} kJ`
    );
  }
  
  // 3. Validate damage location vs accident type
  const normalizedLocs = damageLocations.map(normalizeDamageLocation);
  const expectedLocs = EXPECTED_DAMAGE_LOCATIONS[accidentType] || [];
  if (expectedLocs.length > 0 && !normalizedLocs.some(loc => expectedLocs.includes(loc))) {
    flags.push(
      `IMPOSSIBLE DAMAGE PATTERN: ${accidentType} accident reported, but damage at ${damageLocations.join(', ')}. Expected damage at ${expectedLocs.join(', ')}`
    );
  }
  
  // 4. Calculate deceleration and G-force
  const deceleration = speedMs > 0 ? (speedMs * speedMs) / (2 * CRUMPLE_DISTANCE) : 0;
  const gForce = deceleration / GRAVITY;
  
  if (gForce > 50) {
    flags.push(`FATAL COLLISION: Calculated g-force (${gForce.toFixed(1)}g) suggests fatal or near-fatal impact. Verify occupant injuries reported.`);
  } else if (gForce > 20) {
    flags.push(`SEVERE IMPACT: Calculated g-force (${gForce.toFixed(1)}g) suggests serious injuries likely. Verify injury claims.`);
  }
  
  // 5. Validate speed vs accident type
  const typicalRange = TYPICAL_SPEEDS[accidentType] || [0, 200];
  if (estimatedSpeed < typicalRange[0] || estimatedSpeed > typicalRange[1]) {
    flags.push(`UNUSUAL SPEED: Reported speed (${estimatedSpeed} km/h) is atypical for ${accidentType} accidents. Typical range: ${typicalRange[0]}-${typicalRange[1]} km/h`);
  }
  
  // 6. Check impossible damage combinations
  if (normalizedLocs.includes('roof') && !['rollover', 'falling_object'].includes(accidentType)) {
    flags.push(`IMPOSSIBLE: Roof damage reported in ${accidentType} accident. Roof damage typically only occurs in rollovers or falling objects.`);
  }
  
  // 7. Calculate impact force (F = mv/t, contact time ~0.1s)
  const impactForce = vehicleMass * speedMs / 0.1;
  
  // 8. Calculate energy dissipation percentage dynamically
  // Based on: crumple zone efficiency (40-70%), damage severity, and vehicle type
  // Modern vehicles absorb 50-70% of KE through crumple zones
  // Higher severity = more energy absorbed by structure (less by crumple zone)
  let crumpleEfficiency = 0.60; // Base 60% for modern vehicles
  if (vehicleType === 'truck' || vehicleType === 'suv') crumpleEfficiency = 0.55; // Stiffer frames
  if (vehicleType === 'hatchback') crumpleEfficiency = 0.65; // More deformable
  
  // Severity adjustment: severe damage means crumple zone was overwhelmed
  if (damageSeverity === 'total_loss') crumpleEfficiency = 0.40; // Structure failed
  else if (damageSeverity === 'severe') crumpleEfficiency = 0.50;
  else if (damageSeverity === 'minor') crumpleEfficiency = 0.70; // Crumple zone handled it well
  
  const energyDissipated = kineticEnergy > 0 ? Math.round(crumpleEfficiency * 100) : 0;
  
  // 9. Confidence and consistency
  const confidence = Math.max(0, Math.min(1, 1.0 - (flags.length * 0.2)));
  const physicsScore = Math.round(confidence * 100);
  
  let damageConsistency = 'consistent';
  if (flags.some(f => f.includes('IMPOSSIBLE'))) damageConsistency = 'impossible';
  else if (flags.some(f => f.includes('MISMATCH') || f.includes('UNUSUAL'))) damageConsistency = 'inconsistent';
  else if (flags.length > 0) damageConsistency = 'questionable';
  
  const recommendations: string[] = [];
  if (flags.length > 0) {
    recommendations.push('Request additional photos of damage');
    recommendations.push('Interview driver for detailed accident description');
    recommendations.push('Request police report for independent verification');
    if (gForce > 20) recommendations.push('Verify medical records for occupant injuries');
  }
  
  return {
    is_valid: flags.length === 0,
    confidence,
    damageConsistency,
    flags,
    physics_analysis: {
      kinetic_energy_joules: kineticEnergy,
      vehicle_mass_kg: vehicleMass,
      impact_speed_ms: speedMs,
      deceleration_ms2: deceleration,
      g_force: gForce,
    },
    recommendations,
    impactSpeed: Math.round(estimatedSpeed),
    impactForce: Math.round(impactForce / 1000), // kN
    energyDissipated,
    deceleration: Math.round(gForce * 10) / 10,
    physicsScore,
  };
}

// ============================================================
// FRAUD DETECTION ENGINE (TypeScript — replaces Python)
// ============================================================

/**
 * Rule-based fraud scoring engine.
 * Same logic as fraud_ml_model.py's _rule_based_fraud_detection().
 * When a trained RandomForest model is available, register it as a
 * plugin and it will automatically take priority.
 */
function detectFraudInline(
  claimAmount: number,
  vehicleAge: number,
  previousClaimsCount: number,
  damageSeverityScore: number,
  physicsValidationScore: number,
  hasWitnesses: boolean,
  hasPoliceReport: boolean,
  hasPhotos: boolean,
  isHighValue: boolean,
  accidentType: string,
): { fraudProbability: number; riskLevel: string; topRiskFactors: string[]; recommendations: string[] } {
  let fraudScore = 0;
  const riskFactors: string[] = [];
  
  // High claim amount
  if (claimAmount > 10000) {
    fraudScore += 0.2;
    riskFactors.push('high_claim_amount');
  }
  
  // Multiple previous claims
  if (previousClaimsCount > 2) {
    fraudScore += 0.3;
    riskFactors.push('multiple_previous_claims');
  }
  
  // Low physics validation score
  if (physicsValidationScore < 0.5) {
    fraudScore += 0.4;
    riskFactors.push('failed_physics_validation');
  }
  
  // No witnesses or police report
  if (!hasWitnesses && !hasPoliceReport) {
    fraudScore += 0.2;
    riskFactors.push('no_independent_verification');
  }
  
  // No photos
  if (!hasPhotos) {
    fraudScore += 0.15;
    riskFactors.push('no_photographic_evidence');
  }
  
  // High value claim on old vehicle
  if (isHighValue && vehicleAge > 10) {
    fraudScore += 0.25;
    riskFactors.push('high_value_old_vehicle');
  }
  
  // Severe damage with low-speed accident type
  if (damageSeverityScore > 0.7 && accidentType === 'parking_lot') {
    fraudScore += 0.2;
    riskFactors.push('severe_damage_low_speed_scenario');
  }
  
  fraudScore = Math.min(1.0, fraudScore);
  
  const riskLevel = fraudScore < 0.3 ? 'low' : fraudScore < 0.6 ? 'medium' : fraudScore < 0.8 ? 'high' : 'critical';
  
  const recommendations: string[] = [];
  if (fraudScore > 0.5) {
    recommendations.push('Conduct in-person vehicle inspection');
    recommendations.push('Interview claimant and witnesses');
    recommendations.push('Request additional documentation');
  }
  if (fraudScore > 0.7) {
    recommendations.push('Escalate to fraud investigation team');
    recommendations.push('Consider claim denial pending investigation');
  }
  
  return { fraudProbability: fraudScore, riskLevel, topRiskFactors: riskFactors, recommendations };
}

// ============================================================
// MAIN ASSESSMENT PROCESSOR
// ============================================================

export async function processExternalAssessment(
  fileName: string,
  fileData: string | Buffer
): Promise<AssessmentResult> {
  const fileBuffer = typeof fileData === 'string' 
    ? Buffer.from(fileData, "base64")
    : fileData;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`📄 PROCESSING ASSESSMENT: ${fileName}`);
  console.log(`📦 File size: ${fileBuffer.length} bytes`);
  console.log(`🏗️ Architecture: LLM-First + TypeScript Fallback + ML-Ready Plugins`);
  console.log(`${'='.repeat(60)}`);

  // Upload PDF to S3
  const { url: pdfUrl } = await storagePut(
    `external-assessments/${nanoid()}-${fileName}`,
    fileBuffer,
    "application/pdf"
  );
  console.log(`✅ PDF uploaded to S3: ${pdfUrl}`);

  // Save PDF temporarily for local processing
  const tempPdfPath = join('/tmp', `assessment-${nanoid()}.pdf`);
  writeFileSync(tempPdfPath, fileBuffer);

  // ============================================================
  // STEP 1: Extract text from PDF (Node.js — no Python)
  // ============================================================
  console.log('\n📝 Step 1: Extracting text from PDF (Node.js pdf-parse)...');
  let extractedText = '';
  
  try {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(fileBuffer) });
    const textResult = await parser.getText();
    extractedText = textResult.text || '';
    await parser.destroy();
    console.log(`✅ Text extraction: ${extractedText.length} chars`);
  } catch (error: any) {
    console.error(`❌ Text extraction failed: ${error.message}`);
  }
  
  // If text extraction yielded very little, try LLM vision on the PDF directly
  if (extractedText.length < 100) {
    console.log('🔄 Low text yield — will rely on LLM vision for PDF content...');
  }

  // ============================================================
  // STEP 2: Extract structured data with LLM (text + PDF vision)
  // ============================================================
  console.log('\n🤖 Step 2: Extracting structured data with LLM...');
  
  // Build message content — use text if available, plus PDF vision
  const userContent: any[] = [];
  
  if (extractedText.length > 50) {
    userContent.push({
      type: "text",
      text: `Extract ALL information from this vehicle damage assessment report.

CRITICAL: Extract every cost figure mentioned. Look for original quotes, agreed costs, market values, savings, excess amounts, betterment, assessor names, repairer names.

=== DOCUMENT TEXT ===
${extractedText}
=== END DOCUMENT ===`
    });
  }
  
  // Always include the PDF file for vision analysis
  userContent.push({
    type: "file_url",
    file_url: {
      url: pdfUrl,
      mime_type: "application/pdf" as const,
    }
  });
  
  if (extractedText.length <= 50) {
    userContent.push({
      type: "text",
      text: "Extract ALL information from this vehicle damage assessment report PDF. The text extraction yielded minimal results, so please read the PDF visually. Extract every cost figure, vehicle details, claimant info, damage descriptions, and assessor/repairer names."
    });
  }

  const extractionResponse = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are an expert at extracting structured data from vehicle damage assessment reports. 
Extract ALL available information with precision. For missing fields, return empty string "" (not "null").

CRITICAL COST EXTRACTION RULES:
- Extract EVERY cost figure mentioned anywhere in the document
- "Original Repairer Quote" or "Repairer's Estimate" = originalQuote
- "Agreed Cost" or "Final Cost" or "Negotiated Amount" = agreedCost  
- "Market Value" or "Retail Value" = marketValue
- "Savings" or "Reduction" = savings (difference between original and agreed)
- "Excess" or "Deductible" = excessAmount
- "Betterment" or "Depreciation" = betterment
- For estimatedCost, use the AGREED cost if available, otherwise the original quote
- Extract assessor name and repairer/panel beater name

For itemized costs, extract EVERY line item you can find - labor items, parts, materials, paint, sublet work.
If no individual line items exist but a total cost is given, estimate a reasonable breakdown:
- For side impacts: ~35% labor, ~40% parts, ~15% paint, ~10% materials
- For rear-end: ~30% labor, ~50% parts, ~10% paint, ~10% materials  
- For head-on: ~35% labor, ~45% parts, ~10% paint, ~10% materials
Always populate costBreakdown with estimated category totals that sum to the total cost.
For damagedComponents, infer from damage description (e.g., 'left handside' = left fender, left door, left mirror, left quarter panel).`
      },
      {
        role: "user",
        content: userContent
      }
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "assessment_extraction",
        strict: true,
        schema: {
          type: "object",
          properties: {
            vehicleMake: { type: "string" },
            vehicleModel: { type: "string" },
            vehicleYear: { type: "integer" },
            vehicleRegistration: { type: "string" },
            vehicleMass: { type: "string" },
            claimantName: { type: "string" },
            accidentDate: { type: "string" },
            accidentLocation: { type: "string" },
            accidentDescription: { type: "string" },
            policeReportReference: { type: "string" },
            damageDescription: { type: "string" },
            damageLocation: { type: "string" },
            estimatedCost: { type: "number", description: "Use agreed cost if available, otherwise original quote" },
            originalQuote: { type: "number", description: "Original repairer quote/estimate before negotiation" },
            agreedCost: { type: "number", description: "Final agreed cost after assessment/negotiation" },
            marketValue: { type: "number", description: "Vehicle market/retail value" },
            savings: { type: "number", description: "Savings amount (original - agreed)" },
            excessAmount: { type: "number", description: "Insurance excess/deductible amount" },
            betterment: { type: "number", description: "Betterment/depreciation amount" },
            assessorName: { type: "string", description: "Name of the assessor or assessment company" },
            repairerName: { type: "string", description: "Name of the repair shop or panel beater" },
            estimatedSpeed: { type: "number", description: "Estimated impact speed km/h. For non-collision incidents (theft, break-in, vandalism, fire, hail, flood), set to 0. Only infer speed for actual vehicle collisions." },
            accidentType: { type: "string", description: "Classify the incident type. Collision types: rear_end, side_impact, head_on, parking_lot, highway, rollover. Non-collision types: theft, break_in, vandalism, hijacking, forced_entry, attempted_theft, fire, hail, flood, storm, falling_object, animal_damage. Use 'other' only if none of these fit. IMPORTANT: Read the accident description carefully - if it describes a break-in, theft, vandalism, or any non-collision event, classify accordingly even if the LLM extraction schema defaults to collision types." },
            damagedComponents: { 
              type: "array",
              items: { type: "string" },
              description: "List of ALL damaged parts/components mentioned or inferred"
            },
            itemizedCosts: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  description: { type: "string", description: "Component or work description" },
                  amount: { type: "number", description: "Cost amount" },
                  category: { type: "string", description: "One of: labor, parts, materials, paint, sublet, other" }
                },
                required: ["description", "amount", "category"],
                additionalProperties: false
              },
              description: "Every individual cost line item from the assessment"
            },
            costBreakdown: {
              type: "object",
              properties: {
                labor: { type: "number" },
                parts: { type: "number" },
                materials: { type: "number" },
                paint: { type: "number" },
                sublet: { type: "number" },
                other: { type: "number" }
              },
              required: ["labor", "parts", "materials", "paint", "sublet", "other"],
              additionalProperties: false,
              description: "Summary totals by category - MUST sum to the total cost"
            }
          },
          required: ["vehicleMake", "vehicleModel", "vehicleYear", "vehicleRegistration"],
          additionalProperties: false
        }
      }
    }
  });

  const llmRawContent = (extractionResponse.choices[0].message.content as string) || "{}";
  const rawExtractedData = JSON.parse(llmRawContent);
  
  // Clean null strings
  const extractedData: any = {};
  for (const [key, value] of Object.entries(rawExtractedData)) {
    if (typeof value === 'string') {
      extractedData[key] = cleanNullStrings(value) || '';
    } else if (Array.isArray(value)) {
      extractedData[key] = value;
    } else if (typeof value === 'object' && value !== null) {
      extractedData[key] = value;
    } else {
      extractedData[key] = value;
    }
  }
  
  console.log('\n📋 EXTRACTED DATA:');
  console.log(`  Vehicle: ${extractedData.vehicleMake} ${extractedData.vehicleModel} ${extractedData.vehicleYear}`);
  console.log(`  Registration: ${extractedData.vehicleRegistration}`);
  console.log(`  Claimant: ${extractedData.claimantName || 'NOT FOUND'}`);
  console.log(`  Original Quote: $${extractedData.originalQuote || 'NOT FOUND'}`);
  console.log(`  Agreed Cost: $${extractedData.agreedCost || 'NOT FOUND'}`);
  console.log(`  Market Value: $${extractedData.marketValue || 'NOT FOUND'}`);
  console.log(`  Savings: $${extractedData.savings || 'NOT FOUND'}`);
  console.log(`  Assessor: ${extractedData.assessorName || 'NOT FOUND'}`);
  console.log(`  Repairer: ${extractedData.repairerName || 'NOT FOUND'}`);
  console.log(`  Itemized Costs: ${extractedData.itemizedCosts?.length || 0} items`);
  console.log(`  Damaged Components: ${extractedData.damagedComponents?.length || 0} items`);

  // Track data quality
  const missingData: string[] = [];
  const dataQuality: Record<string, boolean> = {
    hasClaimant: !!extractedData.claimantName,
    hasAccidentDetails: !!(extractedData.accidentDescription || extractedData.accidentDate),
    hasSpeed: !!extractedData.estimatedSpeed,
    hasCost: !!extractedData.estimatedCost,
    hasItemizedCosts: !!(extractedData.itemizedCosts && extractedData.itemizedCosts.length > 0),
    hasDamageLocation: !!extractedData.damageLocation,
    hasPoliceReport: !!extractedData.policeReportReference,
    hasDamagedComponents: !!(extractedData.damagedComponents && extractedData.damagedComponents.length > 0),
    hasMarketValue: !!extractedData.marketValue,
    hasPhotos: false, // Will be updated after image classification
  };
  
  for (const [key, has] of Object.entries(dataQuality)) {
    if (!has) {
      const label = key.replace('has', '').replace(/([A-Z])/g, ' $1').trim();
      missingData.push(label);
    }
  }

  const completeness = Math.round((Object.values(dataQuality).filter(v => v).length / Object.keys(dataQuality).length) * 100);
  console.log(`📊 Data Completeness: ${completeness}%`);

  // ============================================================
  // STEP 3: Extract actual images from PDF and classify via LLM
  // ============================================================
  console.log('\n🖼️ Step 3: Extracting and classifying images from PDF...');
  let damagePhotoUrls: string[] = [];
  let allPhotos: PhotoWithClassification[] = [];
  
  try {
    // Step 3a: Extract actual images from PDF using pdfimages + sharp
    const { extractImagesFromPDFBuffer } = await import('./pdf-image-extractor');
    const extractedImages = await extractImagesFromPDFBuffer(fileBuffer, fileName);
    
    console.log(`📸 Extracted ${extractedImages.length} images from PDF`);
    
    if (extractedImages.length > 0) {
      // Step 3b: Use LLM to classify each extracted image as damage_photo or document
      // Build image content for LLM classification
      const imageContents: any[] = extractedImages.slice(0, 20).map((img, idx) => ({
        type: "image_url" as const,
        image_url: { url: img.url, detail: "low" as const }
      }));
      
      imageContents.push({
        type: "text" as const,
        text: `I've shown you ${imageContents.length} images extracted from a vehicle damage assessment PDF report.\n\nFor each image (numbered 1 to ${imageContents.length}), classify it into one of these categories:\n- 'damage_photo': An actual photograph of the vehicle showing damage, vehicle exterior/interior, accident scene, or the vehicle itself. These are real photographs taken with a camera.\n- 'document': A scanned document page, form, letterhead, logo, stamp, signature, diagram, table, chart, or any non-photographic content.\n\nIMPORTANT: If an image shows a real photograph of a vehicle (even if damage is not clearly visible), classify it as 'damage_photo'. Only classify as 'document' if it is clearly a non-photographic element like a form, logo, or text document.\n\nAlso provide a brief description of what each image shows and an overall summary of all visible damage across all photos.`
      });
      
      try {
        const classifyResponse = await invokeLLM({
          messages: [
            {
              role: "system",
              content: "You are an expert vehicle damage image classifier. You analyze images extracted from insurance assessment PDFs and classify them as either actual vehicle photographs or document elements. Be generous in classifying photos - if it looks like a real photograph of a vehicle or vehicle part, classify it as damage_photo. Respond with JSON only."
            },
            {
              role: "user",
              content: imageContents
            }
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "image_classification",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  classifications: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        imageIndex: { type: "integer", description: "1-based index of the image" },
                        classification: { type: "string", description: "damage_photo or document" },
                        description: { type: "string", description: "Brief description of what the image shows" },
                        detectedDamageArea: { type: "string", description: "Primary damage area visible, e.g. 'Front bumper and bonnet deformation'" },
                        impactZone: { type: "string", description: "Primary impact zone: front, rear, left, right, roof, undercarriage, or unknown" },
                        detectedComponents: {
                          type: "array",
                          description: "List of damaged components visible in this photo",
                          items: {
                            type: "object",
                            properties: {
                              name: { type: "string", description: "Component name, e.g. Front Bumper" },
                              severity: { type: "string", description: "minor, moderate, severe, or total_loss" },
                              zone: { type: "string", description: "front, rear, left, right, roof, undercarriage, interior, or unknown" }
                            },
                            required: ["name", "severity", "zone"],
                            additionalProperties: false
                          }
                        }
                      },
                      required: ["imageIndex", "classification", "description", "detectedDamageArea", "impactZone", "detectedComponents"],
                      additionalProperties: false
                    }
                  },
                  overallDamageAssessment: { type: "string", description: "Summary of all visible damage" }
                },
                required: ["classifications", "overallDamageAssessment"],
                additionalProperties: false
              }
            }
          }
        });
        
        const classData = JSON.parse(classifyResponse.choices[0].message.content as string);
        
        // Map classifications to extracted images
        for (const cls of classData.classifications) {
          const imgIdx = cls.imageIndex - 1; // Convert to 0-based
          if (imgIdx >= 0 && imgIdx < extractedImages.length) {
            const img = extractedImages[imgIdx];
            const classification = cls.classification === 'damage_photo' ? 'damage_photo' : 'document';
            
            allPhotos.push({
              url: img.url,
              classification: classification as 'damage_photo' | 'document',
              page: img.pageNumber,
              caption: cls.description || '',
              detectedDamageArea: cls.detectedDamageArea || '',
              impactZone: cls.impactZone || 'unknown',
              detectedComponents: cls.detectedComponents || [],
              source: img.source === 'embedded_image' ? 'pdf_embedded' : 'pdf_page_render',
              overallAssessment: classData.overallDamageAssessment || '',
            });
            
            if (classification === 'damage_photo') {
              damagePhotoUrls.push(img.url);
            }
          }
        }
        
        // Any unclassified images default to damage_photo (better to show than hide)
        for (let i = 0; i < extractedImages.length; i++) {
          const alreadyClassified = allPhotos.some(p => p.url === extractedImages[i].url);
          if (!alreadyClassified) {
            allPhotos.push({
              url: extractedImages[i].url,
              classification: 'damage_photo',
              page: extractedImages[i].pageNumber,
              caption: `Page ${extractedImages[i].pageNumber} — vehicle damage photo`,
              detectedDamageArea: 'Vehicle damage',
              impactZone: 'unknown',
              detectedComponents: [],
              source: extractedImages[i].source === 'embedded_image' ? 'pdf_embedded' : 'pdf_page_render',
            });
            damagePhotoUrls.push(extractedImages[i].url);
          }
        }
        
        const damageCount = allPhotos.filter(p => p.classification === 'damage_photo').length;
        const docCount = allPhotos.filter(p => p.classification === 'document').length;
        console.log(`📸 Classified: ${damageCount} damage photos, ${docCount} document images`);
        
        if (classData.overallDamageAssessment) {
          console.log(`🔍 Damage summary: ${classData.overallDamageAssessment.substring(0, 200)}`);
        }
        
      } catch (classifyError: any) {
        console.warn(`⚠️ LLM classification failed, treating all images as damage photos: ${classifyError.message}`);
        // Fallback: treat all extracted images as damage photos
        for (const img of extractedImages) {
          allPhotos.push({
            url: img.url,
            classification: 'damage_photo',
            page: img.pageNumber,
            caption: `Page ${img.pageNumber} — vehicle damage photo`,
            detectedDamageArea: 'Vehicle damage',
            impactZone: 'unknown',
            detectedComponents: [],
            source: img.source === 'embedded_image' ? 'pdf_embedded' : 'pdf_page_render',
          });
          damagePhotoUrls.push(img.url);
        }
      }
      
      // Update data quality
      dataQuality.hasPhotos = true;
      const photosIdx = missingData.indexOf(' Photos');
      if (photosIdx >= 0) missingData.splice(photosIdx, 1);
    } else {
      console.log('⚠️ No images could be extracted from PDF');
    }
    
  } catch (error: any) {
    console.warn(`⚠️ Image extraction failed: ${error.message}`);
  }

  // Deduplicate damage photo URLs
  damagePhotoUrls = Array.from(new Set(damagePhotoUrls));

  // ============================================================
  // STEP 4: Generate component repair/replace recommendations
  // ============================================================
  console.log('\n🔧 Step 4: Generating component repair/replace recommendations...');
  let componentRecommendations: ComponentRecommendation[] = [];
  
  const components = extractedData.damagedComponents || [];
  const totalCost = extractedData.agreedCost || extractedData.estimatedCost || 0;
  
  if (components.length > 0 && totalCost > 0) {
    try {
      const recResponse = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `You are an expert vehicle damage assessor. For each damaged component, recommend whether to REPAIR or REPLACE based on damage severity and cost-effectiveness. Be realistic with costs and labor hours.`
          },
          {
            role: "user",
            content: `Vehicle: ${extractedData.vehicleMake} ${extractedData.vehicleModel} ${extractedData.vehicleYear}
Accident type: ${extractedData.accidentType || 'unknown'}
Total agreed cost: $${totalCost}
Damage description: ${extractedData.damageDescription || extractedData.damageLocation || 'unknown'}

Damaged components: ${components.join(', ')}

For EACH component, provide repair vs replace recommendation. The sum of all component costs should approximately equal the total cost of $${totalCost}.`
          }
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "component_recommendations",
            strict: true,
            schema: {
              type: "object",
              properties: {
                recommendations: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      component: { type: "string", description: "Component name" },
                      action: { type: "string", description: "Either 'repair' or 'replace'" },
                      severity: { type: "string", description: "Either 'minor', 'moderate', or 'severe'" },
                      estimatedCost: { type: "number", description: "Estimated cost for this component" },
                      laborHours: { type: "number", description: "Estimated labor hours" },
                      reasoning: { type: "string", description: "Brief explanation for the recommendation" }
                    },
                    required: ["component", "action", "severity", "estimatedCost", "laborHours", "reasoning"],
                    additionalProperties: false
                  }
                }
              },
              required: ["recommendations"],
              additionalProperties: false
            }
          }
        }
      });
      
      const recData = JSON.parse(recResponse.choices[0].message.content as string);
      componentRecommendations = (recData.recommendations || []).map((r: any) => ({
        ...r,
        action: r.action === 'replace' ? 'replace' : 'repair',
        severity: ['minor', 'moderate', 'severe'].includes(r.severity) ? r.severity : 'moderate'
      }));
      
      console.log(`✅ Generated ${componentRecommendations.length} component recommendations`);
      for (const rec of componentRecommendations) {
        console.log(`   ${rec.component}: ${rec.action.toUpperCase()} ($${rec.estimatedCost}, ${rec.laborHours}h, ${rec.severity})`);
      }
    } catch (error: any) {
      console.warn(`⚠️ Component recommendations failed: ${error.message}`);
    }
  }

  // ============================================================
  // STEP 5: Incident Classification + Physics Validation
  // ============================================================
  console.log('\n⚛️ Step 5: Classifying incident type and running physics validation...');
  let physicsAnalysis: PhysicsAnalysis;
  
  const vehicleType = inferVehicleType(extractedData.vehicleModel || '');
  const damageSeverity = totalCost > 8000 ? 'severe' : totalCost > 3000 ? 'moderate' : 'minor';
  const damageLocations = components.length > 0 ? components : [extractedData.damageLocation || 'unknown'];
  
  // Classify incident type from description BEFORE applying physics
  const incidentClassification = classifyIncidentType(
    extractedData.accidentDescription || '',
    extractedData.accidentType || 'other',
    extractedData.damageDescription || '',
    extractedData.damagedComponents || [],
  );
  
  console.log(`🏷️ Incident classification: ${incidentClassification.incidentType} (collision=${incidentClassification.isCollision}, confidence=${incidentClassification.confidence.toFixed(2)})`);
  console.log(`   Reasoning: ${incidentClassification.reasoning}`);
  console.log(`   Vehicle stationary: ${incidentClassification.vehicleWasStationary}`);
  
  // Run narrative validation
  const narrativeValidation = validateNarrative(
    extractedData.accidentDescription || '',
    extractedData.damageDescription || '',
    extractedData.damagedComponents || [],
    incidentClassification,
    totalCost,
    extractedData.marketValue || 0,
    !!extractedData.policeReportReference,
    damagePhotoUrls.length > 0,
  );
  
  console.log(`📝 Narrative validation: score=${narrativeValidation.narrativeScore}/100, plausible=${narrativeValidation.isPlausible}`);
  for (const d of narrativeValidation.deductions) console.log(`   Deduction: ${d}`);
  for (const s of narrativeValidation.supports) console.log(`   ✅ Support: ${s}`);
  for (const c of narrativeValidation.concerns) console.log(`   ⚠️ Concern: ${c}`);
  
  // Determine speed based on incident type
  let estimatedSpeed = extractedData.estimatedSpeed || 0;
  if (incidentClassification.isCollision) {
    // Only infer speed for actual collisions
    if (!estimatedSpeed) {
      const speedByType: Record<string, number> = {
        parking_lot: 15, rear_end: 40, side_impact: 55, head_on: 70, highway: 100
      };
      estimatedSpeed = speedByType[extractedData.accidentType || ''] || 50;
    }
  } else {
    // Non-collision: speed is 0 (vehicle was stationary or not in motion)
    estimatedSpeed = 0;
    console.log(`   ⏸️ Speed set to 0 km/h (non-collision incident: ${incidentClassification.incidentType})`);
  }
  
  if (!incidentClassification.isCollision) {
    // ============================================================
    // NON-COLLISION PHYSICS: Skip collision dynamics entirely
    // ============================================================
    console.log(`🔧 Using non-collision validation for ${incidentClassification.incidentType} incident...`);
    
    try {
      const nonCollisionResponse = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `You are a vehicle damage assessment expert specializing in non-collision incidents. You analyze whether the reported damage is consistent with the described incident type.

IMPORTANT: This is NOT a vehicle collision. Do NOT apply collision dynamics (kinetic energy, impact force, g-force). Instead, evaluate:
- Whether the damaged components are consistent with the incident type
- Whether the damage description matches what would be expected
- Whether the repair cost is reasonable for this type of damage
- Whether the narrative is internally consistent

Incident types and expected damage patterns:
- break_in/forced_entry: Lock damage, window damage, door handle damage, ignition damage
- theft: Missing components, entry damage, ignition/steering column damage
- vandalism: Surface damage, paint scratches, broken windows/mirrors
- fire: Heat damage, melted components, smoke damage
- hail: Dent patterns on horizontal surfaces (roof, hood, trunk)
- flood: Water damage to electronics, interior, engine

Be fair and objective. Most claims are legitimate.`
          },
          {
            role: "user",
            content: `Analyze this non-collision incident:
Incident type: ${incidentClassification.incidentType.replace(/_/g, ' ')}
Vehicle: ${extractedData.vehicleMake} ${extractedData.vehicleModel} ${extractedData.vehicleYear}
Accident description: ${extractedData.accidentDescription || 'Not provided'}
Damage description: ${extractedData.damageDescription || 'Not provided'}
Damaged components: ${damageLocations.join(', ')}
Total repair cost: $${totalCost}
Police report: ${extractedData.policeReportReference ? 'Yes (' + extractedData.policeReportReference + ')' : 'No'}
Photos available: ${damagePhotoUrls.length > 0 ? 'Yes' : 'No'}
Vehicle was stationary: ${incidentClassification.vehicleWasStationary ? 'Yes' : 'Unknown'}`
          }
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "non_collision_analysis",
            strict: true,
            schema: {
              type: "object",
              properties: {
                damageConsistency: { type: "string", description: "consistent, inconsistent, questionable, or impossible" },
                physicsScore: { type: "integer", description: "Plausibility score 0-100. Score should reflect whether damage matches the incident type, NOT collision dynamics." },
                confidence: { type: "number", description: "Confidence in analysis 0-1" },
                is_valid: { type: "boolean", description: "Whether the damage is consistent with the described incident" },
                flags: { type: "array", items: { type: "string" }, description: "Any concerns or inconsistencies. Do NOT flag collision-related issues for non-collision incidents." },
                analysis_notes: { type: "string", description: "Detailed analysis of damage vs incident type consistency" }
              },
              required: ["damageConsistency", "physicsScore", "confidence", "is_valid", "flags", "analysis_notes"],
              additionalProperties: false
            }
          }
        }
      });
      
      const llmResult = JSON.parse(nonCollisionResponse.choices[0].message.content as string);
      
      physicsAnalysis = {
        is_valid: llmResult.is_valid,
        confidence: llmResult.confidence,
        damageConsistency: llmResult.damageConsistency,
        flags: llmResult.flags || [],
        physics_analysis: {
          kinetic_energy_joules: 0,
          vehicle_mass_kg: VEHICLE_MASSES[vehicleType] || 1500,
          impact_speed_ms: 0,
          deceleration_ms2: 0,
          g_force: 0,
        },
        recommendations: [],
        impactSpeed: 0,
        impactForce: 0,
        energyDissipated: 0,
        deceleration: 0,
        physicsScore: llmResult.physicsScore,
      };
      
      // Add narrative validation concerns as physics flags if relevant
      for (const concern of narrativeValidation.concerns) {
        if (!physicsAnalysis.flags.some(f => f.includes(concern.substring(0, 30)))) {
          physicsAnalysis.flags.push(concern);
        }
      }
      
      console.log(`✅ Non-collision validation: Valid=${physicsAnalysis.is_valid}, Score=${physicsAnalysis.physicsScore}/100`);
      
    } catch (error: any) {
      console.warn(`⚠️ Non-collision LLM analysis failed: ${error.message}, using narrative validation...`);
      
      // Fallback: use narrative validation score directly
      physicsAnalysis = {
        is_valid: narrativeValidation.isPlausible,
        confidence: 0.6,
        damageConsistency: narrativeValidation.isPlausible ? 'consistent' : 'questionable',
        flags: [...narrativeValidation.concerns],
        physics_analysis: {
          kinetic_energy_joules: 0,
          vehicle_mass_kg: VEHICLE_MASSES[vehicleType] || 1500,
          impact_speed_ms: 0,
          deceleration_ms2: 0,
          g_force: 0,
        },
        recommendations: [],
        impactSpeed: 0,
        impactForce: 0,
        energyDissipated: 0,
        deceleration: 0,
        physicsScore: narrativeValidation.narrativeScore,
      };
      
      console.log(`✅ Non-collision validation (fallback): Valid=${physicsAnalysis.is_valid}, Score=${physicsAnalysis.physicsScore}/100`);
    }
    
  } else {
    // ============================================================
    // COLLISION PHYSICS: Full collision dynamics analysis
    // ============================================================
    
    // Try ML plugin first (future trained models)
    const physicsPlugin = getPlugin('physics');
    if (physicsPlugin) {
      console.log(`🔌 Using ML plugin: ${physicsPlugin.id} v${physicsPlugin.version}`);
      try {
        const pluginResult = await physicsPlugin.predict({
          vehicle_type: vehicleType,
          accident_type: extractedData.accidentType || 'other',
          estimated_speed: estimatedSpeed,
          damage_severity: damageSeverity,
          damage_locations: damageLocations,
        });
        if (pluginResult) {
          physicsAnalysis = pluginResult as unknown as PhysicsAnalysis;
          console.log(`✅ ML plugin physics: Valid=${physicsAnalysis.is_valid}, Score=${physicsAnalysis.physicsScore}/100`);
        } else {
          throw new Error('Plugin returned null');
        }
      } catch (error: any) {
        console.warn(`⚠️ ML plugin failed: ${error.message}, falling back to LLM...`);
        physicsPlugin === null;
      }
    }
    
    if (!physicsPlugin || !physicsAnalysis!) {
      try {
        const physicsResponse = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are a vehicle accident physics expert and forensic engineer. Analyze the collision scenario using physics principles:
- Kinetic energy: KE = 0.5 × mass × velocity²
- Impact force: F = mass × Δv / contact_time
- G-force: deceleration / 9.81
- Validate damage patterns against accident type
- Check if reported damage is physically consistent with the scenario
Be precise with calculations. Flag any physical impossibilities or inconsistencies.`
            },
            {
              role: "user",
              content: `Analyze this collision scenario:
Vehicle: ${extractedData.vehicleMake} ${extractedData.vehicleModel} (${vehicleType}, ~${VEHICLE_MASSES[vehicleType] || 1500}kg)
Accident type: ${extractedData.accidentType || 'unknown'}
Estimated speed: ~${estimatedSpeed} km/h
Damage severity: ${damageSeverity}
Damage locations: ${damageLocations.join(', ')}
Damage description: ${extractedData.damageDescription || extractedData.accidentDescription || 'unknown'}
Total repair cost: $${totalCost}`
            }
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "physics_analysis",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  impactSpeed: { type: "number", description: "Impact speed in km/h" },
                  impactForce: { type: "number", description: "Impact force in kN" },
                  energyDissipated: { type: "number", description: "Energy dissipation percentage 0-100" },
                  deceleration: { type: "number", description: "G-force experienced" },
                  damageConsistency: { type: "string", description: "consistent, inconsistent, questionable, or impossible" },
                  physicsScore: { type: "integer", description: "Physics plausibility score 0-100" },
                  confidence: { type: "number", description: "Confidence in analysis 0-1" },
                  is_valid: { type: "boolean", description: "Whether the scenario is physically plausible" },
                  flags: { type: "array", items: { type: "string" }, description: "Any physics flags or warnings" },
                  analysis_notes: { type: "string", description: "Detailed analysis explanation" }
                },
                required: ["impactSpeed", "impactForce", "energyDissipated", "deceleration", "damageConsistency", "physicsScore", "confidence", "is_valid", "flags", "analysis_notes"],
                additionalProperties: false
              }
            }
          }
        });
        
        const llmPhysics = JSON.parse(physicsResponse.choices[0].message.content as string);
        const inlinePhysics = validatePhysicsInline(vehicleType, extractedData.accidentType || 'other', estimatedSpeed, damageSeverity, damageLocations);
        
        physicsAnalysis = {
          is_valid: llmPhysics.is_valid,
          confidence: llmPhysics.confidence,
          damageConsistency: llmPhysics.damageConsistency,
          flags: [...(llmPhysics.flags || []), ...inlinePhysics.flags.filter(f => !llmPhysics.flags?.some((lf: string) => lf.includes(f.substring(0, 20))))],
          physics_analysis: inlinePhysics.physics_analysis,
          recommendations: inlinePhysics.recommendations,
          impactSpeed: llmPhysics.impactSpeed || inlinePhysics.impactSpeed,
          impactForce: llmPhysics.impactForce || inlinePhysics.impactForce,
          energyDissipated: llmPhysics.energyDissipated || inlinePhysics.energyDissipated,
          deceleration: llmPhysics.deceleration || inlinePhysics.deceleration,
          physicsScore: llmPhysics.physicsScore,
        };
        
        console.log(`✅ Collision physics (LLM + TypeScript): Valid=${physicsAnalysis.is_valid}, Score=${physicsAnalysis.physicsScore}/100`);
        
      } catch (error: any) {
        console.warn(`⚠️ LLM physics failed: ${error.message}, using TypeScript fallback...`);
        physicsAnalysis = validatePhysicsInline(vehicleType, extractedData.accidentType || 'other', estimatedSpeed, damageSeverity, damageLocations);
        console.log(`✅ Collision physics (TypeScript): Valid=${physicsAnalysis.is_valid}, Score=${physicsAnalysis.physicsScore}/100`);
      }
    }
  }

  // ============================================================
  // QUANTITATIVE PHYSICS EXTENSION
  // ============================================================
  console.log('\n⚙️ Activating Quantitative Physics Engine...');
  
  try {
    // Determine primary impact zone from accident type
    const primaryImpactZone = extractedData.accidentType === 'frontal' 
      ? 'front_center' 
      : extractedData.accidentType === 'rear' 
      ? 'rear_center' 
      : extractedData.accidentType === 'side' 
      ? 'left_side' 
      : 'front_center'; // Default to front
    
    const impactAngleDegrees = calculateImpactAngleDegrees(primaryImpactZone);
    const impactLocationNormalized = calculateImpactLocationNormalized(primaryImpactZone);
    
    // Generate quantitative physics data
    const quantitativePhysics = extendPhysicsValidationOutput({
      impactForce: physicsAnalysis.physics_analysis?.impact_force_n 
        ? { magnitude: physicsAnalysis.physics_analysis.impact_force_n, duration: 0.05 } 
        : undefined,
      impactAngle: impactAngleDegrees,
      primaryImpactZone,
      damagedComponents: normalizedComponents.map((nc: { raw: string; normalized: string }) => ({ 
        name: nc.normalized, 
        location: nc.normalized 
      })),
      accidentType: extractedData.accidentType as any,
      estimatedSpeed: { value: physicsAnalysis.impactSpeed || 0 },
      damageConsistency: { score: physicsAnalysis.physicsScore || 50 },
      mass: extractedData.vehicleMass,
      crushDepth: 0.3, // Default crush depth estimate
    });
    
    // Merge quantitative physics into physicsAnalysis
    physicsAnalysis = {
      ...physicsAnalysis,
      ...quantitativePhysics,
      quantitativeMode: true,
    };
    
    console.log(`✅ [Physics] Quantitative Mode Activated`);
    console.log(`   Impact Angle: ${quantitativePhysics.impactAngleDegrees}°`);
    console.log(`   Impact Force: ${quantitativePhysics.calculatedImpactForceKN.toFixed(2)} kN`);
    console.log(`   Impact Location: (${quantitativePhysics.impactLocationNormalized.relativeX.toFixed(2)}, ${quantitativePhysics.impactLocationNormalized.relativeY.toFixed(2)})`);
    
  } catch (error: any) {
    console.warn(`⚠️ Quantitative physics extension failed: ${error.message}`);
    console.warn(`   Falling back to legacy qualitative structure`);
    
    // Fallback: Add minimal quantitative fields
    const primaryImpactZone = extractedData.accidentType === 'frontal' 
      ? 'front_center' 
      : extractedData.accidentType === 'rear' 
      ? 'rear_center' 
      : extractedData.accidentType === 'side' 
      ? 'left_side' 
      : 'front_center';
    
    physicsAnalysis = {
      ...physicsAnalysis,
      impactAngleDegrees: calculateImpactAngleDegrees(primaryImpactZone),
      calculatedImpactForceKN: physicsAnalysis.impactForce ? physicsAnalysis.impactForce / 1000 : 0.0,
      impactLocationNormalized: calculateImpactLocationNormalized(primaryImpactZone),
      quantitativeMode: false, // Fallback mode
    };
  }

  // ============================================================
  // STEP 6: Fraud Detection (Plugin → LLM → TypeScript)
  // ============================================================
  console.log('\n🔍 Step 6: Running fraud detection...');
  let fraudAnalysis: FraudAnalysis;
  
  // Fetch historical benchmarks for this vehicle (internal AI signal only)
  let historicalContext = '';
  try {
    const { getHistoricalBenchmarks } = await import('./continuous-learning');
    const benchmarks = await getHistoricalBenchmarks(
      'default',
      extractedData.vehicleMake || '',
      extractedData.vehicleModel,
      {
        accidentType: physicsAnalysis.damageConsistency || extractedData.incidentDescription?.split(' ').slice(0, 3).join('_') || undefined,
        damageSeverity: damageSeverity || undefined,
        affectedZones: (extractedData.damagedComponents || []).length > 0 ? extractedData.damagedComponents : undefined,
        estimatedCost: totalCost,
      }
    );
    if (benchmarks.claimCount > 0) {
      const avgQuote = benchmarks.avgQuoteCost;
      const avgFinal = benchmarks.avgFinalCost;
      const quoteDeviation = avgQuote ? ((totalCost - avgQuote) / avgQuote * 100).toFixed(1) : 'N/A';
      historicalContext = `\nHistorical intelligence (${benchmarks.matchQuality} match, ${benchmarks.claimCount} prior claims):\nMatch criteria: ${benchmarks.matchCriteria}\n- Average historical quote: $${avgQuote?.toFixed(2) || 'N/A'}\n- Average final approved: $${avgFinal?.toFixed(2) || 'N/A'}\n- Current quote deviation from historical avg: ${quoteDeviation}%\n- Historical fraud rate for similar claims: ${benchmarks.fraudRate?.toFixed(1) || 'N/A'}%\n- Common repair actions: ${benchmarks.commonRepairActions.join(', ') || 'N/A'}`;
      console.log(`📊 Historical context loaded: ${benchmarks.matchQuality} match, ${benchmarks.claimCount} prior claims, avg quote $${avgQuote?.toFixed(2)}`);
    }
  } catch (err) {
    console.warn('⚠️ Could not fetch historical benchmarks:', err);
  }
  
  const fraudPlugin = getPlugin('fraud');
  
  if (fraudPlugin) {
    console.log(`🔌 Using ML plugin: ${fraudPlugin.id} v${fraudPlugin.version}`);
    try {
      const pluginResult = await fraudPlugin.predict({
        claim_amount: totalCost,
        vehicle_age: new Date().getFullYear() - (extractedData.vehicleYear || 2020),
        previous_claims_count: 0,
        damage_severity_score: damageSeverity === 'severe' ? 0.9 : damageSeverity === 'moderate' ? 0.6 : 0.3,
        physics_validation_score: physicsAnalysis.confidence || 0.5,
        has_photos: damagePhotoUrls.length > 0,
        has_police_report: !!extractedData.policeReportReference,
        accident_type: extractedData.accidentType || 'other',
      });
      if (pluginResult) {
        fraudAnalysis = pluginResult as unknown as FraudAnalysis;
        console.log(`✅ ML plugin fraud: ${fraudAnalysis.risk_level} (${fraudAnalysis.risk_score}/100)`);
      } else {
        throw new Error('Plugin returned null');
      }
    } catch (error: any) {
      console.warn(`⚠️ ML plugin failed: ${error.message}, falling back to LLM...`);
    }
  }
  
  if (!fraudPlugin || !fraudAnalysis!) {
    // Run inline TypeScript fraud scoring first (deterministic baseline)
    const inlineFraud = detectFraudInline(
      totalCost,
      new Date().getFullYear() - (extractedData.vehicleYear || 2020),
      0,
      damageSeverity === 'severe' ? 0.9 : damageSeverity === 'moderate' ? 0.6 : 0.3,
      physicsAnalysis.confidence || 0.5,
      false,
      !!extractedData.policeReportReference,
      damagePhotoUrls.length > 0,
      totalCost > 10000,
      extractedData.accidentType || 'other',
    );
    
    // Build incident-type-aware context for fraud analysis
    const incidentContext = !incidentClassification.isCollision
      ? `\nINCIDENT TYPE CONTEXT:\nThis is a ${incidentClassification.incidentType.replace(/_/g, ' ')} incident, NOT a vehicle collision.\nThe vehicle was ${incidentClassification.vehicleWasStationary ? 'stationary' : 'possibly in motion'} during the incident.\nClassification reasoning: ${incidentClassification.reasoning}\nCollision dynamics (kinetic energy, impact force, g-force) are NOT applicable.\nEvaluate fraud based on: narrative consistency, damage pattern vs incident type, cost reasonableness, and documentation.`
      : '';
    
    const narrativeContext = `\nNARRATIVE VALIDATION:\nNarrative plausibility score: ${narrativeValidation.narrativeScore}/100\nNarrative is plausible: ${narrativeValidation.isPlausible}\nSupporting factors: ${narrativeValidation.supports.length > 0 ? narrativeValidation.supports.join('; ') : 'None'}\nConcerns: ${narrativeValidation.concerns.length > 0 ? narrativeValidation.concerns.join('; ') : 'None'}\nDeductions: ${narrativeValidation.deductions.length > 0 ? narrativeValidation.deductions.join('; ') : 'None'}`;
    
    try {
      // LLM fraud analysis for richer context
      const fraudResponse = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `You are an insurance fraud detection expert with deep knowledge of common fraud patterns in African insurance markets. Analyze the claim for fraud indicators. Be fair and objective — most claims are legitimate.

CRITICAL RULES:
1. ALWAYS read the full accident description carefully before making any assessment.
2. For non-collision incidents (theft, break-in, vandalism, fire, hail, flood), do NOT use collision-based reasoning (impact speed, kinetic energy, g-force). These are irrelevant.
3. Evaluate whether the DAMAGE PATTERN matches the DESCRIBED INCIDENT TYPE. For example:
   - Break-in: expect lock/window/door handle damage, NOT bodywork/paintwork collision damage
   - Theft: expect entry damage and missing items, NOT impact damage
   - Vandalism: expect surface damage, scratches, broken glass
4. Consider whether the claimant's narrative is internally consistent and plausible.
5. A police report reference SUPPORTS legitimacy for theft/break-in claims.
6. Low claim amounts for minor damage are NORMAL, not suspicious.
7. Do NOT hallucinate collision scenarios for non-collision claims.

Consider:
- Damage consistency with the SPECIFIC incident type described
- Cost reasonableness for the vehicle, damage type, and incident
- Documentation completeness
- Narrative coherence and internal consistency
- Common fraud patterns relevant to the incident type`
          },
          {
            role: "user",
            content: `Analyze fraud risk for this claim:
Vehicle: ${extractedData.vehicleMake} ${extractedData.vehicleModel} ${extractedData.vehicleYear}
Claim amount: $${totalCost}
Incident type: ${incidentClassification.incidentType.replace(/_/g, ' ')} (${incidentClassification.isCollision ? 'collision' : 'non-collision'})
Accident description: ${extractedData.accidentDescription || 'Not provided'}
Damage description: ${extractedData.damageDescription || 'Not provided'}
Damaged components: ${damageLocations.join(', ')}
Physics/damage validation: ${physicsAnalysis.is_valid ? 'PASSED' : 'FAILED'} (score: ${physicsAnalysis.physicsScore}/100, ${physicsAnalysis.damageConsistency})
Validation flags: ${physicsAnalysis.flags.length > 0 ? physicsAnalysis.flags.join('; ') : 'None'}
Photos available: ${damagePhotoUrls.length > 0 ? 'Yes' : 'No'}
Police report: ${extractedData.policeReportReference ? 'Yes (' + extractedData.policeReportReference + ')' : 'No'}
Inline risk score: ${Math.round(inlineFraud.fraudProbability * 100)}/100 (${inlineFraud.riskLevel})${incidentContext}${narrativeContext}${historicalContext}`
          }
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "fraud_analysis",
            strict: true,
            schema: {
              type: "object",
              properties: {
                fraud_probability: { type: "number", description: "0-1 probability" },
                risk_level: { type: "string", description: "low, medium, high, or critical" },
                risk_score: { type: "integer", description: "0-100" },
                indicators: {
                  type: "object",
                  properties: {
                    claimHistory: { type: "integer", description: "1-5 risk level" },
                    damageConsistency: { type: "integer", description: "1-5 risk level" },
                    documentAuthenticity: { type: "integer", description: "1-5 risk level" },
                    behavioralPatterns: { type: "integer", description: "1-5 risk level" },
                    ownershipVerification: { type: "integer", description: "1-5 risk level" },
                    geographicRisk: { type: "integer", description: "1-5 risk level" }
                  },
                  required: ["claimHistory", "damageConsistency", "documentAuthenticity", "behavioralPatterns", "ownershipVerification", "geographicRisk"],
                  additionalProperties: false
                },
                top_risk_factors: { type: "array", items: { type: "string" } },
                analysis_notes: { type: "string" }
              },
              required: ["fraud_probability", "risk_level", "risk_score", "indicators", "top_risk_factors", "analysis_notes"],
              additionalProperties: false
            }
          }
        }
      });
      
      const llmFraud = JSON.parse(fraudResponse.choices[0].message.content as string);
      
      // Cross-reference physics results with incident-type awareness
      const physicsFlagsCount = physicsAnalysis.flags?.length || 0;
      const physicsContributes = physicsFlagsCount > 0 || !physicsAnalysis.is_valid;
      
      // Blend LLM analysis with inline scoring
      // For non-collision incidents, give MORE weight to LLM (which has incident context) and LESS to inline physics
      let adjustedFraudProb: number;
      if (!incidentClassification.isCollision) {
        // Non-collision: LLM gets 70% weight (it understands incident type), inline gets 30%
        adjustedFraudProb = (llmFraud.fraud_probability * 0.7) + (inlineFraud.fraudProbability * 0.3);
        // Physics flags have REDUCED impact for non-collision (they may be irrelevant)
        if (physicsContributes) {
          adjustedFraudProb = Math.min(1.0, adjustedFraudProb + (physicsFlagsCount * 0.03));
        }
        // Narrative validation has MORE impact for non-collision
        if (narrativeValidation.isPlausible) {
          adjustedFraudProb = Math.max(0, adjustedFraudProb - 0.1); // Plausible narrative reduces fraud risk
        }
      } else {
        // Collision: standard 50/50 blend
        adjustedFraudProb = (llmFraud.fraud_probability + inlineFraud.fraudProbability) / 2;
        if (physicsContributes) {
          adjustedFraudProb = Math.min(1.0, adjustedFraudProb + (physicsFlagsCount * 0.1));
        }
      }
      
      const riskScore = Math.round(adjustedFraudProb * 100);
      const riskLevel = riskScore < 30 ? 'low' : riskScore < 60 ? 'medium' : riskScore < 80 ? 'high' : 'critical';
      
      const topRiskFactors = [...(llmFraud.top_risk_factors || [])];
      if (physicsContributes) {
        // For non-collision, label flags as "Damage validation" not "Physics"
        const flagPrefix = incidentClassification.isCollision ? 'Physics' : 'Damage validation';
        for (const flag of physicsAnalysis.flags) {
          topRiskFactors.push(`${flagPrefix}: ${flag}`);
        }
      }
      // Add narrative concerns as risk factors
      for (const concern of narrativeValidation.concerns) {
        if (!topRiskFactors.some(f => f.includes(concern.substring(0, 30)))) {
          topRiskFactors.push(`Narrative: ${concern}`);
        }
      }
      
      const validationLabel = incidentClassification.isCollision ? 'Physics validation' : 'Damage validation';
      
      fraudAnalysis = {
        fraud_probability: adjustedFraudProb,
        risk_level: riskLevel,
        risk_score: riskScore,
        confidence: 0.8,
        top_risk_factors: topRiskFactors,
        recommendations: inlineFraud.recommendations,
        indicators: llmFraud.indicators,
        physics_cross_reference: {
          physics_flags_count: physicsFlagsCount,
          physics_score: physicsAnalysis.physicsScore,
          physics_contributes_to_fraud: physicsContributes,
          physics_notes: physicsContributes 
            ? `${validationLabel} raised ${physicsFlagsCount} flag(s). Damage consistency: ${physicsAnalysis.damageConsistency}.${!incidentClassification.isCollision ? ' Note: This is a non-collision incident; collision dynamics were not applied.' : ' This increased the fraud risk score.'}`
            : `${validationLabel} passed with no flags. Damage is ${physicsAnalysis.damageConsistency} with the reported ${incidentClassification.isCollision ? 'accident' : 'incident'}.`
        },
        analysis_notes: llmFraud.analysis_notes || `Fraud probability: ${(adjustedFraudProb * 100).toFixed(1)}%. ${physicsContributes ? `${validationLabel} raised concerns.` : `${validationLabel} supports the claim.`}`
      };
      
      console.log(`✅ Fraud detection (LLM + TypeScript): ${fraudAnalysis.risk_level} (${fraudAnalysis.risk_score}/100)`);
      
    } catch (error: any) {
      console.warn(`⚠️ LLM fraud failed: ${error.message}, using TypeScript fallback...`);
      
      // Pure TypeScript fallback (incident-type-aware)
      const physicsFlagsCount = physicsAnalysis.flags?.length || 0;
      const physicsContributes = physicsFlagsCount > 0 || !physicsAnalysis.is_valid;
      
      let adjustedProb = inlineFraud.fraudProbability;
      if (!incidentClassification.isCollision) {
        // Non-collision: reduce physics flag impact, increase narrative weight
        if (physicsContributes) {
          adjustedProb = Math.min(1.0, adjustedProb + (physicsFlagsCount * 0.03));
        }
        if (narrativeValidation.isPlausible) {
          adjustedProb = Math.max(0, adjustedProb - 0.1);
        }
      } else {
        if (physicsContributes) {
          adjustedProb = Math.min(1.0, adjustedProb + (physicsFlagsCount * 0.1));
        }
      }
      
      const riskScore = Math.round(adjustedProb * 100);
      const riskLevel = riskScore < 30 ? 'low' : riskScore < 60 ? 'medium' : riskScore < 80 ? 'high' : 'critical';
      const validationLabel = incidentClassification.isCollision ? 'Physics validation' : 'Damage validation';
      
      fraudAnalysis = {
        fraud_probability: adjustedProb,
        risk_level: riskLevel,
        risk_score: riskScore,
        confidence: 0.7,
        top_risk_factors: [...inlineFraud.topRiskFactors, ...narrativeValidation.concerns.map(c => `Narrative: ${c}`)],
        recommendations: inlineFraud.recommendations,
        indicators: {
          claimHistory: 2,
          damageConsistency: physicsAnalysis.is_valid ? 2 : (incidentClassification.isCollision ? 4 : 3),
          documentAuthenticity: damagePhotoUrls.length > 0 ? 2 : 4,
          behavioralPatterns: 2,
          ownershipVerification: extractedData.claimantName ? 2 : 4,
          geographicRisk: 2,
        },
        physics_cross_reference: {
          physics_flags_count: physicsFlagsCount,
          physics_score: physicsAnalysis.physicsScore,
          physics_contributes_to_fraud: physicsContributes,
          physics_notes: physicsContributes 
            ? `${validationLabel} raised ${physicsFlagsCount} flag(s). Damage consistency: ${physicsAnalysis.damageConsistency}.${!incidentClassification.isCollision ? ' Non-collision incident; collision dynamics not applied.' : ''}`
            : `${validationLabel} passed. Damage is ${physicsAnalysis.damageConsistency}.`
        },
        analysis_notes: `TypeScript fallback analysis. Fraud probability: ${(adjustedProb * 100).toFixed(1)}%. Incident type: ${incidentClassification.incidentType}.`
      };
      
      console.log(`✅ Fraud detection (TypeScript): ${fraudAnalysis.risk_level} (${fraudAnalysis.risk_score}/100)`);
    }
  }

  // ============================================================
  // STEP 7: Build multi-quote comparison
  // ============================================================
  console.log('\n💰 Step 7: Building quote comparison...');
  
  const quotes: QuoteFigure[] = [];
  const originalQuote = extractedData.originalQuote || 0;
  const agreedCost = extractedData.agreedCost || 0;
  const aiEstimate = componentRecommendations.reduce((sum, r) => sum + r.estimatedCost, 0);
  const mktValue = extractedData.marketValue || 0;
  
  if (originalQuote > 0) {
    quotes.push({
      label: 'Original Repairer Quote',
      amount: originalQuote,
      source: extractedData.repairerName || 'Repairer',
      type: 'original',
      description: `Initial repair estimate from ${extractedData.repairerName || 'the repairer'}`
    });
  }
  
  if (agreedCost > 0) {
    quotes.push({
      label: 'Agreed Cost (Negotiated)',
      amount: agreedCost,
      source: extractedData.assessorName || 'Assessor',
      type: 'agreed',
      description: `Cost agreed after assessment by ${extractedData.assessorName || 'the assessor'}`
    });
  }
  
  if (aiEstimate > 0) {
    quotes.push({
      label: 'AI Component Estimate',
      amount: aiEstimate,
      source: 'KINGA AutoVerify',
      type: 'ai',
      description: 'Sum of individual component repair/replace estimates by AI'
    });
  }
  
  if (mktValue > 0) {
    quotes.push({
      label: 'Vehicle Market Value',
      amount: mktValue,
      source: 'Market Reference',
      type: 'reference',
      description: 'Current market value of the vehicle for reference'
    });
  }
  
  console.log(`📊 Quotes: ${quotes.length} figures compiled`);
  for (const q of quotes) {
    console.log(`   ${q.label}: $${q.amount.toLocaleString()} (${q.type})`);
  }

  // ============================================================
  // STEP 7.5: Normalize component names via vehicle parts taxonomy
  // ============================================================
  console.log('\n🔧 Step 7.5: Normalizing component names via parts taxonomy...');
  const normalizedComponents = (extractedData.damagedComponents || []).map((raw: string) => {
    const resolved = resolveComponent(raw);
    const normalized = normalizeComponentName(raw);
    return {
      raw,
      normalized,
      partId: resolved?.id || null,
      zone: resolved?.zone || null,
    };
  });
  console.log(`✅ Normalized ${normalizedComponents.length} components:`);
  for (const nc of normalizedComponents) {
    console.log(`   "${nc.raw}" → "${nc.normalized}" (zone: ${nc.zone || 'unknown'})`);
  }

  // ============================================================
  // STEP 7.6: Cross-validate quoted parts vs photo-visible damage
  // ============================================================
  console.log('\n🔍 Step 7.6: Cross-validating quotes vs photos...');
  let crossValidation: CrossValidationReport | undefined;
  
  if (damagePhotoUrls.length > 0 && (componentRecommendations.length > 0 || extractedData.damagedComponents?.length > 0)) {
    try {
      const quotedParts = componentRecommendations.length > 0
        ? componentRecommendations.map(cr => ({
            name: cr.component,
            cost: cr.estimatedCost,
            action: cr.action,
          }))
        : (extractedData.damagedComponents || []).map((name: string) => ({ name }));
      
      crossValidation = await crossValidateQuotesVsPhotos(quotedParts, damagePhotoUrls);
      
      console.log(`✅ Cross-validation complete:`);
      console.log(`   Confirmed: ${crossValidation.summary.confirmedCount}`);
      console.log(`   Quoted not visible: ${crossValidation.summary.quotedNotVisibleCount} (${crossValidation.summary.suspiciousCount} suspicious)`);
      console.log(`   Visible not quoted: ${crossValidation.summary.visibleNotQuotedCount}`);
      console.log(`   Risk score: ${crossValidation.summary.overallRiskScore}/100 (${crossValidation.summary.overallRiskLevel})`);
      
      // Feed cross-validation fraud indicators into fraud analysis
      if (crossValidation.fraudIndicators.length > 0) {
        fraudAnalysis.top_risk_factors.push(...crossValidation.fraudIndicators);
        // Adjust fraud score based on cross-validation
        const cvRiskBoost = crossValidation.summary.suspiciousCount * 0.05;
        if (cvRiskBoost > 0) {
          fraudAnalysis.fraud_probability = Math.min(1.0, fraudAnalysis.fraud_probability + cvRiskBoost);
          fraudAnalysis.risk_score = Math.round(fraudAnalysis.fraud_probability * 100);
          const rs = fraudAnalysis.risk_score;
          fraudAnalysis.risk_level = rs < 30 ? 'low' : rs < 60 ? 'medium' : rs < 80 ? 'high' : 'critical';
          console.log(`   ⚠️ Fraud score adjusted: +${(cvRiskBoost * 100).toFixed(0)}% → ${fraudAnalysis.risk_score}/100 (${fraudAnalysis.risk_level})`);
        }
      }
    } catch (error: any) {
      console.warn(`⚠️ Cross-validation failed: ${error.message}`);
    }
  } else {
    console.log('   ⏭️ Skipped: insufficient photos or components for cross-validation');
  }

  // Clean up temp file
  try { unlinkSync(tempPdfPath); } catch (e) { /* ignore */ }

  // ============================================================
  // VALIDATE PHYSICS ANALYSIS BEFORE RETURNING
  // ============================================================
  console.log('\n🔍 Validating physics analysis data...');
  
  const physicsValidationResult = validatePhysicsAnalysis(physicsAnalysis);
  
  if (!physicsValidationResult.success) {
    console.warn('⚠️ Physics validation warnings:');
    physicsValidationResult.errors?.forEach(err => console.warn(`   - ${err}`));
    console.warn('   Proceeding with unvalidated physics data (graceful degradation)');
  } else {
    console.log('✅ Physics analysis validation passed');
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ ASSESSMENT PROCESSING COMPLETE`);
  console.log(`🏗️ Architecture: LLM-First + TypeScript Fallback`);
  console.log(`📊 Vehicle: ${extractedData.vehicleMake} ${extractedData.vehicleModel} ${extractedData.vehicleYear}`);
  console.log(`📊 Photos: ${damagePhotoUrls.length} damage identified via LLM vision`);
  console.log(`📊 Components: ${componentRecommendations.length} recommendations`);
  console.log(`📊 Quotes: ${quotes.length} figures`);
  console.log(`📊 Physics: ${physicsAnalysis.damageConsistency} (score ${physicsAnalysis.physicsScore}/100)`);
  console.log(`📊 Fraud: ${fraudAnalysis.risk_level} (score ${fraudAnalysis.risk_score}/100)`);
  console.log(`📊 Completeness: ${completeness}%`);
  console.log(`🔌 ML Plugins: ${modelPlugins.size} registered (${Array.from(modelPlugins.keys()).join(', ') || 'none'})`);
  console.log(`${'='.repeat(60)}\n`);
  
  return {
    pdfUrl,
    vehicleMake: extractedData.vehicleMake || '',
    vehicleModel: extractedData.vehicleModel || '',
    vehicleYear: extractedData.vehicleYear || 0,
    vehicleRegistration: extractedData.vehicleRegistration || '',
    vehicleMass: extractedData.vehicleMass || undefined,
    claimantName: extractedData.claimantName || undefined,
    accidentDate: extractedData.accidentDate || undefined,
    accidentLocation: extractedData.accidentLocation || undefined,
    accidentDescription: extractedData.accidentDescription || undefined,
    policeReportReference: extractedData.policeReportReference || undefined,
    damageDescription: extractedData.damageDescription || undefined,
    damageLocation: extractedData.damageLocation || undefined,
    estimatedCost: agreedCost || extractedData.estimatedCost || 0,
    originalQuote: originalQuote || undefined,
    agreedCost: agreedCost || undefined,
    marketValue: mktValue || undefined,
    savings: extractedData.savings || (originalQuote && agreedCost ? originalQuote - agreedCost : undefined),
    excessAmount: extractedData.excessAmount || undefined,
    betterment: extractedData.betterment || undefined,
    assessorName: extractedData.assessorName || undefined,
    repairerName: extractedData.repairerName || undefined,
    itemizedCosts: extractedData.itemizedCosts || [],
    costBreakdown: extractedData.costBreakdown,
    componentRecommendations,
    quotes,
    damagePhotos: damagePhotoUrls,
    allPhotos,
    accidentType: extractedData.accidentType || undefined,
    damagedComponents: normalizedComponents.map((nc: { raw: string; normalized: string; partId: string | null; zone: string | null }) => nc.normalized),
    physicsAnalysis,
    fraudAnalysis,
    crossValidation,
    incidentClassification: {
      incidentType: incidentClassification.incidentType,
      isCollision: incidentClassification.isCollision,
      vehicleWasStationary: incidentClassification.vehicleWasStationary,
      confidence: incidentClassification.confidence,
      reasoning: incidentClassification.reasoning,
    },
    narrativeValidation: {
      narrativeScore: narrativeValidation.narrativeScore,
      isPlausible: narrativeValidation.isPlausible,
      supports: narrativeValidation.supports,
      concerns: narrativeValidation.concerns,
      deductions: narrativeValidation.deductions,
    },
    normalizedComponents,
    missingData,
    dataQuality,
    dataCompleteness: completeness
  };
}
