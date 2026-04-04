# UI Redesign Audit Notes

## CSS Token System (index.css)
- Lines 51-124: Light mode tokens — well-defined with WCAG ratios documented
- Lines 126-195: Dark mode tokens — properly set up
- Lines 320-340: Status badge utility classes (.status-approve, .status-review, .status-reject, .status-fraud)
- Lines 382-946: BI Design System — ALL hardcoded oklch() values, dark-mode only, with light overrides at bottom
- The BI system uses 100+ inline oklch() values — these need CSS variable conversion

## ForensicDecisionPanel (1249 lines)
- Lines 1-34: Imports
- Lines 56-113: Helper functions (decisionConfig, fraudBadgeCls, confidenceBadgeCls, severityBand)
- Lines 119-196: Sub-components (Card, Stat, Bar, FlagRow, TR, TH)
- Lines 202-296: Main component data parsing and derived values
- Lines 300-409: Decision Header (verdict, cost, confidence, fraud, doc verification)
- Lines 411-426: Case signature strip
- Lines 431-572: Overview tab (confidence aggregation, narrative, integrity, doc verification)
- Lines 574-757: Cost Analysis tab (cost decision, narrative, comparison chart, parts reconciliation, repair intel)
- Lines 759-930: Damage tab (vehicle viz, severity chart, zone map, damage pattern, severity consensus, photos)
- Lines 932-1065: Fraud & Risk tab (fraud chart, summary, scenario detection, cross-engine)
- Lines 1068-1244: Technical tab (impact vector, causal chain, learning gate, pipeline controls)

## Files with inline oklch() (227 total)
1. ClaimDecisionReport.tsx: 56
2. InsurerComparisonView.tsx: 41
3. InsurerClaimsTriage.tsx: 34
4. RiskRadarWidget.tsx: 25
5. ExecutiveDashboard.tsx: 20
6. GovernanceSummaryCard.tsx: 15
7. IntelligenceEnforcementPanel.tsx: 13
8. GovernanceDashboard.tsx: 8
9. ReportReadinessPanel.tsx: 7
10. IntelligenceSection.tsx: 7
11. AiIntelligenceSummaryCard.tsx: 1

## ImpactVectorDiagram (212 lines)
- Basic SVG with top-down vehicle silhouette
- Force arrow, zone highlights, data grid
- Needs: larger size, better visual impact, animation-like emphasis
