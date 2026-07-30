/**
 * Live verification script: causation classification + braking distance
 * Run: npx tsx server/scripts/live-verify-causation.ts
 *
 * Tests:
 *   1. Claim 8400001 — check what scenario it has
 *   2. Synthetic SELF_REVERSING into parked car (should NOT fire contradiction)
 *   3. Synthetic SELF_REVERSING with active third party (SHOULD fire contradiction)
 *   4. Synthetic THIRD_PARTY_REAR_STRIKE
 *   5. Any real claim with rear-impact scenario from DB
 */

import { getDb } from "../db";
import { claims } from "../../drizzle/schema";
import { eq, like, or } from "drizzle-orm";

// We import the internal function by re-exporting it temporarily
// Instead, we replicate the logic inline for verification

type ImpactCausation =
  | "SELF_REVERSING"
  | "THIRD_PARTY_REAR_STRIKE"
  | "THIRD_PARTY_REVERSED_INTO_CLAIMANT"
  | "MUTUAL_REVERSING"
  | "FORWARD_IMPACT"
  | "UNKNOWN";

interface CausationResult {
  impactCausation: ImpactCausation | null;
  reversingNarrativeContradiction: boolean | null;
  causationSpeedCeilingKmh: number | null;
  isRearImpact: boolean;
}

function classifyCausation(params: {
  description: string;
  collisionScenario: string;
  thirdPartyName?: string | null;
  thirdPartyVehicle?: string | null;
  policeReportNumber?: string | null;
  isParkingLotDamage?: boolean;
  isStruckParty?: boolean;
}): CausationResult {
  const d = (params.description || "").toLowerCase();
  const isRearImpact =
    params.collisionScenario === "rear_end_struck" ||
    params.collisionScenario === "rear_end_striking";

  if (!isRearImpact) {
    return { impactCausation: null, reversingNarrativeContradiction: null, causationSpeedCeilingKmh: null, isRearImpact: false };
  }

  const selfReversingKeywords = [
    "i was reversing", "i reversed", "was reversing", "reversing out",
    "reversed out", "backing out", "backed out", "reversing from",
    "reversed from", "i was backing", "my vehicle was reversing",
    "reversing into", "reversed into", "reversing when",
  ];
  const thirdPartyReversingKeywords = [
    "reversed into me", "reversed into my", "was reversing into",
    "reversed into the", "third party reversed", "other vehicle reversed",
    "other car reversed", "they reversed", "he reversed into", "she reversed into",
  ];
  const thirdPartyForwardStrikeKeywords = [
    "hit from behind", "struck from behind", "rammed from behind",
    "drove into the back", "drove into my", "collided into the back",
    "came from behind", "came into the back", "another vehicle hit",
    "another car hit", "third party hit", "third party struck",
    "other vehicle hit", "other car hit", "was rear-ended", "was rear ended",
  ];

  const isSelfReversing = selfReversingKeywords.some(kw => d.includes(kw));
  const isThirdPartyReversing = thirdPartyReversingKeywords.some(kw => d.includes(kw));
  const isThirdPartyForwardStrike = thirdPartyForwardStrikeKeywords.some(kw => d.includes(kw));

  let impactCausation: ImpactCausation;
  let causationSpeedCeilingKmh: number | null = null;

  if (isSelfReversing && !isThirdPartyForwardStrike) {
    impactCausation = "SELF_REVERSING";
    causationSpeedCeilingKmh = 20;
  } else if (isThirdPartyReversing) {
    impactCausation = "THIRD_PARTY_REVERSED_INTO_CLAIMANT";
    causationSpeedCeilingKmh = 20;
  } else if (isThirdPartyForwardStrike || params.isStruckParty) {
    impactCausation = "THIRD_PARTY_REAR_STRIKE";
    causationSpeedCeilingKmh = null;
  } else {
    impactCausation = "UNKNOWN";
    causationSpeedCeilingKmh = null;
  }

  // Active vs. passive third-party distinction
  const hasThirdPartyName = !!(params.thirdPartyName && params.thirdPartyName.trim().length > 2);
  const hasThirdPartyVehicle = !!(params.thirdPartyVehicle && params.thirdPartyVehicle.trim().length > 2);
  const hasPoliceReport = !!(params.policeReportNumber && params.policeReportNumber.trim().length > 2);
  const isParkingLot = params.isParkingLotDamage ?? false;

  const passiveObjectKeywords = [
    "parked", "was parked", "stationary", "unattended", "standing",
    "parked car", "parked vehicle", "parked truck", "parked bakkie",
    "into a parked", "into the parked", "into a stationary",
    "into a wall", "into a gate", "into a pole", "into a fence",
    "into a barrier", "into a bollard", "into a pillar",
  ];
  const activeThirdPartyMotionKeywords = [
    "was driving", "was moving", "came towards", "drove towards",
    "was travelling", "was traveling", "was coming", "approached",
    "was approaching", "other driver", "other vehicle was",
    "third party was driving", "third party was moving",
  ];

  const isPassiveThirdParty = passiveObjectKeywords.some(kw => d.includes(kw)) || isParkingLot;
  const isActiveThirdParty = (
    isThirdPartyForwardStrike ||
    activeThirdPartyMotionKeywords.some(kw => d.includes(kw)) ||
    (hasPoliceReport && !isPassiveThirdParty)
  );

  let reversingNarrativeContradiction: boolean;
  if (impactCausation === "SELF_REVERSING" && isActiveThirdParty && !isPassiveThirdParty) {
    reversingNarrativeContradiction = true;
  } else {
    reversingNarrativeContradiction = false;
  }

  return { impactCausation, reversingNarrativeContradiction, causationSpeedCeilingKmh, isRearImpact: true };
}

