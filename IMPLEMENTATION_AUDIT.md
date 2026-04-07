# KINGA Report — Implementation Alignment Audit
Generated: 2026-04-07

## Summary
The `ForensicAuditReport` component is the primary report renderer. It implements the 6-section forensic audit format. Below is a line-by-line audit of every spec item from the implementation phases document.

---

## BATCH 1 — Cover Page & Section 2 Visual Engine

| Ref | Spec Item | Status | Notes |
|-----|-----------|--------|-------|
| 1.1 | Executive Authority Cover Card — full-width cover with decision pill, 3-metric dashboard (Physics / Cost / Evidence), primary blockers, action line, pre-flight status badges, horizontal claim timeline | ✅ DONE | Section 0 cover in ForensicAuditReport. Decision pill, 3 metrics, pre-flight badges, timeline all present. |
| 1.2 | SVG Vehicle Damage Map — top-down vehicle outline with front/rear/left/right/roof zones coloured by severity | ⚠️ PARTIAL | SVG damage map exists with front/rear/left/right zones. However: (a) only 2 severity levels (damaged=red, undamaged=grey) — spec requires red/amber/yellow/grey for severe/moderate/minor/undamaged; (b) roof/cabin zone not shown; (c) damage zone data comes from `damagedComponents` array but the field path needs verification against actual DB field name. |
| 1.3 | Comparative Pattern Table — Expected vs Observed for incident type, match rate | ✅ DONE | Section 2 has expected vs observed table for animal_strike, vehicle_collision, rollover. Match rate shown. |
| 1.4 | Constraint Status Matrix — results-only table: Constraint / Status / Verdict. No thresholds shown | ⚠️ PARTIAL | Constraint table exists in Section 2. However: threshold values ARE shown in the gate rows (e.g., "threshold: 30%") — spec says no threshold values exposed. |
| 1.5 | Decision Flowchart (SVG) — vertical flowchart with diamond decision nodes and rectangular action boxes | ❌ MISSING | Section 6 has a gate checklist (pass/fail rows) and trigger conditions list, but NO SVG diamond flowchart. It is a styled list, not an actual flowchart diagram. |

---

## BATCH 2 — Financial Section & Fraud Section

| Ref | Spec Item | Status | Notes |
|-----|-----------|--------|-------|
| 2.1 | Cost Waterfall Chart — SVG step-down waterfall: Quote → Adjustments → Agreed Cost. Auto-correction log inline | ⚠️ PARTIAL | Cost waterfall exists as horizontal bar chart (not step-down SVG). Shows Quoted / AI Estimate / Fair Range Min / Fair Range Max. Auto-correction log shown below. Missing: (a) step-down "waterfall" shape (spec says Quote → Adjustments → Agreed Cost as descending steps); (b) inline auto-correction annotation on the bars themselves. |
| 2.2 | Fraud Indicator Table with Mitigation — indicator name, score contribution, suppressed flag, mitigation note. System errors show score=0 with "SYSTEM ERROR" | ✅ DONE | Section 5 fraud indicator table has all these columns. System failure detection for photo factors is implemented. Mitigation notes per indicator present. |
| 2.3 | Final Risk Statement — plain-language paragraph distinguishing system errors from claimant omissions | ✅ DONE | Section 5 has a risk narrative paragraph with system error vs claimant omission distinction. |
| 2.4 | Document Extraction Table — Document ID / Type / Extracted / Confidence columns | ⚠️ PARTIAL | Section 4 has a document inventory table. However: (a) no "Confidence" column — only Present/Missing/Note; (b) document IDs are synthetic (not extracted from actual OCR pipeline output). |

---

## BATCH 3 — Report Infrastructure & Anti-Repetition

| Ref | Spec Item | Status | Notes |
|-----|-----------|--------|-------|
| 3.1 | Report Page Header — persistent header: Claim ID (left), KINGA v4.2 (centre), UTC timestamp (right) | ✅ DONE | `ReportPageHeader` from Batch3ReportComponents renders above ForensicAuditReport. Has claim ID, KINGA branding, timestamp, decision pill, Re-run and Print buttons. |
| 3.2 | Anti-repetition enforcement — incident description in Section 1 only; cost numbers in Section 3 only; damage components in Section 2 only; decision logic in Section 6 only | ⚠️ PARTIAL | Incident description appears only in Section 1 ✅. Cost numbers appear only in Section 3 ✅. However: (a) damage components appear in both Section 2 (damage map) AND Section 4 (document table references) — minor duplication; (b) decision logic appears in both Section 6 AND the cover page (Section 0) decision pill/blockers — this is intentional but may need a "See Section 6" reference on the cover. |
| 3.3 | Report Hash + Verification — SHA-256 hash in monospace, verification URL shown | ⚠️ PARTIAL | Report hash exists (djb2 hash, not SHA-256). Displayed in monospace in the integrity seal and audit trail. However: (a) spec says SHA-256 — current implementation uses djb2 (a weaker non-cryptographic hash); (b) no verification URL shown — spec says "Verification URL shown". |
| 3.4 | Photo Gallery — thumbnail grid with figure captions and extracted component labels; system failure block; "No photos submitted" state | ⚠️ PARTIAL | Photo grid exists in Section 4 (up to 9 thumbnails). However: (a) no figure captions — images shown without labels; (b) no extracted component labels per photo (e.g., "Bonnet — severe damage"); (c) system failure block exists ✅; (d) "No photos submitted" state exists ✅. |
| 3.5 | Typography — Inter font at 10pt body / 14pt headers / monospace for numbers and hashes. Print margins: 2cm all sides, 3cm left | ⚠️ PARTIAL | Inter font loaded via Google Fonts ✅. Print stylesheet uses 10pt body ✅. However: (a) print margins are 15mm/12mm (not 20mm/30mm as spec requires); (b) not all numbers use monospace — only hash and some cost figures. |

