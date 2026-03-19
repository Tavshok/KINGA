/**
 * IncidentTypeOverrideDialog
 *
 * A modal dialog that allows authorised users (assessors, insurers, admins)
 * to override the AI-detected incident type on a claim.
 *
 * Behaviour:
 *  - Shows the current (AI-detected) incident type
 *  - Lets the user pick a new type from a dropdown
 *  - Requires a mandatory reason (min 5 chars)
 *  - On submit: calls trpc.incidentType.override, then shows the re-validation
 *    result (impact direction + damage consistency) inline
 *  - On success: calls onSuccess so the parent can refresh claim data
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  CheckCircle,
  XCircle,
  Info,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────

type IncidentType =
  | "collision"
  | "theft"
  | "hail"
  | "fire"
  | "vandalism"
  | "flood"
  | "hijacking"
  | "other";

type ValidationStatus = "pass" | "warning" | "fail";

interface RevalidationResult {
  incidentType: IncidentType;
  impactDirection: {
    status: ValidationStatus;
    reportedDamageZones: string[];
    expectedZones: string[];
    inconsistentZones: string[];
    explanation: string;
  };
  damageConsistency: {
    status: ValidationStatus;
    consistentComponents: string[];
    inconsistentComponents: string[];
    explanation: string;
  };
  overallStatus: ValidationStatus;
  summary: string;
  revalidatedAt: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  claimId: number;
  currentIncidentType: string | null | undefined;
  aiDetectedType?: string | null;
  isAlreadyOverridden?: boolean;
  onSuccess?: () => void;
}

// ── Constants ──────────────────────────────────────────────────────────────

const INCIDENT_TYPES: { value: IncidentType; label: string }[] = [
  { value: "collision", label: "Collision" },
  { value: "theft", label: "Theft" },
  { value: "hail", label: "Hail Damage" },
  { value: "fire", label: "Fire" },
  { value: "vandalism", label: "Vandalism" },
  { value: "flood", label: "Flood" },
  { value: "hijacking", label: "Hijacking" },
  { value: "other", label: "Other" },
];

const STATUS_CONFIG: Record<
  ValidationStatus,
  { icon: React.ElementType; colour: string; label: string }
> = {
  pass: { icon: CheckCircle, colour: "text-green-600", label: "Pass" },
  warning: { icon: AlertTriangle, colour: "text-amber-500", label: "Warning" },
  fail: { icon: XCircle, colour: "text-red-500", label: "Fail" },
};

// ── Component ──────────────────────────────────────────────────────────────

export function IncidentTypeOverrideDialog({
  open,
  onOpenChange,
  claimId,
  currentIncidentType,
  aiDetectedType,
  isAlreadyOverridden = false,
  onSuccess,
}: Props) {
  const [selectedType, setSelectedType] = useState<IncidentType | "">("");
  const [reason, setReason] = useState("");
  const [revalidation, setRevalidation] = useState<RevalidationResult | null>(null);
  const [overrideSuccess, setOverrideSuccess] = useState(false);

  const overrideMutation = trpc.incidentType.override.useMutation({
    onSuccess: (data) => {
      setRevalidation(data.revalidation as RevalidationResult);
      setOverrideSuccess(true);
      onSuccess?.();
    },
  });

  const handleSubmit = () => {
    if (!selectedType || reason.trim().length < 5) return;
    overrideMutation.mutate({
      claimId,
      newType: selectedType as IncidentType,
      reason: reason.trim(),
    });
  };

  const handleClose = () => {
    if (!overrideMutation.isPending) {
      setSelectedType("");
      setReason("");
      setRevalidation(null);
      setOverrideSuccess(false);
      onOpenChange(false);
    }
  };

  const canSubmit =
    selectedType !== "" &&
    selectedType !== currentIncidentType &&
    reason.trim().length >= 5 &&
    !overrideMutation.isPending &&
    !overrideSuccess;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-500" />
            Override Incident Type
          </DialogTitle>
          <DialogDescription>
            Manually correct the incident classification. The original AI-detected
            value will be preserved in the audit trail.
          </DialogDescription>
        </DialogHeader>

        {/* ── Current / AI-detected values ── */}
        <div className="rounded-md border border-border bg-muted/40 p-3 text-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Current type</span>
            <Badge variant="outline" className="capitalize">
              {currentIncidentType ?? "Unknown"}
            </Badge>
          </div>
          {isAlreadyOverridden && aiDetectedType && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground flex items-center gap-1">
                <Info className="h-3 w-3" />
                AI-detected (original)
              </span>
              <Badge variant="secondary" className="capitalize">
                {aiDetectedType}
              </Badge>
            </div>
          )}
        </div>

        {/* ── Form ── */}
        {!overrideSuccess && (
          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label htmlFor="new-type">New incident type</Label>
              <Select
                value={selectedType}
                onValueChange={(v) => setSelectedType(v as IncidentType)}
              >
                <SelectTrigger id="new-type">
                  <SelectValue placeholder="Select corrected type…" />
                </SelectTrigger>
                <SelectContent>
                  {INCIDENT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reason">
                Reason for override{" "}
                <span className="text-muted-foreground font-normal">(required)</span>
              </Label>
              <Textarea
                id="reason"
                placeholder="Describe why the AI classification is incorrect…"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className="resize-none"
              />
              {reason.length > 0 && reason.trim().length < 5 && (
                <p className="text-xs text-red-500">
                  Please provide at least 5 characters.
                </p>
              )}
            </div>

            {overrideMutation.isError && (
              <div className="rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-400">
                {overrideMutation.error?.message ?? "Override failed. Please try again."}
              </div>
            )}
          </div>
        )}

        {/* ── Re-validation results ── */}
        {revalidation && (
          <div className="space-y-3 pt-1">
            <div className="flex items-center gap-2 text-sm font-medium">
              <RefreshCw className="h-4 w-4 text-muted-foreground" />
              Re-validation Results
              <OverallStatusBadge status={revalidation.overallStatus} />
            </div>

            {/* Summary */}
            <p className="text-sm text-muted-foreground">{revalidation.summary}</p>

            {/* Impact direction */}
            <ValidationSection
              title="Impact Direction"
              result={revalidation.impactDirection}
              inconsistentItems={revalidation.impactDirection.inconsistentZones}
              inconsistentLabel="Unexpected zones"
            />

            {/* Damage consistency */}
            <ValidationSection
              title="Damage Consistency"
              result={revalidation.damageConsistency}
              inconsistentItems={revalidation.damageConsistency.inconsistentComponents}
              inconsistentLabel="Inconsistent components"
            />
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose} disabled={overrideMutation.isPending}>
            {overrideSuccess ? "Close" : "Cancel"}
          </Button>
          {!overrideSuccess && (
            <Button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="gap-2"
            >
              {overrideMutation.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Validating…
                </>
              ) : (
                "Apply Override"
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function OverallStatusBadge({ status }: { status: ValidationStatus }) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <span className={`flex items-center gap-1 text-xs font-medium ${cfg.colour}`}>
      <Icon className="h-3.5 w-3.5" />
      {cfg.label}
    </span>
  );
}

function ValidationSection({
  title,
  result,
  inconsistentItems,
  inconsistentLabel,
}: {
  title: string;
  result: { status: ValidationStatus; explanation: string };
  inconsistentItems: string[];
  inconsistentLabel: string;
}) {
  const cfg = STATUS_CONFIG[result.status];
  const Icon = cfg.icon;
  return (
    <div className="rounded-md border border-border p-3 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground">{title}</span>
        <span className={`flex items-center gap-1 text-xs ${cfg.colour}`}>
          <Icon className="h-3.5 w-3.5" />
          {cfg.label}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{result.explanation}</p>
      {inconsistentItems.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-0.5">
          <span className="text-xs text-muted-foreground">{inconsistentLabel}:</span>
          {inconsistentItems.map((item) => (
            <Badge key={item} variant="destructive" className="text-xs px-1.5 py-0">
              {item}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
