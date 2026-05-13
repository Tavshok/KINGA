/**
 * KINGA Demo Data — Presentation-Ready Fixtures
 *
 * These constants are used when the database has no real claims yet.
 * They are injected transparently into dashboard components so every
 * chart, KPI card, and table looks fully populated during a demo.
 *
 * All figures are internally consistent and reflect a realistic
 * mid-size South African motor insurer processing ~47 claims/month.
 */

// ─── Hero KPIs ────────────────────────────────────────────────────────────────
export const DEMO_EXEC_SUMMARY = {
  totalClaims: 47,
  completedClaims: 38,
  totalSavings: 21_480_00,          // stored as cents → R214 800
  resolutionRate: 89,
  avgCycleDays: 4.2,
  savingsTrend: [
    { month: "2025-11", savings: 28_500 },
    { month: "2025-12", savings: 34_200 },
    { month: "2026-01", savings: 41_800 },
    { month: "2026-02", savings: 38_600 },
    { month: "2026-03", savings: 52_300 },
    { month: "2026-04", savings: 19_400 },   // partial month
  ],
};

// ─── KPI Summary Metrics ──────────────────────────────────────────────────────
export const DEMO_KPI_SUMMARY = {
  totalClaims: 47,
  completedClaims: 38,
  activeClaims: 9,
  fraudDetected: 12,
  avgProcessingTime: 4.2,
  totalSavings: 214_800,
  highValueClaims: 6,
  completionRate: 89,
  // Governance (30-day)
  totalExecutiveOverrides: 3,
  segregationViolationAttempts: 0,
  roleChangesLast30Days: 2,
  overrideRatePercentage: 6.4,
  // Secondary strip
  fraudRiskAmount: 1_850,          // × 100 = R185 000 exposure
  highRiskClaimsCount: 5,
  fastTrackPercentage: 74,
  executiveOverrides: 3,
  autoApprovals: 47,
  // Confidence gauge
  avgConfidenceScore: 28,
  lowRiskCount: 29,
  mediumRiskCount: 13,
  highRiskCount: 5,
  // Physics anomaly
  avgDeviationScore: 14.3,
  highRiskPhysicsClaims: 4,
  physicsAnomalyRate: 8.5,
  totalPhysicsAssessments: 47,
};

// ─── Financial Overview ───────────────────────────────────────────────────────
export const DEMO_FINANCIALS = {
  totalPayouts: 1_243_600,
  totalReserves: 387_200,
  fraudPrevented: 214_800,
  netExposure: 1_630_800,
};

// ─── Governance Snapshot ──────────────────────────────────────────────────────
export const DEMO_GOVERNANCE = {
  overrideRate: { value: 6.4, trend: "stable" },
  segregationViolations: { value: 0, trend: "stable" },
  roleChanges: { value: 2, trend: "stable" },
  complianceScore: 97,
};

// ─── Assessor Performance ─────────────────────────────────────────────────────
export const DEMO_ASSESSORS = [
  { id: 1, name: "Thabo Nkosi",      claimsProcessed: 14, avgTime: "3.8d", accuracy: 96 },
  { id: 2, name: "Priya Govender",   claimsProcessed: 11, avgTime: "4.1d", accuracy: 94 },
  { id: 3, name: "Jacques du Plessis", claimsProcessed: 9, avgTime: "4.6d", accuracy: 91 },
  { id: 4, name: "Nomsa Dlamini",    claimsProcessed: 8,  avgTime: "5.0d", accuracy: 88 },
  { id: 5, name: "Ryan Botha",       claimsProcessed: 5,  avgTime: "5.3d", accuracy: 85 },
];

// ─── Panel Beater Performance ─────────────────────────────────────────────────
export const DEMO_PANEL_BEATERS = [
  { id: 1, name: "AutoFix Pro — Sandton",        quotesSubmitted: 18, avgAccuracy: 94 },
  { id: 2, name: "Premium Body Shop — Rosebank",  quotesSubmitted: 14, avgAccuracy: 91 },
  { id: 3, name: "Quick Repair Centre — Midrand", quotesSubmitted: 11, avgAccuracy: 88 },
  { id: 4, name: "Elite Auto Restoration — CBD",  quotesSubmitted: 9,  avgAccuracy: 86 },
  { id: 5, name: "Speedfix Panel Beaters — Soweto", quotesSubmitted: 7, avgAccuracy: 82 },
];

