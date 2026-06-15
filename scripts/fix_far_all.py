#!/usr/bin/env python3
"""
Comprehensive ForensicAuditReport fix script.
Applies all outstanding fixes from the original audit in one pass.
"""
import re

FAR = "/home/ubuntu/kinga-replit/client/src/components/ForensicAuditReport.tsx"
BRIDGE = "/home/ubuntu/kinga-replit/server/claim-record-bridge.ts"

with open(FAR, "r") as f:
    src = f.read()

# ─────────────────────────────────────────────────────────────────────────────
# FAR-1: Police report data path — fix line 1701 priority order
# Current: ok: !!(aiAssessment?.policeReportNumber) || !!(claimRecord0?.policeReport?.station)
# Fix:     ok: !!(claimRecord0?.policeReport?.reportNumber ?? aiAssessment?.policeReportNumber) || !!(claimRecord0?.policeReport?.station)
# Also fix detail and conf to use the unified policeReportNumber variable
# ─────────────────────────────────────────────────────────────────────────────
old_police_check = (
    '{ label: "Police report", ok: !!(aiAssessment?.policeReportNumber) || !!(claimRecord0?.policeReport?.station), '
    'detail: aiAssessment?.policeReportNumber ?? (claimRecord0?.policeReport?.station ? `Station: ${claimRecord0.policeReport.station}` : "Not provided"), '
    'conf: aiAssessment?.policeReportNumber ? 100 : claimRecord0?.policeReport?.station ? 60 : 0 },'
)
new_police_check = (
    '{ label: "Police report", ok: !!(claimRecord0?.policeReport?.reportNumber ?? aiAssessment?.policeReportNumber) || !!(claimRecord0?.policeReport?.station), '
    'detail: (claimRecord0?.policeReport?.reportNumber ?? aiAssessment?.policeReportNumber) ?? (claimRecord0?.policeReport?.station ? `Station: ${claimRecord0.policeReport.station}` : "Not provided"), '
    'conf: (claimRecord0?.policeReport?.reportNumber ?? aiAssessment?.policeReportNumber) ? 100 : claimRecord0?.policeReport?.station ? 60 : 0 },'
)
if old_police_check in src:
    src = src.replace(old_police_check, new_police_check, 1)
    print("✓ FAR-1a: Fixed police report check in data completeness row")
else:
    print("⚠ FAR-1a: Police report check not found (may already be fixed)")

# Fix line 2267 — the evidence inventory table
old_police_evidence = (
    "{ item: 'Police report', ok: !!(aiAssessment?.policeReportNumber) ? 'pass' : claimRecord0?.policeReport?.station ? 'warn' : 'fail', "
    "statusLabel: aiAssessment?.policeReportNumber ? `✓ ${aiAssessment.policeReportNumber}` : claimRecord0?.policeReport?.station ? '⚠ Case number only' : '✗ Not provided', "
    "impact: aiAssessment?.policeReportNumber ? 'No impact' : claimRecord0?.policeReport?.station ? 'Moderate — full report required' : 'High — third-party verification incomplete' },"
)
new_police_evidence = (
    "{ item: 'Police report', ok: !!(claimRecord0?.policeReport?.reportNumber ?? aiAssessment?.policeReportNumber) ? 'pass' : claimRecord0?.policeReport?.station ? 'warn' : 'fail', "
    "statusLabel: (claimRecord0?.policeReport?.reportNumber ?? aiAssessment?.policeReportNumber) ? `✓ ${claimRecord0?.policeReport?.reportNumber ?? aiAssessment?.policeReportNumber}` : claimRecord0?.policeReport?.station ? '⚠ Case number only' : '✗ Not provided', "
    "impact: (claimRecord0?.policeReport?.reportNumber ?? aiAssessment?.policeReportNumber) ? 'No impact' : claimRecord0?.policeReport?.station ? 'Moderate — full report required' : 'High — third-party verification incomplete' },"
)
if old_police_evidence in src:
    src = src.replace(old_police_evidence, new_police_evidence, 1)
    print("✓ FAR-1b: Fixed police report check in evidence inventory table")
else:
    print("⚠ FAR-1b: Evidence inventory police check not found")

