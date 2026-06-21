# KINGA Portal Audit Master Prompt v1.1

**Version:** 1.1  
**Author:** KINGA Product Intelligence  
**Purpose:** Reusable audit framework for every KINGA portal, dashboard, workflow, report, and backend integration. Produces consistent, comparable audit outputs across all modules.

---

## How to Use This Prompt

1. Complete **Phase 0 — Context Brief** before starting any other phase.
2. Work through Phases 1–10 in sequence. Each phase builds on the previous.
3. Produce all 13 deliverables listed at the end.
4. Use the final instruction as the quality standard throughout.

---

## PHASE 0 — Context Brief

Before beginning the audit, define:

| Field | Value |
|---|---|
| **Portal Name** | e.g., Claims Manager Portal |
| **Primary User Role** | e.g., Claims Manager, Senior Claims Handler |
| **Primary Business Objective** | e.g., Process claims efficiently, detect fraud at intake, manage handler workload |
| **Subscription Tier** | e.g., Available from Process tier upwards |
| **Key Decisions Supported** | e.g., Approve/Reject/Escalate claim, assign to handler, request re-assessment |
| **Upstream Portals** | e.g., Receives claims from Intake, receives AI assessment from Pipeline |
| **Downstream Portals** | e.g., Feeds Executive Dashboard, Risk Manager, Recovery Portal |
| **Regulatory Context** | e.g., POPIA, FSCA Short-Term Insurance Act, TCF principles |

This context brief must be completed before Phase 3 (Decision Support Audit) and Phase 5 (AI Intelligence Audit) can be answered correctly.

---

## PHASE 1 — Navigation and State Audit

Map the complete navigation structure of the portal.

For every page, tab, card, chart, widget, button, drill-down, modal, report, and workflow action, identify:

| Field | Description |
|---|---|
| **Component** | Name of the element |
| **Purpose** | What it is supposed to do |
| **Route** | URL or navigation path |
| **Current Status** | Working / Broken / Placeholder / Demo-only / Orphaned |
| **Issues Found** | Specific defects or gaps |
| **Recommendation** | Fix, enhance, remove, or defer |

Audit for: orphaned states, unreachable pages, duplicate navigation, dead links, placeholder screens, missing loading states, missing error states, missing empty-data states, circular navigation, broken drill-downs, inaccessible functionality.

**Deliverables:** Navigation Map, Orphaned Feature Register

---

## PHASE 2 — Data Lineage Verification

For every KPI, chart, table, score, metric, report, recommendation, alert, and AI output, trace the full path:

> Database Tables → Backend Procedure → Business Logic → Frontend Component → User Action

For every item document:

| Field | Description |
|---|---|
| **Metric** | Name of the KPI or data point |
| **Tables** | Source database tables |
| **Procedure** | tRPC procedure name |
| **Calculation** | Formula or aggregation logic |
| **Refresh Method** | On-load / on-demand / real-time |
| **Status** | Real data / Hardcoded / Demo fallback / Broken |

Verify: data source exists, procedure exists, frontend consumes correctly, calculations are valid, no hardcoded values, no demo-only values, no stale fixtures, no duplicated calculations.

**Deliverable:** Data Lineage Matrix

---

## PHASE 3 — Decision Support Audit

For every dashboard component answer:

- Why does it exist?
- Who uses it?
- What decision does it support?
- What action can be taken from it?
- What business value does it create?

Document:

| Field | Description |
|---|---|
| **Widget** | Component name |
| **User** | Role who uses it |
| **Decision Supported** | Specific decision it enables |
| **Action Available** | What the user can do after seeing it |
| **Business Value** | Financial, operational, or compliance value |

Identify: widgets that do not support decisions, metrics without context, KPIs without thresholds, data with no actionable outcome.

---

## PHASE 4 — Workflow Audit

Map the complete business workflow supported by this portal. Define the portal-specific workflow before auditing it — do not assume the generic claims workflow applies to every portal.

For every stage document:

| Field | Description |
|---|---|
| **Stage** | Workflow stage name |
| **Owner** | Role responsible |
| **Inputs** | What triggers or feeds this stage |
| **Outputs** | What this stage produces |
| **Consumed By** | Next stage or downstream portal |
| **Issues** | Bottlenecks, gaps, manual workarounds |

Identify: bottlenecks, missing transitions, duplicate actions, manual workarounds, workflow loops, missing audit trails, missing notifications.

**Deliverable:** Workflow Intelligence Assessment

---

## PHASE 5 — AI Intelligence Audit

For every AI-driven capability (damage assessment, fraud detection, repair recommendation, quote comparison, anomaly detection, relationship intelligence, recovery scoring, risk scoring), document:

