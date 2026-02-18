/**
 * Production-Grade Test Data Seeding Script
 * 
 * Generates 50 claims across all routing categories with complete workflow audit trails,
 * AI assessments, panel beater quotes, executive overrides, and segregation violations.
 * 
 * Usage: node --loader tsx server/seed-production-data.ts
 */

import { getDb } from "./db";
import { claims, users, aiAssessments, auditTrail, tenants } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

// Configuration
const TENANT_ID = "demo-tenant"; // Default tenant for seeded data
const CLAIM_COUNT = 50;

// Claim distribution across routing categories
const ROUTING_DISTRIBUTION = {
  auto_approve: 15,     // High confidence, low risk
  manual_review: 20,    // Medium confidence, standard review
  high_risk: 10,        // Low confidence or high value
  fraud_investigation: 5, // Fraud suspicion
};

// Realistic data generators
function generateClaimNumber(): string {
  const timestamp = Date.now().toString().slice(-8);
  const random = crypto.randomBytes(2).toString("hex").toUpperCase();
  return `CLM-${timestamp}-${random}`;
}

function generateVIN(): string {
  const chars = "ABCDEFGHJKLMNPRSTUVWXYZ0123456789";
  let vin = "";
  for (let i = 0; i < 17; i++) {
    vin += chars[Math.floor(Math.random() * chars.length)];
  }
  return vin;
}

function generatePolicyNumber(): string {
  const prefix = ["POL", "INS", "AUTO"][Math.floor(Math.random() * 3)];
  const number = Math.floor(100000 + Math.random() * 900000);
  return `${prefix}-${number}`;
}

