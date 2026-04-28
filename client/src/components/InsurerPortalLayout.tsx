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
} from "lucide-react";

// ─── Nav definition ────────────────────────────────────────────────────────

type NavItem = {
  label: string;
  href: string;
  icon: React.ElementType;
  description: string;
  roles?: string[]; // if set, only shown to these insurerRoles
};

type NavSection = {
  title: string;
  items: NavItem[];
  roles?: string[]; // if set, entire section only shown to these insurerRoles
};

const sections: NavSection[] = [
  {
    title: "Home",
    items: [
      {
        label: "Portal Home",
        href: "/insurer-portal",
        icon: LayoutDashboard,
        description: "Role selection & overview",
      },
    ],
  },
  {
    title: "Claims Operations",
    roles: ["claims_manager", "claims_processor", "risk_manager", "executive", "insurer_admin"],
    items: [
      {
        label: "Claims Manager",
        href: "/insurer-portal/claims-manager",
        icon: ClipboardList,
        description: "Review & close claims",
        roles: ["claims_manager"],
      },
      {
        label: "Claims Processor",
        href: "/insurer-portal/claims-processor",
        icon: FileText,
        description: "Process incoming claims",
        roles: ["claims_processor"],
      },
      {
        label: "Risk Manager",
        href: "/insurer-portal/risk-manager",
        icon: ShieldAlert,
        description: "Technical approvals",
        roles: ["risk_manager"],
      },
      {
        label: "Internal Assessor",
        href: "/insurer-portal/internal-assessor",
        icon: Wrench,
        description: "Damage assessment",
        roles: ["assessor_internal"],
      },
    ],
  },
  {
    title: "Intelligence",
    roles: ["claims_manager", "executive", "risk_manager", "insurer_admin"],
    items: [
      {
        label: "Exception Hub",
        href: "/insurer-portal/exception-intelligence",
        icon: AlertCircle,
        description: "Anomaly & exception flags",
      },
      {
        label: "Fraud Analytics",
        href: "/insurer/fraud-analytics",
        icon: Search,
        description: "Fraud pattern detection",
        roles: ["claims_manager", "executive", "risk_manager"],
      },
      {
        label: "Relationship Intelligence",
        href: "/insurer-portal/relationship-intelligence",
        icon: Network,
        description: "Entity relationship maps",
      },
    ],
  },
  {
    title: "Analytics",
    roles: ["executive", "claims_manager", "risk_manager", "insurer_admin"],
    items: [
      {
        label: "Executive Dashboard",
        href: "/insurer-portal/executive",
        icon: TrendingUp,
        description: "Portfolio & ROI overview",
        roles: ["executive"],
      },
      {
        label: "Workflow Analytics",
        href: "/insurer-portal/workflow-analytics",
        icon: BarChart3,
        description: "Pipeline performance",
        roles: ["executive", "claims_manager", "risk_manager"],
      },
      {
        label: "Reports Centre",
        href: "/insurer-portal/reports-centre",
        icon: FileBarChart,
        description: "Downloadable reports",
      },
      {
        label: "Panel Beater Performance",
        href: "/insurer/panel-beater-performance",
        icon: Car,
        description: "Repairer benchmarks",
        roles: ["executive", "claims_manager"],
      },
    ],
  },
  {
    title: "Administration",
    roles: ["executive", "insurer_admin", "claims_manager"],
    items: [
      {
        label: "Governance",
        href: "/insurer-portal/governance",
        icon: UserCog,
        description: "Policies & compliance",
        roles: ["executive", "insurer_admin"],
      },
      {
        label: "Workflows",
        href: "/admin/workflows",
        icon: GitBranch,
        description: "Workflow templates",
        roles: ["executive", "insurer_admin", "claims_manager"],
      },
      {
        label: "Escalation Queue",
        href: "/admin/escalation",
        icon: Zap,
        description: "Escalated claims",
        roles: ["claims_manager", "executive", "insurer_admin"],
      },
      {
        label: "Automation Policies",
        href: "/insurer/automation-policies",
        icon: Settings,
        description: "Auto-assignment rules",
        roles: ["executive", "insurer_admin"],
      },
      {
        label: "Assessors",
        href: "/assessors",
        icon: Users,
        description: "Manage assessors",
        roles: ["executive", "insurer_admin", "claims_manager"],
      },
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

  // Filter sections and items based on the current user's insurerRole
  const visibleSections = sections
    .filter((s) => !s.roles || !insurerRole || s.roles.includes(insurerRole))
    .map((s) => ({
      ...s,
      items: s.items.filter(
        (item) => !item.roles || !insurerRole || item.roles.includes(insurerRole)
      ),
    }))
    .filter((s) => s.items.length > 0);

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
                  const active =
                    location === item.href ||
                    (item.href !== "/insurer-portal" && location.startsWith(item.href));
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
