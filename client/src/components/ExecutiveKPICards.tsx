/**
 * Executive KPI Cards Component
 * 
 * Displays key performance indicators with progressive disclosure modals
 * for detailed drill-down analysis.
 */

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { 
  TrendingUp, 
  TrendingDown,
  DollarSign, 
  Clock, 
  Shield,
  AlertTriangle,
  CheckCircle,
  ArrowUpRight,
  ArrowDownRight,
  Eye,
  type LucideIcon
} from "lucide-react";

interface KPICardProps {
  title: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  icon: LucideIcon;
  color: string;
  onClick?: () => void;
}

function KPICard({ title, value, change, changeLabel, icon: Icon, color, onClick }: KPICardProps) {
  const isPositive = change !== undefined && change >= 0;
  
  return (
    <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={onClick}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
          color === 'blue' ? 'bg-primary/10 text-primary' :
          color === 'purple' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600' :
          color === 'red' ? 'bg-red-100 dark:bg-red-900/30 text-red-600' :
          color === 'green' ? 'bg-green-100 dark:bg-green-900/30 text-green-600' : 'bg-gray-100 dark:bg-muted text-gray-600 dark:text-muted-foreground'
        }`}>
          <Icon />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold">{value}</div>
        {change !== undefined && (
          <div className="flex items-center gap-2 mt-2">
            {isPositive ? (
              <ArrowUpRight className="h-4 w-4 text-green-600" />
            ) : (
              <ArrowDownRight className="h-4 w-4 text-red-600" />
            )}
            <span className={`text-sm ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
              {Math.abs(change)}% {changeLabel || "vs last month"}
            </span>
          </div>
        )}
        {onClick && (
          <Button variant="ghost" size="sm" className="mt-3 w-full">
            <Eye className="mr-2 h-4 w-4" />
            View Details
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

interface ExecutiveKPICardsProps {
  tenantId?: string;
}

export default function ExecutiveKPICards({ tenantId }: ExecutiveKPICardsProps) {
  const { currencySymbol } = useTenantCurrency();
  const [selectedKPI, setSelectedKPI] = useState<"claims" | "time" | "fraud" | "savings" | null>(null);

  // Mock KPI data (will be replaced with tRPC queries)
  const kpis = {
    claimsProcessed: {
      value: 1247,
      change: 12.5,
      details: {
        thisMonth: 1247,
        lastMonth: 1109,
        byComplexity: {
          simple: 456,
          moderate: 523,
          complex: 234,
          exceptional: 34
        },
        avgProcessingTime: "3.2 days"
      }
    },
    avgProcessingTime: {
      value: "3.2 days",
      change: -8.3,
      details: {
        byComplexity: {
          simple: "1.5 days",
          moderate: "3.8 days",
          complex: "7.2 days",
          exceptional: "15.6 days"
        },
        slaCompliance: {
          simple: 98.2,
          moderate: 94.5,
          complex: 89.3,
          exceptional: 76.8
        }
      }
    },
    fraudDetectionRate: {
      value: "4.2%",
      change: 15.8,
      details: {
        flagged: 52,
        confirmed: 31,
        falsePositives: 21,
        savedAmount: `${currencySymbol}1.2M`,
        topIndicators: [
          "Duplicate claims",
          "Inflated repair costs",
          "Staged accidents"
        ]
      }
    },
    costSavings: {
      value: `${currencySymbol}2.4M`,
      change: 22.1,
      details: {
        aiAssessmentSavings: `${currencySymbol}1.1M`,
        fraudPrevention: `${currencySymbol}1.2M`,
        processOptimization: `${currencySymbol}100K`,
        avgSavingPerClaim: `${currencySymbol}1,925`
      }
    }
  };

  const renderClaimsProcessedModal = () => (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>Claims Processed - Detailed Breakdown</DialogTitle>
        <DialogDescription>
          Comprehensive view of claims processing metrics for {tenantId || "all tenants"}
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-6 py-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">This Month</p>
            <p className="text-3xl font-bold">{kpis.claimsProcessed.value}</p>
          </div>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Last Month</p>
            <p className="text-3xl font-bold text-muted-foreground">{kpis.claimsProcessed.details.lastMonth}</p>
          </div>
        </div>

        <div>
          <h4 className="font-semibold mb-3">Claims by Complexity</h4>
          <div className="space-y-2">
            {Object.entries(kpis.claimsProcessed.details.byComplexity).map(([complexity, count]) => (
              <div key={complexity} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-muted/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Badge variant={complexity === "exceptional" ? "destructive" : "secondary"}>
                    {complexity.charAt(0).toUpperCase() + complexity.slice(1)}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {complexity === "simple" ? "2-day SLA" : 
                     complexity === "moderate" ? "5-day SLA" :
                     complexity === "complex" ? "10-day SLA" : "20-day SLA"}
                  </span>
                </div>
                <span className="font-semibold">{count} claims</span>
              </div>
            ))}
          </div>
        </div>

        <div className="p-4 bg-primary/5 rounded-lg">
          <p className="text-sm text-secondary">
            <strong>Average Processing Time:</strong> {kpis.claimsProcessed.details.avgProcessingTime}
          </p>
        </div>
      </div>
    </DialogContent>
  );

  const renderProcessingTimeModal = () => (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>Processing Time - Complexity-Adjusted SLA Tracking</DialogTitle>
        <DialogDescription>
          SLA compliance rates by claim complexity level
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-6 py-4">
        <div className="grid grid-cols-2 gap-4">
          {Object.entries(kpis.avgProcessingTime.details.byComplexity).map(([complexity, time]) => {
            const compliance = kpis.avgProcessingTime.details.slaCompliance[complexity as keyof typeof kpis.avgProcessingTime.details.slaCompliance];
            const isGood = compliance >= 90;
            
            return (
              <Card key={complexity}>
                <CardHeader>
                  <CardTitle className="text-base capitalize">{complexity}</CardTitle>
                  <CardDescription>
                    {complexity === "simple" ? "2-day SLA" : 
                     complexity === "moderate" ? "5-day SLA" :
                     complexity === "complex" ? "10-day SLA" : "20-day SLA"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div>
                      <p className="text-sm text-muted-foreground">Avg Time</p>
                      <p className="text-2xl font-bold">{time}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">SLA Compliance</p>
                      <div className="flex items-center gap-2">
                        <p className={`text-xl font-bold ${isGood ? 'text-green-600' : 'text-orange-600'}`}>
                          {compliance}%
                        </p>
                        {isGood ? (
                          <CheckCircle className="h-5 w-5 text-green-600" />
                        ) : (
                          <AlertTriangle className="h-5 w-5 text-orange-600" />
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </DialogContent>
  );

  const renderFraudDetectionModal = () => (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>Fraud Detection - Performance Metrics</DialogTitle>
        <DialogDescription>
          Fraud prevention impact and detection accuracy
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-6 py-4">
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-4 bg-orange-50 dark:bg-orange-950/30 rounded-lg">
            <p className="text-sm text-muted-foreground mb-1">Flagged</p>
            <p className="text-3xl font-bold text-orange-600">{kpis.fraudDetectionRate.details.flagged}</p>
          </div>
          <div className="text-center p-4 bg-red-50 dark:bg-red-950/30 rounded-lg">
            <p className="text-sm text-muted-foreground mb-1">Confirmed</p>
            <p className="text-3xl font-bold text-red-600">{kpis.fraudDetectionRate.details.confirmed}</p>
          </div>
          <div className="text-center p-4 bg-green-50 dark:bg-green-950/30 rounded-lg">
            <p className="text-sm text-muted-foreground mb-1">Saved</p>
            <p className="text-3xl font-bold text-green-600">{kpis.fraudDetectionRate.details.savedAmount}</p>
          </div>
        </div>

        <div>
          <h4 className="font-semibold mb-3">Top Fraud Indicators</h4>
          <div className="space-y-2">
            {kpis.fraudDetectionRate.details.topIndicators.map((indicator, idx) => (
              <div key={idx} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-muted/50 rounded-lg">
                <Shield className="h-5 w-5 text-red-600" />
                <span>{indicator}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="p-4 bg-primary/5 rounded-lg">
          <p className="text-sm text-secondary">
            <strong>Detection Accuracy:</strong> {((kpis.fraudDetectionRate.details.confirmed / kpis.fraudDetectionRate.details.flagged) * 100).toFixed(1)}%
            <span className="ml-2 text-muted-foreground">
              ({kpis.fraudDetectionRate.details.falsePositives} false positives)
            </span>
          </p>
        </div>
      </div>
    </DialogContent>
  );

  const renderCostSavingsModal = () => (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>Cost Savings - Breakdown by Category</DialogTitle>
        <DialogDescription>
          Total cost savings achieved through AI and automation
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-6 py-4">
        <div className="text-center p-6 bg-green-50 dark:bg-green-950/30 rounded-lg">
          <p className="text-sm text-muted-foreground mb-2">Total Savings This Month</p>
          <p className="text-5xl font-bold text-green-600">{kpis.costSavings.value}</p>
        </div>

        <div className="space-y-3">
          {Object.entries(kpis.costSavings.details).map(([category, amount]) => {
            if (category === "avgSavingPerClaim") return null;
            
            const percentage = (parseFloat(amount.replace(/[^0-9.]/g, "")) / parseFloat(kpis.costSavings.value.replace(/[^0-9.]/g, ""))) * 100;
            
            return (
              <div key={category} className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium capitalize">
                    {category.replace(/([A-Z])/g, " $1").trim()}
                  </span>
                  <span className="font-bold">{amount}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-green-600 h-2 rounded-full" 
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="p-4 bg-primary/5 rounded-lg">
          <p className="text-sm text-secondary">
            <strong>Average Saving Per Claim:</strong> {kpis.costSavings.details.avgSavingPerClaim}
          </p>
        </div>
      </div>
    </DialogContent>
  );

  return (
    <>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="Claims Processed"
          value={kpis.claimsProcessed.value}
          change={kpis.claimsProcessed.change}
          icon={CheckCircle}
          color="blue"
          onClick={() => setSelectedKPI("claims")}
        />
        <KPICard
          title="Avg Processing Time"
          value={kpis.avgProcessingTime.value}
          change={kpis.avgProcessingTime.change}
          icon={Clock}
          color="purple"
          onClick={() => setSelectedKPI("time")}
        />
        <KPICard
          title="Fraud Detection Rate"
          value={kpis.fraudDetectionRate.value}
          change={kpis.fraudDetectionRate.change}
          icon={Shield}
          color="red"
          onClick={() => setSelectedKPI("fraud")}
        />
        <KPICard
          title="Cost Savings"
          value={kpis.costSavings.value}
          change={kpis.costSavings.change}
          icon={DollarSign}
          color="green"
          onClick={() => setSelectedKPI("savings")}
        />
      </div>

      {/* Progressive Disclosure Modals */}
      <Dialog open={selectedKPI === "claims"} onOpenChange={() => setSelectedKPI(null)}>
        {renderClaimsProcessedModal()}
      </Dialog>

      <Dialog open={selectedKPI === "time"} onOpenChange={() => setSelectedKPI(null)}>
        {renderProcessingTimeModal()}
      </Dialog>

      <Dialog open={selectedKPI === "fraud"} onOpenChange={() => setSelectedKPI(null)}>
        {renderFraudDetectionModal()}
      </Dialog>

      <Dialog open={selectedKPI === "savings"} onOpenChange={() => setSelectedKPI(null)}>
        {renderCostSavingsModal()}
      </Dialog>
    </>
  );
}
