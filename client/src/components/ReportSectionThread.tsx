/**
 * ReportSectionThread
 *
 * A collapsible annotation panel that anchors to a specific report section.
 * Renders existing annotations and provides a compose box for new ones.
 *
 * Design principles:
 * - Screen-only (hidden in @media print via CSS class "no-print")
 * - Minimal footprint when collapsed — just a small badge showing annotation count
 * - Expands inline below the section header, never overlays content
 * - Severity colour coding matches the ForensicAuditReport design tokens
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { MessageSquare, ChevronDown, ChevronUp, CheckCircle, AlertTriangle, XCircle, Info, ShieldAlert, ClipboardCheck } from "lucide-react";
import type { AnnotationSeverity, AnnotationDisposition } from "../../../shared/report-section-keys";

interface ReportSectionThreadProps {
  claimId: number;
  sectionKey: string;
  pipelineRunId?: number;
  /** If true the compose box is hidden (read-only mode, e.g. for external share) */
  readOnly?: boolean;
}

const SEVERITY_CONFIG: Record<
  AnnotationSeverity,
  { label: string; colour: string; icon: React.ReactNode }
> = {
  info:        { label: "Info",        colour: "#3b82f6", icon: <Info size={12} /> },
  warning:     { label: "Warning",     colour: "#f59e0b", icon: <AlertTriangle size={12} /> },
  critical:    { label: "Critical",    colour: "#ef4444", icon: <XCircle size={12} /> },
  fraud_risk:  { label: "Fraud Risk",  colour: "#7c3aed", icon: <ShieldAlert size={12} /> },
  compliance:  { label: "Compliance",  colour: "#0891b2", icon: <ClipboardCheck size={12} /> },
};

const DISPOSITION_LABELS: Record<AnnotationDisposition, string> = {
  accepted:        "Accepted",
  rejected:        "Rejected",
  needs_more_info: "Needs More Info",
  resolved:        "Resolved",
  escalated:       "Escalated",
};

function formatRelativeTime(dateStr: string): string {
  const d = new Date(dateStr);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return d.toLocaleDateString();
}

