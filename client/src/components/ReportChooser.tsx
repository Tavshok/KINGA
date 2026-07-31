/**
 * ReportChooser.tsx
 *
 * A three-card selector that makes the three KINGA reports visually
 * distinct and clearly communicates their different purposes.
 *
 * - Card 1: KINGA Claims Report       (standard, always accessible)
 * - Card 2: KINGA Claims Intelligence (intelligence, always accessible)
 * - Card 3: Forensic Audit Report     (advanced, tier-lock architecture ready)
 *
 * The `tierLocked` prop is wired but NOT enforced yet — pass false for now.
 * When tier gating is implemented, pass true for users below the required plan.
 */
import { FileText, Shield, Brain, ChevronRight, Lock, CheckCircle2 } from "lucide-react";

export type ReportView = "standard" | "intelligence" | "forensic";

interface ReportChooserProps {
  /** Currently active report */
  active: ReportView;
  /** Callback when user selects a report */
  onSelect: (view: ReportView) => void;
  /** Whether the forensic report is tier-locked (architecture ready, not enforced yet) */
  tierLocked?: boolean;
  /** Claim number for display */
  claimNumber?: string;
}

const CLAIMS_REPORT = {
  id: "standard" as ReportView,
  index: 1,
  icon: FileText,
  label: "KINGA Claims Report",
  badge: "STANDARD",
  badgeBg: "#e0f2fe",
  badgeColor: "#0369a1",
  tagline: "Assessment summary for claims decisions",
  bullets: [
    "Damage summary & cost analysis",
    "Panel beater quote comparison",
    "Fraud risk score & indicators",
    "Recommended repair decision",
  ],
  accentColor: "#1a3a5c",
  accentLight: "#e8f0f8",
  borderActive: "#1a3a5c",
  borderIdle: "#d1d5db",
  bgActive: "#1a3a5c",
  bgIdle: "#ffffff",
  textActive: "#ffffff",
  textIdle: "#1a3a5c",
  gradientActive: "linear-gradient(90deg, #38bdf8, #1a3a5c)",
  iconActiveColor: "#7dd3fc",
  bulletActiveColor: "#38bdf8",
  checkActiveColor: "#7dd3fc",
  textActiveMuted: "rgba(255,255,255,0.65)",
  textActiveBullet: "rgba(255,255,255,0.8)",
  badgeActiveColor: "#bfdbfe",
  indexActiveColor: "rgba(255,255,255,0.6)",
};

const INTELLIGENCE_REPORT = {
  id: "intelligence" as ReportView,
  index: 2,
  icon: Brain,
  label: "KINGA Claims Intelligence",
  badge: "INTELLIGENCE",
  badgeBg: "#EDE9FE",
  badgeColor: "#7C3AED",
  tagline: "Policy check, cost intelligence & risk indicators",
  bullets: [
    "Policy coverage & compliance check",
    "Cost intelligence & benchmark analysis",
    "Risk indicators & exception flags",
    "Decision actions & recommendations",
  ],
  accentColor: "#5b21b6",
  accentLight: "#f5f3ff",
  borderActive: "#7C3AED",
  borderIdle: "#d1d5db",
  bgActive: "#2e1065",
  bgIdle: "#faf9ff",
  textActive: "#ede9fe",
  textIdle: "#5b21b6",
  gradientActive: "linear-gradient(90deg, #a78bfa, #7C3AED)",
  iconActiveColor: "#c4b5fd",
  bulletActiveColor: "#a78bfa",
  checkActiveColor: "#c4b5fd",
  textActiveMuted: "rgba(237,233,254,0.65)",
  textActiveBullet: "rgba(237,233,254,0.8)",
  badgeActiveColor: "#ddd6fe",
  indexActiveColor: "rgba(237,233,254,0.6)",
};

const FORENSIC_REPORT = {
  id: "forensic" as ReportView,
  index: 3,
  icon: Shield,
  label: "Forensic Audit Report",
  badge: "ADVANCED",
  badgeBg: "#fef3c7",
  badgeColor: "#92400e",
  tagline: "Deep-dive forensic intelligence & legal-grade audit trail",
  bullets: [
    "Physics-based impact validation",
    "Evidence chain & document integrity",
    "Fraud pattern deep-dive analysis",
    "Legal-grade immutable audit trail",
  ],
  accentColor: "#78350f",
  accentLight: "#fef9ee",
  borderActive: "#92400e",
  borderIdle: "#d1d5db",
  bgActive: "#1c1917",
  bgIdle: "#fffbf5",
  textActive: "#fef3c7",
  textIdle: "#78350f",
  gradientActive: "linear-gradient(90deg, #f59e0b, #92400e)",
  iconActiveColor: "#fcd34d",
  bulletActiveColor: "#f59e0b",
  checkActiveColor: "#fcd34d",
  textActiveMuted: "rgba(254,243,199,0.65)",
  textActiveBullet: "rgba(254,243,199,0.8)",
  badgeActiveColor: "#fde68a",
  indexActiveColor: "rgba(254,243,199,0.6)",
};

