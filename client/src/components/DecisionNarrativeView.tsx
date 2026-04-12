/**
 * DecisionNarrativeView.tsx
 *
 * Phase 5A — Decision Narrative View
 *
 * A single sequential view that renders the full adjudication reasoning flow:
 *   Step 1 — What data was received (IFE completeness)
 *   Step 2 — What was missing and why (DRM attribution)
 *   Step 3 — How confidence was affected (FCDI score)
 *   Step 4 — What options were generated (DOE candidates)
 *   Step 5 — Why the final decision was selected (DTL)
 *   Step 6 — What was rejected and why (disqualifications)
 *
 * Design principle: No assessor should need to interpret raw JSON to trust a decision.
 */

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Info,
  ChevronRight,
  Shield,
  BarChart3,
  FileSearch,
  Gavel,
  AlertCircle,
  Clock,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AttributedGap {
  field: string;
  attribution: "CLAIMANT_DEFICIENCY" | "INSURER_DATA_GAP" | "SYSTEM_EXTRACTION_FAILURE" | "DOCUMENT_LIMITATION";
  reason: string;
  affectsFCDI: boolean;
  attributionConfidence: number;
}

interface IFEResult {
  totalFieldsAssessed: number;
  gapCount: number;
  completenessScore: number;
  attributionBreakdown: {
    CLAIMANT_DEFICIENCY: number;
    INSURER_DATA_GAP: number;
    SYSTEM_EXTRACTION_FAILURE: number;
    DOCUMENT_LIMITATION: number;
  };
  attributedGaps: AttributedGap[];
  doeEligible: boolean;
  doeIneligibilityReason: string | null;
  narrative: string;
}

interface DOEScoreBreakdown {
  panelBeater: string;
  totalScore: number;
  costScore: number;
  qualityScore: number;
  turnaroundScore: number;
  reliabilityScore: number;
  fraudRiskScore: number;
  disqualified: boolean;
  disqualificationReason: string | null;
}

interface DOEDisqualification {
  panelBeater: string;
  reason: string;
  severity: "hard" | "soft";
  auditEntry: string;
}

interface DOEResult {
  status: "OPTIMISED" | "ALL_DISQUALIFIED" | "GATED_LOW_FCDI" | "GATED_LOW_INPUT" | "GATED_NO_QUOTES" | "NOT_RUN";
  selectedPanelBeater: string | null;
  selectedCost: number | null;
  currency: string;
  benchmarkDeviationPct: number | null;
  decisionConfidence: "high" | "medium" | "low" | string;
  fcdiScoreAtExecution: number;
  scoreBreakdown: DOEScoreBreakdown[];
  disqualifications: DOEDisqualification[];
  rationale: string;
}

