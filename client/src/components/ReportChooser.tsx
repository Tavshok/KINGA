/**
 * ReportChooser.tsx
 *
 * A prominent two-card selector that makes the two KINGA reports visually
 * distinct and clearly communicates their different purposes.
 *
 * - Card 1: KINGA Claims Report  (standard, always accessible)
 * - Card 2: Forensic Audit Report (advanced, tier-lock architecture ready)
 *
 * The `tierLocked` prop is wired but NOT enforced yet — pass false for now.
 * When tier gating is implemented, pass true for users below the required plan.
 */
import { FileText, Shield, ChevronRight, Lock, CheckCircle2 } from "lucide-react";

export type ReportView = "standard" | "forensic";

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
};

const FORENSIC_REPORT = {
  id: "forensic" as ReportView,
  index: 2,
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
};

export function ReportChooser({ active, onSelect, tierLocked = false, claimNumber }: ReportChooserProps) {
  const reports = [CLAIMS_REPORT, FORENSIC_REPORT];

  return (
    <div style={{ marginBottom: 24 }}>
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
          2 reports generated{claimNumber ? ` for ${claimNumber}` : ''}
        </span>
        <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 4 }}>
          — Select a report to view
        </span>
      </div>

      {/* Two-card grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 16,
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
                padding: '20px 22px',
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
                  background: report.id === 'standard'
                    ? 'linear-gradient(90deg, #38bdf8, #1a3a5c)'
                    : 'linear-gradient(90deg, #f59e0b, #92400e)',
                  borderRadius: '12px 12px 0 0',
                }} />
              )}

              {/* Report index + badge row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: '1.5px',
                  color: isActive ? (report.id === 'standard' ? 'rgba(255,255,255,0.6)' : 'rgba(254,243,199,0.6)') : '#9ca3af',
                  textTransform: 'uppercase',
                }}>
                  REPORT {report.index} OF 2
                </span>
                <span style={{
                  fontSize: 9,
                  fontWeight: 800,
                  letterSpacing: '1px',
                  textTransform: 'uppercase',
                  padding: '2px 7px',
                  borderRadius: 4,
                  background: isActive ? 'rgba(255,255,255,0.15)' : report.badgeBg,
                  color: isActive ? (report.id === 'standard' ? '#bfdbfe' : '#fde68a') : report.badgeColor,
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
                    color: report.id === 'standard' ? '#7dd3fc' : '#fcd34d',
                  }} />
                )}
              </div>

              {/* Icon + title */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
                <div style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: isActive ? 'rgba(255,255,255,0.12)' : report.accentLight,
                  flexShrink: 0,
                }}>
                  <Icon style={{
                    width: 20,
                    height: 20,
                    color: isActive
                      ? (report.id === 'standard' ? '#7dd3fc' : '#fcd34d')
                      : report.accentColor,
                  }} />
                </div>
                <div>
                  <div style={{
                    fontSize: 15,
                    fontWeight: 800,
                    lineHeight: 1.2,
                    marginBottom: 3,
                    color: isActive ? (report.id === 'standard' ? '#ffffff' : '#fef3c7') : '#111827',
                  }}>
                    {report.label}
                  </div>
                  <div style={{
                    fontSize: 11,
                    color: isActive ? (report.id === 'standard' ? 'rgba(255,255,255,0.65)' : 'rgba(254,243,199,0.65)') : '#6b7280',
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
                    color: isActive
                      ? (report.id === 'standard' ? 'rgba(255,255,255,0.8)' : 'rgba(254,243,199,0.8)')
                      : '#374151',
                    marginBottom: 4,
                  }}>
                    <span style={{
                      width: 5,
                      height: 5,
                      borderRadius: '50%',
                      background: isActive
                        ? (report.id === 'standard' ? '#38bdf8' : '#f59e0b')
                        : report.accentColor,
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
                    color: isActive
                      ? (report.id === 'standard' ? '#7dd3fc' : '#fcd34d')
                      : report.accentColor,
                  }}>
                    {isActive ? 'Currently viewing' : 'View this report'}
                  </span>
                )}
                {!isLocked && (
                  <ChevronRight style={{
                    width: 16,
                    height: 16,
                    color: isActive
                      ? (report.id === 'standard' ? '#7dd3fc' : '#fcd34d')
                      : report.accentColor,
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
          ? 'Switch to the Forensic Audit Report for physics validation, evidence chain analysis, and legal-grade audit trail'
          : 'Switch to the KINGA Claims Report for the standard assessment summary and cost decision'}
      </div>
    </div>
  );
}
