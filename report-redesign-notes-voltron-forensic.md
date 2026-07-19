# Original Voltron Forensic Report Reference Notes

Source: `/home/ubuntu/upload/KINGA—DOC-20260626-33B1FDFEVoltronclaim.pdf`
Pages reviewed: 1-9 of 27
Date noted: 2026-07-19

## Overall design language

The original report is much more restrained, formal, and document-like than the newly implemented HTML versions. It uses:

- A thin institutional header line with report navigation text
- Sparse use of colour, mostly **amber, green, and red accents only where needed**
- Large white space and narrow content blocks
- Fine table rules and thin separators instead of dense card systems
- Compact executive framing before detailed sections
- Structured information blocks with short narrative text, not long descriptive paragraphs
- A watermark across inner pages
- Repeated footer: `KINGA AI v4.2 | Confidential Audit Report`

## Cover / opening structure

### Page 1
- Top navigation strip: "2 reports generated for DOC-20260626-33B1FDFE"
- Report title: `KINGA ENGINE v4.2 - FORENSIC CLAIM DECISION REPORT`
- Main title block: `Forensic Claim Decision Report`
- Subtitle: `Automated KINGA analysis · Not legal advice · Requires human adjuster review`
- Right aligned identity block with:
  - KINGA report reference
  - Claim doc reference
  - Hash
  - Vehicle
  - Registration
  - Generated date
- Draft alert strip under title area
- Lower hero block uses left-side brand + report identity and right-side claim/vehicle/insurer details
- Cover is more like a formal report title sheet than a modern dashboard

### Page 2
- Decision header section with left-aligned verdict (`REVIEW REQUIRED`) and four metric columns:
  - Fraud Risk
  - Physics
  - FCDI
  - Data
- Right column stacks quote amounts and highlights the optimised figure
- Red issue strip immediately below metrics summarises key blockers
- Then two side-by-side tables:
  - Vehicle details
  - Policyholder & claim details
- This page acts as the real executive summary page

### Page 3
- Repair quote summary table first
- Then five metric cells:
  - Fraud score
  - Physics
  - FCDI
  - Data completeness
  - Market value
- Threshold strip beneath
- Decision score summary bar chart
- Two lower panels:
  - Forensic confidence & data integrity (FCDI)
  - Claim timeline

### Page 4
- Executive summary continuation
- Compact single-line physics snapshot with aligned badge
- Very sparse layout; strong emphasis on concise summary rather than density

## Section architecture from pages 5-9

### §1 Incident facts area (Pages 5-7)
- 1.1 Incident Facts: formal table with confidence badge and a short source note
- 1.1a Incident Narrative: quote-style block with a small consistency badge
- Reconstructed Sequence and Cross-Validation subsections
- Physics row: badge + concise explanatory sentence
- Damage row: badge + concise explanatory sentence
- Narrative flags block with severity pill and evidence quote
- Analyst reasoning paragraph
- 1.2 Insurance & Policy Context: compact table
- 1.3 Vehicle Details: compact table
- 1.4 Driver Details: compact table
- 1.5 Police Report Details: compact table with finding badge
- 1.6 Data Completeness Checklist: three-column table showing issue + impact

### §2 Physics & damage analysis (Pages 7-9)
- 2.1 Impact Overview with small amber section badge (`Physics 50% — Minor anomaly`)
- Top KPI row with four metric cards:
  - Delta-V
  - Kinetic Energy
  - Impact Force
  - Vehicle Mass
- Small fact table beneath (impact severity, direction, deceleration, structural deformation, etc.)
- Right-side coloured bar chart for pattern/factors
- One-line statement: `Damage pattern is consistent with reported frontal impact (50% match).`
- Reconstruction summary paragraph
- 2.2 Speed Analysis with confidence badge
- Large consensus speed number, range, and confidence interval
- Horizontal speed scale graphic
- Red discrepancy callout box
- Green braking coherence callout box
- Analysis methods table with method and computed speeds at right
- Methodology disclosure table below
- Key assumptions / uncertainty / expert review in paragraph blocks
- 2.3 Damage Zone & Pattern with severity label (`Low`) and top-down map graphic

