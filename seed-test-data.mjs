import { drizzle } from "drizzle-orm/mysql2";
import { users, claims } from "./drizzle/schema.ts";
import { nanoid } from "nanoid";
import "dotenv/config";

const db = drizzle(process.env.DATABASE_URL);

async function seedTestUsers() {
  console.log("Seeding test users...");
  
  const testUsers = [
    {
      openId: `assessor-${nanoid(10)}`,
      name: "Dr. James Mutasa",
      email: "james.mutasa@kinga.co.zw",
      loginMethod: "test",
      role: "assessor",
    },
    {
      openId: `assessor-${nanoid(10)}`,
      name: "Dr. Linda Moyo",
      email: "linda.moyo@kinga.co.zw",
      loginMethod: "test",
      role: "assessor",
    },
    {
      openId: `claimant-${nanoid(10)}`,
      name: "Michael Ncube",
      email: "michael.ncube@example.com",
      loginMethod: "test",
      role: "claimant",
    },
    {
      openId: `claimant-${nanoid(10)}`,
      name: "Sarah Chikwanha",
      email: "sarah.chikwanha@example.com",
      loginMethod: "test",
      role: "claimant",
    },
    {
      openId: `panel_beater-${nanoid(10)}`,
      name: "John Moyo",
      email: "john@moyoauto.co.zw",
      loginMethod: "test",
      role: "panel_beater",
    },
  ];

  for (const user of testUsers) {
    await db.insert(users).values(user);
  }

  console.log(`✅ Seeded ${testUsers.length} test users`);
  return testUsers;
}

async function seedTestClaims() {
  console.log("Seeding test claims...");
  
  // Get claimant and assessor IDs
  const allUsers = await db.select().from(users);
  const claimants = allUsers.filter(u => u.role === "claimant");
  const assessors = allUsers.filter(u => u.role === "assessor");
  
  if (claimants.length === 0) {
    console.log("⚠️  No claimants found, skipping claims seeding");
    return;
  }

  const testClaims = [
    {
      claimantId: claimants[0].id,
      claimNumber: `CLM-${nanoid(10).toUpperCase()}`,
      vehicleMake: "Toyota",
      vehicleModel: "Corolla",
      vehicleYear: 2020,
      vehicleRegistration: "AEZ 1234",
      incidentDate: new Date("2026-01-15"),
      incidentDescription: "Rear-end collision at traffic light on Samora Machel Avenue. Other vehicle failed to stop in time.",
      incidentLocation: "Samora Machel Avenue & Second Street, Harare",
      damagePhotos: JSON.stringify([
        "/placeholder-damage-1.jpg",
        "/placeholder-damage-2.jpg",
        "/placeholder-damage-3.jpg"
      ]),
      policyNumber: "POL-2024-001234",
      selectedPanelBeaterIds: JSON.stringify([1, 2, 3]),
      status: "submitted",
      policyVerified: 1,
      assignedAssessorId: assessors.length > 0 ? assessors[0].id : null,
    },
    {
      claimantId: claimants.length > 1 ? claimants[1].id : claimants[0].id,
      claimNumber: `CLM-${nanoid(10).toUpperCase()}`,
      vehicleMake: "Honda",
      vehicleModel: "Fit",
      vehicleYear: 2019,
      vehicleRegistration: "ABY 5678",
      incidentDate: new Date("2026-01-20"),
      incidentDescription: "Side impact collision at intersection. Other driver ran red light.",
      incidentLocation: "Robert Mugabe Road & Angwa Street, Harare",
      damagePhotos: JSON.stringify([
        "/placeholder-damage-4.jpg",
        "/placeholder-damage-5.jpg"
      ]),
      policyNumber: "POL-2024-005678",
      selectedPanelBeaterIds: JSON.stringify([2, 3, 4]),
      status: "assessment_pending",
      policyVerified: 1,
      assignedAssessorId: assessors.length > 1 ? assessors[1].id : (assessors.length > 0 ? assessors[0].id : null),
    },
    {
      claimantId: claimants[0].id,
      claimNumber: `CLM-${nanoid(10).toUpperCase()}`,
      vehicleMake: "Nissan",
      vehicleModel: "X-Trail",
      vehicleYear: 2021,
      vehicleRegistration: "AEP 9012",
      incidentDate: new Date("2026-01-25"),
      incidentDescription: "Front bumper damage from parking lot incident. Hit concrete pillar while reversing.",
      incidentLocation: "Sam Levy's Village Parking, Borrowdale, Harare",
      damagePhotos: JSON.stringify([
        "/placeholder-damage-6.jpg"
      ]),
      policyNumber: "POL-2024-009012",
      selectedPanelBeaterIds: JSON.stringify([1, 3, 5]),
      status: "submitted",
      policyVerified: null,
      assignedAssessorId: null,
    },
  ];

  for (const claim of testClaims) {
    await db.insert(claims).values(claim);
  }

  console.log(`✅ Seeded ${testClaims.length} test claims`);
}

async function main() {
  try {
    await seedTestUsers();
    await seedTestClaims();
    console.log("✅ Test data seeding completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding test data:", error);
    process.exit(1);
  }
}

main();
