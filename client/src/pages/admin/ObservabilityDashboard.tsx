/**
 * Admin Observability Dashboard
 * 
 * Displays platform health metrics with color-coded status indicators:
 * - Green (>90%): Healthy
 * - Yellow (70-90%): Warning
 * - Red (<70%): Critical
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { trpc } from "@/lib/trpc";
import { Activity, AlertTriangle, CheckCircle2, RefreshCw, XCircle } from "lucide-react";

interface HealthStatusProps {
  status: "green" | "yellow" | "red";
  value: number;
  label: string;
}

function HealthStatusBadge({ status, value, label }: HealthStatusProps) {
  const colors = {
    green: "bg-green-100 text-green-800 border-green-300",
    yellow: "bg-yellow-100 text-yellow-800 border-yellow-300",
    red: "bg-red-100 text-red-800 border-red-300",
  };
  
  const icons = {
    green: <CheckCircle2 className="h-5 w-5" />,
    yellow: <AlertTriangle className="h-5 w-5" />,
    red: <XCircle className="h-5 w-5" />,
  };
  
  return (
    <div className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 ${colors[status]}`}>
      {icons[status]}
      <div className="flex flex-col">
        <span className="text-2xl font-bold">{value}{typeof value === 'number' && value < 100 ? '%' : ''}</span>
        <span className="text-sm">{label}</span>
      </div>
    </div>
  );
}

export default function ObservabilityDashboard() {
  const { data: metricsData, isLoading, refetch } = trpc.admin.getObservabilityMetrics.useQuery();
  const collectMetrics = trpc.admin.collectObservabilityMetrics.useMutation({
    onSuccess: () => {
      refetch();
      alert("Metrics collected successfully!");
    },
    onError: (error: any) => {
      alert(`Failed to collect metrics: ${error.message}`);
    },
  });
  
  if (isLoading) {
    return (
      <div className="container mx-auto py-8">
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
          <span className="ml-3 text-gray-600">Loading observability metrics...</span>
        </div>
      </div>
    );
  }
  
  const metrics = metricsData?.metrics || {};
  
  // Metric definitions
  const metricDefinitions = [
    {
      key: "ai_assessment_coverage",
      title: "AI Assessment Coverage",
      description: "Percentage of claims with damage photos that have AI assessments",
      unit: "%",
    },
    {
      key: "image_upload_success_rate",
      title: "Image Upload Success Rate",
      description: "Percentage of claims with successfully uploaded damage photos",
      unit: "%",
    },
    {
      key: "physics_quantitative_activation",
      title: "Physics Quantitative Activation",
      description: "Percentage of AI assessments using quantitative physics mode",
      unit: "%",
    },
    {
      key: "dashboard_query_avg_time",
      title: "Dashboard Query Avg Time",
      description: "Average query execution time for dashboard endpoints",
      unit: "ms",
    },
    {
      key: "failed_ai_processing_count",
      title: "Failed AI Processing Count",
      description: "Number of claims with photos but no AI assessment",
      unit: "",
    },
  ];
  
  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Activity className="h-8 w-8" />
            Platform Observability
          </h1>
          <p className="text-gray-600 mt-2">
            Real-time platform health monitoring with automated alerting
          </p>
        </div>
        
        <Button
          onClick={() => collectMetrics.mutate()}
          disabled={collectMetrics.isPending}
          className="flex items-center gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${collectMetrics.isPending ? 'animate-spin' : ''}`} />
          Collect Metrics
        </Button>
      </div>
      
      {Object.keys(metrics).length === 0 && (
        <Alert>
          <AlertDescription>
            No metrics available. Click "Collect Metrics" to generate the first observability report.
          </AlertDescription>
        </Alert>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {metricDefinitions.map((def) => {
          const metric = metrics[def.key];
          
          if (!metric) {
            return (
              <Card key={def.key} className="opacity-50">
                <CardHeader>
                  <CardTitle className="text-lg">{def.title}</CardTitle>
                  <CardDescription>{def.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-gray-400">No data available</div>
                </CardContent>
              </Card>
            );
          }
          
          return (
            <Card key={def.key} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="text-lg">{def.title}</CardTitle>
                <CardDescription>{def.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <HealthStatusBadge
                  status={metric.status}
                  value={metric.value}
                  label={metric.label}
                />
                
                {metric.status === "red" && (
                  <Alert className="mt-4 border-red-300 bg-red-50">
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                    <AlertDescription className="text-red-800">
                      Critical: This metric requires immediate attention
                    </AlertDescription>
                  </Alert>
                )}
                
                {metric.status === "yellow" && (
                  <Alert className="mt-4 border-yellow-300 bg-yellow-50">
                    <AlertTriangle className="h-4 w-4 text-yellow-600" />
                    <AlertDescription className="text-yellow-800">
                      Warning: Monitor this metric closely
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Health Status Legend</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-green-600" />
              <div>
                <div className="font-semibold">Green (&gt;90%)</div>
                <div className="text-sm text-gray-600">Healthy - System operating normally</div>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-6 w-6 text-yellow-600" />
              <div>
                <div className="font-semibold">Yellow (70-90%)</div>
                <div className="text-sm text-gray-600">Warning - Monitor closely</div>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <XCircle className="h-6 w-6 text-red-600" />
              <div>
                <div className="font-semibold">Red (&lt;70%)</div>
                <div className="text-sm text-gray-600">Critical - Immediate action required</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
