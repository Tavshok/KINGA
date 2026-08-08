import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

  // Auto-redirect users who already have an insurerRole to their own portal.
  // This prevents the role-selection page from being used as a portal-switching
  // mechanism by non-admin users.
  const isAdmin = user?.role === "admin" || user?.role === "platform_super_admin";
  const userInsurerRole = user?.insurerRole ?? null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-white to-accent/5">
      {/* Header */}
      <header className="bg-white/80 dark:bg-card/80 backdrop-blur-sm border-b shadow-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <KingaLogo />
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-foreground">KINGA</h1>
                <p className="text-sm text-muted-foreground">Insurer Portal</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => setLocation("/portal-hub")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Portal Hub
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-12">
        <div className="max-w-6xl mx-auto">
          {/* Welcome Section */}
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-foreground mb-3">
              Select Your Role
            </h2>
            <p className="text-lg text-muted-foreground">
              Choose the role that matches your responsibilities within the insurance company
            </p>
          </div>

          {/* Role Cards */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {ROLES.map((role) => {
              const Icon = role.icon;
              // Non-admin users can only navigate to their own role's portal.
              // Other role cards are shown in a disabled/locked state.
              const isOwnRole = isAdmin || !userInsurerRole || role.id === userInsurerRole;
              return (
                <Card
                  key={role.id}
                  className={`group transition-all duration-300 flex flex-col border-2 ${
                    isOwnRole
                      ? "hover:shadow-xl cursor-pointer hover:border-primary/50"
                      : "opacity-50 cursor-not-allowed border-gray-200"
                  }`}
                  onClick={() => isOwnRole && setLocation(role.path)}
                >
                  <CardHeader>
                    <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${role.gradient} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}>
                      <Icon className="h-8 w-8 text-white" />
                    </div>
                    <CardTitle className="text-xl">{role.title}</CardTitle>
                    <CardDescription className="text-base">
                      {role.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col">
                    <div className="space-y-2 flex-1">
                      <p className="text-sm font-semibold text-gray-700 dark:text-foreground/80 mb-2">Key Responsibilities:</p>
                      <ul className="space-y-1">
                        {role.responsibilities.map((resp, idx) => (
                          <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                            <span className="text-primary mt-1">•</span>
                            <span>{resp}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <Button
                      className="w-full mt-6 transition-colors"
                      variant={isOwnRole ? "outline" : "ghost"}
                      disabled={!isOwnRole}
                    >
                      {isOwnRole ? (
                        <>
                          Enter Portal
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </>
                      ) : (
                        "Access Restricted"
                      )}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Info Banner */}
          <div className="mt-12 p-6 bg-primary/5 border border-primary/20 rounded-lg">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-primary/80 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-white text-sm font-bold">i</span>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-foreground mb-1">Role-Based Access Control</h3>
                <p className="text-sm text-gray-700 dark:text-foreground/80">
                  Your access level and available features are determined by your assigned role.
                  If you need access to additional roles or have questions about permissions,
                  please contact your Insurer Admin.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