| Field | Description |
|---|---|
| **AI Feature** | Name of the AI capability |
| **Inputs** | Data consumed by the model |
| **Outputs** | Scores, flags, recommendations produced |
| **Consumer** | Which portal/role uses the output |
| **Used?** | Yes / Partially / No |
| **Business Value** | What decision it enables |

Identify: AI outputs never surfaced, AI outputs never acted upon, orphaned intelligence, duplicate scoring, missing explainability.

**Deliverable:** AI Utilisation Matrix

---

## PHASE 6 — Reporting Audit

Review every report available from the portal. For every report document:

| Field | Description |
|---|---|
| **Report** | Report name |
| **Route** | How it is accessed |
| **Generator** | Function name in reportDefinitions.ts |
| **Data Source** | Procedures and tables used |
| **Export Works** | Yes / No / Untested |
| **Status** | Working / Broken / Missing handler / Placeholder |

Verify: report key exists, handler exists, report generates, PDF export works, report is useful, report supports decisions.

Identify: broken reports, duplicate reports, missing reports, reports without consumers.

**Deliverable:** Report Catalogue Audit

---

## PHASE 7 — Intelligence & Opportunity Audit

Identify information already available in the platform but not surfaced to users. For each opportunity:

| Field | Description |
|---|---|
| **Opportunity** | What intelligence is available but hidden |
| **Data Exists** | Yes / Partial / No |
| **Visible?** | Yes / No |
| **Effort** | Low / Medium / High |
| **Impact** | Low / Medium / High |

Examples to check: recovery opportunities, fraud hotspots, assessor risk patterns, repairer risk patterns, claim ageing, leakage, SLA breaches, network intelligence, cross-claim signals, cost benchmarking gaps.

**Deliverable:** Missing Intelligence Register

---

## PHASE 8 — Portal Improvement Plan

Create recommendations under four priority levels:

- **Critical** — Platform defects or misleading information
- **High** — Missing intelligence with major business value
- **Medium** — Usability and workflow improvements
- **Low** — Enhancements and polish

Document:

| Field | Description |
|---|---|
| **Item** | Specific improvement |
| **Priority** | Critical / High / Medium / Low |
| **Effort** | Days estimate |
| **Impact** | Business value description |
| **Owner** | Engineering / Product / Data |

---

## PHASE 9 — Portal Report Design

Design the ideal report generated by this portal. For each report section define:

- **Purpose** — What question it answers
- **KPIs** — Specific metrics included
- **Charts** — Visualisations required
- **Data Sources** — Procedures and tables
- **AI Narrative** — LLM prompt and output description
- **Drill-down Capability** — What the user can explore further

**Deliverable:** Portal Report Specification

---

## PHASE 10 — Cross-Portal Integration Audit

Audit how this portal integrates with every other KINGA portal. For each integration point document:

| Field | Description |
|---|---|
| **This Portal** | What it produces or consumes |
| **Other Portal** | Which portal is the counterpart |
| **Direction** | Feeds / Receives / Bidirectional |
| **Data Passed** | Specific fields or signals |
| **Status** | Working / Broken / Missing / Planned |
| **Gap** | What is missing or broken in the handoff |

Identify: portals that produce intelligence this portal should consume but does not, portals that should receive outputs from this portal but do not, missing notification triggers between portals, data that is duplicated across portals without synchronisation.

**Deliverable:** Cross-Portal Integration Map

---

## DELIVERABLES

Every portal audit must produce all 13 of the following:

1. **Executive Summary** — 1-page summary of critical findings and top 5 recommendations
2. **Navigation Map** — Complete component inventory with status
3. **Orphaned Feature Register** — All unreachable, broken, or placeholder features
4. **Data Lineage Matrix** — Every metric traced from database to UI
5. **Workflow Intelligence Assessment** — Portal-specific workflow with gaps identified
6. **AI Utilisation Matrix** — Every AI output and whether it is consumed
7. **Report Catalogue Audit** — Every report with generation and export status
8. **Missing Integration Register** — External integrations that should exist but do not
9. **Missing Intelligence Register** — Available data not surfaced to users
10. **Improvement Plan** — Prioritised recommendations (Critical / High / Medium / Low)
11. **Portal Report Specification** — Full design of the ideal portal report
12. **Implementation Priority Matrix** — All improvements ranked by effort vs impact
13. **Cross-Portal Integration Map** — How this portal connects to every other portal

---

## Final Quality Standard

> Audit the portal as if it were going live to a Tier-1 insurer tomorrow. Assume executives, claims managers, assessors, fraud investigators, repairers, auditors, and regulators will rely on it for decision-making. Prioritize accuracy, business value, workflow completeness, and intelligence visibility over UI appearance. Do not recommend replacing working functionality unless there is a clear business or technical justification.

---

*KINGA Portal Audit Master Prompt v1.1 — maintained in `/docs/kinga-portal-audit-master-prompt.md`*
