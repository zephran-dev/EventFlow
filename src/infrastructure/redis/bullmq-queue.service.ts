import { Queue as BullQueue, QueueEvents, Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { DomainEvent, EventProps } from '@domain/events/event.entity';
import { QueueStats } from '@domain/queues/queue.entity';
import { IQueueService, PublishOptions } from '@application/ports';
import { ILogger } from '@application/ports';

export class BullMQQueueService implements IQueueService {
  private readonly queues = new Map<string, BullQueue>();
  private readonly connection: Redis;

  constructor(
    private readonly redis: Redis,
    private readonly logger: ILogger,
  ) {
    // BullMQ requires its own connection (no subscriber mode conflict)
    this.connection = redis.duplicate();
  }

  private getOrCreateQueue(name: string): BullQueue {
    if (!this.queues.has(name)) {
      const q = new BullQueue(name, { connection: this.connection });
      this.queues.set(name, q);
    }
    return this.queues.get(name)!;
  }

  async publish(queueName: string, event: DomainEvent, options?: PublishOptions): Promise<string> {
    const queue = this.getOrCreateQueue(queueName);

    const job = await queue.add(
      event.type,
      event.toJSON(),
      {
        jobId: options?.jobId ?? event.id,
        delay: options?.delay,
        priority: options?.priority,
        attempts: options?.attempts ?? 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: false,
      },
    );

    return job.id ?? event.id;
  }

  async getStats(queueName: string): Promise<QueueStats> {
    const queue = this.getOrCreateQueue(queueName);
    const counts = await queue.getJobCounts(
      'waiting', 'active', 'completed', 'failed', 'delayed', 'paused',
    );

    const dlQueue = this.getOrCreateQueue(`${queueName}:dead-letter`);
    const dlCounts = await dlQueue.getJobCounts('waiting', 'failed');

    return {
      name: queueName,
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      completed: counts.completed ?? 0,
      failed: counts.failed ?? 0,
      delayed: counts.delayed ?? 0,
      deadLetter: (dlCounts.waiting ?? 0) + (dlCounts.failed ?? 0),
      paused: (await queue.isPaused()),
    };
  }

  async getAllStats(): Promise<QueueStats[]> {
    const names = Array.from(this.queues.keys()).filter(
      (n) => !n.endsWith(':dead-letter'),
    );
    return Promise.all(names.map((n) => this.getStats(n)));
  }

  async pause(queueName: string): Promise<void> {
    await this.getOrCreateQueue(queueName).pause();
    this.logger.info('Queue paused', { queueName });
  }

  async resume(queueName: string): Promise<void> {
    await this.getOrCreateQueue(queueName).resume();
    this.logger.info('Queue resumed', { queueName });
  }

  async drain(queueName: string): Promise<void> {
    await this.getOrCreateQueue(queueName).drain();
    this.logger.info('Queue drained', { queueName });
  }

  async retryFailed(queueName: string): Promise<number> {
    const queue = this.getOrCreateQueue(queueName);
    const failed = await queue.getFailed();
    await Promise.all(failed.map((j) => j.retry()));
    return failed.length;
  }

  async getDeadLetterEvents(queueName: string, limit = 50): Promise<DomainEvent[]> {
    const dlQueue = this.getOrCreateQueue(`${queueName}:dead-letter`);
    const jobs = await dlQueue.getJobs(['waiting', 'failed'], 0, limit - 1);
    return jobs.map((j) => DomainEvent.reconstitute(j.data as EventProps));
  }

  async replayDeadLetter(queueName: string, eventId: string): Promise<void> {
    const dlQueue = this.getOrCreateQueue(`${queueName}:dead-letter`);
    const job = await dlQueue.getJob(eventId);
    if (!job) throw new Error(`Dead-letter event ${eventId} not found`);

    await this.publish(queueName, DomainEvent.reconstitute(job.data as EventProps));
    await job.remove();
    this.logger.info('Dead-letter event replayed', { queueName, eventId });
  }

  async close(): Promise<void> {
    await Promise.all(Array.from(this.queues.values()).map((q) => q.close()));
    await this.connection.quit();
  }
}
