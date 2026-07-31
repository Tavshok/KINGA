// @ts-nocheck
import { describe, it } from "vitest";
import { getDb } from "./db";
import { users } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { extractInsertId } from "./utils/drizzle-helpers";

describe("Debug insert", () => {
  it("should show what drizzle returns", async () => {
    const db = await getDb();
    const ts = Date.now();
    const result = await db.insert(users).values({
      openId: `debug-insert-${ts}`,
      role: "admin",
    });
    console.log("result type:", typeof result);
    console.log("is array:", Array.isArray(result));
    console.log("result[0]:", result[0]);
    console.log("result[0].insertId:", result[0]?.insertId);
    try {
      const id = extractInsertId(result);
      console.log("extracted id:", id);
    } catch(e) {
      console.log("extractInsertId error:", e.message);
    }
    await db.delete(users).where(eq(users.openId, `debug-insert-${ts}`));
  });
});
