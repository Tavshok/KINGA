/**
 * KingaPortalShell — Unified Portal Layout Component
 *
 * KINGA Portal Design Standard v1.0 — Phase 11 Visual Refresh
 *
 * Shell layers (top → bottom):
 *   1. IdentityStrip  — white bar: KINGA logo + portal name + user actions
 *   2. Gold separator — 2px solid var(--p11-gold-400)
 *   3. HeroBand       — dark green gradient: KPI grid (headline metric in gold)
 *   4. Gold separator — 2px solid var(--p11-gold-400)
 *   5. TabBar         — white, Inter medium, active = g-700 underline
 *   6. AlertBar       — cream, left-accent severity strips
 *   7. Body           — var(--p11-body-bg) content area
 *
 * Public API is unchanged — all 11 portals compile without modification.
 */

import React from "react";
import { cn } from "@/lib/utils";

// ── Brand constants (KINGA Design Standard v1.0) ──────────────────────────────
export const KINGA_GREEN    = "#3C7844";
export const KINGA_TEAL     = "#68A890";
export const KINGA_BLUE     = "#4878A8";
export const KINGA_RED      = "#A32D2D";
export const KINGA_AMBER    = "#8A5C00";
export const KINGA_CHARCOAL = "#484840";

export const KINGA_GREEN_BG    = "#F0F7F2";
export const KINGA_GREEN_BORDER = "#C8E0CE";
export const KINGA_TEAL_BG     = "#EEF6F3";
export const KINGA_BLUE_BG     = "#EEF3F9";
export const KINGA_RED_BG      = "#FDF1F1";
export const KINGA_AMBER_BG    = "#FDF6EC";

// ── Phase 11 shell palette ────────────────────────────────────────────────────
const P11 = {
  heroBgStart:    "#103A23",
  heroBgEnd:      "#1C5C39",
  goldSep:        "#D4A800",
  heroText:       "#FFFFFF",
  heroMuted:      "rgba(255,255,255,0.65)",
  heroKpiBorder:  "rgba(255,255,255,0.12)",
  heroHeadline:   "#E8C84A",   // gold-300 — headline metric number
  tabActive:      "#1C5C39",
  tabInactive:    "#6B7280",
  alertBg:        "#FAFAFA",
  bodyBg:         "#F7F8F6",
  ink:            "#111827",
  inkMuted:       "#6B7280",
  line:           "#E5E7EB",
};

