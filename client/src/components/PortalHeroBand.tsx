/**
 * PortalHeroBand — Prototype-exact dark green hero band
 *
 * Matches the approved HTML prototype design:
 *   - Dark green gradient background (#103A23 → #1C5C39)
 *   - Gold accent bottom border (#B8923A)
 *   - Portal breadcrumb + title + subtitle
 *   - Action buttons (ghost-white + gold CTA)
 *   - 6-column KPI grid (white-on-dark, first tile gold headline)
 */

import React from "react";

// ── Design tokens (shared with all portals) ──────────────────────────────────
export const P = {
  g900: '#103A23',
  g700: '#1C5C39',
  g600: '#237049',
  g500: '#2E8557',
  g100: '#E7F1EA',
  gold600: '#B8923A',
  gold300: '#E3CD8F',
  ink: '#15201A',
  muted: '#6B7568',
  muted2: '#9AA293',
  line: '#E7E2D6',
  card: '#FFFFFF',
  bodyBg: '#F7F8F6',
  red: '#B1402F',
  redSoft: '#F8E9E4',
  amber: '#A6730B',
  amberSoft: '#F8EFDD',
};

export interface KPITile {
  label: string;
  value: string | number;
  delta?: string;
  /** true = green, false = red, null/undefined = neutral */
  up?: boolean | null;
  /** First tile gets the gold headline treatment */
  headline?: boolean;
}

export interface HeroAction {
  label: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  /** Gold CTA button */
  primary?: boolean;
}

interface PortalHeroBandProps {
  /** e.g. "Claims Manager" */
  portalName: string;
  /** e.g. "Claims Overview" */
  title: string;
  /** e.g. "Last refreshed: just now · 4,821 total claims" */
  subtitle?: string;
  /** Up to 3 action buttons */
  actions?: HeroAction[];
  /** 4–6 KPI tiles */
  kpis?: KPITile[];
}

// ── KINGA logo URL (from approved prototype) ─────────────────────────────────
const KINGA_LOGO_URL = 'https://files.manuscdn.com/user_upload_by_module/session_file/310419663031527958/dOfoldGKvKSMqKYG.png';

