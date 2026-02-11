import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Users, Car, AlertCircle, TrendingUp } from 'lucide-react';
import { trpc } from '@/lib/trpc';

export default function FleetRisk() {
  // Fetch real data from tRPC
  const { data: fleetOverview, isLoading: overviewLoading } = trpc.analytics.fleetRiskOverview.useQuery();
  const { data: driverProfiles, isLoading: profilesLoading } = trpc.analytics.driverProfiles.useQuery();

  const getRiskBadge = (riskScore: number) => {
    if (riskScore >= 80) return <Badge variant="destructive">High Risk</Badge>;
    if (riskScore >= 50) return <Badge className="bg-yellow-500 hover:bg-yellow-600">Medium Risk</Badge>;
    return <Badge className="bg-green-500 hover:bg-green-600">Low Risk</Badge>;
  };

  if (overviewLoading || profilesLoading) {
    return (
      <div className="container mx-auto py-8">
        <div className="text-center">Loading fleet risk data...</div>
      </div>
    );
  }

  const drivers = driverProfiles || [];

  return (
    <div className="container mx-auto py-8 space-y-6">
      <h1 className="text-3xl font-bold">Fleet Risk Monitoring</h1>

      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4" />
              Drivers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fleetOverview?.driverCount || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Car className="h-4 w-4" />
              Vehicles
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fleetOverview?.vehicleCount || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              Claims (12mo)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fleetOverview?.claimCount || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Avg Risk Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fleetOverview?.avgRiskScore?.toFixed(1) || '0.0'}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Driver Risk Profiles</CardTitle>
          <CardDescription>Sorted by risk score (highest first)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {drivers.map((driver: any) => (
              <div key={driver.driverId} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-4">
                  <div>
                    <p className="font-medium">{driver.driverName}</p>
                    <p className="text-sm text-muted-foreground">
                      {driver.claimCount} claims
                    </p>
                  </div>
                  {getRiskBadge(driver.riskScore)}
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Total Claims</p>
                  <p className="font-semibold">${driver.totalClaimCost?.toLocaleString() || '0'}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Driver Behavior Metrics</CardTitle>
          <CardDescription>Telematics data summary</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={drivers.slice(0, 10)}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="driverName" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="harshBraking" fill="#dc2626" name="Harsh Braking" />
              <Bar dataKey="rapidAcceleration" fill="#ea580c" name="Rapid Acceleration" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
