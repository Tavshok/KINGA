# Test Findings - 2026-02-15

## Portal Hub
- ✅ Historical Claims Intelligence card REMOVED from Portal Hub
- ✅ Only 5 portals visible: Insurer, Assessor, Panel Beater, Claimant, Admin Panel
- ✅ No SA/ZAR references visible on Portal Hub

## SA Currency References Fixed
- ✅ InsurerRoleSelection: R50,000 → $50,000 (updated)
- ✅ ExecutiveKPICards: R currency → $ (updated)
- ✅ HistoricalBenchmarkCard: R currency → formatCurrency helper (updated)
- ✅ ExecutiveSummary: R currency → $ (updated)
- ✅ VehicleDamageVisualization3D: R currency → $ (updated)
- ✅ Server-side: All R/ZAR references updated to $ (9 files)
- ✅ Schema defaults: ZAR → USD (updated)
- ✅ SA ID → National ID (updated)

## Tests
- ✅ 36 test files pass (546 tests passing, 2 skipped, 0 failures)
- ✅ Analytics tests updated to match actual router procedures
- ✅ Document tests fixed for insertId parsing
- ✅ Assessor disagreement columns added to database

## Bundle Size
- ✅ Reduced from 9.25 MB single bundle to code-split chunks
- ✅ Main app shell: ~116 KB (80x smaller)
- ✅ Heavy libraries (three.js, recharts, xlsx) lazy-loaded on demand
- ✅ Plotly.js removed (4.7 MB) and replaced with Recharts

## Historical Intelligence
- ✅ Removed from Portal Hub
- ✅ Removed from Insurer Dashboard
- ✅ Route restricted to admin-only
- ✅ Accessible from Admin Panel → AI Intelligence Training tab
