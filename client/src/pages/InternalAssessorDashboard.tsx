/**
 * InternalAssessorDashboard
 *
 * Full-featured dashboard for insurer-side internal assessors (role: assessor_internal).
 * Tabs:
 *  1. Queue          — claims in assessment_pending / under_assessment workflowState
 *  2. My Claims      — all claims assigned to this assessor (trpc.claims.myAssignments)
 *  3. Appointments   — scheduled inspections (trpc.appointments.myAppointments)
 *  4. Completed      — evaluations already submitted (trpc.assessorEvaluations.byClaim per claim)
 *  5. Analytics      — performance metrics (trpc.assessors.getPerformanceDashboard)
 */
import { useState, useMemo, useEffect } from "react";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Title, Tooltip, Legend);
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  ClipboardList, AlertTriangle, CheckCircle2, FileSearch, Brain,
  Calendar, BarChart3, Clock, Search, Eye, ArrowRight,
  TrendingUp, Shield, DollarSign, Target, CheckCheck,
  MapPin, User, Phone, Car, AlertCircle, Loader2,
  ChevronDown, ChevronUp, Zap, Activity, TrendingDown,
} from "lucide-react";
import { RiskBadge, AiAssessButton } from "@/components/ClaimRiskIndicators";
import { Link, useSearch } from "wouter";
import { currencySymbol, fmtCurrency } from "@/lib/currency";
import { NotificationsInbox, NotificationsTabBadge } from "@/components/NotificationsInbox";
import ReportsBadgeWidget from "@/components/ReportsBadgeWidget";
import { PortalHeroBand, ProtoAlertBar, ProtoTabBar } from "@/components/PortalHeroBand";
import { Download } from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────

const WORKFLOW_LABELS: Record<string, string> = {
  created: "Created",
  intake_queue: "Intake Queue",
  intake_verified: "Intake Verified",
  assigned: "Assigned",
  under_assessment: "Under Assessment",
  internal_review: "Internal Review",
  technical_approval: "Technical Approval",
  financial_decision: "Financial Decision",
  payment_authorized: "Payment Authorised",
  closed: "Closed",
  disputed: "Disputed",
  ai_assessment_pending: "KINGA Assessment Pending",
  ai_assessment_completed: "KINGA Assessment Complete",
  manual_review: "Manual Review",
};

const STATUS_LABELS: Record<string, string> = {
  submitted: "Submitted",
  triage: "Triage",
  assessment_pending: "Assessment Pending",
  assessment_in_progress: "In Progress",
  quotes_pending: "Quotes Pending",
  comparison: "Comparison",
  repair_assigned: "Repair Assigned",
  repair_in_progress: "Repair In Progress",
  completed: "Completed",
  rejected: "Rejected",
  closed: "Closed",
};

