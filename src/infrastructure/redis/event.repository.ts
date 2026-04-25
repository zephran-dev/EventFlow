import Redis from 'ioredis';
import { DomainEvent, EventProps, EventStatus } from '@domain/events/event.entity';
import { IEventRepository } from '@application/ports';

const EVENT_PREFIX = 'event:';
const STATUS_INDEX = 'event:index:status:';
const TYPE_INDEX = 'event:index:type:';
const CORRELATION_INDEX = 'event:index:correlation:';
const TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export class RedisEventRepository implements IEventRepository {
  constructor(private readonly redis: Redis) {}

  async save(event: DomainEvent): Promise<void> {
    const key = `${EVENT_PREFIX}${event.id}`;
    const data = JSON.stringify(event.toJSON());

    const pipeline = this.redis.pipeline();
    pipeline.set(key, data, 'EX', TTL_SECONDS);
    pipeline.sadd(`${STATUS_INDEX}${event.status}`, event.id);
    pipeline.sadd(`${TYPE_INDEX}${event.type}`, event.id);
    pipeline.sadd(`${CORRELATION_INDEX}${event.metadata.correlationId}`, event.id);
    await pipeline.exec();
  }

  async findById(id: string): Promise<DomainEvent | null> {
    const data = await this.redis.get(`${EVENT_PREFIX}${id}`);
    if (!data) return null;
    return DomainEvent.reconstitute(JSON.parse(data) as EventProps);
  }

  async findByCorrelationId(correlationId: string): Promise<DomainEvent[]> {
    const ids = await this.redis.smembers(`${CORRELATION_INDEX}${correlationId}`);
    return this.fetchMany(ids);
  }

  async findByStatus(status: EventStatus, limit = 100): Promise<DomainEvent[]> {
    const ids = await this.redis.srandmember(`${STATUS_INDEX}${status}`, limit);
    return this.fetchMany(ids);
  }

  async findByType(type: string, limit = 100): Promise<DomainEvent[]> {
    const ids = await this.redis.srandmember(`${TYPE_INDEX}${type}`, limit);
    return this.fetchMany(ids);
  }

  async update(event: DomainEvent): Promise<void> {
    const key = `${EVENT_PREFIX}${event.id}`;
    const existing = await this.redis.get(key);
    if (!existing) return;

    const oldProps = JSON.parse(existing) as EventProps;
    const pipeline = this.redis.pipeline();

    // Update status index
    if (oldProps.status !== event.status) {
      pipeline.srem(`${STATUS_INDEX}${oldProps.status}`, event.id);
      pipeline.sadd(`${STATUS_INDEX}${event.status}`, event.id);
    }

    pipeline.set(key, JSON.stringify(event.toJSON()), 'EX', TTL_SECONDS);
    await pipeline.exec();
  }

  async delete(id: string): Promise<void> {
    const data = await this.redis.get(`${EVENT_PREFIX}${id}`);
    if (!data) return;

    const props = JSON.parse(data) as EventProps;
    const pipeline = this.redis.pipeline();
    pipeline.del(`${EVENT_PREFIX}${id}`);
    pipeline.srem(`${STATUS_INDEX}${props.status}`, id);
    pipeline.srem(`${TYPE_INDEX}${props.type}`, id);
    pipeline.srem(`${CORRELATION_INDEX}${props.metadata.correlationId}`, id);
    await pipeline.exec();
  }

  private async fetchMany(ids: string[]): Promise<DomainEvent[]> {
    if (ids.length === 0) return [];
    const keys = ids.map((id) => `${EVENT_PREFIX}${id}`);
    const results = await this.redis.mget(...keys);
    return results
      .filter((r): r is string => r !== null)
      .map((r) => DomainEvent.reconstitute(JSON.parse(r) as EventProps));
  }
}