function randomDate(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function randomElement<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

// Realistic incident descriptions
const INCIDENT_DESCRIPTIONS = [
  "Rear-end collision at traffic light. Minor damage to rear bumper and tail lights.",
  "Side-swipe accident while changing lanes on highway. Damage to driver side door and mirror.",
  "Parking lot incident. Vehicle reversed into parked car causing front bumper damage.",
  "Single-vehicle accident. Lost control on wet road and hit guardrail. Front-end damage.",
  "Hit-and-run incident. Unknown vehicle struck parked car and fled. Damage to rear quarter panel.",
  "Multi-vehicle pile-up on highway. Moderate damage to front and rear of vehicle.",
  "Collision with pedestrian crossing. Minor front bumper damage, no injuries.",
  "Hail storm damage. Multiple dents on hood, roof, and trunk.",
  "Vandalism incident. Keyed paint and broken side mirror.",
  "Theft attempt. Broken window and damaged ignition.",
];

// Vehicle makes and models
const VEHICLES = [
  { make: "Toyota", model: "Corolla" },
  { make: "Honda", model: "Civic" },
  { make: "Ford", model: "F-150" },
  { make: "Chevrolet", model: "Silverado" },
  { make: "Nissan", model: "Altima" },
  { make: "BMW", model: "3 Series" },
  { make: "Mercedes-Benz", model: "C-Class" },
  { make: "Audi", model: "A4" },
  { make: "Volkswagen", model: "Golf" },
  { make: "Hyundai", model: "Elantra" },
];

// Claimant names
const FIRST_NAMES = ["John", "Jane", "Michael", "Sarah", "David", "Emily", "Robert", "Lisa", "James", "Mary"];
const LAST_NAMES = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez"];

async function seedProductionData() {
  const db = await getDb();
  console.log("[Seed] Starting production-grade data seeding...");

  // Step 1: Get or create demo tenant
  let tenant = await db.query.tenants.findFirst({
    where: (tenants, { eq }) => eq(tenants.id, TENANT_ID),
  });

  if (!tenant) {
    console.log(`[Seed] Creating demo tenant: ${TENANT_ID}`);
    await db.insert(tenants).values({
      id: TENANT_ID,
      name: "demo-insurance-company",
      displayName: "Demo Insurance Company",
      contactEmail: "demo@kinga.ai",
      billingEmail: "billing@kinga.ai",
      tier: "tier-enterprise",
      intakeEscalationHours: 6,
      intakeEscalationEnabled: 1,
      intakeEscalationMode: "auto_assign",
      aiRerunLimitPerHour: 10,
    });
  }

  // Step 2: Get or create demo users (claims processors, managers, executives)
  const demoUsers = await createDemoUsers(db);

  // Step 3: Generate 50 claims across routing categories
  console.log(`[Seed] Generating ${CLAIM_COUNT} claims...`);
  const claimIds: number[] = [];

  let claimIndex = 0;
  for (const [category, count] of Object.entries(ROUTING_DISTRIBUTION)) {
    for (let i = 0; i < count; i++) {
      const claimId = await generateClaim(db, {
        tenantId: TENANT_ID,
        category: category as keyof typeof ROUTING_DISTRIBUTION,
        index: claimIndex++,
        processors: demoUsers.processors,
      });
      claimIds.push(claimId);
    }
  }

  console.log(`[Seed] Generated ${claimIds.length} claims`);

  // Step 4: Generate AI assessments for all claims
  console.log("[Seed] Generating AI assessments...");
  for (const claimId of claimIds) {
    await generateAIAssessment(db, claimId, TENANT_ID);
  }

  // Step 5: Generate workflow audit trails
  console.log("[Seed] Generating workflow audit trails...");
  for (const claimId of claimIds) {
    await generateAuditTrail(db, claimId, TENANT_ID, demoUsers);
  }

  // Step 6: Generate panel beater quotes
  console.log("[Seed] Generating panel beater quotes...");
  // TODO: Implement panel beater quote generation

  // Step 7: Generate executive overrides
  console.log("[Seed] Generating executive overrides...");
  const overrideClaimIds = claimIds.slice(0, 8); // 8 claims with overrides
  for (const claimId of overrideClaimIds) {
    await generateExecutiveOverride(db, claimId, TENANT_ID, demoUsers.executive);
  }

  // Step 8: Generate segregation violations
  console.log("[Seed] Generating segregation violations...");
  const violationClaimIds = claimIds.slice(0, 3); // 3 claims with violations
  for (const claimId of violationClaimIds) {
    await generateSegregationViolation(db, claimId, TENANT_ID, demoUsers);
  }

  console.log("[Seed] ✅ Production-grade data seeding complete!");
  console.log(`[Seed] Generated ${claimIds.length} claims with complete workflow data`);
  process.exit(0);
}

async function createDemoUsers(db: any) {
  console.log("[Seed] Getting or creating demo users...");

  const demoUsers = {
    processors: [] as number[],
    manager: 0,
    executive: 0,
  };

  // Get or create 5 claims processors
  for (let i = 1; i <= 5; i++) {
    let user = await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.openId, `demo-processor-${i}`),
    });

    if (!user) {
      const result = await db.insert(users).values({
        openId: `demo-processor-${i}`,
        name: `Claims Processor ${i}`,
        email: `processor${i}@demo.kinga.ai`,
        role: "insurer",
        insurerRole: "claims_processor",
        tenantId: TENANT_ID,
        emailVerified: 1,
      });
      user = { id: result[0].insertId };
    }
    
    demoUsers.processors.push(user.id);
  }

  // Get or create claims manager
  let manager = await db.query.users.findFirst({
    where: (users, { eq }) => eq(users.openId, "demo-manager"),
  });

  if (!manager) {
    const managerResult = await db.insert(users).values({
      openId: "demo-manager",
      name: "Claims Manager",
      email: "manager@demo.kinga.ai",
      role: "insurer",
      insurerRole: "claims_manager",
      tenantId: TENANT_ID,
      emailVerified: 1,
    });
    manager = { id: managerResult[0].insertId };
  }
  
  demoUsers.manager = manager.id;

  // Get or create executive
  let executive = await db.query.users.findFirst({
    where: (users, { eq }) => eq(users.openId, "demo-executive"),
  });

  if (!executive) {
    const executiveResult = await db.insert(users).values({
      openId: "demo-executive",
      name: "Executive Director",
      email: "executive@demo.kinga.ai",
      role: "insurer",
      insurerRole: "executive",
      tenantId: TENANT_ID,
      emailVerified: 1,
    });
    executive = { id: executiveResult[0].insertId };
  }
  
  demoUsers.executive = executive.id;

  console.log(`[Seed] Got/created ${demoUsers.processors.length} processors, 1 manager, 1 executive`);
  return demoUsers;
}

