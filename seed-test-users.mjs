/**
 * Seed Test Users Script
 * 
 * Creates test user accounts for all four KINGA roles:
 * - Insurer/Admin
 * - Assessor
 * - Panel Beater  
 * - Claimant
 */

import { drizzle } from "drizzle-orm/mysql2";
import { users } from "./drizzle/schema.ts";

const db = drizzle(process.env.DATABASE_URL);

async function seedTestUsers() {
  console.log("🌱 Seeding test users...");

  const testUsers = [
    {
      openId: "test-insurer-001",
      name: "Sarah Johnson",
      email: "insurer@kinga-test.com",
      loginMethod: "test",
      role: "insurer",
    },
    {
      openId: "test-assessor-001",
      name: "Michael Chen",
      email: "assessor@kinga-test.com",
      loginMethod: "test",
      role: "assessor",
    },
    {
      openId: "test-assessor-002",
      name: "Emily Rodriguez",
      email: "assessor2@kinga-test.com",
      loginMethod: "test",
      role: "assessor",
    },
    {
      openId: "test-panelbeater-001",
      name: "David Mbeki",
      email: "panelbeater@kinga-test.com",
      loginMethod: "test",
      role: "panel_beater",
    },
    {
      openId: "test-claimant-001",
      name: "Jessica Williams",
      email: "claimant@kinga-test.com",
      loginMethod: "test",
      role: "claimant",
    },
    {
      openId: "test-claimant-002",
      name: "Robert Taylor",
      email: "claimant2@kinga-test.com",
      loginMethod: "test",
      role: "claimant",
    },
  ];

  for (const user of testUsers) {
    try {
      await db.insert(users).values(user).onDuplicateKeyUpdate({
        set: {
          name: user.name,
          email: user.email,
          role: user.role,
          lastSignedIn: new Date(),
        },
      });
      console.log(`✅ Created/updated test user: ${user.name} (${user.role})`);
    } catch (error) {
      console.error(`❌ Failed to create user ${user.name}:`, error.message);
    }
  }

  console.log("\n✨ Test users seeding complete!");
  console.log("\nTest Accounts:");
  console.log("━".repeat(60));
  console.log("Role          | Name                | Email");
  console.log("━".repeat(60));
  testUsers.forEach(u => {
    console.log(`${u.role.padEnd(13)} | ${u.name.padEnd(19)} | ${u.email}`);
  });
  console.log("━".repeat(60));
  console.log("\nNote: These are test accounts with fake openIds.");
  console.log("In production, users will authenticate via Manus OAuth.");
  
  process.exit(0);
}

seedTestUsers().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
