/**
 * EngineerDashboard.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Epic 3 — E3-T11
 *
 * Engineering Workspace — Dashboard
 * Shows KPIs, active inspections, recent activity, and quick actions.
 */
import { useState } from "react";
import { EngineeringIntelligencePanel } from "@/components/EngineeringIntelligencePanel";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  HardHat, ClipboardList, CheckCircle, Clock, AlertTriangle,
  Plus, ArrowRight, Ruler, Eye, Brain,
} from "lucide-react";
import { toast } from "sonner";

const STATUS_COLOURS: Record<string, string> = {
  assigned:           "#2980b9",
  in_progress:        "#f39c12",
  measurements_done:  "#8e44ad",
  observations_done:  "#16a085",
  ai_analysed:        "#27ae60",
  physics_reconciled: "#1abc9c",
  under_review:       "#e67e22",
  complete:           "#27ae60",
  cancelled:          "#95a5a6",
};

const STATUS_LABELS: Record<string, string> = {
  assigned:           "Assigned",
  in_progress:        "In Progress",
  measurements_done:  "Measurements Done",
  observations_done:  "Observations Done",
  ai_analysed:        "AI Analysed",
  physics_reconciled: "Physics Reconciled",
  under_review:       "Under Review",
  complete:           "Complete",
  cancelled:          "Cancelled",
};

