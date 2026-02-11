import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useLocation } from 'wouter';
import { TrendingUp, MapPin, Users, Wrench, ArrowRight } from 'lucide-react';

const dashboards = [
  {
    id: 'claims-cost',
    title: 'Claims Cost Trend Analytics',
    description: 'Analyze claim costs over time with trend forecasting and breakdown by type',
    icon: TrendingUp,
    path: '/analytics/claims-cost',
    color: 'text-blue-500',
    bgColor: 'bg-blue-50',
  },
  {
    id: 'fraud-heatmap',
    title: 'Fraud Heatmap & Pattern Analysis',
    description: 'Geographic fraud distribution and hotspot identification across regions',
    icon: MapPin,
    path: '/analytics/fraud-heatmap',
    color: 'text-red-500',
    bgColor: 'bg-red-50',
  },
  {
    id: 'fleet-risk',
    title: 'Fleet Risk Monitoring',
    description: 'Driver profiles, telematics data, and fleet performance metrics',
    icon: Users,
    path: '/analytics/fleet-risk',
    color: 'text-green-500',
    bgColor: 'bg-green-50',
  },
  {
    id: 'panel-beater',
    title: 'Panel Beater Performance',
    description: 'Repairer metrics, turnaround times, and quality tracking with real-time updates',
    icon: Wrench,
    path: '/analytics/panel-beater',
    color: 'text-orange-500',
    bgColor: 'bg-orange-50',
  },
];

export default function AnalyticsHub() {
  const [, setLocation] = useLocation();

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Analytics Hub</h1>
        <p className="text-muted-foreground mt-2">
          Comprehensive analytics and insights for insurance operations
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {dashboards.map((dashboard) => {
          const Icon = dashboard.icon;
          return (
            <Card key={dashboard.id} className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => setLocation(dashboard.path)}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className={`p-3 rounded-lg ${dashboard.bgColor}`}>
                    <Icon className={`h-6 w-6 ${dashboard.color}`} />
                  </div>
                  <Button variant="ghost" size="icon">
                    <ArrowRight className="h-5 w-5" />
                  </Button>
                </div>
                <CardTitle className="mt-4">{dashboard.title}</CardTitle>
                <CardDescription>{dashboard.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="w-full" onClick={(e) => { e.stopPropagation(); setLocation(dashboard.path); }}>
                  View Dashboard
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>About Analytics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="font-semibold mb-2">Real-time Data</h3>
            <p className="text-sm text-muted-foreground">
              Panel Beater Performance dashboard includes WebSocket-powered real-time updates for live repair status tracking.
            </p>
          </div>
          <div>
            <h3 className="font-semibold mb-2">Interactive Visualizations</h3>
            <p className="text-sm text-muted-foreground">
              All dashboards feature interactive charts built with Recharts for data exploration and analysis.
            </p>
          </div>
          <div>
            <h3 className="font-semibold mb-2">Export Capabilities</h3>
            <p className="text-sm text-muted-foreground">
              Claims Cost Trend dashboard supports CSV export for further analysis in external tools.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
