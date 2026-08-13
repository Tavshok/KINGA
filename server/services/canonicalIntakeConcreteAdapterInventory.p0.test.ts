import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const root = new URL("../..", import.meta.url).pathname;

function listProductionTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const absolute = join(directory, entry);
    if (statSync(absolute).isDirectory()) return listProductionTypeScriptFiles(absolute);
    return entry.endsWith(".ts") && !entry.includes(".test.") && !entry.includes(".spec.") ? [absolute] : [];
  });
}

function canonicalIntakeAdapterFiles(): string[] {
  return listProductionTypeScriptFiles(join(root, "server"))
    .filter((file) => readFileSync(file, "utf8").includes("persistCanonicalClaimIntake") || readFileSync(file, "utf8").includes("submitAgencyAssistedCanonicalClaim"))
    .filter((file) => !file.endsWith("server/services/canonicalClaimIntake.ts") && !file.endsWith("server/agency/agencyAssistedClaimSubmission.ts"))
    .map((file) => relative(root, file).replaceAll("\\", "/"))
    .sort();
}

describe("P0 Package 2 concrete canonical-intake adapter inventory", () => {
  it("records every current production adapter and fails when a new unverified adapter is introduced", () => {
    expect(canonicalIntakeAdapterFiles()).toEqual([
      "server/routers/agency-insurance-service.ts",
      "server/routers/claims-core.ts",
      "server/whatsapp/engine.ts",
    ]);
  });

  it("keeps each recorded adapter tied to canonical evidence, idempotency, and provenance inputs", () => {
    const web = readFileSync(join(root, "server/routers/claims-core.ts"), "utf8");
    const whatsapp = readFileSync(join(root, "server/whatsapp/engine.ts"), "utf8");
    const agency = readFileSync(join(root, "server/routers/agency-insurance-service.ts"), "utf8");
    const agencySubmission = readFileSync(join(root, "server/agency/agencyAssistedClaimSubmission.ts"), "utf8");

    expect(web).toContain("persistCanonicalClaimIntake");
    expect(web).toContain("idempotencyKey");
    expect(web).toContain("attachments");
    expect(whatsapp).toContain("persistCanonicalClaimIntake");
    expect(whatsapp).toContain('channel: "whatsapp"');
    expect(whatsapp).toContain("sourceMetadata");
    expect(agency).toContain("submitAgencyAssistedCanonicalClaim");
    expect(agency).toContain("idempotencyKey");
    expect(agency).toContain("attachments");
    expect(agencySubmission).toContain("submitAndStartCanonicalIntake");
    expect(agencySubmission).toContain("startAssessment: dependencies.startAssessment");
  });

  it("does not invent a mobile or generic API adapter where no concrete canonical writer exists", () => {
    const adapters = canonicalIntakeAdapterFiles().join("\n");
    expect(adapters).not.toMatch(/mobile|api/i);
  });
});
