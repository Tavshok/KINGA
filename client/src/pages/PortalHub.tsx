import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import KingaLogo from "@/components/KingaLogo";
import { 
  Building2, 
  ClipboardCheck, 
  Wrench, 
  User, 
  Shield,
  ArrowRight,
  LogOut,
  Database,
  TrendingUp,
  Users,
  Activity,
  Target,
  BarChart3,
  Truck,
  Briefcase
} from "lucide-react";
import { useLocation } from "wouter";

export default function PortalHub() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();

  const portals = [
    // Insurer sub-role portals
    {
      id: "executive",
      title: "Executive Dashboard",
      description: "Strategic insights, KPIs, and decision-making tools",
      icon: TrendingUp,
      path: "/executive",
      color: "from-indigo-600 to-purple-600",
      roles: ["insurer", "admin"],
      insurerRoles: ["executive"]
    },
    {
      id: "claims-manager",
      title: "Claims Manager Dashboard",
      description: "Team oversight, approvals, and performance management",
      icon: Users,
      path: "/claims-manager",
      color: "from-blue-600 to-indigo-600",
      roles: ["insurer", "admin"],
      insurerRoles: ["claims_manager"]
    },
    {
      id: "claims-processor",
      title: "Claims Processor Dashboard",
      description: "Day-to-day claims handling and triage",
      icon: Activity,
      path: "/claims-processor",
      color: "from-cyan-500 to-blue-500",
      roles: ["insurer", "admin"],
      insurerRoles: ["claims_processor"]
    },
    {
      id: "internal-assessor",
      title: "Internal Assessor Dashboard",
      description: "In-house damage assessment and evaluation",
      icon: Target,
      path: "/internal-assessor",
      color: "from-green-600 to-emerald-600",
      roles: ["insurer", "admin"],
      insurerRoles: ["internal_assessor"]
    },
    {
      id: "risk-manager",
      title: "Risk Manager Dashboard",
      description: "Fraud detection, risk analytics, and compliance",
      icon: Shield,
      path: "/risk-manager",
      color: "from-red-600 to-rose-600",
      roles: ["insurer", "admin"],
      insurerRoles: ["risk_manager"]
    },
    // General insurer portal (fallback)
    {
      id: "insurer",
      title: "Insurer Portal",
      description: "Claims management, triage, and fraud analytics",
      icon: Building2,
      path: "/insurer/dashboard",
      color: "from-blue-500 to-cyan-500",
      roles: ["insurer", "admin"]
    },
    {
      id: "assessor",
      title: "Assessor Portal",
      description: "Damage assessment and claim evaluation",
      icon: ClipboardCheck,
      path: "/assessor/dashboard",
      color: "from-green-500 to-emerald-500",
      roles: ["assessor", "admin"]
    },
    {
      id: "panel-beater",
      title: "Panel Beater Portal",
      description: "Quote submission and job management",
      icon: Wrench,
      path: "/panel-beater/dashboard",
      color: "from-orange-500 to-amber-500",
      roles: ["panel_beater", "admin"]
    },
    {
      id: "claimant",
      title: "Claimant Portal",
      description: "Submit claims and track progress",
      icon: User,
      path: "/claimant/dashboard",
      color: "from-purple-500 to-pink-500",
      roles: ["claimant", "admin"]
    },
    {
      id: "historical-claims",
      title: "Historical Claims Intelligence",
      description: "Ingest historical PDFs, extract data, and build ML training datasets",
      icon: Database,
      path: "/historical-claims",
      color: "from-teal-500 to-cyan-500",
      roles: ["insurer", "admin"]
    },
    {
      id: "fleet-management",
      title: "Fleet Management",
      description: "Vehicle fleet tracking, maintenance, and analytics",
      icon: Truck,
      path: "/fleet-management",
      color: "from-slate-600 to-gray-600",
      roles: ["fleet_manager", "admin", "claimant"]
    },
    {
      id: "insurance-agency",
      title: "KINGA Agency",
      description: "Generate insurance quotes, manage policies, and track sales",
      icon: Briefcase,
      path: "/insurance/dashboard",
      color: "from-violet-600 to-purple-600",
      roles: ["insurance_agent", "admin"]
    },
    {
      id: "admin",
      title: "Admin Panel",
      description: "System management and user administration",
      icon: Shield,
      path: "/admin",
      color: "from-red-500 to-rose-500",
      roles: ["admin"]
    }
  ];

  const accessiblePortals = portals.filter(portal => {
    if (!user) return false;
    
    // Admin sees all portals
    if (user.role === "admin") return true;
    
    // Check if user's main role matches
    if (portal.roles.includes(user.role)) {
      // If portal requires specific insurer sub-role, check it
      if (portal.insurerRoles && user.role === "insurer") {
        return portal.insurerRoles.includes(user.insurerRole || "");
      }
      return true;
    }
    
    return false;
  });

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
                <p className="text-sm text-muted-foreground">Portal Hub</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm font-medium">{user?.name}</p>
                <p className="text-xs text-muted-foreground capitalize">{user?.role}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => logout()}>
                <LogOut className="mr-2 h-4 w-4" />
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-12">
        <div className="max-w-6xl mx-auto">
          {/* Welcome Section */}
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-3">
              Welcome back, {user?.name}!
            </h2>
            <p className="text-lg text-muted-foreground">
              Select a portal to continue
            </p>
          </div>

          {/* Portal Cards */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {accessiblePortals.map((portal) => {
              const Icon = portal.icon;
              return (
                <Card
                  key={portal.id}
                  className="group hover:shadow-xl transition-all duration-300 cursor-pointer border-2 hover:border-primary/50"
                  onClick={() => setLocation(portal.path)}
                >
                  <CardHeader>
                    <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${portal.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}>
                      <Icon className="h-8 w-8 text-white" />
                    </div>
                    <CardTitle className="text-xl">{portal.title}</CardTitle>
                    <CardDescription className="text-base">
                      {portal.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button 
                      className="w-full group-hover:bg-primary group-hover:text-primary-foreground transition-colors"
                      variant="outline"
                    >
                      Access Portal
                      <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Info Section */}
          <div className="mt-12 text-center">
            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">
                  <strong>Tip:</strong> You can return to this portal hub at any time by clicking the "Switch Portal" link in the header of any portal.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