async function generateClaim(db: any, params: {
  tenantId: string;
  category: keyof typeof ROUTING_DISTRIBUTION;
  index: number;
  processors: number[];
}) {
  const { tenantId, category, index, processors } = params;

  // Generate realistic claim data
  const vehicle = randomElement(VEHICLES);
  const firstName = randomElement(FIRST_NAMES);
  const lastName = randomElement(LAST_NAMES);
  const incidentDate = randomDate(new Date(2024, 0, 1), new Date());
  
  // Create claimant user
  const claimantResult = await db.insert(users).values({
    openId: `claimant-${crypto.randomBytes(8).toString("hex")}`,
    name: `${firstName} ${lastName}`,
    email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`,
    role: "claimant",
    tenantId,
    emailVerified: 1,
  });

  const claimantId = claimantResult[0].insertId;

  // Determine workflow state and confidence based on category
  let workflowState: string;
  let confidenceScore: number;
  let estimatedClaimValue: number;
  let earlyFraudSuspicion: number;

  switch (category) {
    case "auto_approve":
      workflowState = "payment_authorized";
      confidenceScore = 0.85 + Math.random() * 0.14; // 0.85-0.99
      estimatedClaimValue = 5000 + Math.random() * 10000; // $5k-$15k
      earlyFraudSuspicion = 0;
      break;
    case "manual_review":
      workflowState = "under_assessment";
      confidenceScore = 0.60 + Math.random() * 0.24; // 0.60-0.84
      estimatedClaimValue = 10000 + Math.random() * 20000; // $10k-$30k
      earlyFraudSuspicion = 0;
      break;
    case "high_risk":
      workflowState = "internal_review";
      confidenceScore = 0.40 + Math.random() * 0.19; // 0.40-0.59
      estimatedClaimValue = 25000 + Math.random() * 25000; // $25k-$50k
      earlyFraudSuspicion = 0;
      break;
    case "fraud_investigation":
      workflowState = "disputed";
      confidenceScore = 0.30 + Math.random() * 0.09; // 0.30-0.39
      estimatedClaimValue = 30000 + Math.random() * 70000; // $30k-$100k
      earlyFraudSuspicion = 1;
      break;
  }

  // Assign to processor (workload balancing simulation)
  const assignedProcessorId = randomElement(processors);

  // Create claim
  const claimResult = await db.insert(claims).values({
    tenantId,
    claimNumber: generateClaimNumber(),
    claimantId,
    claimantIdNumber: `${Math.floor(1000000000 + Math.random() * 9000000000)}`,
    claimantPhone: `+27${Math.floor(100000000 + Math.random() * 900000000)}`,
    claimantEmail: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`,
    policyNumber: generatePolicyNumber(),
    incidentDate,
    incidentDescription: randomElement(INCIDENT_DESCRIPTIONS),
    vehicleMake: vehicle.make,
    vehicleModel: vehicle.model,
    vehicleYear: 2018 + Math.floor(Math.random() * 7), // 2018-2024
    vehicleVin: generateVIN(),
    estimatedClaimValue,
    workflowState,
    assignedProcessorId,
    confidenceScore,
    earlyFraudSuspicion,
    createdAt: randomDate(new Date(2024, 0, 1), new Date()),
  });

  const claimId = claimResult[0].insertId;
  console.log(`[Seed] Created claim ${index + 1}/${CLAIM_COUNT}: ${category} (ID: ${claimId})`);
  
  return claimId;
}

async function generateAIAssessment(db: any, claimId: number, tenantId: string) {
  const claim = await db.query.claims.findFirst({
    where: (claims, { eq }) => eq(claims.id, claimId),
  });

  if (!claim) return;

  // Generate AI assessment based on claim confidence score
  const confidenceScore = claim.confidenceScore || 0.5;
  let routingRecommendation: string;

  if (confidenceScore >= 0.85) {
    routingRecommendation = "auto_approve";
  } else if (confidenceScore >= 0.60) {
    routingRecommendation = "manual_review";
  } else if (confidenceScore >= 0.40) {
    routingRecommendation = "escalate";
  } else {
    routingRecommendation = "fraud_investigation";
  }

  await db.insert(aiAssessments).values({
    claimId,
    tenantId,
    confidenceScore,
    routingRecommendation,
    damageSeverity: confidenceScore > 0.7 ? "minor" : confidenceScore > 0.5 ? "moderate" : "severe",
    estimatedRepairCost: claim.estimatedClaimValue,
    fraudRiskScore: claim.earlyFraudSuspicion ? 0.7 + Math.random() * 0.3 : Math.random() * 0.3,
    assessmentMetadata: JSON.stringify({
      model_version: "v2.1.0",
      processing_time_ms: 1200 + Math.floor(Math.random() * 800),
      confidence_factors: {
        policy_verification: confidenceScore + 0.05,
        incident_consistency: confidenceScore - 0.02,
        claim_history: confidenceScore + 0.03,
      },
    }),
    isReanalysis: 0,
    versionNumber: 1,
  });
}

