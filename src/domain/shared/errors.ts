export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly statusCode: number;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class EventNotFoundError extends DomainError {
  readonly code = 'EVENT_NOT_FOUND';
  readonly statusCode = 404;
  constructor(id: string) {
    super(`Event with id "${id}" not found`);
  }
}

export class QueueNotFoundError extends DomainError {
  readonly code = 'QUEUE_NOT_FOUND';
  readonly statusCode = 404;
  constructor(name: string) {
    super(`Queue "${name}" not found`);
  }
}

export class PipelineNotFoundError extends DomainError {
  readonly code = 'PIPELINE_NOT_FOUND';
  readonly statusCode = 404;
  constructor(id: string) {
    super(`Pipeline "${id}" not found`);
  }
}

export class InvalidEventPayloadError extends DomainError {
  readonly code = 'INVALID_EVENT_PAYLOAD';
  readonly statusCode = 422;
  constructor(details: string) {
    super(`Invalid event payload: ${details}`);
  }
}

export class QueueAlreadyExistsError extends DomainError {
  readonly code = 'QUEUE_ALREADY_EXISTS';
  readonly statusCode = 409;
  constructor(name: string) {
    super(`Queue "${name}" already exists`);
  }
}
