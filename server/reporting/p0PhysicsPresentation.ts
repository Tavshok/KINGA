import {
  hasGoverningCrushDepthEligibility,
  type CrushDepthEvidenceSnapshot,
} from "../evidence-governance/quantitativeFieldGovernance";

export const P0_A2_COLLISION_PHYSICS_WITHHELD =
  "P0_COLLISION_PHYSICS_WITHHELD" as const;

/**
 * Presentation-only P0-A-2 boundary for collision-physics content.
 *
 * Current P0-A intentionally has no governing visual-geometry source. The
 * eligibility predicate is still evaluated at every publication boundary so a
 * future P1 contract can introduce authority deliberately rather than through
 * an inherited report, PDF, snapshot, or LLM payload.
 */
export function hasP0A2CollisionPhysicsPublicationAuthority(
  decision: unknown,
  sources?: CrushDepthEvidenceSnapshot
): boolean {
  return hasGoverningCrushDepthEligibility(decision, sources);
}

export interface P0A2CollisionPhysicsHold {
  code: typeof P0_A2_COLLISION_PHYSICS_WITHHELD;
  reviewRequired: true;
  explanation: string;
  requiredEvidence: readonly string[];
  resolver: {
    action: string;
    unresolvedAction: string;
  };
}

/** Builds a nonnumeric, actionable abstention record. */
export function buildP0A2CollisionPhysicsHold(
  decision?: unknown,
  sources?: CrushDepthEvidenceSnapshot
): P0A2CollisionPhysicsHold | null {
  if (hasP0A2CollisionPhysicsPublicationAuthority(decision, sources)) {
    return null;
  }

  return {
    code: P0_A2_COLLISION_PHYSICS_WITHHELD,
    reviewRequired: true,
    explanation:
      "Collision-physics output is withheld because the available visual geometry, pixel-span interpretation, and raw crush observations are advisory or unavailable under the P0 evidence contract.",
    requiredEvidence: [
      "A P1-qualified, source-bound governing collision measurement, or",
      "a qualified human engineering review that records the measurement basis and provenance.",
    ],
    resolver: {
      action:
        "Obtain a qualified governing measurement or complete a documented human engineering review before publishing collision physics.",
      unresolvedAction:
        "Keep the claim in manual review; do not infer speed, delta-V, force, energy, causation, CGI, hidden damage, or physical plausibility from the withheld sources.",
    },
  };
}

/** Renders the HTML marker used by all report and PDF surfaces. */
export function renderP0A2CollisionPhysicsAbstentionMarker(
  decision?: unknown,
  sources?: CrushDepthEvidenceSnapshot
): string {
  const hold = buildP0A2CollisionPhysicsHold(decision, sources);
  if (!hold) return "";

  const requirements = hold.requiredEvidence
    .map(requirement => `<li>${escapeHtml(requirement)}</li>`)
    .join("");

  return `<div class="section" data-p0-collision-physics="withheld">
    <div class="section-title">Collision Physics Withheld — Manual Review Required</div>
    <p>${escapeHtml(hold.explanation)}</p>
    <p><strong>What is missing:</strong></p>
    <ul>${requirements}</ul>
    <p><strong>What resolves this:</strong> ${escapeHtml(hold.resolver.action)}</p>
    <p class="small grey">${escapeHtml(hold.resolver.unresolvedAction)}</p>
  </div>`;
}

/** Text-only counterpart for non-HTML reports, prompts, and email content. */
export function buildP0A2CollisionPhysicsAbstentionText(
  decision?: unknown,
  sources?: CrushDepthEvidenceSnapshot
): string {
  const hold = buildP0A2CollisionPhysicsHold(decision, sources);
  if (!hold) return "";

  return [
    "Collision Physics Withheld — Manual Review Required.",
    hold.explanation,
    `What is missing: ${hold.requiredEvidence.join(" ")}`,
    `What resolves this: ${hold.resolver.action}`,
    hold.resolver.unresolvedAction,
  ].join(" ");
}

