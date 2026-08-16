import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const routerSource = fs.readFileSync(
  path.resolve(process.cwd(), "server/routers/platform-marketplace.ts"),
  "utf8",
);
const pageSource = fs.readFileSync(
  path.resolve(process.cwd(), "client/src/pages/PlatformImpersonate.tsx"),
  "utf8",
);

describe("platform impersonation safety boundary", () => {
  it("fails closed at the server boundary and presents an unavailable state rather than switching another tenant user session", () => {
    const mutation = routerSource.slice(
      routerSource.indexOf("startImpersonation: superAdminProcedure"),
      routerSource.indexOf("endImpersonation: superAdminProcedure"),
    );
    const executableMutation = mutation.slice(0, mutation.indexOf("/*"));
    expect(mutation).toContain("User impersonation is temporarily unavailable");
    expect(executableMutation).not.toContain("sdk.createSessionToken(target.openId");
    expect(pageSource).toContain("User Impersonation Unavailable");
  });
});
