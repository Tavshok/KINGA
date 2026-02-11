import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { MapPin, AlertTriangle } from 'lucide-react';
import { trpc } from '@/lib/trpc';

export default function FraudHeatmap() {
  // Fetch real data from tRPC
  const { data: heatmapData, isLoading: heatmapLoading } = trpc.analytics.fraudHeatmap.useQuery();
  const { data: fraudPatterns, isLoading: patternsLoading } = trpc.analytics.fraudPatterns.useQuery();

  const getColor = (fraudScore: number) => {
    if (fraudScore >= 90) return '#dc2626'; // red-600
    if (fraudScore >= 80) return '#ea580c'; // orange-600
    if (fraudScore >= 70) return '#ca8a04'; // yellow-600
    return '#16a34a'; // green-600
  };

  if (heatmapLoading || patternsLoading) {
    return (
      <div className="container mx-auto py-8">
        <div className="text-center">Loading fraud analytics data...</div>
      </div>
    );
  }

  const chartData = heatmapData || [];

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
            <div className="text-2xl font-bold">{fraudPatterns?.highRiskLocations || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Fraud Cases</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fraudPatterns?.totalFraudCases || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Estimated Fraud Loss</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${fraudPatterns?.estimatedFraudLoss?.toLocaleString() || '0'}</div>
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
              <XAxis type="number" dataKey="lng" name="Longitude" />
              <YAxis type="number" dataKey="lat" name="Latitude" />
              <ZAxis type="number" dataKey="fraudCount" range={[50, 1000]} />
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
              <Scatter data={chartData} fill="#8884d8">
                {chartData.map((entry: any, index: number) => (
                  <Cell key={`cell-${index}`} fill={getColor(entry.avgFraudScore)} />
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
            {chartData.slice(0, 10).map((location: any, index: number) => (
              <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <MapPin className="h-5 w-5 text-red-500" />
                  <div>
                    <p className="font-medium">{location.city}{location.province && `, ${location.province}`}</p>
                    <p className="text-sm text-muted-foreground">
                      {location.fraudCount} cases | Avg Score: {(location.avgFraudScore / 100).toFixed(2)}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold">${location.totalAmount?.toLocaleString() || '0'}</p>
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
