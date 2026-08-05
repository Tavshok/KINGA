/**
 * EngineerWorkspaceLayout
 *
 * Persistent sidebar layout for all Engineering Workspace pages.
 * Epic 3 — E3-T11 to E3-T18
 *
 * Design: Dark slate sidebar (#0F1A14), gold accent (#D4A800), cream body (#F9F8F5).
 * Follows the same structural pattern as AssessorPortalLayout.
 */
import { Link, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { GlobalSearchBar } from "@/components/search/GlobalSearchBar"; // Epic 5-A
import { NotificationBell } from "@/components/NotificationBell"; // Epic 5-B
import {
  LayoutDashboard,
  ClipboardList,
  Ruler,
  Eye,
  Camera,
  Brain,
  GitMerge,
  CheckSquare,
  LogOut,
  HardHat,
  FolderOpen,
} from "lucide-react";

const KINGA_LOGO =
  "https://files.manuscdn.com/user_upload_by_module/session_file/310419663031527958/dOfoldGKvKSMqKYG.png";

const sections = [
  {
    title: "Overview",
    items: [
      {
        label: "Dashboard",
        href: "/engineer/dashboard",
        icon: LayoutDashboard,
        description: "Active inspections & KPIs",
      },
      {
        label: "Assignments",
        href: "/engineer/assignments",
        icon: ClipboardList,
        description: "Pending & upcoming",
      },
      {
        label: "All Inspections",
        href: "/engineer/inspections",
        icon: HardHat,
        description: "Full inspection register",
      },
      {
        label: "Projects",
        href: "/engineer/projects",
        icon: FolderOpen,
        description: "Group inspections by project",
      },
    ],
  },
  {
    title: "Inspection Work",
    items: [
      {
        label: "Evidence",
        href: "/engineer/inspections",
        icon: Camera,
        description: "Photos & documents",
      },
      {
        label: "Measurements",
        href: "/engineer/inspections",
        icon: Ruler,
        description: "Physical measurements",
      },
      {
        label: "Observations",
        href: "/engineer/inspections",
        icon: Eye,
        description: "Findings & recommendations",
      },
    ],
  },
  {
    title: "Analysis",
    items: [
      {
        label: "AI Analysis",
        href: "/engineer/inspections",
        icon: Brain,
        description: "AI risk assessment",
      },
      {
        label: "Physics Check",
        href: "/engineer/inspections",
        icon: GitMerge,
        description: "Measurement reconciliation",
      },
      {
        label: "Sign-off",
        href: "/engineer/inspections",
        icon: CheckSquare,
        description: "Review & submit",
      },
    ],
  },
];

export default function EngineerWorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#F9F8F5" }}>
      {/* ── Sidebar ────────────────────────────────────────────────────────── */}
      <aside
        style={{
          width: "240px",
          flexShrink: 0,
          background: "#0F1A14",
          display: "flex",
          flexDirection: "column",
          borderRight: "1px solid rgba(255,255,255,0.07)",
          position: "sticky",
          top: 0,
          height: "100vh",
          overflowY: "auto",
        }}
      >
        {/* Brand header */}
        <div
          style={{
            padding: "16px",
            borderBottom: "1px solid rgba(255,255,255,0.09)",
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <img
            src={KINGA_LOGO}
            alt="KINGA"
            style={{ height: "28px", width: "auto", objectFit: "contain", flexShrink: 0 }}
          />
          <div>
            <div
              style={{
                fontSize: "12px",
                fontWeight: 700,
                color: "#FFFFFF",
                letterSpacing: "-0.01em",
                lineHeight: 1,
              }}
            >
              KINGA
            </div>
            <div
              style={{
                fontSize: "10px",
                color: "rgba(255,255,255,0.50)",
                marginTop: "3px",
                lineHeight: 1,
              }}
            >
              Engineering Workspace
            </div>
          </div>
        </div>

        {/* Role badge */}
        <div style={{ padding: "10px 16px 0" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              background: "rgba(212,168,0,0.15)",
              border: "1px solid rgba(212,168,0,0.30)",
              borderRadius: "999px",
              padding: "3px 10px",
              fontSize: "10px",
              fontWeight: 600,
              color: "#D4A800",
              letterSpacing: "0.02em",
            }}
          >
            <span
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: "#4CAF50",
                flexShrink: 0,
              }}
            />
            ENGINEER
          </span>
        </div>

        {/* Nav */}
        <nav
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "12px 8px",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
          }}
        >
          {sections.map((section) => (
            <div key={section.title}>
              <p
                style={{
                  padding: "0 12px",
                  marginBottom: "4px",
                  fontSize: "10px",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "rgba(255,255,255,0.45)",
                }}
              >
                {section.title}
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = location === item.href;
                  return (
                    <Link key={item.href + item.label} href={item.href}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          padding: "8px 12px",
                          borderRadius: "6px",
                          cursor: "pointer",
                          background: isActive
                            ? "rgba(212,168,0,0.15)"
                            : "transparent",
                          borderLeft: isActive
                            ? "2px solid #D4A800"
                            : "2px solid transparent",
                          transition: "background 0.15s",
                        }}
                      >
                        <Icon
                          size={14}
                          style={{
                            color: isActive ? "#D4A800" : "rgba(255,255,255,0.55)",
                            flexShrink: 0,
                          }}
                        />
                        <div>
                          <div
                            style={{
                              fontSize: "12px",
                              fontWeight: isActive ? 600 : 400,
                              color: isActive ? "#FFFFFF" : "rgba(255,255,255,0.75)",
                              lineHeight: 1.2,
                            }}
                          >
                            {item.label}
                          </div>
                          <div
                            style={{
                              fontSize: "10px",
                              color: "rgba(255,255,255,0.35)",
                              marginTop: "2px",
                              lineHeight: 1,
                            }}
                          >
                            {item.description}
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Global Search — Epic 5-A */}
        <div style={{ padding: "8px 12px", borderTop: "1px solid rgba(255,255,255,0.09)" }}>
          <GlobalSearchBar variant="bar" placeholder="Search…" className="bg-white/5 border-white/10 text-white/70 hover:bg-white/10 text-xs" />
        </div>
        {/* Notification Bell — Epic 5-B */}
        <div style={{ padding: "4px 12px 8px" }}>
          <NotificationBell className="w-full justify-start text-white/60 hover:text-white hover:bg-white/10" />
        </div>
        {/* User footer */}
        <div
          style={{
            padding: "12px 16px",
            borderTop: "1px solid rgba(255,255,255,0.09)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "12px",
                fontWeight: 600,
                color: "#FFFFFF",
                lineHeight: 1.2,
              }}
            >
              {user?.name ?? "Engineer"}
            </div>
            <div
              style={{
                fontSize: "10px",
                color: "rgba(255,255,255,0.40)",
                marginTop: "2px",
              }}
            >
              {user?.email ?? ""}
            </div>
          </div>
          <button
            onClick={() => logout()}
            title="Sign out"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "rgba(255,255,255,0.40)",
              padding: "4px",
              borderRadius: "4px",
              display: "flex",
              alignItems: "center",
            }}
          >
            <LogOut size={14} />
          </button>
        </div>
      </aside>

      {/* ── Main content ───────────────────────────────────────────────────── */}
      <main style={{ flex: 1, minWidth: 0, overflowY: "auto" }}>{children}</main>
    </div>
  );
}
