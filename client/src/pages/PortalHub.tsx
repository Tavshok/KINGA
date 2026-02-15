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
      id: "market-quotes",
      title: "Market Quotes",
      description: "Ingest and analyze market pricing data for accurate valuations",
      icon: TrendingUp,
      path: "/market-quotes",
      color: "from-indigo-500 to-violet-500",
      roles: ["insurer", "admin"]
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