# Fix line 5245 — the document inventory
old_police_doc = (
    '{ id: "Police Report", type: "Supporting", extracted: !!(ctl4?.evidence?.policeReportPresent ?? aiAssessment?.policeReportNumber), '
    'note: aiAssessment?.policeReportNumber ? `Case: ${aiAssessment.policeReportNumber}` : (ctl4?.evidence?.policeReportPresent ? "Present in file" : "Not provided") },'
)
new_police_doc = (
    '{ id: "Police Report", type: "Supporting", extracted: !!(ctl4?.evidence?.policeReportPresent ?? claimRecord0?.policeReport?.reportNumber ?? aiAssessment?.policeReportNumber), '
    'note: (claimRecord0?.policeReport?.reportNumber ?? aiAssessment?.policeReportNumber) ? `Case: ${claimRecord0?.policeReport?.reportNumber ?? aiAssessment?.policeReportNumber}` : (ctl4?.evidence?.policeReportPresent ? "Present in file" : "Not provided") },'
)
if old_police_doc in src:
    src = src.replace(old_police_doc, new_police_doc, 1)
    print("✓ FAR-1c: Fixed police report in document inventory")
else:
    print("⚠ FAR-1c: Document inventory police check not found")

# ─────────────────────────────────────────────────────────────────────────────
# FAR-3: KINGA Estimate column — add distinct visual treatment
# The KINGA Estimate row already has borderTop: '2px solid #111'
# Add a subtle background tint + "KINGA" badge to the Status cell header
# ─────────────────────────────────────────────────────────────────────────────
old_kinga_row = (
    "                    <tr style={{ borderTop: '2px solid #111' }}>\n"
    "                      <td style={{ ...tdC, fontWeight: 700, color: 'var(--kr-green)' }}>KINGA Estimate</td>\n"
    "                      <td style={tdN}>—</td>\n"
    "                      <td style={tdN}>—</td>\n"
    "                      <td style={{ ...tdN, fontWeight: 700, color: 'var(--kr-green)' }}>{fmtMoney(kingaOptTotal3)}</td>\n"
    "                      <td style={{ ...tdC, fontWeight: 700, color: 'var(--kr-green)' }}>\n"
    "                        KINGA Optimised\n"
    "                        {savingsPct3 > 0 && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--kr-green)', fontWeight: 700 }}>↓ {savingsPct3.toFixed(1)}% vs lowest quote</span>}\n"
    "                      </td>\n"
    "                    </tr>"
)
new_kinga_row = (
    "                    <tr style={{ borderTop: '2px solid var(--kr-navy)', background: '#f0fdf4' }}>\n"
    "                      <td style={{ ...tdC, fontWeight: 700, color: 'var(--kr-navy)', background: '#f0fdf4' }}>\n"
    "                        <span style={{ display: 'inline-block', fontSize: 9, fontWeight: 700, padding: '1px 5px', background: 'var(--kr-navy)', color: '#fff', borderRadius: 2, marginRight: 5, letterSpacing: '0.06em' }}>KINGA</span>\n"
    "                        Optimised Estimate\n"
    "                      </td>\n"
    "                      <td style={{ ...tdN, background: '#f0fdf4' }}>—</td>\n"
    "                      <td style={{ ...tdN, background: '#f0fdf4' }}>—</td>\n"
    "                      <td style={{ ...tdN, fontWeight: 700, color: '#15803d', background: '#f0fdf4' }}>{fmtMoney(kingaOptTotal3)}</td>\n"
    "                      <td style={{ ...tdC, fontWeight: 700, color: '#15803d', background: '#f0fdf4' }}>\n"
    "                        {savingsPct3 > 0\n"
    "                          ? <span>↓ {savingsPct3.toFixed(1)}% vs lowest quote</span>\n"
    "                          : <span style={{ color: 'var(--kr-muted)', fontWeight: 400 }}>No saving vs lowest quote</span>}\n"
    "                      </td>\n"
    "                    </tr>"
)
if old_kinga_row in src:
    src = src.replace(old_kinga_row, new_kinga_row, 1)
    print("✓ FAR-3: Fixed KINGA Estimate column visual distinction")
else:
    print("⚠ FAR-3: KINGA Estimate row not found (may already be fixed)")

# ─────────────────────────────────────────────────────────────────────────────
# FAR-P1-1: Vehicle Damage Map — full-width, centred, maxWidth 320px
# Change the grid-cols-2 container to full-width for the damage map
# ─────────────────────────────────────────────────────────────────────────────
old_damage_map_grid = '          <div className="grid grid-cols-2 gap-4">\n            {/* Zone map */}\n            <div>\n              <p className="micro-label mb-2">Damage Zone Map</p>'
new_damage_map_grid = '          <div className="grid grid-cols-2 gap-4">\n            {/* Zone map — full-width centred */}\n            <div style={{ gridColumn: \'1 / -1\', display: \'flex\', flexDirection: \'column\', alignItems: \'center\' }}>\n              <p className="micro-label mb-2" style={{ alignSelf: \'flex-start\' }}>Damage Zone Map</p>'
if old_damage_map_grid in src:
    src = src.replace(old_damage_map_grid, new_damage_map_grid, 1)
    print("✓ FAR-P1-1a: Vehicle Damage Map container set to full-width")
