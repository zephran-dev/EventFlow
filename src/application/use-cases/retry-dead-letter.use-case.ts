import { DomainEvent } from '@domain/events/event.entity';
import { Result, ok, fail } from '@domain/shared/result';
import { IQueueService, ILogger } from '../ports';

export class RetryDeadLetterUseCase {
  constructor(
    private readonly queueService: IQueueService,
    private readonly logger: ILogger,
  ) {}

  async getDeadLetterEvents(queueName: string, limit = 50): Promise<Result<DomainEvent[]>> {
    try {
      const events = await this.queueService.getDeadLetterEvents(queueName, limit);
      return ok(events);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error('Failed to get dead-letter events', { error: error.message, queueName });
      return fail(error);
    }
  }

  async replay(queueName: string, eventId: string): Promise<Result<void>> {
    try {
      await this.queueService.replayDeadLetter(queueName, eventId);
      this.logger.info('Dead-letter event replayed', { queueName, eventId });
      return ok(undefined);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error('Failed to replay dead-letter event', { error: error.message, queueName, eventId });
      return fail(error);
    }
  }

  async retryAllFailed(queueName: string): Promise<Result<number>> {
    try {
      const count = await this.queueService.retryFailed(queueName);
      this.logger.info('Retried failed jobs', { queueName, count });
      return ok(count);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error('Failed to retry jobs', { error: error.message, queueName });
      return fail(error);
    }
  }
}
