/**
 * PlatformLayout
 *
 * Shared layout wrapper for all /platform/* super-admin pages.
 * Provides a persistent sidebar with navigation links to every platform tool.
 */

import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Store,
  UserCheck,
  Bug,
  Activity,
  ChevronRight,
  Shield,
  Users,
  FlaskConical,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  {
    label: "Overview",
    href: "/platform/overview",
    icon: LayoutDashboard,
    description: "Cross-tenant metrics",
  },
  {
    label: "Marketplace",
    href: "/platform/marketplace",
    icon: Store,
    description: "Provider approvals",
  },
  {
    label: "Impersonate",
    href: "/platform/impersonate",
    icon: UserCheck,
    description: "Role impersonation",
  },
  {
    label: "Claim Debug",
    href: "/platform/claim-debug",
    icon: Bug,
    description: "Integrity checker",
  },
  {
    label: "Pipeline Debug",
    href: "/platform/pipeline-debug",
    icon: Wrench,
    description: "10-stage pipeline diagnostic",
  },
  {
    label: "System Health",
    href: "/platform/system-health",
    icon: Activity,
    description: "Green/Amber/Red status",
  },
  {
    label: "Role Manager",
    href: "/platform/user-role-manager",
    icon: Users,
    description: "Assign user roles",
  },
  {
    label: "Claim Simulator",
    href: "/platform/claim-simulator",
    icon: FlaskConical,
    description: "Synthetic claim testing",
  },
];

export default function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [location] = useLocation();

  return (
    <div className="flex min-h-screen bg-gray-950 text-gray-100">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 border-r border-gray-800 flex flex-col">
        {/* Logo / Brand */}
        <div className="px-4 py-4 border-b border-gray-800 flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-purple-600 flex items-center justify-center flex-shrink-0">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="text-xs font-semibold text-white leading-none">KINGA</div>
            <div className="text-[10px] text-gray-500 leading-none mt-0.5">Super Admin</div>
          </div>
        </div>

        {/* Nav items */}
        <nav className="flex-1 py-3 px-2 space-y-0.5">
          {navItems.map((item) => {
            const active =
              location === item.href ||
              (item.href !== "/platform/overview" && location.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href}>
                <a
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors group",
                    active
                      ? "bg-purple-900/60 text-purple-200"
                      : "text-gray-400 hover:bg-gray-800 hover:text-gray-100"
                  )}
                >
                  <item.icon
                    className={cn(
                      "w-4 h-4 flex-shrink-0",
                      active ? "text-purple-300" : "text-gray-500 group-hover:text-gray-300"
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium leading-none">{item.label}</div>
                    <div className="text-[10px] text-gray-600 group-hover:text-gray-500 mt-0.5 truncate">
                      {item.description}
                    </div>
                  </div>
                  {active && <ChevronRight className="w-3 h-3 text-purple-400 flex-shrink-0" />}
                </a>
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-800">
          <Link href="/">
            <a className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
              ← Back to app
            </a>
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
