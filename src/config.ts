import 'dotenv/config';

function required(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function optionalNum(name: string, fallback: number): number {
  const val = process.env[name];
  return val ? parseInt(val, 10) : fallback;
}

export const config = {
  app: {
    env: optional('NODE_ENV', 'development'),
    port: optionalNum('PORT', 3000),
    name: optional('APP_NAME', 'EventFlow'),
    logLevel: optional('LOG_LEVEL', 'info'),
    logDir: optional('LOG_DIR', ''),
  },
  redis: {
    host: optional('REDIS_HOST', 'localhost'),
    port: optionalNum('REDIS_PORT', 6379),
    password: optional('REDIS_PASSWORD', ''),
    db: optionalNum('REDIS_DB', 0),
    tls: optional('REDIS_TLS', 'false') === 'true',
  },
  rateLimit: {
    windowMs: optionalNum('RATE_LIMIT_WINDOW_MS', 60_000),
    max: optionalNum('RATE_LIMIT_MAX_REQUESTS', 100),
  },
  queue: {
    defaultAttempts: optionalNum('QUEUE_DEFAULT_ATTEMPTS', 3),
    deadLetterSuffix: optional('QUEUE_DEAD_LETTER_SUFFIX', ':dead-letter'),
  },
  worker: {
    concurrency: optionalNum('WORKER_CONCURRENCY', 5),
  },
  metrics: {
    enabled: optional('METRICS_ENABLED', 'true') === 'true',
    prefix: optional('METRICS_PREFIX', 'eventflow_'),
  },
  ws: {
    port: optionalNum('WS_PORT', 3001),
    path: optional('WS_PATH', '/ws'),
  },
} as const;
