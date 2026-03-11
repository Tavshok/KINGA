import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, CheckCircle2, XCircle, Info } from "lucide-react";

interface PhysicsValidation {
  overallConfidence: number;
  speedConsistency: number;
  damagePropagation: number;
  impactForceAnalysis: number;
  geometricAlignment: number;
  anomalies: Array<{
    type: "info" | "warning" | "error";
    title: string;
    description: string;
    riskLevel: "low" | "medium" | "high";
  }>;
  recommendation: "approve" | "review" | "reject";
  narrativeSummary: string;
}

interface PhysicsConfidenceDashboardProps {
  validation: PhysicsValidation;
}

export default function PhysicsConfidenceDashboard({ validation }: PhysicsConfidenceDashboardProps) {
  const getConfidenceColor = (score: number) => {
    if (score >= 85) return "text-green-600";
    if (score >= 70) return "text-yellow-600";
    return "text-red-600";
  };

  const getConfidenceBg = (score: number) => {
    if (score >= 85) return "bg-green-500";
    if (score >= 70) return "bg-yellow-500";
    return "bg-red-500";
  };

  const getRecommendationBadge = () => {
    switch (validation.recommendation) {
      case "approve":
        return <Badge className="bg-green-500">✅ APPROVE CLAIM</Badge>;
      case "review":
        return <Badge className="bg-yellow-500">⚠️ REQUIRES REVIEW</Badge>;
      case "reject":
        return <Badge className="bg-red-500">❌ REJECT CLAIM</Badge>;
    }
  };

  const getAnomalyIcon = (type: string) => {
    switch (type) {
      case "info":
        return <Info className="h-5 w-5 text-primary/80" />;
      case "warning":
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case "error":
        return <XCircle className="h-5 w-5 text-red-500" />;
    }
  };

  const getAnomalyBg = (type: string) => {
    switch (type) {
      case "info":
        return "bg-primary/5 border-primary/20";
      case "warning":
        return "bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800";
      case "error":
        return "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800";
    }
  };

  return (
    <Card className="border-2">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              🔬 KINGA Physics Validation Report
            </CardTitle>
            <CardDescription>
              Scientific analysis based on peer-reviewed accident reconstruction principles
            </CardDescription>
          </div>
          {getRecommendationBadge()}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Overall Assessment */}
        <div className="p-4 bg-gradient-to-r from-primary/5 to-accent/5 rounded-lg border">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-lg">Overall Assessment</h3>
            <div className="flex items-center gap-2">
              {validation.overallConfidence >= 85 ? (
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              ) : validation.overallConfidence >= 70 ? (
                <AlertTriangle className="h-6 w-6 text-yellow-600" />
              ) : (
                <XCircle className="h-6 w-6 text-red-600" />
              )}
              <span className={`text-2xl font-bold ${getConfidenceColor(validation.overallConfidence)}`}>
                {validation.overallConfidence}%
              </span>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">Confidence Level</p>
        </div>

        {/* Collision Dynamics Analysis */}
        <div>
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <span className="text-lg">Collision Dynamics Analysis</span>
            <Badge variant="outline" className="text-xs">PROPRIETARY</Badge>
          </h3>
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium">Speed Consistency</span>
                <span className={`text-sm font-bold ${getConfidenceColor(validation.speedConsistency)}`}>
                  {validation.speedConsistency}%
                </span>
              </div>
              <Progress value={validation.speedConsistency} className="h-2" />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium">Damage Propagation</span>
                <span className={`text-sm font-bold ${getConfidenceColor(validation.damagePropagation)}`}>
                  {validation.damagePropagation}%
                </span>
              </div>
              <Progress value={validation.damagePropagation} className="h-2" />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium">Impact Force Analysis</span>
                <span className={`text-sm font-bold ${getConfidenceColor(validation.impactForceAnalysis)}`}>
                  {validation.impactForceAnalysis}%
                </span>
              </div>
              <Progress value={validation.impactForceAnalysis} className="h-2" />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium">Geometric Alignment</span>
                <span className={`text-sm font-bold ${getConfidenceColor(validation.geometricAlignment)}`}>
                  {validation.geometricAlignment}%
                </span>
              </div>
              <Progress value={validation.geometricAlignment} className="h-2" />
            </div>
          </div>
        </div>

        {/* Anomaly Detection */}
        {(validation.anomalies ?? []).length > 0 && (
          <div>
            <h3 className="font-semibold mb-3 text-lg">Anomaly Detection</h3>
            <div className="space-y-3">
              {(validation.anomalies ?? []).map((anomaly, index) => (
                <div key={index} className={`p-3 rounded-lg border ${getAnomalyBg(anomaly.type)}`}>
                  <div className="flex items-start gap-3">
                    {getAnomalyIcon(anomaly.type)}
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <h4 className="font-medium text-sm">{anomaly.title}</h4>
                        <Badge 
                          variant="outline" 
                          className={
                            anomaly.riskLevel === "high" ? "border-red-500 text-red-700 dark:text-red-300" :
                            anomaly.riskLevel === "medium" ? "border-yellow-500 text-yellow-700 dark:text-yellow-300" :
                            "border-green-500 text-green-700 dark:text-green-300"
                          }
                        >
                          {anomaly.riskLevel.toUpperCase()}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{anomaly.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Narrative Summary */}
        <div className="p-4 bg-muted rounded-lg">
          <h3 className="font-semibold mb-2 text-sm text-muted-foreground">SCIENTIFIC ASSESSMENT</h3>
          <p className="text-sm leading-relaxed">{validation.narrativeSummary}</p>
        </div>

        {/* Benchmarking Footer */}
        <div className="pt-4 border-t text-center text-xs text-muted-foreground space-y-1">
          <p>Powered by KINGA Physics Engine™</p>
          <p>Based on peer-reviewed accident reconstruction principles</p>
          <p>Validated against 70,000+ historical claims</p>
        </div>
      </CardContent>
    </Card>
  );
}