else:
    print("⚠ FAR-P1-1a: Damage Map grid container not found")

# Also wrap the VehicleDamageMap in a centred div with maxWidth
old_vehicle_damage_map_open = "              <VehicleDamageMap\n                damageZones={damageZones}"
new_vehicle_damage_map_open = "              <div style={{ maxWidth: 320, width: '100%', margin: '0 auto' }}><VehicleDamageMap\n                damageZones={damageZones}"
if old_vehicle_damage_map_open in src:
    src = src.replace(old_vehicle_damage_map_open, new_vehicle_damage_map_open, 1)
    print("✓ FAR-P1-1b: VehicleDamageMap wrapped in maxWidth 320px div")
else:
    print("⚠ FAR-P1-1b: VehicleDamageMap open tag not found")

# Close the wrapping div after the damage zones pills
old_damage_zones_pills_end = (
    "              {damageZones.length > 0 && (\n"
    "                <div className=\"mt-2 flex flex-wrap gap-1\">\n"
    "                  {damageZones.map((z, i) => (\n"
    "                    <span key={i} className=\"text-xs px-2 py-0.5 rounded\"\n"
    "                      style={{ background: 'var(--status-reject-bg)', color: 'var(--status-reject-text)', border: '1px solid var(--fp-critical-border)' }}>{z}</span>\n"
    "                  ))}\n"
    "                </div>\n"
    "              )}\n"
    "            </div>"
)
new_damage_zones_pills_end = (
    "              {damageZones.length > 0 && (\n"
    "                <div className=\"mt-2 flex flex-wrap gap-1\" style={{ justifyContent: 'center' }}>\n"
    "                  {damageZones.map((z, i) => (\n"
    "                    <span key={i} className=\"text-xs px-2 py-0.5 rounded\"\n"
    "                      style={{ background: 'var(--status-reject-bg)', color: 'var(--status-reject-text)', border: '1px solid var(--fp-critical-border)' }}>{z}</span>\n"
    "                  ))}\n"
    "                </div>\n"
    "              )}\n"
    "              </div>{/* /maxWidth wrapper */}\n"
    "            </div>"
)
if old_damage_zones_pills_end in src:
    src = src.replace(old_damage_zones_pills_end, new_damage_zones_pills_end, 1)
    print("✓ FAR-P1-1c: Closed maxWidth wrapper after damage zone pills")
else:
    print("⚠ FAR-P1-1c: Damage zone pills end not found")

# ─────────────────────────────────────────────────────────────────────────────
# FAR-P1-2: Decision Flowchart — increase node sizes
# ─────────────────────────────────────────────────────────────────────────────
old_flowchart_dims = (
    "  const nodeW = 110;   // width of START / FINAL rect nodes\n"
    "  const nodeH = 40;    // height of rect nodes\n"
    "  const diamondW = 100; // half-width of diamond (full = 2×)\n"
    "  const diamondH = 44; // half-height of diamond (full = 2×)"
)
new_flowchart_dims = (
    "  const nodeW = 130;   // width of START / FINAL rect nodes\n"
    "  const nodeH = 44;    // height of rect nodes\n"
    "  const diamondW = 120; // half-width of diamond (full = 2×)\n"
    "  const diamondH = 52; // half-height of diamond (full = 2×)"
)
if old_flowchart_dims in src:
    src = src.replace(old_flowchart_dims, new_flowchart_dims, 1)
    print("✓ FAR-P1-2: Decision Flowchart node sizes increased")
else:
    print("⚠ FAR-P1-2: Flowchart dimensions not found")

# ─────────────────────────────────────────────────────────────────────────────
# FAR-P1-4: Section 9 pending state — compact horizontal strip
# ─────────────────────────────────────────────────────────────────────────────
old_section9_pending = (
    "        if (stages.length === 0 && approvalHistory.length === 0) {\n"
    "          return (\n"
    "            <div style={{ background: 'var(--kr-white)', border: '1px solid var(--kr-rule)', borderRadius: 6, padding: '16px 20px', marginBottom: 16 }}>\n"
    "              <p style={{ fontSize: 12, color: 'var(--kr-muted)', fontStyle: 'italic', margin: 0, textAlign: 'center' }}>No approval workflow has been initiated for this claim.</p>"
)
new_section9_pending = (
    "        if (stages.length === 0 && approvalHistory.length === 0) {\n"
    "          return (\n"
    "            <div style={{ background: 'var(--kr-off-white)', border: '1px solid var(--kr-rule)', padding: '10px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>\n"
    "              <span style={{ fontSize: 16, color: 'var(--kr-muted)' }}>&#128274;</span>\n"
    "              <div>\n"
    "                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--kr-text)' }}>Pending Workflow Initiation</span>\n"
    "                <span style={{ fontSize: 11, color: 'var(--kr-muted)', marginLeft: 8 }}>No approval stages have been configured or completed for this claim.</span>\n"
    "              </div>"
)
if old_section9_pending in src:
    src = src.replace(old_section9_pending, new_section9_pending, 1)
    print("✓ FAR-P1-4: Section 9 pending state changed to compact strip")