export function PortalHeroBand({
  portalName,
  title,
  subtitle,
  actions = [],
  kpis = [],
}: PortalHeroBandProps) {
  return (
    <>
    {/* ── WHITE IDENTITY STRIP ── */}
    <header
      style={{
        background: '#FFFFFF',
        borderBottom: '1px solid #E7E2D6',
        padding: '0 24px',
        height: '52px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        fontFamily: 'Inter, sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <img
          src={KINGA_LOGO_URL}
          alt="KINGA"
          style={{ height: '28px', width: 'auto', objectFit: 'contain', flexShrink: 0 }}
        />
        <div style={{ width: '1px', height: '22px', background: '#C8C4BA' }} />
        <span style={{ fontSize: '13px', fontWeight: 600, color: '#15201A', letterSpacing: '-0.01em' }}>
          {portalName}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {/* Notification bell */}
        <button
          title="Notifications"
          style={{ position: 'relative', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', cursor: 'pointer', color: '#6B7568', background: 'none', border: 'none', fontFamily: 'inherit' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
        </button>
      </div>
    </header>
    {/* ── DARK GREEN HERO BAND ── */}
    <section
      style={{
        background: `linear-gradient(155deg, ${P.g900} 0%, ${P.g700} 100%)`,
        borderBottom: `2px solid ${P.gold600}`,
        padding: '20px 24px 0',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      {/* Top row: breadcrumb + title + actions */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          marginBottom: kpis.length > 0 ? '20px' : '20px',
          paddingBottom: kpis.length > 0 ? '0' : '20px',
        }}
      >
        <div>
          <div
            style={{
              fontSize: '11px',
              color: 'rgba(255,255,255,0.45)',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              marginBottom: '4px',
            }}
          >
            KINGA · {portalName}
          </div>
          <div
            style={{
              fontSize: '22px',
              fontWeight: 700,
              color: '#FFFFFF',
              letterSpacing: '-0.02em',
              lineHeight: 1.2,
            }}
          >
            {title}
          </div>
          {subtitle && (
            <div
              style={{
                fontSize: '12px',
                color: 'rgba(255,255,255,0.5)',
                marginTop: '3px',
              }}
            >
              {subtitle}
            </div>
          )}
        </div>

        {actions.length > 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginTop: '4px',
            }}
          >
            {actions.map((action, i) =>
              action.primary ? (
                <button
                  key={i}
                  onClick={action.onClick}
                  style={{
                    padding: '7px 16px',
                    border: 'none',
                    borderRadius: '6px',
                    background: P.gold600,
                    color: '#FFFFFF',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  {action.icon}
                  {action.label}
                </button>
              ) : (
                <button
                  key={i}
                  onClick={action.onClick}
                  style={{
                    padding: '7px 14px',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: '6px',
                    background: 'transparent',
                    color: 'rgba(255,255,255,0.8)',
                    fontSize: '12px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  {action.icon}
                  {action.label}
                </button>
              )
            )}
          </div>
        )}
      </div>

      {/* KPI grid — only rendered if kpis provided */}
      {kpis.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${kpis.length}, 1fr)`,
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '8px 8px 0 0',
            overflow: 'hidden',
            marginTop: '4px',
          }}
        >
          {kpis.map((kpi, i) => (
            <div
              key={i}
              style={{
                padding: '14px 16px 16px',
                borderRight: i < kpis.length - 1 ? '1px solid rgba(255,255,255,0.1)' : 'none',
                position: 'relative',
              }}
            >
              {kpi.headline && (
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: '16px',
                    right: '16px',
                    height: '2px',
                    background: P.gold600,
                    borderRadius: '0 0 2px 2px',
                  }}
                />
              )}
              <div
                style={{
                  fontSize: '10px',
                  fontWeight: 500,
                  color: 'rgba(255,255,255,0.45)',
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  marginBottom: '6px',
                }}
              >
                {kpi.label}
              </div>
              <div
                style={{
                  fontSize: '26px',
                  fontWeight: 700,
                  color: kpi.headline ? P.gold300 : '#FFFFFF',
                  letterSpacing: '-0.02em',
                  fontVariantNumeric: 'tabular-nums',
                  lineHeight: 1,
                }}
              >
                {kpi.value}
              </div>
              {kpi.delta && (
                <div
                  style={{
                    fontSize: '11px',
                    marginTop: '4px',
                    color:
                      kpi.up === true
                        ? '#6EE7A0'
                        : kpi.up === false
                        ? '#FCA5A5'
                        : 'rgba(255,255,255,0.35)',
                  }}
                >
                  {kpi.delta}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
        </section>
    </>
  );
}
/**
 * ProtoTabBar — prototype-exact tab bar (white bg, green active underline)
 */
export interface TabItem {
  /** Tab key — either 'id' or 'value' can be used */
  id?: string;
  value?: string;
  label: React.ReactNode;
  badge?: number | string;
}

interface ProtoTabBarProps {
  tabs: TabItem[];
  activeTab: string;
  onTabChange: (value: string) => void;
}

export function ProtoTabBar({ tabs, activeTab, onTabChange }: ProtoTabBarProps) {
  return (
    <div
      style={{
        background: P.card,
        borderBottom: `1px solid ${P.line}`,
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        gap: 0,
        overflowX: 'auto',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      {tabs.map((tab) => {
        const key = tab.id ?? tab.value ?? String(tab.label);
        return (
          <button
            key={key}
            onClick={() => onTabChange(key)}
            style={{
              padding: '12px 16px',
              fontSize: '13px',
              fontWeight: activeTab === key ? 600 : 500,
              color: activeTab === key ? P.g700 : P.muted,
              cursor: 'pointer',
              background: 'none',
              border: 'none',
              borderBottom: `2px solid ${activeTab === key ? P.g700 : 'transparent'}`,
              marginBottom: '-1px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap',
              fontFamily: 'inherit',
            }}
          >
            {tab.label}
            {tab.badge !== undefined && Number(tab.badge) > 0 && (
              <span
                style={{
                  background: P.g700,
                  color: '#fff',
                  fontSize: '10px',
                  fontWeight: 600,
                  borderRadius: '10px',
                  padding: '1px 6px',
                  minWidth: '18px',
                  textAlign: 'center',
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

/**
 * ProtoAlertBar — prototype-exact alert bar (red/amber left-border items)
 */
export interface AlertItem {
  count: number | string;
  label: string;
  severity: 'red' | 'amber';
  onClick?: () => void;
}

interface ProtoAlertBarProps {
  alerts: AlertItem[];
  ctaLabel?: string;
  onCtaClick?: () => void;
}

export function ProtoAlertBar({ alerts, ctaLabel, onCtaClick }: ProtoAlertBarProps) {
  if (!alerts.some((a) => Number(a.count) > 0)) return null;
  return (
    <div
      style={{
        background: P.card,
        borderBottom: `1px solid ${P.line}`,
        padding: '0 24px',
        display: 'flex',
        alignItems: 'stretch',
        gap: 0,
        minHeight: '40px',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      {alerts.map((alert, i) => (
        <div
          key={i}
          onClick={alert.onClick}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 16px 8px 12px',
            borderLeft: `3px solid ${alert.severity === 'red' ? P.red : P.amber}`,
            borderRight: `1px solid ${P.line}`,
            fontSize: '12px',
            cursor: alert.onClick ? 'pointer' : 'default',
          }}
        >
          <span
            style={{
              fontSize: '13px',
              fontWeight: 700,
              color: alert.severity === 'red' ? P.red : P.amber,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {alert.count}
          </span>
          <span style={{ color: P.muted }}>{alert.label}</span>
        </div>
      ))}
      {ctaLabel && (
        <div
          style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            padding: '0 0 0 16px',
          }}
        >
          <button
            onClick={onCtaClick}
            style={{
              fontSize: '12px',
              fontWeight: 500,
              color: P.g600,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            {ctaLabel} →
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * ProtoCard — prototype-exact card (white bg, border, rounded corners)
 */
interface ProtoCardProps {
  title?: React.ReactNode;
  titleIcon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  span?: number;
}

export function ProtoCard({
  title,
  titleIcon,
  action,
  children,
  style,
  span,
}: ProtoCardProps) {
  return (
    <div
      style={{
        background: P.card,
        border: `1px solid ${P.line}`,
        borderRadius: '10px',
        overflow: 'hidden',
        gridColumn: span ? `span ${span}` : undefined,
        ...style,
      }}
    >
      {title && (
        <div
          style={{
            padding: '14px 16px 12px',
            borderBottom: `1px solid ${P.line}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: P.ink,
              letterSpacing: '-0.01em',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            {titleIcon && (
              <div
                style={{
                  width: '22px',
                  height: '22px',
                  borderRadius: '5px',
                  background: P.g100,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: P.g700,
                }}
              >
                {titleIcon}
              </div>
            )}
            {title}
          </div>
          {action && (
            <div style={{ flexShrink: 0 }}>{action}</div>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
