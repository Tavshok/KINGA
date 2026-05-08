/**
 * RecoveryCaseDetail
 *
 * Full detail view for a single recovery case.
 * Shows claim evidence, third-party details, RPS breakdown,
 * status management, officer notes, and demand letter generation.
 */
import { useState } from "react";
import { useParams, useLocation } from "wouter";
import InsurerPortalLayout from "@/components/InsurerPortalLayout";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Scale, ArrowLeft, FileText, Send, CheckSquare, Gavel, Archive,
  Search, Activity, ClipboardList, AlertTriangle, Car, Phone,
  Building2, Hash, Calendar, DollarSign, User, MapPin, FileDown,
  Loader2, RefreshCw, Shield, TrendingUp, CreditCard, XCircle,
} from "lucide-react";

const STATUS_META: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  pending_review:       { label: "Pending Review",       color: "text-blue-400",    bg: "bg-blue-500/10",    icon: ClipboardList },
  under_investigation:  { label: "Under Investigation",  color: "text-amber-400",   bg: "bg-amber-500/10",   icon: Search },
  open:                 { label: "Open",                  color: "text-teal-400",    bg: "bg-teal-500/10",    icon: Activity },
  demand_sent:          { label: "Demand Sent",           color: "text-violet-400",  bg: "bg-violet-500/10",  icon: Send },
  disputed_legal:       { label: "Disputed / Legal",      color: "text-rose-400",    bg: "bg-rose-500/10",    icon: Gavel },
  settled_full:         { label: "Settled (Full)",        color: "text-emerald-400", bg: "bg-emerald-500/10", icon: CheckSquare },
  settled_partial:      { label: "Settled (Partial)",     color: "text-emerald-400", bg: "bg-emerald-500/10", icon: CheckSquare },
  closed_no_recovery:   { label: "Closed — No Recovery",  color: "text-slate-400",   bg: "bg-slate-500/10",   icon: Archive },
  archived:             { label: "Archived",              color: "text-slate-400",   bg: "bg-slate-500/10",   icon: Archive },
};

const WRONGED_PARTY_META: Record<string, { label: string; color: string }> = {
  insured:      { label: "Our Insured",      color: "text-teal-400" },
  third_party:  { label: "Third Party",      color: "text-rose-400" },
  shared:       { label: "Shared Liability", color: "text-amber-400" },
  unknown:      { label: "Unknown",          color: "text-slate-400" },
};

function InfoRow({ label, value, icon: Icon }: { label: string; value?: string | number | null; icon?: React.ElementType }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex items-start gap-3 py-2 border-b border-border/50 last:border-0">
      {Icon && <Icon className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />}
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-sm text-foreground font-medium break-words">{value}</div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-1">
      <h3 className="text-sm font-semibold text-foreground mb-3 uppercase tracking-wider">{title}</h3>
      {children}
    </div>
  );
}

