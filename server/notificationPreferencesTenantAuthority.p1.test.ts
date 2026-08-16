import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve(process.cwd(), "server/routers/notifications.ts"), "utf8");

describe("notification preference tenant authority", () => {
  it("requires a session tenant and retains it in preference reads and writes", () => {
    expect(source).toContain("function requireNotificationTenant");
    expect(source).toContain("const tenantId = requireNotificationTenant(ctx)");
    expect(source).toContain("eq(notificationPreferences.tenantId, tenantId)");
    expect(source).toContain("tenantId,");
    expect(source).not.toContain("notificationPreferences.tenantId, ctx.user.tenantId ?? \"\"");
  });
});
