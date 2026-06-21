/**
 * KingaPortalShell — Unified Portal Layout Component
 *
 * KINGA Portal Design Standard v1.0
 * Every portal must use this shell to ensure consistent:
 * - Header (Standard 1)
 * - KPI Strip (Standard 2)
 * - Navigation / Tabs (Standard 3)
 * - Alert Visibility (Standard 4)
 * - Brand Palette (Standard 8)
 *
 * Usage:
 *   <KingaPortalShell
 *     icon={<Shield />}
 *     title="Claims Processor"
 *     description="Manage incoming claims and trigger KINGA AI"
 *     kpis={[...]}
 *     alerts={[...]}
 *     tabs={[...]}
 *     activeTab={activeTab}
 *     onTabChange={setActiveTab}
 *     actions={<Button>...</Button>}
 *   >
 *     {tabContent}
 *   </KingaPortalShell>
 */

import React from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ── Brand constants (KINGA Design Standard v1.0) ──────────────────────────────
export const KINGA_GREEN = "#3C7844";
export const KINGA_TEAL = "#68A890";
export const KINGA_BLUE = "#4878A8";
export const KINGA_RED = "#A32D2D";
export const KINGA_AMBER = "#8A5C00";
export const KINGA_CHARCOAL = "#484840";

export const KINGA_GREEN_BG = "#F0F7F2";
export const KINGA_GREEN_BORDER = "#C8E0CE";
export const KINGA_TEAL_BG = "#EEF6F3";
export const KINGA_BLUE_BG = "#EEF3F9";
export const KINGA_RED_BG = "#FDF1F1";
export const KINGA_AMBER_BG = "#FDF6EC";

// ── KPI Card type ─────────────────────────────────────────────────────────────
export interface PortalKPI {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  /** One of the KINGA brand accent colours */
  accent?: "green" | "teal" | "blue" | "red" | "amber" | "charcoal";
  trend?: {
    value: string;
    direction: "up" | "down" | "neutral";
    positive?: boolean; // true = green, false = red, undefined = neutral
  };
}

// ── Alert type ────────────────────────────────────────────────────────────────
export interface PortalAlert {
  id: string | number;
  severity: "critical" | "warning" | "info";
  label: string;
  count: number;
  onClick?: () => void;
}

