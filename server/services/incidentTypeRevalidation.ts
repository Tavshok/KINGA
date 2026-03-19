/**
 * Incident Type Re-Validation Service
 *
 * When an adjuster manually overrides the AI-detected incident type, this
 * service re-runs two downstream checks:
 *
 *   1. Impact Direction Validation
 *      - Checks whether the reported damage zones are consistent with the
 *        physics of the new incident type (e.g. a rear-end collision should
 *        show rear damage, not front-only damage).
 *
 *   2. Damage Consistency Check
 *      - Checks whether the damage components listed in the AI assessment
 *        are plausible for the new incident type (e.g. hail damage should
 *        be distributed across the roof/bonnet/boot, not concentrated on
 *        one lateral panel).
 *
 * Both checks are LLM-assisted so they can reason over free-text descriptions
 * and structured damage lists simultaneously.
 */

import { invokeLLM } from "../_core/llm";

// ── Types ──────────────────────────────────────────────────────────────────

export type IncidentType =
  | 'collision'
  | 'theft'
  | 'hail'
  | 'fire'
  | 'vandalism'
  | 'flood'
  | 'hijacking'
  | 'other';

export type ValidationStatus = 'pass' | 'warning' | 'fail';

export interface ImpactDirectionValidationResult {
  status: ValidationStatus;
  /** Zones that were reported as damaged */
  reportedDamageZones: string[];
  /** Zones expected for this incident type */
  expectedZones: string[];
  /** Zones that are inconsistent with the incident type */
  inconsistentZones: string[];
  explanation: string;
}

export interface DamageConsistencyResult {
  status: ValidationStatus;
  consistentComponents: string[];
  inconsistentComponents: string[];
  explanation: string;
}

export interface RevalidationResult {
  incidentType: IncidentType;
  impactDirection: ImpactDirectionValidationResult;
  damageConsistency: DamageConsistencyResult;
  overallStatus: ValidationStatus;
  summary: string;
  revalidatedAt: string;
}

// ── Impact direction rules (heuristic fallback) ────────────────────────────

const INCIDENT_EXPECTED_ZONES: Record<IncidentType, string[]> = {
  collision:   ['front', 'rear', 'left', 'right', 'structural'],
  theft:       ['door', 'window', 'ignition', 'interior'],
  hail:        ['roof', 'bonnet', 'boot', 'front', 'rear', 'left', 'right'],
  fire:        ['engine', 'interior', 'bonnet', 'structural'],
  vandalism:   ['door', 'window', 'body', 'left', 'right', 'front', 'rear'],
  flood:       ['interior', 'engine', 'underbody', 'electrical'],
  hijacking:   ['door', 'window', 'interior', 'ignition'],
  other:       [],
};

// ── Main re-validation function ────────────────────────────────────────────

export interface RevalidationInput {
  newIncidentType: IncidentType;
  incidentDescription?: string | null;
  damageZones?: string[];          // e.g. ['front', 'left']
  damagedComponents?: string[];    // e.g. ['bonnet', 'left front door', 'windscreen']
  aiAssessmentSummary?: string | null;
}

