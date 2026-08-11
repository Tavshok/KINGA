import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const project = resolve(__dirname, "..");
const source = (relativePath: string) => readFileSync(resolve(project, relativePath), "utf8");

describe("persisted quote line-item flow", () => {
  it("persists replacement extracted line items against the resolved quote", () => {
    const persistence = source("server/persistExtractedQuote.ts");

    expect(persistence).toContain("await db.delete(quoteLineItems).where(eq(quoteLineItems.quoteId, quoteId))");
    expect(persistence).toContain("quoteId,");
    expect(persistence).toContain("unitPrice: unitPrice.toFixed(2)");
    expect(persistence).toContain("lineTotal: lineTotal.toFixed(2)");
    expect(persistence).toContain("await db.insert(quoteLineItems).values(lineItemValues as any)");
  });

  it("uses persisted line items when Stage 9 must recover quotes from the database", () => {
    const stage9 = source("server/pipeline-v2/stage-9-cost.ts");

    expect(stage9).toContain("from(quoteLineItems)");
    expect(stage9).toContain("lineItemsByQuoteId");
    expect(stage9).toContain("const rawLineItems = lineItemsByQuoteId.get(row.quoteId) ?? []");
    expect(stage9).toContain("const line_items = rawLineItems.map");
  });

  it("loads quote_line_items in report generation for quote comparison output", () => {
    const reports = source("server/reporting/reportDefinitions.ts");

    expect(reports).toContain("FROM quote_line_items WHERE quote_id = ?");
    expect(reports).toContain("quoteLineItemsMap.set(Number(q.id), liRows)");
  });
});