// ─── Workflow Bottlenecks ─────────────────────────────────────────────────────
export const DEMO_BOTTLENECKS = [
  { state: "INTAKE QUEUE",          avgDaysInState: 0.3, count: 3 },
  { state: "UNDER ASSESSMENT",      avgDaysInState: 1.8, count: 9 },
  { state: "TECHNICAL APPROVAL",    avgDaysInState: 0.9, count: 4 },
  { state: "FINANCIAL DECISION",    avgDaysInState: 0.6, count: 2 },
  { state: "PAYMENT AUTHORISED",    avgDaysInState: 0.4, count: 1 },
];

// ─── Claims Volume Trend (30 days, daily) ─────────────────────────────────────
export const DEMO_CLAIMS_VOLUME = (() => {
  const base = [
    2, 1, 3, 2, 4, 3, 2, 1, 2, 3,
    4, 2, 3, 1, 2, 4, 3, 2, 3, 2,
    1, 3, 2, 4, 3, 2, 1, 2, 3, 2,
  ];
  const today = new Date();
  return base.map((count, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (29 - i));
    return { date: d.toISOString().slice(0, 10), count, fraudDetected: Math.round(count * 0.25) };
  });
})();

// ─── Fraud Detection Trends ───────────────────────────────────────────────────
export const DEMO_FRAUD_TRENDS = (() => {
  const weeks = ["W1 Nov", "W2 Nov", "W3 Nov", "W4 Nov", "W1 Dec", "W2 Dec", "W3 Dec", "W4 Dec"];
  const highs  = [1, 2, 1, 3, 2, 1, 2, 0];
  const meds   = [3, 4, 3, 5, 4, 3, 4, 2];
  const lows   = [8, 7, 9, 6, 8, 9, 7, 6];
  return weeks.map((week, i) => ({ week, high: highs[i], medium: meds[i], low: lows[i] }));
})();

// ─── Cost Breakdown by Status ─────────────────────────────────────────────────
export const DEMO_COST_BREAKDOWN = [
  { status: "COMPLETED",           count: 38, avg_amount: 32_700, total_amount: 1_242_600 },
  { status: "ASSESSMENT PENDING",  count: 5,  avg_amount: 28_400, total_amount: 142_000  },
  { status: "UNDER ASSESSMENT",    count: 4,  avg_amount: 41_200, total_amount: 164_800  },
];

// ─── Processing Time by Stage ─────────────────────────────────────────────────
export const DEMO_PROCESSING_TIME = {
  avg_days: 4.2,
};

// ─── Fraud Risk Distribution ──────────────────────────────────────────────────
export const DEMO_FRAUD_DIST = [
  { level: "low",    count: 29 },
  { level: "medium", count: 13 },
  { level: "high",   count: 5  },
];

// ─── Override Rate ────────────────────────────────────────────────────────────
export const DEMO_OVERRIDE_RATE = {
  override_percentage: 6.4,
  total_optimisations: 47,
  total_overrides: 3,
};

// ─── Most Overridden Repairers ────────────────────────────────────────────────
export const DEMO_OVERRIDDEN_REPAIRERS = [
  { company_name: "Quick Repair Centre",  total_overrides: 2, total_recommended: 11, override_rate: 18.2 },
  { company_name: "Speedfix Panel Beaters", total_overrides: 1, total_recommended: 7, override_rate: 14.3 },
];

// ─── AI Savings ───────────────────────────────────────────────────────────────
export const DEMO_AI_SAVINGS = {
  total_ai_savings_rands: 214_800,
  accepted_count: 44,
  avg_saving_per_claim_rands: 4_882,
};

// ─── Cost Delta on Override ───────────────────────────────────────────────────
export const DEMO_COST_DELTA = {
  avg_cost_delta_rands: -3_200,
  override_count: 3,
};

