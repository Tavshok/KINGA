import { describe, expect, it } from "vitest";
import { resolveAgencyProductCommission } from "./commissionConfiguration";

describe("resolveAgencyProductCommission", () => {
  it("returns unavailable instead of inventing a default percentage", () => {
    expect(resolveAgencyProductCommission(null)).toEqual({
      status: "unavailable",
      commissionRate: null,
      source: "none",
    });
  });

  it("uses only an active agency tenant-product configuration", () => {
    expect(resolveAgencyProductCommission({
      agencyTenantId: "agency-a",
      productId: 42,
      commissionRate: 12.5,
      isActive: true,
    })).toEqual({
      status: "configured",
      commissionRate: 12.5,
      source: "agency_product_configuration",
    });
  });

  it("does not expose disabled configurations as a fallback", () => {
    expect(resolveAgencyProductCommission({
      agencyTenantId: "agency-a",
      productId: 42,
      commissionRate: 12.5,
      isActive: false,
    }).status).toBe("unavailable");
  });
});
