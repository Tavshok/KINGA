/**
 * stage-explainability.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * KINGA Explainability Engine — Wave 3
 *
 * PURPOSE
 * ───────
 * Produces human-readable, legally defensible evidence chains for every
 * physics finding. Each chain explains:
 *   1. What was measured (the raw evidence)
 *   2. How it was measured (the methodology)
 *   3. What it implies (the physics conclusion)
 *   4. How confident we are (the uncertainty)
 *   5. What would change the conclusion (the sensitivity)
 *
 * OUTPUT
 * ──────
 * - Per-finding evidence chains (crush depth, speed, energy, structural)
 * - A complete methodology citation block
 * - A verdict paragraph suitable for the report executive summary
 * - An adjuster-facing plain-English summary
 */

import type { PhysicsTruth } from './physicsTruth';
import type { IntegrityEngineResult } from './stage-integrity';
import type { UncertaintyPropagationResult } from './stage-uncertainty';

// ── Output types ──────────────────────────────────────────────────────────────

export interface EvidenceStep {
  /** Step number in the chain */
  step: number;
  /** Category: measurement, calculation, inference, validation */
  type: 'measurement' | 'calculation' | 'inference' | 'validation';
  /** What was done */
  description: string;
  /** The result of this step */
  result: string;
  /** Confidence in this step (0–1) */
  confidence: number;
  /** Methodology reference */
  methodology: string;
}

export interface EvidenceChain {
  /** Finding this chain explains */
  finding: string;
  /** One-sentence conclusion */
  conclusion: string;
  /** Ordered steps from raw evidence to conclusion */
  steps: EvidenceStep[];
  /** Overall confidence in the conclusion (0–1) */
  overallConfidence: number;
  /** What additional evidence would most improve confidence */
  confidenceImprovement: string;
}

export interface MethodologyCitation {
  method: string;
  fullName: string;
  description: string;
  reference: string;
  applicability: string;
  limitations: string;
}

export interface ExplainabilityResult {
  /** Evidence chain for the crush depth finding */
  crushDepthChain: EvidenceChain | null;
  /** Evidence chain for the speed finding */
  speedChain: EvidenceChain;
  /** Evidence chain for the energy finding */
  energyChain: EvidenceChain | null;
  /** Evidence chain for the structural finding */
  structuralChain: EvidenceChain | null;
  /** Methodology citations for all methods used */
  methodologyCitations: MethodologyCitation[];
  /** Verdict paragraph for the report executive summary */
  verdictParagraph: string;
  /** Plain-English adjuster summary (shorter, less technical) */
  adjusterSummary: string;
  /** Key physics findings as bullet points for the report */
  keyFindings: string[];
}

// ── Methodology library ───────────────────────────────────────────────────────

