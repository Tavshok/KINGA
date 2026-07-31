/**
 * EngineerAssignments.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Epic 3 — E3-T12
 *
 * Engineering Workspace — Assignments
 * Shows pending and upcoming inspections with accept/decline actions.
 */
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  HardHat, MapPin, Calendar, ArrowRight, CheckCircle, XCircle, Clock,
} from "lucide-react";
import { toast } from "sonner";

const INSPECTION_TYPE_LABELS: Record<string, string> = {
  motor_vehicle:   "Motor Vehicle",
  property:        "Property",
  equipment:       "Equipment",
  industrial:      "Industrial",
  infrastructure:  "Infrastructure",
  marine:          "Marine",
  aviation:        "Aviation",
  general:         "General",
};

export default function EngineerAssignments() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const { data, isLoading, refetch } = trpc.inspections.list.useQuery({
    page: 1,
    pageSize: 50,
  });

  const updateStatus = trpc.inspections.updateStatus.useMutation({
    onSuccess: () => {
      utils.inspections.list.invalidate();
      toast.success("Inspection status updated.");
    },
    onError: (err) => toast.error(err.message),
  });

  const inspections = (data?.inspections ?? []) as Record<string, unknown>[];
  const pending  = inspections.filter((i) => i.status === "assigned");
  const active   = inspections.filter((i) => i.status === "in_progress");
  const upcoming = inspections.filter((i) => {
    if (!i.scheduled_date) return false;
    return new Date(String(i.scheduled_date)) > new Date() && i.status === "assigned";
  });

  function InspectionCard({ insp }: { insp: Record<string, unknown> }) {
    const isPending = insp.status === "assigned";
    return (
      <div
        style={{
          background: "#fff",
          border: "1px solid #e8e8e8",
          borderRadius: "8px",
          padding: "16px 20px",
          display: "flex",
          alignItems: "center",
          gap: "16px",
          cursor: "pointer",
        }}
        onClick={() => setLocation(`/engineer/inspections/${insp.id}`)}
      >
        {/* Icon */}
        <div
          style={{
            width: "40px",
            height: "40px",
            borderRadius: "8px",
            background: "#0F1A1415",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <HardHat size={18} style={{ color: "#0F1A14" }} />
        </div>

        {/* Details */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
            <span style={{ fontSize: "13px", fontWeight: 700, color: "#111" }}>
              {String(insp.inspection_ref ?? "—")}
            </span>
            <span
              style={{
                fontSize: "10px",
                fontWeight: 600,
                color: "#888",
                background: "#f0f0f0",
                padding: "2px 8px",
                borderRadius: "10px",
                textTransform: "uppercase",
              }}
            >
              {INSPECTION_TYPE_LABELS[String(insp.inspection_type ?? "")] ?? String(insp.inspection_type ?? "—")}
            </span>
          </div>
          <div style={{ fontSize: "13px", color: "#444", marginBottom: "6px" }}>
            {String((insp as Record<string,unknown>).vehicle_registration ?? (insp as Record<string,unknown>).asset_ref ?? "Asset not specified")}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            {Boolean((insp as Record<string,unknown>).location_address) && (
              <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", color: "#888" }}>
                <MapPin size={11} />
                {String((insp as Record<string,unknown>).location_address ?? '').substring(0, 40)}
              </span>
            )}
            {Boolean((insp as Record<string,unknown>).scheduled_date) && (
              <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", color: "#888" }}>
                <Calendar size={11} />
                {(insp as Record<string,unknown>).scheduled_date ? new Date(String((insp as Record<string,unknown>).scheduled_date)).toLocaleDateString() : ''}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
          {isPending && (
            <>
              <Button
                size="sm"
                variant="outline"
                style={{ fontSize: "12px", color: "#e74c3c", borderColor: "#e74c3c" }}
                onClick={(e) => {
                  e.stopPropagation();
                  updateStatus.mutate({ inspectionId: Number(insp.id), status: "cancelled" });
                }}
              >
                <XCircle size={12} style={{ marginRight: 4 }} />
                Decline
              </Button>
              <Button
                size="sm"
                style={{ fontSize: "12px", background: "#0F1A14", color: "#D4A800", border: "none" }}
                onClick={(e) => {
                  e.stopPropagation();
                  updateStatus.mutate({ inspectionId: Number(insp.id), status: "in_progress" });
                }}
              >
                <CheckCircle size={12} style={{ marginRight: 4 }} />
                Accept
              </Button>
            </>
          )}
          {!isPending && (
            <ArrowRight size={14} style={{ color: "#ccc" }} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "32px", fontFamily: "Inter, sans-serif" }}>
      {/* Header */}
      <div style={{ marginBottom: "28px" }}>
        <div style={{ fontSize: "11px", color: "#888", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "4px" }}>
          Engineering Workspace
        </div>
        <h1 style={{ fontSize: "24px", fontWeight: 700, color: "#111", margin: 0 }}>
          My Assignments
        </h1>
        <p style={{ fontSize: "14px", color: "#666", margin: "4px 0 0" }}>
          Pending acceptance and active inspections.
        </p>
      </div>

      {isLoading ? (
        <div style={{ padding: "40px", textAlign: "center", color: "#888" }}>Loading…</div>
      ) : (
        <>
          {/* Pending acceptance */}
          <section style={{ marginBottom: "32px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
              <Clock size={14} style={{ color: "#f39c12" }} />
              <h2 style={{ fontSize: "14px", fontWeight: 700, color: "#111", margin: 0 }}>
                Awaiting Acceptance
              </h2>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  background: "#f39c12",
                  color: "#fff",
                  padding: "1px 8px",
                  borderRadius: "10px",
                }}
              >
                {pending.length}
              </span>
            </div>
            {pending.length === 0 ? (
              <p style={{ fontSize: "13px", color: "#aaa", margin: 0 }}>No pending assignments.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {pending.map((insp) => (
                  <InspectionCard key={String(insp.id)} insp={insp} />
                ))}
              </div>
            )}
          </section>

          {/* Active */}
          <section style={{ marginBottom: "32px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
              <HardHat size={14} style={{ color: "#27ae60" }} />
              <h2 style={{ fontSize: "14px", fontWeight: 700, color: "#111", margin: 0 }}>
                Active Inspections
              </h2>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  background: "#27ae60",
                  color: "#fff",
                  padding: "1px 8px",
                  borderRadius: "10px",
                }}
              >
                {active.length}
              </span>
            </div>
            {active.length === 0 ? (
              <p style={{ fontSize: "13px", color: "#aaa", margin: 0 }}>No active inspections.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {active.map((insp) => (
                  <InspectionCard key={String(insp.id)} insp={insp} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