else:
    print("⚠ FAR-P1-4: Section 9 pending state not found")

# Fix the closing of the pending state div (was just </p></div> now needs extra </div>)
old_section9_pending_close = (
    "              <p style={{ fontSize: 12, color: 'var(--kr-muted)', fontStyle: 'italic', margin: 0, textAlign: 'center' }}>No approval workflow has been initiated for this claim.</p>"
)
# Already replaced above, the close tag is now the extra </div> we added

# ─────────────────────────────────────────────────────────────────────────────
# FAR-P2-1: Analysis Methods filter — hide "Corroborates speed range" rows
# ─────────────────────────────────────────────────────────────────────────────
old_analysis_methods_render = (
    "                    return (\n"
    "                      <div key={methodId} className=\"flex items-center justify-between px-3 py-2 text-xs\" style={{ borderBottom: idx < allMethods.length - 1 ? '1px solid var(--border)' : undefined }}>\n"
    "                        <span style={{ color: isOutlier ? 'var(--kr-muted)' : 'var(--kr-text)', fontWeight: isOutlier ? 400 : 500 }}>{categoryName}</span>\n"
    "                        <span className=\"font-semibold tabular-nums\" style={{ color: isOutlier ? 'var(--fp-locked-text)' : 'var(--fp-success-text)' }}>{statusLabel}</span>\n"
    "                      </div>\n"
    "                    );"
)
new_analysis_methods_render = (
    "                    // Only show rows with numeric results, outliers, or deployment threshold\n"
    "                    const hasNumericResult = speedKmh != null;\n"
    "                    const isDeploymentRow = isDeploymentMethod;\n"
    "                    if (!hasNumericResult && !isOutlier && !isDeploymentRow) return null;\n"
    "                    return (\n"
    "                      <div key={methodId} className=\"flex items-center justify-between px-3 py-2 text-xs\" style={{ borderBottom: idx < allMethods.length - 1 ? '1px solid var(--border)' : undefined }}>\n"
    "                        <span style={{ color: isOutlier ? 'var(--kr-muted)' : 'var(--kr-text)', fontWeight: isOutlier ? 400 : 500 }}>{categoryName}</span>\n"
    "                        <span className=\"font-semibold tabular-nums\" style={{ color: isOutlier ? 'var(--fp-locked-text)' : 'var(--fp-success-text)' }}>{statusLabel}</span>\n"
    "                      </div>\n"
    "                    );"
)
if old_analysis_methods_render in src:
    src = src.replace(old_analysis_methods_render, new_analysis_methods_render, 1)
    print("✓ FAR-P2-1: Analysis Methods filter applied")
else:
    print("⚠ FAR-P2-1: Analysis Methods render block not found")

# ─────────────────────────────────────────────────────────────────────────────
# FAR-P2-2: Quality Score table — add maxWidth: 480
# ─────────────────────────────────────────────────────────────────────────────
old_quality_table = (
    "              <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #C0C0C0', marginBottom: 6, fontSize: 11 }}>"
)
new_quality_table = (
    "              <table style={{ width: '100%', maxWidth: 480, borderCollapse: 'collapse', border: '1px solid #C0C0C0', marginBottom: 6, fontSize: 11 }}>"
)
count_qt = src.count(old_quality_table)
if count_qt > 0:
    src = src.replace(old_quality_table, new_quality_table, 1)
    print(f"✓ FAR-P2-2: Quality Score table maxWidth added (found {count_qt} instance(s))")
else:
    print("⚠ FAR-P2-2: Quality Score table not found")

# ─────────────────────────────────────────────────────────────────────────────
# FAR-P2-3: Validation grid padding — reduce from 3px to 2px
# ─────────────────────────────────────────────────────────────────────────────
old_validation_padding = (
    "                    <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px 5px', border: '1px solid #D4D4D4', fontSize: 11, background: 'var(--kr-white)' }}>"
)
new_validation_padding = (
    "                    <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 5px', border: '1px solid #D4D4D4', fontSize: 11, background: 'var(--kr-white)' }}>"
)
if old_validation_padding in src:
    src = src.replace(old_validation_padding, new_validation_padding, 1)
    print("✓ FAR-P2-3: Validation grid padding reduced")
else:
    print("⚠ FAR-P2-3: Validation grid padding not found")