function computeBrakingDistance(speedKmh: number, description: string): { distanceM: number; mu: number; roadSurface: string } {
  const d = (description || "").toLowerCase();
  let mu = 0.7;
  let roadSurface = "dry tarmac";
  if (d.includes("wet") || d.includes("rain") || d.includes("slippery") || d.includes("muddy")) {
    mu = 0.4;
    roadSurface = "wet road";
  } else if (d.includes("gravel") || d.includes("dirt") || d.includes("sand") || d.includes("loose")) {
    mu = 0.3;
    roadSurface = "gravel/dirt";
  }
  const v = speedKmh / 3.6; // m/s
  const g = 9.81;
  const distanceM = (v * v) / (2 * mu * g);
  return { distanceM: Math.round(distanceM * 10) / 10, mu, roadSurface };
}

async function main() {
  console.log("\n=== KINGA CAUSATION CLASSIFIER — LIVE VERIFICATION ===\n");

  // ── 1. Check claim 8400001 ──────────────────────────────────────────────────
  console.log("── Claim 8400001 ──────────────────────────────────────────────────────────");
  try {
    const db = await getDb();
    const [claim8400001] = await db.select().from(claims).where(eq(claims.id, 8400001)).limit(1);
    if (claim8400001) {
      const desc = claim8400001.incidentDescription || "(no description)";
      console.log(`  Claim number: ${claim8400001.claimNumber}`);
      console.log(`  Description: ${desc.substring(0, 200)}`);
      console.log(`  Status: ${claim8400001.status}`);
      // Check if it has a rear-impact scenario from ai_assessments
      console.log("  → This claim needs to be checked for rear-impact scenario in ai_assessments");
    } else {
      console.log("  Claim 8400001 not found in DB");
    }
  } catch (e) {
    console.log(`  Error: ${e}`);
  }

  // ── 2. Find real rear-impact claims from DB ─────────────────────────────────
  console.log("\n── Real rear-impact claims from DB ───────────────────────────────────────");
  try {
    const db2 = await getDb();
    const rearClaims = await db2.select({
      id: claims.id,
      claimNumber: claims.claimNumber,
      incidentDescription: claims.incidentDescription,
      status: claims.status,
    }).from(claims).where(
      or(
        like(claims.incidentDescription, "%reversing%"),
        like(claims.incidentDescription, "%reversed%"),
        like(claims.incidentDescription, "%rear%"),
        like(claims.incidentDescription, "%hit from behind%"),
        like(claims.incidentDescription, "%backing%"),
      )
    ).limit(5);

    console.log(`  Found ${rearClaims.length} rear-impact claims in DB`);
    for (const c of rearClaims) {
      const desc = c.incidentDescription || "";
      console.log(`\n  Claim: ${c.claimNumber} (id=${c.id})`);
      console.log(`  Description: ${desc.substring(0, 300)}`);

      // Determine scenario from keywords
      const d = desc.toLowerCase();
      let scenario = "rear_end_struck";
      if (d.includes("reversing") || d.includes("reversed") || d.includes("backing")) {
        scenario = "rear_end_striking";
      }

      const result = classifyCausation({
        description: desc,
        collisionScenario: scenario,
        thirdPartyName: null,
        thirdPartyVehicle: null,
        policeReportNumber: null,
        isParkingLotDamage: false,
        isStruckParty: scenario === "rear_end_struck",
      });

      console.log(`  → Causation: ${result.impactCausation}`);
      console.log(`  → Speed ceiling: ${result.causationSpeedCeilingKmh ?? "none"} km/h`);
      console.log(`  → Contradiction flag: ${result.reversingNarrativeContradiction}`);

      // Braking distance if speed available
      const speedMatch = desc.match(/(\d+)\s*km\/?h/i);
      if (speedMatch) {
        const speed = parseInt(speedMatch[1]);
        const braking = computeBrakingDistance(speed, desc);
        console.log(`  → Speed: ${speed} km/h → Braking distance: ${braking.distanceM}m (μ=${braking.mu}, ${braking.roadSurface})`);
      }
    }
  } catch (e) {
    console.log(`  Error: ${e}`);
  }

  // ── 3. Synthetic test cases ─────────────────────────────────────────────────
  console.log("\n── Synthetic test cases ──────────────────────────────────────────────────");

  const testCases = [
    {
      label: "SELF_REVERSING into parked car (should NOT fire contradiction)",
      description: "I was reversing out of my driveway and reversed into a parked car belonging to my neighbour John Smith.",
      collisionScenario: "rear_end_striking",
      thirdPartyName: "John Smith",
      thirdPartyVehicle: "Toyota Corolla",
      policeReportNumber: null,
      isParkingLotDamage: false,
      isStruckParty: false,
      speedKmh: 15,
    },
    {
      label: "SELF_REVERSING with active third party (SHOULD fire contradiction)",
      description: "I was reversing out of a parking bay when another vehicle was driving past and we collided. The other driver was moving at the time.",
      collisionScenario: "rear_end_striking",
      thirdPartyName: "James Moyo",
      thirdPartyVehicle: "Honda Fit",
      policeReportNumber: "ZRP/2026/1234",
      isParkingLotDamage: false,
      isStruckParty: false,
      speedKmh: 30,
    },
    {
      label: "THIRD_PARTY_REAR_STRIKE (clean, no contradiction)",
      description: "I was stationary at a red traffic light when another vehicle hit me from behind at approximately 60 km/h. I was rear-ended by the third party.",
      collisionScenario: "rear_end_struck",
      thirdPartyName: "Chiedza Mutasa",
      thirdPartyVehicle: "Mazda 3",
      policeReportNumber: "ZRP/2026/5678",
      isParkingLotDamage: false,
      isStruckParty: true,
      speedKmh: 60,
    },
    {
      label: "SELF_REVERSING into wall (passive, no third party, no contradiction)",
      description: "I was reversing into my garage and reversed into the wall. There was no other vehicle involved.",
      collisionScenario: "rear_end_striking",
      thirdPartyName: null,
      thirdPartyVehicle: null,
      policeReportNumber: null,
      isParkingLotDamage: false,
      isStruckParty: false,
      speedKmh: 10,
    },
    {
      label: "SELF_REVERSING at implausible speed (speed ceiling breach scenario)",
      description: "I was reversing out of a parking bay when I collided with a stationary vehicle. I was travelling at approximately 45 km/h.",
      collisionScenario: "rear_end_striking",
      thirdPartyName: null,
      thirdPartyVehicle: null,
      policeReportNumber: null,
      isParkingLotDamage: true,
      isStruckParty: false,
      speedKmh: 45,
    },
  ];

  for (const tc of testCases) {
    console.log(`\n  TEST: ${tc.label}`);
    console.log(`  Description: "${tc.description.substring(0, 150)}"`);
    const result = classifyCausation({
      description: tc.description,
      collisionScenario: tc.collisionScenario,
      thirdPartyName: tc.thirdPartyName,
      thirdPartyVehicle: tc.thirdPartyVehicle,
      policeReportNumber: tc.policeReportNumber,
      isParkingLotDamage: tc.isParkingLotDamage,
      isStruckParty: tc.isStruckParty,
    });
    const braking = computeBrakingDistance(tc.speedKmh, tc.description);
    const ceilingBreach = result.causationSpeedCeilingKmh !== null && tc.speedKmh > result.causationSpeedCeilingKmh;

    console.log(`  → Causation: ${result.impactCausation}`);
    console.log(`  → Speed ceiling: ${result.causationSpeedCeilingKmh ?? "none"} km/h | Claimed speed: ${tc.speedKmh} km/h | Breach: ${ceilingBreach ? "⚠ YES" : "✓ NO"}`);
    console.log(`  → Contradiction flag: ${result.reversingNarrativeContradiction ? "⚠ FIRED" : "✓ SUPPRESSED"}`);
    console.log(`  → Braking distance @ ${tc.speedKmh} km/h: ${braking.distanceM}m (μ=${braking.mu}, ${braking.roadSurface})`);
  }

  console.log("\n=== VERIFICATION COMPLETE ===\n");
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
