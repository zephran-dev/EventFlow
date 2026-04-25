import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { DomainEvent, EventProps } from '@domain/events/event.entity';
import { IWorkerRegistry, EventHandler, ILogger, IMetricsService, IEventRepository } from '@application/ports';

export class BullMQWorkerRegistry implements IWorkerRegistry {
  private readonly workers = new Map<string, Worker>();
  private readonly handlers = new Map<string, EventHandler>();
  private readonly connection: Redis;

  constructor(
    private readonly redis: Redis,
    private readonly eventRepository: IEventRepository,
    private readonly logger: ILogger,
    private readonly metrics: IMetricsService,
    private readonly concurrency = 5,
  ) {
    this.connection = redis.duplicate();
  }

  register(queueName: string, handler: EventHandler): void {
    this.handlers.set(queueName, handler);
    this.logger.info('Worker handler registered', { queueName });
  }

  unregister(queueName: string): void {
    this.handlers.delete(queueName);
    this.logger.info('Worker handler unregistered', { queueName });
  }

  getRegistered(): string[] {
    return Array.from(this.handlers.keys());
  }

  async startAll(): Promise<void> {
    for (const [queueName, handler] of this.handlers.entries()) {
      if (this.workers.has(queueName)) continue;
      await this.startWorker(queueName, handler);
    }
    this.logger.info('All workers started', { queues: this.getRegistered() });
  }

  async stopAll(): Promise<void> {
    await Promise.all(
      Array.from(this.workers.values()).map((w) => w.close()),
    );
    this.workers.clear();
    await this.connection.quit();
    this.logger.info('All workers stopped');
  }

  private async startWorker(queueName: string, handler: EventHandler): Promise<void> {
    const worker = new Worker(
      queueName,
      async (job: Job) => {
        const start = Date.now();
        const event = DomainEvent.reconstitute(job.data as EventProps);

        this.logger.info('Processing event', {
          eventId: event.id,
          type: event.type,
          attempt: job.attemptsMade + 1,
        });

        const processing = event.markAsProcessing();
        await this.eventRepository.update(processing);

        try {
          await handler(processing);

          const completed = processing.markAsCompleted();
          await this.eventRepository.update(completed);

          const duration = Date.now() - start;
          this.metrics.incrementEventProcessed(event.type, 'success');
          this.metrics.recordProcessingDuration(event.type, duration);

          this.logger.info('Event processed successfully', {
            eventId: event.id,
            type: event.type,
            durationMs: duration,
          });
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          const isLastAttempt = job.attemptsMade >= (job.opts.attempts ?? 3) - 1;

          if (isLastAttempt) {
            const dead = processing.markAsDeadLetter(error.message);
            await this.eventRepository.update(dead);
          } else {
            const failed = processing.markAsFailed(error.message);
            await this.eventRepository.update(failed);
          }

          this.metrics.incrementEventProcessed(event.type, 'failure');
          this.logger.error('Event processing failed', {
            eventId: event.id,
            type: event.type,
            error: error.message,
            attempt: job.attemptsMade + 1,
            isLastAttempt,
          });

          throw error; // Let BullMQ handle retry/DLQ
        }
      },
      {
        connection: this.connection,
        concurrency: this.concurrency,
        autorun: false,
      },
    );

    worker.on('failed', (job, err) => {
      this.logger.warn('Job failed', { jobId: job?.id, error: err.message });
    });

    worker.on('error', (err) => {
      this.logger.error('Worker error', { queueName, error: err.message });
    });

    await worker.run();
    this.workers.set(queueName, worker);
    this.logger.info('Worker started', { queueName, concurrency: this.concurrency });
  }
}
