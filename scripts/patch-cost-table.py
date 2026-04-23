import re

with open('client/src/components/ForensicAuditReport.tsx', 'r') as f:
    content = f.read()

# Replace the Cost Waterfall header + benchmark table with document-sourced quote table
# Find the block from "Cost Waterfall" header to the closing </div></div>

start_marker = '          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>Cost Waterfall</p>'
end_marker = '      {/* Itemised parts */}'

start_idx = content.find(start_marker)
end_idx = content.find(end_marker)

if start_idx == -1:
    print("ERROR: start_marker not found")
    exit(1)
if end_idx == -1:
    print("ERROR: end_marker not found")
    exit(1)

old_block = content[start_idx:end_idx]
print(f"Found block: lines {content[:start_idx].count(chr(10))+1} to {content[:end_idx].count(chr(10))+1}")

new_block = '''          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>Submitted Quote</p>
          <StatusBadge status={verdict === "QUOTE_SUBMITTED" ? "pass" : "warn"} label={verdict === "QUOTE_SUBMITTED" ? "Quote Received" : "No Quote"} />
        </div>
        <div className="p-4">
          {/* Document-sourced cost section — no AI estimates, no benchmarks */}
          <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: "var(--muted-foreground)" }}>4.1 Submitted Quote</p>
          {quotedTotal > 0 ? (
            <table className="w-full text-xs mb-3 report-table">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
                  {["Repairer", "Parts", "Labour", "Total", "Status"].map(h => (
                    <th key={h} className="text-left px-3 py-2 font-semibold" style={{ color: "var(--muted-foreground)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pbQuotes.map((q, i) => (
                  <tr key={i} style={{ borderTop: "1px solid var(--border)", background: "var(--background)" }}>
                    <td className="px-3 py-2 font-medium" style={{ color: "var(--foreground)" }}>{q.name}</td>
                    <td className="px-3 py-2 font-mono" style={{ color: "var(--foreground)" }}>{q.parts > 0 ? fmtMoney(q.parts) : "—"}</td>
                    <td className="px-3 py-2 font-mono" style={{ color: "var(--foreground)" }}>{q.labour > 0 ? fmtMoney(q.labour) : "—"}</td>
                    <td className="px-3 py-2 font-mono font-bold" style={{ color: "var(--foreground)" }}>{fmtMoney(q.total)}</td>
                    <td className="px-3 py-2"><StatusBadge status="pass" label="Submitted" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-3 rounded text-xs mb-3" style={{ background: "var(--muted)", color: "var(--muted-foreground)", border: "1px solid var(--border)" }}>
              No repair quote has been submitted for this claim. Cost assessment cannot be performed until a quotation is received.
            </div>
          )}
        </div>
      </div>
      '''

content = content[:start_idx] + new_block + content[end_idx:]

with open('client/src/components/ForensicAuditReport.tsx', 'w') as f:
    f.write(content)

print("SUCCESS: Cost table replaced with document-sourced quote section")
