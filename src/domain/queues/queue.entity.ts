export interface QueueConfig {
  name: string;
  attempts: number;
  backoff: BackoffConfig;
  deadLetterQueue?: string;
  rateLimit?: RateLimitConfig;
  priority?: number;
}

export interface BackoffConfig {
  type: 'fixed' | 'exponential';
  delay: number;
}

export interface RateLimitConfig {
  max: number;
  duration: number;
}

export interface QueueStats {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  deadLetter: number;
  paused: boolean;
}

export class Queue {
  private readonly _config: QueueConfig;

  private constructor(config: QueueConfig) {
    this._config = config;
  }

  static create(params: Partial<QueueConfig> & { name: string }): Queue {
    const config: QueueConfig = {
      name: params.name,
      attempts: params.attempts ?? 3,
      backoff: params.backoff ?? { type: 'exponential', delay: 1000 },
      deadLetterQueue: params.deadLetterQueue ?? `${params.name}:dead-letter`,
      rateLimit: params.rateLimit,
      priority: params.priority,
    };
    return new Queue(config);
  }

  get name(): string { return this._config.name; }
  get config(): QueueConfig { return this._config; }
  get deadLetterQueueName(): string { return this._config.deadLetterQueue!; }

  withRateLimit(max: number, duration: number): Queue {
    return Queue.create({ ...this._config, rateLimit: { max, duration } });
  }
}
