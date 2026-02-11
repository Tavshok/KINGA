import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { MapPin, AlertTriangle } from 'lucide-react';

// Mock data - replace with tRPC query when backend is ready
const mockHeatmapData = [
  { latitude: -26.2041, longitude: 28.0473, city: 'Johannesburg', province: 'Gauteng', fraud_count: 45, avg_fraud_score: 0.85, total_fraud_amount: 1350000 },
  { latitude: -29.8587, longitude: 31.0218, city: 'Durban', province: 'KwaZulu-Natal', fraud_count: 32, avg_fraud_score: 0.78, total_fraud_amount: 960000 },
  { latitude: -33.9249, longitude: 18.4241, city: 'Cape Town', province: 'Western Cape', fraud_count: 28, avg_fraud_score: 0.82, total_fraud_amount: 840000 },
  { latitude: -25.7479, longitude: 28.2293, city: 'Pretoria', province: 'Gauteng', fraud_count: 24, avg_fraud_score: 0.75, total_fraud_amount: 720000 },
  { latitude: -26.1076, longitude: 27.9825, city: 'Soweto', province: 'Gauteng', fraud_count: 19, avg_fraud_score: 0.88, total_fraud_amount: 570000 },
  { latitude: -29.1211, longitude: 26.2146, city: 'Bloemfontein', province: 'Free State', fraud_count: 15, avg_fraud_score: 0.72, total_fraud_amount: 450000 },
  { latitude: -33.0152, longitude: 27.9116, city: 'East London', province: 'Eastern Cape', fraud_count: 12, avg_fraud_score: 0.79, total_fraud_amount: 360000 },
  { latitude: -25.9653, longitude: 32.5892, city: 'Nelspruit', province: 'Mpumalanga', fraud_count: 9, avg_fraud_score: 0.81, total_fraud_amount: 270000 },
];

export default function FraudHeatmap() {
  const getColor = (fraudScore: number) => {
    if (fraudScore >= 0.9) return '#dc2626'; // red-600
    if (fraudScore >= 0.8) return '#ea580c'; // orange-600
    if (fraudScore >= 0.7) return '#ca8a04'; // yellow-600
    return '#16a34a'; // green-600
  };

  const totalFraudCases = mockHeatmapData.reduce((sum, row) => sum + row.fraud_count, 0);
  const totalFraudAmount = mockHeatmapData.reduce((sum, row) => sum + row.total_fraud_amount, 0);

  return (
    <div className="container mx-auto py-8 space-y-6">
      <h1 className="text-3xl font-bold">Fraud Heatmap & Pattern Analysis</h1>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              High-Risk Locations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mockHeatmapData.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Fraud Cases</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalFraudCases}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Estimated Fraud Loss</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalFraudAmount.toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Geographic Fraud Distribution</CardTitle>
          <CardDescription>Fraud hotspots by location (bubble size = fraud count)</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={500}>
            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
              <CartesianGrid />
              <XAxis type="number" dataKey="longitude" name="Longitude" />
              <YAxis type="number" dataKey="latitude" name="Latitude" />
              <ZAxis type="number" dataKey="fraud_count" range={[50, 1000]} />
              <Tooltip 
                cursor={{ strokeDasharray: '3 3' }}
                content={({ payload }) => {
                  if (!payload?.[0]) return null;
                  const data = payload[0].payload;
                  return (
                    <div className="bg-background border rounded-lg p-3 shadow-lg">
                      <p className="font-semibold">{data.city}, {data.province}</p>
                      <p className="text-sm">Fraud Cases: {data.fraud_count}</p>
                      <p className="text-sm">Avg Score: {data.avg_fraud_score.toFixed(2)}</p>
                      <p className="text-sm">Total Amount: ${data.total_fraud_amount.toLocaleString()}</p>
                    </div>
                  );
                }}
              />
              <Scatter data={mockHeatmapData} fill="#8884d8">
                {mockHeatmapData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={getColor(entry.avg_fraud_score)} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Top Fraud Locations</CardTitle>
          <CardDescription>Ranked by fraud case count</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {mockHeatmapData.slice(0, 10).map((location, index) => (
              <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <MapPin className="h-5 w-5 text-red-500" />
                  <div>
                    <p className="font-medium">{location.city}, {location.province}</p>
                    <p className="text-sm text-muted-foreground">
                      {location.fraud_count} cases | Avg Score: {location.avg_fraud_score.toFixed(2)}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold">${location.total_fraud_amount.toLocaleString()}</p>
                  <p className="text-sm text-muted-foreground">Total Amount</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
