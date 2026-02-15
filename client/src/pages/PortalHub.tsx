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
  Truck,
  TrendingUp
} from "lucide-react";
import { useLocation } from "wouter";

export default function PortalHub() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();

  const portals = [
    {
      id: "insurer",
      title: "Insurer Portal",
      description: "Claims management, executive insights, fraud analytics, and role-based workflows",
      icon: Building2,
      path: "/insurer-portal",
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
      id: "fleet",
      title: "Fleet Management",
      description: "Manage vehicle fleets, bulk imports, and fleet-wide analytics",
      icon: Truck,
      path: "/fleet-management",
      color: "from-teal-500 to-cyan-500",
      roles: ["insurer", "admin"]
    },
    {
      id: "kinga-agency",
      title: "KINGA Agency",
      description: "Request insurance quotations, manage policy renewals, and upload documents",
      icon: Building2,
      path: "/agency",
      color: "from-emerald-500 to-teal-500",
      roles: ["insurer", "admin", "claimant", "assessor"]
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

  const accessiblePortals = portals.filter(portal => 
    user && portal.roles.includes(user.role)
  );

  return (
    <div className="min-h-screen pattern-bg">
      {/* Header with KINGA gradient */}
      <header className="bg-white/90 backdrop-blur-md border-b border-primary/10 shadow-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <KingaLogo />
              <div>
                <h1 className="text-xl font-bold bg-gradient-primary bg-clip-text text-transparent">KINGA</h1>
                <p className="text-sm text-muted-foreground">Portal Hub</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm font-medium text-secondary">{user?.name}</p>
                <p className="text-xs text-muted-foreground capitalize">{user?.role}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => logout()} className="btn-hover border-primary/20 hover:border-primary/40">
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
          {/* Welcome Section with gradient */}
          <div className="text-center mb-12">
            <div className="inline-block mb-4 px-6 py-2 rounded-full bg-primary/10 border border-primary/20">
              <p className="text-sm font-medium text-primary">Welcome to KINGA AutoVerify AI</p>
            </div>
            <h2 className="text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent mb-3">
              Welcome back, {user?.name}!
            </h2>
            <p className="text-lg text-secondary/70">
              Select a portal to continue your work
            </p>
          </div>

          {/* Portal Cards with KINGA brand styling */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {accessiblePortals.map((portal) => {
              const Icon = portal.icon;
              return (
                <Card
                  key={portal.id}
                  className="card-hover cursor-pointer bg-white/80 backdrop-blur-sm overflow-hidden relative"
                  onClick={() => setLocation(portal.path)}
                >
                  {/* Gradient accent bar */}
                  <div className="absolute top-0 left-0 right-0 h-1 gradient-card-border" />
                  
                  <CardHeader className="pb-4">
                    <div className="relative">
                      <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300 shadow-lg">
                        <Icon className="h-8 w-8 text-white" />
                      </div>
                      {/* Decorative element */}
                      <div className="absolute -top-2 -right-2 w-8 h-8 bg-primary/10 rounded-full blur-xl" />
                    </div>
                    <CardTitle className="text-xl text-secondary group-hover:text-primary transition-colors">
                      {portal.title}
                    </CardTitle>
                    <CardDescription className="text-base text-muted-foreground">
                      {portal.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button 
                      className="w-full gradient-primary text-white btn-hover shadow-md border-0"
                      variant="default"
                    >
                      Access Portal
                      <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Info Section with KINGA styling */}
          <div className="mt-12 text-center">
            <Card className="bg-gradient-to-r from-primary/5 to-accent/5 border-primary/20 backdrop-blur-sm">
              <CardContent className="pt-6">
                <p className="text-sm text-secondary/80">
                  <strong className="text-primary">Tip:</strong> You can return to this portal hub at any time by clicking the "Switch Portal" link in the header of any portal.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
