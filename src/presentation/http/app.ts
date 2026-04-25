import express, { Application, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import 'express-async-errors';
import { StatusCodes } from 'http-status-codes';
import { DomainError } from '@domain/shared/errors';
import { ILogger, IMetricsService } from '@application/ports';

export interface AppConfig {
  rateLimitWindowMs: number;
  rateLimitMax: number;
}

export function createApp(
  router: express.Router,
  metrics: IMetricsService,
  logger: ILogger,
  config: AppConfig,
): Application {
  const app = express();

  // Security
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  // Rate limiting
  app.use(
    '/api',
    rateLimit({
      windowMs: config.rateLimitWindowMs,
      max: config.rateLimitMax,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many requests, please try again later.' },
    }),
  );

  // Health check — no auth, no rate limit
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Prometheus metrics endpoint
  app.get('/metrics', async (_req, res) => {
    res.set('Content-Type', 'text/plain');
    res.send(await metrics.getMetrics());
  });

  // API routes
  app.use('/api/v1', router);

  // 404
  app.use((_req, res) => {
    res.status(StatusCodes.NOT_FOUND).json({ error: 'Route not found' });
  });

  // Global error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof DomainError) {
      return res.status(err.statusCode).json({ error: err.message, code: err.code });
    }

    logger.error('Unhandled error', { error: err.message, stack: err.stack });
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: 'Internal server error' });
  });

  return app;
}
