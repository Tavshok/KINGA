/**
 * ClaimApprovalToolbar
 *
 * Shows the current approval stage for a claim and lets the current user
 * act on it (approve / return / reject) if they have the matching insurer role.
 *
 * Role-based visibility:
 * - Only shows action buttons to users whose insurerRole matches the current stage's role_key
 * - Admins can act on any stage
 * - Read-only progress view shown to all other roles
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  CheckCircle2,
  XCircle,
  RotateCcw,
  Clock,
  AlertTriangle,
  ChevronRight,
  Loader2,
  ShieldCheck,
  User,
} from "lucide-react";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  claims_processor: "Claims Processor",
  internal_assessor: "Internal Assessor",
  external_assessor: "External Assessor",
  risk_manager: "Risk Manager",
  claims_manager: "Claims Manager",
  executive: "Executive / GM",
  underwriter: "Underwriter",
};

const STATUS_CONFIG = {
  pending: { label: "Pending", color: "bg-gray-100 text-gray-700", icon: Clock },
  in_progress: { label: "In Progress", color: "bg-blue-100 text-blue-700", icon: Clock },
  approved: { label: "Approved", color: "bg-green-100 text-green-700", icon: CheckCircle2 },
  rejected: { label: "Rejected", color: "bg-red-100 text-red-700", icon: XCircle },
  returned: { label: "Returned", color: "bg-yellow-100 text-yellow-700", icon: RotateCcw },
};

// ─── Action Dialog ─────────────────────────────────────────────────────────────

function ActionDialog({
  trigger,
  title,
  description,
  actionLabel,
  actionVariant,
  notesRequired,
  onConfirm,
  isLoading,
}: {
  trigger: React.ReactNode;
  title: string;
  description: string;
  actionLabel: string;
  actionVariant: "default" | "destructive" | "outline";
  notesRequired: boolean;
  onConfirm: (notes: string) => void;
  isLoading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");

  const handleConfirm = () => {
    if (notesRequired && !notes.trim()) return;
    onConfirm(notes);
    setOpen(false);
    setNotes("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label className="text-sm">
              Notes {notesRequired ? <span className="text-destructive">*</span> : "(optional)"}
            </Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={notesRequired ? "Notes are required for this action..." : "Add any relevant notes..."}
              rows={3}
              className="mt-1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant={actionVariant}
            onClick={handleConfirm}
            disabled={isLoading || (notesRequired && !notes.trim())}
          >
            {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Stage Progress Bar ────────────────────────────────────────────────────────

function StageProgressBar({
  stages,
  completedOrders,
  currentOrder,
}: {
  stages: Array<{ stage_order: number; stage_name: string; role_key: string; required: boolean }>;
  completedOrders: Set<number>;
  currentOrder: number | null;
}) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {stages.map((stage, i) => {
        const isComplete = completedOrders.has(stage.stage_order);
        const isCurrent = stage.stage_order === currentOrder;
        return (
          <div key={i} className="flex items-center gap-1">
            <div
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-all ${
                isComplete
                  ? "bg-green-100 text-green-700"
                  : isCurrent
                  ? "bg-blue-100 text-blue-700 ring-2 ring-blue-300"
                  : "bg-gray-100 text-gray-500"
              } ${!stage.required ? "opacity-70 border border-dashed border-current" : ""}`}
            >
              {isComplete ? (
                <CheckCircle2 className="h-3 w-3" />
              ) : isCurrent ? (
                <Clock className="h-3 w-3" />
              ) : (
                <span className="h-3 w-3 rounded-full border border-current inline-block" />
              )}
              <span>{ROLE_LABELS[stage.role_key] ?? stage.role_key}</span>
            </div>
            {i < stages.length - 1 && (
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function ClaimApprovalToolbar({ claimId }: { claimId: number }) {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const { data: status, isLoading } = trpc.approval.getClaimApprovalStatus.useQuery(
    { claim_id: claimId },
    { refetchOnWindowFocus: false }
  );

  const submitDecision = trpc.approval.submitApprovalDecision.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      utils.approval.getClaimApprovalStatus.invalidate({ claim_id: claimId });
      utils.approval.getApprovalHistory.invalidate({ claim_id: claimId });
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!status) return null;

  const userRole = (user as any)?.role ?? "user";
  const userInsurerRole = (user as any)?.insurerRole ?? "";
  const isAdmin = userRole === "admin";

  const currentStage = status.current_stage as {
    stage_order: number;
    stage_name: string;
    role_key: string;
    required: boolean;
    can_reject: boolean;
    can_request_info: boolean;
    notes_required: boolean;
    description?: string;
  } | null;

  const canAct =
    currentStage !== null &&
    status.overall_status !== "approved" &&
    status.overall_status !== "rejected" &&
    (isAdmin || userInsurerRole === currentStage?.role_key);

  const completedOrders = new Set(
    (status.completed_stages as Array<{ stage_order: number }>).map((s) => s.stage_order)
  );

  const allStages = [
    ...status.completed_stages,
    ...(currentStage ? [currentStage] : []),
    ...status.pending_stages.filter(
      (s: { stage_order: number }) => s.stage_order !== currentStage?.stage_order
    ),
    ...status.optional_stages,
  ] as Array<{ stage_order: number; stage_name: string; role_key: string; required: boolean }>;

  const handleDecision = (
    decision: "approved" | "rejected" | "returned",
    notes: string
  ) => {
    if (!currentStage) return;
    submitDecision.mutate({
      claim_id: claimId,
      stage_order: currentStage.stage_order,
      stage_name: currentStage.stage_name,
      role_key: currentStage.role_key as any,
      decision,
      notes,
    });
  };

  const overallCfg = STATUS_CONFIG[status.overall_status] ?? STATUS_CONFIG.pending;
  const OverallIcon = overallCfg.icon;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Approval Workflow</CardTitle>
          </div>
          <Badge className={`${overallCfg.color} flex items-center gap-1 text-xs`}>
            <OverallIcon className="h-3 w-3" />
            {overallCfg.label}
          </Badge>
        </div>
        <CardDescription className="text-xs">
          {status.completed_required_count} of {status.required_stages_count} required stages
          complete · Template: {status.template_name}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Stage progress */}
        <StageProgressBar
          stages={allStages}
          completedOrders={completedOrders}
          currentOrder={currentStage?.stage_order ?? null}
        />

        {/* Current stage info */}
        {currentStage && status.overall_status !== "approved" && status.overall_status !== "rejected" && (
          <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-blue-800">
              <Clock className="h-4 w-4" />
              Awaiting: {currentStage.stage_name}
            </div>
            <div className="flex items-center gap-2 text-xs text-blue-700">
              <User className="h-3 w-3" />
              Role required: <strong>{ROLE_LABELS[currentStage.role_key] ?? currentStage.role_key}</strong>
            </div>
            {currentStage.description && (
              <p className="text-xs text-blue-600">{currentStage.description}</p>
            )}
          </div>
        )}

        {/* Approved banner */}
        {status.overall_status === "approved" && (
          <div className="rounded-lg bg-green-50 border border-green-200 p-3 flex items-center gap-2 text-green-800 text-sm font-medium">
            <CheckCircle2 className="h-4 w-4" />
            All required approval stages complete. Claim is ready for export.
          </div>
        )}

        {/* Rejected banner */}
        {status.overall_status === "rejected" && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 flex items-center gap-2 text-red-800 text-sm font-medium">
            <XCircle className="h-4 w-4" />
            Claim has been rejected at an approval stage.
          </div>
        )}

        {/* Action buttons — only shown to the user whose role matches */}
        {canAct && currentStage && (
          <div className="flex items-center gap-2 pt-1">
            <ActionDialog
              trigger={
                <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white">
                  <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
                </Button>
              }
              title="Approve this stage"
              description={`You are approving stage ${currentStage.stage_order}: "${currentStage.stage_name}". The claim will advance to the next stage.`}
              actionLabel="Confirm Approval"
              actionVariant="default"
              notesRequired={currentStage.notes_required}
              onConfirm={(notes) => handleDecision("approved", notes)}
              isLoading={submitDecision.isPending}
            />

            {currentStage.can_request_info && (
              <ActionDialog
                trigger={
                  <Button size="sm" variant="outline" className="border-yellow-400 text-yellow-700 hover:bg-yellow-50">
                    <RotateCcw className="h-4 w-4 mr-1" /> Return
                  </Button>
                }
                title="Return for revision"
                description="Return the claim to the previous handler for additional information or corrections."
                actionLabel="Return Claim"
                actionVariant="outline"
                notesRequired={true}
                onConfirm={(notes) => handleDecision("returned", notes)}
                isLoading={submitDecision.isPending}
              />
            )}

            {currentStage.can_reject && (
              <ActionDialog
                trigger={
                  <Button size="sm" variant="destructive">
                    <XCircle className="h-4 w-4 mr-1" /> Reject
                  </Button>
                }
                title="Reject this claim"
                description="This will permanently reject the claim at this stage. This action cannot be undone."
                actionLabel="Confirm Rejection"
                actionVariant="destructive"
                notesRequired={true}
                onConfirm={(notes) => handleDecision("rejected", notes)}
                isLoading={submitDecision.isPending}
              />
            )}
          </div>
        )}

        {/* Not your stage notice */}
        {!canAct && currentStage && status.overall_status === "in_progress" && (
          <p className="text-xs text-muted-foreground">
            {isAdmin
              ? "You can act on any stage as admin."
              : `This stage requires a user with the "${ROLE_LABELS[currentStage.role_key] ?? currentStage.role_key}" role.`}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