const METHODOLOGY_LIBRARY: Record<string, MethodologyCitation> = {
  VGR: {
    method: 'VGR',
    fullName: 'Vision Geometry Reconciliation (Multi-Image Photogrammetric Consensus)',
    description: 'Cross-image crush depth consensus using view-angle-weighted photogrammetry. Each image is independently calibrated against known vehicle reference objects (door handles, wheels, licence plates) and the results are reconciled using a weighted mean that accounts for perspective geometry.',
    reference: 'KINGA VGR Engine v2 — based on principles from NHTSA CRASH3 photogrammetric methodology',
    applicability: 'Requires ≥2 damage photographs from different angles. Best accuracy with frontal and 45° views.',
    limitations: 'Accuracy depends on reference object visibility and image quality. Oblique angles reduce precision.',
  },
  VGE: {
    method: 'VGE',
    fullName: 'Vision Geometry Engine (Single-Image Photogrammetric Calibration)',
    description: 'Single-image crush depth measurement using AI-detected reference objects of known dimensions. The pixel ratio between the reference object and the deformed zone is used to calculate the absolute crush depth in millimetres.',
    reference: 'KINGA VGE Engine v2',
    applicability: 'Requires at least one clear photograph with a visible reference object (wheel, door handle, or licence plate).',
    limitations: 'Single-image calibration has higher uncertainty than multi-image consensus. Perspective distortion is corrected but not eliminated.',
  },
  CAMPBELL: {
    method: 'CAMPBELL',
    fullName: 'Campbell Formula (Crush Depth to Speed)',
    description: 'The Campbell formula relates residual crush depth to impact speed using vehicle-specific stiffness coefficients: v = A·C + B·C²/2, where C is crush depth (m), A and B are stiffness coefficients (N/m and N/m²), and v is the equivalent barrier speed (EBS). For most passenger cars, A ≈ 0 and B ≈ 1.2 MN/m².',
    reference: 'Campbell, K.L. (1974). Energy basis for collision severity. SAE Technical Paper 740565.',
    applicability: 'Most accurate for frontal impacts on passenger cars with known stiffness coefficients. Less accurate for oblique impacts or vehicles with non-standard crush characteristics.',
    limitations: 'Stiffness coefficients vary by vehicle model. Generic coefficients introduce ±15–25% uncertainty. Does not account for energy absorbed by a second vehicle.',
  },
  SEVERITY_ANCHOR: {
    method: 'SEVERITY_ANCHOR',
    fullName: 'Damage Severity Anchoring (M1)',
    description: 'Speed estimation from damage severity classification (minor/moderate/severe/total loss) using empirical speed ranges derived from NHTSA crash test data. Provides a broad speed range rather than a point estimate.',
    reference: 'NHTSA NCAP crash test database; IIHS crash test data',
    applicability: 'Applicable to all claims as a baseline estimate. Most useful when photogrammetric calibration is not available.',
    limitations: 'Wide uncertainty range (±30–50%). Does not account for vehicle-specific crush characteristics.',
  },
  AIRBAG_LOWER_BOUND: {
    method: 'AIRBAG_LOWER_BOUND',
    fullName: 'Airbag/Pretensioner Deployment Lower Bound (M2)',
    description: 'Airbag deployment establishes a hard lower bound on impact speed. Frontal airbags deploy at ≥20 km/h equivalent barrier speed. Pretensioner-only activation indicates 15–20 km/h. This is a constraint, not a point estimate.',
    reference: 'NHTSA FMVSS 208; SAE J211 crash sensor standards',
    applicability: 'Applicable when airbag or pretensioner deployment is confirmed.',
    limitations: 'Provides only a lower bound. Deployment threshold varies by vehicle model and sensor calibration.',
  },
  DEFORMATION_ENERGY: {
    method: 'DEFORMATION_ENERGY',
    fullName: 'Deformation Energy Method (M5)',
    description: 'Speed estimation from the total deformation energy absorbed by all damaged components, using the relationship KE = ½mv² and a deformation efficiency factor η (typically 0.3–0.7 for passenger cars). Component energies are estimated from AI vision analysis of damage photographs.',
    reference: 'Prasad, A.K. (1991). CRASH3 damage algorithm reformulation for front and rear collisions. SAE Technical Paper 910599.',
    applicability: 'Applicable when multiple damaged components are visible in photographs.',
    limitations: 'Deformation energy estimates from vision analysis have ±30% uncertainty. Efficiency factor η introduces additional uncertainty.',
  },
  SLPE: {
    method: 'SLPE',
    fullName: 'Structural Load Path Engine (SLPE)',
    description: 'Physics-based structural cascade analysis that traces the deformation energy through the vehicle\'s load path (bumper beam → crash box → chassis rail → engine cradle → firewall) to determine which structural components were penetrated and to what depth. Uses vehicle-class-specific stiffness and yield strength data.',
    reference: 'KINGA SLPE Engine v1 — based on CRASH3 structural analysis methodology',
    applicability: 'Applicable to all frontal and rear impacts. Accuracy depends on crush depth measurement quality.',
    limitations: 'Uses vehicle-class averages for structural properties. Individual vehicle variants may have different stiffness characteristics.',
  },
};

// ── Main engine ───────────────────────────────────────────────────────────────

