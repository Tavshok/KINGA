import { trpc } from "@/lib/trpc";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Lock, CheckCircle2, AlertTriangle, Car, Shield, ArrowRight, Loader2, Phone, Mail } from "lucide-react";
import KingaLogo from "@/components/KingaLogo";

export default function TeaserReportPage() {
  const params = useParams<{ token: string }>();
  const [, setLocation] = useLocation();
  const token = params.token ?? "";

  const { data, isLoading, error } = trpc.insuranceV2.getTeaserReport.useQuery(
    { token },
    { enabled: !!token, refetchInterval: 10_000 } // Poll every 10s while pipeline runs
  );

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <KingaLogo size="md" />
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground">Loading your KINGA report...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-4">
        <KingaLogo size="md" />
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
            <h2 className="text-lg font-semibold mb-2">Report Not Found</h2>
            <p className="text-sm text-muted-foreground mb-4">This link may have expired or is invalid. Please submit a new valuation request.</p>
            <Button onClick={() => setLocation("/get-a-quote")}>Start New Request</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isPipelineRunning = data.forensicsStatus === "pending" || data.forensicsStatus === "processing";
  const isFullUnlocked = data.reportGatingStatus === "full" || data.reportGatingStatus === "paid";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-primary/5">
      {/* Header */}
      <header className="bg-white border-b shadow-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setLocation("/")}>
            <KingaLogo size="sm" />
          </div>
          <Button variant="outline" size="sm" onClick={() => setLocation("/get-a-quote")}>New Request</Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-2xl">
        {/* Status Banner */}
        <div className={`mb-6 p-4 rounded-xl border flex items-center gap-3 ${isPipelineRunning ? "bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800" : "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800"}`}>
          {isPipelineRunning ? (
            <><Loader2 className="h-5 w-5 animate-spin text-blue-600 flex-shrink-0" />
            <div>
              <p className="font-semibold text-blue-800 dark:text-blue-200">KINGA is analysing your vehicle</p>
              <p className="text-sm text-blue-600 dark:text-blue-300">This usually takes 2–3 minutes. This page will update automatically.</p>
            </div></>
          ) : (
            <><CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0" />
            <div>
              <p className="font-semibold text-emerald-800 dark:text-emerald-200">KINGA analysis complete</p>
              <p className="text-sm text-emerald-600 dark:text-emerald-300">Your vehicle has been assessed. Reference: <span className="font-mono">{data.requestNumber}</span></p>
            </div></>
          )}
        </div>

        {/* Vehicle Summary */}
        <Card className="mb-4">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Car className="h-4 w-4 text-primary" />
              {data.vehicleYear} {data.vehicleMake} {data.vehicleModel}
              <Badge variant="outline" className="ml-auto capitalize">{data.condition}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              {/* Valuation Teaser */}
              <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 text-center">
                <p className="text-xs text-muted-foreground mb-1">Estimated Market Value</p>
                {data.valueLow && data.valueHigh ? (
                  <p className="text-2xl font-bold text-primary">
                    ${data.valueLow.toLocaleString()} – ${data.valueHigh.toLocaleString()}
                  </p>
                ) : (
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Calculating...</span>
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-1">USD · Zimbabwe market</p>
              </div>

              {/* Forensics Status */}
              <div className="p-4 rounded-xl bg-muted/50 border text-center">
                <p className="text-xs text-muted-foreground mb-1">Photo Analysis</p>
                {isPipelineRunning ? (
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <span className="text-sm font-medium">Running...</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span className="text-sm font-medium text-emerald-700">Complete</span>
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-1">KINGA Photo Forensics</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Full Report — Locked or Unlocked */}
        {isFullUnlocked ? (
          <Card className="mb-4 border-emerald-200 dark:border-emerald-800">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                Full KINGA Vehicle Report — Unlocked
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {data.fullReport?.estimatedMarketValue && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Market Value</span>
                  <span className="font-semibold">${data.fullReport.estimatedMarketValue.toLocaleString()}</span>
                </div>
              )}
              {data.fullReport?.vehicleRiskScore !== null && data.fullReport?.vehicleRiskScore !== undefined && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Risk Score</span>
                  <Badge variant={data.fullReport.vehicleRiskScore > 70 ? "destructive" : data.fullReport.vehicleRiskScore > 40 ? "secondary" : "default"}>
                    {data.fullReport.vehicleRiskScore}/100
                  </Badge>
                </div>
              )}
              {data.fullReport?.quotedPremium && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Quoted Premium</span>
                  <span className="font-semibold">${(data.fullReport.quotedPremium / 100).toLocaleString()}/month</span>
                </div>
              )}
              <Button className="w-full mt-2" onClick={() => setLocation("/my-profile")}>
                View in My Profile <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="mb-4 border-dashed">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-full bg-muted">
                  <Lock className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold mb-1">Full KINGA Vehicle Report</h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    Your full report — including detailed condition assessment, risk profile, photo forensics breakdown, and recommended insured value — will be unlocked in your profile once your policy is issued.
                  </p>
                  <div className="space-y-1 text-sm text-muted-foreground mb-4">
                    {["Detailed condition assessment", "Photo forensics breakdown", "Risk classification", "Recommended insured value", "Market data sources"].map(item => (
                      <div key={item} className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded-full border-2 border-dashed border-muted-foreground/40 flex-shrink-0" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                  {data.isStandaloneValuation ? (
                    <Button className="w-full" variant="default">
                      Pay $25 to Unlock Report <ArrowRight className="h-4 w-4 ml-1" />
                    </Button>
                  ) : (
                    <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                      <p className="text-sm font-medium text-primary">What happens next?</p>
                      <p className="text-xs text-muted-foreground mt-1">Our agency team will review your request and send you a quote within 24 hours. Once your policy is issued, your full report will be available in your KINGA profile.</p>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Contact CTA */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="font-medium text-sm">Questions about your quote?</p>
                <p className="text-xs text-muted-foreground">Our team is available Mon–Fri 8am–5pm</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm">
                  <Phone className="h-3 w-3 mr-1" /> Call Us
                </Button>
                <Button variant="outline" size="sm">
                  <Mail className="h-3 w-3 mr-1" /> Email Us
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
