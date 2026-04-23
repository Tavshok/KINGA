with open('client/src/components/ForensicAuditReport.tsx', 'r') as f:
    lines = f.readlines()

# Replace lines 1811-1868 (0-indexed: 1810-1867) with clean document-sourced version
# Line 1811 starts "  // Stage 9 no longer produces AI cost estimates."
# Line 1868 ends "      : "NO_QUOTE";"

start = 1810  # 0-indexed
end = 1868    # 0-indexed, exclusive

new_lines = [
    "  // Stage 9 no longer produces AI cost estimates. Only document-sourced costs are used.\n",
    "  const itemisedParts: any[] = ce?.itemised_parts ?? [];\n",
    "  // Parse partsReconciliationJson from Stage 9 — used to show coverage gap per component\n",
    "  const partsReconRaw = (aiAssessment as any)?.partsReconciliationJson;\n",
    "  const partsRecon: any[] = (() => {\n",
    "    if (!partsReconRaw) return [];\n",
    "    try { return typeof partsReconRaw === 'string' ? JSON.parse(partsReconRaw) : (Array.isArray(partsReconRaw) ? partsReconRaw : []); } catch { return []; }\n",
    "  })();\n",
    "  // Build a lookup: component name (lower) → reconciliation_status from Stage 9\n",
    "  const reconStatusMap: Record<string, string> = {};\n",
    "  for (const r of partsRecon) {\n",
    "    if (r.component) reconStatusMap[r.component.toLowerCase()] = r.reconciliation_status ?? 'no_quote_available';\n",
    "  }\n",
    "\n",
    "  const pbQuotes = (quotes ?? []).map((q: any) => ({\n",
    "    name: q.panelBeaterName ?? \"Panel Beater\",\n",
    "    total: (q.quotedAmount ?? 0) / 100,\n",
    "    parts: (q.partsCost ?? 0) / 100,\n",
    "    labour: (q.laborCost ?? 0) / 100,\n",
    "    status: q.status ?? \"submitted\",\n",
    "    lineItems: q.lineItems ?? [],\n",
    "  }));\n",
    "\n",
    "  const primaryQuote = pbQuotes[0];\n",
    "  const quotedTotal = primaryQuote?.total ?? 0;\n",
    "  const quotedParts = primaryQuote?.parts ?? 0;\n",
    "  const quotedLabour = primaryQuote?.labour ?? 0;\n",
    "\n",
    "  // No AI estimate to compare against — verdict is purely based on quote presence\n",
    "  const verdict: string = quotedTotal > 0 ? \"QUOTE_SUBMITTED\" : \"NO_QUOTE\";\n",
    "\n",
]

lines[start:end] = new_lines

with open('client/src/components/ForensicAuditReport.tsx', 'w') as f:
    f.writelines(lines)

print(f"SUCCESS: Replaced lines {start+1}-{end} with {len(new_lines)} clean lines")
