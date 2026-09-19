import { afterEach, expect, test } from "vitest";
import { sql } from "drizzle-orm";
import { closeDbPool, getDb } from "./db";

afterEach(async () => {
  await closeDbPool();
});

test("releases and recreates the process-local database pool", async () => {
  await closeDbPool();

  const first = await getDb();
  expect(first).not.toBeNull();
  await first!.execute(sql`SELECT 1`);

  await closeDbPool();

  const second = await getDb();
  expect(second).not.toBeNull();
  expect(second).not.toBe(first);
  await second!.execute(sql`SELECT 1`);
});
