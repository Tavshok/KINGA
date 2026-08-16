import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isAdminRole } from "../shared/role-permissions";

const projectRoot = resolve(import.meta.dirname, "..");
const productionRouteFiles = [
  "server/routers/intelligence.ts",
  "server/routers/fleet-core.ts",
  "server/routers/insurance-core.ts",
  "server/routers/inspections.ts",
  "server/routers/insurance-phase7.ts",
];
const directAdminComparison = /(role\s*={2,3}\s*["']admin["']|["']admin["']\s*={2,3}\s*role)/;

describe("server administrative role contract", () => {
  it("recognises both administrative shell roles through the shared helper", () => {
    expect(isAdminRole("admin")).toBe(true);
    expect(isAdminRole("platform_super_admin")).toBe(true);
    expect(isAdminRole("insurer")).toBe(false);
    expect(isAdminRole("fleet_manager")).toBe(false);
  });

  it("keeps audited production routes free of direct admin equality checks", () => {
    for (const relativePath of productionRouteFiles) {
      const source = readFileSync(resolve(projectRoot, relativePath), "utf8");
      expect(source, relativePath).not.toMatch(directAdminComparison);
      expect(source, relativePath).toContain("isAdminRole");
    }
  });
});