/**
 * Projects photo evidence for a P0-A-2 report surface. Stored visual-physics
 * eligibility and collision-direction conclusions are advisory under P0, so
 * they cannot reach a photo renderer through a legacy report object.
 */
export function projectP0A2DescriptivePhotoEvidence<
  T extends {
    directionContradiction?: unknown;
    suitableForCrushDepth?: unknown;
    physicsExclusionReason?: unknown;
  },
>(
  photo: T
): Omit<
  T,
  "directionContradiction" | "suitableForCrushDepth" | "physicsExclusionReason"
> {
  const {
    directionContradiction: _directionContradiction,
    suitableForCrushDepth: _suitableForCrushDepth,
    physicsExclusionReason: _physicsExclusionReason,
    ...descriptivePhoto
  } = photo;
  return descriptivePhoto;
}

/**
 * Recursively removes collision-physics measurements and conclusions from a
 * new report projection. It does not mutate historical records. At the root it
 * adds the actionable abstention object so consumers cannot silently turn an
 * omitted branch into an apparent pass or zero-valued result.
 */
export function redactP0A2PhysicsReportPayload<T>(
  value: T,
  decision?: unknown,
  sources?: CrushDepthEvidenceSnapshot
): T {
  if (hasP0A2CollisionPhysicsPublicationAuthority(decision, sources)) {
    return value;
  }

  const redacted = redactCollisionPhysics(value) as T;
  if (redacted && typeof redacted === "object" && !Array.isArray(redacted)) {
    return {
      ...(redacted as Record<string, unknown>),
      collisionPhysics: buildP0A2CollisionPhysicsHold(decision, sources),
    } as T;
  }
  return redacted;
}

const COLLISION_PHYSICS_BRANCH =
  /^(?:physics(?:_|[A-Z]).*|physicsTruth|physicsValidation|crossValidation|cross_validation|causal.*|causation.*|cgi.*|contactGeometry|slpe.*|structural.*|latentDamage|impact(?:_|[A-Z])(?:speed|force|direction|vector|severity|momentum|energy|deceleration|acceleration|angle|analysis|reconstruction).*|collision(?:_|[A-Z])(?:physics|analysis|reconstruction|consistency|verdict|dynamics|derived).*|braking.*|physicalImpossibility|forensicAuditValidation)$/;

const COLLISION_PHYSICS_FIELD =
  /^(?:crush(?:_|[A-Z])|crushDepth|deltaV|speed(?:_|[A-Z])|velocity(?:_|[A-Z])|kineticEnergy|energy(?:_|[A-Z])|impactForce|force(?:_|[A-Z])|deceleration(?:_|[A-Z])|brakingDistance|damageConsistency|physicalPlausibility|hiddenDamage|causalVerdict|impactDirection|severityImpliedSpeed|consensusSpeed|speedComparison|engineerSpeedAssessment)$/;

const COLLISION_PHYSICS_NARRATIVE =
  /\b(?:collision physics|physics (?:engine|estimate|constraint)|impact speed|pre-impact speed|consensus speed|delta-?v|crush(?: depth)?|kinetic energy|impact force|deceleration|braking distance|physical(?:ly)? impossible|physical plausibility|impact causation|causation speed|cgi|hidden damage|structural load path|speed discrepancy)\b/i;

function redactCollisionPhysics(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactCollisionPhysics);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(
        ([key]) =>
          !COLLISION_PHYSICS_BRANCH.test(key) &&
          !COLLISION_PHYSICS_FIELD.test(key)
      )
      .map(([key, nestedValue]) => [key, redactCollisionPhysics(nestedValue)])
  );
}

/**
 * Removes narrative items that would otherwise restate a withheld collision
 * measurement or physics-derived verdict. Documentary, cost, and independent
 * damage-review actions remain intact.
 */
export function filterP0A2CollisionPhysicsNarratives<T extends string>(
  items: readonly T[],
  decision?: unknown,
  sources?: CrushDepthEvidenceSnapshot
): T[] {
  if (hasP0A2CollisionPhysicsPublicationAuthority(decision, sources)) {
    return [...items];
  }

  return items.filter(item => !COLLISION_PHYSICS_NARRATIVE.test(item));
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
