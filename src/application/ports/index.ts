import { DomainEvent, EventStatus } from '@domain/events/event.entity';
import { QueueStats } from '@domain/queues/queue.entity';

// ---- Event Repository Port ----
export interface IEventRepository {
  save(event: DomainEvent): Promise<void>;
  findById(id: string): Promise<DomainEvent | null>;
  findByCorrelationId(correlationId: string): Promise<DomainEvent[]>;
  findByStatus(status: EventStatus, limit?: number): Promise<DomainEvent[]>;
  findByType(type: string, limit?: number): Promise<DomainEvent[]>;
  update(event: DomainEvent): Promise<void>;
  delete(id: string): Promise<void>;
}

// ---- Queue Service Port ----
export interface IQueueService {
  publish(queueName: string, event: DomainEvent, options?: PublishOptions): Promise<string>;
  getStats(queueName: string): Promise<QueueStats>;
  getAllStats(): Promise<QueueStats[]>;
  pause(queueName: string): Promise<void>;
  resume(queueName: string): Promise<void>;
  drain(queueName: string): Promise<void>;
  retryFailed(queueName: string): Promise<number>;
  getDeadLetterEvents(queueName: string, limit?: number): Promise<DomainEvent[]>;
  replayDeadLetter(queueName: string, eventId: string): Promise<void>;
}

export interface PublishOptions {
  delay?: number;
  priority?: number;
  attempts?: number;
  jobId?: string;
}

// ---- Worker Registry Port ----
export interface IWorkerRegistry {
  register(queueName: string, handler: EventHandler): void;
  unregister(queueName: string): void;
  getRegistered(): string[];
  startAll(): Promise<void>;
  stopAll(): Promise<void>;
}

export type EventHandler = (event: DomainEvent) => Promise<void>;

// ---- Event Notifier Port (WebSocket) ----
export interface IEventNotifier {
  notify(event: DomainEvent): void;
  notifyStats(stats: QueueStats[]): void;
}

// ---- Logger Port ----
export interface ILogger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
}

// ---- Metrics Port ----
export interface IMetricsService {
  incrementEventPublished(type: string): void;
  incrementEventProcessed(type: string, status: 'success' | 'failure'): void;
  recordProcessingDuration(type: string, durationMs: number): void;
  getMetrics(): Promise<string>;
}
