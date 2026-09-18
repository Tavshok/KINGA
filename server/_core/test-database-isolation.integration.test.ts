import { expect, test } from "vitest";
import { sql } from "drizzle-orm";
import { getDb } from "../db";

test("test processes connect only to the dedicated local CI database", async () => {
  const db = await getDb();
  expect(db).not.toBeNull();

  const result = await db!.execute(sql`SELECT DATABASE() AS database_name`);
  const row = Array.isArray(result) ? result[0]?.[0] : undefined;
  expect(row).toMatchObject({ database_name: "kinga_ci_test" });
});
