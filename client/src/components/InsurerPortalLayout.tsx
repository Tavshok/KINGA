/**
 * InsurerPortalLayout
 *
 * Persistent sidebar layout for all insurer sub-role portal pages.
 * Design: dark slate sidebar (#0F172A) with KINGA teal accent for active states.
 * No role-specific colour overrides — one consistent palette across all roles.
 */
import { Link, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import {
  LayoutDashboard,
  ClipboardList,
  ShieldAlert,
  TrendingUp,
  BarChart3,
  UserCog,
  FileText,
  AlertCircle,
  Network,
  FileBarChart,
  LogOut,
  Users,
  Car,
  Zap,
  Settings,
  Activity,
  BookOpen,
  DollarSign,
  Target,
  CheckSquare,
  Eye,
  Scale,
  Search,
  Send,
  Gavel,
  Archive,
  Truck,
} from "lucide-react";

// ─── Nav definition ────────────────────────────────────────────────────────

type NavItem = {
  label: string;
  href: string;
  icon: React.ElementType;
  description: string;
  badgeKey?: "recoveryOpen" | "recoveryDeadline";
};

type NavSection = {
  title: string;
  items: NavItem[];
};

// Each role gets its OWN nav — no cross-role links.
const navByRole: Record<string, NavSection[]> = {
  claims_manager: [
    {
      title: "Overview",
      items: [
        { label: "My Dashboard", description: "Queue, stats & finances", href: "/insurer-portal/claims-manager", icon: LayoutDashboard },
      ],
    },
    {
      title: "Claims Work",
      items: [
        { label: "Intake Queue", description: "New claims awaiting assignment", href: "/insurer-portal/claims-manager?tab=intake", icon: ClipboardList },
        { label: "Active Claims", description: "Claims in progress", href: "/insurer-portal/claims-manager?tab=active", icon: Activity },
        { label: "Review Queue", description: "Ready for final review", href: "/insurer-portal/claims-manager?tab=review", icon: CheckSquare },
        { label: "Processed Claims", description: "Closed and settled history", href: "/insurer-portal/claims-manager?tab=processed", icon: BookOpen },
        { label: "Fleet Approvals", description: "Fleet manager approval requests", href: "/insurer-portal/claims-manager?tab=fleet-approvals", icon: Truck },
      ],
    },
    {
      title: "Intelligence",
      items: [
        { label: "Fraud Alerts", description: "FCDI flags requiring action", href: "/insurer/fraud-analytics", icon: AlertCircle },
      ],
    },
    {
      title: "Analytics & Reports",
      items: [
        { label: "Reports Centre", description: "Generate and download reports", href: "/insurer-portal/reports-centre", icon: FileBarChart },
      ],
    },
    {
      title: "Subrogation Recovery",
      items: [
        { label: "Recovery Queue", description: "Cases eligible for third-party recovery", href: "/insurer-portal/recovery", icon: Scale, badgeKey: "recoveryOpen" as const },
        { label: "Under Investigation", description: "Cases pending liability determination", href: "/insurer-portal/recovery?status=under_investigation", icon: Search },
      ],
    },
  ],

  claims_processor: [
    {
      title: "Overview",
      items: [
        { label: "My Dashboard", description: "Intake queue and progress", href: "/insurer-portal/claims-processor", icon: LayoutDashboard },
      ],
    },
    {
      title: "Claims Work",
      items: [
        { label: "Intake Queue", description: "New claims to process", href: "/insurer-portal/claims-processor#intake-queue", icon: ClipboardList },
        { label: "In Progress", description: "Claims being actively worked", href: "/insurer-portal/claims-processor#in-progress", icon: Activity },
        { label: "KINGA Assessment Complete", description: "Ready for review", href: "/insurer-portal/claims-processor#ai-flagged", icon: Eye },
        { label: "Completed", description: "Closed claims", href: "/insurer-portal/claims-processor#completed", icon: CheckSquare },
      ],
    },
    {
      title: "Reports",
      items: [
        { label: "Reports Centre", description: "Claim and performance reports", href: "/insurer-portal/reports-centre", icon: FileBarChart },
      ],
    },
  ],

  risk_manager: [
    {
      title: "Overview",
      items: [
        { label: "My Dashboard", description: "Approval queue and risk scoring", href: "/insurer-portal/risk-manager", icon: LayoutDashboard },
      ],
    },
    {
      title: "Decisions",
      items: [
        { label: "Approval Queue", description: "Claims awaiting technical approval", href: "/insurer-portal/risk-manager?tab=approval", icon: CheckSquare },
        { label: "High-Value Claims", description: "Claims above financial threshold", href: "/insurer-portal/risk-manager?tab=financial", icon: DollarSign },
        { label: "Escalations", description: "Claims escalated from processors", href: "/insurer-portal/risk-manager?tab=escalations", icon: AlertCircle },
      ],
    },
    {
      title: "Intelligence",
      items: [
        { label: "Fraud Analytics", description: "Risk patterns and FCDI flags", href: "/insurer/fraud-analytics", icon: ShieldAlert },
        { label: "Exception Hub", description: "Anomalies requiring review", href: "/insurer-portal/exception-intelligence", icon: Zap },
        { label: "Relationship Intelligence", description: "Entity network analysis", href: "/insurer-portal/relationship-intelligence", icon: Network },
        { label: "Workflow Analytics", description: "Decision times and outcomes", href: "/insurer-portal/workflow-analytics", icon: BarChart3 },
        { label: "Risk Analytics", description: "Own-book motor intelligence (Enterprise)", href: "/insurer-portal/risk-analytics", icon: TrendingUp },
      ],
    },
    {
      title: "Reports",
      items: [
        { label: "Reports Centre", description: "Risk and portfolio reports", href: "/insurer-portal/reports-centre", icon: FileBarChart },
      ],
    },
  ],

  executive: [
    {
      title: "Overview",
      items: [
        { label: "Executive Dashboard", description: "Portfolio overview and ROI", href: "/insurer-portal/executive", icon: LayoutDashboard },
      ],
    },
    {
      title: "Portfolio",
      items: [
        { label: "Savings Tracker", description: "Cost savings and financial impact", href: "/insurer-portal/executive?tab=financials", icon: TrendingUp },
        { label: "Fraud Analytics", description: "Fraud detection performance", href: "/insurer/fraud-analytics", icon: ShieldAlert },
        { label: "Repairer Intelligence", description: "Panel beater performance data", href: "/insurer/panel-beater-performance", icon: Car },
      ],
    },
    {
      title: "Analytics & Reports",
      items: [
        { label: "Workflow Analytics", description: "Processing efficiency metrics", href: "/insurer-portal/workflow-analytics", icon: BarChart3 },
        { label: "Relationship Intelligence", description: "Entity network analysis", href: "/insurer-portal/relationship-intelligence", icon: Network },
        { label: "Reports Centre", description: "Generate executive reports", href: "/insurer-portal/reports-centre", icon: FileBarChart },
      ],
    },
  ],

  assessor_internal: [
    {
      title: "Overview",
      items: [
        { label: "My Dashboard", description: "Assigned claims and queue", href: "/insurer-portal/internal-assessor", icon: LayoutDashboard },
      ],
    },
    {
      title: "Assessments",
      items: [
        { label: "My Queue", description: "Claims assigned to me", href: "/insurer-portal/internal-assessor?tab=queue", icon: ClipboardList },
        { label: "In Progress", description: "Assessments being written", href: "/insurer-portal/internal-assessor?tab=in-progress", icon: Activity },
        { label: "Completed", description: "Submitted assessments", href: "/insurer-portal/internal-assessor?tab=completed", icon: CheckSquare },
      ],
    },
    {
      title: "Reports",
      items: [
        { label: "Reports Centre", description: "Assessment report archive", href: "/insurer-portal/reports-centre", icon: FileBarChart },
      ],
    },
  ],

  recovery_officer: [
    {
      title: "Overview",
      items: [
        { label: "Recovery Dashboard", description: "Queue overview and KPIs", href: "/insurer-portal/recovery", icon: LayoutDashboard, badgeKey: "recoveryOpen" as const },
      ],
    },
    {
      title: "Active Cases",
      items: [
        { label: "Pending Review", description: "New cases awaiting assessment", href: "/insurer-portal/recovery?tab=pending", icon: ClipboardList },
        { label: "Under Investigation", description: "Cases with unresolved liability", href: "/insurer-portal/recovery?tab=investigation", icon: Search },
        { label: "Open Cases", description: "Cases ready for demand action", href: "/insurer-portal/recovery?tab=open", icon: Activity },
        { label: "Demand Sent", description: "Outstanding demand responses", href: "/insurer-portal/recovery?tab=demand-sent", icon: Send },
        { label: "Disputed / Legal", description: "Cases in dispute or legal referral", href: "/insurer-portal/recovery?tab=legal", icon: Gavel },
      ],
    },
    {
      title: "Closed Cases",
      items: [
        { label: "Settled Cases", description: "Fully and partially recovered", href: "/insurer-portal/recovery?tab=settled", icon: CheckSquare },
        { label: "Archived", description: "Low-RPS cases not actioned", href: "/insurer-portal/recovery?tab=archived", icon: Archive },
      ],
    },
    {
      title: "Intelligence",
      items: [
        { label: "Third-Party Profiles", description: "Repeat third-party intelligence", href: "/insurer-portal/recovery/third-party-profiles", icon: Car },
        { label: "Relationship Intelligence", description: "Entity network analysis", href: "/insurer-portal/relationship-intelligence", icon: Network },
      ],
    },
    {
      title: "Reports",
      items: [
        { label: "Recovery Reports", description: "Generate recovery performance reports", href: "/insurer-portal/reports-centre?tab=recovery", icon: FileBarChart },
      ],
    },
  ],

  insurer_admin: [
    {
      title: "Overview",
      items: [
        { label: "Admin Dashboard", description: "Company overview and KPIs", href: "/insurer-portal/insurer-admin", icon: LayoutDashboard },
      ],
    },
    {
      title: "Administration",
      items: [
        { label: "Team Members", description: "Invite users and manage roles", href: "/insurer-portal/team-members", icon: Users },
        { label: "Assessor Network", description: "Manage approved assessors", href: "/insurer-portal/assessors", icon: UserCog },
        { label: "Workflow Settings", description: "Automation rules and escalation policies", href: "/admin/workflows", icon: Settings },
      ],
    },
    {
      title: "Analytics & Reports",
      items: [
        { label: "Fraud Analytics", description: "Fraud detection overview and FCDI flags", href: "/insurer/fraud-analytics", icon: ShieldAlert },
        { label: "Workflow Analytics", description: "Processing times and throughput", href: "/insurer-portal/workflow-analytics", icon: BarChart3 },
        { label: "Relationship Intelligence", description: "Entity network analysis", href: "/insurer-portal/relationship-intelligence", icon: Network },
        { label: "Reports Centre", description: "Full report catalogue", href: "/insurer-portal/reports-centre", icon: FileBarChart },
      ],
    },
  ],
};

const defaultNav: NavSection[] = [
  {
    title: "Home",
    items: [
      { label: "Portal Home", description: "Role selection and overview", href: "/insurer-portal", icon: LayoutDashboard },
    ],
  },
];

// Map URL path prefixes to role keys
const pathToRole: Array<{ prefix: string; role: string; label: string }> = [
  { prefix: "/insurer-portal/executive",               role: "executive",         label: "Executive" },
  { prefix: "/insurer-portal/claims-manager",          role: "claims_manager",    label: "Claims Manager" },
  { prefix: "/insurer-portal/claims-processor",        role: "claims_processor",  label: "Claims Processor" },
  { prefix: "/insurer-portal/risk-manager",            role: "risk_manager",      label: "Risk Manager" },
  { prefix: "/insurer-portal/internal-assessor",       role: "assessor_internal", label: "Internal Assessor" },
  { prefix: "/insurer-portal/insurer-admin",            role: "insurer_admin",     label: "Insurer Admin" },
  { prefix: "/insurer-portal/recovery",                 role: "recovery_officer",  label: "Recovery Officer" },
  { prefix: "/insurer/fraud-analytics",                role: "",                  label: "Fraud Analytics" },
  { prefix: "/insurer-portal/workflow-analytics",      role: "",                  label: "Workflow Analytics" },
  { prefix: "/insurer-portal/exception-intelligence",  role: "",                  label: "Exception Intelligence" },
  { prefix: "/insurer-portal/relationship-intelligence", role: "",                label: "Relationship Intelligence" },
  { prefix: "/insurer-portal/reports-centre",          role: "",                  label: "Reports Centre" },
];

function getRoleFromPath(path: string): { role: string; label: string } {
  for (const entry of pathToRole) {
    if (path === entry.prefix || path.startsWith(entry.prefix + "/") || path.startsWith(entry.prefix + "?")) {
      return { role: entry.role, label: entry.label };
    }
  }
  return { role: "", label: "Insurer Portal" };
}

// ─── Role badge — unified gold pill for all roles ─────────────────────────
const ROLE_BADGE: Record<string, { label: string }> = {
  claims_manager:   { label: "Claims Manager" },
  claims_processor: { label: "Claims Processor" },
  risk_manager:     { label: "Risk Manager" },
  executive:        { label: "Executive" },
  assessor_internal:{ label: "Internal Assessor" },
  insurer_admin:    { label: "Insurer Admin" },
  recovery_officer: { label: "Recovery Officer" },
};

// ─── Component ─────────────────────────────────────────────────────────────

export default function InsurerPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  const { role: pathRole, label: _pathLabel } = getRoleFromPath(location);
  const derivedRole = pathRole || (user?.insurerRole ?? "");
  const visibleSections: NavSection[] = (derivedRole ? navByRole[derivedRole] : undefined) ?? defaultNav;
  const badge = ROLE_BADGE[derivedRole];

  // Live recovery badge — only fetch for roles that actively work recovery cases.
  // insurer_admin is intentionally excluded (they have no recovery queue in their nav).
  const hasRecoveryAccess = ["recovery_officer", "claims_manager"].includes(derivedRole);
  const { data: recoveryKpis } = trpc.recovery.getKPIs.useQuery(undefined, {
    enabled: hasRecoveryAccess,
    refetchInterval: 5 * 60 * 1000,
    staleTime: 4 * 60 * 1000,
  });
  const recoveryBadgeCounts: Record<string, number> = {
    recoveryOpen: recoveryKpis ? ((recoveryKpis as any).open ?? 0) + ((recoveryKpis as any).pendingReview ?? 0) : 0,
    recoveryDeadline: (recoveryKpis as any)?.approachingDeadline ?? 0,
  };

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-background">
      {/* ── Persistent sidebar — KINGA forest green, gold accent ── */}
      <aside
        className="w-64 flex-shrink-0 flex flex-col"
        style={{
          background: "#1A3320",
          borderRight: "1px solid rgba(255,255,255,0.07)",
          position: "relative",
        }}
      >
        {/* Subtle depth texture */}
        <div
          style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            background: "radial-gradient(ellipse at 10% 15%, rgba(184,146,58,0.05) 0%, transparent 55%), radial-gradient(ellipse at 90% 85%, rgba(46,96,53,0.20) 0%, transparent 55%)",
            zIndex: 0,
          }}
        />
        {/* ── Brand header ── */}
        <div
          className="px-4 py-3.5 flex items-center gap-2.5"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.07)", position: "relative", zIndex: 1 }}
        >
          <img
            src="https://files.manuscdn.com/user_upload_by_module/session_file/310419663031527958/dOfoldGKvKSMqKYG.png"
            alt="KINGA"
            className="h-7 w-auto object-contain flex-shrink-0"
          />
          <div className="min-w-0">
            <p className="text-[13px] font-bold leading-none" style={{ color: "rgba(255,255,255,0.92)", letterSpacing: "0.02em" }}>KINGA</p>
            <p className="text-[10px] leading-none mt-1" style={{ color: "rgba(255,255,255,0.50)" }}>Claims Intelligence</p>
          </div>
        </div>

        {/* ── Role badge — unified gold pill ── */}
        {badge && (
          <div className="px-4 pt-2.5 pb-0.5" style={{ position: "relative", zIndex: 1 }}>
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold"
              style={{
                background: "rgba(184,146,58,0.15)",
                border: "1px solid rgba(184,146,58,0.25)",
                color: "#D4A800",
                letterSpacing: "0.02em",
              }}
            >
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#D4A800", flexShrink: 0, display: "inline-block" }} />
              {badge.label}
            </span>
          </div>
        )}

        {/* ── Navigation ── */}
        <nav className="flex-1 overflow-y-auto py-2.5 px-2" style={{ position: "relative", zIndex: 1, scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.08) transparent" }}>
          {visibleSections.map((section) => (
            <div key={section.title} className="mb-4">
              <p
                className="px-2 mb-1 text-[9.5px] font-bold uppercase"
                style={{ color: "rgba(255,255,255,0.72)", letterSpacing: "0.12em" }}
              >
                {section.title}
              </p>
              <div className="space-y-px">
                {section.items.map((item) => {
                  const hrefBase = item.href.split("?")[0].split("#")[0];
                  const active =
                    location === hrefBase ||
                    (hrefBase.length > 1 && location.startsWith(hrefBase));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      style={{
                        display: "flex", alignItems: "center", gap: "8px",
                        padding: "6px 8px", borderRadius: "8px",
                        borderLeft: active ? "2px solid #B8923A" : "2px solid transparent",
                        background: active ? "rgba(184,146,58,0.10)" : "transparent",
                        transition: "background-color 120ms ease, border-color 120ms ease",
                        cursor: "pointer",
                        textDecoration: "none",
                      }}
                      onMouseEnter={(e) => { if (!active) { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)"; (e.currentTarget as HTMLElement).style.borderLeftColor = "rgba(184,146,58,0.3)"; } }}
                      onMouseLeave={(e) => { if (!active) { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.borderLeftColor = "transparent"; } }}
                    >
                        {/* Icon container */}
                        <div
                          className="flex-shrink-0 flex items-center justify-center rounded-md"
                          style={{
                            width: 26, height: 26,
                            background: active ? "rgba(184,146,58,0.18)" : "rgba(255,255,255,0.05)",
                            transition: "background-color 120ms ease",
                          }}
                        >
                          <item.icon
                            style={{
                              width: 13, height: 13,
                              color: active ? "#D4A800" : "rgba(255,255,255,0.60)",
                              transition: "color 120ms ease",
                              flexShrink: 0,
                            }}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p
                              className="text-[12.5px] leading-none truncate"
                              style={{
                                fontWeight: active ? 600 : 500,
                                color: active ? "#D4A800" : "rgba(255,255,255,0.82)",
                                transition: "color 120ms ease",
                              }}
                            >
                              {item.label}
                            </p>
                            {item.badgeKey && hasRecoveryAccess && (recoveryBadgeCounts[item.badgeKey] ?? 0) > 0 && (
                              <span
                                className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold leading-none flex-shrink-0"
                                style={{ background: "#B8923A", color: "#fff" }}
                              >
                                {(recoveryBadgeCounts[item.badgeKey] ?? 0) > 99 ? "99+" : recoveryBadgeCounts[item.badgeKey]}
                              </span>
                            )}
                          </div>
                          <p
                            className="text-[10px] mt-0.5 truncate"
                            style={{ color: "rgba(255,255,255,0.45)", transition: "color 120ms ease" }}
                          >
                            {item.description}
                          </p>
                        </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* ── Footer — user info + logout ── */}
        <div
          className="px-3.5 py-3"
          style={{ borderTop: "1px solid rgba(255,255,255,0.07)", position: "relative", zIndex: 1 }}
        >
          <div className="flex items-center gap-2 mb-2.5">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold text-white"
              style={{
                background: "linear-gradient(135deg, #2E6035 0%, #B8923A 100%)",
                border: "1.5px solid rgba(184,146,58,0.3)",
              }}
            >
              {user?.name?.charAt(0).toUpperCase() ?? "?"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12.5px] font-semibold truncate leading-none" style={{ color: "rgba(255,255,255,0.90)" }}>
                {user?.name ?? "—"}
              </p>
              <p className="text-[10px] truncate mt-0.5" style={{ color: "rgba(255,255,255,0.45)" }}>{user?.email ?? "—"}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-1.5 w-full"
            style={{ fontSize: "11.5px", color: "rgba(255,255,255,0.50)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", transition: "color 120ms ease" }}
            onMouseEnter={e => (e.currentTarget.style.color = "#F87171")}
            onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.50)")}
          >
            <LogOut style={{ width: 12, height: 12 }} />
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
