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

// Role-aware nav items — each persona sees only their relevant sections
function getMenuItems(role: string | undefined, insurerRole: string | null | undefined) {
  // Platform admin
  if (role === "admin" || role === "platform_super_admin") {
    return [
      { icon: LayoutDashboard, label: "Admin Dashboard", path: "/admin/dashboard" },
      { icon: Users, label: "Tenant Management", path: "/admin/tenants" },
      { icon: Gavel, label: "Tier Management", path: "/admin/tier-management" },
      { icon: Activity, label: "Pipeline Health", path: "/admin/pipeline-health" },
      { icon: ShieldAlert, label: "Escalation Queue", path: "/admin/escalation" },
      { icon: BarChart3, label: "Integrity Metrics", path: "/admin/integrity-metrics" },
      { icon: GitBranch, label: "Workflows", path: "/admin/workflows" },
    ];
  }
  // Insurer — sub-role aware
  if (role === "insurer") {
    const base = [
      { icon: LayoutDashboard, label: "Portal Home", path: "/insurer-portal" },
      { icon: AlertCircle, label: "Exception Hub", path: "/insurer-portal/exception-intelligence" },
      { icon: Network, label: "Relationship Intelligence", path: "/insurer-portal/relationship-intelligence" },
      { icon: FileBarChart, label: "Reports Centre", path: "/insurer-portal/reports-centre" },
    ];
    if (insurerRole === "executive") {
      return [
        ...base,
        { icon: TrendingUp, label: "Executive Dashboard", path: "/insurer-portal/executive" },
        { icon: BarChart3, label: "Workflow Analytics", path: "/insurer-portal/workflow-analytics" },
        { icon: UserCog, label: "Governance", path: "/insurer-portal/governance" },
      ];
    }
    if (insurerRole === "claims_manager") {
      return [
        ...base,
        { icon: ClipboardList, label: "Claims Manager", path: "/insurer-portal/claims-manager" },
        { icon: BarChart3, label: "Workflow Analytics", path: "/insurer-portal/workflow-analytics" },
        { icon: ShieldAlert, label: "Escalation Queue", path: "/admin/escalation" },
        { icon: GitBranch, label: "Workflows", path: "/admin/workflows" },
      ];
    }
    if (insurerRole === "claims_processor") {
      return [
        ...base,
        { icon: FileText, label: "Claims Processor", path: "/insurer-portal/claims-processor" },
      ];
    }
    if (insurerRole === "risk_manager") {
      return [
        ...base,
        { icon: ShieldAlert, label: "Risk Manager", path: "/insurer-portal/risk-manager" },
        { icon: BarChart3, label: "Workflow Analytics", path: "/insurer-portal/workflow-analytics" },
      ];
    }
    if (insurerRole === "assessor_internal") {
      return [
        ...base,
        { icon: Wrench, label: "Assessor Dashboard", path: "/insurer-portal/internal-assessor" },
      ];
    }
    return base;
  }
  // External assessor
  if (role === "assessor") {
    return [
      { icon: LayoutDashboard, label: "Dashboard", path: "/assessor/dashboard" },
      { icon: ClipboardList, label: "My Claims", path: "/assessor" },
      { icon: TrendingUp, label: "Performance", path: "/assessor/performance" },
      { icon: Users, label: "Leaderboard", path: "/assessor/leaderboard" },
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
      { icon: LayoutDashboard, label: "My Claims", path: "/claimant/dashboard" },
      { icon: FileText, label: "Submit Claim", path: "/claimant/submit-claim" },
    ];
  }
  // Fallback
  return [
    { icon: LayoutDashboard, label: "Dashboard", path: "/" },
    { icon: AlertCircle, label: "Exception Hub", path: "/insurer-portal/exception-intelligence" },
    { icon: Network, label: "Relationship Intelligence", path: "/insurer-portal/relationship-intelligence" },
    { icon: FileBarChart, label: "Reports Centre", path: "/insurer-portal/reports-centre" },
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
            src="https://files.manuscdn.com/user_upload_by_module/session_file/310419663031527958/urRWiykzCdbYRWJQ.png" 
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
  const menuItems = getMenuItems(user?.role, user?.insurerRole);
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
                    src="https://files.manuscdn.com/user_upload_by_module/session_file/310419663031527958/urRWiykzCdbYRWJQ.png" 
                    alt="KINGA" 
                    className="h-12 w-auto object-contain"
                  />
                </div>
              ) : null}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0">
            <SidebarMenu className="px-2 py-1">
              {menuItems.map(item => {
                const isActive = location === item.path;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setLocation(item.path)}
                      tooltip={item.label}
                      className={`h-10 transition-all font-normal`}
                    >
                      <item.icon
                        className={`h-4 w-4 ${isActive ? "text-primary" : ""}`}
                      />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter className="p-3">
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
        <main className="flex-1 p-4">{children}</main>
      </SidebarInset>
    </>
  );
}
