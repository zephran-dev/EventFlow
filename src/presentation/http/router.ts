import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { StatusCodes } from 'http-status-codes';
import { PublishEventUseCase } from '@application/use-cases/publish-event.use-case';
import { GetQueueStatsUseCase } from '@application/use-cases/get-queue-stats.use-case';
import { RetryDeadLetterUseCase } from '@application/use-cases/retry-dead-letter.use-case';
import { IEventRepository, IQueueService, ILogger } from '@application/ports';
import { isOk } from '@domain/shared/result';
import { DomainError } from '@domain/shared/errors';

// ---- Validation schemas ----
const publishSchema = z.object({
  type: z.string().min(1).max(128),
  payload: z.record(z.unknown()),
  source: z.string().min(1).max(128),
  queueName: z.string().min(1).max(128),
  correlationId: z.string().uuid().optional(),
  version: z.string().optional(),
  priority: z.number().int().min(0).max(10).optional(),
  scheduledAt: z.string().datetime().optional(),
  tags: z.array(z.string()).max(10).optional(),
});

// ---- Factory ----
export function createRouter(deps: {
  publishUseCase: PublishEventUseCase;
  statsUseCase: GetQueueStatsUseCase;
  retryUseCase: RetryDeadLetterUseCase;
  eventRepository: IEventRepository;
  queueService: IQueueService;
  logger: ILogger;
}): Router {
  const router = Router();

  // POST /events — publish
  router.post('/events', async (req: Request, res: Response) => {
    const parsed = publishSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(StatusCodes.UNPROCESSABLE_ENTITY).json({
        error: 'Validation failed',
        details: parsed.error.flatten(),
      });
    }

    const input = {
      ...parsed.data,
      scheduledAt: parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : undefined,
    };

    const result = await deps.publishUseCase.execute(input);
    if (!isOk(result)) {
      const status = result.error instanceof DomainError
        ? result.error.statusCode
        : StatusCodes.INTERNAL_SERVER_ERROR;
      return res.status(status).json({ error: result.error.message });
    }

    return res.status(StatusCodes.CREATED).json(result.value);
  });

  // GET /events/:id
  router.get('/events/:id', async (req: Request, res: Response) => {
    const event = await deps.eventRepository.findById(req.params.id);
    if (!event) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: 'Event not found' });
    }
    return res.json(event.toJSON());
  });

  // GET /queues — all stats
  router.get('/queues', async (_req: Request, res: Response) => {
    const result = await deps.statsUseCase.executeAll();
    if (!isOk(result)) {
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: result.error.message });
    }
    return res.json(result.value);
  });

  // GET /queues/:name
  router.get('/queues/:name', async (req: Request, res: Response) => {
    const result = await deps.statsUseCase.execute(req.params.name);
    if (!isOk(result)) {
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: result.error.message });
    }
    return res.json(result.value);
  });

  // POST /queues/:name/pause
  router.post('/queues/:name/pause', async (req: Request, res: Response) => {
    await deps.queueService.pause(req.params.name);
    return res.status(StatusCodes.NO_CONTENT).send();
  });

  // POST /queues/:name/resume
  router.post('/queues/:name/resume', async (req: Request, res: Response) => {
    await deps.queueService.resume(req.params.name);
    return res.status(StatusCodes.NO_CONTENT).send();
  });

  // GET /queues/:name/dead-letter
  router.get('/queues/:name/dead-letter', async (req: Request, res: Response) => {
    const limit = Number(req.query.limit ?? 50);
    const result = await deps.retryUseCase.getDeadLetterEvents(req.params.name, limit);
    if (!isOk(result)) {
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: result.error.message });
    }
    return res.json(result.value.map((e) => e.toJSON()));
  });

  // POST /queues/:name/dead-letter/:eventId/replay
  router.post('/queues/:name/dead-letter/:eventId/replay', async (req: Request, res: Response) => {
    const result = await deps.retryUseCase.replay(req.params.name, req.params.eventId);
    if (!isOk(result)) {
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: result.error.message });
    }
    return res.status(StatusCodes.NO_CONTENT).send();
  });

  // POST /queues/:name/retry-failed
  router.post('/queues/:name/retry-failed', async (req: Request, res: Response) => {
    const result = await deps.retryUseCase.retryAllFailed(req.params.name);
    if (!isOk(result)) {
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: result.error.message });
    }
    return res.json({ retried: result.value });
  });

  return router;
}
