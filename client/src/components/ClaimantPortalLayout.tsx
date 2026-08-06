/**
 * ClaimantPortalLayout
 *
 * Persistent sidebar layout for all claimant pages.
 * Phase 11: Forest green sidebar, gold accent, WCAG-compliant contrast.
 * Fixed: removed nested <a> inside <Link> (caused render crash).
 */
import { Link, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { GlobalSearchBar } from "@/components/search/GlobalSearchBar"; // Epic 5-A
import { NotificationBell } from "@/components/NotificationBell"; // Epic 5-B
import {
  LayoutDashboard,
  PlusCircle,
  FileText,
  HelpCircle,
  ChevronRight,
  LogOut,
  Building2,
} from "lucide-react";

const KINGA_LOGO = "https://files.manuscdn.com/user_upload_by_module/session_file/310419663031527958/dOfoldGKvKSMqKYG.png";

const sections: Array<{
  title: string;
  fleetOnly?: boolean;
  items: Array<{ label: string; href: string; icon: React.ElementType; description: string }>;
}> = [
  {
    title: "My Claims",
    items: [
      { label: "My Portal", href: "/client", icon: LayoutDashboard, description: "All my claims & status" },
      { label: "Submit a Claim", href: "/client/submit-claim", icon: PlusCircle, description: "Start a new claim" },
    ],
  },
  {
    title: "Fleet Management",
    fleetOnly: true,
    items: [
      { label: "Fleet Dashboard", href: "/fleet", icon: Building2, description: "All company vehicle claims" },
    ],
  },
  {
    title: "Documents",
    items: [
      { label: "My Documents", href: "/client", icon: FileText, description: "Uploaded files & photos" },
    ],
  },
  {
    title: "Support",
    items: [
      { label: "Notifications", href: "/notifications", icon: HelpCircle, description: "Alerts & updates" },
    ],
  },
];

export default function ClaimantPortalLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const isFleetRole = ["fleet_manager", "fleet_admin", "fleet_driver"].includes(user?.role ?? "");

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#F7F8F6" }}>
      {/* Phase 11 sidebar */}
      <aside style={{ width: "240px", flexShrink: 0, background: "#1A3320", display: "flex", flexDirection: "column", borderRight: "1px solid rgba(255,255,255,0.08)" }}>
        {/* Brand header */}
        <div style={{ padding: "16px", borderBottom: "1px solid rgba(255,255,255,0.10)", display: "flex", alignItems: "center", gap: "10px" }}>
          <img src={KINGA_LOGO} alt="KINGA" style={{ height: "28px", width: "auto", objectFit: "contain", flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: "12px", fontWeight: 700, color: "#FFFFFF", letterSpacing: "-0.01em", lineHeight: 1 }}>KINGA</div>
            <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.55)", marginTop: "3px", lineHeight: 1 }}>Claimant Portal</div>
          </div>
        </div>

        {/* Role badge */}
        <div style={{ padding: "10px 16px 0" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", background: "rgba(184,146,58,0.18)", border: "1px solid rgba(184,146,58,0.35)", borderRadius: "999px", padding: "3px 10px", fontSize: "10px", fontWeight: 600, color: "#D4A800", letterSpacing: "0.02em" }}>
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#4CAF50", flexShrink: 0 }} />
            {isFleetRole ? "FLEET" : "CLAIMANT"}
          </span>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, overflowY: "auto", padding: "12px 8px", display: "flex", flexDirection: "column", gap: "16px" }}>
          {sections.filter((s) => !s.fleetOnly || isFleetRole).map((section) => (
            <div key={section.title}>
              <p style={{ padding: "0 12px", marginBottom: "4px", fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.72)" }}>
                {section.title}
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                {section.items.map((item) => {
                  const active = location === item.href;
                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      style={{
                        display: "flex", alignItems: "center", gap: "10px",
                        padding: "8px 12px", borderRadius: "6px", textDecoration: "none",
                        background: active ? "rgba(184,146,58,0.18)" : "transparent",
                        transition: "background 120ms ease",
                      }}
                    >
                      <div style={{ width: "26px", height: "26px", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, background: active ? "rgba(184,146,58,0.25)" : "rgba(255,255,255,0.06)" }}>
                        <item.icon style={{ width: "14px", height: "14px", color: active ? "#D4A800" : "rgba(255,255,255,0.60)" }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "13px", fontWeight: active ? 600 : 400, color: active ? "#D4A800" : "rgba(255,255,255,0.82)", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.label}</div>
                        <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.45)", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.description}</div>
                      </div>
                      {active && <ChevronRight style={{ width: "12px", height: "12px", color: "#D4A800", flexShrink: 0 }} />}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div style={{ padding: "12px 16px", borderTop: "1px solid rgba(255,255,255,0.10)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
            <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: "linear-gradient(135deg, #1A3320, #B8923A)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#FFFFFF" }}>{user?.name?.charAt(0).toUpperCase() ?? "?"}</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: "12px", fontWeight: 500, color: "rgba(255,255,255,0.90)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: 0 }}>{user?.name ?? "—"}</p>
              <p style={{ fontSize: "10px", color: "rgba(255,255,255,0.45)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: 0 }}>{user?.email ?? "—"}</p>
            </div>
          </div>
          {/* Global Search — Epic 5-A */}
          <div style={{ marginBottom: 8 }}>
            <GlobalSearchBar variant="bar" placeholder="Search…" className="bg-white/5 border-white/10 text-white/70 hover:bg-white/10 text-xs" />
          </div>
          {/* Notification Bell — Epic 5-B */}
          <div style={{ marginBottom: 8 }}>
            <NotificationBell className="w-full justify-start text-white/60 hover:text-white hover:bg-white/10" />
          </div>
          <button
            onClick={logout}
            style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "rgba(255,255,255,0.50)", background: "none", border: "none", cursor: "pointer", padding: 0, width: "100%", transition: "color 120ms ease" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#EF4444")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.50)")}
          >
            <LogOut style={{ width: "12px", height: "12px" }} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, overflowY: "auto" }}>{children}</main>
    </div>
  );
}
