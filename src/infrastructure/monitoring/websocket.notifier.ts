import { WebSocketServer, WebSocket } from 'ws';
import { DomainEvent } from '@domain/events/event.entity';
import { QueueStats } from '@domain/queues/queue.entity';
import { IEventNotifier, ILogger } from '@application/ports';

type WsMessage =
  | { type: 'event'; data: ReturnType<DomainEvent['toJSON']> }
  | { type: 'stats'; data: QueueStats[] }
  | { type: 'ping' };

export class WebSocketNotifier implements IEventNotifier {
  private readonly wss: WebSocketServer;
  private readonly clients = new Set<WebSocket>();

  constructor(
    port: number,
    path: string,
    private readonly logger: ILogger,
  ) {
    this.wss = new WebSocketServer({ port, path });

    this.wss.on('connection', (ws) => {
      this.clients.add(ws);
      this.logger.info('WebSocket client connected', { total: this.clients.size });

      ws.on('close', () => {
        this.clients.delete(ws);
        this.logger.info('WebSocket client disconnected', { total: this.clients.size });
      });

      ws.on('error', (err) => {
        this.logger.error('WebSocket client error', { error: err.message });
        this.clients.delete(ws);
      });

      // Heartbeat
      ws.send(JSON.stringify({ type: 'ping' } satisfies WsMessage));
    });

    this.logger.info('WebSocket server started', { port, path });
  }

  notify(event: DomainEvent): void {
    this.broadcast({ type: 'event', data: event.toJSON() });
  }

  notifyStats(stats: QueueStats[]): void {
    this.broadcast({ type: 'stats', data: stats });
  }

  private broadcast(message: WsMessage): void {
    const payload = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  async close(): Promise<void> {
    return new Promise((resolve) => this.wss.close(() => resolve()));
  }
}
