import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
}));

vi.mock("./db", () => ({ getDb: mocks.getDb }));

import { trackUsageEvent } from "./metering";

describe("legacy metering usage event persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes metadata as an object to the native JSON column", async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    const insert = vi.fn().mockReturnValue({ values });
    mocks.getDb.mockResolvedValue({ insert });

    await trackUsageEvent({
      tenantId: "tenant-test",
      eventType: "CLAIM_PROCESSED",
      metadata: { source: "legacy-metering" },
    });

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { source: "legacy-metering" } })
    );
  });

  it("remains non-blocking when no database is available", async () => {
    mocks.getDb.mockResolvedValue(null);

    await expect(
      trackUsageEvent({ tenantId: "tenant-test", eventType: "CLAIM_PROCESSED" })
    ).resolves.toBeUndefined();
  });
});
