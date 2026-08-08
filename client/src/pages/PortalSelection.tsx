import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Car, Shield, FileText, Truck, ArrowRight, Zap, Eye,
  BarChart3, Lock, ChevronRight, Building2, ClipboardCheck,
  Wrench, User, HardHat, Settings
} from "lucide-react";
import KingaLogo from "@/components/KingaLogo";
import { getLoginUrl } from "@/const";

const CUSTOMER_JOURNEYS = [
  {
    id: "valuation",
    icon: Car,
    title: "Get a Vehicle Valuation",
    description: "Upload photos and get a professional KINGA valuation report. Know your vehicle's true market value.",
    cta: "Start Valuation",
    href: "/get-a-quote",
    color: "from-blue-500 to-blue-600",
    badge: "Free teaser · $25 full report",
    audience: "Individuals, dealers, banks",
    requiresAuth: false,
  },
  {
    id: "insurance",
    icon: Shield,
    title: "Get Insurance",
    description: "Comprehensive, third party, or fleet cover. KINGA analyses your vehicle and connects you with the right policy.",
    cta: "Get a Quote",
    href: "/get-a-quote",
    color: "from-emerald-500 to-emerald-600",
    badge: "Quote in 24 hours",
    audience: "Vehicle owners",
    requiresAuth: false,
  },
  {
    id: "claim",
    icon: FileText,
    title: "Submit a Claim",
    description: "Had an accident? Submit your claim online. KINGA's AI analyses the damage and guides your claim to settlement.",
    cta: "Submit Claim",
    href: "/claimant/submit",
    color: "from-amber-500 to-amber-600",
    badge: "Requires sign-in",
    audience: "Policyholders",
    requiresAuth: true,
  },
  {
    id: "fleet",
    icon: Truck,
    title: "Manage Your Fleet",
    description: "Track vehicles, drivers, maintenance, fuel, and insurance across your entire fleet from one dashboard.",
    cta: "Fleet Dashboard",
    href: "/fleet",
    color: "from-purple-500 to-purple-600",
    badge: "Requires sign-in",
    audience: "Fleet operators",
    requiresAuth: true,
  },
];

const PORTAL_LINKS = [
  { role: "insurer", title: "Insurer Portal", icon: Building2, href: "/insurer-portal" },
  { role: "assessor", title: "Assessor Portal", icon: ClipboardCheck, href: "/assessor/dashboard" },
  { role: "panel_beater", title: "Panel Beater Portal", icon: Wrench, href: "/panel-beater/dashboard" },
  { role: "agency", title: "Agency Portal", icon: User, href: "/agency" },
  { role: "engineer", title: "KINGA Engineers", icon: HardHat, href: "/engineer/dashboard" },
  { role: "fleet", title: "Fleet Management", icon: Truck, href: "/fleet" },
  { role: "admin", title: "Platform Admin", icon: Settings, href: "/platform/overview" },
];

const STATS = [
  { value: "10,000+", label: "Vehicles Assessed" },
  { value: "2,900+", label: "Claims Processed" },
  { value: "99.7%", label: "Uptime" },
  { value: "< 5 min", label: "KINGA Analysis Time" },
];

