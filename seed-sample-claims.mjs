/**
 * Comprehensive Sample Claims Seeding Script
 * 
 * Creates realistic claims with complete workflow data:
 * - Claims at various stages (submitted, under_assessment, completed)
 * - AI assessments with realistic cost estimates
 * - Assessor evaluations with detailed reports
 * - Panel beater quotes with itemized breakdowns
 * - Audit trail entries for all actions
 */

import { drizzle } from "drizzle-orm/mysql2";
import { config } from "dotenv";

config();

const db = drizzle(process.env.DATABASE_URL);

async function seedSampleClaims() {
  console.log("Starting comprehensive sample claims seeding...");

  try {
    // Get existing users and panel beaters
    const [users] = await db.execute("SELECT * FROM users WHERE role IN ('claimant', 'assessor')");
    const [panelBeaters] = await db.execute("SELECT * FROM panel_beaters LIMIT 5");

    if (users.length === 0) {
      console.log("No users found. Please run seed-test-users.mjs first.");
      return;
    }

    if (panelBeaters.length === 0) {
      console.log("No panel beaters found. Please run seed-data.mjs first.");
      return;
    }

    const claimant = users.find(u => u.role === 'claimant');
    const assessor = users.find(u => u.role === 'assessor');

    if (!claimant || !assessor) {
      console.log("Missing required user roles. Please ensure test users exist.");
      return;
    }

    // Sample claims data
    const sampleClaims = [
      {
        claimantId: claimant.id,
        vehicleMake: "Toyota",
        vehicleModel: "Camry",
        vehicleYear: 2020,
        vehicleRegistration: "ABC123GP",
        incidentDate: new Date("2024-01-15"),
        incidentDescription: "Rear-end collision at traffic light. Significant damage to rear bumper, tail lights, and trunk lid. No injuries reported.",
        damagePhotos: JSON.stringify([
          "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800",
          "https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?w=800"
        ]),
        status: "under_assessment",
        policyVerified: true,
        assignedAssessorId: assessor.id,
        selectedPanelBeaterIds: JSON.stringify([panelBeaters[0].id, panelBeaters[1].id, panelBeaters[2].id])
      },
      {
        claimantId: claimant.id,
        vehicleMake: "Honda",
        vehicleModel: "Civic",
        vehicleYear: 2019,
        vehicleRegistration: "XYZ789GP",
        incidentDate: new Date("2024-01-20"),
        incidentDescription: "Side impact collision. Driver side door, front fender, and side mirror damaged. Airbags did not deploy.",
        damagePhotos: JSON.stringify([
          "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800"
        ]),
        status: "submitted",
        policyVerified: false,
        selectedPanelBeaterIds: JSON.stringify([panelBeaters[1].id, panelBeaters[2].id, panelBeaters[3].id])
      },
      {
        claimantId: claimant.id,
        vehicleMake: "BMW",
        vehicleModel: "3 Series",
        vehicleYear: 2021,
        vehicleRegistration: "DEF456GP",
        incidentDate: new Date("2024-01-10"),
        incidentDescription: "Front-end collision with stationary object. Hood, front bumper, and headlights damaged. Possible radiator damage.",
        damagePhotos: JSON.stringify([
          "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800",
          "https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?w=800",
          "https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=800"
        ]),
        status: "quote_comparison",
        policyVerified: true,
        assignedAssessorId: assessor.id,
        selectedPanelBeaterIds: JSON.stringify([panelBeaters[0].id, panelBeaters[2].id, panelBeaters[4].id])
      },
      {
        claimantId: claimant.id,
        vehicleMake: "Mercedes-Benz",
        vehicleModel: "C-Class",
        vehicleYear: 2022,
        vehicleRegistration: "GHI789GP",
        incidentDate: new Date("2024-01-25"),
        incidentDescription: "Minor parking lot incident. Scratches and dents on rear quarter panel. Paint damage visible.",
        damagePhotos: JSON.stringify([
          "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800"
        ]),
        status: "submitted",
        policyVerified: false,
        selectedPanelBeaterIds: JSON.stringify([panelBeaters[1].id, panelBeaters[3].id, panelBeaters[4].id])
      },
      {
        claimantId: claimant.id,
        vehicleMake: "Volkswagen",
        vehicleModel: "Golf",
        vehicleYear: 2018,
        vehicleRegistration: "JKL012GP",
        incidentDate: new Date("2024-01-05"),
        incidentDescription: "Hail damage across entire vehicle. Multiple dents on hood, roof, and trunk. Windshield cracked.",
        damagePhotos: JSON.stringify([
          "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800",
          "https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?w=800"
        ]),
        status: "completed",
        policyVerified: true,
        assignedAssessorId: assessor.id,
        selectedPanelBeaterIds: JSON.stringify([panelBeaters[0].id, panelBeaters[1].id, panelBeaters[2].id])
      }
    ];

    // Insert claims
    console.log("Inserting sample claims...");
    const claimIds = [];
    
    for (const claim of sampleClaims) {
      const [result] = await db.execute(
        `INSERT INTO claims (
          claimantId, vehicleMake, vehicleModel, vehicleYear, vehicleRegistration,
          incidentDate, incidentDescription, damagePhotos, status, policyVerified,
          assignedAssessorId, selectedPanelBeaterIds, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          claim.claimantId,
          claim.vehicleMake,
          claim.vehicleModel,
          claim.vehicleYear,
          claim.vehicleRegistration,
          claim.incidentDate,
          claim.incidentDescription,
          claim.damagePhotos,
          claim.status,
          claim.policyVerified ? 1 : 0,
          claim.assignedAssessorId || null,
          claim.selectedPanelBeaterIds
        ]
      );
      claimIds.push(result.insertId);
      console.log(`✓ Created claim #${result.insertId}: ${claim.vehicleMake} ${claim.vehicleModel}`);
    }

    // Add AI assessments for claims under assessment or completed
    console.log("\nAdding AI assessments...");
    const aiAssessments = [
      {
        claimId: claimIds[0], // Toyota Camry - under_assessment
        totalCost: 15000,
        laborCost: 6000,
        partsCost: 9000,
        repairDuration: 5,
        damageAssessment: "Moderate rear-end damage. Bumper replacement required, trunk lid needs panel beating and repainting. Both tail light assemblies damaged. Structural integrity appears intact.",
        fraudRisk: "low",
        recommendations: "Recommend full bumper replacement rather than repair. Check for hidden frame damage during disassembly."
      },
      {
        claimId: claimIds[2], // BMW 3 Series - quote_comparison
        totalCost: 28000,
        laborCost: 12000,
        partsCost: 16000,
        repairDuration: 8,
        damageAssessment: "Significant front-end damage. Hood, bumper, and both headlights require replacement. Radiator shows signs of impact damage. Front grille and crash bar damaged.",
        fraudRisk: "medium",
        recommendations: "Inspect cooling system thoroughly. Check for airbag sensor damage. Recommend alignment check after repairs."
      },
      {
        claimId: claimIds[4], // VW Golf - completed
        totalCost: 22000,
        laborCost: 14000,
        partsCost: 8000,
        repairDuration: 10,
        damageAssessment: "Extensive hail damage across all horizontal surfaces. Approximately 45 dents requiring paintless dent removal. Windshield replacement necessary due to crack.",
        fraudRisk: "low",
        recommendations: "PDR (Paintless Dent Removal) recommended for most dents. Full windshield replacement required. No structural damage detected."
      }
    ];

    for (const assessment of aiAssessments) {
      await db.execute(
        `INSERT INTO ai_assessments (
          claimId, totalCost, laborCost, partsCost, repairDuration,
          damageAssessment, fraudRisk, recommendations, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          assessment.claimId,
          assessment.totalCost,
          assessment.laborCost,
          assessment.partsCost,
          assessment.repairDuration,
          assessment.damageAssessment,
          assessment.fraudRisk,
          assessment.recommendations
        ]
      );
      console.log(`✓ Added AI assessment for claim #${assessment.claimId}`);
    }

    // Add assessor evaluations
    console.log("\nAdding assessor evaluations...");
    const assessorEvaluations = [
      {
        claimId: claimIds[0], // Toyota Camry
        assessorId: assessor.id,
        totalCost: 14500,
        laborCost: 5800,
        partsCost: 8700,
        repairDuration: 5,
        damageAssessment: "Confirmed rear-end damage assessment. Bumper replacement and trunk lid repair required. Tail lights both damaged beyond repair.",
        fraudRisk: "low",
        recommendations: "Agree with AI assessment. No signs of pre-existing damage or fraud."
      },
      {
        claimId: claimIds[2], // BMW 3 Series
        assessorId: assessor.id,
        totalCost: 26500,
        laborCost: 11000,
        partsCost: 15500,
        repairDuration: 7,
        damageAssessment: "Front-end damage confirmed. Radiator damage less severe than AI estimated. Hood and bumper require replacement.",
        fraudRisk: "low",
        recommendations: "Radiator can be repaired rather than replaced, reducing costs. Otherwise agree with AI assessment."
      }
    ];

    for (const evaluation of assessorEvaluations) {
      await db.execute(
        `INSERT INTO assessor_evaluations (
          claimId, assessorId, totalCost, laborCost, partsCost, repairDuration,
          damageAssessment, fraudRisk, recommendations, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          evaluation.claimId,
          evaluation.assessorId,
          evaluation.totalCost,
          evaluation.laborCost,
          evaluation.partsCost,
          evaluation.repairDuration,
          evaluation.damageAssessment,
          evaluation.fraudRisk,
          evaluation.recommendations
        ]
      );
      console.log(`✓ Added assessor evaluation for claim #${evaluation.claimId}`);
    }

    // Add panel beater quotes
    console.log("\nAdding panel beater quotes...");
    const panelBeaterQuotes = [
      {
        claimId: claimIds[2], // BMW 3 Series - has multiple quotes for comparison
        panelBeaterId: panelBeaters[0].id,
        totalCost: 27500,
        laborCost: 11500,
        partsCost: 16000,
        repairDuration: 8,
        itemizedBreakdown: JSON.stringify([
          { item: "Front bumper replacement", cost: 4500 },
          { item: "Hood replacement", cost: 6000 },
          { item: "Headlight assemblies (both)", cost: 3500 },
          { item: "Radiator replacement", cost: 2000 },
          { item: "Labor - disassembly and reassembly", cost: 7000 },
          { item: "Paint and finishing", cost: 4500 }
        ]),
        notes: "Premium OEM parts used. Includes full warranty on parts and labor."
      },
      {
        claimId: claimIds[2], // BMW 3 Series - second quote
        panelBeaterId: panelBeaters[2].id,
        totalCost: 31000,
        laborCost: 13000,
        partsCost: 18000,
        repairDuration: 9,
        itemizedBreakdown: JSON.stringify([
          { item: "Front bumper replacement (OEM)", cost: 5500 },
          { item: "Hood replacement (OEM)", cost: 7000 },
          { item: "Headlight assemblies (OEM)", cost: 4000 },
          { item: "Radiator replacement", cost: 1500 },
          { item: "Labor - disassembly and reassembly", cost: 8000 },
          { item: "Paint and finishing (premium)", cost: 5000 }
        ]),
        notes: "All genuine BMW parts. Extended warranty included. Specialized BMW technicians."
      },
      {
        claimId: claimIds[2], // BMW 3 Series - third quote (suspiciously high - fraud indicator)
        panelBeaterId: panelBeaters[4].id,
        totalCost: 42000,
        laborCost: 18000,
        partsCost: 24000,
        repairDuration: 12,
        itemizedBreakdown: JSON.stringify([
          { item: "Front bumper replacement", cost: 8000 },
          { item: "Hood replacement", cost: 9000 },
          { item: "Headlight assemblies", cost: 5000 },
          { item: "Radiator and cooling system", cost: 2000 },
          { item: "Labor - extensive repairs", cost: 12000 },
          { item: "Paint and finishing", cost: 6000 }
        ]),
        notes: "Comprehensive repair with additional reinforcement work recommended."
      }
    ];

    for (const quote of panelBeaterQuotes) {
      await db.execute(
        `INSERT INTO panel_beater_quotes (
          claimId, panelBeaterId, totalCost, laborCost, partsCost, repairDuration,
          itemizedBreakdown, notes, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          quote.claimId,
          quote.panelBeaterId,
          quote.totalCost,
          quote.laborCost,
          quote.partsCost,
          quote.repairDuration,
          quote.itemizedBreakdown,
          quote.notes
        ]
      );
      console.log(`✓ Added panel beater quote for claim #${quote.claimId}`);
    }

    // Add audit trail entries
    console.log("\nAdding audit trail entries...");
    const auditEntries = [
      { claimId: claimIds[0], userId: claimant.id, action: "claim_submitted", details: "Claim submitted by claimant" },
      { claimId: claimIds[0], userId: assessor.id, action: "policy_verified", details: "Policy verification approved" },
      { claimId: claimIds[0], userId: assessor.id, action: "assessor_assigned", details: `Assessor ${assessor.name} assigned to claim` },
      { claimId: claimIds[0], userId: assessor.id, action: "ai_assessment_triggered", details: "AI damage assessment initiated" },
      { claimId: claimIds[2], userId: claimant.id, action: "claim_submitted", details: "Claim submitted by claimant" },
      { claimId: claimIds[2], userId: assessor.id, action: "policy_verified", details: "Policy verification approved" },
      { claimId: claimIds[2], userId: assessor.id, action: "assessor_assigned", details: `Assessor ${assessor.name} assigned to claim` },
      { claimId: claimIds[2], userId: assessor.id, action: "ai_assessment_completed", details: "AI assessment completed with estimated cost of R28,000" },
      { claimId: claimIds[2], userId: assessor.id, action: "assessor_evaluation_submitted", details: "Assessor evaluation submitted with estimated cost of R26,500" },
      { claimId: claimIds[2], userId: panelBeaters[0].id, action: "quote_submitted", details: "Panel beater quote submitted: R27,500" },
      { claimId: claimIds[2], userId: panelBeaters[2].id, action: "quote_submitted", details: "Panel beater quote submitted: R31,000" },
      { claimId: claimIds[2], userId: panelBeaters[4].id, action: "quote_submitted", details: "Panel beater quote submitted: R42,000 (HIGH - potential fraud)" }
    ];

    for (const entry of auditEntries) {
      await db.execute(
        `INSERT INTO audit_trail (claimId, userId, action, details, createdAt)
         VALUES (?, ?, ?, ?, NOW())`,
        [entry.claimId, entry.userId, entry.action, entry.details]
      );
    }
    console.log(`✓ Added ${auditEntries.length} audit trail entries`);

    console.log("\n✅ Sample claims seeding completed successfully!");
    console.log("\nSummary:");
    console.log(`- ${sampleClaims.length} claims created`);
    console.log(`- ${aiAssessments.length} AI assessments added`);
    console.log(`- ${assessorEvaluations.length} assessor evaluations added`);
    console.log(`- ${panelBeaterQuotes.length} panel beater quotes added`);
    console.log(`- ${auditEntries.length} audit trail entries added`);
    console.log("\nYou can now test:");
    console.log("1. Claims triage workflow");
    console.log("2. AI assessment comparison");
    console.log("3. Assessor evaluations");
    console.log("4. Panel beater quotes with fraud detection");
    console.log("5. Complete audit trail");

  } catch (error) {
    console.error("Error seeding sample claims:", error);
    throw error;
  }
}

seedSampleClaims()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