## Key components to preserve in redesign

1. The **formal report-document feel**, not a product landing page or card-heavy dashboard.
2. The **page ordering** and executive framing from the original report.
3. The **decision page structure** with left verdict, central metrics, right quote stack.
4. The **compact tables** for claim, policy, driver, police, vehicle, and checklist.
5. The **badge-led section headings** and confidence/status chips.
6. The **physics section layout**: KPI row, compact supporting chart, consensus speed panel, discrepancy box, coherence box, methods table, methodology table.
7. The **damage zone map** with simple, technical styling.
8. Sparse narrative supported by evidence tables and short reasoning text.

## Immediate implementation implications

- The current new generators are too custom and diverge from the original architecture.
- The forensic report should be restructured to follow the original page order and visual hierarchy much more closely.
- The claims/process-tier report should be derived from this same document grammar, just simplified.
- The Claims Processor dropdown in `ClaimsProcessorDashboard.tsx` is a separate UI surface and must be updated directly; updating Reports Centre alone is insufficient.
- The labels visible to users should likely remain:
  - `KINGA Claims Report`
  - `KINGA Forensic Audit`
  while the underlying implementations are the new generators.

## Files likely needing changes next

- `client/src/pages/ClaimsProcessorDashboard.tsx`
- `client/src/components/ReportChooser.tsx`
- `server/reporting/forensicDecisionReport.ts`
- `server/reporting/claimsIntelligenceReport.ts`
- potentially shared CSS/template helpers to support the original report grammar

## Remaining PDF pages to inspect later if needed

- Pages 10-27 for cost reconciliation, evidence, fraud, workflow, definitions, and appendices
- These likely contain more exact patterns for section headers, charts, and tables that should inform the final redesign

---

These notes were captured from manual visual review of the original PDF pages 1-9.


## Original forensic PDF — additional structure findings from pages 10-19

### Pages 10-12: physics close-out, damage severity, structural intelligence, cost summary

**Page 10** closes the physics section with two distinct blocks only: a compact **legend / damage-zone key** at the top, followed by **2.4 Physics Constraints** as a sparse pass-fail table. The section is deliberately light, with only two rows visible: `airbag_deployment` marked **Advisory** and `seatbelt_pretensioner` marked **Failed**. This page confirms that the original report keeps the end of the physics chapter visually restrained rather than verbose.

**Page 11** introduces **2.6 Damage Severity & Coverage** and **2.8 Vehicle Structural Intelligence**. The damage coverage section uses a left-right split: the left side shows severity distribution across the 62 components, while the right side shows quote coverage for the selected repairer with four large numbers: **48% coverage**, **30 matched**, **25 missing**, **80 extra**. Below that is a dense boxed list of not-covered items and then a small structural warning strip. This is important: the original report does not bury these findings in prose; it presents them as a compact decision panel.

The same page begins **Vehicle Structural Intelligence** as a two-column block. The left side is a spec table with items such as insured vehicle, ANCAP rating, occupant scores, structural class, CRASH3 A/B, typical mass, and safety risk. The right side is a short **Structural Assessment Notes** panel, followed by a longer **Structural Intelligence Narrative** below. This confirms the pattern: table first, narrative second.

**Page 12** continues the structural intelligence narrative in full-width paragraph form and then transitions straight into **3.1 Cost Summary**. The cost summary page structure is critical and should be preserved: it contains a slim top line, a verdict/status row showing **REJECT** and **NFS 44 — MODERATE**, three large cost cards (**Lowest Submitted**, **KINGA Optimised**, **Savings Opportunity**), a mini comparison strip, a settlement line, and a bottom confidence note / review tag. This is a highly structured executive panel, not a generic summary section.

### Pages 13-17: repair cost analysis, multi-page quote tables, reconciliation and scope discrepancy analysis

