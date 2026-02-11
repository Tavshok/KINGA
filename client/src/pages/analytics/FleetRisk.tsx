import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Users, Car, AlertCircle, TrendingUp } from 'lucide-react';

// Mock data - replace with tRPC query when backend is ready
const mockFleetOverview = {
  driver_count: 45,
  vehicle_count: 52,
  claim_count: 28,
  avg_driver_risk_score: 42.5,
};

const mockDriverProfiles = [
  { driver_id: '1', driver_name: 'John Smith', risk_score: 78, years_experience: 3, claim_count: 5, total_claim_cost: 125000, avg_harsh_braking: 12, avg_rapid_acceleration: 8 },
  { driver_id: '2', driver_name: 'Sarah Johnson', risk_score: 65, years_experience: 5, claim_count: 3, total_claim_cost: 75000, avg_harsh_braking: 8, avg_rapid_acceleration: 6 },
  { driver_id: '3', driver_name: 'Michael Brown', risk_score: 58, years_experience: 7, claim_count: 2, total_claim_cost: 50000, avg_harsh_braking: 5, avg_rapid_acceleration: 4 },
  { driver_id: '4', driver_name: 'Emily Davis', risk_score: 45, years_experience: 10, claim_count: 1, total_claim_cost: 25000, avg_harsh_braking: 3, avg_rapid_acceleration: 2 },
  { driver_id: '5', driver_name: 'David Wilson', risk_score: 38, years_experience: 12, claim_count: 1, total_claim_cost: 20000, avg_harsh_braking: 2, avg_rapid_acceleration: 1 },
  { driver_id: '6', driver_name: 'Lisa Martinez', risk_score: 32, years_experience: 15, claim_count: 0, total_claim_cost: 0, avg_harsh_braking: 1, avg_rapid_acceleration: 1 },
];

export default function FleetRisk() {
  const getRiskBadge = (riskScore: number) => {
    if (riskScore >= 80) return <Badge variant="destructive">High Risk</Badge>;
    if (riskScore >= 50) return <Badge className="bg-yellow-500 hover:bg-yellow-600">Medium Risk</Badge>;
    return <Badge className="bg-green-500 hover:bg-green-600">Low Risk</Badge>;
  };

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
            <div className="text-2xl font-bold">{mockFleetOverview.driver_count}</div>
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
            <div className="text-2xl font-bold">{mockFleetOverview.vehicle_count}</div>
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
            <div className="text-2xl font-bold">{mockFleetOverview.claim_count}</div>
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
            <div className="text-2xl font-bold">{mockFleetOverview.avg_driver_risk_score.toFixed(1)}</div>
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
            {mockDriverProfiles.map((driver) => (
              <div key={driver.driver_id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-4">
                  <div>
                    <p className="font-medium">{driver.driver_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {driver.years_experience} years experience | {driver.claim_count} claims
                    </p>
                  </div>
                  {getRiskBadge(driver.risk_score)}
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Total Claims</p>
                  <p className="font-semibold">${driver.total_claim_cost.toLocaleString()}</p>
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
            <BarChart data={mockDriverProfiles.slice(0, 10)}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="driver_name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="avg_harsh_braking" fill="#dc2626" name="Harsh Braking" />
              <Bar dataKey="avg_rapid_acceleration" fill="#ea580c" name="Rapid Acceleration" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
