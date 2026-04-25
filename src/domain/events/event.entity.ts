import { v4 as uuidv4 } from 'uuid';

export type EventStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'dead-letter';

export interface EventProps {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  metadata: EventMetadata;
  status: EventStatus;
  attempts: number;
  createdAt: Date;
  updatedAt: Date;
  error?: string;
}

export interface EventMetadata {
  correlationId: string;
  source: string;
  version: string;
  priority?: number;
  scheduledAt?: Date;
  tags?: string[];
}

export class DomainEvent {
  private readonly props: EventProps;

  private constructor(props: EventProps) {
    this.props = props;
  }

  static create(params: {
    type: string;
    payload: Record<string, unknown>;
    source: string;
    correlationId?: string;
    version?: string;
    priority?: number;
    scheduledAt?: Date;
    tags?: string[];
  }): DomainEvent {
    const now = new Date();
    return new DomainEvent({
      id: uuidv4(),
      type: params.type,
      payload: params.payload,
      metadata: {
        correlationId: params.correlationId ?? uuidv4(),
        source: params.source,
        version: params.version ?? '1.0',
        priority: params.priority,
        scheduledAt: params.scheduledAt,
        tags: params.tags ?? [],
      },
      status: 'pending',
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: EventProps): DomainEvent {
    return new DomainEvent(props);
  }

  get id(): string { return this.props.id; }
  get type(): string { return this.props.type; }
  get payload(): Record<string, unknown> { return this.props.payload; }
  get metadata(): EventMetadata { return this.props.metadata; }
  get status(): EventStatus { return this.props.status; }
  get attempts(): number { return this.props.attempts; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }
  get error(): string | undefined { return this.props.error; }

  markAsProcessing(): DomainEvent {
    return DomainEvent.reconstitute({
      ...this.props,
      status: 'processing',
      attempts: this.props.attempts + 1,
      updatedAt: new Date(),
    });
  }

  markAsCompleted(): DomainEvent {
    return DomainEvent.reconstitute({
      ...this.props,
      status: 'completed',
      updatedAt: new Date(),
    });
  }

  markAsFailed(error: string): DomainEvent {
    return DomainEvent.reconstitute({
      ...this.props,
      status: 'failed',
      error,
      updatedAt: new Date(),
    });
  }

  markAsDeadLetter(error: string): DomainEvent {
    return DomainEvent.reconstitute({
      ...this.props,
      status: 'dead-letter',
      error,
      updatedAt: new Date(),
    });
  }

  toJSON(): EventProps {
    return { ...this.props };
  }
}
