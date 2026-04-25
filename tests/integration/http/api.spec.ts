import request from 'supertest';
import { Application } from 'express';
import { createApp } from '../../../src/presentation/http/app';
import { createRouter } from '../../../src/presentation/http/router';
import { PublishEventUseCase } from '../../../src/application/use-cases/publish-event.use-case';
import { GetQueueStatsUseCase } from '../../../src/application/use-cases/get-queue-stats.use-case';
import { RetryDeadLetterUseCase } from '../../../src/application/use-cases/retry-dead-letter.use-case';
import { IEventRepository, IQueueService, ILogger, IMetricsService } from '../../../src/application/ports';
import { DomainEvent } from '../../../src/domain/events/event.entity';
import { ok, fail } from '../../../src/domain/shared/result';

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
  getMetrics: jest.fn().mockResolvedValue('# metrics'),
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
  publish: jest.fn().mockResolvedValue('job-1'),
  getStats: jest.fn().mockResolvedValue({ name: 'test', waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, deadLetter: 0, paused: false }),
  getAllStats: jest.fn().mockResolvedValue([]),
  pause: jest.fn().mockResolvedValue(undefined),
  resume: jest.fn().mockResolvedValue(undefined),
  drain: jest.fn().mockResolvedValue(undefined),
  retryFailed: jest.fn().mockResolvedValue(2),
  getDeadLetterEvents: jest.fn().mockResolvedValue([]),
  replayDeadLetter: jest.fn().mockResolvedValue(undefined),
});

describe('HTTP API Integration', () => {
  let app: Application;
  let repo: jest.Mocked<IEventRepository>;
  let queueService: jest.Mocked<IQueueService>;
  const logger = makeLogger();
  const metrics = makeMetrics();

  beforeEach(() => {
    repo = makeRepo();
    queueService = makeQueueService();

    const publishUseCase = new PublishEventUseCase(repo, queueService, logger, metrics);
    const statsUseCase = new GetQueueStatsUseCase(queueService, logger);
    const retryUseCase = new RetryDeadLetterUseCase(queueService, logger);

    const router = createRouter({ publishUseCase, statsUseCase, retryUseCase, eventRepository: repo, queueService, logger });
    app = createApp(router, metrics, logger, { rateLimitWindowMs: 60000, rateLimitMax: 1000 });
  });

  // --- Health ---
  describe('GET /health', () => {
    it('should return 200 ok', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });
  });

  // --- Metrics ---
  describe('GET /metrics', () => {
    it('should return prometheus metrics', async () => {
      const res = await request(app).get('/metrics');
      expect(res.status).toBe(200);
    });
  });

  // --- Publish event ---
  describe('POST /api/v1/events', () => {
    const validBody = {
      type: 'order.placed',
      payload: { orderId: 'abc-123' },
      source: 'shop',
      queueName: 'orders',
    };

    it('should return 201 with event and job id', async () => {
      const res = await request(app).post('/api/v1/events').send(validBody);
      expect(res.status).toBe(201);
      expect(res.body.eventId).toBeDefined();
      expect(res.body.jobId).toBe('job-1');
    });

    it('should return 422 when type is missing', async () => {
      const res = await request(app).post('/api/v1/events').send({ ...validBody, type: '' });
      expect(res.status).toBe(422);
    });

    it('should return 422 when payload is missing', async () => {
      const res = await request(app).post('/api/v1/events').send({ ...validBody, payload: undefined });
      expect(res.status).toBe(422);
    });

    it('should return 422 for invalid correlationId', async () => {
      const res = await request(app).post('/api/v1/events').send({ ...validBody, correlationId: 'not-a-uuid' });
      expect(res.status).toBe(422);
    });
  });

  // --- Get event ---
  describe('GET /api/v1/events/:id', () => {
    it('should return 404 when event not found', async () => {
      repo.findById.mockResolvedValueOnce(null);
      const res = await request(app).get('/api/v1/events/nonexistent');
      expect(res.status).toBe(404);
    });

    it('should return event when found', async () => {
      const event = DomainEvent.create({ type: 'test', payload: {}, source: 'test' });
      repo.findById.mockResolvedValueOnce(event);
      const res = await request(app).get(`/api/v1/events/${event.id}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(event.id);
    });
  });

  // --- Queue stats ---
  describe('GET /api/v1/queues', () => {
    it('should return empty array', async () => {
      const res = await request(app).get('/api/v1/queues');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GET /api/v1/queues/:name', () => {
    it('should return stats for a queue', async () => {
      const res = await request(app).get('/api/v1/queues/orders');
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('test');
    });
  });

  // --- Pause / Resume ---
  describe('POST /api/v1/queues/:name/pause', () => {
    it('should return 204', async () => {
      const res = await request(app).post('/api/v1/queues/orders/pause');
      expect(res.status).toBe(204);
    });
  });

  describe('POST /api/v1/queues/:name/resume', () => {
    it('should return 204', async () => {
      const res = await request(app).post('/api/v1/queues/orders/resume');
      expect(res.status).toBe(204);
    });
  });

  // --- Dead letter ---
  describe('GET /api/v1/queues/:name/dead-letter', () => {
    it('should return empty array', async () => {
      const res = await request(app).get('/api/v1/queues/orders/dead-letter');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('POST /api/v1/queues/:name/retry-failed', () => {
    it('should return retried count', async () => {
      const res = await request(app).post('/api/v1/queues/orders/retry-failed');
      expect(res.status).toBe(200);
      expect(res.body.retried).toBe(2);
    });
  });
});