# ─────────────────────────────────────────────────────────────────────────────
# FAR-P2-4: Confidence Meter 3-bar strip — add between scorecard row and Decision Score chart
# Insert after the scorecard row closing: })()}
# ─────────────────────────────────────────────────────────────────────────────
old_scorecard_close = (
    "          </div>\n"
    "        );\n"
    "      })()}\n"
    "      {/* ── Decision Score Summary Chart ── */}"
)
new_scorecard_close = (
    "          </div>\n"
    "        );\n"
    "      })()}\n"
    "      {/* ── Confidence Meter 3-bar strip ── */}\n"
    "      {(() => {\n"
    "        const cmBars = [\n"
    "          { label: 'FCDI', value: fcdiTileScore >= 0 ? fcdiTileScore : 0, threshold: 60, unit: '/100',\n"
    "            color: fcdiTileScore >= 70 ? '#16a34a' : fcdiTileScore >= 40 ? '#d97706' : '#dc2626',\n"
    "            tooltip: 'Forensic Confidence & Data Integrity — composite reliability score' },\n"
    "          { label: 'Data Completeness', value: Math.round(dataCompleteness), threshold: 75, unit: '%',\n"
    "            color: dataCompleteness >= 75 ? '#16a34a' : dataCompleteness >= 50 ? '#d97706' : '#dc2626',\n"
    "            tooltip: 'Percentage of required claim fields successfully extracted' },\n"
    "          { label: 'Physics Consistency', value: Math.round(physicsScore), threshold: 70, unit: '/100',\n"
    "            color: physicsScore >= 70 ? '#16a34a' : physicsScore >= 30 ? '#d97706' : '#dc2626',\n"
    "            tooltip: 'Physics engine consistency score — higher = more consistent with claimed incident' },\n"
    "        ];\n"
    "        return (\n"
    "          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, margin: '8px 0', padding: '10px 12px', background: 'var(--kr-off-white)', border: '1px solid var(--kr-rule)' }}>\n"
    "            {cmBars.map((bar, i) => (\n"
    "              <div key={i} title={bar.tooltip}>\n"
    "                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>\n"
    "                  <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--kr-muted)' }}>{bar.label}</span>\n"
    "                  <span style={{ fontSize: 10, fontWeight: 700, color: bar.color }}>{bar.value}{bar.unit}</span>\n"
    "                </div>\n"
    "                <div style={{ height: 5, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>\n"
    "                  <div style={{ height: '100%', width: `${Math.min(100, bar.value)}%`, background: bar.color, borderRadius: 3, WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } as React.CSSProperties} />\n"
    "                </div>\n"
    "                <div style={{ marginTop: 2, fontSize: 8, color: 'var(--kr-muted)' }}>Threshold: {bar.threshold}{bar.unit}</div>\n"
    "              </div>\n"
    "            ))}\n"
    "          </div>\n"
    "        );\n"
    "      })()}\n"
    "      {/* ── Decision Score Summary Chart ── */}"
)
if old_scorecard_close in src:
    src = src.replace(old_scorecard_close, new_scorecard_close, 1)
    print("✓ FAR-P2-4: Confidence Meter 3-bar strip added to Section 0")
else:
    print("⚠ FAR-P2-4: Scorecard close marker not found")

# ─────────────────────────────────────────────────────────────────────────────
# FAR-S1: Glossary column widths — reduce Full Name column
# ─────────────────────────────────────────────────────────────────────────────
old_glossary_full_name = (
    "                  <td className=\"px-3 py-2 font-medium\" style={{ color: 'var(--kr-text)', whiteSpace: 'nowrap', width: 220 }}>{full}</td>"
)
new_glossary_full_name = (
    "                  <td className=\"px-3 py-2 font-medium\" style={{ color: 'var(--kr-text)', whiteSpace: 'normal', maxWidth: 180, minWidth: 120 }}>{full}</td>"
)
if old_glossary_full_name in src:
    src = src.replace(old_glossary_full_name, new_glossary_full_name, 1)
    print("✓ FAR-S1: Glossary Full Name column width fixed")
else:
    print("⚠ FAR-S1: Glossary Full Name column not found")

old_glossary_term = (
    "                  <td className=\"px-3 py-2 font-semibold\" style={{ color: 'var(--kr-text)', whiteSpace: 'nowrap', width: 60 }}>{term}</td>"
)
new_glossary_term = (
    "                  <td className=\"px-3 py-2 font-semibold\" style={{ color: 'var(--kr-text)', whiteSpace: 'nowrap', width: 55 }}>{term}</td>"
)
if old_glossary_term in src:
    src = src.replace(old_glossary_term, new_glossary_term, 1)
    print("✓ FAR-S1b: Glossary Term column width reduced to 55")
