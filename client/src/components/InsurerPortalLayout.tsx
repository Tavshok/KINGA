/**
 * InsurerPortalLayout
 *
 * Persistent sidebar layout for all insurer sub-role portal pages.
 * The sidebar is ALWAYS visible — no collapsibles, no pull-downs.
 * Nav items are filtered by the current user's insurerRole so each
 * sub-role sees only their relevant sections.
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
  GitBranch,
  UserCog,
  Wrench,
  FileText,
  AlertCircle,
  Network,
  FileBarChart,
  ChevronRight,
  LogOut,
  Users,
  Search,
  Car,
  Zap,
  Settings,
  Activity,
  BookOpen,
  DollarSign,
  Scale,
  Target,
  CheckSquare,
  Eye,
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
// "Push to processor / assessor / risk manager" are ACTION BUTTONS on claim rows,
// not sidebar navigation items.
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
        { label: "Intake Queue", description: "New claims awaiting assignment", href: "/insurer-portal/claims-manager", icon: ClipboardList },
        { label: "Active Claims", description: "Claims in progress", href: "/insurer-portal/claims-manager", icon: Activity },
        { label: "Review Queue", description: "Ready for final review", href: "/insurer-portal/claims-manager", icon: CheckSquare },
        { label: "Processed Claims", description: "Closed and settled history", href: "/insurer-portal/claims-manager", icon: BookOpen },
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
        { label: "Panel Beater Performance", description: "Repairer quality and cost data", href: "/insurer/panel-beater-performance", icon: Car },
      ],
    },
    {
      title: "Administration",
      items: [
        { label: "Workflow Settings", description: "Automation rules and thresholds", href: "/admin/workflows", icon: Settings },
        { label: "Escalation Queue", description: "Claims escalated for review", href: "/admin/escalation", icon: ShieldAlert },
        { label: "Assessors", description: "Manage assigned assessors", href: "/assessors", icon: Users },
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
        { label: "Intake Queue", description: "New claims to process", href: "/insurer-portal/claims-processor", icon: ClipboardList },
        { label: "In Progress", description: "Claims being actively worked", href: "/insurer-portal/claims-processor", icon: Activity },
        { label: "Completed Today", description: "Claims processed today", href: "/insurer-portal/claims-processor", icon: CheckSquare },
      ],
    },
    {
      title: "Tools",
      items: [
        { label: "Claims Triage", description: "Full triage and verification", href: "/insurer/claims/triage", icon: Eye },
        { label: "Batch Export", description: "Export claims data", href: "/insurer/batch-export", icon: FileText },
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
        { label: "Approval Queue", description: "Claims awaiting technical approval", href: "/insurer-portal/risk-manager", icon: CheckSquare },
        { label: "High-Value Claims", description: "Claims above financial threshold", href: "/insurer-portal/risk-manager", icon: DollarSign },
        { label: "Escalations", description: "Claims escalated from processors", href: "/insurer-portal/risk-manager", icon: AlertCircle },
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
        { label: "Savings Tracker", description: "Cost savings and financial impact", href: "/insurer-portal/executive", icon: TrendingUp },
        { label: "Fraud Analytics", description: "Fraud detection performance", href: "/insurer/fraud-analytics", icon: ShieldAlert },
        { label: "Repairer Intelligence", description: "Panel beater performance data", href: "/insurer/panel-beater-performance", icon: Car },
      ],
    },
    {
      title: "Analytics",
      items: [
        { label: "Workflow Analytics", description: "Processing efficiency metrics", href: "/insurer-portal/workflow-analytics", icon: BarChart3 },
        { label: "Reports Centre", description: "Generate executive reports", href: "/insurer-portal/reports-centre", icon: FileBarChart },
        { label: "Relationship Intelligence", description: "Entity network analysis", href: "/insurer-portal/relationship-intelligence", icon: Network },
      ],
    },
    {
      title: "Governance",
      items: [
        { label: "Governance Dashboard", description: "Compliance and audit overview", href: "/insurer-portal/governance", icon: Scale },
        { label: "Automation Policies", description: "AI decision rules and thresholds", href: "/insurer/automation-policies", icon: Target },
        { label: "Assessors", description: "Assessor network management", href: "/assessors", icon: Users },
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
        { label: "My Queue", description: "Claims assigned to me", href: "/insurer-portal/internal-assessor", icon: ClipboardList },
        { label: "In Progress", description: "Assessments being written", href: "/insurer-portal/internal-assessor", icon: Activity },
        { label: "Completed", description: "Submitted assessments", href: "/insurer-portal/internal-assessor", icon: CheckSquare },
      ],
    },
    {
      title: "Tools",
      items: [
        { label: "Fraud Analytics", description: "Fraud signals and patterns", href: "/insurer/fraud-analytics", icon: ShieldAlert },
        { label: "Reports Centre", description: "Assessment report archive", href: "/insurer-portal/reports-centre", icon: FileBarChart },
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
        { label: "Governance", description: "Compliance and audit", href: "/insurer-portal/governance", icon: Scale },
        { label: "Workflow Settings", description: "Automation rules", href: "/admin/workflows", icon: Settings },
        { label: "Assessors", description: "Manage assessor network", href: "/assessors", icon: Users },
        { label: "Reports Centre", description: "Report catalogue", href: "/insurer-portal/reports-centre", icon: FileBarChart },
      ],
    },
    {
      title: "Analytics",
      items: [
        { label: "Workflow Analytics", description: "Processing metrics", href: "/insurer-portal/workflow-analytics", icon: BarChart3 },
        { label: "Fraud Analytics", description: "Fraud detection overview", href: "/insurer/fraud-analytics", icon: ShieldAlert },
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

// ─── Component ─────────────────────────────────────────────────────────────

export default function InsurerPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const insurerRole = user?.insurerRole ?? null;

  // Pick the nav config for this role — fall back to default
  const visibleSections = (insurerRole && navByRole[insurerRole]) ?? defaultNav;

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-background">
      {/* ── Persistent sidebar ── */}
      <aside className="w-60 flex-shrink-0 bg-white dark:bg-card border-r border-border flex flex-col">
        {/* Brand */}
        <div className="px-4 py-4 border-b border-border flex items-center gap-2.5">
          <img
            src="https://files.manuscdn.com/user_upload_by_module/session_file/310419663031527958/urRWiykzCdbYRWJQ.png"
            alt="KINGA"
            className="h-8 w-auto object-contain"
          />
          <div>
            <div className="text-xs font-semibold leading-none text-foreground">KINGA</div>
            <div className="text-[10px] text-muted-foreground leading-none mt-0.5 capitalize">
              {insurerRole ? insurerRole.replace(/_/g, " ") : "Insurer Portal"}
            </div>
          </div>
        </div>

        {/* Nav — all sections always visible */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
          {visibleSections.map((section) => (
            <div key={section.title}>
              <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {section.title}
              </p>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const hrefBase = item.href.split("#")[0];
                  const active =
                    location === hrefBase ||
                    (hrefBase.length > 1 && location.startsWith(hrefBase));
                  return (
                    <Link key={item.href} href={item.href}>
                      <a
                        className={cn(
                          "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors group",
                          active
                            ? "bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 font-medium"
                            : "text-muted-foreground hover:bg-accent hover:text-foreground"
                        )}
                      >
                        <item.icon
                          className={cn(
                            "w-4 h-4 flex-shrink-0",
                            active
                              ? "text-teal-600 dark:text-teal-400"
                              : "text-muted-foreground group-hover:text-foreground"
                          )}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="leading-none truncate">{item.label}</div>
                          <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
                            {item.description}
                          </div>
                        </div>
                        {active && (
                          <ChevronRight className="w-3 h-3 text-teal-500 flex-shrink-0" />
                        )}
                      </a>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer — user info + logout */}
        <div className="px-4 py-3 border-t border-border">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-full bg-teal-100 dark:bg-teal-900/40 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-semibold text-teal-700 dark:text-teal-300">
                {user?.name?.charAt(0).toUpperCase() ?? "?"}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate text-foreground">{user?.name ?? "—"}</p>
              <p className="text-[10px] text-muted-foreground truncate">{user?.email ?? "—"}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors w-full"
          >
            <LogOut className="w-3 h-3" />
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