**Page 13** starts **3.2 Repair Cost Analysis** with a single-page chart labelled **Component-Level Quote Comparison (Top 10)** and then a large black-header comparison table. The table columns are organised as **Repair Item / Zone / Category / multiple quote columns**, and the totals row appears at the bottom. The visual impression is highly tabular and data-led.

**Page 14** continues the same comparison table onto the next page and ends with a repeated compact cost strip beneath the table: **Lowest Submitted**, **KINGA Optimised**, **Savings Opportunity**, then a smaller NFS and moderation line. This means the original report deliberately repeats the key decision numbers after long tables so the reader regains the executive summary without flipping backwards.

**Page 15** begins **3.3 Quote Reconciliation**. The title line is immediately followed by the subtitle **Component coverage gaps and quote integrity flags**. The section opens with a prominent outlined alert titled **COPY QUOTATION DETECTED**, followed by one short explanatory sentence. Then the report uses chips/tags to show missing components and extra quoted components, grouped visually rather than in narrative paragraphs. A small label at the bottom introduces **Scope Discrepancy Analysis**.

**Pages 16-17** continue **Scope Discrepancy Analysis** as a plain table with severity and recommended action. The rows follow a fixed pattern: component, discrepancy statement, severity, and action. The wording is brief and operational, for example "Quoted — not in damage scope" or "Damaged — not in any quote". At the bottom of page 17 the report transitions into **4.1 Document Register** and **4.2 Photo Evidence**. The document register is a simple black-header table with **Document / Type / Confidence / Detail** and a small count at the top right (`5 items received`). The photo evidence section starts quietly with an analysed label and a placeholder / inventory area rather than a dramatic redesign.

### Pages 18-19: photo evidence by zone and fraud risk assessment

**Page 18** continues photo evidence with a compact bar chart at the top and a black KPI band beneath it: **Photos Analysed**, **High Confidence**, **Poor Quality / No Detection**, **Unique Components**, **Zones Covered**. Then **4.1 Damage Evidence by Zone** appears as a structured zone card. The first example is **Front Zone — Severe**, with zone statistics on the same line, three small thumbnails on the left, and two compact lists on the right: **Key Findings** and **Components Identified**. This is important for redesign: the original image section is evidence-led and compact, not a gallery-first layout.

The same page opens **5.0 Fraud Risk Assessment** near the bottom. That section is arranged as a three-part panel: a large left score block (here **22/100**, Low risk), a small centre radar graphic, and a right-side **Factor Contributions** list. The design is restrained and balanced.

**Page 19** continues with **5.1 Risk Indicator Breakdown** as a full-width black-header table using the columns **Indicator / Score / Score Bar / Triggered / Mitigation Note**. The mitigation wording is short and action-oriented. This confirms the original report's fraud section is not a narrative essay; it is a score panel followed by a matrix.

### Design implications for the redesign

1. The forensic redesign must preserve the original report's **section order and pagination rhythm**: physics close-out, severity & coverage, structural intelligence, cost summary, repair cost analysis, quote reconciliation, document register, photo evidence, fraud assessment.
2. The report should use **tables and executive panels first**, with narrative only where the original uses narrative, especially in structural intelligence.
3. Long tables must be followed by a **repeated executive cost strip** so the reader regains the commercial position immediately.
4. The evidence section should be redesigned as **compact zone evidence cards**, not an over-styled photo gallery.
5. Fraud should remain a **score panel + radar + contribution list + breakdown table**, closely following the original hierarchy.


### Pages 20-24: advisories, date consistency, cross-engine consistency, policy flags, decision rationale, quality, validation, approval gaps, definitions

**Page 20** continues the fraud/consistency chapter with a very restrained sequence of blocks. First there is an **Advisories** line with a single sentence about airbag deployment being unlikely at 15.0 km/h Delta-V. Then **5.2 Accident Date Consistency** appears as a black-header table with `Source / Date / Status`, followed by a short conclusion sentence. Below that is **5.4 Cross-Engine Consistency — Physics ↔ Damage ↔ Fraud**, presented as a single consistency bar and a compact stats line (`Checks run`, `Agreements`, `Conflicts`, `Critical`). The page then ends with **5.5 Policy Flags & Subrogation**, including an **Exclusion** callout for suspension and a small final risk statement. This confirms the original report moves from fraud score into operational consistency checks and policy implications before any final decision page.

