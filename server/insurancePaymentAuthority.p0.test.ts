import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { insuranceQuotes } from "../drizzle/schema";
import { getDb } from "./db";
import { appRouter } from "./routers";

const tenantA = `test-payment-authority-a-${Date.now()}`;
const tenantB = `test-payment-authority-b-${Date.now()}`;
const quoteNumber = `TEST-PAYMENT-AUTH-${Date.now()}`;
let quoteId = 0;

function foreignInsurerCaller() {
  return appRouter.createCaller({
    user: {
      id: 970001,
      openId: `test-payment-insurer-${Date.now()}`,
      name: "Foreign tenant insurer",
      role: "insurer",
      tenantId: tenantA,
    },
    req: {} as any,
    res: {} as any,
  });
}

function sameTenantInsurerCaller() {
  return appRouter.createCaller({
    user: {
      id: 970006,
      openId: `test-payment-insurer-same-${Date.now()}`,
      name: "Same tenant insurer",
      role: "insurer",
      tenantId: tenantB,
    },
    req: {} as any,
    res: {} as any,
  });
}

beforeEach(async () => {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable for isolated payment authority regression");

  await db.insert(insuranceQuotes).values({
    quoteNumber,
    customerId: 970002,
    vehicleId: 970003,
    carrierId: 970004,
    productId: 970005,
    premiumAmount: 12500,
    premiumFrequency: "monthly",
    quoteValidUntil: new Date(Date.now() + 86_400_000).toISOString(),
    status: "pending",
    tenantId: tenantB,
  });
  const quote = (await db.select().from(insuranceQuotes).where(eq(insuranceQuotes.quoteNumber, quoteNumber)))[0];
  if (!quote) throw new Error("Isolated foreign-tenant quote fixture was not created");
  quoteId = quote.id;
});

afterEach(async () => {
  const db = await getDb();
  if (db) {
    await db.delete(insuranceQuotes).where(eq(insuranceQuotes.quoteNumber, quoteNumber));
  }
});

describe("insurer payment tenant authority", () => {
  it("denies foreign payment-proof submission before storage or quote mutation", async () => {
    const caller = foreignInsurerCaller();
    await expect(caller.insurance.submitPaymentProof({
      quoteId,
      paymentMethod: "bank_transfer",
      referenceNumber: "foreign-test",
      paymentDate: new Date(),
      paymentProofBase64: "data:image/png;base64,aGVsbG8=",
      paymentProofFileName: "proof.png",
    })).rejects.toMatchObject({ code: "NOT_FOUND" });

    const db = await getDb();
    const quote = (await db!.select().from(insuranceQuotes).where(eq(insuranceQuotes.id, quoteId)))[0];
    expect(quote.status).toBe("pending");
    expect(quote.paymentProofS3Key).toBeNull();
  });

  it("denies foreign payment verification before policy issuance", async () => {
    const caller = foreignInsurerCaller();
    await expect(caller.insurance.verifyPayment({ quoteId })).rejects.toMatchObject({ code: "NOT_FOUND" });

    const db = await getDb();
    const quote = (await db!.select().from(insuranceQuotes).where(eq(insuranceQuotes.id, quoteId)))[0];
    expect(quote.status).toBe("pending");
    expect(quote.paymentVerifiedAt).toBeNull();
  });

  it("denies foreign payment rejection before quote status mutation", async () => {
    const caller = foreignInsurerCaller();
    await expect(caller.insurance.rejectPayment({ quoteId, reason: "foreign actor" })).rejects.toMatchObject({ code: "NOT_FOUND" });

    const db = await getDb();
    const quote = (await db!.select().from(insuranceQuotes).where(eq(insuranceQuotes.id, quoteId)))[0];
    expect(quote.status).toBe("pending");
    expect(quote.paymentRejectionReason).toBeNull();
  });

  it("retains a same-tenant insurer payment decision workflow", async () => {
    const caller = sameTenantInsurerCaller();
    await expect(caller.insurance.rejectPayment({ quoteId, reason: "controlled test decision" })).resolves.toMatchObject({ success: true });

    const db = await getDb();
    const quote = (await db!.select().from(insuranceQuotes).where(eq(insuranceQuotes.id, quoteId)))[0];
    expect(quote.status).toBe("rejected");
    expect(quote.paymentRejectionReason).toBe("controlled test decision");
  });
});