export default function PortalSelection() {
  const [, setLocation] = useLocation();

  const handleJourneyClick = (journey: typeof CUSTOMER_JOURNEYS[0]) => {
    if (journey.requiresAuth) {
      window.location.href = getLoginUrl(journey.href);
    } else {
      setLocation(journey.href);
    }
  };

  // Professional portal links: always go through OAuth with returnPath
  // so the user lands directly in their portal after login
  const handlePortalClick = (href: string) => {
    window.location.href = getLoginUrl(href);
  };

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      {/* Navigation */}
      <header className="sticky top-0 z-50 bg-white/95 dark:bg-slate-950/95 backdrop-blur border-b">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
         <div className="flex items-center gap-3">
            <KingaLogo size="md" showText={false} />
            <p className="hidden sm:block text-xs text-muted-foreground tracking-wide">Risk Intelligence Platform</p>
         </div>
          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <button onClick={() => setLocation("/get-a-quote")} className="hover:text-foreground transition-colors">Valuations</button>
            <button onClick={() => setLocation("/get-a-quote")} className="hover:text-foreground transition-colors">Insurance</button>
            <button onClick={() => setLocation("/client")} className="hover:text-foreground transition-colors">My Profile</button>
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => window.location.href = getLoginUrl()}>Sign In</Button>
            <Button size="sm" onClick={() => setLocation("/get-a-quote")}>Get Started</Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-primary/80 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/20 via-transparent to-transparent" />
        <div className="container mx-auto px-4 py-20 relative">
          <div className="max-w-3xl mx-auto text-center">
            <Badge className="mb-4 bg-white/10 text-white border-white/20 hover:bg-white/20">
              <Zap className="h-3 w-3 mr-1" /> Powered by KINGA Intelligence
            </Badge>
            <h1 className="text-4xl md:text-5xl font-bold mb-4 leading-tight">
              Know Your Vehicle.<br />Protect What Matters.
            </h1>
            <p className="text-lg text-white/80 mb-8 max-w-2xl mx-auto">
              KINGA uses AI-powered photo forensics, market data, and physics analysis to value your vehicle, assess damage, and process claims — faster and more accurately than traditional methods.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button size="lg" className="bg-white text-slate-900 hover:bg-white/90" onClick={() => setLocation("/get-a-quote")}>
                Get a Free Valuation <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
              <Button size="lg" variant="outline" className="border-white/30 text-white hover:bg-white/10" onClick={() => window.location.href = getLoginUrl()}>
                Sign In to Your Account
              </Button>
            </div>
          </div>
        </div>
        <div className="border-t border-white/10 bg-white/5">
          <div className="container mx-auto px-4 py-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              {STATS.map(({ value, label }) => (
                <div key={label}>
                  <p className="text-2xl font-bold text-white">{value}</p>
                  <p className="text-xs text-white/60">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Customer Journey Cards */}
      <section className="container mx-auto px-4 py-16">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold mb-2">What brings you to KINGA?</h2>
          <p className="text-muted-foreground">Choose your journey. Every path leads to a better outcome.</p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {CUSTOMER_JOURNEYS.map((journey) => {
            const Icon = journey.icon;
            return (
              <Card
                key={journey.id}
                className="group cursor-pointer hover:shadow-lg transition-all border-2 hover:border-primary/30 overflow-hidden"
                onClick={() => handleJourneyClick(journey)}
              >
                <div className={`h-1.5 bg-gradient-to-r ${journey.color}`} />
                <CardContent className="pt-5 pb-5">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${journey.color} flex items-center justify-center mb-3`}>
                    <Icon className="h-5 w-5 text-white" />
                  </div>
                  <h3 className="font-semibold mb-1">{journey.title}</h3>
                  <p className="text-sm text-muted-foreground mb-3 leading-relaxed">{journey.description}</p>
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary" className="text-xs">{journey.badge}</Badge>
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">{journey.audience}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* How It Works */}
      <section className="bg-slate-50 dark:bg-slate-900/50 py-16">
        <div className="container mx-auto px-4">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold mb-2">How KINGA Works</h2>
            <p className="text-muted-foreground">Three steps from submission to certainty.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6 max-w-3xl mx-auto">
            {[
              { step: "1", title: "Submit Your Vehicle", desc: "Upload photos and vehicle details. No paperwork, no queues." },
              { step: "2", title: "KINGA Analyses", desc: "Our intelligence engine assesses condition, market value, and risk in minutes." },
              { step: "3", title: "Get Your Report", desc: "Receive a professional valuation. Insure, sell, or claim with confidence." },
            ].map(({ step, title, desc }) => (
              <div key={step} className="text-center">
                <div className="w-12 h-12 rounded-full bg-primary text-white font-bold text-lg flex items-center justify-center mx-auto mb-3">{step}</div>
                <h3 className="font-semibold mb-1">{title}</h3>
                <p className="text-sm text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="container mx-auto px-4 py-16">
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { icon: Eye, title: "Photo Forensics", desc: "KINGA analyses every photo for authenticity, damage extent, and manipulation — giving insurers and clients confidence in the assessment." },
            { icon: BarChart3, title: "Market Intelligence", desc: "Real Zimbabwe market data powers every valuation. No guesswork — just accurate, defensible numbers grounded in actual transactions." },
            { icon: Lock, title: "Tamper-Evident Audit Trail", desc: "Every decision, every assessment, every change is logged with a cryptographic hash. Full transparency for regulators and clients." },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex gap-4">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold mb-1">{title}</h3>
                <p className="text-sm text-muted-foreground">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Professional Portals */}
      <section className="bg-slate-50 dark:bg-slate-900/50 py-12">
        <div className="container mx-auto px-4">
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold mb-1">Professional Portals</h2>
            <p className="text-sm text-muted-foreground">For insurers, assessors, panel beaters, and agencies</p>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            {PORTAL_LINKS.map(({ role, title, icon: Icon, href }) => (
              <Button key={role} variant="outline" onClick={() => handlePortalClick(href)} className="flex items-center gap-2">
                <Icon className="h-4 w-4" /> {title}
              </Button>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-primary text-white py-14">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-3">Ready to get started?</h2>
          <p className="text-white/80 mb-6 max-w-xl mx-auto">Get a free vehicle valuation in minutes. No account required to start.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button size="lg" className="bg-white text-primary hover:bg-white/90" onClick={() => setLocation("/get-a-quote")}>
              Get a Free Valuation <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
            <Button size="lg" variant="outline" className="border-white/40 text-white hover:bg-white/10" onClick={() => window.location.href = getLoginUrl()}>
              Sign In
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="container mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
         <div className="flex items-center gap-2">
            <KingaLogo size="sm" showText={false} />
            <span className="text-sm text-muted-foreground">KINGA · Zimbabwe · © 2026</span>
         </div>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <button onClick={() => setLocation("/get-a-quote")} className="hover:text-foreground">Valuations</button>
            <button onClick={() => setLocation("/get-a-quote")} className="hover:text-foreground">Insurance</button>
            <button onClick={() => setLocation("/client")} className="hover:text-foreground">My Profile</button>
            <button onClick={() => window.location.href = getLoginUrl()} className="hover:text-foreground">Sign In</button>
          </div>
        </div>
      </footer>
    </div>
  );
}
