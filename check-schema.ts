import { createConnection } from "mysql2/promise";

async function main() {
  const db = await createConnection(process.env.DATABASE_URL!);
  
  // Get actual DB columns for ai_assessments
  const [cols] = await db.execute(`
    SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'ai_assessments'
    ORDER BY ORDINAL_POSITION
  `);
  console.log("=== ai_assessments DB COLUMNS ===");
  (cols as any[]).forEach(c => console.log(`  ${c.COLUMN_NAME} (${c.DATA_TYPE}, nullable=${c.IS_NULLABLE})`));
  
  await db.end();
}
main().catch(console.error);
