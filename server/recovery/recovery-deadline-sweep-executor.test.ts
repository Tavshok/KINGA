import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, like, sql } from "drizzle-orm";

import {
  claims,
  recoveryCases,
  recoveryDeadlineAlertOutbox,
  recoverySweepLeases,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { runFencedRecoveryDeadlineSweep } from "./recovery-deadline-sweep-executor";

let fixturePrefix = "";
let sequence = 0;

async function database() {
  const db = await getDb();
  if (!db) throw new Error("Dedicated CI database is unavailable");
  return db;
}

function deadline(daysFromNow = 7): string {
  return new Date(Date.now() + daysFromNow * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

async function createRecoveryCase(daysFromNow = 7) {
  const db = await database();
  const suffix = `${fixturePrefix}-${sequence++}`;
  const tenantId = `recsec02-tenant-${suffix}`;
  const claimNumber = `RECSEC02-${suffix}`;
  const [claim] = await db
    .insert(claims)
    .values({ claimNumber, tenantId })
    .$returningId();
  const [recoveryCase] = await db
    .insert(recoveryCases)
    .values({
      tenantId,
      claimId: claim.id,
      status: "open",
      recoveryDeadline: deadline(daysFromNow),
      recoveryPotentialScore: 65,
      currencyCode: "USD",
      approvedSettlementAmount: 10_000,
    })
    .$returningId();
  return { tenantId, claimId: claim.id, recoveryCaseId: recoveryCase.id };
}

async function clearFixtures() {
  const db = await database();
  await db.execute(sql`DELETE FROM recovery_deadline_alert_outbox WHERE recovery_case_id IN (
    SELECT id FROM recovery_cases WHERE tenant_id LIKE ${`recsec02-tenant-${fixturePrefix}%`}
  )`);
  await db
    .delete(recoveryCases)
    .where(like(recoveryCases.tenantId, `recsec02-tenant-${fixturePrefix}%`));
  await db
    .delete(claims)
    .where(like(claims.tenantId, `recsec02-tenant-${fixturePrefix}%`));
  await db
    .delete(recoverySweepLeases)
    .where(eq(recoverySweepLeases.leaseName, "recovery-deadline-sweep"));
}

beforeEach(async () => {
  fixturePrefix = `${Date.now()}-${sequence++}`;
  await clearFixtures();
});

afterEach(clearFixtures);

describe("REC-SEC-02 fenced recovery deadline executor", () => {
  it("allows two simultaneous authorized callers to create one delivered effect", async () => {
    const fixture = await createRecoveryCase();
    const notify = vi.fn().mockResolvedValue(true);

    const results = await Promise.all([
      runFencedRecoveryDeadlineSweep({
        holderId: `http-${fixturePrefix}`,
        notify,
      }),
      runFencedRecoveryDeadlineSweep({
        holderId: `startup-${fixturePrefix}`,
        notify,
      }),
    ]);

    expect(results.filter(result => result.acquired)).toHaveLength(1);
    expect(notify).toHaveBeenCalledOnce();
    const db = await database();
    const outbox = await db
      .select()
      .from(recoveryDeadlineAlertOutbox)
      .where(
        eq(recoveryDeadlineAlertOutbox.recoveryCaseId, fixture.recoveryCaseId)
      );
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ state: "delivered", attemptCount: 1 });

    const [recoveryCase] = await db
      .select({ suppression: recoveryCases.recoveryDeadlineAlertSentAt })
      .from(recoveryCases)
      .where(eq(recoveryCases.id, fixture.recoveryCaseId));
    expect(recoveryCase.suppression).not.toBeNull();
  });

  it("makes startup and HTTP-style overlap use the same fence and exactly one effect", async () => {
    const fixture = await createRecoveryCase();
    const notify = vi.fn().mockResolvedValue(true);

    const [startup, http] = await Promise.all([
      runFencedRecoveryDeadlineSweep({
        holderId: `startup-${fixturePrefix}`,
        notify,
      }),
      runFencedRecoveryDeadlineSweep({
        holderId: `http-${fixturePrefix}`,
        notify,
      }),
    ]);

    expect([startup, http].filter(result => result.acquired)).toHaveLength(1);
    expect(notify).toHaveBeenCalledOnce();
    const db = await database();
    const [effect] = await db
      .select()
      .from(recoveryDeadlineAlertOutbox)
      .where(
        eq(recoveryDeadlineAlertOutbox.recoveryCaseId, fixture.recoveryCaseId)
      );
    expect(effect.state).toBe("delivered");
  });

  it("prevents a former lease holder from committing suppression after its fence is superseded", async () => {
    const fixture = await createRecoveryCase();
    const firstNow = new Date();
    const secondNow = new Date(firstNow.getTime() + 61_000);
    let beginDelivery: (() => void) | undefined;
    let releaseDelivery: (() => void) | undefined;
    const deliveryStarted = new Promise<void>(resolve => {
      beginDelivery = resolve;
    });
    const deliveryRelease = new Promise<void>(resolve => {
      releaseDelivery = resolve;
    });

    const first = runFencedRecoveryDeadlineSweep({
      holderId: `former-${fixturePrefix}`,
      now: () => firstNow,
      notify: async () => {
        beginDelivery?.();
        await deliveryRelease;
        return true;
      },
    });
    await deliveryStarted;

    const successor = await runFencedRecoveryDeadlineSweep({
      holderId: `successor-${fixturePrefix}`,
      now: () => secondNow,
      notify: async () => true,
    });
    releaseDelivery?.();
    const former = await first;

    expect(successor).toMatchObject({
      acquired: true,
      delivered: 0,
      lostLease: false,
    });
    expect(former).toMatchObject({
      acquired: true,
      delivered: 0,
      lostLease: true,
    });
    const db = await database();
    const [effect] = await db
      .select()
      .from(recoveryDeadlineAlertOutbox)
      .where(
        eq(recoveryDeadlineAlertOutbox.recoveryCaseId, fixture.recoveryCaseId)
      );
    expect(effect).toMatchObject({
      state: "dispatching",
      claimedBy: `former-${fixturePrefix}`,
    });
    const [recoveryCase] = await db
      .select({ suppression: recoveryCases.recoveryDeadlineAlertSentAt })
      .from(recoveryCases)
      .where(eq(recoveryCases.id, fixture.recoveryCaseId));
    expect(recoveryCase.suppression).toBeNull();
  });

  it("leaves suppression unset and the outbox retryable when notification resolves false", async () => {
    const fixture = await createRecoveryCase();
    const result = await runFencedRecoveryDeadlineSweep({
      holderId: `false-${fixturePrefix}`,
      notify: async () => false,
    });

    expect(result).toMatchObject({
      acquired: true,
      delivered: 0,
      retryable: 1,
      lostLease: false,
    });
    const db = await database();
    const [effect] = await db
      .select()
      .from(recoveryDeadlineAlertOutbox)
      .where(
        eq(recoveryDeadlineAlertOutbox.recoveryCaseId, fixture.recoveryCaseId)
      );
    expect(effect.state).toBe("pending");
    expect(effect.claimedBy).toBeNull();

    const [recoveryCase] = await db
      .select({ suppression: recoveryCases.recoveryDeadlineAlertSentAt })
      .from(recoveryCases)
      .where(eq(recoveryCases.id, fixture.recoveryCaseId));
    expect(recoveryCase.suppression).toBeNull();
  });

  it("leaves suppression unset and the outbox retryable when notification throws", async () => {
    const fixture = await createRecoveryCase();
    const result = await runFencedRecoveryDeadlineSweep({
      holderId: `throw-${fixturePrefix}`,
      notify: async () => {
        throw new Error("notification transport unavailable");
      },
    });

    expect(result).toMatchObject({
      acquired: true,
      delivered: 0,
      retryable: 1,
      lostLease: false,
    });
    const db = await database();
    const [effect] = await db
      .select()
      .from(recoveryDeadlineAlertOutbox)
      .where(
        eq(recoveryDeadlineAlertOutbox.recoveryCaseId, fixture.recoveryCaseId)
      );
    expect(effect.state).toBe("pending");
    const [recoveryCase] = await db
      .select({ suppression: recoveryCases.recoveryDeadlineAlertSentAt })
      .from(recoveryCases)
      .where(eq(recoveryCases.id, fixture.recoveryCaseId));
    expect(recoveryCase.suppression).toBeNull();
  });

  it("commits one matching delivered effect and suppression update after notification accepts", async () => {
    const fixture = await createRecoveryCase();
    const notify = vi.fn().mockResolvedValue(true);
    const firstNow = new Date();
    const secondNow = new Date(firstNow.getTime() + 61_000);

    const first = await runFencedRecoveryDeadlineSweep({
      holderId: `first-${fixturePrefix}`,
      notify,
      now: () => firstNow,
    });
    const second = await runFencedRecoveryDeadlineSweep({
      holderId: `second-${fixturePrefix}`,
      notify,
      now: () => secondNow,
    });

    expect(first).toMatchObject({
      acquired: true,
      delivered: 1,
      lostLease: false,
    });
    expect(second).toMatchObject({
      acquired: true,
      delivered: 0,
      lostLease: false,
    });
    expect(notify).toHaveBeenCalledOnce();

    const db = await database();
    const effects = await db
      .select()
      .from(recoveryDeadlineAlertOutbox)
      .where(
        eq(recoveryDeadlineAlertOutbox.recoveryCaseId, fixture.recoveryCaseId)
      );
    expect(effects).toHaveLength(1);
    expect(effects[0].state).toBe("delivered");
    expect(effects[0].deliveredAt).not.toBeNull();

    const [recoveryCase] = await db
      .select({ suppression: recoveryCases.recoveryDeadlineAlertSentAt })
      .from(recoveryCases)
      .where(
        and(
          eq(recoveryCases.id, fixture.recoveryCaseId),
          eq(recoveryCases.tenantId, fixture.tenantId)
        )
      );
    expect(recoveryCase.suppression).toBe(effects[0].deliveredAt);
  });
});