function statusBadge(status: string) {
  const colour = STATUS_COLOURS[status] ?? "#888";
  const label  = STATUS_LABELS[status] ?? status;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: "12px",
        background: colour + "22",
        color: colour,
        fontSize: "11px",
        fontWeight: 600,
        border: `1px solid ${colour}44`,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

export default function EngineerDashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const { data: listData, isLoading } = trpc.inspections.list.useQuery({
    page: 1,
    pageSize: 20,
  });

  const inspections = (listData?.inspections ?? []) as Record<string, unknown>[];

  // KPI counts
  const active    = inspections.filter((i: Record<string, unknown>) => !["complete","cancelled"].includes(String(i.status ?? ""))).length;
  const complete  = inspections.filter((i: Record<string, unknown>) => i.status === "complete").length;
  const overdue   = inspections.filter((i: Record<string, unknown>) => {
    if (!i.scheduled_date) return false;
    return new Date(String(i.scheduled_date)) < new Date() && !["complete","cancelled"].includes(String(i.status ?? ""));
  }).length;

  return (
    <div style={{ padding: "32px", fontFamily: "Inter, sans-serif" }}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: "28px" }}>
        <div style={{ fontSize: "11px", color: "#888", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "4px" }}>
          Engineering Workspace
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ fontSize: "24px", fontWeight: 700, color: "#111", margin: 0 }}>
              Good day, {user?.name?.split(" ")[0] ?? "Engineer"}
            </h1>
            <p style={{ fontSize: "14px", color: "#666", margin: "4px 0 0" }}>
              Here is your inspection workspace overview.
            </p>
          </div>
          <Button
            onClick={() => setLocation("/engineer/inspections")}
            style={{ background: "#0F1A14", color: "#D4A800", border: "none", fontWeight: 600 }}
          >
            <Plus size={14} style={{ marginRight: 6 }} />
            New Inspection
          </Button>
        </div>
      </div>

      {/* ── KPI Strip ──────────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px", marginBottom: "32px" }}>
        {[
          { label: "Total Assigned",   value: inspections.length, icon: ClipboardList, colour: "#2980b9" },
          { label: "Active",           value: active,             icon: HardHat,       colour: "#f39c12" },
          { label: "Completed",        value: complete,           icon: CheckCircle,   colour: "#27ae60" },
          { label: "Overdue",          value: overdue,            icon: AlertTriangle, colour: "#e74c3c" },
        ].map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div
              key={kpi.label}
              style={{
                background: "#fff",
                border: "1px solid #e8e8e8",
                borderRadius: "8px",
                padding: "20px",
                display: "flex",
                alignItems: "center",
                gap: "16px",
              }}
            >
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "8px",
                  background: kpi.colour + "18",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Icon size={18} style={{ color: kpi.colour }} />
              </div>
              <div>
                <div style={{ fontSize: "24px", fontWeight: 700, color: "#111", lineHeight: 1 }}>
                  {isLoading ? "—" : kpi.value}
                </div>
                <div style={{ fontSize: "12px", color: "#888", marginTop: "4px" }}>{kpi.label}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Active Inspections Table ────────────────────────────────────────── */}
      <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: "8px", overflow: "hidden" }}>
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid #f0f0f0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <h2 style={{ fontSize: "15px", fontWeight: 700, color: "#111", margin: 0 }}>
            My Inspections
          </h2>
          <button
            onClick={() => setLocation("/engineer/inspections")}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: "12px",
              color: "#888",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            View all <ArrowRight size={12} />
          </button>
        </div>

        {isLoading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#888", fontSize: "14px" }}>
            Loading inspections…
          </div>
        ) : inspections.length === 0 ? (
          <div style={{ padding: "48px", textAlign: "center" }}>
            <HardHat size={32} style={{ color: "#ccc", marginBottom: "12px" }} />
            <p style={{ fontSize: "14px", color: "#888", margin: 0 }}>No inspections assigned yet.</p>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#fafafa" }}>
                {["Reference", "Asset", "Type", "Scheduled", "Status", ""].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "10px 16px",
                      textAlign: "left",
                      fontSize: "11px",
                      fontWeight: 600,
                      color: "#888",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      borderBottom: "1px solid #f0f0f0",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {inspections.slice(0, 10).map((insp: Record<string, unknown>, idx: number) => (
                <tr
                  key={String(insp.id)}
                  style={{
                    borderBottom: idx < inspections.length - 1 ? "1px solid #f5f5f5" : "none",
                    cursor: "pointer",
                  }}
                  onClick={() => setLocation(`/engineer/inspections/${insp.id}`)}
                >
                  <td style={{ padding: "12px 16px", fontSize: "13px", fontWeight: 600, color: "#111" }}>
                    {String(insp.inspection_ref ?? "—")}
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: "13px", color: "#444" }}>
                    {String(insp.vehicle_registration ?? insp.asset_ref ?? "—")}
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: "12px", color: "#666" }}>
                    {String(insp.inspection_type ?? "—").replace(/_/g, " ").toUpperCase()}
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: "12px", color: "#666" }}>
                    {insp.scheduled_date
                      ? new Date(String(insp.scheduled_date)).toLocaleDateString()
                      : "—"}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    {statusBadge(String(insp.status ?? "assigned"))}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <ArrowRight size={14} style={{ color: "#ccc" }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Engineering Intelligence (Epic 4) ──────────────────────────── */}
      <div style={{ marginTop: "32px", background: "#111", border: "1px solid #2a2a2a", borderRadius: "8px", padding: "24px" }}>
        <EngineeringIntelligencePanel />
      </div>

      {/* ── Quick Actions ───────────────────────────────────────────────────── */}
      <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
        {[
          { label: "Record Measurements", icon: Ruler,  href: "/engineer/inspections", desc: "Add physical measurements to an active inspection" },
          { label: "Add Observations",    icon: Eye,    href: "/engineer/inspections", desc: "Record findings and recommendations" },
          { label: "Run AI Analysis",     icon: Brain,  href: "/engineer/inspections", desc: "Trigger AI risk assessment on completed inspection" },
        ].map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.label}
              onClick={() => setLocation(action.href)}
              style={{
                background: "#fff",
                border: "1px solid #e8e8e8",
                borderRadius: "8px",
                padding: "16px",
                cursor: "pointer",
                textAlign: "left",
                display: "flex",
                alignItems: "flex-start",
                gap: "12px",
              }}
            >
              <div
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "6px",
                  background: "#0F1A1418",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Icon size={14} style={{ color: "#0F1A14" }} />
              </div>
              <div>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "#111" }}>{action.label}</div>
                <div style={{ fontSize: "11px", color: "#888", marginTop: "3px", lineHeight: 1.4 }}>{action.desc}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