// ─── Claims Manager: Intake Queue ────────────────────────────────────────────
export const DEMO_INTAKE_CLAIMS = [
  { id: 10041, claimNumber: "CLM-2026-0041", vehicleMake: "Toyota", vehicleModel: "Corolla", vehicleYear: 2022, vehicleRegistration: "GP 14 RX 23", incidentDate: "2026-05-10", incidentType: "collision", status: "submitted", fraudRiskLevel: "low",  estimatedClaimValue: "28500", createdAt: "2026-05-10T08:12:00Z" },
  { id: 10042, claimNumber: "CLM-2026-0042", vehicleMake: "VW",     vehicleModel: "Polo",    vehicleYear: 2021, vehicleRegistration: "WC 87 TK 44", incidentDate: "2026-05-11", incidentType: "collision", status: "submitted", fraudRiskLevel: "medium", estimatedClaimValue: "41200", createdAt: "2026-05-11T09:33:00Z" },
  { id: 10043, claimNumber: "CLM-2026-0043", vehicleMake: "Ford",   vehicleModel: "Ranger",  vehicleYear: 2023, vehicleRegistration: "GP 32 NM 91", incidentDate: "2026-05-12", incidentType: "hail",      status: "submitted", fraudRiskLevel: "low",  estimatedClaimValue: "67800", createdAt: "2026-05-12T11:05:00Z" },
  { id: 10044, claimNumber: "CLM-2026-0044", vehicleMake: "BMW",    vehicleModel: "3 Series", vehicleYear: 2020, vehicleRegistration: "GP 55 ZA 17", incidentDate: "2026-05-12", incidentType: "theft",     status: "submitted", fraudRiskLevel: "high",  estimatedClaimValue: "185000", createdAt: "2026-05-12T14:22:00Z" },
  { id: 10045, claimNumber: "CLM-2026-0045", vehicleMake: "Hyundai", vehicleModel: "Tucson", vehicleYear: 2022, vehicleRegistration: "KZN 44 PL 08", incidentDate: "2026-05-13", incidentType: "collision", status: "triage",    fraudRiskLevel: "low",  estimatedClaimValue: "34600", createdAt: "2026-05-13T07:48:00Z" },
];

// ─── Claims Manager: Review Queue ─────────────────────────────────────────────
export const DEMO_REVIEW_CLAIMS = [
  { id: 10031, claimNumber: "CLM-2026-0031", vehicleMake: "Nissan", vehicleModel: "X-Trail", vehicleYear: 2021, vehicleRegistration: "GP 09 BK 55", incidentDate: "2026-05-05", incidentType: "collision", status: "assessment_complete", fraudRiskLevel: "low",  estimatedClaimValue: "52400", finalApprovedAmount: "49800", createdAt: "2026-05-05T10:00:00Z", aiConfidenceScore: 92 },
  { id: 10032, claimNumber: "CLM-2026-0032", vehicleMake: "Mercedes", vehicleModel: "C-Class", vehicleYear: 2019, vehicleRegistration: "GP 71 LM 33", incidentDate: "2026-05-06", incidentType: "collision", status: "assessment_complete", fraudRiskLevel: "medium", estimatedClaimValue: "124000", finalApprovedAmount: null, createdAt: "2026-05-06T13:15:00Z", aiConfidenceScore: 78 },
  { id: 10033, claimNumber: "CLM-2026-0033", vehicleMake: "Kia",   vehicleModel: "Sportage", vehicleYear: 2023, vehicleRegistration: "WC 22 QR 88", incidentDate: "2026-05-07", incidentType: "hail",      status: "assessment_complete", fraudRiskLevel: "low",  estimatedClaimValue: "38900", finalApprovedAmount: "37200", createdAt: "2026-05-07T09:30:00Z", aiConfidenceScore: 95 },
];

// ─── Claims Manager: Active Claims ────────────────────────────────────────────
export const DEMO_ACTIVE_CLAIMS = [
  { id: 10021, claimNumber: "CLM-2026-0021", vehicleMake: "Toyota", vehicleModel: "Hilux", vehicleYear: 2022, vehicleRegistration: "GP 88 XZ 12", incidentDate: "2026-05-01", incidentType: "collision", status: "assessment_in_progress", fraudRiskLevel: "low",  estimatedClaimValue: "78300", createdAt: "2026-05-01T08:00:00Z" },
  { id: 10022, claimNumber: "CLM-2026-0022", vehicleMake: "Renault", vehicleModel: "Duster", vehicleYear: 2020, vehicleRegistration: "KZN 11 VB 67", incidentDate: "2026-05-02", incidentType: "flood",     status: "quotes_pending",        fraudRiskLevel: "low",  estimatedClaimValue: "44100", createdAt: "2026-05-02T11:20:00Z" },
  { id: 10023, claimNumber: "CLM-2026-0023", vehicleMake: "Audi",   vehicleModel: "A4",     vehicleYear: 2021, vehicleRegistration: "GP 63 WP 45", incidentDate: "2026-05-03", incidentType: "collision", status: "comparison",             fraudRiskLevel: "medium", estimatedClaimValue: "96500", createdAt: "2026-05-03T14:00:00Z" },
  { id: 10024, claimNumber: "CLM-2026-0024", vehicleMake: "Honda",  vehicleModel: "CR-V",   vehicleYear: 2022, vehicleRegistration: "EC 34 PQ 90", incidentDate: "2026-05-04", incidentType: "vandalism", status: "repair_assigned",        fraudRiskLevel: "low",  estimatedClaimValue: "31200", createdAt: "2026-05-04T09:45:00Z" },
];

