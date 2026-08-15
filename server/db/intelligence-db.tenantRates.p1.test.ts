import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getDb = vi.fn();

vi.mock("../db-core", () => ({ getDb }));

const { getTenantRates } = await import("./intelligence-db");

function dbReturning(rows: Array<Record<string, unknown>>) {
  const limit = vi.fn(async () => rows);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  getDb.mockResolvedValue({ select });
}

describe("AUD-P1-016 tenant-rate override loader", () => {
  beforeEach(() => {
    getDb.mockReset();
  });

  it("returns configured rate overrides and configured currency ahead of tenant-column defaults", async () => {
    dbReturning([{
      configJson: {
        labourRateUsdPerHour: 42,
        paintCostPerPanelUsd: 55,
        currencyCode: "ZWL",
        currencySymbol: "Z$",
      },
      currencyCode: "USD",
      currencySymbol: "$",
      country: "ZW",
    }]);

    await expect(getTenantRates("tenant-rates")).resolves.toEqual({
      labourRateUsdPerHour: 42,
      paintCostPerPanelUsd: 55,
      currencyCode: "ZWL",
      currencySymbol: "Z$",
      country: "ZW",
    });
  });

  it("returns null when no override or tenant default exists, preserving regional-default fallback", async () => {
    dbReturning([{
      configJson: {},
      currencyCode: null,
      currencySymbol: null,
      country: null,
    }]);

    await expect(getTenantRates("tenant-without-overrides")).resolves.toBeNull();
    await expect(getTenantRates(null)).resolves.toBeNull();
  });

  it("imports the tenant-rate reader into the assessment entry module before invoking it", () => {
    const dbSource = readFileSync(resolve(import.meta.dirname, "../db.ts"), "utf8");

    expect(dbSource).toContain("import { getTenantRates } from './db/intelligence-db';");
    expect(dbSource).toContain("tenantRates = await getTenantRates(claim.tenantId);");
  });
});
