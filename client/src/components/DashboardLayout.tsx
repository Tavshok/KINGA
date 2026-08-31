/**
 * PURPOSE: Render the Dashboard Layout interaction or visual surface within the KINGA client.
 * PRIMARY CALLERS: Role-specific pages and dashboard compositions that provide its state and callbacks.
 * NEVER: Treat client-side presentation state as the source of tenant, role, or workflow authority.
 */

import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { getLoginUrl } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import {
  LayoutDashboard, LogOut, PanelLeft, Users, AlertCircle, Network, FileBarChart,
  ClipboardList, TrendingUp, ShieldAlert, Wrench, FileText, Settings,
  BarChart3, GitBranch, Activity, UserCog, Gavel, ChevronRight
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';
import { Button } from "./ui/button";
import { GlobalSearchBar } from "@/components/search/GlobalSearchBar"; // Epic 5-A
import { NotificationBell } from "@/components/NotificationBell"; // Epic 5-B

/**
 * Build nav items from the server-derived user object.
 * The user.dashboardRoute and user.permissions fields come from auth.me
 * (server/routers.ts) — no role strings are hardcoded here.
 */
function getMenuItems(
  role: string | undefined,
  insurerRole: string | null | undefined,
  dashboardRoute?: string | null,
  permissions?: Record<string, unknown> | null,
) {
  // Platform admin
  if (role === "admin") {
    return [
      { icon: LayoutDashboard, label: "Admin Dashboard",    path: "/admin/dashboard" },
      { icon: Users,           label: "Tenant Management",  path: "/admin/tenants" },
      { icon: Gavel,           label: "Tier Management",    path: "/admin/tier-management" },
      { icon: Activity,        label: "Pipeline Health",    path: "/admin/pipeline-health" },
      { icon: ShieldAlert,     label: "Escalation Queue",   path: "/admin/escalation" },
      { icon: BarChart3,       label: "Integrity Metrics",  path: "/admin/integrity-metrics" },
      { icon: Activity,        label: "Physics Accuracy",   path: "/admin/physics-accuracy" },
      { icon: GitBranch,       label: "Workflows",          path: "/admin/workflows" },
    ];
  }
  // External assessor (top-level role = assessor)
  if (role === "assessor") {
    return [
      { icon: LayoutDashboard, label: "Dashboard",   path: "/assessor/dashboard" },
      { icon: ClipboardList,   label: "My Claims",   path: "/assessor" },
      { icon: TrendingUp,      label: "Performance", path: "/assessor/performance" },
      { icon: Users,           label: "Leaderboard", path: "/assessor/leaderboard" },
    ];
  }
  // Panel beater
  if (role === "panel_beater") {
    return [
      { icon: LayoutDashboard, label: "Dashboard", path: "/panel-beater/dashboard" },
    ];
  }
  // Claimant
  if (role === "claimant") {
    return [
      { icon: LayoutDashboard, label: "My Claims",    path: "/claimant/dashboard" },
      { icon: FileText,        label: "Submit Claim", path: "/claimant/submit-claim" },
    ];
  }

  // Insurer — build nav from server-derived dashboardRoute and permissions.
  // dashboardRoute is the primary dashboard for this sub-role.
  if (role === "insurer" && dashboardRoute) {
    const base = [
      { icon: LayoutDashboard, label: "Portal Home",                path: "/insurer-portal" },
      { icon: AlertCircle,     label: "Exception Hub",              path: "/insurer-portal/exception-intelligence" },
      { icon: Network,         label: "Relationship Intelligence",  path: "/insurer-portal/relationship-intelligence" },
      { icon: FileBarChart,    label: "Reports Centre",             path: "/insurer-portal/reports-centre" },
    ];
    // Add the role-specific primary dashboard link (avoid duplicating Portal Home)
    const dashLabel = (() => {
      if (dashboardRoute.includes("claims-manager"))   return "Claims Manager";
      if (dashboardRoute.includes("claims-processor")) return "Claims Processor";
      if (dashboardRoute.includes("risk-manager"))     return "Risk Manager";
      if (dashboardRoute.includes("executive"))        return "Executive Dashboard";
      if (dashboardRoute.includes("internal-assessor"))return "Assessor Dashboard";
      if (dashboardRoute.includes("external-assessor"))return "Assessor Dashboard";
      if (dashboardRoute.includes("insurer-admin"))    return "Admin Dashboard";
      return null;
    })();
    const dashIcon = (() => {
      if (dashboardRoute.includes("claims-manager"))   return ClipboardList;
      if (dashboardRoute.includes("claims-processor")) return FileText;
      if (dashboardRoute.includes("risk-manager"))     return ShieldAlert;
      if (dashboardRoute.includes("executive"))        return TrendingUp;
      if (dashboardRoute.includes("internal-assessor"))return Wrench;
      if (dashboardRoute.includes("external-assessor"))return Wrench;
      if (dashboardRoute.includes("insurer-admin"))    return Settings;
      return LayoutDashboard;
    })();
    const items = dashLabel ? [...base, { icon: dashIcon, label: dashLabel, path: dashboardRoute }] : base;
    // Add analytics/governance links based on server-derived permissions
    if (permissions?.canAccessAnalytics)  items.push({ icon: BarChart3, label: "Workflow Analytics", path: "/insurer-portal/workflow-analytics" });
    if (permissions?.canViewAnalytics)    items.push({ icon: BarChart3, label: "Fraud Analytics",    path: "/insurer/fraud-analytics" });
    if (permissions?.canManageWorkflowSettings) {
      items.push({ icon: ShieldAlert, label: "Escalation Queue", path: "/admin/escalation" });
      items.push({ icon: GitBranch,   label: "Workflows",        path: "/admin/workflows" });
    }
    return items;
  }

  // Fallback
  return [
    { icon: LayoutDashboard, label: "Dashboard",    path: "/" },
    { icon: FileBarChart,    label: "Reports Centre", path: "/insurer-portal/reports-centre" },
  ];
}

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) {
    return <DashboardLayoutSkeleton />
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full">
          <img 
            src="https://files.manuscdn.com/user_upload_by_module/session_file/310419663031527958/dOfoldGKvKSMqKYG.png" 
            alt="KINGA" 
            className="h-24 w-auto object-contain mb-4"
          />
          <div className="flex flex-col items-center gap-6">
            <h1 className="text-2xl font-semibold tracking-tight text-center">
              Sign in to continue
            </h1>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              Access to this dashboard requires authentication. Continue to launch the login flow.
            </p>
          </div>
          <Button
            onClick={() => {
              window.location.href = getLoginUrl();
            }}
            size="lg"
            className="w-full shadow-lg hover:shadow-xl transition-all"
          >
            Sign in
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
};

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: DashboardLayoutContentProps) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const menuItems = getMenuItems(
    user?.role,
    user?.insurerRole,
    (user as any)?.dashboardRoute,
    (user as any)?.permissions,
  );
  const activeMenuItem = menuItems.find(item => item.path === location);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (isCollapsed) {
      setIsResizing(false);
    }
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          className="border-r-0"
          disableTransition={isResizing}
        >
          <SidebarHeader className="h-16 justify-center">
            <div className="flex items-center gap-3 px-2 transition-all w-full">
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 flex items-center justify-center hover:bg-accent rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-4 w-4 text-muted-foreground" />
              </button>
              {!isCollapsed ? (
                <div className="flex items-center gap-2 min-w-0">
                  <img 
                    src="https://files.manuscdn.com/user_upload_by_module/session_file/310419663031527958/dOfoldGKvKSMqKYG.png" 
                    alt="KINGA" 
                    className="h-12 w-auto object-contain"
                  />
                </div>
              ) : null}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0">
            <SidebarMenu className="px-2 py-2">
              {menuItems.map(item => {
                const isActive = location === item.path;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setLocation(item.path)}
                      tooltip={item.label}
                      className={`h-10 transition-all`}
                      style={isActive ? {
                        background: '#F0F7F2',
                        color: '#3C7844',
                        borderLeft: '3px solid #3C7844',
                        paddingLeft: '9px',
                        fontWeight: 600,
                      } : {}}
                    >
                      <item.icon
                        className="h-4 w-4"
                        style={isActive ? { color: '#3C7844' } : {}}
                      />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter className="p-3">
            {/* Global Search — Epic 5-A */}
            <div className="mb-2 group-data-[collapsible=icon]:hidden">
              <GlobalSearchBar variant="bar" placeholder="Search…" />
            </div>
            {/* Notification Bell — Epic 5-B */}
            <div className="mb-2 group-data-[collapsible=icon]:hidden">
              <NotificationBell className="w-full justify-start" />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-accent/50 transition-colors w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="h-9 w-9 border shrink-0">
                    <AvatarFallback className="text-xs font-medium">
                      {user?.name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-medium truncate leading-none">
                      {user?.name || "-"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-1.5">
                      {user?.email || "-"}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => {
            if (isCollapsed) return;
            setIsResizing(true);
          }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset>
        {isMobile && (
          <div className="flex border-b h-14 items-center justify-between bg-background/95 px-2 backdrop-blur supports-[backdrop-filter]:backdrop-blur sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-9 w-9 rounded-lg bg-background" />
              <div className="flex items-center gap-3">
                <div className="flex flex-col gap-1">
                  <span className="tracking-tight text-foreground">
                    {activeMenuItem?.label ?? "Menu"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
        <main className="flex-1 overflow-auto">{children}</main>
      </SidebarInset>
    </>
  );
}
