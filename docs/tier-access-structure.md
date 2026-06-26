# KINGA Platform — Tier Access & Monetisation Structure
**Document Version:** 2.0 — Supersedes all prior tier definitions  
**Authority:** Strategy document (pasted_content_2.txt)  
**Date:** June 2026

---

## 1. Pricing Model

| Tier | Monthly Platform Fee | Per-Claim Fee | Forensic Report |
|---|---|---|---|
| **Process** | $900 / month | $12 / claim | $120 / report (buy-up) |
| **Protect** | $1,300 / month | $12 / claim | Included (summary depth) |
| **Prove** | $1,800 / month | $12 / claim | Included (full suite) |

> **Note:** Current codebase has Prove at $1,600. Strategy document specifies $1,800. This needs to be updated.

---

## 2. Portal Access by Tier

### 2.1 Portals Available at All Tiers (Process, Protect, Prove)

| Portal | Role | Description |
|---|---|---|
| Claims Processor | `claims_processor` | Intake queue, in-progress claims, KINGA assessment complete, completed |
| Claims Manager | `claims_manager` | All claims, pending intake, under review, AI flagged, SLA watch, completed |
| Internal Assessor | `assessor_internal` | Assigned claims, assessment queue, completed assessments |
| Insurer Admin | `insurer_admin` | Full platform administration, user management, workflow settings |
| Claimant Portal | `claimant` | Submit claims, track status, view decisions |
| Panel Beater Portal | `panel_beater` | Quote submissions, job tracking, performance |
| External Assessor Portal | `assessor_external` | Assigned assessments (Free: 10/month; Paid: $29/month) |

### 2.2 Portals Gated by Tier

| Portal | Role | Minimum Tier | Notes |
|---|---|---|---|
| **Executive Command Centre** | `executive` | **Protect** | Full command centre at Prove; KPI band only at Protect |
| **Risk Manager** | `risk_manager` | **Protect** | Full analytics at Prove; summary view at Protect |
| **Recovery Officer** | `recovery_officer` | **Protect** | Recovery case management and correspondence |

> **Current gap:** Risk Manager and Recovery portals are built and accessible to all tiers. Tier gating is not enforced at portal entry.

---

## 3. Report Access by Tier

### 3.1 KINGA Claims Assessment Report (Baseline — All Tiers)

Available to every insurer at every tier. This is the operational decision document.

**Sections included:**
1. Executive Decision Summary (Approve / Decline / Investigate)
2. Claim Status & Workflow Timeline
3. Vehicle & Policy Information
4. Damage Assessment — Photo Gallery (tiered: see §3.3)
5. Quote Comparison & Cost Optimisation
6. Final Recommendation (operational — no physics)
7. Approval Chain & Audit Signatures

**Sections NOT in this report (belong to Forensic Report):**
- Physics Consistency Analysis
- Fraud Score Breakdown
- Narrative Consistency Analysis
- Forensic Evidence Chain

> **Current gap:** The `KingaClaimsReport` component currently contains a Physics Consistency section (Section 7). This must be removed or locked as a Forensic Report teaser.

---

### 3.2 KINGA Forensic Audit Report (Depth-Gated by Tier)

Single template. Sections render based on tenant `pricingTier`.

| Section | Process | Protect | Prove |
|---|---|---|---|
| 1. Cover & Executive Summary | Buy-up ($120) | ✓ Summary | ✓ Full |
| 2. Incident Reconstruction | Buy-up | ✓ Summary | ✓ Full |
| 3. Physics-Based Analysis | Buy-up | ✓ Summary | ✓ Full |
| 4. Damage Photo Evidence | Buy-up | ✓ Full gallery | ✓ Full gallery + AI forensics |
| 5. Financial Forensics | Buy-up | ✓ Summary | ✓ Full |
| 6. Fraud Risk Assessment | Buy-up | ✓ Summary | ✓ Full breakdown |
| 7. Governance & Decision Trail | Buy-up | ✓ | ✓ |

**Process tier buy-up:** $120 per report, purchased individually. Unlocks the full Forensic Report for that specific claim.

---

### 3.3 Photo Gallery Depth by Tier

| Feature | Process | Protect | Prove |
|---|---|---|---|
| Damage photos in Claims Report | Top 6 featured + thumbnails | Top 6 featured + thumbnails | Top 6 featured + thumbnails |
| Forensic photo gallery (Forensic Report) | Buy-up only | Full gallery | Full gallery + AI forensic descriptions |
| Per-photo AI forensic description | Buy-up only | — | ✓ (5 bullets per photo) |
| Detection confidence score | Buy-up only | ✓ | ✓ |

---

### 3.4 Reports Centre — Catalogue Access by Tier