**Page 21** introduces **6.0 Decision Rationale** with a right-aligned badge **REVIEW REQUIRED**. The page contains one concise rationale paragraph, a short **Required Next Steps** strip, then a boxed **Decision Flowchart**. Under the flowchart are compact sub-blocks for **6.1 Trigger Conditions** and **6.3 Required Next Steps**. Lower on the page is **6.5 Audit Trail**, presented as a small grid showing analysed by, workflow stage, data sources, extraction confidence, human review, and corrections applied. The hierarchy is very deliberate: decision statement first, workflow visual second, audit metadata third.

**Page 22** continues the audit metadata with `Report Hash`, `Report Generated`, and `Digital Signature`, then opens **7.0 Assessment Quality Score** with a small sentence and a six-cell score band. Immediately under that is **Mandatory Adjuster Actions** as two numbered lines. The page then starts **8.0 Validation Status**, a two-column matrix of named checks with PASS/WARNING/FAIL badges. Below that are **8.1 High Severity Issues (2)** and **8.2 Medium Issues (7)**, where each issue is written as a code tag followed by a compact explanatory paragraph. This page is structurally crucial because it shows that quality and validation are separate sections after decision rationale, not embedded earlier.

**Page 23** continues the issues list and then introduces an orange outlined impossibility warning box. The box leads with a sentence stating KINGA detected logical, temporal, or physical impossibility that a senior adjuster would flag on first review. It then shows a black-header table with columns such as `Code / Class / Severity / Flag / Detail`. The visible example is **I2** for duplicate claim / same registration within 7 days. Below that is the **5-stage approval table**, beginning with Claims Processor Review, Internal Assessor Assessment, Risk Manager Sign-off, Claims Manager Approval, and Executive / GM Sign-off. This confirms the impossibility flagging appears late in the report, after validation issues and before the action gap register.

**Page 24** begins with a one-line framing sentence about actionable gaps identified by the pipeline. It then shows a compact counter box (`1 RECOMMENDED`) and a black-header action table with columns `# / Priority / Gap / Action Required / Dimension Affected`. After the table there is a small footer strip with report name, claim reference, report hash, date, and status. The page then starts **B.1 Definitions** as a black-header glossary table with columns `Term / Full Name / Definition`. The visual treatment matches the rest of the report: plain tables, strong headers, little ornament.

### Design implications from pages 20-24

| Original section | Structural pattern to preserve in redesign | Redesign implication |
|---|---|---|
| Advisories / Date Consistency / Cross-Engine Consistency / Policy Flags | Thin stacked operational panels with sparse text | Keep these as compact checks, not large cards or long prose sections |
| Decision Rationale | One rationale paragraph + workflow box + compact trigger/next-step lists + audit trail grid | Maintain the same decision-first logic and subordinate metadata panels |
| Assessment Quality Score | Short intro + six-metric band + mandatory actions | Keep this as a distinct quality gate page, not merged into fraud or decision |
| Validation Status + High/Medium Issues | Matrix first, coded issue list second | Preserve the matrix and issue taxonomy in that exact order |
| Impossibility flags | Warning lead-in + black-header detail table | Keep flags late in the report as a senior-review escalation device |
| Approval stages / Action gaps / Definitions | Final governance pages | The report should close with approvals, gaps, and glossary rather than ending on analytics |


---

## Current forensicDecisionReport.ts section order (v7 build — needs realignment)

