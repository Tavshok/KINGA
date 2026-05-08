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
} from "lucide-react";

// ─── Nav definition ────────────────────────────────────────────────────────

type NavItem = {
  label: string;
  href: string;
  icon: React.ElementType;
  description: string;
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
      ],
    },
    {
      title: "Intelligence",
      items: [
        { label: "Fraud Alerts", description: "FCDI flags requiring action", href: "/insurer/fraud-analytics", icon: AlertCircle },
        { label: "Exception Hub", description: "Anomalies and outliers", href: "/insurer-portal/exception-intelligence", icon: Zap },
        { label: "Relationship Intelligence", description: "Entity web and hotspots", href: "/insurer-portal/relationship-intelligence", icon: Network },
      ],
    },
    {
      title: "Analytics & Reports",
      items: [
        { label: "Workflow Analytics", description: "Processing times and throughput", href: "/insurer-portal/workflow-analytics", icon: BarChart3 },
        { label: "Reports Centre", description: "Generate and download reports", href: "/insurer-portal/reports-centre", icon: FileBarChart },
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
        { label: "AI Assessment Complete", description: "Ready for review", href: "/insurer-portal/claims-processor#ai-flagged", icon: Eye },
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
        { label: "Workflow Analytics", description: "Decision times and outcomes", href: "/insurer-portal/workflow-analytics", icon: BarChart3 },
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

  assessor_external: [
    {
      title: "Overview",
      items: [
        { label: "My Dashboard", description: "Assigned claims and queue", href: "/insurer-portal/external-assessor", icon: LayoutDashboard },
      ],
    },
    {
      title: "Assessments",
      items: [
        { label: "My Queue", description: "Claims assigned to me", href: "/insurer-portal/external-assessor?tab=queue", icon: ClipboardList },
        { label: "In Progress", description: "Assessments being written", href: "/insurer-portal/external-assessor?tab=in-progress", icon: Activity },
        { label: "Completed", description: "Submitted assessments", href: "/insurer-portal/external-assessor?tab=completed", icon: CheckSquare },
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
        { label: "Recovery Dashboard", description: "Queue overview and KPIs", href: "/insurer-portal/recovery", icon: LayoutDashboard },
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
        { label: "Third-Party Profiles", description: "Repeat third-party intelligence", href: "/insurer/vehicle-registry?filter=third-party", icon: Car },
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
        { label: "Portal Home", description: "Role selection and overview", href: "/insurer-portal", icon: LayoutDashboard },
      ],
    },
    {
      title: "Administration",
      items: [
        { label: "Workflow Settings", description: "Automation rules", href: "/admin/workflows", icon: Settings },
        { label: "Assessors", description: "Manage assessor network", href: "/assessors", icon: Users },
      ],
    },
    {
      title: "Analytics & Reports",
      items: [
        { label: "Workflow Analytics", description: "Processing metrics", href: "/insurer-portal/workflow-analytics", icon: BarChart3 },
        { label: "Fraud Analytics", description: "Fraud detection overview", href: "/insurer/fraud-analytics", icon: ShieldAlert },
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
  { prefix: "/insurer-portal/external-assessor",       role: "assessor_external", label: "External Assessor" },
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

// ─── Role badge colours (subtle, consistent) ───────────────────────────────
const ROLE_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  claims_manager:   { bg: "bg-blue-500/15",   text: "text-blue-300",   label: "Claims Manager" },
  claims_processor: { bg: "bg-slate-500/20",  text: "text-slate-300",  label: "Claims Processor" },
  risk_manager:     { bg: "bg-amber-500/15",  text: "text-amber-300",  label: "Risk Manager" },
  executive:        { bg: "bg-violet-500/15", text: "text-violet-300", label: "Executive" },
  assessor_internal:{ bg: "bg-teal-500/15",   text: "text-teal-300",   label: "Internal Assessor" },
  assessor_external:{ bg: "bg-cyan-500/15",   text: "text-cyan-300",   label: "External Assessor" },
  insurer_admin:    { bg: "bg-rose-500/15",   text: "text-rose-300",   label: "Insurer Admin" },
  recovery_officer: { bg: "bg-emerald-500/15", text: "text-emerald-300", label: "Recovery Officer" },
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

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-background">
      {/* ── Persistent sidebar — dark slate, single teal accent ── */}
      <aside
        className="w-64 flex-shrink-0 flex flex-col"
        style={{ background: "#0F172A", borderRight: "1px solid rgba(255,255,255,0.06)" }}
      >
        {/* ── Brand header ── */}
        <div
          className="px-5 py-4 flex items-center gap-3"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
        >
          <img
            src="https://files.manuscdn.com/user_upload_by_module/session_file/310419663031527958/urRWiykzCdbYRWJQ.png"
            alt="KINGA"
            className="h-8 w-auto object-contain flex-shrink-0"
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white leading-none tracking-wide">KINGA</p>
            <p className="text-[10px] text-slate-400 leading-none mt-1">AutoVerify AI</p>
          </div>
        </div>

        {/* ── Role badge ── */}
        {badge && (
          <div className="px-5 pt-3 pb-1">
            <span
              className={cn(
                "inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-medium",
                badge.bg, badge.text
              )}
            >
              {badge.label}
            </span>
          </div>
        )}

        {/* ── Navigation ── */}
        <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-5">
          {visibleSections.map((section) => (
            <div key={section.title}>
              <p
                className="px-2 mb-1.5 text-[10px] font-semibold uppercase tracking-widest"
                style={{ color: "rgba(148,163,184,0.6)" }}
              >
                {section.title}
              </p>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const hrefBase = item.href.split("?")[0].split("#")[0];
                  const active =
                    location === hrefBase ||
                    (hrefBase.length > 1 && location.startsWith(hrefBase));
                  return (
                    <Link key={item.href} href={item.href}>
                      <a
                        className={cn(
                          "flex items-center gap-3 px-2 py-2 rounded-lg text-sm transition-all duration-150 group relative",
                          active
                            ? "text-white"
                            : "text-slate-400 hover:text-slate-100"
                        )}
                        style={
                          active
                            ? {
                                background: "rgba(77,184,168,0.12)",
                                borderLeft: "2px solid #4DB8A8",
                                paddingLeft: "6px",
                              }
                            : {
                                borderLeft: "2px solid transparent",
                              }
                        }
                      >
                        <item.icon
                          className={cn(
                            "w-4 h-4 flex-shrink-0 transition-colors",
                            active
                              ? "text-teal-400"
                              : "text-slate-500 group-hover:text-slate-300"
                          )}
                        />
                        <div className="flex-1 min-w-0">
                          <p
                            className={cn(
                              "text-[13px] leading-none truncate font-medium",
                              active ? "text-white" : "text-slate-300 group-hover:text-white"
                            )}
                          >
                            {item.label}
                          </p>
                          <p className="text-[10px] mt-0.5 truncate text-slate-500 group-hover:text-slate-400">
                            {item.description}
                          </p>
                        </div>
                      </a>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* ── Footer — user info + logout ── */}
        <div
          className="px-4 py-3"
          style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div className="flex items-center gap-2.5 mb-2.5">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold text-white"
              style={{ background: "linear-gradient(135deg, #4DB8A8 0%, #2B4C7E 100%)" }}
            >
              {user?.name?.charAt(0).toUpperCase() ?? "?"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-white truncate leading-none">
                {user?.name ?? "—"}
              </p>
              <p className="text-[10px] text-slate-500 truncate mt-0.5">{user?.email ?? "—"}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-2 text-[12px] text-slate-500 hover:text-rose-400 transition-colors w-full"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
