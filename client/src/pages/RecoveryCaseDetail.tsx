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
import {
  Scale, ArrowLeft, FileText, Send, CheckSquare, Gavel, Archive,
  Search, Activity, ClipboardList, AlertTriangle, Car, Phone,
  Building2, Hash, Calendar, DollarSign, User, MapPin, FileDown,
  Loader2, RefreshCw, Shield, TrendingUp,
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
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingLetter, setIsGeneratingLetter] = useState(false);

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

  const handleSave = () => {
    if (!editStatus && !editNotes && !recoveredAmount && !investigationReason) {
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
    });
  };

  const handleGenerateLetter = () => {
    setIsGeneratingLetter(true);
    generateDemandLetter.mutate({ id: caseId });
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
          <Button variant="ghost" size="icon" onClick={() => refetch()} title="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {/* Prescription warning */}
        {caseData.prescriptionDeadline && (() => {
          const daysLeft = Math.ceil((new Date(caseData.prescriptionDeadline).getTime() - Date.now()) / 86400000);
          if (daysLeft > 90) return null;
          return (
            <div className={`rounded-lg border p-4 flex gap-3 ${daysLeft <= 30 ? "border-rose-500/30 bg-rose-500/5" : "border-amber-500/30 bg-amber-500/5"}`}>
              <AlertTriangle className={`h-5 w-5 flex-shrink-0 mt-0.5 ${daysLeft <= 30 ? "text-rose-400" : "text-amber-400"}`} />
              <div className="text-sm">
                <span className={`font-semibold ${daysLeft <= 30 ? "text-rose-400" : "text-amber-400"}`}>
                  Prescription deadline: {new Date(caseData.prescriptionDeadline).toLocaleDateString("en-ZA", { day: "2-digit", month: "long", year: "numeric" })}
                </span>
                <span className="text-muted-foreground ml-2">({daysLeft} day{daysLeft !== 1 ? "s" : ""} remaining)</span>
              </div>
            </div>
          );
        })()}

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
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs text-muted-foreground">Wronged Party:</span>
                <span className={`text-sm font-semibold ${wrongedMeta.color}`}>{wrongedMeta.label}</span>
                {caseData.thirdPartyLiabilityPct != null && caseData.thirdPartyLiabilityPct > 0 && (
                  <span className="text-xs text-muted-foreground ml-1">({caseData.thirdPartyLiabilityPct}% third-party liability)</span>
                )}
              </div>
              <InfoRow label="Third-Party Name" value={caseData.thirdPartyName ?? caseData.thirdPartyNameFromClaim} icon={User} />
              <InfoRow label="Third-Party Vehicle Registration" value={caseData.thirdPartyRegistration ?? caseData.thirdPartyRegistrationFromClaim} icon={Car} />
              <InfoRow label="Third-Party Insurer" value={caseData.thirdPartyInsurer ?? caseData.thirdPartyInsurerFromClaim} icon={Building2} />
              <InfoRow label="Third-Party Policy Number" value={caseData.thirdPartyPolicyNumber} icon={Hash} />
              {caseData.thirdPartyContactDetails && (
                <InfoRow label="Contact Details" value={caseData.thirdPartyContactDetails} icon={Phone} />
              )}
            </Section>

            {/* Investigation notes (if under investigation) */}
            {caseData.status === "under_investigation" && (
              <Section title="Investigation Status">
                <InfoRow label="Reason for Investigation" value={caseData.investigationReason} icon={Search} />
                <InfoRow label="Expected Resolution Date" value={caseData.investigationExpectedResolutionDate} icon={Calendar} />
                <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-300">
                  This case is on hold pending liability determination. Update the status to "Open" once liability is confirmed
                  and third-party details are verified. The prescription clock is still running.
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
              <InfoRow label="Prescription Deadline" value={caseData.prescriptionDeadline} icon={AlertTriangle} />
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
