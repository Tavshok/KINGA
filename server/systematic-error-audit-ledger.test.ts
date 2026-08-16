import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ledger = readFileSync(
  new URL("../audit/systematic-error-audit-ledger-2026-08-14.md", import.meta.url),
  "utf8",
);

const confirmedFindingIds = [
  "AUD-P0-001", "AUD-P0-002",
  "AUD-P1-001", "AUD-P1-002", "AUD-P1-003", "AUD-P1-004", "AUD-P1-005", "AUD-P1-006",
  "AUD-P1-007", "AUD-P1-008", "AUD-P1-009", "AUD-P1-010", "AUD-P1-011", "AUD-P1-012",
  "AUD-P1-014", "AUD-P1-015", "AUD-P1-016", "AUD-P1-017", "AUD-P1-018", "AUD-P1-019",
  "AUD-P1-020", "AUD-P1-021", "AUD-P1-022", "AUD-P1-023", "AUD-P1-024",
  "AUD-L2-001", "AUD-L2-002", "AUD-L2-TRACE-002",
];

describe("systematic error audit ledger", () => {
  it("records every confirmed finding in the authoritative current-state register", () => {
    const register = ledger.split("## Authoritative Finding Ledger — Current State")[1] ?? "";
    expect(register).not.toContain("No confirmed finding yet");
    for (const id of confirmedFindingIds) {
      expect(register).toContain(`| ${id} |`);
    }
  });

  it("retains the required evidence, behaviour, cause, severity, correction, regression, and status columns", () => {
    expect(ledger).toContain("| ID | Area and evidence | Expected vs actual | Root cause | Severity | Controlled correction | Regression evidence | Verification status |");
    expect(ledger).toContain("**Open — external provider activation requires explicit approval.**");
    expect(ledger).toContain("**Corrected and re-verified.**");
  });
});