else:
    print("⚠ FAR-S1b: Glossary Term column not found")

# ─────────────────────────────────────────────────────────────────────────────
# FAR-S2: Retire legacy formula names in Glossary
# ─────────────────────────────────────────────────────────────────────────────
formula_renames = [
    ('["M1", "Campbell Method",', '["M1", "KINGA Crush-Depth Method",'),
    ('["M2", "NHTSA Barrier Equivalent",', '["M2", "KINGA Barrier-Equivalent Method",'),
    ('["M3", "Energy Balance Method",', '["M3", "KINGA Energy Balance",'),
    ('["M4", "Momentum Conservation",', '["M4", "KINGA Momentum Analysis",'),
    ('["M5", "Vision Deformation Analysis",', '["M5", "KINGA Vision Deformation",'),
    ('["EDS", "Ensemble Decision Score",', '["EDS", "KINGA Ensemble Decision Score",'),
]
for old, new in formula_renames:
    if old in src:
        src = src.replace(old, new, 1)
        print(f"✓ FAR-S2: Renamed {old[:30]}...")
    else:
        print(f"⚠ FAR-S2: Not found: {old[:40]}")

# Also update categoryMap in Section 2.3
old_category_map = (
    "  const categoryMap: Record<string, string> = {\n"
    "    CAMPBELL: 'Structural Deformation Analysis',\n"
    "    ENERGY_MOMENTUM: 'Energy-Momentum Balance',\n"
    "    IMPULSE: 'Contact Impulse Analysis',\n"
    "    DEPLOYMENT_THRESHOLD: 'Safety System Activation',\n"
    "    VISION_DEFORMATION: 'Vision Deformation Analysis',\n"
    "    M1: 'Structural Deformation Analysis',\n"
    "    M2: 'Energy-Momentum Balance',\n"
    "    M3: 'Contact Impulse Analysis',\n"
    "    M4: 'Safety System Activation',\n"
    "    M5: 'Vision Deformation Analysis',\n"
    "  };"
)
new_category_map = (
    "  const categoryMap: Record<string, string> = {\n"
    "    CAMPBELL: 'KINGA Crush-Depth Analysis',\n"
    "    ENERGY_MOMENTUM: 'KINGA Energy-Momentum Balance',\n"
    "    IMPULSE: 'KINGA Contact Impulse Analysis',\n"
    "    DEPLOYMENT_THRESHOLD: 'Safety System Activation',\n"
    "    VISION_DEFORMATION: 'KINGA Vision Deformation',\n"
    "    M1: 'KINGA Crush-Depth Analysis',\n"
    "    M2: 'KINGA Barrier-Equivalent Method',\n"
    "    M3: 'KINGA Energy Balance',\n"
    "    M4: 'KINGA Momentum Analysis',\n"
    "    M5: 'KINGA Vision Deformation',\n"
    "  };"
)
if old_category_map in src:
    src = src.replace(old_category_map, new_category_map, 1)
    print("✓ FAR-S2b: categoryMap updated with KINGA method names")
else:
    print("⚠ FAR-S2b: categoryMap not found")

# Also retire the "Campbell formula input" label in Section 2 physics
old_campbell_label = '<div style={{ fontSize: 9, color: \'var(--kr-muted)\' }}>Campbell formula input</div>'
new_campbell_label = '<div style={{ fontSize: 9, color: \'var(--kr-muted)\' }}>KINGA Crush-Depth input</div>'
if old_campbell_label in src:
    src = src.replace(old_campbell_label, new_campbell_label, 1)
    print("✓ FAR-S2c: 'Campbell formula input' label updated")
else:
    print("⚠ FAR-S2c: Campbell formula input label not found")

# ─────────────────────────────────────────────────────────────────────────────
# FAR-S3: White gap elimination — reduce section-heading top margin
# The section-heading class has margin-top in CSS. Also reduce mb-3 between subsections
# Reduce Repair Quote Summary top margin from 12px to 6px
# ─────────────────────────────────────────────────────────────────────────────
old_repair_quote_margin = "            <div style={{ margin: '12px 0 0' }}>\n            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--kr-navy)', marginBottom: 4, borderBottom: '1.5px solid var(--kr-navy)', paddingBottom: 3 }}>Repair Quote Summary</div>"
new_repair_quote_margin = "            <div style={{ margin: '6px 0 0' }}>\n            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--kr-navy)', marginBottom: 4, borderBottom: '1.5px solid var(--kr-navy)', paddingBottom: 3 }}>Repair Quote Summary</div>"
if old_repair_quote_margin in src:
    src = src.replace(old_repair_quote_margin, new_repair_quote_margin, 1)
    print("✓ FAR-S3: Repair Quote Summary top margin reduced")