// ── KPI Card type ─────────────────────────────────────────────────────────────
export interface PortalKPI {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  /** One of the KINGA brand accent colours */
  accent?: "green" | "teal" | "blue" | "red" | "amber" | "charcoal";
  /** If true, renders this KPI as the headline metric (gold number, gold rule above) */
  headline?: boolean;
  trend?: {
    value: string;
    direction: "up" | "down" | "neutral";
    positive?: boolean;
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
  /** Lucide icon element for the identity strip icon container */
  icon: React.ReactNode;
  title: string;
  description?: string;
  /** Optional right-side actions in the identity strip */
  actions?: React.ReactNode;
  /** KPI strip items — rendered in the dark hero band */
  kpis?: PortalKPI[];
  /** Alert bar items */
  alerts?: PortalAlert[];
  /** Tab definitions */
  tabs?: PortalTab[];
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  /** Page content — rendered below the tab bar */
  children?: React.ReactNode;
  /** Extra className on the outer wrapper */
  className?: string;
  /** Show LIVE badge in identity strip */
  live?: boolean;
}

// ── Alert colour helpers ──────────────────────────────────────────────────────
function alertAccent(severity: PortalAlert["severity"]) {
  switch (severity) {
    case "critical": return { accent: "#A32D2D", bg: "#FDF1F1", border: "#F5C6C6", text: "#A32D2D" };
    case "warning":  return { accent: "#8A5C00", bg: "#FDF6EC", border: "#F5DFA0", text: "#8A5C00" };
    default:         return { accent: "#4878A8", bg: "#EEF3F9", border: "#BDD4EC", text: "#4878A8" };
  }
}

// ── PortalHeader (Phase 11: IdentityStrip) ────────────────────────────────────
export function PortalHeader({
  icon, title, description, actions, live,
}: Pick<KingaPortalShellProps, "icon" | "title" | "description" | "actions" | "live">) {
  return (
    <>
      {/* ── Layer 1: White identity strip ── */}
      <div
        className="flex items-center justify-between px-6"
        style={{
          background: "#FFFFFF",
          borderBottom: `1px solid ${P11.line}`,
          minHeight: 60,
        }}
      >
        {/* Left: logo + divider + portal name */}
        <div className="flex items-center gap-0">
          {/* KINGA logo */}
          <img
            src="https://files.manuscdn.com/user_upload_by_module/session_file/310419663031527958/dOfoldGKvKSMqKYG.png"
            alt="KINGA"
            style={{ height: 32, width: "auto", objectFit: "contain", flexShrink: 0 }}
          />
          {/* Vertical divider */}
          <div
            style={{
              width: 1,
              height: 28,
              background: P11.line,
              margin: "0 16px",
              flexShrink: 0,
            }}
          />
          {/* Portal name + optional description */}
          <div className="flex items-center gap-2">
            <h1
              className="text-base font-semibold leading-tight"
              style={{ color: P11.ink, letterSpacing: "-0.01em" }}
            >
              {title}
            </h1>
            {live && (
              <span
                className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
                style={{
                  background: KINGA_GREEN_BG,
                  color: KINGA_GREEN,
                  border: `1px solid ${KINGA_GREEN_BORDER}`,
                }}
              >
                <span
                  className="inline-block rounded-full"
                  style={{ width: 5, height: 5, background: KINGA_GREEN }}
                />
                LIVE
              </span>
            )}
          </div>
          {description && (
            <span
              className="text-sm ml-3 hidden md:inline"
              style={{ color: P11.inkMuted }}
            >
              {description}
            </span>
          )}
        </div>

        {/* Right: actions */}
        {actions && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {actions}
          </div>
        )}
      </div>

      {/* ── Gold separator ── */}
      <div style={{ height: 2, background: P11.goldSep }} />
    </>
  );
}