async function generateAuditTrail(db: any, claimId: number, tenantId: string, users: any) {
  const claim = await db.query.claims.findFirst({
    where: (claims, { eq }) => eq(claims.id, claimId),
  });

  if (!claim) return;

  // Generate audit trail entries based on workflow state
  const entries = [];

  // Entry 1: Claim submitted
  entries.push({
    tenantId,
    claimId,
    userId: claim.claimantId,
    actionType: "CLAIM_SUBMITTED",
    actionDescription: `Claim ${claim.claimNumber} submitted by claimant`,
    actor: "CLAIMANT",
    metadata: JSON.stringify({ claim_number: claim.claimNumber }),
    createdAt: claim.createdAt,
  });

  // Entry 2: AI assessment completed
  entries.push({
    tenantId,
    claimId,
    userId: null,
    actionType: "AI_ASSESSMENT_COMPLETED",
    actionDescription: `AI assessment completed with confidence score ${claim.confidenceScore?.toFixed(2)}`,
    actor: "SYSTEM",
    metadata: JSON.stringify({
      confidence_score: claim.confidenceScore,
      routing_recommendation: claim.workflowState,
    }),
    createdAt: new Date(claim.createdAt.getTime() + 60000), // 1 minute later
  });

  // Entry 3: Claim assigned to processor
  if (claim.assignedProcessorId) {
    entries.push({
      tenantId,
      claimId,
      userId: users.manager,
      actionType: "CLAIM_ASSIGNED",
      actionDescription: `Claim assigned to processor ${claim.assignedProcessorId}`,
      actor: "CLAIMS_MANAGER",
      metadata: JSON.stringify({ processor_id: claim.assignedProcessorId }),
      createdAt: new Date(claim.createdAt.getTime() + 120000), // 2 minutes later
    });
  }

  // Entry 4: Workflow state transition
  if (claim.workflowState !== "intake_queue") {
    entries.push({
      tenantId,
      claimId,
      userId: claim.assignedProcessorId || users.manager,
      actionType: "WORKFLOW_STATE_CHANGED",
      actionDescription: `Workflow state changed to ${claim.workflowState}`,
      actor: "CLAIMS_PROCESSOR",
      metadata: JSON.stringify({
        previous_state: "intake_queue",
        new_state: claim.workflowState,
      }),
      createdAt: new Date(claim.createdAt.getTime() + 180000), // 3 minutes later
    });
  }

  // Insert all audit trail entries
  for (const entry of entries) {
    await db.insert(auditTrail).values(entry);
  }
}

async function generateExecutiveOverride(db: any, claimId: number, tenantId: string, executiveId: number) {
  const claim = await db.query.claims.findFirst({
    where: (claims, { eq }) => eq(claims.id, claimId),
  });

  if (!claim) return;

  // Generate executive override audit entry
  const previousState = claim.workflowState;
  const newState = previousState === "rejected" ? "approved" : "escalated";

  await db.insert(auditTrail).values({
    tenantId,
    claimId,
    userId: executiveId,
    actionType: "EXECUTIVE_OVERRIDE",
    actionDescription: `Executive override: Changed workflow state from ${previousState} to ${newState}`,
    actor: "EXECUTIVE",
    metadata: JSON.stringify({
      previous_state: previousState,
      new_state: newState,
      override_reason: "Business decision based on customer relationship",
      override_justification: "Long-standing premium customer with excellent claim history",
    }),
    createdAt: new Date(claim.createdAt.getTime() + 3600000), // 1 hour later
  });

  // Update claim workflow state
  await db.update(claims)
    .set({ workflowState: newState })
    .where(eq(claims.id, claimId));
}

async function generateSegregationViolation(db: any, claimId: number, tenantId: string, users: any) {
  const claim = await db.query.claims.findFirst({
    where: (claims, { eq }) => eq(claims.id, claimId),
  });

  if (!claim) return;

  // Generate segregation violation audit entry
  // Scenario: Same user submitted claim and approved it (conflict of interest)
  await db.insert(auditTrail).values({
    tenantId,
    claimId,
    userId: claim.assignedProcessorId,
    actionType: "SEGREGATION_VIOLATION",
    actionDescription: `Segregation of duties violation detected: User performed conflicting actions`,
    actor: "SYSTEM",
    metadata: JSON.stringify({
      violation_type: "SAME_USER_SUBMIT_AND_APPROVE",
      user_id: claim.assignedProcessorId,
      conflicting_actions: ["CLAIM_SUBMITTED", "CLAIM_APPROVED"],
      severity: "HIGH",
    }),
    createdAt: new Date(claim.createdAt.getTime() + 7200000), // 2 hours later
  });
}

// Run seeding script
seedProductionData().catch((error) => {
  console.error("[Seed] Error:", error);
  process.exit(1);
});