| Report | Process | Protect | Prove |
|---|---|---|---|
| KINGA Assessment Report (per claim) | ✓ | ✓ | ✓ |
| Cost Comparison Report | ✓ | ✓ | ✓ |
| Repair vs Replace Decision | ✓ | ✓ | ✓ |
| Claim Decision Audit Trail | ✓ | ✓ | ✓ |
| Forensic Analysis Report | Buy-up ($120) | ✓ Summary | ✓ Full |
| Processing Dwell Time Report | ✓ | ✓ | ✓ |
| Panel Beater Performance Report | — | ✓ | ✓ |
| Fraud Detection Summary | — | ✓ | ✓ |
| Assessor Performance Report | — | ✓ | ✓ |
| Claims Trend Report | — | ✓ | ✓ |
| Financial Exposure Report | — | — | ✓ |
| Portfolio Risk Heatmap | — | ✓ | ✓ |
| ML Model Performance Report | — | — | ✓ (Admin only) |
| Governance / SAR / Compliance Reports | — | ✓ | ✓ |
| Recovery Performance Report | — | ✓ | ✓ |

---

## 4. Feature Access by Tier

### 4.1 Fraud Analytics Dashboard (`/insurer/fraud-analytics`)

| Feature | Process | Protect | Prove |
|---|---|---|---|
| Total claims KPIs | ✓ | ✓ | ✓ |
| High fraud risk count | ✓ | ✓ | ✓ |
| Fraud cost impact | — | ✓ | ✓ |
| Physics-based fraud detection charts | — | ✓ | ✓ |
| Fraud heatmap | — | ✓ | ✓ |
| Fraud trend analytics (12-month) | — | — | ✓ |
| Full fraud score breakdown per claim | — | — | ✓ |

### 4.2 Executive Dashboard

| Feature | Process | Protect | Prove |
|---|---|---|---|
| KPI band (claims volume, cost, SLA) | — | ✓ | ✓ |
| Financial exposure tab | — | — | ✓ |
| Portfolio risk tab | — | ✓ | ✓ |
| Trend analytics | — | — | ✓ |
| Governance & audit trail | — | — | ✓ |

### 4.3 Panel Beater Performance (`/insurer/panel-beater-performance`)

| Feature | Process | Protect | Prove |
|---|---|---|---|
| Panel beater benchmarking | — | ✓ | ✓ |
| Quote accuracy scoring | — | ✓ | ✓ |
| Structural gap rate analysis | — | ✓ | ✓ |

### 4.4 Automation Policies (`/insurer/automation-policies`)

| Feature | Process | Protect | Prove |
|---|---|---|---|
| Auto-approve rules | ✓ | ✓ | ✓ |
| Fraud flag thresholds | — | ✓ | ✓ |
| Advanced routing rules | — | — | ✓ |

### 4.5 Batch Export (`/insurer/batch-export`)

| Feature | Process | Protect | Prove |
|---|---|---|---|
| CSV export | ✓ | ✓ | ✓ |
| Excel export | — | ✓ | ✓ |
| API access | — | — | ✓ |

---

## 5. External Assessor Tier (Separate from Insurer Tiers)

| Feature | Free | Paid ($29/month) |
|---|---|---|
| Claims per month | 10 | Unlimited |
| Basic assessment tools | ✓ | ✓ |
| KINGA AI comparison | — | ✓ |
| Performance analytics | — | ✓ |

> **Current gap:** No claim count limiter or paywall exists for external assessors.

---

## 6. Implementation Gaps (Priority Order)

| # | Gap | Impact | Effort |
|---|---|---|---|
| 1 | Fix Prove tier price: $1,600 → $1,800 | Pricing accuracy | 5 min |
| 2 | Add `tenantPricingTier` to `auth.me` response | Enables all client-side gating | 30 min |
| 3 | Remove Physics section from `KingaClaimsReport` (belongs in Forensic Report) | Report accuracy | 1 hour |
| 4 | Gate Risk Manager & Recovery portals at Protect tier minimum | Tier integrity | 2 hours |
| 5 | Gate Fraud Analytics features by tier (hide charts/heatmap at Process) | Tier integrity | 2 hours |
| 6 | Forensic Report buy-up flow for Process tier ($120/report) | Revenue | 2 days |
| 7 | Reports Centre catalogue filtered by tier | Tier integrity | 3 hours |
| 8 | Executive Dashboard features gated by tier | Tier integrity | 2 hours |
| 9 | External Assessor claim count limiter (10/month free cap) | Revenue | 1 day |

---

## 7. What is Correctly Implemented

- `pricingTier` field exists on `insurerTenants` table (process/protect/prove)
- Admin Tier Management page can assign and change tiers
- `AdminTierManagement` UI shows correct features per tier (except Prove price)
- `ForensicAuditReport` template is the correct deep-dive document
- `KingaClaimsReport` is the correct operational baseline document (minus Physics section)
- `TierUpgradeGate` component exists in `RiskManagerAnalytics.tsx` (pattern to replicate)
- `insurer.getTierInfo` procedure exists to fetch tenant's current tier and feature flags
- Report generators (`kingaReportGenerator.ts`, `reportGenerator.ts`) already gate sections by tier parameter
- All 11 portals exist with correct role assignments
- `sessionStorage`-based active portal role tracking is in place (from today's fix)
