/**
 * AdminPortalLayout — KINGA Platform Administration Control Tower
 *
 * Permanent navigation shell for all /admin/* routes.
 * Design: deep charcoal sidebar (#111827) with amber/gold accent for admin identity.
 * Five sections, every route reachable in ≤2 clicks.
 *
 * Sections:
 *   1. Platform Administration  — overview, panel beater approvals, tier management
 *   2. Tenant Management        — tenants list, registration, role config, workflow config
 *   3. Intelligence & Monitoring — pipeline health, observability, physics, integrity, learning
 *   4. Governance & Audit       — escalation queue, workflow templates, audit log, market quotes
 *   5. Platform Operations      — platform overview, user roles, impersonation, operations centre
 *   6. Security                 — seed data (dev), workflow settings
 */
import { Link, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { NotificationBell } from "@/components/NotificationBell";
import { GlobalSearchBar } from "@/components/search/GlobalSearchBar";
import { cn } from "@/lib/utils";
import { useState, ReactNode } from "react";
import KingaLogo from "@/components/KingaLogo";
import {
  LayoutDashboard,
  Building2,
  UserCog,
  Settings,
  Activity,
  ShieldAlert,
  Brain,
  BarChart3,
  GitBranch,
  Users,
  Zap,
  Database,
  FileText,
  AlertTriangle,
  TrendingUp,
  Package,
  Cpu,
  Eye,
  Globe,
  LogOut,
  ChevronDown,
  ChevronRight,
  Wrench,
  Shield,
  BookOpen,
  DollarSign,
  Target,
  Search,
  FlaskConical,
  Network,
  ScrollText,
  UserCheck,
} from "lucide-react";
import { Clock, PlusCircle } from "lucide-react";

// ─── Nav definition ────────────────────────────────────────────────────────

type NavItem = {
  label: string;
  href: string;
  icon: React.ElementType;
  description: string;
};

type NavSection = {
  title: string;
  icon: React.ElementType;
  items: NavItem[];
  defaultOpen?: boolean;
};

const NAV_SECTIONS: NavSection[] = [
  {
    title: "Platform Administration",
    icon: LayoutDashboard,
    defaultOpen: true,
    items: [
      { label: "Admin Overview", href: "/admin", icon: LayoutDashboard, description: "Panel beaters, analytics, overview" },
      { label: "Tier Management", href: "/admin/tier-management", icon: Target, description: "Insurer and assessor tiers" },
      { label: "Revenue Dashboard", href: "/admin/revenue", icon: DollarSign, description: "Platform revenue and billing" },
      { label: "Monetization", href: "/admin/monetization", icon: TrendingUp, description: "Usage metrics and projections" },
      { label: "Operational Health", href: "/admin/operational-health", icon: Activity, description: "System health overview" },
    ],
  },
  {
    title: "Tenant Management",
    icon: Building2,
    defaultOpen: true,
    items: [
      { label: "All Tenants", href: "/admin/tenants", icon: Building2, description: "View and manage all tenants" },
      { label: "Register Tenant", href: "/admin/tenants/register", icon: UserCheck, description: "Onboard a new tenant" },
      { label: "Workflow Settings", href: "/admin/workflow-settings", icon: Settings, description: "SLA, thresholds, currency" },
    ],
  },
  {
    title: "Intelligence & Monitoring",
    icon: Brain,
    defaultOpen: false,
    items: [
      { label: "Pipeline Health", href: "/admin/pipeline-health", icon: Activity, description: "Per-run stage health" },
      { label: "Observability", href: "/admin/observability", icon: Eye, description: "Platform observability metrics" },
      { label: "Physics Accuracy", href: "/admin/physics-accuracy", icon: Cpu, description: "Physics engine calibration" },
      { label: "Integrity Metrics", href: "/admin/integrity-metrics", icon: ShieldAlert, description: "Data integrity validation" },
      { label: "Learning Dashboard", href: "/admin/learning", icon: Brain, description: "KINGA learning and ground truth" },
      { label: "Market Quotes", href: "/admin/market-quotes", icon: Database, description: "Market benchmark ingestion" },
    ],
  },
  {
    title: "Governance & Audit",
    icon: ScrollText,
    defaultOpen: false,
    items: [
      { label: "Provision Tenant", href: "/admin/tenant-provisioning", icon: PlusCircle, description: "Create a new tenant with full configuration" },
      { label: "Network Oversight", href: "/admin/network", icon: Network, description: "Insurers, agencies, panel beaters, assessors, fleet, engineers" },
      { label: "Escalation Queue", href: "/admin/escalation", icon: AlertTriangle, description: "Claims requiring escalation" },
      { label: "Workflow Templates", href: "/admin/workflows", icon: GitBranch, description: "Workflow configuration" },
    ],
  },
  {
    title: "Governance & Audit",
    icon: ScrollText,
    defaultOpen: false,
    items: [
      { label: "Audit Log", href: "/admin/audit-log", icon: ScrollText, description: "Full tamper-evident audit trail" },
      { label: "User Management", href: "/admin/users", icon: UserCog, description: "All users, roles, deactivation" },
      { label: "Security Events", href: "/admin/security-events", icon: Shield, description: "Role changes, access denials, overrides" },
      { label: "View As", href: "/admin/view-as", icon: Eye, description: "Impersonate any user for QA testing" },
    ],
  },
  {
    title: "Platform Operations",
    icon: Globe,
    defaultOpen: false,
    items: [
      { label: "Platform Overview", href: "/platform/overview", icon: Globe, description: "Cross-tenant platform view" },
      { label: "User Role Manager", href: "/platform/user-role-manager", icon: UserCog, description: "Assign and audit user roles" },
      { label: "Operations Centre", href: "/platform/operations", icon: Network, description: "Jobs, queues, AI stats" },
      { label: "Marketplace", href: "/platform/marketplace", icon: Package, description: "Provider management" },
      { label: "Impersonate User", href: "/platform/impersonate", icon: Users, description: "Super-admin impersonation" },
    ],
  },
  {
    title: "Security",
    icon: Shield,
    defaultOpen: false,
    items: [
      { label: "Seed Data", href: "/admin/seed-data", icon: FlaskConical, description: "Dev/ops data seeding" },
    ],
  },
];

// ─── Section component ─────────────────────────────────────────────────────

function NavSection({ section, currentPath }: { section: NavSection; currentPath: string }) {
  const [open, setOpen] = useState(section.defaultOpen ?? false);
  const SectionIcon = section.icon;
  const isActive = section.items.some(item => currentPath === item.href || currentPath.startsWith(item.href + "/"));

  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen(v => !v)}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs font-semibold uppercase tracking-wider transition-colors",
          isActive
            ? "text-amber-400 bg-amber-400/10"
            : "text-gray-400 hover:text-gray-200 hover:bg-white/5"
        )}
      >
        <SectionIcon className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1 text-left">{section.title}</span>
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </button>
      {open && (
        <div className="mt-0.5 ml-2 pl-2 border-l border-white/10 space-y-0.5">
          {section.items.map(item => {
            const Icon = item.icon;
            const active = currentPath === item.href || currentPath.startsWith(item.href + "/");
            return (
              <Link key={item.href} href={item.href}>
                <div
                  className={cn(
                    "flex items-center gap-2.5 px-2.5 py-1.5 rounded-md cursor-pointer transition-colors text-sm",
                    active
                      ? "bg-amber-400/15 text-amber-300 font-medium"
                      : "text-gray-400 hover:text-gray-100 hover:bg-white/5"
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main layout ───────────────────────────────────────────────────────────

interface AdminPortalLayoutProps {
  children: ReactNode;
  title?: string;
}

export default function AdminPortalLayout({ children, title }: AdminPortalLayoutProps) {
  const { user, logout } = useAuth();
  const [location] = useLocation();

  return (
    <div className="flex h-screen bg-gray-950 text-gray-100 overflow-hidden">
      {/* ── Sidebar ── */}
      <aside className="w-64 shrink-0 flex flex-col bg-gray-900 border-r border-white/10 overflow-y-auto">
        {/* Logo + brand */}
        <div className="px-4 py-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2.5">
            <KingaLogo size="sm" showText={false} />
            <div>
              <p className="text-xs font-bold text-amber-400 uppercase tracking-widest">KINGA</p>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider">Control Tower</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 py-3 space-y-0.5">
          {NAV_SECTIONS.map(section => (
            <NavSection key={section.title} section={section} currentPath={location} />
          ))}
        </nav>

        {/* User profile + logout */}
        <div className="px-3 py-3 border-t border-white/10 shrink-0">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-7 w-7 rounded-full bg-amber-400/20 flex items-center justify-center text-amber-400 text-xs font-bold shrink-0">
              {user?.name?.charAt(0)?.toUpperCase() ?? "A"}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-gray-200 truncate">{user?.name ?? "Admin"}</p>
              <p className="text-[10px] text-gray-500 capitalize">{user?.role ?? "admin"}</p>
            </div>
          </div>
          <button
            onClick={() => logout()}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-gray-400 hover:text-red-400 hover:bg-red-400/10 transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-12 shrink-0 flex items-center justify-between px-6 bg-gray-900/50 border-b border-white/10 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-semibold text-gray-100">
              {title ?? "Platform Administration"}
            </h1>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-400/15 text-amber-400 font-medium uppercase tracking-wider">
              Control Tower
            </span>
          </div>
          <div className="flex items-center gap-2">
            <GlobalSearchBar variant="icon" />
            <NotificationBell size="sm" />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto bg-gray-950">
          {children}
        </main>
      </div>
    </div>
  );
}