else:
    print("⚠ FAR-S3: Repair Quote Summary margin not found")

# ─────────────────────────────────────────────────────────────────────────────
# FAR-P1-3: Quote Reconciliation — redesign to discrepancy table
# Replace the pill-tag sections with a structured table showing:
# (a) Quoted but not confirmed damaged (with repairer name)
# (b) Damaged but not quoted
# (c) Copy-quote alert
# ─────────────────────────────────────────────────────────────────────────────
old_qnd_section = (
    "              {/* Quoted but not confirmed damaged — pill tags */}\n"
    "              {hasQnd && (\n"
    "                <div>\n"
    "                  <p className=\"text-xs font-semibold mb-1.5\" style={{ color: 'var(--kr-amber)' }}>Quoted — not confirmed damaged</p>\n"
    "                  <div className=\"flex flex-wrap gap-1\">\n"
    "                    {(co.quotedNotDamaged as any[]).map((item: any, idx: number) => (\n"
    "                      <span key={idx} className=\"text-xs px-2 py-0.5 rounded-full font-medium\" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #f59e0b' }}>\n"
    "                        {item.componentName}\n"
    "                        {item.classification === 'suspect_inflation' && <span className=\"ml-1 opacity-70\">⚠</span>}\n"
    "                      </span>\n"
    "                    ))}\n"
    "                  </div>\n"
    "                  <p className=\"text-xs mt-1.5\" style={{ color: 'var(--kr-muted)' }}>\n"
    "                    These items appear in submitted quotes but were not identified in the damage assessment. Verify before approval.\n"
    "                  </p>\n"
    "                </div>\n"
    "              )}\n"
    "              {/* Damaged but not quoted — pill tags */}\n"
    "              {hasDnq && (\n"
    "                <div>\n"
    "                  <p className=\"text-xs font-semibold mb-1.5\" style={{ color: 'var(--kr-text)' }}>Damage identified — not in any quote</p>\n"
    "                  <div className=\"flex flex-wrap gap-1\">\n"
    "                    {(co.damagedNotQuoted as any[]).map((item: any, idx: number) => (\n"
    "                      <span key={idx} className=\"text-xs px-2 py-0.5 rounded-full font-medium\" style={{ background: 'var(--kr-off-white)', color: 'var(--kr-text)', border: '1px solid var(--kr-rule)' }}>\n"
    "                        {item.componentName}\n"
    "                        {item.severity && <span className=\"ml-1 opacity-60 text-[10px]\">{item.severity}</span>}\n"
    "                      </span>\n"
    "                    ))}\n"
    "                  </div>\n"
    "                  <p className=\"text-xs mt-1.5\" style={{ color: 'var(--kr-muted)' }}>\n"
    "                    These components were identified as damaged but do not appear in any submitted repair quote. May represent scope gaps or deferred repairs.\n"
    "                  </p>\n"
    "                </div>\n"
    "              )}"
)
new_qnd_section = (
    "              {/* ── Discrepancy Table: Quoted vs Damage Scope ── */}\n"
    "              {(hasQnd || hasDnq) && (() => {\n"
    "                const thS: React.CSSProperties = { padding: '4px 8px', fontSize: 10, fontWeight: 700, color: 'var(--kr-white)', background: 'var(--kr-navy)', textAlign: 'left', whiteSpace: 'nowrap' };\n"
    "                const tdS: React.CSSProperties = { padding: '3px 8px', fontSize: 11, color: 'var(--kr-text)', borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' };\n"
    "                const tdMuted: React.CSSProperties = { ...tdS, color: 'var(--kr-muted)', fontSize: 10 };\n"
    "                return (\n"
    "                  <div>\n"
    "                    <p className=\"text-xs font-semibold mb-2\" style={{ color: 'var(--kr-text)' }}>Scope Discrepancy Analysis</p>\n"
    "                    <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid var(--kr-rule)', fontSize: 11 }}>\n"
    "                      <thead><tr>\n"
    "                        <th style={thS}>Component</th>\n"
    "                        <th style={thS}>Discrepancy Type</th>\n"
    "                        <th style={thS}>Severity</th>\n"
    "                        <th style={thS}>Action Required</th>\n"
    "                      </tr></thead>\n"
    "                      <tbody>\n"
    "                        {hasQnd && (co.quotedNotDamaged as any[]).map((item: any, idx: number) => (\n"
    "                          <tr key={`qnd-${idx}`} style={{ background: idx % 2 === 0 ? '#fffbeb' : '#fef3c7' }}>\n"
    "                            <td style={{ ...tdS, fontWeight: 600 }}>\n"
    "                              {item.componentName}\n"
    "                              {item.classification === 'suspect_inflation' && <span style={{ marginLeft: 4, fontSize: 9, color: '#dc2626', fontWeight: 700 }}>⚠ SUSPECT</span>}\n"
    "                            </td>\n"
    "                            <td style={{ ...tdS, color: '#92400e' }}>Quoted — not in damage scope</td>\n"
    "                            <td style={tdMuted}>{item.classification === 'suspect_inflation' ? 'High' : 'Medium'}</td>\n"
    "                            <td style={tdMuted}>Verify physical damage before approving this line item</td>\n"
    "                          </tr>\n"
    "                        ))}\n"
    "                        {hasDnq && (co.damagedNotQuoted as any[]).map((item: any, idx: number) => (\n"
    "                          <tr key={`dnq-${idx}`} style={{ background: idx % 2 === 0 ? 'var(--kr-white)' : 'var(--kr-off-white)' }}>\n"
    "                            <td style={{ ...tdS, fontWeight: 600 }}>{item.componentName}</td>\n"
    "                            <td style={{ ...tdS, color: '#0369a1' }}>Damaged — not in any quote</td>\n"
    "                            <td style={tdMuted}>{item.severity ?? 'Unknown'}</td>\n"
    "                            <td style={tdMuted}>Scope gap — request quote amendment or confirm deferred repair</td>\n"
    "                          </tr>\n"
    "                        ))}\n"
    "                      </tbody>\n"
    "                    </table>\n"
    "                    {hasQnd && <p className=\"text-xs mt-1\" style={{ color: 'var(--kr-muted)' }}>Items quoted but not confirmed damaged require physical verification before settlement approval.</p>}\n"
    "                    {hasDnq && <p className=\"text-xs mt-1\" style={{ color: 'var(--kr-muted)' }}>Scope gaps may indicate incomplete quoting or deferred repairs — confirm with repairer before closing.</p>}\n"
    "                  </div>\n"
    "                );\n"
    "              })()}"
)
if old_qnd_section in src:
    src = src.replace(old_qnd_section, new_qnd_section, 1)
    print("✓ FAR-P1-3: Quote Reconciliation redesigned to discrepancy table")
