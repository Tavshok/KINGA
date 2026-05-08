import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import KingaLogo from "@/components/KingaLogo";
import {
  Crown,
  Users,
  FileCheck,
  Search,
  ShieldAlert,
  ArrowLeft,
  ArrowRight,
  Scale,
  Settings2,
} from "lucide-react";
import { useLocation } from "wouter";

const ROLES = [
  {
    id: "executive",
    title: "Executive",
    description: "Strategic insights, KPIs, high-value approvals, and board-level decision-making tools.",
    icon: Crown,
    path: "/insurer-portal/executive",
    gradient: "from-indigo-600 to-purple-600",
    accent: "border-indigo-500/40 hover:border-indigo-400",
    responsibilities: [
      "Approve high-value claims",
      "View company-wide analytics",
      "Configure workflows and policies",
      "Manage users and permissions",
    ],
  },
  {
    id: "claims_manager",
    title: "Claims Manager",
    description: "Team oversight, claim assignment, moderate-value approvals, and performance tracking.",
    icon: Users,
    path: "/insurer-portal/claims-manager",
    gradient: "from-teal-600 to-cyan-600",
    accent: "border-teal-500/40 hover:border-teal-400",
    responsibilities: [
      "Approve moderate-value claims",
      "Assign claims to processors",
      "Monitor team performance",
      "Review escalated cases",
    ],
  },
  {
    id: "claims_processor",
    title: "Claims Processor",
    description: "Daily claim processing, document verification, and claimant communication.",
    icon: FileCheck,
    path: "/insurer-portal/claims-processor",
    gradient: "from-emerald-600 to-green-600",
    accent: "border-emerald-500/40 hover:border-emerald-400",
    responsibilities: [
      "Process incoming claims",
      "Verify documentation",
      "Communicate with claimants",
      "Update claim statuses",
    ],
  },
  {
    id: "assessor_internal",
    title: "Internal Assessor",
    description: "In-house damage assessment, report generation, and fraud flagging.",
    icon: Search,
    path: "/insurer-portal/internal-assessor",
    gradient: "from-orange-600 to-amber-600",
    accent: "border-orange-500/40 hover:border-orange-400",
    responsibilities: [
      "Assess vehicle damage",
      "Generate assessment reports",
      "Flag suspicious claims",
      "Validate repair quotes",
    ],
  },
  {
    id: "assessor_external",
    title: "External Assessor",
    description: "Independent damage assessment, report submission, and panel beater coordination.",
    icon: Search,
    path: "/insurer-portal/external-assessor",
    gradient: "from-sky-600 to-blue-600",
    accent: "border-sky-500/40 hover:border-sky-400",
    responsibilities: [
      "Accept assigned assessments",
      "Submit assessment reports",
      "Coordinate with panel beaters",
      "Track assessment status",
    ],
  },
  {
    id: "risk_manager",
    title: "Risk Manager",
    description: "Fraud investigation, technical approval, risk register management, and analytics.",
    icon: ShieldAlert,
    path: "/insurer-portal/risk-manager",
    gradient: "from-red-600 to-rose-600",
    accent: "border-red-500/40 hover:border-red-400",
    responsibilities: [
      "Review fraud alerts",
      "Investigate high-risk claims",
      "Provide technical approval",
      "Maintain risk register",
    ],
  },
  {
    id: "recovery_officer",
    title: "Recovery Officer",
    description: "Third-party recovery case management, demand letters, and settlement tracking.",
    icon: Scale,
    path: "/insurer-portal/recovery",
    gradient: "from-lime-600 to-green-700",
    accent: "border-lime-500/40 hover:border-lime-400",
    responsibilities: [
      "Manage recovery case queue",
      "Issue demand letters to third parties",
      "Track settlements and recoveries",
      "Escalate disputed cases to legal",
    ],
  },
  {
    id: "insurer_admin",
    title: "Insurer Admin",
    description: "Portal configuration, team management, workflow settings, and company-level reporting.",
    icon: Settings2,
    path: "/insurer-portal/insurer-admin",
    gradient: "from-slate-600 to-zinc-700",
    accent: "border-slate-500/40 hover:border-slate-400",
    responsibilities: [
      "Manage team members and roles",
      "Configure automation workflows",
      "Set approval thresholds",
      "Access full analytics suite",
    ],
  },
];

export default function InsurerRoleSelection() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-slate-950">
      {/* ── Header ── */}
      <header className="sticky top-0 z-20 bg-slate-900/90 backdrop-blur-sm border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <KingaLogo />
            <div>
              <p className="text-sm font-bold text-white leading-none">KINGA</p>
              <p className="text-[11px] text-slate-400 leading-none mt-0.5">Insurer Portal</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {user && (
              <span className="text-xs text-slate-400 hidden sm:block">
                Signed in as <span className="text-white font-medium">{user.name ?? user.email ?? "User"}</span>
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              className="border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800"
              onClick={() => setLocation("/portal-hub")}
            >
              <ArrowLeft className="mr-2 h-3.5 w-3.5" />
              Portal Hub
            </Button>
          </div>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="max-w-7xl mx-auto px-6 py-12">
        {/* Welcome */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-white mb-3">Select Your Role</h1>
          <p className="text-slate-400 text-base max-w-xl mx-auto">
            Choose the role that matches your responsibilities within your insurance organisation.
            Your access level and available features are determined by your assigned role.
          </p>
        </div>

        {/* Role grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {ROLES.map((role) => {
            const Icon = role.icon;
            return (
              <button
                key={role.id}
                onClick={() => setLocation(role.path)}
                className={`group text-left bg-slate-900 border rounded-2xl p-5 transition-all duration-200 hover:bg-slate-800/80 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/30 ${role.accent} flex flex-col gap-4`}
              >
                {/* Icon + title */}
                <div className="flex items-start gap-3">
                  <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${role.gradient} flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform duration-200`}>
                    <Icon className="h-5 w-5 text-white" />
                  </div>
                  <div className="min-w-0 pt-0.5">
                    <h3 className="text-sm font-bold text-white leading-tight">{role.title}</h3>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed line-clamp-2">{role.description}</p>
                  </div>
                </div>

                {/* Responsibilities */}
                <ul className="space-y-1.5 flex-1">
                  {role.responsibilities.map((resp) => (
                    <li key={resp} className="flex items-start gap-2 text-xs text-slate-400">
                      <span className="text-teal-400 mt-0.5 flex-shrink-0">›</span>
                      <span>{resp}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-800 group-hover:border-slate-700 transition-colors">
                  <span className="text-xs font-medium text-teal-400">Enter Portal</span>
                  <ArrowRight className="h-3.5 w-3.5 text-teal-400 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </button>
            );
          })}
        </div>

        {/* Info banner */}
        <div className="mt-10 p-5 bg-slate-900/60 border border-slate-800 rounded-xl flex items-start gap-4">
          <div className="w-8 h-8 rounded-lg bg-teal-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
            <span className="text-teal-400 text-sm font-bold">i</span>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white mb-1">Role-Based Access Control</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Each role provides access to specific features and data relevant to your responsibilities.
              If your assigned role does not match one of the tiles above, contact your{" "}
              <strong className="text-slate-300">Insurer Admin</strong> to update your permissions.
              For platform-level issues, contact your KINGA account manager.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
