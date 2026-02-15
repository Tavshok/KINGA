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
  ArrowRight
} from "lucide-react";
import { useLocation } from "wouter";

export default function InsurerRoleSelection() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const insurerRoles = [
    {
      id: "executive",
      title: "Executive",
      description: "Strategic insights, KPIs, high-value approvals, and decision-making tools",
      icon: Crown,
      path: "/insurer-portal/executive",
      color: "from-indigo-600 to-purple-600",
      responsibilities: [
        "Approve claims above R50,000",
        "View company-wide analytics",
        "Configure workflows and policies",
        "Manage users and permissions"
      ]
    },
    {
      id: "claims_manager",
      title: "Claims Manager",
      description: "Team oversight, claim assignment, moderate-value approvals, and performance tracking",
      icon: Users,
      path: "/insurer-portal/claims-manager",
      color: "from-blue-500 to-cyan-500",
      responsibilities: [
        "Approve claims R10,000 - R50,000",
        "Assign claims to processors",
        "Monitor team performance",
        "Review escalated cases"
      ]
    },
    {
      id: "claims_processor",
      title: "Claims Processor",
      description: "Daily claim processing, document verification, and claimant communication",
      icon: FileCheck,
      path: "/insurer-portal/claims-processor",
      color: "from-green-500 to-emerald-500",
      responsibilities: [
        "Process incoming claims",
        "Verify documentation",
        "Communicate with claimants",
        "Update claim statuses"
      ]
    },
    {
      id: "internal_assessor",
      title: "Internal Assessor",
      description: "In-house damage assessment, report generation, and fraud flagging",
      icon: Search,
      path: "/insurer-portal/internal-assessor",
      color: "from-orange-500 to-amber-500",
      responsibilities: [
        "Assess vehicle damage",
        "Generate assessment reports",
        "Flag suspicious claims",
        "Validate repair quotes"
      ]
    },
    {
      id: "risk_manager",
      title: "Risk Manager",
      description: "Fraud investigation, technical approval, and risk register management",
      icon: ShieldAlert,
      path: "/insurer-portal/risk-manager",
      color: "from-red-500 to-rose-500",
      responsibilities: [
        "Review fraud alerts",
        "Investigate high-risk claims",
        "Provide technical approval",
        "Maintain risk register"
      ]
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b shadow-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <KingaLogo />
              <div>
                <h1 className="text-xl font-bold text-gray-900">KINGA</h1>
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
            <h2 className="text-3xl font-bold text-gray-900 mb-3">
              Select Your Role
            </h2>
            <p className="text-lg text-muted-foreground">
              Choose the role that matches your responsibilities within the insurance company
            </p>
          </div>

          {/* Role Cards */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {insurerRoles.map((role) => {
              const Icon = role.icon;
              return (
                <Card
                  key={role.id}
                  className="group hover:shadow-xl transition-all duration-300 cursor-pointer border-2 hover:border-primary/50 flex flex-col"
                  onClick={() => setLocation(role.path)}
                >
                  <CardHeader>
                    <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${role.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}>
                      <Icon className="h-8 w-8 text-white" />
                    </div>
                    <CardTitle className="text-xl">{role.title}</CardTitle>
                    <CardDescription className="text-base">
                      {role.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col">
                    <div className="space-y-2 flex-1">
                      <p className="text-sm font-semibold text-gray-700 mb-2">Key Responsibilities:</p>
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
                      className="w-full mt-6 group-hover:bg-primary group-hover:text-primary-foreground transition-colors"
                      variant="outline"
                    >
                      Enter Portal
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Info Banner */}
          <div className="mt-12 p-6 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-white text-sm font-bold">i</span>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-1">Role-Based Access Control</h3>
                <p className="text-sm text-gray-700">
                  Your access level and available features are determined by your assigned role. 
                  If you need access to additional roles or have questions about permissions, 
                  please contact your system administrator.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