else:
    print("⚠ FAR-P1-3: QND/DNQ pill sections not found")

# Write the updated file
with open(FAR, "w") as f:
    f.write(src)
print("\n✅ ForensicAuditReport.tsx updated successfully")

# ─────────────────────────────────────────────────────────────────────────────
# FAR-2: Fix photosDetected in claim-record-bridge.ts
# Also check enrichedPhotosJson when damagePhotosJson is empty
# ─────────────────────────────────────────────────────────────────────────────
with open(BRIDGE, "r") as f:
    bridge_src = f.read()

old_photos_detected = (
    "  const photoUrls: string[] = (() => {\n"
    "    const raw = parseJson(assessment.damagePhotosJson) ?? parseJson(assessment.damage_photos_json);\n"
    "    return Array.isArray(raw) ? raw.filter((u: unknown) => typeof u === \"string\") : [];\n"
    "  })();\n"
    "  const photosIngested = photoUrls.length > 0;\n"
    "  const photosDetected = photosIngested || photosIngestionFailed;"
)
new_photos_detected = (
    "  const photoUrls: string[] = (() => {\n"
    "    // Primary: damagePhotosJson (array of URL strings)\n"
    "    const raw = parseJson(assessment.damagePhotosJson) ?? parseJson(assessment.damage_photos_json);\n"
    "    if (Array.isArray(raw) && raw.some((u: unknown) => typeof u === \"string\")) {\n"
    "      return raw.filter((u: unknown) => typeof u === \"string\") as string[];\n"
    "    }\n"
    "    // Fallback: enrichedPhotosJson (array of {url, ...} objects from Stage 6)\n"
    "    const enriched = parseJson(assessment.enrichedPhotosJson);\n"
    "    if (Array.isArray(enriched) && enriched.length > 0) {\n"
    "      return enriched.map((p: any) => p?.url ?? '').filter(Boolean) as string[];\n"
    "    }\n"
    "    return [];\n"
    "  })();\n"
    "  const photosIngested = photoUrls.length > 0;\n"
    "  const photosDetected = photosIngested || photosIngestionFailed;"
)
if old_photos_detected in bridge_src:
    bridge_src = bridge_src.replace(old_photos_detected, new_photos_detected, 1)
    print("✓ FAR-2: claim-record-bridge.ts photosDetected now checks enrichedPhotosJson fallback")
else:
    print("⚠ FAR-2: photoUrls block in claim-record-bridge.ts not found")

with open(BRIDGE, "w") as f:
    f.write(bridge_src)
print("✅ claim-record-bridge.ts updated successfully")
