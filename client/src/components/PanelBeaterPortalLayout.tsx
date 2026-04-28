/**
 * PanelBeaterPortalLayout
 *
 * Persistent sidebar layout for all panel beater pages.
 * All sections always visible — no collapsibles.
 */
import { Link, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  FileText,
  TrendingUp,
  ChevronRight,
  LogOut,
  ClipboardList,
  DollarSign,
} from "lucide-react";

const sections = [
  {
    title: "My Work",
    items: [
      {
        label: "Dashboard",
        href: "/panel-beater/dashboard",
        icon: LayoutDashboard,
        description: "Overview & active quotes",
      },
      {
        label: "Quote Requests",
        href: "/panel-beater/dashboard",
        icon: ClipboardList,
        description: "Claims awaiting quotes",
      },
    ],
  },
  {
    title: "Financials",
    items: [
      {
        label: "Quote History",
        href: "/panel-beater/dashboard",
        icon: DollarSign,
        description: "Submitted quotes & status",
      },
    ],
  },
  {
    title: "Performance",
    items: [
      {
        label: "My Performance",
        href: "/panel-beater/dashboard",
        icon: TrendingUp,
        description: "Cost accuracy & quality score",
      },
    ],
  },
];

export default function PanelBeaterPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-background">
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
            <div className="text-[10px] text-muted-foreground leading-none mt-0.5">
              Panel Beater Portal
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
          {sections.map((section) => (
            <div key={section.title}>
              <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {section.title}
              </p>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const active = location === item.href;
                  return (
                    <Link key={item.label} href={item.href}>
                      <a
                        className={cn(
                          "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors group",
                          active
                            ? "bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 font-medium"
                            : "text-muted-foreground hover:bg-accent hover:text-foreground"
                        )}
                      >
                        <item.icon
                          className={cn(
                            "w-4 h-4 flex-shrink-0",
                            active
                              ? "text-orange-600 dark:text-orange-400"
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
                          <ChevronRight className="w-3 h-3 text-orange-500 flex-shrink-0" />
                        )}
                      </a>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-full bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-semibold text-orange-700 dark:text-orange-300">
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

      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