interface DecisionNarrativeViewProps {
  ifeResult: IFEResult | null;
  doeResult: DOEResult | null;
  fcdiScore: number | null;
  reportVersion?: string | null;
  claimId: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function attributionLabel(cls: string): { label: string; color: string; bg: string } {
  switch (cls) {
    case "CLAIMANT_DEFICIENCY":
      return { label: "Claimant", color: "text-orange-700", bg: "bg-orange-50 border-orange-200" };
    case "INSURER_DATA_GAP":
      return { label: "Insurer", color: "text-blue-700", bg: "bg-blue-50 border-blue-200" };
    case "SYSTEM_EXTRACTION_FAILURE":
      return { label: "System", color: "text-purple-700", bg: "bg-purple-50 border-purple-200" };
    case "DOCUMENT_LIMITATION":
      return { label: "Document", color: "text-gray-700", bg: "bg-gray-50 border-gray-200" };
    default:
      return { label: cls, color: "text-gray-700", bg: "bg-gray-50 border-gray-200" };
  }
}

function doeStatusMeta(status: string): { label: string; icon: React.ReactNode; color: string } {
  switch (status) {
    case "OPTIMISED":
      return { label: "Automated Decision", icon: <CheckCircle className="w-4 h-4" />, color: "text-green-700" };
    case "ALL_DISQUALIFIED":
      return { label: "All Quotes Disqualified", icon: <XCircle className="w-4 h-4" />, color: "text-red-700" };
    case "GATED_LOW_FCDI":
      return { label: "Gated — Low Evidence Quality", icon: <AlertTriangle className="w-4 h-4" />, color: "text-amber-700" };
    case "GATED_LOW_INPUT":
      return { label: "Gated — Incomplete Input Data", icon: <AlertTriangle className="w-4 h-4" />, color: "text-amber-700" };
    case "GATED_NO_QUOTES":
      return { label: "Gated — No Valid Quotes", icon: <AlertCircle className="w-4 h-4" />, color: "text-amber-700" };
    default:
      return { label: "Not Executed", icon: <Clock className="w-4 h-4" />, color: "text-gray-500" };
  }
}

function confidenceBadge(confidence: string) {
  if (confidence === "high") return <Badge className="bg-green-100 text-green-800 border-green-200">High Confidence</Badge>;
  if (confidence === "medium") return <Badge className="bg-amber-100 text-amber-800 border-amber-200">Medium Confidence</Badge>;
  return <Badge className="bg-red-100 text-red-800 border-red-200">Low Confidence</Badge>;
}

function fcdiColor(score: number): string {
  if (score >= 80) return "text-green-700";
  if (score >= 60) return "text-amber-700";
  return "text-red-700";
}

function fcdiBar(score: number): string {
  if (score >= 80) return "bg-green-500";
  if (score >= 60) return "bg-amber-500";
  return "bg-red-500";
}

// ─── Step Components ──────────────────────────────────────────────────────────

function StepHeader({ step, icon, title }: { step: number; icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-800 text-white text-sm font-bold shrink-0">
        {step}
      </div>
      <div className="flex items-center gap-2 text-slate-800">
        {icon}
        <span className="font-semibold text-base">{title}</span>
      </div>
    </div>
  );
}

// Step 1 + 2 combined: Data received + gaps
function DataInputStep({ ifeResult }: { ifeResult: IFEResult | null }) {
  if (!ifeResult) {
    return (
      <div className="text-sm text-slate-500 italic">
        Input fidelity data not available for this assessment.
      </div>
    );
  }

  const { totalFieldsAssessed, gapCount, completenessScore, attributionBreakdown, attributedGaps } = ifeResult;
  const fieldsReceived = totalFieldsAssessed - gapCount;

  return (
    <div className="space-y-4">
      {/* Summary row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-center">
          <div className="text-2xl font-bold text-slate-800">{fieldsReceived}</div>
          <div className="text-xs text-slate-500 mt-1">Fields Received</div>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-center">
          <div className="text-2xl font-bold text-amber-700">{gapCount}</div>
          <div className="text-xs text-amber-600 mt-1">Data Gaps</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-center">
          <div className="text-2xl font-bold text-slate-800">{completenessScore}%</div>
          <div className="text-xs text-slate-500 mt-1">Completeness</div>
        </div>
      </div>

      {/* Attribution breakdown */}
      {gapCount > 0 && (
        <div>
          <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Gap Attribution</div>
          <div className="flex flex-wrap gap-2 mb-3">
            {Object.entries(attributionBreakdown).map(([cls, count]) => {
              if (count === 0) return null;
              const meta = attributionLabel(cls);
              return (
                <div key={cls} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${meta.bg} ${meta.color}`}>
                  <span>{meta.label}</span>
                  <span className="font-bold">{count}</span>
                </div>
              );
            })}
          </div>

          {/* Gap detail table */}
          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200">
                  <th className="text-left px-3 py-2 font-semibold text-slate-600">Field</th>
                  <th className="text-left px-3 py-2 font-semibold text-slate-600">Responsible Party</th>
                  <th className="text-left px-3 py-2 font-semibold text-slate-600">Reason</th>
                  <th className="text-center px-3 py-2 font-semibold text-slate-600">FCDI Impact</th>
                </tr>
              </thead>
              <tbody>
                {attributedGaps.map((gap, i) => {
                  const meta = attributionLabel(gap.attribution);
                  return (
                    <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                      <td className="px-3 py-2 font-mono text-slate-700">{gap.field}</td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded-full border text-xs font-medium ${meta.bg} ${meta.color}`}>
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-600">{gap.reason}</td>
                      <td className="px-3 py-2 text-center">
                        {gap.affectsFCDI
                          ? <span className="text-amber-600 font-medium">Yes</span>
                          : <span className="text-slate-400">No</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Insurer gap warning */}
          {attributionBreakdown.INSURER_DATA_GAP > 0 && (
            <div className="mt-2 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>
                {attributionBreakdown.INSURER_DATA_GAP} gap(s) attributed to the insurer's own data record. These do not reflect claimant deficiency and should not be used to penalise the claim.
              </span>
            </div>
          )}
          {attributionBreakdown.SYSTEM_EXTRACTION_FAILURE > 0 && (
            <div className="mt-2 flex items-start gap-2 rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 text-xs text-purple-700">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>
                {attributionBreakdown.SYSTEM_EXTRACTION_FAILURE} gap(s) attributed to KINGA extraction limitations. The underlying document may contain this data but it could not be reliably extracted.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Step 3: FCDI confidence
function FCDIStep({ fcdiScore, ifeResult }: { fcdiScore: number | null; ifeResult: IFEResult | null }) {
  const score = fcdiScore ?? ifeResult?.completenessScore ?? null;
  if (score === null) {
    return <div className="text-sm text-slate-500 italic">FCDI score not available.</div>;
  }

  const label = score >= 80 ? "High Evidence Quality" : score >= 60 ? "Moderate Evidence Quality" : "Low Evidence Quality";
  const description = score >= 80
    ? "Evidence quality is sufficient for automated adjudication. The DOE can proceed with high confidence."
    : score >= 60
    ? "Evidence quality is acceptable but some gaps remain. DOE results carry moderate confidence."
    : "Evidence quality is below the minimum threshold for automated adjudication. Manual assessor review is required.";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <div className={`text-4xl font-bold ${fcdiColor(score)}`}>{score}</div>
        <div>
          <div className={`font-semibold text-sm ${fcdiColor(score)}`}>{label}</div>
          <div className="text-xs text-slate-500 mt-0.5">Forensic Confidence & Data Integrity Score</div>
        </div>
      </div>
      <div className="w-full bg-slate-200 rounded-full h-2">
        <div
          className={`h-2 rounded-full transition-all ${fcdiBar(score)}`}
          style={{ width: `${Math.min(100, score)}%` }}
        />
      </div>
      <p className="text-sm text-slate-600">{description}</p>
      {ifeResult && !ifeResult.doeEligible && ifeResult.doeIneligibilityReason && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span><strong>DOE Gated:</strong> {ifeResult.doeIneligibilityReason}</span>
        </div>
      )}
    </div>
  );
}

// Step 4 + 5 + 6: DOE candidates, selection, disqualifications
function DOEStep({ doeResult }: { doeResult: DOEResult | null }) {
  if (!doeResult || doeResult.status === "NOT_RUN") {
    return (
      <div className="text-sm text-slate-500 italic">
        Decision Optimisation Engine was not executed for this assessment. Manual assessor review is required.
      </div>
    );
  }

  const statusMeta = doeStatusMeta(doeResult.status);

  return (
    <div className="space-y-4">
      {/* Status banner */}
      <div className={`flex items-center gap-2 font-semibold text-sm ${statusMeta.color}`}>
        {statusMeta.icon}
        <span>{statusMeta.label}</span>
        {doeResult.status === "OPTIMISED" && confidenceBadge(doeResult.decisionConfidence)}
      </div>

      {/* Selected repairer */}
      {doeResult.status === "OPTIMISED" && doeResult.selectedPanelBeater && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3">
          <div className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-1">Selected Repairer</div>
          <div className="font-bold text-green-800 text-base">{doeResult.selectedPanelBeater}</div>
          {doeResult.selectedCost !== null && (
            <div className="text-sm text-green-700 mt-1">
              {doeResult.currency} {doeResult.selectedCost.toLocaleString()}
              {doeResult.benchmarkDeviationPct !== null && (
                <span className={`ml-2 text-xs ${doeResult.benchmarkDeviationPct <= 0 ? "text-green-600" : "text-amber-600"}`}>
                  ({doeResult.benchmarkDeviationPct > 0 ? "+" : ""}{doeResult.benchmarkDeviationPct.toFixed(1)}% vs benchmark)
                </span>
              )}
            </div>
          )}
          <div className="text-xs text-green-600 mt-1">FCDI at execution: {doeResult.fcdiScoreAtExecution}</div>
        </div>
      )}

      {/* Candidate score table */}
      {doeResult.scoreBreakdown && doeResult.scoreBreakdown.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Candidate Scoring</div>
          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200">
                  <th className="text-left px-3 py-2 font-semibold text-slate-600">Panel Beater</th>
                  <th className="text-center px-3 py-2 font-semibold text-slate-600">Total</th>
                  <th className="text-center px-3 py-2 font-semibold text-slate-600">Cost</th>
                  <th className="text-center px-3 py-2 font-semibold text-slate-600">Quality</th>
                  <th className="text-center px-3 py-2 font-semibold text-slate-600">Fraud Risk</th>
                  <th className="text-center px-3 py-2 font-semibold text-slate-600">Status</th>
                </tr>
              </thead>
              <tbody>
                {doeResult.scoreBreakdown.map((row, i) => {
                  const isSelected = row.panelBeater === doeResult.selectedPanelBeater;
                  return (
                    <tr key={i} className={isSelected ? "bg-green-50" : i % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                      <td className="px-3 py-2 font-medium text-slate-800">
                        {isSelected && <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1.5 mb-0.5" />}
                        {row.panelBeater}
                      </td>
                      <td className="px-3 py-2 text-center font-bold text-slate-800">{row.totalScore}</td>
                      <td className="px-3 py-2 text-center text-slate-600">{row.costScore}</td>
                      <td className="px-3 py-2 text-center text-slate-600">{row.qualityScore}</td>
                      <td className="px-3 py-2 text-center text-slate-600">{row.fraudRiskScore}</td>
                      <td className="px-3 py-2 text-center">
                        {row.disqualified
                          ? <span className="text-red-600 font-medium">Disqualified</span>
                          : isSelected
                          ? <span className="text-green-600 font-medium">Selected</span>
                          : <span className="text-slate-400">Not selected</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Disqualifications */}
      {doeResult.disqualifications && doeResult.disqualifications.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Disqualification Audit Trail</div>
          <div className="space-y-2">
            {doeResult.disqualifications.map((d, i) => (
              <div key={i} className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <div>
                  <span className="font-semibold">{d.panelBeater}</span>
                  <span className="mx-1.5 text-red-400">·</span>
                  <span className="font-medium">{d.reason}</span>
                  {d.severity === "hard" && <span className="ml-1.5 text-red-500">(Hard disqualification)</span>}
                  <div className="text-red-600 mt-0.5">{d.auditEntry}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rationale */}
      {doeResult.rationale && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <span className="font-semibold text-slate-700">Decision Rationale: </span>
          {doeResult.rationale}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function DecisionNarrativeView({
  ifeResult,
  doeResult,
  fcdiScore,
  reportVersion,
  claimId,
}: DecisionNarrativeViewProps) {
  const isLegacyReport = reportVersion && parseFloat(reportVersion) < 4.0;

  return (
    <div className="space-y-4">
      {/* Legacy report warning */}
      {isLegacyReport && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <strong>Legacy Report (v{reportVersion})</strong> — This report predates the Data Responsibility Matrix and Decision Transparency Layer. Confidence attribution may be incomplete. This report is provided for reference only and should not be used as the basis for a final adjudication decision.
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-900">Decision Narrative</h3>
          <p className="text-xs text-slate-500 mt-0.5">Claim #{claimId} · Full adjudication reasoning flow</p>
        </div>
        {doeResult && doeResult.status !== "NOT_RUN" && (
          <div className={`flex items-center gap-1.5 text-sm font-semibold ${doeStatusMeta(doeResult.status).color}`}>
            {doeStatusMeta(doeResult.status).icon}
            {doeStatusMeta(doeResult.status).label}
          </div>
        )}
      </div>

      <Separator />

      {/* Step 1 + 2: Data received + gaps */}
      <Card className="border-slate-200">
        <CardHeader className="pb-2 pt-4 px-4">
          <StepHeader step={1} icon={<FileSearch className="w-4 h-4" />} title="Data Received & Attribution" />
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <DataInputStep ifeResult={ifeResult} />
        </CardContent>
      </Card>

      {/* Connector */}
      <div className="flex justify-center">
        <ChevronRight className="w-5 h-5 text-slate-300 rotate-90" />
      </div>

      {/* Step 3: FCDI */}
      <Card className="border-slate-200">
        <CardHeader className="pb-2 pt-4 px-4">
          <StepHeader step={2} icon={<BarChart3 className="w-4 h-4" />} title="Evidence Quality (FCDI)" />
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <FCDIStep fcdiScore={fcdiScore} ifeResult={ifeResult} />
        </CardContent>
      </Card>

      {/* Connector */}
      <div className="flex justify-center">
        <ChevronRight className="w-5 h-5 text-slate-300 rotate-90" />
      </div>

      {/* Step 4 + 5 + 6: DOE */}
      <Card className="border-slate-200">
        <CardHeader className="pb-2 pt-4 px-4">
          <StepHeader step={3} icon={<Gavel className="w-4 h-4" />} title="Decision Optimisation & Selection" />
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <DOEStep doeResult={doeResult} />
        </CardContent>
      </Card>

      {/* Manual review notice for gated claims */}
      {doeResult && doeResult.status !== "OPTIMISED" && doeResult.status !== "NOT_RUN" && (
        <div className="flex items-start gap-3 rounded-lg border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <Shield className="w-4 h-4 mt-0.5 shrink-0 text-slate-500" />
          <div>
            <strong>Manual Assessor Review Required</strong> — This claim did not meet the automated adjudication threshold. An assessor must review the evidence, resolve the flagged gaps, and record a final decision. The DOE reasoning above is provided as a starting point.
          </div>
        </div>
      )}
    </div>
  );
}

export default DecisionNarrativeView;