export function ReportChooser({ active, onSelect, tierLocked = false, claimNumber }: ReportChooserProps) {
  const reports = [CLAIMS_REPORT, INTELLIGENCE_REPORT, FORENSIC_REPORT];

  return (
    <div className="no-print" style={{ marginBottom: 24 }}>
      {/* Section header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginBottom: 14,
        paddingBottom: 10,
        borderBottom: '2px solid #e2e8f0',
      }}>
        <span style={{
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: '2px',
          textTransform: 'uppercase',
          color: '#6b7280',
          background: '#f1f5f9',
          padding: '3px 10px',
          borderRadius: 4,
        }}>
          KINGA REPORTS
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>
          3 reports generated{claimNumber ? ` for ${claimNumber}` : ''}
        </span>
        <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 4 }}>
          — Select a report to view
        </span>
      </div>

      {/* Three-card grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gap: 14,
      }}>
        {reports.map((report) => {
          const isActive = active === report.id;
          const isLocked = report.id === 'forensic' && tierLocked;
          const Icon = report.icon;

          return (
            <button
              key={report.id}
              onClick={() => !isLocked && onSelect(report.id)}
              style={{
                textAlign: 'left',
                padding: '18px 18px',
                borderRadius: 12,
                border: isActive
                  ? `2.5px solid ${report.borderActive}`
                  : `1.5px solid ${report.borderIdle}`,
                background: isActive ? report.bgActive : report.bgIdle,
                color: isActive ? report.textActive : report.textIdle,
                cursor: isLocked ? 'not-allowed' : 'pointer',
                opacity: isLocked ? 0.75 : 1,
                transition: 'border-color 0.15s, background 0.15s, box-shadow 0.15s',
                boxShadow: isActive
                  ? `0 4px 16px ${report.accentColor}33`
                  : '0 1px 4px rgba(0,0,0,0.06)',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* Active indicator stripe */}
              {isActive && (
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 3,
                  background: report.gradientActive,
                  borderRadius: '12px 12px 0 0',
                }} />
              )}

              {/* Report index + badge row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: '1.5px',
                  color: isActive ? report.indexActiveColor : '#9ca3af',
                  textTransform: 'uppercase',
                }}>
                  REPORT {report.index} OF 3
                </span>
                <span style={{
                  fontSize: 9,
                  fontWeight: 800,
                  letterSpacing: '1px',
                  textTransform: 'uppercase',
                  padding: '2px 7px',
                  borderRadius: 4,
                  background: isActive ? 'rgba(255,255,255,0.15)' : report.badgeBg,
                  color: isActive ? report.badgeActiveColor : report.badgeColor,
                }}>
                  {report.badge}
                </span>
                {isLocked && (
                  <Lock style={{ width: 12, height: 12, marginLeft: 'auto', color: '#9ca3af' }} />
                )}
                {isActive && !isLocked && (
                  <CheckCircle2 style={{
                    width: 14,
                    height: 14,
                    marginLeft: 'auto',
                    color: report.checkActiveColor,
                  }} />
                )}
              </div>

              {/* Icon + title */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                <div style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: isActive ? 'rgba(255,255,255,0.12)' : report.accentLight,
                  flexShrink: 0,
                }}>
                  <Icon style={{
                    width: 18,
                    height: 18,
                    color: isActive ? report.iconActiveColor : report.accentColor,
                  }} />
                </div>
                <div>
                  <div style={{
                    fontSize: 13,
                    fontWeight: 800,
                    lineHeight: 1.2,
                    marginBottom: 3,
                    color: isActive ? report.textActive : '#111827',
                  }}>
                    {report.label}
                  </div>
                  <div style={{
                    fontSize: 11,
                    color: isActive ? report.textActiveMuted : '#6b7280',
                    lineHeight: 1.4,
                  }}>
                    {report.tagline}
                  </div>
                </div>
              </div>

              {/* Feature bullets */}
              <ul style={{ margin: '0 0 14px 0', padding: 0, listStyle: 'none' }}>
                {report.bullets.map((bullet) => (
                  <li key={bullet} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 11,
                    color: isActive ? report.textActiveBullet : '#374151',
                    marginBottom: 4,
                  }}>
                    <span style={{
                      width: 5,
                      height: 5,
                      borderRadius: '50%',
                      background: isActive ? report.bulletActiveColor : report.accentColor,
                      flexShrink: 0,
                    }} />
                    {bullet}
                  </li>
                ))}
              </ul>

              {/* CTA row */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: 10,
                borderTop: isActive
                  ? `1px solid rgba(255,255,255,0.15)`
                  : '1px solid #e5e7eb',
              }}>
                {isLocked ? (
                  <span style={{ fontSize: 11, color: '#9ca3af', fontStyle: 'italic' }}>
                    Upgrade to unlock
                  </span>
                ) : (
                  <span style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: isActive ? report.iconActiveColor : report.accentColor,
                  }}>
                    {isActive ? 'Currently viewing' : 'View this report'}
                  </span>
                )}
                {!isLocked && (
                  <ChevronRight style={{
                    width: 16,
                    height: 16,
                    color: isActive ? report.iconActiveColor : report.accentColor,
                  }} />
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Contextual hint below cards */}
      <div style={{
        marginTop: 10,
        fontSize: 11,
        color: '#9ca3af',
        textAlign: 'center',
      }}>
        {active === 'standard'
          ? 'Switch to Claims Intelligence for cost benchmarks & risk indicators, or Forensic Audit for physics validation & legal-grade audit trail'
          : active === 'intelligence'
          ? 'Switch to KINGA Claims Report for the standard assessment summary, or Forensic Audit for physics validation & legal-grade audit trail'
          : 'Switch to KINGA Claims Report for the standard assessment summary, or Claims Intelligence for cost benchmarks & risk indicators'}
      </div>
    </div>
  );
}
