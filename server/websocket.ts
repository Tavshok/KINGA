// @ts-nocheck
import { WebSocketServer, WebSocket } from 'ws';

export function setupWebSocketServer(port: number) {
  const wss = new WebSocketServer({ port });

  console.log(`[WebSocket] Server started on port ${port}`);

  wss.on('connection', (ws: WebSocket) => {
    console.log('[WebSocket] Client connected');

    // Send welcome message
    ws.send(JSON.stringify({
      type: 'connected',
      message: 'Connected to KINGA Analytics WebSocket',
      timestamp: new Date().toISOString(),
    }));

    // Handle incoming messages from clients
    ws.on('message', (message: Buffer) => {
      try {
        const data = JSON.parse(message.toString());
        console.log('[WebSocket] Received:', data);

        // Echo back for testing
        ws.send(JSON.stringify({
          type: 'echo',
          data,
          timestamp: new Date().toISOString(),
        }));
      } catch (error) {
        console.error('[WebSocket] Error parsing message:', error);
      }
    });

    // Handle client disconnect
    ws.on('close', () => {
      console.log('[WebSocket] Client disconnected');
    });

    // Handle errors
    ws.on('error', (error) => {
      console.error('[WebSocket] Error:', error);
    });
  });

  // Broadcast function for sending updates to all connected clients
  const broadcast = (data: any) => {
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(data));
      }
    });
  };

  // Example: Broadcast repair status updates every 30 seconds (for demo)
  setInterval(() => {
    broadcast({
      type: 'repair_update',
      data: {
        panel_beater_id: Math.floor(Math.random() * 5) + 1,
        repair_id: `repair-${Date.now()}`,
        status: ['in_progress', 'completed', 'delayed'][Math.floor(Math.random() * 3)],
        timestamp: new Date().toISOString(),
      },
    });
  }, 30000);

  return { wss, broadcast };
}

// Example usage for event-driven updates:
// When you integrate with Kafka, subscribe to events and broadcast them:
/*
eventSubscriber.subscribe('RepairStatusUpdated', async (event) => {
  broadcast({
    type: 'repair_update',
    data: event.data,
  });
});

eventSubscriber.subscribe('ClaimSubmitted', async (event) => {
  broadcast({
    type: 'claim_update',
    data: event.data,
  });
});

eventSubscriber.subscribe('FraudAlertTriggered', async (event) => {
  broadcast({
    type: 'fraud_alert',
    data: event.data,
  });
});
*/