export async function revalidateIncidentType(
  input: RevalidationInput,
): Promise<RevalidationResult> {
  const {
    newIncidentType,
    incidentDescription,
    damageZones = [],
    damagedComponents = [],
    aiAssessmentSummary,
  } = input;

  const expectedZones = INCIDENT_EXPECTED_ZONES[newIncidentType] ?? [];

  // ── 1. LLM-assisted validation ───────────────────────────────────────────
  const prompt = buildValidationPrompt(input, expectedZones);

  let llmResult: {
    impactDirection: {
      status: ValidationStatus;
      inconsistentZones: string[];
      explanation: string;
    };
    damageConsistency: {
      status: ValidationStatus;
      inconsistentComponents: string[];
      consistentComponents: string[];
      explanation: string;
    };
    overallStatus: ValidationStatus;
    summary: string;
  };

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: 'system',
          content:
            'You are an expert motor vehicle insurance assessor. ' +
            'Respond only with valid JSON matching the schema provided.',
        },
        { role: 'user', content: prompt },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'revalidation_result',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              impactDirection: {
                type: 'object',
                properties: {
                  status: { type: 'string', enum: ['pass', 'warning', 'fail'] },
                  inconsistentZones: { type: 'array', items: { type: 'string' } },
                  explanation: { type: 'string' },
                },
                required: ['status', 'inconsistentZones', 'explanation'],
                additionalProperties: false,
              },
              damageConsistency: {
                type: 'object',
                properties: {
                  status: { type: 'string', enum: ['pass', 'warning', 'fail'] },
                  inconsistentComponents: { type: 'array', items: { type: 'string' } },
                  consistentComponents: { type: 'array', items: { type: 'string' } },
                  explanation: { type: 'string' },
                },
                required: ['status', 'inconsistentComponents', 'consistentComponents', 'explanation'],
                additionalProperties: false,
              },
              overallStatus: { type: 'string', enum: ['pass', 'warning', 'fail'] },
              summary: { type: 'string' },
            },
            required: ['impactDirection', 'damageConsistency', 'overallStatus', 'summary'],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response?.choices?.[0]?.message?.content;
    const parsed = typeof content === 'string' ? JSON.parse(content) : content;
    // Validate the parsed result has the required shape before using it
    if (parsed && parsed.impactDirection && parsed.damageConsistency) {
      llmResult = parsed;
    } else {
      llmResult = heuristicFallback(input, expectedZones);
    }
  } catch (err) {
    // Fallback to heuristic-only result if LLM fails
    llmResult = heuristicFallback(input, expectedZones);
  }

  // ── 2. Merge heuristic zone data with LLM result ─────────────────────────
  const inconsistentZones = llmResult.impactDirection.inconsistentZones;
  const consistentZones = damageZones.filter(z => !inconsistentZones.includes(z));

  return {
    incidentType: newIncidentType,
    impactDirection: {
      status: llmResult.impactDirection.status,
      reportedDamageZones: damageZones,
      expectedZones,
      inconsistentZones,
      explanation: llmResult.impactDirection.explanation,
    },
    damageConsistency: {
      status: llmResult.damageConsistency.status,
      consistentComponents: llmResult.damageConsistency.consistentComponents,
      inconsistentComponents: llmResult.damageConsistency.inconsistentComponents,
      explanation: llmResult.damageConsistency.explanation,
    },
    overallStatus: llmResult.overallStatus,
    summary: llmResult.summary,
    revalidatedAt: new Date().toISOString(),
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function buildValidationPrompt(
  input: RevalidationInput,
  expectedZones: string[],
): string {
  const lines: string[] = [
    `Incident type (adjuster override): ${input.newIncidentType}`,
    `Expected damage zones for this incident type: ${expectedZones.join(', ') || 'any'}`,
    '',
  ];

  if (input.incidentDescription) {
    lines.push(`Incident description: ${input.incidentDescription}`);
  }

  if (input.damageZones?.length) {
    lines.push(`Reported damage zones: ${input.damageZones.join(', ')}`);
  }

  if (input.damagedComponents?.length) {
    lines.push(`Damaged components: ${input.damagedComponents.join(', ')}`);
  }

  if (input.aiAssessmentSummary) {
    lines.push(`AI assessment summary: ${input.aiAssessmentSummary}`);
  }

  lines.push('');
  lines.push(
    'Task: Evaluate whether the reported damage zones and components are ' +
    'consistent with the stated incident type. ' +
    'Return a JSON object with impactDirection validation, damageConsistency ' +
    'validation, an overallStatus, and a brief summary for the adjuster.',
  );

  return lines.join('\n');
}

interface HeuristicFallbackResult {
  impactDirection: { status: ValidationStatus; inconsistentZones: string[]; explanation: string };
  damageConsistency: { status: ValidationStatus; inconsistentComponents: string[]; consistentComponents: string[]; explanation: string };
  overallStatus: ValidationStatus;
  summary: string;
}

function heuristicFallback(
  input: RevalidationInput,
  expectedZones: string[],
): HeuristicFallbackResult {
  const { damageZones = [], damagedComponents = [], newIncidentType } = input;

  // Zones that appear in reported but NOT in expected (for non-collision types)
  const inconsistentZones =
    expectedZones.length > 0
      ? damageZones.filter(z => !expectedZones.includes(z))
      : [];

  const impactStatus: ValidationStatus =
    inconsistentZones.length === 0 ? 'pass' :
    inconsistentZones.length <= 1 ? 'warning' : 'fail';

  return {
    impactDirection: {
      status: impactStatus,
      inconsistentZones,
      explanation:
        inconsistentZones.length === 0
          ? `Damage zones are consistent with a ${newIncidentType} incident.`
          : `The following zones are unexpected for a ${newIncidentType} incident: ${inconsistentZones.join(', ')}.`,
    },
    damageConsistency: {
      status: 'warning' as ValidationStatus,
      inconsistentComponents: [],
      consistentComponents: damagedComponents,
      explanation: 'Heuristic fallback — LLM validation unavailable. Manual review recommended.',
    },
    overallStatus: impactStatus,
    summary:
      impactStatus === 'pass'
        ? `Damage pattern is consistent with the updated incident type (${newIncidentType}).`
        : `Some damage zones may not align with a ${newIncidentType} incident. Review recommended.`,
  };
}
