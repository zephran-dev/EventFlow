import { DomainEvent } from '@domain/events/event.entity';
import { InvalidEventPayloadError } from '@domain/shared/errors';
import { Result, ok, fail } from '@domain/shared/result';
import { IEventRepository, IQueueService, ILogger, IMetricsService, PublishOptions } from '../ports';

export interface PublishEventInput {
  type: string;
  payload: Record<string, unknown>;
  source: string;
  queueName: string;
  correlationId?: string;
  version?: string;
  priority?: number;
  scheduledAt?: Date;
  tags?: string[];
  options?: PublishOptions;
}

export interface PublishEventOutput {
  eventId: string;
  jobId: string;
  queueName: string;
}

export class PublishEventUseCase {
  constructor(
    private readonly eventRepository: IEventRepository,
    private readonly queueService: IQueueService,
    private readonly logger: ILogger,
    private readonly metrics: IMetricsService,
  ) {}

  async execute(input: PublishEventInput): Promise<Result<PublishEventOutput>> {
    if (!input.type || input.type.trim().length === 0) {
      return fail(new InvalidEventPayloadError('Event type is required'));
    }

    if (!input.payload || typeof input.payload !== 'object') {
      return fail(new InvalidEventPayloadError('Payload must be a non-null object'));
    }

    try {
      const event = DomainEvent.create({
        type: input.type.trim(),
        payload: input.payload,
        source: input.source,
        correlationId: input.correlationId,
        version: input.version,
        priority: input.priority,
        scheduledAt: input.scheduledAt,
        tags: input.tags,
      });

      await this.eventRepository.save(event);

      const jobId = await this.queueService.publish(input.queueName, event, {
        ...input.options,
        priority: input.priority,
        delay: input.scheduledAt
          ? Math.max(0, input.scheduledAt.getTime() - Date.now())
          : undefined,
      });

      this.metrics.incrementEventPublished(event.type);

      this.logger.info('Event published', {
        eventId: event.id,
        type: event.type,
        queueName: input.queueName,
        correlationId: event.metadata.correlationId,
        jobId,
      });

      return ok({ eventId: event.id, jobId, queueName: input.queueName });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error('Failed to publish event', { error: error.message, input });
      return fail(error);
    }
  }
}