// ── PortalKPIStrip (Phase 11: HeroBand KPI grid) ──────────────────────────────
export function PortalKPIStrip({ kpis }: { kpis: PortalKPI[] }) {
  if (!kpis || kpis.length === 0) return null;

  // First kpi with headline=true gets gold treatment; fall back to first kpi
  const headlineIndex = kpis.findIndex((k) => k.headline) ?? 0;

  return (
    <>
      {/* ── Layer 3: Dark green hero band ── */}
      <div
        style={{
          background: `linear-gradient(135deg, ${P11.heroBgStart} 0%, ${P11.heroBgEnd} 100%)`,
          display: "grid",
          gridTemplateColumns: `repeat(${kpis.length}, 1fr)`,
        }}
      >
        {kpis.map((kpi, i) => {
          const isHeadline = i === headlineIndex;
          return (
            <div
              key={i}
              className="flex flex-col justify-center px-5 py-4"
              style={{
                borderRight:
                  i < kpis.length - 1
                    ? `1px solid ${P11.heroKpiBorder}`
                    : undefined,
                position: "relative",
              }}
            >
              {/* Gold rule above headline metric */}
              {isHeadline && (
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 20,
                    right: 20,
                    height: 2,
                    background: P11.goldSep,
                    borderRadius: "0 0 2px 2px",
                  }}
                />
              )}

              {/* Label */}
              <div
                className="text-xs font-medium uppercase tracking-wide mb-1"
                style={{
                  color: P11.heroMuted,
                  letterSpacing: "0.06em",
                  fontSize: "0.6875rem",
                }}
              >
                {kpi.label}
              </div>

              {/* Value */}
              <div
                className="font-bold leading-none"
                style={{
                  color: isHeadline ? P11.heroHeadline : P11.heroText,
                  fontSize: isHeadline ? "1.5rem" : "1.25rem",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {kpi.value}
              </div>

              {/* Trend */}
              {kpi.trend && (
                <div
                  className="text-xs font-medium mt-1"
                  style={{
                    color:
                      kpi.trend.positive === true
                        ? "#86EFAC"   // green-300 on dark bg
                        : kpi.trend.positive === false
                        ? "#FCA5A5"  // red-300 on dark bg
                        : P11.heroMuted,
                  }}
                >
                  {kpi.trend.value}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Gold separator ── */}
      <div style={{ height: 2, background: P11.goldSep }} />
    </>
  );
}

// ── PortalAlerts (Phase 11: tight alert bar) ──────────────────────────────────
export function PortalAlerts({ alerts }: { alerts: PortalAlert[] }) {
  if (!alerts || alerts.length === 0) return null;
  const visible = alerts.filter((a) => a.count > 0);
  if (visible.length === 0) return null;

  return (
    <div
      className="flex items-center gap-3 px-6 border-b flex-wrap"
      style={{
        background: P11.alertBg,
        borderColor: P11.line,
        minHeight: 44,
        paddingTop: 10,
        paddingBottom: 10,
      }}
    >
      <span
        className="text-xs font-semibold uppercase tracking-wide flex-shrink-0"
        style={{ color: "#9CA3AF", letterSpacing: "0.07em", fontSize: "0.6875rem" }}
      >
        Attention Required
      </span>
      {visible.map((alert) => {
        const c = alertAccent(alert.severity);
        return (
          <button
            key={alert.id}
            onClick={alert.onClick}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 transition-opacity hover:opacity-80"
            style={{
              background: c.bg,
              border: `1px solid ${c.border}`,
              borderLeft: `3px solid ${c.accent}`,
              borderRadius: 4,
              color: c.text,
              cursor: alert.onClick ? "pointer" : "default",
              fontSize: "0.75rem",
            }}
          >
            {alert.count} {alert.label}
          </button>
        );
      })}
    </div>
  );
}

// ── PortalTabBar (Phase 11: clean Inter tab bar) ──────────────────────────────
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
      style={{ background: "#FFFFFF", borderColor: P11.line }}
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
              color: isActive ? P11.tabActive : P11.tabInactive,
              borderBottom: isActive
                ? `2px solid ${P11.tabActive}`
                : "2px solid transparent",
              background: "transparent",
              marginBottom: -1,
              fontSize: "0.875rem",
              letterSpacing: "-0.005em",
            }}
          >
            {tab.label}
            {tab.badge !== undefined && tab.badge !== 0 && (
              <span
                className="inline-flex items-center justify-center rounded-full text-xs font-semibold"
                style={{
                  minWidth: 18,
                  height: 18,
                  padding: "0 5px",
                  background: isActive ? P11.tabActive : P11.line,
                  color: isActive ? "#fff" : "#374151",
                  fontSize: "0.6875rem",
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
    <div
      className={cn("flex flex-col min-h-full", className)}
      style={{ background: P11.bodyBg }}
    >
      {/* 1+2 — Identity strip + gold separator */}
      <PortalHeader
        icon={icon}
        title={title}
        description={description}
        actions={actions}
        live={live}
      />

      {/* 3+4 — Hero band KPI grid + gold separator */}
      {kpis && kpis.length > 0 && <PortalKPIStrip kpis={kpis} />}

      {/* 5 — Tab bar */}
      {tabs && tabs.length > 0 && activeTab && onTabChange && (
        <PortalTabBar tabs={tabs} activeTab={activeTab} onTabChange={onTabChange} />
      )}

      {/* 6 — Alert bar */}
      {alerts && alerts.length > 0 && <PortalAlerts alerts={alerts} />}

      {/* 7 — Content */}
      <div className="flex-1 p-6">
        {children}
      </div>
    </div>
  );
}
