/**
 * ClaimSimulator.tsx
 *
 * Admin-only page at /platform/claim-simulator.
 * Allows admins and super-admins to generate fully synthetic claims for
 * end-to-end workflow testing without affecting production data.
 *
 * Features:
 *  - Configurable vehicle make/model/year
 *  - Damage type and severity selection
 *  - 2–4 repair quotes with deliberate cost variance
 *  - Fires AI assessment in the background
 *  - Shows a result card with claim number, quote amounts, and a link to the claim
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "wouter";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  FlaskConical,
  Car,
  Wrench,
  Zap,
  CheckCircle2,
  ExternalLink,
  AlertTriangle,
  BarChart3,
  RefreshCw,
} from "lucide-react";

// ─── Form schema (mirrors server input) ───────────────────────────────────────
const formSchema = z.object({
  vehicleMake: z.string().min(1, "Vehicle make is required"),
  vehicleModel: z.string().min(1, "Vehicle model is required"),
  vehicleYear: z
    .number()
    .int()
    .min(1980, "Year must be 1980 or later")
    .max(new Date().getFullYear() + 1, "Year cannot be in the future"),
  damageType: z.enum(["front_collision", "rear_collision", "side_collision", "hail_damage"]),
  estimatedSeverity: z.enum(["minor", "moderate", "severe"]),
  numberOfQuotes: z.number().int().min(2).max(4),
});

type FormValues = z.infer<typeof formSchema>;

// ─── Label helpers ─────────────────────────────────────────────────────────────
const DAMAGE_TYPE_LABELS: Record<string, string> = {
  front_collision: "Front Collision",
  rear_collision: "Rear Collision",
  side_collision: "Side Collision",
  hail_damage: "Hail Damage",
};

const SEVERITY_LABELS: Record<string, string> = {
  minor: "Minor",
  moderate: "Moderate",
  severe: "Severe",
};

const SEVERITY_COLORS: Record<string, "default" | "secondary" | "destructive"> = {
  minor: "secondary",
  moderate: "default",
  severe: "destructive",
};

// ─── Result type (mirrors server return) ──────────────────────────────────────
interface SimulationResult {
  success: boolean;
  claimId: number;
  claimNumber: string;
  isSimulated: boolean;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number;
  damageType: string;
  estimatedSeverity: string;
  baseCostEstimate: number;
  quotesGenerated: number;
  quoteAmounts: number[];
  garageNames: string[];
  damageParts: string[];
  message: string;
}

// ─── Component ─────────────────────────────────────────────────────────────────
export default function ClaimSimulator() {
  const [result, setResult] = useState<SimulationResult | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
    reset,
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      vehicleMake: "Toyota",
      vehicleModel: "Hilux",
      vehicleYear: 2022,
      damageType: "front_collision",
      estimatedSeverity: "moderate",
      numberOfQuotes: 3,
    },
  });

  const simulateMutation = trpc.platform.simulateClaim.useMutation({
    onSuccess: (data) => {
      setResult(data as SimulationResult);
      toast.success(`Claim ${data.claimNumber} created`, {
        description: `${data.quotesGenerated} quotes generated. AI assessment running in background.`,
      });
    },
    onError: (err) => {
      toast.error("Simulation failed", { description: err.message });
    },
  });

  const onSubmit = (values: FormValues) => {
    setResult(null);
    simulateMutation.mutate(values);
  };

  const handleReset = () => {
    reset();
    setResult(null);
  };

  const watchedSeverity = watch("estimatedSeverity");
  const watchedDamageType = watch("damageType");

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-4">
        <div className="p-3 rounded-xl bg-violet-500/10 border border-violet-500/20">
          <FlaskConical className="h-6 w-6 text-violet-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Claim Simulation Engine</h1>
          <p className="text-muted-foreground mt-1">
            Generate synthetic claims to validate the end-to-end workflow — AI assessment,
            quote comparison, and fraud detection — without affecting production data.
          </p>
        </div>
      </div>

      <Alert className="border-amber-500/30 bg-amber-500/5">
        <AlertTriangle className="h-4 w-4 text-amber-400" />
        <AlertTitle className="text-amber-400">Simulated data only</AlertTitle>
        <AlertDescription className="text-muted-foreground">
          All claims created here are tagged <code className="text-xs bg-muted px-1 py-0.5 rounded">is_simulated = true</code> and{" "}
          <code className="text-xs bg-muted px-1 py-0.5 rounded">claim_source = &quot;simulator&quot;</code>. They are excluded from
          production dashboards and KPI reports.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* ── Form ───────────────────────────────────────────────────────────── */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Car className="h-4 w-4 text-muted-foreground" />
              Simulation Parameters
            </CardTitle>
            <CardDescription>
              Configure the vehicle and damage scenario to simulate.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              {/* Vehicle details */}
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Vehicle
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="vehicleMake">Make</Label>
                    <Input
                      id="vehicleMake"
                      placeholder="e.g. Toyota"
                      {...register("vehicleMake")}
                    />
                    {errors.vehicleMake && (
                      <p className="text-xs text-destructive">{errors.vehicleMake.message}</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="vehicleModel">Model</Label>
                    <Input
                      id="vehicleModel"
                      placeholder="e.g. Hilux"
                      {...register("vehicleModel")}
                    />
                    {errors.vehicleModel && (
                      <p className="text-xs text-destructive">{errors.vehicleModel.message}</p>
                    )}
                  </div>
                </div>
                <div className="space-y-1.5 pt-1">
                  <Label htmlFor="vehicleYear">Year</Label>
                  <Input
                    id="vehicleYear"
                    type="number"
                    min={1980}
                    max={new Date().getFullYear() + 1}
                    {...register("vehicleYear", { valueAsNumber: true })}
                  />
                  {errors.vehicleYear && (
                    <p className="text-xs text-destructive">{errors.vehicleYear.message}</p>
                  )}
                </div>
              </div>

              <Separator />

              {/* Damage scenario */}
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Damage Scenario
                </p>
                <div className="space-y-1.5">
                  <Label>Damage Type</Label>
                  <Select
                    value={watchedDamageType}
                    onValueChange={(v) => setValue("damageType", v as FormValues["damageType"])}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select damage type" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(DAMAGE_TYPE_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Severity</Label>
                  <Select
                    value={watchedSeverity}
                    onValueChange={(v) => setValue("estimatedSeverity", v as FormValues["estimatedSeverity"])}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select severity" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(SEVERITY_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Separator />

              {/* Quote count */}
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Repair Quotes
                </p>
                <div className="space-y-1.5">
                  <Label>Number of Quotes</Label>
                  <Select
                    value={String(watch("numberOfQuotes"))}
                    onValueChange={(v) => setValue("numberOfQuotes", Number(v))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select quote count" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2">2 quotes</SelectItem>
                      <SelectItem value="3">3 quotes (includes outlier)</SelectItem>
                      <SelectItem value="4">4 quotes (includes outlier)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    When 3+ quotes are selected, the last quote is intentionally inflated
                    (+40–80%) to stress-test the cost optimisation logic.
                  </p>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  type="submit"
                  disabled={simulateMutation.isPending}
                  className="flex-1"
                >
                  {simulateMutation.isPending ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Simulating…
                    </>
                  ) : (
                    <>
                      <Zap className="mr-2 h-4 w-4" />
                      Run Simulation
                    </>
                  )}
                </Button>
                {result && (
                  <Button type="button" variant="outline" onClick={handleReset}>
                    Reset
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        {/* ── Info panel ─────────────────────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Wrench className="h-4 w-4 text-muted-foreground" />
                What gets created
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <div className="flex gap-2">
                <span className="text-green-400 mt-0.5">✓</span>
                <span>Claim record with <code className="text-xs bg-muted px-1 rounded">is_simulated=1</code></span>
              </div>
              <div className="flex gap-2">
                <span className="text-green-400 mt-0.5">✓</span>
                <span>Placeholder damage photo document</span>
              </div>
              <div className="flex gap-2">
                <span className="text-green-400 mt-0.5">✓</span>
                <span>2–4 panel beater quotes with realistic variance</span>
              </div>
              <div className="flex gap-2">
                <span className="text-green-400 mt-0.5">✓</span>
                <span>AI damage assessment triggered (background)</span>
              </div>
              <div className="flex gap-2">
                <span className="text-amber-400 mt-0.5">⚠</span>
                <span>Last quote (3+) is an intentional outlier for fraud detection testing</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                Severity guide
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Minor</span>
                <span>~40% of base cost</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Moderate</span>
                <span>~100% of base cost</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Severe</span>
                <span>~190% of base cost</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Result card ──────────────────────────────────────────────────────── */}
      {result && (
        <Card className="border-green-500/30 bg-green-500/5">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-green-400">
                <CheckCircle2 className="h-5 w-5" />
                Simulation Complete
              </CardTitle>
              <Badge variant="outline" className="border-green-500/30 text-green-400">
                {result.claimNumber}
              </Badge>
            </div>
            <CardDescription>{result.message}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Vehicle + scenario summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Vehicle</p>
                <p className="font-medium">
                  {result.vehicleYear} {result.vehicleMake} {result.vehicleModel}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Damage</p>
                <p className="font-medium">{DAMAGE_TYPE_LABELS[result.damageType]}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Severity</p>
                <Badge variant={SEVERITY_COLORS[result.estimatedSeverity]}>
                  {SEVERITY_LABELS[result.estimatedSeverity]}
                </Badge>
              </div>
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Base Estimate</p>
                <p className="font-medium">R{result.baseCostEstimate.toLocaleString()}</p>
              </div>
            </div>

            <Separator />

            {/* Quote amounts */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Generated Quotes
              </p>
              <div className="space-y-2">
                {result.quoteAmounts.map((amount, idx) => {
                  const isOutlier = idx === result.quoteAmounts.length - 1 && result.quoteAmounts.length >= 3;
                  const deviation = Math.round(((amount - result.baseCostEstimate) / result.baseCostEstimate) * 100);
                  return (
                    <div
                      key={idx}
                      className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                        isOutlier
                          ? "bg-red-500/10 border border-red-500/20"
                          : "bg-muted/50"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground w-4">{idx + 1}.</span>
                        <span className="font-medium">{result.garageNames[idx]}</span>
                        {isOutlier && (
                          <Badge variant="destructive" className="text-xs">Outlier</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span
                          className={`text-xs ${
                            deviation > 30
                              ? "text-red-400"
                              : deviation < -10
                              ? "text-green-400"
                              : "text-muted-foreground"
                          }`}
                        >
                          {deviation > 0 ? "+" : ""}{deviation}%
                        </span>
                        <span className="font-semibold tabular-nums">
                          R{amount.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <Separator />

            {/* Parts list */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Affected Parts ({result.damageParts.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {result.damageParts.map((part) => (
                  <Badge key={part} variant="secondary" className="text-xs">
                    {part}
                  </Badge>
                ))}
              </div>
            </div>

            {/* CTA */}
            <div className="flex gap-3 pt-1">
              <Button asChild variant="outline" size="sm">
                <Link href={`/insurer/claims/${result.claimId}`}>
                  <ExternalLink className="mr-2 h-3.5 w-3.5" />
                  View Claim
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
              >
                Run Another Simulation
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
