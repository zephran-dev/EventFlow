import { QueueStats } from '@domain/queues/queue.entity';
import { Result, ok, fail } from '@domain/shared/result';
import { IQueueService, ILogger } from '../ports';

export class GetQueueStatsUseCase {
  constructor(
    private readonly queueService: IQueueService,
    private readonly logger: ILogger,
  ) {}

  async executeAll(): Promise<Result<QueueStats[]>> {
    try {
      const stats = await this.queueService.getAllStats();
      return ok(stats);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error('Failed to get all queue stats', { error: error.message });
      return fail(error);
    }
  }

  async execute(queueName: string): Promise<Result<QueueStats>> {
    try {
      const stats = await this.queueService.getStats(queueName);
      return ok(stats);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error('Failed to get queue stats', { error: error.message, queueName });
      return fail(error);
    }
  }
}
