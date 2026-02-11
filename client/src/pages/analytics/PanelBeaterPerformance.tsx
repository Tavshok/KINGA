import { useState, useEffect } from 'react';
import useWebSocket, { ReadyState } from 'react-use-websocket';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Star, Clock, Wifi, WifiOff } from 'lucide-react';

// Mock data - replace with tRPC query when backend is ready
const initialPerformanceData = [
  { panel_beater_id: '1', business_name: 'Premium Auto Body', total_repairs: 156, avg_turnaround_days: 4.2, avg_quote_amount: 18500, avg_final_amount: 17800, rework_count: 3, avg_customer_rating: 4.8, on_time_count: 148 },
  { panel_beater_id: '2', business_name: 'QuickFix Panel Beaters', total_repairs: 189, avg_turnaround_days: 3.8, avg_quote_amount: 16200, avg_final_amount: 15900, rework_count: 8, avg_customer_rating: 4.6, on_time_count: 175 },
  { panel_beater_id: '3', business_name: 'Elite Collision Repair', total_repairs: 142, avg_turnaround_days: 5.1, avg_quote_amount: 21000, avg_final_amount: 20500, rework_count: 5, avg_customer_rating: 4.5, on_time_count: 130 },
  { panel_beater_id: '4', business_name: 'City Auto Works', total_repairs: 201, avg_turnaround_days: 4.5, avg_quote_amount: 17800, avg_final_amount: 17200, rework_count: 12, avg_customer_rating: 4.3, on_time_count: 185 },
  { panel_beater_id: '5', business_name: 'Precision Body Shop', total_repairs: 128, avg_turnaround_days: 3.9, avg_quote_amount: 19200, avg_final_amount: 18800, rework_count: 4, avg_customer_rating: 4.7, on_time_count: 122 },
];

export default function PanelBeaterPerformance() {
  const [performanceData, setPerformanceData] = useState(initialPerformanceData);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);

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
          if (pb.panel_beater_id === update.panel_beater_id.toString()) {
            return {
              ...pb,
              total_repairs: pb.total_repairs + (update.status === 'completed' ? 1 : 0),
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
        {performanceData.map((pb, index) => {
          const onTimeRate = (pb.on_time_count / pb.total_repairs) * 100;
          const reworkRate = (pb.rework_count / pb.total_repairs) * 100;

          return (
            <Card key={pb.panel_beater_id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      #{index + 1} {pb.business_name}
                    </CardTitle>
                    <CardDescription>{pb.total_repairs} repairs completed</CardDescription>
                  </div>
                  <div className="flex items-center gap-1">
                    {getRatingStars(pb.avg_customer_rating)}
                    <span className="ml-2 text-sm font-medium">{pb.avg_customer_rating.toFixed(1)}</span>
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
                    <p className="text-lg font-semibold">{pb.avg_turnaround_days.toFixed(1)} days</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">On-Time Delivery</p>
                    <p className="text-lg font-semibold">{onTimeRate.toFixed(1)}%</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Rework Rate</p>
                    <p className="text-lg font-semibold">{reworkRate.toFixed(1)}%</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Avg Quote</p>
                    <p className="text-lg font-semibold">${pb.avg_quote_amount.toLocaleString()}</p>
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
