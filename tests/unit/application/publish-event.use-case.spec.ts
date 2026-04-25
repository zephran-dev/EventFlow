import { PublishEventUseCase } from '../../../src/application/use-cases/publish-event.use-case';
import { IEventRepository, IQueueService, ILogger, IMetricsService } from '../../../src/application/ports';
import { isOk, isFail } from '../../../src/domain/shared/result';

const makeLogger = (): ILogger => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
});

const makeMetrics = (): IMetricsService => ({
  incrementEventPublished: jest.fn(),
  incrementEventProcessed: jest.fn(),
  recordProcessingDuration: jest.fn(),
  getMetrics: jest.fn().mockResolvedValue(''),
});

const makeRepo = (): jest.Mocked<IEventRepository> => ({
  save: jest.fn().mockResolvedValue(undefined),
  findById: jest.fn(),
  findByCorrelationId: jest.fn(),
  findByStatus: jest.fn(),
  findByType: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
});

const makeQueueService = (): jest.Mocked<IQueueService> => ({
  publish: jest.fn().mockResolvedValue('job-123'),
  getStats: jest.fn(),
  getAllStats: jest.fn(),
  pause: jest.fn(),
  resume: jest.fn(),
  drain: jest.fn(),
  retryFailed: jest.fn(),
  getDeadLetterEvents: jest.fn(),
  replayDeadLetter: jest.fn(),
});

describe('PublishEventUseCase', () => {
  let useCase: PublishEventUseCase;
  let repo: jest.Mocked<IEventRepository>;
  let queue: jest.Mocked<IQueueService>;
  let logger: ILogger;
  let metrics: IMetricsService;

  beforeEach(() => {
    repo = makeRepo();
    queue = makeQueueService();
    logger = makeLogger();
    metrics = makeMetrics();
    useCase = new PublishEventUseCase(repo, queue, logger, metrics);
  });

  it('should publish a valid event and return output', async () => {
    const result = await useCase.execute({
      type: 'order.placed',
      payload: { orderId: 'abc' },
      source: 'shop-service',
      queueName: 'orders',
    });

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.eventId).toBeDefined();
      expect(result.value.jobId).toBe('job-123');
      expect(result.value.queueName).toBe('orders');
    }

    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(queue.publish).toHaveBeenCalledTimes(1);
    expect((metrics.incrementEventPublished as jest.Mock)).toHaveBeenCalledWith('order.placed');
  });

  it('should fail when event type is empty', async () => {
    const result = await useCase.execute({
      type: '   ',
      payload: {},
      source: 'test',
      queueName: 'test',
    });

    expect(isFail(result)).toBe(true);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('should fail when payload is not an object', async () => {
    const result = await useCase.execute({
      type: 'test',
      payload: null as any,
      source: 'test',
      queueName: 'test',
    });

    expect(isFail(result)).toBe(true);
  });

  it('should handle repository save failure gracefully', async () => {
    repo.save.mockRejectedValueOnce(new Error('Redis unavailable'));

    const result = await useCase.execute({
      type: 'test',
      payload: {},
      source: 'test',
      queueName: 'test',
    });

    expect(isFail(result)).toBe(true);
    expect((logger.error as jest.Mock)).toHaveBeenCalled();
  });

  it('should calculate delay from scheduledAt', async () => {
    const future = new Date(Date.now() + 5000);
    await useCase.execute({
      type: 'reminder',
      payload: {},
      source: 'test',
      queueName: 'scheduled',
      scheduledAt: future,
    });

    const publishCall = queue.publish.mock.calls[0];
    expect(publishCall[2]?.delay).toBeGreaterThan(0);
  });
});
