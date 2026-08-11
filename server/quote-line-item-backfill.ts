export type HistoricalStage9LineItem = {
  description?: string | null;
  component?: string | null;
  partNumber?: string | null;
  part_number?: string | null;
  category?: string | null;
  quantity?: number | null;
  unitPrice?: number | null;
  unit_cost?: number | null;
  lineTotal?: number | null;
  line_total?: number | null;
  isRepair?: boolean | null;
  isReplacement?: boolean | null;
  source_quote_index?: number | null;
};

const VALID_CATEGORIES = new Set(["parts", "labor", "paint", "diagnostic", "sundries", "other"]);

export function normaliseHistoricalCategory(category: string | null | undefined): "parts" | "labor" | "paint" | "diagnostic" | "sundries" | "other" {
  const normalised = String(category ?? "parts").toLowerCase();
  if (normalised === "labour") return "labor";
  if (normalised === "repair" || normalised === "replacement") return "parts";
  if (normalised === "tax" || normalised === "vat") return "sundries";
  return VALID_CATEGORIES.has(normalised)
    ? normalised as "parts" | "labor" | "paint" | "diagnostic" | "sundries" | "other"
    : "other";
}

export function buildHistoricalLineItemValues(
  quoteId: number,
  currency: string,
  items: HistoricalStage9LineItem[],
) {
  return items
    .map((item, index) => {
      const quantity = Number(item.quantity ?? 1) || 1;
      const unitPrice = Number(item.unitPrice ?? item.unit_cost ?? 0) || 0;
      const lineTotal = Number(item.lineTotal ?? item.line_total ?? (quantity * unitPrice)) || 0;
      const description = String(item.description ?? item.component ?? "").trim();

      if (!description || lineTotal <= 0) return null;

      return {
        quoteId,
        itemNumber: index + 1,
        description: description.slice(0, 499),
        partNumber: String(item.partNumber ?? item.part_number ?? "").trim().slice(0, 99) || null,
        category: normaliseHistoricalCategory(item.category),
        quantity: quantity.toFixed(2),
        unitPrice: unitPrice.toFixed(2),
        lineTotal: lineTotal.toFixed(2),
        currency: (currency || "USD").slice(0, 10),
        isRepair: item.isRepair ? 1 : 0,
        isReplacement: item.isReplacement === false ? 0 : 1,
        notes: "[historical_stage9_backfill]",
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}