export function runExplainabilityEngine(
  pt: PhysicsTruth,
  integrity: IntegrityEngineResult,
  uncertainty: UncertaintyPropagationResult,
): ExplainabilityResult {

  const methodsUsed = new Set<string>();

  // ── Crush depth evidence chain ────────────────────────────────────────────
  let crushDepthChain: EvidenceChain | null = null;
  const crush = pt.geometry.crushDepth.canonical;

  if (crush) {
    const steps: EvidenceStep[] = [];

    if (pt.geometry.crushDepth.vgrConsensus) {
      methodsUsed.add('VGR');
      steps.push({
        step: 1,
        type: 'measurement',
        description: `${pt.geometry.crushDepth.vgrContributingImages} damage photograph${pt.geometry.crushDepth.vgrContributingImages !== 1 ? 's' : ''} analysed by the Vision Geometry Engine`,
        result: `Per-image crush depth estimates produced for each photograph`,
        confidence: 0.85,
        methodology: 'VGE — AI-detected reference objects (wheels, door handles, licence plates) used as scale references',
      });
      steps.push({
        step: 2,
        type: 'calculation',
        description: 'Cross-image consensus calculated using view-angle weighting',
        result: `Consensus crush depth: ${(crush.value * 1000).toFixed(0)} mm [${(crush.min * 1000).toFixed(0)}–${(crush.max * 1000).toFixed(0)} mm, 90% CI]`,
        confidence: crush.confidence,
        methodology: 'VGR — frontal images weighted 1.00, 45° images 0.70, side images 0.40',
      });
    } else if (pt.geometry.crushDepth.vgeSingleImage) {
      methodsUsed.add('VGE');
      steps.push({
        step: 1,
        type: 'measurement',
        description: 'Single damage photograph analysed by the Vision Geometry Engine',
        result: `Calibrated crush depth: ${(crush.value * 1000).toFixed(0)} mm [${(crush.min * 1000).toFixed(0)}–${(crush.max * 1000).toFixed(0)} mm, 90% CI]`,
        confidence: crush.confidence,
        methodology: 'VGE — single-image photogrammetric calibration',
      });
    } else {
      steps.push({
        step: 1,
        type: 'inference',
        description: 'Crush depth inferred from damage severity classification (no photogrammetric calibration available)',
        result: `Estimated crush depth: ${(crush.value * 1000).toFixed(0)} mm (±35% uncertainty)`,
        confidence: 0.35,
        methodology: 'Severity anchoring — empirical crush depth ranges by severity class',
      });
    }

    steps.push({
      step: steps.length + 1,
      type: 'validation',
      description: 'Crush depth cross-validated against speed ensemble',
      result: integrity.flags.some(f => f.code.startsWith('INT-01'))
        ? `⚠ Inconsistency detected — see integrity flags`
        : `✓ Consistent with speed ensemble`,
      confidence: integrity.flags.some(f => f.code === 'INT-01-SPEED_CRUSH_CRITICAL') ? 0.3 : 0.8,
      methodology: 'Campbell formula cross-check',
    });

    crushDepthChain = {
      finding: 'Primary crush depth',
      conclusion: `The primary crush depth is ${(crush.value * 1000).toFixed(0)} mm (90% CI: ${(crush.min * 1000).toFixed(0)}–${(crush.max * 1000).toFixed(0)} mm) measured by ${crush.source === 'VGR_CONSENSUS' ? 'multi-image photogrammetric consensus' : crush.source === 'VGE_CALIBRATED' ? 'single-image photogrammetric calibration' : 'severity inference'}.`,
      steps,
      overallConfidence: crush.confidence,
      confidenceImprovement: crush.source !== 'VGR_CONSENSUS'
        ? 'Submit at least 2 damage photographs from different angles (frontal + 45°) to enable multi-image consensus calibration.'
        : 'Confidence is already at maximum for photogrammetric methods. Physical inspection would provide ground truth.',
    };
  }

  // ── Speed evidence chain ──────────────────────────────────────────────────
  const speed = pt.speed.canonical;
  const speedSteps: EvidenceStep[] = [];

  // Step 1: List methods that ran
  const methodLabels = pt.speed.methods
    .filter(m => m.ran && m.speedKmh != null)
    .map(m => `${m.label}: ${m.speedKmh!.toFixed(0)} km/h (${m.confidence} confidence)`);

  speedSteps.push({
    step: 1,
    type: 'measurement',
    description: `${pt.speed.methodsRan} speed estimation method${pt.speed.methodsRan !== 1 ? 's' : ''} applied`,
    result: methodLabels.join('; '),
    confidence: 0.7,
    methodology: 'Multi-method speed ensemble — each method uses independent evidence sources',
  });

  if (pt.speed.lowerBoundKmh != null) {
    methodsUsed.add('AIRBAG_LOWER_BOUND');
    speedSteps.push({
      step: 2,
      type: 'measurement',
      description: 'Deployment evidence establishes hard lower bound',
      result: `Lower bound: ≥${pt.speed.lowerBoundKmh.toFixed(0)} km/h (airbag/pretensioner deployment confirmed)`,
      confidence: 0.95,
      methodology: 'AIRBAG_LOWER_BOUND — FMVSS 208 deployment threshold',
    });
  }

  if (uncertainty.campbellSpeed) {
    methodsUsed.add('CAMPBELL');
    speedSteps.push({
      step: speedSteps.length + 1,
      type: 'calculation',
      description: 'Campbell formula applied to calibrated crush depth',
      result: `Campbell speed: ${uncertainty.campbellSpeed.formatted} (propagated from crush depth uncertainty)`,
      confidence: crush?.confidence ?? 0.4,
      methodology: 'CAMPBELL — v = C × √(B/m), B = 1.2 MN/m²',
    });
  }

  speedSteps.push({
    step: speedSteps.length + 1,
    type: 'calculation',
    description: 'Weighted ensemble consensus calculated',
    result: speed
      ? `Consensus speed: ${speed.value.toFixed(0)} km/h [${speed.min.toFixed(0)}–${speed.max.toFixed(0)} km/h, 90% CI] — ${pt.speed.overallConfidence} confidence`
      : 'Consensus speed: not available',
    confidence: speed?.confidence ?? 0,
    methodology: 'Confidence-weighted mean of all method estimates',
  });

  if (integrity.flags.some(f => f.code.startsWith('INT-04'))) {
    speedSteps.push({
      step: speedSteps.length + 1,
      type: 'validation',
      description: 'Ensemble divergence detected',
      result: `⚠ Methods disagree by more than expected — see integrity flags`,
      confidence: 0.5,
      methodology: 'Cross-validation — methods should agree within ±40% for consistent evidence',
    });
  }

  methodsUsed.add('SEVERITY_ANCHOR');
  methodsUsed.add('DEFORMATION_ENERGY');

  const speedChain: EvidenceChain = {
    finding: 'Impact speed',
    conclusion: speed
      ? `The estimated impact speed is ${speed.value.toFixed(0)} km/h (90% CI: ${speed.min.toFixed(0)}–${speed.max.toFixed(0)} km/h) based on a ${pt.speed.methodsRan}-method ensemble with ${pt.speed.overallConfidence.toLowerCase()} overall confidence.`
      : 'Impact speed could not be determined with sufficient confidence.',
    steps: speedSteps,
    overallConfidence: speed?.confidence ?? 0,
    confidenceImprovement: pt.speed.methodsRan < 3
      ? 'Additional evidence sources (CCTV footage, telematics data, or additional damage photographs) would enable more speed estimation methods and improve confidence.'
      : 'Confidence is already supported by multiple independent methods.',
  };

  // ── Energy evidence chain ─────────────────────────────────────────────────
  let energyChain: EvidenceChain | null = null;
  const deformJ = pt.energy.totalDeformationEnergyJ;
  const kineticJ = pt.energy.kineticEnergyJ;

  if (deformJ && kineticJ) {
    energyChain = {
      finding: 'Energy balance',
      conclusion: `The impact involved ${kineticJ.value.toFixed(1)} kJ of kinetic energy, of which ${deformJ.value.toFixed(1)} kJ (${((deformJ.value / kineticJ.value) * 100).toFixed(0)}%) was absorbed as permanent deformation.`,
      steps: [
        {
          step: 1,
          type: 'calculation',
          description: 'Kinetic energy calculated from ensemble speed and vehicle mass',
          result: `KE = ½ × ${pt.vehicle.massKg ?? 1400} kg × (${(speed?.value ?? 0) / 3.6 | 0} m/s)² = ${kineticJ.value.toFixed(1)} kJ`,
          confidence: speed?.confidence ?? 0.5,
          methodology: 'Classical mechanics — KE = ½mv²',
        },
        {
          step: 2,
          type: 'measurement',
          description: 'Per-component deformation energy estimated from damage photographs',
          result: `Total deformation energy: ${deformJ.value.toFixed(1)} kJ across ${pt.energy.componentEnergies.length} components`,
          confidence: 0.55,
          methodology: 'DEFORMATION_ENERGY — AI vision analysis of component damage severity',
        },
        {
          step: 3,
          type: 'validation',
          description: 'Energy balance validated',
          result: integrity.flags.some(f => f.code.startsWith('INT-02'))
            ? `⚠ Energy balance anomaly — see integrity flags`
            : `✓ Deformation energy is ${((deformJ.value / kineticJ.value) * 100).toFixed(0)}% of kinetic energy — within expected range`,
          confidence: 0.75,
          methodology: 'Conservation of energy — deformation energy cannot exceed kinetic energy input',
        },
      ],
      overallConfidence: Math.min(speed?.confidence ?? 0.5, 0.65),
      confidenceImprovement: 'Physical inspection of all damaged components would provide more accurate deformation energy estimates.',
    };
  }

  // ── Structural evidence chain ─────────────────────────────────────────────
  let structuralChain: EvidenceChain | null = null;
  const slpe = pt.structuralLoadPath;

  if (slpe) {
    methodsUsed.add('SLPE');
    const penetratedComponents = slpe.penetratedComponents;

    structuralChain = {
      finding: 'Structural load path',
      conclusion: penetratedComponents.length > 0
        ? `The impact penetrated ${penetratedComponents.length} structural component${penetratedComponents.length !== 1 ? 's' : ''} (${penetratedComponents.map((c: any) => c.componentName).join(', ')}). Structural integrity risk: ${slpe.structuralIntegrityRisk.toUpperCase()}.`
        : `No structural components were penetrated. The deformation was contained within the crumple zone. Structural integrity risk: ${slpe.structuralIntegrityRisk.toUpperCase()}.`,
      steps: [
        {
          step: 1,
          type: 'measurement',
          description: 'Calibrated crush depth used as SLPE input',
          result: `Input crush depth: ${crush ? (crush.value * 1000).toFixed(0) : 'N/A'} mm`,
          confidence: crush?.confidence ?? 0.4,
          methodology: 'SLPE — crush depth from PhysicsTruth canonical measurement',
        },
        {
          step: 2,
          type: 'calculation',
          description: `Load path cascade analysed for ${slpe.bodyType} vehicle class`,
          result: `${slpe.penetratedComponents.length + slpe.intactComponents.length} components analysed; ${penetratedComponents.length} penetrated`,
          confidence: 0.70,
          methodology: 'SLPE — sequential component stiffness and yield strength analysis',
        },
        {
          step: 3,
          type: 'inference',
          description: 'Hidden damage probability derived from structural cascade',
          result: slpe.latentDamageProbability
          ? `Engine: ${(slpe.latentDamageProbability.engine * 100).toFixed(0)}%, Transmission: ${(slpe.latentDamageProbability.transmission * 100).toFixed(0)}%, Frame: ${(slpe.latentDamageProbability.frame * 100).toFixed(0)}%`
          : 'Hidden damage probabilities not available',
          confidence: 0.65,
          methodology: 'SLPE — component penetration depth mapped to system damage probability',
        },
      ],
      overallConfidence: 0.70,
      confidenceImprovement: 'Physical inspection of the chassis rails and engine cradle would confirm or refute the structural penetration findings.',
    };
  }

  // ── Methodology citations ─────────────────────────────────────────────────
  const methodologyCitations = Array.from(methodsUsed)
    .filter(m => METHODOLOGY_LIBRARY[m])
    .map(m => METHODOLOGY_LIBRARY[m]);

  // ── Verdict paragraph ─────────────────────────────────────────────────────
  const speedStr = speed
    ? `${speed.value.toFixed(0)} km/h (90% CI: ${speed.min.toFixed(0)}–${speed.max.toFixed(0)} km/h)`
    : 'undetermined';

  const crushStr = crush
    ? `${(crush.value * 1000).toFixed(0)} mm`
    : 'not measured';

  const integrityStr = integrity.clean
    ? 'All physics integrity checks passed with no contradictions detected.'
    : integrity.passed
    ? `${integrity.warningCount} integrity warning${integrity.warningCount !== 1 ? 's' : ''} were identified but do not invalidate the physics conclusion.`
    : `${integrity.criticalCount} critical integrity contradiction${integrity.criticalCount !== 1 ? 's' : ''} were detected — the physics conclusion requires review before a decision is finalised.`;

  const verdictParagraph = [
    `Physics analysis of the available evidence indicates an estimated impact speed of ${speedStr},`,
    `derived from a ${pt.speed.methodsRan}-method ensemble with ${pt.speed.overallConfidence.toLowerCase()} overall confidence.`,
    crush ? `The primary crush depth was measured at ${crushStr} by ${crush.source === 'VGR_CONSENSUS' ? 'multi-image photogrammetric consensus' : crush.source === 'VGE_CALIBRATED' ? 'single-image photogrammetric calibration' : 'severity inference'}.` : '',
    slpe ? `Structural load path analysis indicates ${slpe.structuralIntegrityRisk.toUpperCase()} structural integrity risk with ${slpe.penetratedComponents.length} component${slpe.penetratedComponents.length !== 1 ? 's' : ''} penetrated beyond the crumple zone.` : '',
    `Uncertainty propagation yields a ${uncertainty.overallGrade}-grade evidence quality (${uncertainty.summary.split('—')[0].trim()}).`,
    integrityStr,
  ].filter(Boolean).join(' ');

  // ── Adjuster summary ──────────────────────────────────────────────────────
  const adjusterSummary = [
    speed ? `The vehicle was travelling at approximately ${speed.value.toFixed(0)} km/h at the time of impact.` : 'Impact speed could not be reliably determined.',
    crush ? `The primary damage zone was crushed by ${(crush.value * 1000).toFixed(0)} mm.` : '',
    slpe && slpe.structuralIntegrityRisk !== 'none'
      ? `The impact was severe enough to penetrate the vehicle's structural components — a physical inspection is required to assess chassis damage.`
      : slpe ? `The deformation was contained within the crumple zone — no structural penetration detected.` : '',
    integrity.criticalCount > 0
      ? `⚠ REVIEW REQUIRED: ${integrity.criticalCount} critical physics contradiction${integrity.criticalCount !== 1 ? 's' : ''} detected.`
      : integrity.warningCount > 0
      ? `Note: ${integrity.warningCount} physics warning${integrity.warningCount !== 1 ? 's' : ''} noted — see integrity flags.`
      : '✓ All physics checks passed.',
  ].filter(Boolean).join(' ');

  // ── Key findings ──────────────────────────────────────────────────────────
  const keyFindings: string[] = [];

  if (speed) {
    keyFindings.push(`Impact speed: ${speed.value.toFixed(0)} km/h [${speed.min.toFixed(0)}–${speed.max.toFixed(0)} km/h, 90% CI] — ${pt.speed.overallConfidence} confidence`);
  }
  if (crush) {
    keyFindings.push(`Primary crush depth: ${(crush.value * 1000).toFixed(0)} mm [${(crush.min * 1000).toFixed(0)}–${(crush.max * 1000).toFixed(0)} mm] via ${crush.source === 'VGR_CONSENSUS' ? 'multi-image photogrammetry' : crush.source === 'VGE_CALIBRATED' ? 'single-image photogrammetry' : 'severity inference'}`);
  }
  if (kineticJ) {
    keyFindings.push(`Kinetic energy at impact: ${kineticJ.value.toFixed(1)} kJ`);
  }
  if (slpe) {
    const pen = slpe.penetratedComponents.length;
    keyFindings.push(`Structural integrity: ${slpe.structuralIntegrityRisk.toUpperCase()} risk — ${pen} component${pen !== 1 ? 's' : ''} penetrated`);
  }
  if (pt.speed.lowerBoundKmh != null) {
    keyFindings.push(`Deployment evidence confirms speed ≥${pt.speed.lowerBoundKmh.toFixed(0)} km/h`);
  }
  keyFindings.push(`Evidence quality: Grade ${uncertainty.overallGrade} (${uncertainty.overallGrade === 'A' ? 'tight' : uncertainty.overallGrade === 'B' ? 'moderate' : uncertainty.overallGrade === 'C' ? 'wide' : 'very wide'} uncertainty)`);
  keyFindings.push(`Physics integrity: ${integrity.integrityScore}/100 — ${integrity.summary}`);

  return {
    crushDepthChain,
    speedChain,
    energyChain,
    structuralChain,
    methodologyCitations,
    verdictParagraph,
    adjusterSummary,
    keyFindings,
  };
}