Current sections in the new generator (844 lines):
- Cover (meta grid, cost snap, verdict bar, 6-cell score strip, contents index)
- §F Critical Flags (impossibility, copy-quotation, exclusions, structural)
- §1 Vehicle Identity & Claim Details
- §2 Physics & Incident Analysis (narrative, metrics KPI, speed scale SVG, 4-method table, constraints, structural intel)
- §3 Cost Intelligence (quote cards, bar chart, full table, reconciliation chips)
- §4 Evidence & Photo Forensics (document register, photo grid)
- §5 Fraud Intelligence (radar chart, indicator breakdown)
- §6 Decision & Approval Workflow (action table, 5-stage sign-off)
- §B Definitions

## Original PDF section order (27 pages — what the redesign must match)

1. Cover (pages 1-3): claim meta, cost snapshot, verdict/recommendation, score strip
2. §F Critical Flags (page 4): impossibility flags, copy-quotation, exclusions, structural gaps
3. §1 Vehicle Identity & Claim Details (page 4-5): vehicle grid, policy fields, timeline
4. §2 Physics & Incident Analysis (pages 5-9):
   - 2.1 Incident Narrative (claimant statement, reconstructed sequence, narrative flag)
   - 2.2 Reconstructed Sequence
   - 2.3 Physics Metrics (8-cell KPI band: Delta-V, KE, Impact Force, Mass, Deceleration, Energy Absorbed, EBS Severity, Pre-Impact Speed)
   - 2.4 Speed Estimation Methods (4-row table: M1 Crush-Depth, M3 Energy Balance, M5 Vision, CI Contact Impulse)
   - 2.5 Physics Constraints (pass/fail table: airbag deployment, seatbelt pretensioner)
   - 2.6 Damage Severity & Coverage (coverage stats, missing/extra component chips)
   - 2.7 Vehicle Structural Intelligence (spec table + structural assessment notes + narrative)
5. §3 Cost Intelligence (pages 11-17):
   - 3.1 Cost Summary (3 cost cards, NFS score, settlement line)
   - 3.2 Repair Cost Analysis (bar chart + full comparison table)
   - 3.3 Quote Reconciliation (copy-quotation flag, component chips, scope discrepancy table)
6. §4 Evidence (pages 17-18):
   - 4.1 Document Register (5-column table)
   - 4.2 Photo Evidence (bar chart, KPI band, zone evidence cards with thumbnails)
7. §5 Fraud Risk Assessment (pages 18-20):
   - 5.0 Fraud Risk Assessment (score panel + radar + factor contributions)
   - 5.1 Risk Indicator Breakdown (matrix table)
   - Advisories
   - 5.2 Accident Date Consistency (date source table)
   - 5.4 Cross-Engine Consistency (consistency bar, stats)
   - 5.5 Policy Flags & Subrogation (exclusion callout, final risk statement)
8. §6 Decision Rationale (page 21):
   - 6.0 Decision Rationale (rationale paragraph, required next steps, decision flowchart)
   - 6.1 Trigger Conditions
   - 6.3 Required Next Steps
   - 6.5 Audit Trail (grid: analysed by, workflow stage, data sources, confidence, human review)
9. §7 Assessment Quality Score (page 22):
   - 7.0 Quality Score (6-metric band, mandatory adjuster actions)
   - 8.0 Validation Status (matrix: PASS/WARNING/FAIL per check)
   - 8.1 High Severity Issues
   - 8.2 Medium Issues
10. Impossibility Flags (page 23): warning lead-in + detail table
11. Approval Stages (page 23): 5-stage table
12. Action Gaps (page 24): recommended action table
13. §B Definitions (page 24): glossary table

## Key design rules from the original PDF

- Section headings have a right-aligned badge showing score or status
- Long tables are followed by a repeated cost strip
- Photo evidence uses zone cards with thumbnails + key findings + components identified
- Fraud section: score panel (large number) + radar + factor contributions list
- Quality section is AFTER decision rationale, not embedded in fraud
- Validation issues use coded tags [MISSING_OPTIONAL_FIELD] dataExtraction format
- Impossibility flags appear AFTER validation issues as a senior-review escalation
- Approval stages and action gaps are the final governance pages before definitions
