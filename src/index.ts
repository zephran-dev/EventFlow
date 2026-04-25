import { config } from './config';
import { createLogger } from '@infrastructure/logging/logger';
import { createRedisClient } from '@infrastructure/redis/redis.factory';
import { RedisEventRepository } from '@infrastructure/redis/event.repository';
import { BullMQQueueService } from '@infrastructure/redis/bullmq-queue.service';
import { BullMQWorkerRegistry } from '@infrastructure/redis/worker.registry';
import { PrometheusMetricsService } from '@infrastructure/monitoring/metrics.service';
import { WebSocketNotifier } from '@infrastructure/monitoring/websocket.notifier';
import { PublishEventUseCase } from '@application/use-cases/publish-event.use-case';
import { GetQueueStatsUseCase } from '@application/use-cases/get-queue-stats.use-case';
import { RetryDeadLetterUseCase } from '@application/use-cases/retry-dead-letter.use-case';
import { createRouter } from '@presentation/http/router';
import { createApp } from '@presentation/http/app';
import { DomainEvent } from '@domain/events/event.entity';

async function bootstrap(): Promise<void> {
  const logger = createLogger({
    level: config.app.logLevel,
    service: config.app.name,
    logDir: config.app.logDir || undefined,
  });

  logger.info('Starting EventFlow', { env: config.app.env });

  // Infrastructure
  const redis = createRedisClient(config.redis, logger);
  const eventRepository = new RedisEventRepository(redis);
  const queueService = new BullMQQueueService(redis, logger);
  const metrics = new PrometheusMetricsService(config.metrics.prefix);
  const wsNotifier = new WebSocketNotifier(config.ws.port, config.ws.path, logger);

  // Worker registry
  const workerRegistry = new BullMQWorkerRegistry(
    redis,
    eventRepository,
    logger,
    metrics,
    config.worker.concurrency,
  );

  // Example handler registrations — replace or extend with your own
  workerRegistry.register('default', async (event: DomainEvent) => {
    logger.info('Default handler processing event', { type: event.type, id: event.id });
    wsNotifier.notify(event);
  });

  // Stats broadcast every 5s
  setInterval(async () => {
    const stats = await queueService.getAllStats();
    wsNotifier.notifyStats(stats);
  }, 5000);

  // Use cases
  const publishUseCase = new PublishEventUseCase(eventRepository, queueService, logger, metrics);
  const statsUseCase = new GetQueueStatsUseCase(queueService, logger);
  const retryUseCase = new RetryDeadLetterUseCase(queueService, logger);

  // HTTP
  const router = createRouter({
    publishUseCase,
    statsUseCase,
    retryUseCase,
    eventRepository,
    queueService,
    logger,
  });

  const app = createApp(router, metrics, logger, {
    rateLimitWindowMs: config.rateLimit.windowMs,
    rateLimitMax: config.rateLimit.max,
  });

  // Start workers
  await workerRegistry.startAll();

  // Start HTTP server
  const server = app.listen(config.app.port, () => {
    logger.info('HTTP server listening', { port: config.app.port });
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully`);
    server.close(async () => {
      await workerRegistry.stopAll();
      await queueService.close();
      await redis.quit();
      await wsNotifier.close();
      logger.info('Shutdown complete');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', { error: err.message, stack: err.stack });
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', { reason: String(reason) });
    process.exit(1);
  });
}

bootstrap().catch((err) => {
  console.error('Fatal error during bootstrap:', err);
  process.exit(1);
});