// ─── Claims Manager: Fraud Alerts ─────────────────────────────────────────────
export const DEMO_FRAUD_ALERTS = [
  { id: 10011, claimNumber: "CLM-2026-0011", vehicleMake: "BMW",    vehicleModel: "5 Series", vehicleYear: 2019, vehicleRegistration: "GP 44 ZZ 01", incidentDate: "2026-04-28", incidentType: "theft",     status: "triage",    fraudRiskLevel: "high",  estimatedClaimValue: "320000", fraudFlags: '["Prior claim within 90 days","Reported at night with no witnesses","VIN mismatch"]', createdAt: "2026-04-28T22:00:00Z" },
  { id: 10012, claimNumber: "CLM-2026-0012", vehicleMake: "Toyota", vehicleModel: "Land Cruiser", vehicleYear: 2020, vehicleRegistration: "GP 77 AB 55", incidentDate: "2026-04-29", incidentType: "hijacking", status: "triage", fraudRiskLevel: "high",  estimatedClaimValue: "480000", fraudFlags: '["Third claim in 12 months","Inconsistent damage pattern","Related party involvement"]', createdAt: "2026-04-29T03:15:00Z" },
  { id: 10013, claimNumber: "CLM-2026-0013", vehicleMake: "VW",     vehicleModel: "Tiguan",   vehicleYear: 2021, vehicleRegistration: "WC 55 KL 22", incidentDate: "2026-04-30", incidentType: "collision", status: "triage",    fraudRiskLevel: "medium", estimatedClaimValue: "68400", fraudFlags: '["Damage inconsistent with reported speed","Panel beater linked to prior fraud"]', createdAt: "2026-04-30T16:40:00Z" },
  { id: 10014, claimNumber: "CLM-2026-0014", vehicleMake: "Mercedes", vehicleModel: "GLE",   vehicleYear: 2022, vehicleRegistration: "GP 12 QQ 88", incidentDate: "2026-05-01", incidentType: "fire",      status: "triage",    fraudRiskLevel: "high",  estimatedClaimValue: "540000", fraudFlags: '["Fire origin inconsistent with accident","Policy taken out 14 days prior"]', createdAt: "2026-05-01T01:30:00Z" },
];

// ─── Claims Manager: Processed Claims ─────────────────────────────────────────
export const DEMO_PROCESSED_CLAIMS = [
  { id: 10001, claimNumber: "CLM-2026-0001", vehicleMake: "Toyota", vehicleModel: "Corolla",  vehicleYear: 2021, vehicleRegistration: "GP 21 AA 11", incidentDate: "2026-04-15", status: "completed", fraudRiskLevel: "low",  estimatedClaimValue: "29800", finalApprovedAmount: "27500", createdAt: "2026-04-15T08:00:00Z", closedAt: "2026-04-19T15:30:00Z" },
  { id: 10002, claimNumber: "CLM-2026-0002", vehicleMake: "VW",     vehicleModel: "Golf",     vehicleYear: 2020, vehicleRegistration: "WC 33 BB 22", incidentDate: "2026-04-16", status: "completed", fraudRiskLevel: "low",  estimatedClaimValue: "18400", finalApprovedAmount: "17200", createdAt: "2026-04-16T09:00:00Z", closedAt: "2026-04-20T11:00:00Z" },
  { id: 10003, claimNumber: "CLM-2026-0003", vehicleMake: "Ford",   vehicleModel: "EcoSport", vehicleYear: 2022, vehicleRegistration: "KZN 55 CC 33", incidentDate: "2026-04-17", status: "completed", fraudRiskLevel: "low",  estimatedClaimValue: "22100", finalApprovedAmount: "21400", createdAt: "2026-04-17T10:00:00Z", closedAt: "2026-04-21T14:00:00Z" },
  { id: 10004, claimNumber: "CLM-2026-0004", vehicleMake: "Kia",    vehicleModel: "Picanto",  vehicleYear: 2023, vehicleRegistration: "GP 66 DD 44", incidentDate: "2026-04-18", status: "rejected",  fraudRiskLevel: "high", estimatedClaimValue: "85000", finalApprovedAmount: null,    createdAt: "2026-04-18T11:00:00Z", closedAt: "2026-04-22T09:00:00Z" },
  { id: 10005, claimNumber: "CLM-2026-0005", vehicleMake: "Hyundai", vehicleModel: "i20",    vehicleYear: 2021, vehicleRegistration: "EC 77 EE 55", incidentDate: "2026-04-19", status: "completed", fraudRiskLevel: "low",  estimatedClaimValue: "14600", finalApprovedAmount: "13900", createdAt: "2026-04-19T12:00:00Z", closedAt: "2026-04-23T16:00:00Z" },
  { id: 10006, claimNumber: "CLM-2026-0006", vehicleMake: "Nissan", vehicleModel: "Micra",   vehicleYear: 2020, vehicleRegistration: "GP 88 FF 66", incidentDate: "2026-04-20", status: "completed", fraudRiskLevel: "low",  estimatedClaimValue: "11200", finalApprovedAmount: "10800", createdAt: "2026-04-20T13:00:00Z", closedAt: "2026-04-24T10:00:00Z" },
];