// ── Tab type ──────────────────────────────────────────────────────────────────
export interface PortalTab {
  id: string;
  label: string;
  badge?: number | string;
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface KingaPortalShellProps {
  /** Lucide icon element for the header icon container */
  icon: React.ReactNode;
  title: string;
  description?: string;
  /** Optional right-side actions in the header */
  actions?: React.ReactNode;
  /** KPI strip items */
  kpis?: PortalKPI[];
  /** Alert bar items (Attention Required / SLA / Escalation) */
  alerts?: PortalAlert[];
  /** Tab definitions */
  tabs?: PortalTab[];
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  /** Page content — rendered below the tab bar */
  children?: React.ReactNode;
  /** Extra className on the outer wrapper */
  className?: string;
  /** Show LIVE badge in header */
  live?: boolean;
}

// ── Accent colour helpers ─────────────────────────────────────────────────────
function accentColour(accent: PortalKPI["accent"]) {
  switch (accent) {
    case "teal":    return { bg: KINGA_TEAL_BG,  icon: KINGA_TEAL,     text: KINGA_TEAL };
    case "blue":    return { bg: KINGA_BLUE_BG,  icon: KINGA_BLUE,     text: KINGA_BLUE };
    case "red":     return { bg: KINGA_RED_BG,   icon: KINGA_RED,      text: KINGA_RED };
    case "amber":   return { bg: KINGA_AMBER_BG, icon: KINGA_AMBER,    text: KINGA_AMBER };
    case "charcoal":return { bg: "#F5F5F4",      icon: KINGA_CHARCOAL, text: KINGA_CHARCOAL };
    default:        return { bg: KINGA_GREEN_BG, icon: KINGA_GREEN,    text: KINGA_GREEN };
  }
}

function alertColour(severity: PortalAlert["severity"]) {
  switch (severity) {
    case "critical": return { bg: KINGA_RED_BG,   border: "#F5C6C6", text: KINGA_RED,   dot: KINGA_RED };
    case "warning":  return { bg: KINGA_AMBER_BG, border: "#F5DFA0", text: KINGA_AMBER, dot: KINGA_AMBER };
    default:         return { bg: KINGA_BLUE_BG,  border: "#BDD4EC", text: KINGA_BLUE,  dot: KINGA_BLUE };
  }
}

// ── PortalHeader ──────────────────────────────────────────────────────────────
export function PortalHeader({
  icon, title, description, actions, live,
}: Pick<KingaPortalShellProps, "icon" | "title" | "description" | "actions" | "live">) {
  return (
    <div
      className="flex items-center justify-between px-6 py-4 border-b"
      style={{ background: "#fff", borderColor: "#E5E7EB" }}
    >
      {/* Left: icon + text */}
      <div className="flex items-center gap-4">
        <div
          className="flex items-center justify-center rounded-lg flex-shrink-0"
          style={{
            width: 44, height: 44,
            background: KINGA_GREEN,
            color: "#fff",
          }}
        >
          {icon}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold" style={{ color: "#111827" }}>
              {title}
            </h1>
            {live && (
              <span
                className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
                style={{ background: KINGA_GREEN_BG, color: KINGA_GREEN, border: `1px solid ${KINGA_GREEN_BORDER}` }}
              >
                <span
                  className="inline-block rounded-full"
                  style={{ width: 6, height: 6, background: KINGA_GREEN }}
                />
                LIVE
              </span>
            )}
          </div>
          {description && (
            <p className="text-sm mt-0.5" style={{ color: "#6B7280" }}>
              {description}
            </p>
          )}
        </div>
      </div>
      {/* Right: actions */}
      {actions && (
        <div className="flex items-center gap-2 flex-shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}

// ── PortalKPIStrip ────────────────────────────────────────────────────────────
export function PortalKPIStrip({ kpis }: { kpis: PortalKPI[] }) {
  if (!kpis || kpis.length === 0) return null;
  return (
    <div
      className="grid border-b"
      style={{
        gridTemplateColumns: `repeat(${kpis.length}, 1fr)`,
        background: "#fff",
        borderColor: "#E5E7EB",
      }}
    >
      {kpis.map((kpi, i) => {
        const c = accentColour(kpi.accent);
        return (
          <div
            key={i}
            className="flex items-center gap-3 px-5 py-4"
            style={{
              borderRight: i < kpis.length - 1 ? "1px solid #E5E7EB" : undefined,
            }}
          >
            {/* Icon container */}
            <div
              className="flex items-center justify-center rounded-lg flex-shrink-0"
              style={{ width: 36, height: 36, background: c.bg }}
            >
              <span style={{ color: c.icon, display: "flex" }}>{kpi.icon}</span>
            </div>
            {/* Value + label */}
            <div className="min-w-0">
              <div className="text-xl font-bold leading-tight" style={{ color: "#111827" }}>
                {kpi.value}
              </div>
              <div className="text-xs font-medium truncate" style={{ color: "#6B7280" }}>
                {kpi.label}
              </div>
              {kpi.trend && (
                <div
                  className="text-xs font-medium mt-0.5"
                  style={{
                    color:
                      kpi.trend.positive === true
                        ? KINGA_GREEN
                        : kpi.trend.positive === false
                        ? KINGA_RED
                        : "#9CA3AF",
                  }}
                >
                  {kpi.trend.value}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── PortalAlerts ──────────────────────────────────────────────────────────────
export function PortalAlerts({ alerts }: { alerts: PortalAlert[] }) {
  if (!alerts || alerts.length === 0) return null;
  const visible = alerts.filter((a) => a.count > 0);
  if (visible.length === 0) return null;
  return (
    <div
      className="flex items-center gap-3 px-6 py-3 border-b flex-wrap"
      style={{ background: "#FAFAFA", borderColor: "#E5E7EB" }}
    >
      <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#9CA3AF" }}>
        Attention Required
      </span>
      {visible.map((alert) => {
        const c = alertColour(alert.severity);
        return (
          <button
            key={alert.id}
            onClick={alert.onClick}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full transition-opacity hover:opacity-80"
            style={{
              background: c.bg,
              border: `1px solid ${c.border}`,
              color: c.text,
              cursor: alert.onClick ? "pointer" : "default",
            }}
          >
            <span
              className="inline-block rounded-full flex-shrink-0"
              style={{ width: 6, height: 6, background: c.dot }}
            />
            {alert.count} {alert.label}
          </button>
        );
      })}
    </div>
  );
}

// ── PortalTabBar ──────────────────────────────────────────────────────────────
export function PortalTabBar({
  tabs, activeTab, onTabChange,
}: {
  tabs: PortalTab[];
  activeTab: string;
  onTabChange: (id: string) => void;
}) {
  return (
    <div
      className="flex items-center gap-1 px-6 border-b overflow-x-auto"
      style={{ background: "#fff", borderColor: "#E5E7EB" }}
      role="tablist"
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onTabChange(tab.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onTabChange(tab.id);
              }
            }}
            className="relative flex items-center gap-1.5 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
            style={{
              color: isActive ? KINGA_GREEN : "#6B7280",
              borderBottom: isActive ? `2px solid ${KINGA_GREEN}` : "2px solid transparent",
              background: "transparent",
              marginBottom: -1,
            }}
          >
            {tab.label}
            {tab.badge !== undefined && tab.badge !== 0 && (
              <span
                className="inline-flex items-center justify-center rounded-full text-xs font-semibold"
                style={{
                  minWidth: 18, height: 18, padding: "0 5px",
                  background: isActive ? KINGA_GREEN : "#E5E7EB",
                  color: isActive ? "#fff" : "#374151",
                }}
              >
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── KingaPortalShell (main export) ────────────────────────────────────────────
export function KingaPortalShell({
  icon, title, description, actions, live,
  kpis, alerts, tabs, activeTab, onTabChange,
  children, className,
}: KingaPortalShellProps) {
  return (
    <div className={cn("flex flex-col min-h-full", className)} style={{ background: "#F9FAFB" }}>
      {/* 1 — Header */}
      <PortalHeader icon={icon} title={title} description={description} actions={actions} live={live} />

      {/* 2 — KPI Strip */}
      {kpis && kpis.length > 0 && <PortalKPIStrip kpis={kpis} />}

      {/* 3 — Alert Bar */}
      {alerts && alerts.length > 0 && <PortalAlerts alerts={alerts} />}

      {/* 4 — Tab Bar */}
      {tabs && tabs.length > 0 && activeTab && onTabChange && (
        <PortalTabBar tabs={tabs} activeTab={activeTab} onTabChange={onTabChange} />
      )}

      {/* 5 — Content */}
      <div className="flex-1 p-6">
        {children}
      </div>
    </div>
  );
}

export default KingaPortalShell;