function wfLabel(s: string | null | undefined) {
  if (!s) return "—";
  return WORKFLOW_LABELS[s] ?? STATUS_LABELS[s] ?? s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function fmtDateTime(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function claimAmount(claim: any): string {
  const sym = currencySymbol(claim.currencyCode);
  const val = claim.approvedAmount ?? claim.estimatedCost ?? claim.estimatedClaimValue;
  if (!val) return "—";
  return `${sym} ${Number(val).toLocaleString()}`;
}

function riskColor(level: string | null | undefined) {
  if (!level) return "text-muted-foreground";
  if (level === "high" || level === "critical") return "text-red-600 dark:text-red-400";
  if (level === "medium" || level === "elevated") return "text-amber-600 dark:text-amber-400";
  return "text-green-600 dark:text-green-400";
}

// ── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon: Icon, accent }: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; accent?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground uppercase tracking-wide truncate">{label}</p>
            <p className={`text-2xl font-bold mt-0.5 ${accent ?? "text-foreground"}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5 truncate">{sub}</p>}
          </div>
          <div className="p-2 rounded-lg bg-muted shrink-0">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Claim Row ─────────────────────────────────────────────────────────────────

function ClaimRow({ claim, actions, showWorkflow = true }: {
  claim: any; actions?: React.ReactNode; showWorkflow?: boolean;
}) {
  return (
    <div className="p-4 rounded-lg border border-border bg-card hover:border-foreground/20 transition-colors">
      <div className="flex flex-col sm:flex-row sm:items-start gap-3">
        {/* Left: claim info */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="font-semibold text-foreground">{claim.claimNumber}</span>
            {showWorkflow && (
              <Badge variant="outline" className="text-xs">
                {wfLabel(claim.workflowState ?? claim.status)}
              </Badge>
            )}
            <RiskBadge fraudRiskScore={claim.fraudRiskScore} fraudFlags={claim.fraudFlags} size="sm" />
          <div className="flex justify-end mb-3"><ReportsBadgeWidget compact /></div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-0.5 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Car className="h-3 w-3 shrink-0" />
              {[claim.vehicleRegistration, claim.vehicleMake, claim.vehicleModel].filter(Boolean).join(" · ") || "—"}
            </span>
            <span className="flex items-center gap-1">
              <User className="h-3 w-3 shrink-0" />
              {claim.claimantName ?? claim.claimantEmail ?? "—"}
            </span>
            <span className="flex items-center gap-1">
              <DollarSign className="h-3 w-3 shrink-0" />
              {claimAmount(claim)}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3 shrink-0" />
              {fmtDate(claim.createdAt)}
            </span>
          </div>
          {claim.incidentDescription && (
            <p className="text-xs text-muted-foreground mt-1.5 line-clamp-1">
              <strong className="text-foreground">Incident:</strong> {claim.incidentDescription}
            </p>
          )}
        </div>
        {/* Right: actions */}
        {actions && (
          <div className="flex flex-row sm:flex-col gap-1.5 shrink-0 flex-wrap sm:flex-nowrap">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}


// ── KINGA Context Panel ──────────────────────────────────────────────────────────
/**
 * Expandable KINGA context panel for a claim row.
 * Fetches aiAssessments.byClaim lazily (only when expanded).
 * Shows: fraud score breakdown, cost intelligence, damage summary, panel beater quotes.
 */
function AiContextPanel({ claimId }: { claimId: number }) {
  const { data: ai, isLoading } = trpc.aiAssessments.byClaim.useQuery({ claimId });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-3 px-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading KINGA intelligence…
      </div>
    );
  }

  if (!ai) {
    return (
      <div className="py-3 px-4 text-sm text-muted-foreground italic">
        No KINGA assessment available for this claim yet. Run the KINGA pipeline to generate intelligence.
      </div>
    );
  }

  // Parse nested JSON fields safely
  let costIntel: any = null;
  let fraudBreakdown: any = null;
  let damageItems: any[] = [];
  try { costIntel = ai.costIntelligenceJson ? (typeof ai.costIntelligenceJson === 'string' ? JSON.parse(ai.costIntelligenceJson) : ai.costIntelligenceJson) : null; } catch { /* ignore */ }
  try { fraudBreakdown = ai.fraudScoreBreakdownJson ? (typeof ai.fraudScoreBreakdownJson === 'string' ? JSON.parse(ai.fraudScoreBreakdownJson) : ai.fraudScoreBreakdownJson) : null; } catch { /* ignore */ }
  try {
    const raw = (ai as any).damageLineItemsJson ?? (ai as any).costLineItemsJson;
    const parsed = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null;
    damageItems = Array.isArray(parsed) ? parsed.slice(0, 6) : (parsed?.items ?? parsed?.lineItems ?? []).slice(0, 6);
  } catch { /* ignore */ }

  const fraudScore = ai.fraudScore ?? (ai as any).overallFraudScore ?? null;
  const fraudLevel = fraudScore == null ? null : fraudScore >= 70 ? 'high' : fraudScore >= 40 ? 'medium' : 'low';
  const fraudColor = fraudLevel === 'high' ? 'text-red-600' : fraudLevel === 'medium' ? 'text-amber-600' : 'text-emerald-600';
  const totalEstimate = costIntel?.totalEstimatedCost ?? (ai as any).estimatedPartsCost ?? (ai as any).estimatedRepairCost ?? null;

  return (
    <div className="mt-3 pt-3 border-t border-border grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
      {/* Column 1: Fraud Intelligence */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
          <Shield className="h-3.5 w-3.5" /> Fraud Intelligence
        </p>
        {fraudScore != null ? (
          <>
            <div className="flex items-center gap-2">
              <span className={`text-2xl font-bold ${fraudColor}`}>{fraudScore}</span>
              <span className="text-xs text-muted-foreground">/ 100</span>
              <Badge variant={fraudLevel === 'high' ? 'destructive' : fraudLevel === 'medium' ? 'secondary' : 'outline'} className="text-xs capitalize">
                {fraudLevel}
              </Badge>
            </div>
            {fraudBreakdown?.factors && Array.isArray(fraudBreakdown.factors) && (
              <ul className="space-y-1">
                {fraudBreakdown.factors.slice(0, 4).map((f: any, i: number) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5 text-amber-500" />
                    <span>{f.description ?? f.factor ?? String(f)}</span>
                  </li>
                ))}
              </ul>
            )}
            {(ai as any).fraudFlags && (
              <p className="text-xs text-muted-foreground line-clamp-2">
                {typeof (ai as any).fraudFlags === 'string' ? (ai as any).fraudFlags : JSON.stringify((ai as any).fraudFlags)}
              </p>
            )}
          </>
        ) : (
          <p className="text-xs text-muted-foreground italic">Fraud score not yet computed</p>
        )}
      </div>

      {/* Column 2: Cost Intelligence */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
          <DollarSign className="h-3.5 w-3.5" /> Cost Intelligence
        </p>
        {totalEstimate != null ? (
          <>
            <div>
              <p className="text-2xl font-bold text-foreground">
                {typeof totalEstimate === 'number' ? `${(totalEstimate / 100).toLocaleString()}` : totalEstimate}
              </p>
              <p className="text-xs text-muted-foreground">KINGA estimated repair cost</p>
            </div>
            {damageItems.length > 0 && (
              <div className="space-y-1">
                {damageItems.map((item: any, i: number) => (
                  <div key={i} className="flex justify-between text-xs">
                    <span className="text-muted-foreground truncate max-w-[120px]">{item.description ?? item.part ?? item.item ?? `Item ${i+1}`}</span>
                    <span className="font-medium text-foreground shrink-0 ml-2">
                      {item.cost != null ? `${Number(item.cost).toLocaleString()}` : item.amount != null ? `${Number(item.amount).toLocaleString()}` : '—'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="text-xs text-muted-foreground italic">Cost estimate not available</p>
        )}
      </div>

      {/* Column 3: KINGA Verdict & Recommendation */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
          <Brain className="h-3.5 w-3.5" /> KINGA Verdict
        </p>
        {(ai.recommendation ?? (ai as any).recommendedAction) ? (
          <div className="p-2 rounded-md bg-muted/40 border border-border">
            <p className="text-xs font-semibold text-foreground capitalize mb-1">{(ai.recommendation ?? (ai as any).recommendedAction)?.replace(/_/g, ' ')}</p>
            {(ai as any).verdictRationale && (
              <p className="text-xs text-muted-foreground line-clamp-3">{(ai as any).verdictRationale}</p>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">Verdict pending pipeline completion</p>
        )}
        {(ai as any).consistencyFlag?.score != null && (
          <div className="flex items-center gap-2 mt-1">
            <Activity className="h-3.5 w-3.5 text-blue-500" />
            <span className="text-xs text-muted-foreground">Consistency: </span>
            <span className={`text-xs font-semibold ${
              (ai as any).consistencyFlag.score >= 70 ? 'text-emerald-600'
              : (ai as any).consistencyFlag.score >= 40 ? 'text-amber-600'
              : 'text-red-600'
            }`}>
              {(ai as any).consistencyFlag.score}%
            </span>
          </div>
        )}
        {(ai as any)._physics && (
          <div className="flex items-center gap-2">
            <Zap className="h-3.5 w-3.5 text-purple-500" />
            <span className="text-xs text-muted-foreground">Physics ΔV: </span>
            <span className="text-xs font-semibold text-purple-600">
              {(ai as any)._physics.deltaVKmh ?? '—'} km/h
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Assessment Dialog ─────────────────────────────────────────────────────────

function AssessmentDialog({
  claim, open, onClose, onSuccess,
}: {
  claim: any; open: boolean; onClose: () => void; onSuccess: () => void;
}) {
  const { user } = useAuth();
  const [form, setForm] = useState({
    estimatedRepairCost: "",
    laborCost: "",
    partsCost: "",
    estimatedDuration: "",
    damageAssessment: "",
    recommendations: "",
    fraudRiskLevel: "low" as "low" | "medium" | "high",
    disagreesWithAi: false,
    aiDisagreementReason: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = trpc.assessorEvaluations.submit.useMutation({
    onSuccess: () => {
      toast.success("Assessment submitted", { description: "Claim moved to internal review." });
      onSuccess();
      onClose();
    },
    onError: (e: any) => toast.error("Submission failed", { description: e.message }),
  });

  function validate() {
    const e: Record<string, string> = {};
    if (!form.estimatedRepairCost || isNaN(Number(form.estimatedRepairCost)) || Number(form.estimatedRepairCost) <= 0)
      e.estimatedRepairCost = "Enter a valid repair cost";
    if (!form.estimatedDuration || isNaN(Number(form.estimatedDuration)) || Number(form.estimatedDuration) <= 0)
      e.estimatedDuration = "Enter estimated duration in days";
    if (!form.damageAssessment.trim() || form.damageAssessment.trim().length < 20)
      e.damageAssessment = "Provide a detailed damage assessment (min 20 characters)";
    if (form.laborCost && isNaN(Number(form.laborCost)))
      e.laborCost = "Must be a number";
    if (form.partsCost && isNaN(Number(form.partsCost)))
      e.partsCost = "Must be a number";
    if (form.disagreesWithAi && !form.aiDisagreementReason.trim())
      e.aiDisagreementReason = "Explain why you disagree with the KINGA assessment";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit() {
    if (!validate()) return;
    submit.mutate({
      claimId: claim.id,
      assessorId: Number(user?.id ?? 0),
      estimatedRepairCost: Math.round(Number(form.estimatedRepairCost) * 100),
      laborCost: form.laborCost ? Math.round(Number(form.laborCost) * 100) : undefined,
      partsCost: form.partsCost ? Math.round(Number(form.partsCost) * 100) : undefined,
      estimatedDuration: Math.round(Number(form.estimatedDuration)),
      damageAssessment: form.damageAssessment.trim(),
      recommendations: form.recommendations.trim() || undefined,
      fraudRiskLevel: form.fraudRiskLevel,
      disagreesWithAi: form.disagreesWithAi,
      aiDisagreementReason: form.aiDisagreementReason.trim() || undefined,
    });
  }

  const sym = currencySymbol(claim?.currencyCode);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Conduct Internal Assessment</DialogTitle>
          <DialogDescription>
            {claim && `${claim.claimNumber} — ${claim.vehicleRegistration ?? "Vehicle pending"} — ${claim.vehicleMake ?? ""} ${claim.vehicleModel ?? ""}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Cost section */}
          <div>
            <p className="text-sm font-medium text-foreground mb-3">Cost Estimates ({sym})</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="repairCost">Total Repair Cost <span className="text-destructive">*</span></Label>
                <Input
                  id="repairCost"
                  type="number"
                  min="0"
                  placeholder="5000"
                  value={form.estimatedRepairCost}
                  onChange={e => setForm(f => ({ ...f, estimatedRepairCost: e.target.value }))}
                  className={errors.estimatedRepairCost ? "border-destructive" : ""}
                />
                {errors.estimatedRepairCost && <p className="text-xs text-destructive">{errors.estimatedRepairCost}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="duration">Duration (days) <span className="text-destructive">*</span></Label>
                <Input
                  id="duration"
                  type="number"
                  min="1"
                  placeholder="7"
                  value={form.estimatedDuration}
                  onChange={e => setForm(f => ({ ...f, estimatedDuration: e.target.value }))}
                  className={errors.estimatedDuration ? "border-destructive" : ""}
                />
                {errors.estimatedDuration && <p className="text-xs text-destructive">{errors.estimatedDuration}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="laborCost">Labour Cost</Label>
                <Input
                  id="laborCost"
                  type="number"
                  min="0"
                  placeholder="2000"
                  value={form.laborCost}
                  onChange={e => setForm(f => ({ ...f, laborCost: e.target.value }))}
                  className={errors.laborCost ? "border-destructive" : ""}
                />
                {errors.laborCost && <p className="text-xs text-destructive">{errors.laborCost}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="partsCost">Parts Cost</Label>
                <Input
                  id="partsCost"
                  type="number"
                  min="0"
                  placeholder="3000"
                  value={form.partsCost}
                  onChange={e => setForm(f => ({ ...f, partsCost: e.target.value }))}
                  className={errors.partsCost ? "border-destructive" : ""}
                />
                {errors.partsCost && <p className="text-xs text-destructive">{errors.partsCost}</p>}
              </div>
            </div>
          </div>

          {/* Fraud risk */}
          <div className="space-y-1.5">
            <Label>Fraud Risk Level <span className="text-destructive">*</span></Label>
            <Select
              value={form.fraudRiskLevel}
              onValueChange={(v: "low" | "medium" | "high") => setForm(f => ({ ...f, fraudRiskLevel: v }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low — No indicators detected</SelectItem>
                <SelectItem value="medium">Medium — Requires monitoring</SelectItem>
                <SelectItem value="high">High — Flag for investigation</SelectItem>
              </SelectContent>
            </Select>
            {form.fraudRiskLevel === "high" && (
              <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg mt-1">
                <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                <p className="text-sm text-red-700 dark:text-red-300">
                  High-risk claims are escalated to the Risk Manager and flagged for executive review.
                </p>
              </div>
            )}
          </div>

          {/* Damage assessment */}
          <div className="space-y-1.5">
            <Label htmlFor="damageAssessment">Damage Assessment <span className="text-destructive">*</span></Label>
            <Textarea
              id="damageAssessment"
              rows={5}
              placeholder="Describe the vehicle damage in detail: affected components, severity, repair methodology, and any structural concerns…"
              value={form.damageAssessment}
              onChange={e => setForm(f => ({ ...f, damageAssessment: e.target.value }))}
              className={errors.damageAssessment ? "border-destructive" : ""}
            />
            {errors.damageAssessment && <p className="text-xs text-destructive">{errors.damageAssessment}</p>}
            <p className="text-xs text-muted-foreground">{form.damageAssessment.length} characters</p>
          </div>

          {/* KINGA disagreement */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="disagreesWithAi"
                checked={form.disagreesWithAi}
                onChange={e => setForm(f => ({ ...f, disagreesWithAi: e.target.checked }))}
                className="h-4 w-4 rounded border-border"
              />
              <Label htmlFor="disagreesWithAi" className="cursor-pointer">
                I disagree with the KINGA assessment
              </Label>
            </div>
            {form.disagreesWithAi && (
              <div className="space-y-1.5 pl-6">
                <Label htmlFor="aiReason">Reason for disagreement <span className="text-destructive">*</span></Label>
                <Textarea
                  id="aiReason"
                  rows={3}
                  placeholder="Explain the specific discrepancy between your assessment and the KINGA findings…"
                  value={form.aiDisagreementReason}
                  onChange={e => setForm(f => ({ ...f, aiDisagreementReason: e.target.value }))}
                  className={errors.aiDisagreementReason ? "border-destructive" : ""}
                />
                {errors.aiDisagreementReason && <p className="text-xs text-destructive">{errors.aiDisagreementReason}</p>}
              </div>
            )}
          </div>

          {/* Recommendations */}
          <div className="space-y-1.5">
            <Label htmlFor="recommendations">Recommendations</Label>
            <Textarea
              id="recommendations"
              rows={3}
              placeholder="Optional: additional recommendations, special repair instructions, or follow-up actions…"
              value={form.recommendations}
              onChange={e => setForm(f => ({ ...f, recommendations: e.target.value }))}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={submit.isPending}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submit.isPending}>
            {submit.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Submitting…</> : "Submit Assessment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function InternalAssessorDashboard() {
  const { user } = useAuth();
  // Sync active tab with sidebar navigation.
  // Sidebar uses query params: /insurer-portal/internal-assessor?tab=queue etc.
  const searchStr = useSearch();
  const getTabFromSearch = (s: string) => {
    const params = new URLSearchParams(s);
    const tabParam = params.get("tab") ?? "";
    const tabMap: Record<string, string> = {
      "queue":       "queue",
      "in-progress": "claims",
      "completed":   "completed",
    };
    return tabMap[tabParam] ?? "queue";
  };
  const [activeTab, setActiveTab] = useState(() => getTabFromSearch(searchStr));
  useEffect(() => {
    setActiveTab(getTabFromSearch(searchStr));
  }, [searchStr]);
  const [perfPeriod, setPerfPeriod] = useState<'weekly' | 'monthly'>('monthly');
  const [selectedInsurerId, setSelectedInsurerId] = useState<string | null>(null);
  const [selectedClaim, setSelectedClaim] = useState<any>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedClaimId, setExpandedClaimId] = useState<number | null>(null);

  // ── Data fetching ──────────────────────────────────────────────────────────

  // Tab 1: Assessment queue — claims in assessment_pending status
  const { data: queueRaw = [], isLoading: queueLoading, refetch: refetchQueue } =
    trpc.claims.byStatus.useQuery({ status: "assessment_pending" });

  // Tab 2: All claims assigned to me
  const { data: myAssignments = [], isLoading: assignmentsLoading, refetch: refetchAssignments } =
    trpc.claims.myAssignments.useQuery();

  // Tab 3: My appointments
  const { data: appointments = [], isLoading: appointmentsLoading } =
    trpc.appointments.myAppointments.useQuery();

  // Tab 5: Performance dashboard
  const { data: perfData, isLoading: perfLoading } =
    trpc.assessors.getPerformanceDashboard.useQuery();

  // Per-insurer performance trend
  const { data: perfTrend } = trpc.assessors.getMyPerformanceTrend.useQuery({
    period: perfPeriod,
    tenantId: selectedInsurerId,
  });
  // ── Derived data ───────────────────────────────────────────────────────────

  // Queue: also include under_assessment workflowState claims from myAssignments
  const assessmentQueue = useMemo(() => {
    const queueIds = new Set(queueRaw.map((c: any) => c.id));
    const underAssessment = myAssignments.filter(
      (c: any) => c.workflowState === "under_assessment" || c.workflowState === "assigned"
    );
    const extra = underAssessment.filter((c: any) => !queueIds.has(c.id));
    return [...queueRaw, ...extra];
  }, [queueRaw, myAssignments]);

  // Completed: assignments that are past assessment stage
  const completedClaims = useMemo(
    () => myAssignments.filter((c: any) =>
      ["internal_review", "technical_approval", "financial_decision", "payment_authorized", "closed", "completed"].includes(
        c.workflowState ?? c.status ?? ""
      )
    ),
    [myAssignments]
  );

  // In-progress: assignments currently being worked
  const inProgressClaims = useMemo(
    () => myAssignments.filter((c: any) =>
      !["internal_review", "technical_approval", "financial_decision", "payment_authorized", "closed", "completed"].includes(
        c.workflowState ?? c.status ?? ""
      )
    ),
    [myAssignments]
  );

  // Filtered for My Claims tab
  const filteredAssignments = useMemo(() => {
    if (!search) return myAssignments;
    const q = search.toLowerCase();
    return myAssignments.filter((c: any) =>
      (c.claimNumber ?? "").toLowerCase().includes(q) ||
      (c.vehicleRegistration ?? "").toLowerCase().includes(q) ||
      (c.vehicleMake ?? "").toLowerCase().includes(q) ||
      (c.vehicleModel ?? "").toLowerCase().includes(q) ||
      (c.policyNumber ?? "").toLowerCase().includes(q)
    );
  }, [myAssignments, search]);

  // Upcoming appointments (future)
  const upcomingAppointments = useMemo(
    () => appointments
      .filter((a: any) => new Date(a.scheduledDate) >= new Date())
      .sort((a: any, b: any) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime()),
    [appointments]
  );

  const pastAppointments = useMemo(
    () => appointments
      .filter((a: any) => new Date(a.scheduledDate) < new Date())
      .sort((a: any, b: any) => new Date(b.scheduledDate).getTime() - new Date(a.scheduledDate).getTime()),
    [appointments]
  );

  function openAssessment(claim: any) {
    setSelectedClaim(claim);
    setShowDialog(true);
  }

  function onAssessmentSuccess() {
    refetchQueue();
    refetchAssignments();
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const p11Tabs = [
    { id: 'queue', label: 'Assessment Queue', badge: assessmentQueue.length || undefined },
    { id: 'claims', label: 'My Claims', badge: myAssignments.length || undefined },
    { id: 'appointments', label: 'Appointments', badge: upcomingAppointments.length || undefined },
    { id: 'completed', label: 'Completed' },
    { id: 'performance', label: 'Performance' },
    { id: 'notifications', label: 'Notifications' },
  ];

  return (
    <div style={{ background: 'var(--body-bg)', fontFamily: 'Inter, sans-serif', minHeight: '100vh' }}>
      <PortalHeroBand
        portalName="Internal Assessor"
        title={`Welcome back, ${user?.name ?? 'Assessor'}`}
        subtitle="Review assigned claims, conduct internal evaluations, and track performance"
        actions={[
          { label: 'Export Report', icon: <Download className="h-3 w-3" />, primary: true },
        ]}
        kpis={[
          { label: 'Assessment Queue', value: assessmentQueue.length, delta: 'Awaiting evaluation', up: null, headline: true },
          { label: 'Total Assigned', value: myAssignments.length, delta: `${inProgressClaims.length} in progress`, up: null },
          { label: 'Completed', value: completedClaims.length, delta: 'Evaluations submitted', up: true },
          { label: 'Appointments', value: upcomingAppointments.length, delta: 'Upcoming', up: null },
          { label: 'Performance Score', value: perfData ? `${perfData.performanceScore ?? 0}%` : '—', delta: 'Overall rating', up: (perfData?.performanceScore ?? 0) >= 70 },
          { label: 'Avg Variance', value: perfData?.averageVarianceFromFinal != null ? `${perfData.averageVarianceFromFinal > 0 ? '+' : ''}${perfData.averageVarianceFromFinal}%` : '—', delta: 'vs final approved', up: Math.abs(perfData?.averageVarianceFromFinal ?? 0) <= 5 },
        ]}
      />
      <ProtoAlertBar
        alerts={[
          { count: assessmentQueue.length, label: 'Claims pending internal assessment', severity: 'red', onClick: () => setActiveTab('queue') },
          { count: upcomingAppointments.length, label: 'Upcoming inspection appointments', severity: 'amber', onClick: () => setActiveTab('appointments') },
        ]}
        ctaLabel="View queue"
      />
      <ProtoTabBar tabs={p11Tabs} activeTab={activeTab} onTabChange={setActiveTab} />


      {/* ── BODY ── */}
      <div className="p11-body">
        <div className="p11-body-2col">
          {/* ── MAIN COLUMN ── */}
          <div>

        {/* ── Tab 1: Assessment Queue ── */}
        {activeTab === 'queue' && <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Claims assigned to you that are in <code className="text-xs bg-muted px-1 rounded">assessment_pending</code> or <code className="text-xs bg-muted px-1 rounded">under_assessment</code> state.
          </p>
          {queueLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin" /> Loading queue…
            </div>
          ) : assessmentQueue.length > 0 ? (
            <div className="space-y-3">
              {assessmentQueue.map((claim: any) => (
                <div key={claim.id} className="rounded-lg border border-border bg-card hover:border-foreground/20 transition-colors overflow-hidden">
                  <div className="p-4">
                    <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                      {/* Left: claim info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <span className="font-semibold text-foreground">{claim.claimNumber}</span>
                          <Badge variant="outline" className="text-xs">
                            {wfLabel(claim.workflowState ?? claim.status)}
                          </Badge>
                          <RiskBadge fraudRiskScore={claim.fraudRiskScore} fraudFlags={claim.fraudFlags} size="sm" />
                          {claim.aiAssessmentCompleted === 1 && (
                            <Badge variant="secondary" className="text-xs gap-1">
                              <Brain className="h-3 w-3" /> KINGA Ready
                            </Badge>
                          )}
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-0.5 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Car className="h-3 w-3 shrink-0" />
                            {[claim.vehicleRegistration, claim.vehicleMake, claim.vehicleModel].filter(Boolean).join(" · ") || "—"}
                          </span>
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3 shrink-0" />
                            {claim.claimantName ?? claim.claimantEmail ?? "—"}
                          </span>
                          <span className="flex items-center gap-1">
                            <DollarSign className="h-3 w-3 shrink-0" />
                            {claimAmount(claim)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3 shrink-0" />
                            {fmtDate(claim.createdAt)}
                          </span>
                        </div>
                        {claim.incidentDescription && (
                          <p className="text-xs text-muted-foreground mt-1.5 line-clamp-1">
                            <strong className="text-foreground">Incident:</strong> {claim.incidentDescription}
                          </p>
                        )}
                      </div>
                      {/* Right: actions */}
                      <div className="flex flex-row sm:flex-col gap-1.5 shrink-0 flex-wrap sm:flex-nowrap">
                        <Button size="sm" onClick={() => openAssessment(claim)}>
                          <CheckCircle2 className="h-4 w-4 mr-1.5" /> Assess
                        </Button>
                        <AiAssessButton
                          claimId={claim.id}
                          claimNumber={claim.claimNumber}
                          currentStatus={claim.status}
                          onSuccess={() => { refetchQueue(); refetchAssignments(); }}
                          size="sm"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setExpandedClaimId(expandedClaimId === claim.id ? null : claim.id)}
                          className="gap-1"
                        >
                          {expandedClaimId === claim.id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          KINGA
                        </Button>
                        <Link href={`/insurer/claims/${claim.id}/comparison?report=standard`}>
                          <Button size="sm" variant="ghost" className="w-full">
                            <Eye className="h-4 w-4 mr-1.5" /> View
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </div>
                  {/* Expandable KINGA context panel */}
                  {expandedClaimId === claim.id && (
                    <div className="px-4 pb-4 bg-muted/20 border-t border-border">
                      <AiContextPanel claimId={claim.id} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-16 border border-dashed border-border rounded-lg">
              <CheckCheck className="h-10 w-10 text-green-500 mx-auto mb-3" />
              <p className="font-medium text-foreground">Queue is clear</p>
              <p className="text-sm text-muted-foreground mt-1">No claims pending internal assessment</p>
            </div>
          )}
        </div>}

        {/* ── Tab 2: My Claims ── */}
        {activeTab === 'claims' && <div className="space-y-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="relative flex-1 max-w-sm w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search claim, vehicle, policy…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <p className="text-sm text-muted-foreground shrink-0">{filteredAssignments.length} claims</p>
          </div>

          {assignmentsLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin" /> Loading assignments…
            </div>
          ) : filteredAssignments.length > 0 ? (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Claim</TableHead>
                    <TableHead className="hidden md:table-cell">Vehicle</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden sm:table-cell">Risk</TableHead>
                    <TableHead className="text-right hidden sm:table-cell">Value</TableHead>
                    <TableHead className="hidden md:table-cell">Submitted</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAssignments.map((claim: any) => (
                    <TableRow key={claim.id}>
                      <TableCell className="font-medium">{claim.claimNumber}</TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                        {[claim.vehicleRegistration, claim.vehicleMake, claim.vehicleModel].filter(Boolean).join(" · ") || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs whitespace-nowrap">
                          {wfLabel(claim.workflowState ?? claim.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <span className={`text-sm font-medium ${riskColor(claim.fraudRiskLevel)}`}>
                          {claim.fraudRiskLevel ? claim.fraudRiskLevel.charAt(0).toUpperCase() + claim.fraudRiskLevel.slice(1) : "—"}
                          {claim.fraudRiskScore ? ` (${claim.fraudRiskScore}%)` : ""}
                        </span>
                      </TableCell>
                      <TableCell className="text-right hidden sm:table-cell font-medium text-sm">
                        {claimAmount(claim)}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                        {fmtDate(claim.createdAt)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {(claim.workflowState === "under_assessment" || claim.status === "assessment_pending") && (
                            <Button size="sm" variant="outline" onClick={() => openAssessment(claim)}>
                              <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Assess
                            </Button>
                          )}
                          <Link href={`/insurer/claims/${claim.id}/comparison?report=standard`}>
                            <Button size="sm" variant="ghost">
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                          </Link>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          ) : (
            <div className="text-center py-16 border border-dashed border-border rounded-lg">
              <ClipboardList className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="font-medium text-foreground">
                {search ? "No claims match your search" : "No claims assigned yet"}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {search ? "Try a different search term" : "Claims will appear here once assigned by a claims manager"}
              </p>
            </div>
          )}
        </div>}

        {/* ── Tab 3: Appointments ── */}
        {activeTab === 'appointments' && <div className="space-y-5">
          {appointmentsLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin" /> Loading appointments…
            </div>
          ) : (
            <>
              {/* Upcoming */}
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-blue-500" /> Upcoming Appointments ({upcomingAppointments.length})
                </h3>
                {upcomingAppointments.length > 0 ? (
                  <div className="space-y-3">
                    {upcomingAppointments.map((appt: any) => (
                      <div key={appt.id} className="p-4 rounded-lg border border-border bg-card">
                        <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                              <Badge variant="outline" className="text-xs capitalize">
                                {appt.appointmentType?.replace(/_/g, " ") ?? "Inspection"}
                              </Badge>
                              <Badge
                                variant={appt.status === "confirmed" ? "default" : "secondary"}
                                className="text-xs capitalize"
                              >
                                {appt.status ?? "scheduled"}
                              </Badge>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1 text-sm">
                              <span className="flex items-center gap-1.5 text-foreground font-medium">
                                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                                {fmtDateTime(appt.scheduledDate)}
                              </span>
                              {appt.location && (
                                <span className="flex items-center gap-1.5 text-muted-foreground">
                                  <MapPin className="h-3.5 w-3.5" />
                                  {appt.location}
                                </span>
                              )}
                              {appt.claimId && (
                                <span className="flex items-center gap-1.5 text-muted-foreground">
                                  <FileSearch className="h-3.5 w-3.5" />
                                  Claim #{appt.claimId}
                                </span>
                              )}
                            </div>
                            {appt.notes && (
                              <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">
                                <strong className="text-foreground">Notes:</strong> {appt.notes}
                              </p>
                            )}
                          </div>
                          {appt.claimId && (
                            <Link href={`/insurer/claims/${appt.claimId}/comparison?report=standard`}>
                              <Button size="sm" variant="outline" className="shrink-0">
                                <Eye className="h-4 w-4 mr-1.5" /> View Claim
                              </Button>
                            </Link>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-10 border border-dashed border-border rounded-lg">
                    <Calendar className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No upcoming appointments</p>
                  </div>
                )}
              </div>

              {/* Past */}
              {pastAppointments.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                    <Clock className="h-4 w-4" /> Past Appointments ({pastAppointments.length})
                  </h3>
                  <div className="space-y-2">
                    {pastAppointments.slice(0, 10).map((appt: any) => (
                      <div key={appt.id} className="p-3 rounded-lg border border-border bg-muted/30 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-3 text-sm">
                          <Badge variant="secondary" className="text-xs capitalize">
                            {appt.appointmentType?.replace(/_/g, " ") ?? "Inspection"}
                          </Badge>
                          <span className="text-muted-foreground">{fmtDateTime(appt.scheduledDate)}</span>
                          {appt.location && (
                            <span className="text-muted-foreground hidden sm:inline">· {appt.location}</span>
                          )}
                        </div>
                        <Badge variant={appt.status === "completed" ? "default" : "outline"} className="text-xs capitalize">
                          {appt.status ?? "—"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>}

        {/* ── Tab 4: Completed ── */}
        {activeTab === 'completed' && <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Claims where you have submitted an internal assessment and the workflow has progressed.
          </p>
          {assignmentsLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin" /> Loading…
            </div>
          ) : completedClaims.length > 0 ? (
            <div className="space-y-3">
              {completedClaims.map((claim: any) => (
                <ClaimRow
                  key={claim.id}
                  claim={claim}
                  actions={
                    <Link href={`/insurer/claims/${claim.id}/comparison?report=standard`}>
                      <Button size="sm" variant="outline" className="w-full">
                        <Eye className="h-4 w-4 mr-1.5" /> View Report
                      </Button>
                    </Link>
                  }
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-16 border border-dashed border-border rounded-lg">
              <CheckCheck className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="font-medium text-foreground">No completed assessments yet</p>
              <p className="text-sm text-muted-foreground mt-1">Assessments you submit will appear here</p>
            </div>
          )}
        </div>}

          {/* ── Performance Tab ── */}
          {activeTab === 'performance' && <div className="space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3">
              <Select value={perfPeriod} onValueChange={(v) => setPerfPeriod(v as 'weekly' | 'monthly')}>
                <SelectTrigger className="w-36 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                </SelectContent>
              </Select>
              {perfTrend?.insurers && perfTrend.insurers.length > 0 && (
                <Select value={selectedInsurerId ?? "all"} onValueChange={(v) => setSelectedInsurerId(v === "all" ? null : v)}>
                  <SelectTrigger className="w-48 h-8 text-xs">
                    <SelectValue placeholder="All Insurers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Insurers</SelectItem>
                    {perfTrend.insurers.map((ins: any) => (
                      <SelectItem key={ins.tenantId} value={ins.tenantId}>{ins.displayName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {perfLoading && (
              <div className="flex items-center justify-center py-16">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
              </div>
            )}

            {perfData && (
              <div className="space-y-4">
                {/* KPI Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Card>
                    <CardContent className="pt-4 pb-3 text-center">
                      <p className="text-2xl font-bold text-foreground">{perfData.performanceScore ?? 0}%</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Performance Score</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4 pb-3 text-center">
                      <p className="text-2xl font-bold text-foreground">{perfData.totalAssessmentsCompleted ?? 0}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Assessments Done</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4 pb-3 text-center">
                      <p className={`text-2xl font-bold ${
                        Math.abs(perfData.averageVarianceFromFinal ?? 0) > 15 ? 'text-red-600'
                        : Math.abs(perfData.averageVarianceFromFinal ?? 0) > 5 ? 'text-amber-600'
                        : 'text-emerald-600'
                      }`}>
                        {perfData.averageVarianceFromFinal != null
                          ? `${perfData.averageVarianceFromFinal > 0 ? '+' : ''}${perfData.averageVarianceFromFinal}%`
                          : '—'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">Avg Variance</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4 pb-3 text-center">
                      <Badge variant={perfData.tier === 'premium' ? 'default' : 'secondary'} className="text-xs capitalize">
                        {perfData.tier ?? 'free'}
                      </Badge>
                      <p className="text-xs text-muted-foreground mt-1.5">Tier</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Variance trend chart */}
                {perfData.recentAssessments && perfData.recentAssessments.length >= 3 && (() => {
                  const sorted = [...perfData.recentAssessments].reverse().slice(-12);
                  const labels = sorted.map((_: any, i: number) => `#${i + 1}`);
                  const variances = sorted.map((ev: any) => ev.averageVarianceFromFinal ?? ev.varianceFromFinal ?? 0);
                  return (
                    <Card>
                      <CardHeader className="pb-2 pt-4 px-4">
                        <CardTitle className="text-sm font-semibold flex items-center gap-2">
                          <Activity className="h-4 w-4 text-blue-500" /> Variance Trend (Last {sorted.length} Assessments)
                        </CardTitle>
                        <p className="text-xs text-muted-foreground">Your estimate vs final approved — closer to 0% is better</p>
                      </CardHeader>
                      <CardContent className="pb-4">
                        <div style={{ height: '160px' }}>
                          <Bar
                            data={{
                              labels,
                              datasets: [{
                                label: 'Variance %',
                                data: variances,
                                backgroundColor: variances.map((v: number) =>
                                  Math.abs(v) > 15 ? 'rgba(239,68,68,0.7)' : Math.abs(v) > 5 ? 'rgba(245,158,11,0.7)' : 'rgba(16,185,129,0.7)'
                                ),
                                borderRadius: 4,
                              }]
                            }}
                            options={{
                              responsive: true, maintainAspectRatio: false,
                              plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx: any) => ` ${ctx.raw > 0 ? '+' : ''}${ctx.raw}%` } } },
                              scales: {
                                y: { grid: { color: 'rgba(128,128,128,0.1)' }, ticks: { callback: (v: any) => `${v}%`, font: { size: 10 } } },
                                x: { grid: { display: false }, ticks: { font: { size: 10 } } }
                              }
                            }}
                          />
                        </div>
                      </CardContent>
                    </Card>
                  );
                })()}

                {/* Per-insurer breakdown */}
                {perfTrend?.byInsurer && perfTrend.byInsurer.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2 pt-4 px-4">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <BarChart3 className="h-4 w-4 text-emerald-500" /> Per-Insurer Breakdown
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0 pb-2">
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b bg-muted/30">
                              <th className="text-left py-1.5 px-3 font-semibold text-muted-foreground">Insurer</th>
                              <th className="text-right py-1.5 px-3 font-semibold text-muted-foreground">Assignments</th>
                              <th className="text-right py-1.5 px-3 font-semibold text-muted-foreground">Rating</th>
                              <th className="text-left py-1.5 px-3 font-semibold text-muted-foreground">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {perfTrend.byInsurer.map((ins: any) => (
                              <tr key={ins.tenantId} className="border-b hover:bg-muted/20">
                                <td className="py-1.5 px-3 font-medium">{ins.displayName}</td>
                                <td className="py-1.5 px-3 text-right">{ins.totalAssignments}</td>
                                <td className="py-1.5 px-3 text-right">
                                  {ins.performanceRating != null ? `${ins.performanceRating}%` : '—'}
                                </td>
                                <td className="py-1.5 px-3">
                                  <Badge variant={ins.relationshipStatus === 'active' ? 'default' : 'secondary'} className="text-[10px] capitalize">
                                    {ins.relationshipStatus ?? 'unknown'}
                                  </Badge>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Recent evaluations */}
                {perfData.recentAssessments && perfData.recentAssessments.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2 pt-4 px-4">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <Brain className="h-4 w-4 text-purple-500" /> Recent Evaluations
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0 pb-2">
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b bg-muted/30">
                              <th className="text-left py-1.5 px-3 font-semibold text-muted-foreground">Claim</th>
                              <th className="text-right py-1.5 px-3 font-semibold text-muted-foreground hidden sm:table-cell">Est. Cost</th>
                              <th className="text-left py-1.5 px-3 font-semibold text-muted-foreground">Risk</th>
                              <th className="text-left py-1.5 px-3 font-semibold text-muted-foreground hidden md:table-cell">Submitted</th>
                            </tr>
                          </thead>
                          <tbody>
                            {perfData.recentAssessments.slice(0, 8).map((ev: any) => (
                              <tr key={ev.id} className="border-b hover:bg-muted/20">
                                <td className="py-1.5 px-3 font-mono">#{ev.claimId}</td>
                                <td className="py-1.5 px-3 text-right hidden sm:table-cell">
                                  {ev.estimatedRepairCost ? `R${(ev.estimatedRepairCost / 100).toLocaleString()}` : '—'}
                                </td>
                                <td className="py-1.5 px-3">
                                  <span className={`font-medium capitalize ${riskColor(ev.fraudRiskLevel)}`}>{ev.fraudRiskLevel ?? '—'}</span>
                                </td>
                                <td className="py-1.5 px-3 text-muted-foreground hidden md:table-cell">{fmtDate(ev.createdAt)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {!perfData.recentAssessments?.length && (
                  <div className="text-center py-16 border border-dashed border-border rounded-lg">
                    <BarChart3 className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                    <p className="font-medium text-foreground">No performance data yet</p>
                    <p className="text-sm text-muted-foreground mt-1">Complete assessments to see your performance metrics</p>
                  </div>
                )}
              </div>
            )}
          </div>}

          {/* ── Notifications Tab ── */}
          {activeTab === 'notifications' && <div className="mt-4"><NotificationsInbox /></div>}

          </div>
          {/* ── SIDEBAR ── */}
          <div className="p11-sidebar">
            {/* Performance Summary */}
            <div className="p11-card">
              <div className="p11-card-header">
                <div className="p11-card-title">
                  <BarChart3 style={{ width: 14, height: 14, color: 'var(--g-600)' }} />
                  Performance Summary
                </div>
              </div>
              <div className="p11-card-body">
                {[
                  { label: 'Performance Score', value: `${perfData?.performanceScore ?? 0}%`, cls: (perfData?.performanceScore ?? 0) >= 70 ? 'green' : 'amber' },
                  { label: 'Completed (Total)', value: perfData?.totalAssessmentsCompleted ?? 0, cls: 'green' },
                  { label: 'In Queue', value: assessmentQueue.length, cls: assessmentQueue.length > 0 ? 'amber' : 'muted' },
                  { label: 'Avg Variance', value: perfData?.averageVarianceFromFinal != null ? `${Math.round((perfData.averageVarianceFromFinal as number) * 100) / 100}%` : '—', cls: 'muted' },
                ].map(row => (
                  <div key={row.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--line)' }}>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>{row.label}</span>
                    <span className={`p11-badge ${row.cls}`}>{row.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Appointments */}
            <div className="p11-card">
              <div className="p11-card-header">
                <div className="p11-card-title">
                  <Calendar style={{ width: 14, height: 14, color: 'var(--g-600)' }} />
                  Appointments
                </div>
              </div>
              <div className="p11-card-body">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>Upcoming</span>
                  <span style={{ fontSize: 20, fontWeight: 700, color: upcomingAppointments.length > 0 ? 'var(--amber)' : 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{upcomingAppointments.length}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>Past</span>
                  <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{pastAppointments.length}</span>
                </div>
              </div>
            </div>

            {/* Subscription Tier */}
            <div className="p11-card">
              <div className="p11-card-header">
                <div className="p11-card-title">
                  <Shield style={{ width: 14, height: 14, color: 'var(--gold-600)' }} />
                  Subscription Tier
                </div>
              </div>
              <div className="p11-card-body" style={{ textAlign: 'center', padding: '12px 0' }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--g-800)', textTransform: 'capitalize' }}>
                  {perfData?.tier ?? 'Free'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Current plan</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Assessment dialog */}
      {selectedClaim && (
        <AssessmentDialog
          claim={selectedClaim}
          open={showDialog}
          onClose={() => { setShowDialog(false); setSelectedClaim(null); }}
          onSuccess={onAssessmentSuccess}
        />
      )}
    </div>
  );
}
