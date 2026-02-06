import { drizzle } from "drizzle-orm/mysql2";
import { panelBeaters } from "./drizzle/schema.ts";
import "dotenv/config";

const db = drizzle(process.env.DATABASE_URL);

async function seedPanelBeaters() {
  console.log("Seeding panel beaters...");
  
  const panelBeatersData = [
    {
      name: "John Moyo",
      businessName: "Moyo Auto Body Repairs",
      email: "john@moyoauto.co.zw",
      phone: "+263 77 123 4567",
      address: "15 Seke Road",
      city: "Harare",
      approved: 1,
    },
    {
      name: "Sarah Ncube",
      businessName: "Ncube Panel Beaters",
      email: "sarah@ncubepanel.co.zw",
      phone: "+263 77 234 5678",
      address: "42 Bulawayo Street",
      city: "Bulawayo",
      approved: 1,
    },
    {
      name: "David Chikwanha",
      businessName: "Chikwanha Auto Works",
      email: "david@chikwanhaauto.co.zw",
      phone: "+263 77 345 6789",
      address: "8 Mutare Road",
      city: "Mutare",
      approved: 1,
    },
    {
      name: "Grace Mlambo",
      businessName: "Mlambo Vehicle Repairs",
      email: "grace@mlambovehicle.co.zw",
      phone: "+263 77 456 7890",
      address: "23 Kwekwe Avenue",
      city: "Kwekwe",
      approved: 1,
    },
    {
      name: "Peter Sibanda",
      businessName: "Sibanda Auto Clinic",
      email: "peter@sibandaauto.co.zw",
      phone: "+263 77 567 8901",
      address: "67 Victoria Falls Road",
      city: "Victoria Falls",
      approved: 1,
    },
  ];

  for (const pb of panelBeatersData) {
    await db.insert(panelBeaters).values(pb);
  }

  console.log(`✅ Seeded ${panelBeatersData.length} panel beaters`);
}

async function main() {
  try {
    await seedPanelBeaters();
    console.log("✅ Database seeding completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding database:", error);
    process.exit(1);
  }
}

main();
