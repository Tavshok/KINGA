import { afterAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { usageEvents } from "../drizzle/schema";
import { getDb } from "./db";
import { trackUsageEvent } from "./metering";

describe("legacy metering JSON persistence", () => {
  const tenantId = `legacy-metering-${Date.now()}`;
  const referenceId = `legacy-metering-reference-${Date.now()}`;
  let eventId: number | null = null;

  afterAll(async () => {
    const db = await getDb();
    if (db && eventId !== null) {
      await db.delete(usageEvents).where(eq(usageEvents.id, eventId));
    }
  });

  it("stores legacy metadata as a JSON object", async () => {
    const db = await getDb();
    if (!db)
      throw new Error("Database unavailable for legacy metering regression");

    await trackUsageEvent({
      tenantId,
      eventType: "CLAIM_PROCESSED",
      resourceId: referenceId,
      metadata: { source: "legacy-metering" },
    });

    const [event] = await db
      .select({ id: usageEvents.id })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.tenantId, tenantId),
          eq(usageEvents.referenceId, referenceId)
        )
      )
      .limit(1);
    expect(event).toBeDefined();
    eventId = event!.id;

    const [metadataType] = await db
      .select({ value: sql<string>`JSON_TYPE(${usageEvents.metadata})` })
      .from(usageEvents)
      .where(eq(usageEvents.id, eventId))
      .limit(1);
    expect(metadataType?.value).toBe("OBJECT");
  });
});
