import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Building2, ClipboardCheck, Wrench, User } from "lucide-react";

export default function PortalSelection() {
  const [, setLocation] = useLocation();

  const portals = [
    {
      role: "insurer",
      title: "Insurer Portal",
      description: "Claims management & triage",
      icon: Building2,
      color: "from-primary to-secondary",
      hoverColor: "hover:from-primary/90 hover:to-primary",
    },
    {
      role: "assessor",
      title: "Assessor Portal",
      description: "Damage assessment & evaluation",
      icon: ClipboardCheck,
      color: "from-teal-500 to-teal-600",
      hoverColor: "hover:from-teal-600 hover:to-teal-700",
    },
    {
      role: "panel_beater",
      title: "Panel Beater Portal",
      description: "Quote submission & repairs",
      icon: Wrench,
      color: "from-green-500 to-green-600",
      hoverColor: "hover:from-green-600 hover:to-green-700",
    },
    {
      role: "claimant",
      title: "Claimant Portal",
      description: "Submit & track your claims",
      icon: User,
      color: "from-orange-500 to-orange-600",
      hoverColor: "hover:from-orange-600 hover:to-orange-700",
    },
  ];

  const handlePortalClick = (role: string) => {
    // Redirect to login with role parameter
    setLocation(`/login?role=${role}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-white to-accent/5">
      {/* Header */}
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center mb-12">
          <img 
            src="/kinga-logo.png" 
            alt="KINGA Logo" 
            className="h-16"
            onError={(e) => {
              // Fallback if logo not found
              e.currentTarget.style.display = 'none';
            }}
          />
        </div>

        {/* Main Content */}
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-5xl font-bold text-gray-900 dark:text-foreground mb-4">
              Welcome to KINGA
            </h1>
            <p className="text-xl text-gray-600 dark:text-muted-foreground">
              Physics-Based Insurance Claims Revolution
            </p>
            <p className="text-lg text-gray-500 dark:text-muted-foreground mt-2">
              Select your portal to continue
            </p>
          </div>

          {/* Portal Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {portals.map((portal) => {
              const Icon = portal.icon;
              return (
                <Card
                  key={portal.role}
                  className={`cursor-pointer transition-all duration-300 transform hover:scale-105 hover:shadow-2xl border-0 overflow-hidden`}
                  onClick={() => handlePortalClick(portal.role)}
                >
                  <div className={`bg-gradient-to-br ${portal.color} ${portal.hoverColor} p-8 text-white min-h-[280px] flex flex-col items-center justify-center text-center transition-all duration-300`}>
                    <div className="bg-white/20 dark:bg-card/20 p-4 rounded-full mb-6">
                      <Icon className="h-12 w-12" />
                    </div>
                    <h2 className="text-2xl font-bold mb-3">
                      {portal.title}
                    </h2>
                    <p className="text-white/90 text-sm">
                      {portal.description}
                    </p>
                    <div className="mt-6 text-sm font-semibold">
                      Click to Login →
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Footer */}
          <div className="text-center mt-12 text-gray-500 dark:text-muted-foreground text-sm">
            <p>Eliminating Fraud & Accelerating Claims Processing</p>
            <p className="mt-2">© 2026 KINGA - AutoVerify AI. All rights reserved.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
