import { Registry, Counter, Histogram } from 'prom-client';
import { IMetricsService } from '@application/ports';

export class PrometheusMetricsService implements IMetricsService {
  private readonly registry: Registry;
  private readonly eventsPublished: Counter;
  private readonly eventsProcessed: Counter;
  private readonly processingDuration: Histogram;

  constructor(prefix = 'eventflow_') {
    this.registry = new Registry();

    this.eventsPublished = new Counter({
      name: `${prefix}events_published_total`,
      help: 'Total number of events published',
      labelNames: ['type'],
      registers: [this.registry],
    });

    this.eventsProcessed = new Counter({
      name: `${prefix}events_processed_total`,
      help: 'Total number of events processed',
      labelNames: ['type', 'status'],
      registers: [this.registry],
    });

    this.processingDuration = new Histogram({
      name: `${prefix}event_processing_duration_ms`,
      help: 'Event processing duration in milliseconds',
      labelNames: ['type'],
      buckets: [10, 50, 100, 250, 500, 1000, 2500, 5000],
      registers: [this.registry],
    });
  }

  incrementEventPublished(type: string): void {
    this.eventsPublished.inc({ type });
  }

  incrementEventProcessed(type: string, status: 'success' | 'failure'): void {
    this.eventsProcessed.inc({ type, status });
  }

  recordProcessingDuration(type: string, durationMs: number): void {
    this.processingDuration.observe({ type }, durationMs);
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }
}
