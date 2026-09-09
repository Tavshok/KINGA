import { describe, expect, it, vi } from "vitest";
import { cleanupOwnedFixture } from "./owned-fixture-cleanup";

describe("cleanupOwnedFixture", () => {
  it("continues unrelated cleanup, skips a dependent parent, verifies residue, and fails loudly", async () => {
    const childDelete = vi.fn(async () => { throw new Error("child constraint"); });
    const parentDelete = vi.fn(async () => undefined);
    const unrelatedDelete = vi.fn(async () => undefined);
    const verify = vi.fn(async () => { throw new Error("child row remains"); });

    await expect(cleanupOwnedFixture([
      { id: "child", remove: childDelete },
      { id: "parent", remove: parentDelete, requires: ["child"] },
      { id: "unrelated", remove: unrelatedDelete },
    ], verify)).rejects.toThrow("Owned fixture cleanup did not complete");

    expect(childDelete).toHaveBeenCalledTimes(1);
    expect(parentDelete).not.toHaveBeenCalled();
    expect(unrelatedDelete).toHaveBeenCalledTimes(1);
    expect(verify).toHaveBeenCalledTimes(1);
  });
});