export default function RecoveryCaseDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const caseId = parseInt(id ?? "0", 10);

  const [editStatus, setEditStatus] = useState<string>("");
  const [editNotes, setEditNotes] = useState<string>("");
  const [recoveredAmount, setRecoveredAmount] = useState<string>("");
  const [investigationReason, setInvestigationReason] = useState<string>("");
  const [editRecoveryTarget, setEditRecoveryTarget] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingLetter, setIsGeneratingLetter] = useState(false);

  // Quick-action modal state
  const [settlementModal, setSettlementModal] = useState(false);
  const [settlementType, setSettlementType] = useState<"settled_full" | "settled_partial">("settled_full");
  const [settlementAmount, setSettlementAmount] = useState("");
  const [settlementNotes, setSettlementNotes] = useState("");
  const [demandSentModal, setDemandSentModal] = useState(false);
  const [demandResponseDue, setDemandResponseDue] = useState("");

  const { data: caseData, isLoading, refetch } = trpc.recovery.getCase.useQuery(
    { id: caseId },
    { enabled: caseId > 0 }
  );

  const updateCase = trpc.recovery.updateCase.useMutation({
    onSuccess: () => {
      toast({ title: "Case updated", description: "Recovery case has been updated successfully." });
      refetch();
      setIsSaving(false);
    },
    onError: (err) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
      setIsSaving(false);
    },
  });

  const generateDemandLetter = trpc.recovery.generateDemandLetter.useMutation({
    onSuccess: (data) => {
      toast({ title: "Demand letter generated", description: "Draft letter is ready for review and download." });
      setIsGeneratingLetter(false);
      refetch();
      if (data.downloadUrl) window.open(data.downloadUrl, "_blank");
    },
    onError: (err) => {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
      setIsGeneratingLetter(false);
    },
  });

  // Prior cases query — only fires when the current case is a repeat offender
  const priorCaseIds: number[] = (() => {
    try { return caseData?.priorCaseIds ? JSON.parse(caseData.priorCaseIds as string) : []; }
    catch { return []; }
  })();
  const { data: priorCases } = trpc.recovery.getPriorCases.useQuery(
    { ids: priorCaseIds },
    { enabled: priorCaseIds.length > 0 }
  );

  // Deadline countdown chip helper
  function deadlineChip(deadline: string | null | undefined) {
    if (!deadline) return null;
    const today = new Date();
    const dl = new Date(deadline);
    const days = Math.round((dl.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (days < 0) return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/30">OVERDUE</span>;
    if (days <= 14) return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/30">{days}d left</span>;
    if (days <= 60) return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">{days}d left</span>;
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-teal-500/20 text-teal-400 border border-teal-500/30">{days}d left</span>;
  }

  const handleSave = () => {
    if (!editStatus && !editNotes && !recoveredAmount && !investigationReason && !editRecoveryTarget) {
      toast({ title: "Nothing to save", description: "Make a change before saving.", variant: "destructive" });
      return;
    }
    setIsSaving(true);
    updateCase.mutate({
      id: caseId,
      ...(editStatus ? { status: editStatus as any } : {}),
      ...(editNotes ? { officerNotes: editNotes } : {}),
      ...(recoveredAmount ? { recoveredAmount: Math.round(parseFloat(recoveredAmount) * 100) } : {}),
      ...(investigationReason ? { investigationReason } : {}),
      ...(editRecoveryTarget ? { recoveryTarget: editRecoveryTarget as any } : {}),
    });
  };

  const handleGenerateLetter = () => {
    setIsGeneratingLetter(true);
    generateDemandLetter.mutate({ id: caseId });
  };

  // Quick-action: Mark Demand Sent
  const handleMarkDemandSent = () => {
    if (!demandResponseDue) {
      toast({ title: "Response due date required", description: "Enter the date by which the third party must respond.", variant: "destructive" });
      return;
    }
    setIsSaving(true);
    updateCase.mutate({
      id: caseId,
      status: "demand_sent",
      demandLetterSentAt: new Date().toISOString().replace("T", " ").substring(0, 19),
      demandResponseDueDate: demandResponseDue,
    }, {
      onSuccess: () => { setDemandSentModal(false); setDemandResponseDue(""); },
    });
  };

  // Quick-action: Record Settlement
  const handleRecordSettlement = () => {
    if (settlementType === "settled_partial" && !settlementAmount) {
      toast({ title: "Amount required", description: "Enter the partial settlement amount.", variant: "destructive" });
      return;
    }
    setIsSaving(true);
    updateCase.mutate({
      id: caseId,
      status: settlementType,
      ...(settlementAmount ? { recoveredAmount: Math.round(parseFloat(settlementAmount) * 100) } : {}),
      settlementAgreementDate: new Date().toISOString().split("T")[0],
      settlementNotes: settlementNotes || undefined,
    }, {
      onSuccess: () => { setSettlementModal(false); setSettlementAmount(""); setSettlementNotes(""); },
    });
  };

  // Quick-action: Escalate to Legal
  const handleEscalateToLegal = () => {
    setIsSaving(true);
    updateCase.mutate({
      id: caseId,
      status: "disputed_legal",
      officerNotes: (caseData?.officerNotes ? caseData.officerNotes + "\n" : "") +
        `[${new Date().toLocaleDateString("en-ZA")}] Case escalated to legal / attorney.`,
    });
  };

  if (isLoading) {
    return (
      <InsurerPortalLayout>
        <div className="p-6 flex items-center justify-center min-h-64">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </InsurerPortalLayout>
    );
  }

  if (!caseData) {
    return (
      <InsurerPortalLayout>
        <div className="p-6">
          <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-6 text-center">
            <AlertTriangle className="h-8 w-8 text-rose-400 mx-auto mb-2" />
            <div className="text-sm text-muted-foreground">Recovery case not found or access denied.</div>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => navigate("/insurer-portal/recovery")}>
              Back to Recovery Queue
            </Button>
          </div>
        </div>
      </InsurerPortalLayout>
    );
  }

  const statusMeta = STATUS_META[caseData.status] ?? STATUS_META.pending_review;
  const StatusIcon = statusMeta.icon;
  const wrongedMeta = WRONGED_PARTY_META[caseData.wrongedParty] ?? WRONGED_PARTY_META.unknown;
  const currency = caseData.currencyCode ?? "USD";
  const fmt = (cents?: number | null) =>
    cents != null ? `${currency} ${(cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}` : "—";

  const rpsColor = caseData.recoveryPotentialScore >= 70 ? "text-emerald-400"
    : caseData.recoveryPotentialScore >= 40 ? "text-amber-400"
    : "text-rose-400";

  const canEdit = ["recovery_officer", "claims_manager", "insurer_admin"].includes((user as any)?.insurerRole ?? "");
  const canGenerateLetter = canEdit && ["open", "demand_sent"].includes(caseData.status);

  return (
    <InsurerPortalLayout>
      <div className="p-6 space-y-6 max-w-6xl">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/insurer-portal/recovery")} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Recovery Queue
          </Button>
          <div className="flex-1 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10">
              <Scale className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">
                Recovery Case #{caseData.id}
                {caseData.claimNumber && <span className="text-muted-foreground font-normal"> — Claim {caseData.claimNumber}</span>}
              </h1>
              <p className="text-xs text-muted-foreground">
                Opened {new Date(caseData.createdAt).toLocaleDateString("en-ZA", { day: "2-digit", month: "long", year: "numeric" })}
              </p>
            </div>
          </div>
          <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${statusMeta.bg} ${statusMeta.color}`}>
            <StatusIcon className="h-3.5 w-3.5" />
            {statusMeta.label}
          </div>
          {deadlineChip(caseData.recoveryDeadline)}
          <Button variant="ghost" size="icon" onClick={() => refetch()} title="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {/* Quick Action Bar — contextual buttons based on current status */}
        {canEdit && caseData && !['settled_full','settled_partial','closed_no_recovery','archived'].includes(caseData.status) && (
          <div className="flex flex-wrap gap-2 p-4 rounded-lg border border-border bg-card">
            <span className="text-xs text-muted-foreground self-center mr-1 font-medium uppercase tracking-wider">Quick Actions:</span>

            {/* Mark Demand Sent — available when open or demand already sent (resend) */}
            {['open','pending_review'].includes(caseData.status) && (
              <Button
                size="sm"
                variant="outline"
                className="gap-2 border-violet-500/40 text-violet-400 hover:bg-violet-500/10"
                onClick={() => setDemandSentModal(true)}
                disabled={isSaving}
              >
                <Send className="h-3.5 w-3.5" /> Mark Demand Sent
              </Button>
            )}

            {/* Record Settlement — available when demand sent or disputed */}
            {['demand_sent','disputed_legal','open'].includes(caseData.status) && (
              <Button
                size="sm"
                variant="outline"
                className="gap-2 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
                onClick={() => setSettlementModal(true)}
                disabled={isSaving}
              >
                <CreditCard className="h-3.5 w-3.5" /> Record Settlement
              </Button>
            )}

            {/* Escalate to Legal — available when open or demand sent */}
            {['open','demand_sent','pending_review'].includes(caseData.status) && (
              <Button
                size="sm"
                variant="outline"
                className="gap-2 border-rose-500/40 text-rose-400 hover:bg-rose-500/10"
                onClick={handleEscalateToLegal}
                disabled={isSaving}
              >
                {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Gavel className="h-3.5 w-3.5" />}
                Escalate to Legal
              </Button>
            )}

            {/* Close No Recovery */}
            {['under_investigation','open','pending_review'].includes(caseData.status) && (
              <Button
                size="sm"
                variant="outline"
                className="gap-2 border-slate-500/40 text-slate-400 hover:bg-slate-500/10"
                onClick={() => {
                  if (!window.confirm("Close this case with no recovery? This cannot be undone.")) return;
                  setIsSaving(true);
                  updateCase.mutate({ id: caseId, status: "closed_no_recovery" });
                }}
                disabled={isSaving}
              >
                <XCircle className="h-3.5 w-3.5" /> Close — No Recovery
              </Button>
            )}
          </div>
        )}

        {/* Mark Demand Sent Modal */}
        <Dialog open={demandSentModal} onOpenChange={setDemandSentModal}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Send className="h-5 w-5 text-violet-400" /> Mark Demand Sent
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                Confirm that the demand letter has been sent to the third party or their insurer.
                Enter the date by which a response is required.
              </p>
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Response Due Date <span className="text-rose-400">*</span></label>
                <Input
                  type="date"
                  value={demandResponseDue}
                  onChange={(e) => setDemandResponseDue(e.target.value)}
                  className="text-sm"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setDemandSentModal(false)}>Cancel</Button>
              <Button
                size="sm"
                className="gap-2 bg-violet-600 hover:bg-violet-700 text-white"
                onClick={handleMarkDemandSent}
                disabled={isSaving}
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Confirm Demand Sent
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Record Settlement Modal */}
        <Dialog open={settlementModal} onOpenChange={setSettlementModal}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-emerald-400" /> Record Settlement
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Settlement Type</label>
                <Select value={settlementType} onValueChange={(v) => setSettlementType(v as any)}>
                  <SelectTrigger className="text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="settled_full">Full Recovery — 100% of claim amount recovered</SelectItem>
                    <SelectItem value="settled_partial">Partial Recovery — portion of claim amount recovered</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {settlementType === "settled_partial" && (
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">Recovered Amount ({currency}) <span className="text-rose-400">*</span></label>
                  <Input
                    type="number"
                    value={settlementAmount}
                    onChange={(e) => setSettlementAmount(e.target.value)}
                    placeholder="0.00"
                    className="text-sm"
                  />
                </div>
              )}
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Settlement Notes (optional)</label>
                <Textarea
                  value={settlementNotes}
                  onChange={(e) => setSettlementNotes(e.target.value)}
                  placeholder="Reference number, payment method, any conditions…"
                  rows={3}
                  className="text-sm resize-none"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setSettlementModal(false)}>Cancel</Button>
              <Button
                size="sm"
                className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={handleRecordSettlement}
                disabled={isSaving}
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckSquare className="h-4 w-4" />}
                Record Settlement
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Recovery Deadline warning */}
        {caseData.recoveryDeadline && (() => {
          const daysLeft = Math.ceil((new Date(caseData.recoveryDeadline).getTime() - Date.now()) / 86400000);
          if (daysLeft > 90) return null;
          return (
            <div className={`rounded-lg border p-4 flex gap-3 ${daysLeft <= 30 ? "border-rose-500/30 bg-rose-500/5" : "border-amber-500/30 bg-amber-500/5"}`}>
              <AlertTriangle className={`h-5 w-5 flex-shrink-0 mt-0.5 ${daysLeft <= 30 ? "text-rose-400" : "text-amber-400"}`} />
              <div className="text-sm">
                <span className={`font-semibold ${daysLeft <= 30 ? "text-rose-400" : "text-amber-400"}`}>
                  Recovery deadline: {new Date(caseData.recoveryDeadline).toLocaleDateString("en-ZA", { day: "2-digit", month: "long", year: "numeric" })}
                </span>
                <span className="text-muted-foreground ml-2">({daysLeft} day{daysLeft !== 1 ? "s" : ""} remaining)</span>
              </div>
            </div>
          );
        })()}

        {/* Repeat Offender Warning Banner */}
        {caseData.isRepeatOffender && (
          <div className="flex items-start gap-4 p-4 rounded-lg border border-rose-500/40 bg-rose-500/10">
            <div className="p-2 rounded-lg bg-rose-500/20 flex-shrink-0">
              <AlertTriangle className="h-5 w-5 text-rose-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-semibold text-rose-400 uppercase tracking-wide">Repeat Offender Detected</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                  {caseData.priorCaseCount} prior {caseData.priorCaseCount === 1 ? 'case' : 'cases'}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                The third party in this recovery case — 
                <span className="font-medium text-foreground">
                  {caseData.thirdPartyName ?? caseData.thirdPartyRegistration ?? "Unknown"}
                </span>
                 — has been identified in 
                <span className="font-medium text-rose-300">{caseData.priorCaseCount} previous recovery {caseData.priorCaseCount === 1 ? 'case' : 'cases'}</span> 
                under this insurer. This pattern may indicate a high-risk or fraudulent third party.
                Recovery officers should review prior cases and consider escalating to legal if a pattern of non-cooperation is established.
              </p>
              {caseData.priorCaseIds && (() => {
                try {
                  const ids: number[] = JSON.parse(caseData.priorCaseIds as string);
                  if (!ids.length) return null;
                  return (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted-foreground">Prior case IDs:</span>
                      {ids.map((pid) => (
                        <button
                          key={pid}
                          onClick={() => navigate(`/insurer-portal/recovery/${pid}`)}
                          className="text-xs font-mono px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30 transition-colors cursor-pointer"
                        >
                          #{pid}
                        </button>
                      ))}
                    </div>
                  );
                } catch { return null; }
              })()}
            </div>
          </div>
        )}
        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Left column — claim & third-party details */}
          <div className="lg:col-span-2 space-y-5">
            {/* Claim summary */}
            <Section title="Claim Details">
              <InfoRow label="Claim Number" value={caseData.claimNumber} icon={Hash} />
              <InfoRow label="Vehicle Registration" value={caseData.vehicleRegistration} icon={Car} />
              <InfoRow label="Incident Date" value={caseData.incidentDate ? new Date(caseData.incidentDate).toLocaleDateString("en-ZA", { day: "2-digit", month: "long", year: "numeric" }) : null} icon={Calendar} />
              <InfoRow label="Police Report Number" value={caseData.policeReportNumber} icon={Shield} />
              <InfoRow label="Approved Settlement Amount" value={fmt(caseData.approvedSettlementAmount)} icon={DollarSign} />
              <InfoRow label="Recovered Amount" value={fmt(caseData.recoveredAmount)} icon={TrendingUp} />
            </Section>

            {/* Third-party details */}
            <Section title="Third-Party Details">
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <span className="text-xs text-muted-foreground">Wronged Party:</span>
                <span className={`text-sm font-semibold ${wrongedMeta.color}`}>{wrongedMeta.label}</span>
                {caseData.thirdPartyLiabilityPct != null && caseData.thirdPartyLiabilityPct > 0 && (
                  <span className="text-xs text-muted-foreground ml-1">({caseData.thirdPartyLiabilityPct}% third-party liability)</span>
                )}
                {(caseData as any).recoveryTarget && (caseData as any).recoveryTarget !== 'unknown' && (
                  <span className={`ml-2 text-xs font-medium px-2 py-0.5 rounded-full ${
                    (caseData as any).recoveryTarget === 'insurer'
                      ? 'bg-violet-500/15 text-violet-300'
                      : 'bg-amber-500/15 text-amber-300'
                  }`}>
                    {(caseData as any).recoveryTarget === 'insurer' ? '🏢 Pursue Insurer' : '👤 Pursue Individual'}
                  </span>
                )}
              </div>
              {/* Individual / driver details */}
              <InfoRow label="Third-Party Name" value={caseData.thirdPartyName ?? caseData.thirdPartyNameFromClaim} icon={User} />
              {(caseData as any).thirdPartyIdNumber && (
                <InfoRow label="ID / Passport Number" value={(caseData as any).thirdPartyIdNumber} icon={CreditCard} />
              )}
              <InfoRow label="Vehicle Registration" value={caseData.thirdPartyRegistration ?? caseData.thirdPartyRegistrationFromClaim} icon={Car} />
              {((caseData as any).thirdPartyPhone || caseData.thirdPartyContactDetails) && (
                <InfoRow label="Phone" value={(caseData as any).thirdPartyPhone ?? caseData.thirdPartyContactDetails} icon={Phone} />
              )}
              {(caseData as any).thirdPartyAddress && (
                <InfoRow label="Address" value={(caseData as any).thirdPartyAddress} icon={MapPin} />
              )}
              {/* Insurer details — primary recovery target when available */}
              <div className="mt-3 pt-3 border-t border-border/30">
                <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">Insurer (Recovery Target)</p>
                <InfoRow label="Insurer Name" value={caseData.thirdPartyInsurer ?? caseData.thirdPartyInsurerFromClaim} icon={Building2} />
                <InfoRow label="Policy Number" value={caseData.thirdPartyPolicyNumber} icon={Hash} />
                {(caseData as any).thirdPartyInsurerPhone && (
                  <InfoRow label="Insurer Phone" value={(caseData as any).thirdPartyInsurerPhone} icon={Phone} />
                )}
                {(caseData as any).thirdPartyInsurerAddress && (
                  <InfoRow label="Insurer Address" value={(caseData as any).thirdPartyInsurerAddress} icon={MapPin} />
                )}
              </div>
              {/* Police report reference */}
              {((caseData as any).policeReportNumber || (caseData as any).policeStation) && (
                <div className="mt-3 pt-3 border-t border-border/30">
                  <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">Police Report</p>
                  {(caseData as any).policeReportNumber && (
                    <InfoRow label="Report Number" value={(caseData as any).policeReportNumber} icon={FileText} />
                  )}
                  {(caseData as any).policeStation && (
                    <InfoRow label="Police Station" value={(caseData as any).policeStation} icon={Shield} />
                  )}
                </div>
              )}
            </Section>

            {/* Investigation notes (if under investigation) */}
            {caseData.status === "under_investigation" && (
              <Section title="Investigation Status">
                <InfoRow label="Reason for Investigation" value={caseData.investigationReason} icon={Search} />
                <InfoRow label="Expected Resolution Date" value={caseData.investigationExpectedResolutionDate} icon={Calendar} />
                <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-300">
                  This case is on hold pending liability determination. Update the status to "Open" once liability is confirmed
                  and third-party details are verified. The recovery deadline clock is still running.
                </div>
              </Section>
            )}

            {/* Demand letter section */}
            <Section title="Demand Letter">
              {caseData.demandLetterUrl ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5">
                    <FileText className="h-5 w-5 text-emerald-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground">Draft Demand Letter</div>
                      {caseData.demandLetterSentAt && (
                        <div className="text-xs text-muted-foreground">
                          Sent: {new Date(caseData.demandLetterSentAt).toLocaleDateString("en-ZA", { day: "2-digit", month: "long", year: "numeric" })}
                        </div>
                      )}
                    </div>
                    <a href={caseData.demandLetterUrl} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="outline" className="gap-2">
                        <FileDown className="h-4 w-4" /> Download PDF
                      </Button>
                    </a>
                  </div>
                  {canEdit && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 text-muted-foreground"
                      onClick={handleGenerateLetter}
                      disabled={isGeneratingLetter}
                    >
                      {isGeneratingLetter ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      Regenerate Letter
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    No demand letter has been generated yet. The AI will draft a formal letter on your insurer's letterhead
                    using the claim evidence, causal verdict, and third-party details captured in this case.
                  </p>
                  {canGenerateLetter ? (
                    <Button
                      className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={handleGenerateLetter}
                      disabled={isGeneratingLetter}
                    >
                      {isGeneratingLetter ? (
                        <><Loader2 className="h-4 w-4 animate-spin" /> Generating Draft Letter…</>
                      ) : (
                        <><FileText className="h-4 w-4" /> Generate Draft Demand Letter</>
                      )}
                    </Button>
                  ) : (
                    <div className="text-xs text-muted-foreground italic">
                      Move case to "Open" status to enable demand letter generation.
                    </div>
                  )}
                </div>
              )}
            </Section>

            {/* Settlement notes */}
            {(caseData.settlementNotes || ["settled_full", "settled_partial"].includes(caseData.status)) && (
              <Section title="Settlement Notes">
                <InfoRow label="Settlement Date" value={caseData.settlementAgreementDate} icon={Calendar} />
                <InfoRow label="Demand Response Received" value={caseData.demandResponseReceivedAt} icon={Calendar} />
                {caseData.settlementNotes && (
                  <p className="text-sm text-muted-foreground mt-2">{caseData.settlementNotes}</p>
                )}
              </Section>
            )}

            {/* Prior Cases panel — shown only for repeat offenders */}
            {caseData.isRepeatOffender && priorCases && priorCases.length > 0 && (
              <Section title={`Prior Recovery Cases (${priorCases.length})`}>
                <p className="text-xs text-muted-foreground mb-3">
                  The third party in this case has been involved in {priorCases.length} previous recovery {priorCases.length === 1 ? 'case' : 'cases'} under this insurer.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 pr-3 text-muted-foreground font-medium">Case #</th>
                        <th className="text-left py-2 pr-3 text-muted-foreground font-medium">Claim</th>
                        <th className="text-left py-2 pr-3 text-muted-foreground font-medium">Vehicle</th>
                        <th className="text-left py-2 pr-3 text-muted-foreground font-medium">Incident</th>
                        <th className="text-left py-2 pr-3 text-muted-foreground font-medium">Status</th>
                        <th className="text-right py-2 text-muted-foreground font-medium">Recovered</th>
                      </tr>
                    </thead>
                    <tbody>
                      {priorCases.map((pc) => {
                        const sm = STATUS_META[pc.status] ?? STATUS_META.pending_review;
                        return (
                          <tr key={pc.id} className="border-b border-border/40 hover:bg-muted/30 cursor-pointer" onClick={() => navigate(`/insurer-portal/recovery/${pc.id}`)}>
                            <td className="py-2 pr-3 font-mono text-teal-400">#{pc.id}</td>
                            <td className="py-2 pr-3 text-foreground">{pc.claimNumber ?? '—'}</td>
                            <td className="py-2 pr-3 text-foreground">{pc.vehicleRegistration ?? '—'}</td>
                            <td className="py-2 pr-3 text-muted-foreground">{pc.incidentDate ? new Date(pc.incidentDate).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td>
                            <td className="py-2 pr-3">
                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${sm.color} ${sm.bg}`}>{sm.label}</span>
                            </td>
                            <td className="py-2 text-right text-foreground">
                              {pc.recoveredAmount != null ? `${pc.currencyCode ?? 'USD'} ${(pc.recoveredAmount / 100).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}` : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Section>
            )}
          </div>

          {/* Right column — RPS, status update, notes */}
          <div className="space-y-5">
            {/* RPS card */}
            <div className="rounded-lg border border-border bg-card p-5">
              <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Recovery Potential Score</h3>
              <div className="flex items-center justify-center mb-4">
                <div className="relative w-24 h-24">
                  <svg viewBox="0 0 36 36" className="w-24 h-24 -rotate-90">
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="currentColor" strokeWidth="2" className="text-border" />
                    <circle
                      cx="18" cy="18" r="15.9" fill="none"
                      stroke="currentColor" strokeWidth="2.5"
                      strokeDasharray={`${caseData.recoveryPotentialScore} 100`}
                      strokeLinecap="round"
                      className={rpsColor}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className={`text-2xl font-bold ${rpsColor}`}>{caseData.recoveryPotentialScore}</span>
                  </div>
                </div>
              </div>
              <div className="text-center text-xs text-muted-foreground">
                {caseData.recoveryPotentialScore >= 70 ? "High recovery likelihood" :
                  caseData.recoveryPotentialScore >= 40 ? "Moderate recovery likelihood" :
                  "Low recovery likelihood"}
              </div>
            </div>

            {/* Status update */}
            {canEdit && (
              <div className="rounded-lg border border-border bg-card p-5 space-y-4">
                <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Update Case</h3>
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">Recovery Target Override</label>
                  <Select value={editRecoveryTarget} onValueChange={setEditRecoveryTarget}>
                    <SelectTrigger className="text-sm">
                      <SelectValue placeholder={`Current: ${caseData.recoveryTarget ?? 'unknown'}`} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="insurer">🏢 Pursue Insurer</SelectItem>
                      <SelectItem value="individual">👤 Pursue Individual Directly</SelectItem>
                      <SelectItem value="unknown">❓ Unknown / Not Yet Determined</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Override the AI-determined recovery target. Use when the insurer repudiates or the individual must be pursued directly.</p>
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">Change Status</label>
                  <Select value={editStatus} onValueChange={setEditStatus}>
                    <SelectTrigger className="text-sm">
                      <SelectValue placeholder="Select new status…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending_review">Pending Review</SelectItem>
                      <SelectItem value="under_investigation">Under Investigation</SelectItem>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="demand_sent">Demand Sent</SelectItem>
                      <SelectItem value="disputed_legal">Disputed / Legal</SelectItem>
                      <SelectItem value="settled_full">Settled (Full)</SelectItem>
                      <SelectItem value="settled_partial">Settled (Partial)</SelectItem>
                      <SelectItem value="closed_no_recovery">Closed — No Recovery</SelectItem>
                      <SelectItem value="archived">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {editStatus === "under_investigation" && (
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">Investigation Reason</label>
                    <Textarea
                      value={investigationReason}
                      onChange={(e) => setInvestigationReason(e.target.value)}
                      placeholder="Describe why liability is unresolved (e.g. police investigation ongoing, disputed liability)…"
                      rows={3}
                      className="text-sm resize-none"
                    />
                  </div>
                )}
                {(editStatus === "settled_full" || editStatus === "settled_partial") && (
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">Recovered Amount ({currency})</label>
                    <input
                      type="number"
                      value={recoveredAmount}
                      onChange={(e) => setRecoveredAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">Officer Notes</label>
                  <Textarea
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder={caseData.officerNotes ?? "Add case notes, correspondence log, or action items…"}
                    rows={4}
                    className="text-sm resize-none"
                  />
                </div>
                <Button
                  className="w-full gap-2"
                  onClick={handleSave}
                  disabled={isSaving}
                >
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckSquare className="h-4 w-4" />}
                  Save Changes
                </Button>
              </div>
            )}

            {/* Existing officer notes */}
            {caseData.officerNotes && (
              <div className="rounded-lg border border-border bg-card p-5">
                <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-3">Officer Notes</h3>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{caseData.officerNotes}</p>
              </div>
            )}

            {/* Key dates */}
            <div className="rounded-lg border border-border bg-card p-5">
              <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-3">Key Dates</h3>
              <InfoRow label="Case Opened" value={new Date(caseData.createdAt).toLocaleDateString("en-ZA")} icon={Calendar} />
              <InfoRow label="Recovery Deadline" value={caseData.recoveryDeadline} icon={AlertTriangle} />
              <InfoRow label="Demand Sent" value={caseData.demandLetterSentAt} icon={Send} />
              <InfoRow label="Response Due" value={caseData.demandResponseDueDate} icon={Calendar} />
              <InfoRow label="Case Closed" value={caseData.closedAt} icon={Archive} />
            </div>
          </div>
        </div>
      </div>
    </InsurerPortalLayout>
  );
}
