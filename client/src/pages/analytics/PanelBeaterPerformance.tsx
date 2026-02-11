import { useState, useEffect } from 'react';
import useWebSocket, { ReadyState } from 'react-use-websocket';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Star, Clock, Wifi, WifiOff } from 'lucide-react';
import { trpc } from '@/lib/trpc';

export default function PanelBeaterPerformance() {
  // Fetch real data from tRPC
  const { data: performanceDataFromAPI, isLoading } = trpc.analytics.panelBeaterPerformance.useQuery();
  const [performanceData, setPerformanceData] = useState<any[]>([]);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);

  // Initialize performance data from API
  useEffect(() => {
    if (performanceDataFromAPI) {
      setPerformanceData(performanceDataFromAPI);
    }
  }, [performanceDataFromAPI]);

  // WebSocket connection to port 8080
  const { lastJsonMessage, readyState } = useWebSocket('ws://localhost:8080', {
    shouldReconnect: () => true,
    reconnectInterval: 3000,
  });

  useEffect(() => {
    if (lastJsonMessage) {
      console.log('[WebSocket] Received message:', lastJsonMessage);
      
      // Handle repair updates from WebSocket
      if ((lastJsonMessage as any).type === 'repair_update') {
        const update = (lastJsonMessage as any).data;
        setLastUpdate(`${update.status} - ${new Date(update.timestamp).toLocaleTimeString()}`);
        
        // Update performance data based on repair status
        setPerformanceData(prev => prev.map(pb => {
          if (pb.id === update.panel_beater_id) {
            return {
              ...pb,
              totalJobs: pb.totalJobs + (update.status === 'completed' ? 1 : 0),
            };
          }
          return pb;
        }));
      }
    }
  }, [lastJsonMessage]);

  const connectionStatus = {
    [ReadyState.CONNECTING]: { label: 'Connecting...', color: 'bg-yellow-500', icon: WifiOff },
    [ReadyState.OPEN]: { label: 'Connected', color: 'bg-green-500', icon: Wifi },
    [ReadyState.CLOSING]: { label: 'Closing...', color: 'bg-yellow-500', icon: WifiOff },
    [ReadyState.CLOSED]: { label: 'Disconnected', color: 'bg-red-500', icon: WifiOff },
    [ReadyState.UNINSTANTIATED]: { label: 'Not Connected', color: 'bg-gray-500', icon: WifiOff },
  }[readyState];

  const StatusIcon = connectionStatus.icon;

  const getRatingStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        className={`h-4 w-4 ${i < Math.round(rating) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`}
      />
    ));
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-8">
        <div className="text-center">Loading panel beater performance data...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Panel Beater Performance</h1>
          <p className="text-sm text-muted-foreground mt-1">Real-time performance tracking</p>
        </div>
        <div className="flex items-center gap-4">
          <Badge variant="outline" className="gap-2">
            <StatusIcon className="h-4 w-4" />
            {connectionStatus.label}
          </Badge>
          {lastUpdate && (
            <Badge variant="outline">
              Last Update: {lastUpdate}
            </Badge>
          )}
        </div>
      </div>

      <div className="grid gap-4">
        {performanceData.map((pb: any, index: number) => {
          return (
            <Card key={pb.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      #{index + 1} {pb.businessName}
                    </CardTitle>
                    <CardDescription>{pb.totalJobs} repairs completed</CardDescription>
                  </div>
                  <div className="flex items-center gap-1">
                    {getRatingStars(pb.customerRating)}
                    <span className="ml-2 text-sm font-medium">{pb.customerRating?.toFixed(1) || '0.0'}</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      Avg Turnaround
                    </p>
                    <p className="text-lg font-semibold">{pb.avgTurnaroundDays?.toFixed(1) || '0.0'} days</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">On-Time Delivery</p>
                    <p className="text-lg font-semibold">{pb.onTimePct?.toFixed(1) || '0.0'}%</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Rework Rate</p>
                    <p className="text-lg font-semibold">{pb.reworkRate?.toFixed(1) || '0.0'}%</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Avg Quote</p>
                    <p className="text-lg font-semibold">${pb.avgQuote?.toLocaleString() || '0'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