// ─── Dashboard Stats (for ClaimsManagerDashboard summary cards) ───────────────
export const DEMO_DASHBOARD_STATS = {
  totalClaims: 47,
  pendingReview: 3,
  activeClaims: 9,
  completedThisMonth: 38,
  fraudAlerts: 4,
  avgProcessingDays: 4.2,
  totalSavingsIdentified: 214_800,
  fastTrackEligible: 35,
};

// ─── Assessor Dashboard: Assigned Claims ──────────────────────────────────────
export const DEMO_ASSESSOR_CLAIMS = [
  { id: 10021, claimNumber: "CLM-2026-0021", vehicleMake: "Toyota", vehicleModel: "Hilux",    vehicleYear: 2022, vehicleRegistration: "GP 88 XZ 12", incidentDate: "2026-05-01", incidentType: "collision", status: "assessment_in_progress", estimatedClaimValue: "78300", createdAt: "2026-05-01T08:00:00Z" },
  { id: 10023, claimNumber: "CLM-2026-0023", vehicleMake: "Audi",   vehicleModel: "A4",       vehicleYear: 2021, vehicleRegistration: "GP 63 WP 45", incidentDate: "2026-05-03", incidentType: "collision", status: "assessment_pending",     estimatedClaimValue: "96500", createdAt: "2026-05-03T14:00:00Z" },
  { id: 10031, claimNumber: "CLM-2026-0031", vehicleMake: "Nissan", vehicleModel: "X-Trail",  vehicleYear: 2021, vehicleRegistration: "GP 09 BK 55", incidentDate: "2026-05-05", incidentType: "collision", status: "assessment_complete",    estimatedClaimValue: "52400", createdAt: "2026-05-05T10:00:00Z" },
];

// ─── Month vs Prior Month Comparison Strip ───────────────────────────────────
// Current month = May 2026 (partial), Prior month = April 2026 (full)
export const DEMO_MONTH_COMPARISON = [
  {
    label: "Total Claims",
    current: 47,
    prior: 41,
    unit: "",
    higherIsBetter: true,
  },
  {
    label: "KINGA Savings",
    current: 214_800,
    prior: 178_400,
    unit: "R",
    higherIsBetter: true,
    isCurrency: true,
  },
  {
    label: "Resolution Rate",
    current: 89,
    prior: 83,
    unit: "%",
    higherIsBetter: true,
  },
  {
    label: "Avg Cycle Time",
    current: 4.2,
    prior: 5.1,
    unit: "d",
    higherIsBetter: false,   // lower is better
  },
  {
    label: "Fraud Flags",
    current: 12,
    prior: 9,
    unit: "",
    higherIsBetter: false,   // more fraud flags = worse
  },
  {
    label: "Fast-Track Rate",
    current: 74,
    prior: 68,
    unit: "%",
    higherIsBetter: true,
  },
];

// ─── Utility: check if data is "empty" (all zeros / empty arrays) ─────────────
export function isEmptyData(data: any): boolean {
  if (!data) return true;
  if (Array.isArray(data)) return data.length === 0;
  if (typeof data === "object") {
    const vals = Object.values(data);
    return vals.every(v => v === 0 || v === null || v === undefined || (Array.isArray(v) && v.length === 0));
  }
  return false;
}