---

## BATCH 4 — Phase 1 & 2 Engine Results Surface

| Ref | Spec Item | Status | Notes |
|-----|-----------|--------|-------|
| 4.1 | Data Corrections Badge — amber badge "Data corrections applied: N" in cover pre-flight bar; corrections log in Section 3 | ✅ DONE | Section 0 cover has data completeness badge. Section 1 has corrections log. Section 3 has cost corrections log. Cover pre-flight bar shows correction count. |
| 4.2 | Phase 2 Key Drivers — surfaced as "Primary Blocker" lines on cover and "Trigger Conditions" in Section 6 flowchart | ✅ DONE | Key drivers shown in cover blockers strip and in Section 6 Trigger Conditions list. |
| 4.3 | Phase 2 Advisories — physics constraint advisories shown inline next to relevant constraint row | ⚠️ PARTIAL | Advisories shown as a separate panel in Section 5 (after fraud table). NOT shown inline next to constraint rows in Section 2 — spec requires inline placement. |
| 4.4 | Data Completeness Score — from `_phase2.dataCompletenessScore`, shown as percentage bar in cover pre-flight badge and Section 1 | ✅ DONE | Data completeness shown as ArcGauge in Section 1 and as StatusBadge in cover. Field path: `phase2.dataCompleteness` ✅. |

---

## ADDITIONAL ISSUES FOUND (not in original spec)

| Issue | Description | Priority |
|-------|-------------|----------|
| Colour conflicts | Old Batch1-4 component files still exist in the project and are partially imported (Batch3 still imported for ReportSectionDivider and ReportIntegritySeal). These files contain hardcoded hex colours that may cause issues if accidentally rendered. | Medium |
| Duplicate cover | `ReportPageHeader` (from Batch3) renders above `ForensicAuditReport` Section 0 cover. Both show decision pill, claim ref, and vehicle info — creating visual duplication at the top of the report. | High |
| Threshold exposure | Section 6 gate rows show "threshold: 30%" etc. — spec says no thresholds exposed to adjusters. | Medium |
| Cost waterfall shape | Current implementation is a horizontal bar chart, not a step-down waterfall. The spec specifically says "step-down waterfall: Quote → Adjustments → Agreed Cost". | Medium |
| SVG flowchart | Section 6 has no SVG diamond flowchart — only a styled list. The spec requires actual diamond/rectangle SVG nodes. | High |
| Photo captions | Photo thumbnails have no per-image captions or extracted component labels. | Low |
| Hash algorithm | djb2 used instead of SHA-256. For a forensic audit report, SHA-256 is more appropriate. | Low |
| Verification URL | No verification URL shown next to the report hash. | Low |
| Print margins | 15mm/12mm vs spec's 20mm/30mm. | Low |

---

## PLAN OF ACTION (Priority Order)

### P1 — High Priority (visible to adjusters, affects report authority)

1. **Remove duplicate cover** — `ReportPageHeader` and `ForensicAuditReport` Section 0 both show the same decision/claim info. Options: (a) remove `ReportPageHeader` and let Section 0 cover serve as the header, or (b) make `ReportPageHeader` a minimal sticky nav bar only (no decision pill, just claim ID + back button). Recommended: option (b).

2. **SVG Decision Flowchart** — Replace the gate checklist in Section 6 with an actual SVG vertical flowchart: diamond nodes for decision gates, rectangular boxes for actions, arrows connecting them. Show the exact path taken (green for passed gates, red for failed).

3. **Remove threshold exposure** — Remove "threshold: 30%" etc. from the Section 6 gate rows. Show only the value and pass/fail verdict.

### P2 — Medium Priority (improves accuracy and spec compliance)

4. **SVG damage severity levels** — Extend VehicleDamageMap to support 4 severity levels (severe=red, moderate=amber, minor=yellow, undamaged=grey) driven by a severity field on each damaged component. Add roof/cabin zone.

5. **Cost waterfall step-down shape** — Replace horizontal bars with a proper step-down waterfall: Quote (starting bar) → downward adjustment step → AI Estimate → fair range band. Show the delta between Quote and AI Estimate as a labelled step.

6. **Phase 2 advisories inline** — Move advisories from the standalone Section 5 panel to inline placement next to the relevant constraint row in Section 2's Constraint Status Matrix.

### P3 — Low Priority (polish and completeness)

7. **Photo captions** — Add figure number and extracted component label below each thumbnail in the Section 4 photo grid.

8. **SHA-256 hash** — Replace djb2 with a proper SHA-256 hash using the Web Crypto API (`crypto.subtle.digest`). This is async but can be computed once on mount.

9. **Verification URL** — Add a verification URL next to the report hash (e.g., `https://kinga.ai/verify/{hash}`).

10. **Print margins** — Update `@page` margins to `margin: 20mm 20mm 20mm 30mm` (2cm all sides, 3cm left) as per spec.

11. **Monospace numbers** — Apply `font-mono` class to all numeric values in tables (not just cost figures and hashes).

12. **Clean up Batch1-4 files** — Remove or archive the old batch component files since `ForensicAuditReport` now supersedes them. Only `ReportSectionDivider` and `ReportIntegritySeal` from Batch3 are still in use.