export function ReportSectionThread({
  claimId,
  sectionKey,
  pipelineRunId,
  readOnly = false,
}: ReportSectionThreadProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [severity, setSeverity] = useState<AnnotationSeverity>("info");
  const [blocksApproval, setBlocksApproval] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.comments.listSectionComments.useQuery(
    { claimId, sectionKey, pipelineRunId },
    { enabled: open }
  );

  const addAnnotation = trpc.comments.addSectionComment.useMutation({
    onSuccess: () => {
      utils.comments.listSectionComments.invalidate({ claimId, sectionKey });
      setContent("");
      setSeverity("info");
      setBlocksApproval(false);
      setSubmitting(false);
    },
    onError: () => setSubmitting(false),
  });

  const resolveAnnotation = trpc.comments.resolveAnnotation.useMutation({
    onSuccess: () => utils.comments.listSectionComments.invalidate({ claimId, sectionKey }),
  });

  const annotations = data?.annotations ?? [];
  const historicalCount = data?.historicalCount ?? 0;
  const totalCount = annotations.length;

  // Severity badge counts for collapsed state
  const criticalCount = annotations.filter(
    (a) => ["critical", "fraud_risk"].includes(a.severity) && !a.isResolved
  ).length;
  const unresolvedCount = annotations.filter((a) => !a.isResolved).length;

  const handleSubmit = () => {
    if (!content.trim()) return;
    setSubmitting(true);
    addAnnotation.mutate({
      claimId,
      sectionKey,
      pipelineRunId,
      content: content.trim(),
      severity,
      blocksApproval,
    });
  };

  return (
    <div
      className="no-print"
      id={`section-${sectionKey}`}
      style={{ marginTop: "6px", marginBottom: "2px" }}
    >
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "3px 8px",
              borderRadius: "4px",
              border: "1px solid",
              borderColor: criticalCount > 0 ? "#ef4444" : unresolvedCount > 0 ? "#f59e0b" : "#d1d5db",
              background: criticalCount > 0 ? "#fef2f2" : unresolvedCount > 0 ? "#fffbeb" : "#f9fafb",
              cursor: "pointer",
              fontSize: "11px",
              color: criticalCount > 0 ? "#dc2626" : unresolvedCount > 0 ? "#d97706" : "#6b7280",
              fontFamily: "inherit",
            }}
          >
            <MessageSquare size={11} />
            {totalCount === 0 ? (
              <span>Add note</span>
            ) : (
              <span>
                {totalCount} note{totalCount !== 1 ? "s" : ""}
                {unresolvedCount > 0 && ` · ${unresolvedCount} open`}
              </span>
            )}
            {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div
            style={{
              marginTop: "8px",
              border: "1px solid #e5e7eb",
              borderRadius: "6px",
              background: "#ffffff",
              padding: "12px",
              fontSize: "12px",
              fontFamily: "Inter, system-ui, sans-serif",
            }}
          >
            {/* Existing annotations */}
            {isLoading && (
              <p style={{ color: "#9ca3af", marginBottom: "8px" }}>Loading…</p>
            )}

            {annotations.length > 0 && (
              <div style={{ marginBottom: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
                {annotations.map((ann) => {
                  const cfg = SEVERITY_CONFIG[ann.severity as AnnotationSeverity] ?? SEVERITY_CONFIG.info;
                  return (
                    <div
                      key={ann.id}
                      style={{
                        padding: "8px 10px",
                        borderLeft: `3px solid ${cfg.colour}`,
                        background: ann.isResolved ? "#f9fafb" : "#ffffff",
                        borderRadius: "0 4px 4px 0",
                        opacity: ann.isResolved ? 0.65 : 1,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px", flexWrap: "wrap" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "3px", color: cfg.colour, fontWeight: 600 }}>
                          {cfg.icon} {cfg.label}
                        </span>
                        {ann.blocksApproval === 1 && !ann.isResolved && (
                          <span style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fca5a5", borderRadius: "3px", padding: "0 5px", fontSize: "10px", fontWeight: 600 }}>
                            BLOCKS APPROVAL
                          </span>
                        )}
                        {ann.isResolved && ann.disposition && (
                          <span style={{ background: "#f0fdf4", color: "#16a34a", border: "1px solid #86efac", borderRadius: "3px", padding: "0 5px", fontSize: "10px" }}>
                            ✓ {DISPOSITION_LABELS[ann.disposition as AnnotationDisposition] ?? ann.disposition}
                          </span>
                        )}
                        <span style={{ color: "#9ca3af", marginLeft: "auto", fontSize: "10px" }}>
                          {ann.userRole?.replace(/_/g, " ")} · {formatRelativeTime(ann.createdAt)}
                        </span>
                      </div>
                      <p style={{ margin: 0, color: "#374151", lineHeight: 1.5 }}>{ann.content}</p>
                      {/* Resolve button — only show if unresolved and user has permission */}
                      {!ann.isResolved && !readOnly && (
                        <button
                          onClick={() =>
                            resolveAnnotation.mutate({ commentId: ann.id, disposition: "resolved" })
                          }
                          style={{
                            marginTop: "6px",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            fontSize: "10px",
                            color: "#16a34a",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            padding: 0,
                            fontFamily: "inherit",
                          }}
                        >
                          <CheckCircle size={10} /> Mark resolved
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {historicalCount > 0 && (
              <p style={{ color: "#9ca3af", fontSize: "10px", marginBottom: "8px" }}>
                + {historicalCount} annotation{historicalCount !== 1 ? "s" : ""} from earlier assessment run{historicalCount !== 1 ? "s" : ""}
              </p>
            )}

            {/* Compose box */}
            {!readOnly && (
              <div style={{ borderTop: annotations.length > 0 ? "1px solid #f3f4f6" : "none", paddingTop: annotations.length > 0 ? "10px" : 0 }}>
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Add an annotation to this section…"
                  rows={2}
                  style={{ fontSize: "12px", resize: "vertical", marginBottom: "8px" }}
                />
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <Select value={severity} onValueChange={(v) => setSeverity(v as AnnotationSeverity)}>
                    <SelectTrigger style={{ width: "130px", height: "28px", fontSize: "11px" }}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(SEVERITY_CONFIG) as AnnotationSeverity[]).map((s) => (
                        <SelectItem key={s} value={s} style={{ fontSize: "11px" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                            {SEVERITY_CONFIG[s].icon} {SEVERITY_CONFIG[s].label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <label style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", color: "#374151", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={blocksApproval}
                      onChange={(e) => setBlocksApproval(e.target.checked)}
                      style={{ width: "12px", height: "12px" }}
                    />
                    Blocks approval
                  </label>

                  <Button
                    size="sm"
                    onClick={handleSubmit}
                    disabled={!content.trim() || submitting}
                    style={{ height: "28px", fontSize: "11px", marginLeft: "auto" }}
                  >
                    {submitting ? "Saving…" : "Add note"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
