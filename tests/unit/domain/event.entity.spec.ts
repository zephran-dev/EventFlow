import { DomainEvent } from '../../../src/domain/events/event.entity';

describe('DomainEvent', () => {
  const makeEvent = () =>
    DomainEvent.create({
      type: 'user.registered',
      payload: { userId: '123', email: 'test@test.com' },
      source: 'auth-service',
    });

  it('should create an event with default values', () => {
    const event = makeEvent();
    expect(event.id).toBeDefined();
    expect(event.type).toBe('user.registered');
    expect(event.status).toBe('pending');
    expect(event.attempts).toBe(0);
    expect(event.metadata.version).toBe('1.0');
    expect(event.metadata.correlationId).toBeDefined();
  });

  it('should transition to processing state', () => {
    const event = makeEvent().markAsProcessing();
    expect(event.status).toBe('processing');
    expect(event.attempts).toBe(1);
  });

  it('should increment attempts on each markAsProcessing call', () => {
    const event = makeEvent().markAsProcessing().markAsProcessing();
    expect(event.attempts).toBe(2);
  });

  it('should transition to completed state', () => {
    const event = makeEvent().markAsProcessing().markAsCompleted();
    expect(event.status).toBe('completed');
  });

  it('should transition to failed state with error message', () => {
    const event = makeEvent().markAsProcessing().markAsFailed('timeout');
    expect(event.status).toBe('failed');
    expect(event.error).toBe('timeout');
  });

  it('should transition to dead-letter state', () => {
    const event = makeEvent().markAsDeadLetter('too many retries');
    expect(event.status).toBe('dead-letter');
    expect(event.error).toBe('too many retries');
  });

  it('should be immutable — original event is unchanged after transition', () => {
    const original = makeEvent();
    const processing = original.markAsProcessing();
    expect(original.status).toBe('pending');
    expect(processing.status).toBe('processing');
  });

  it('should serialise and reconstitute correctly', () => {
    const event = makeEvent();
    const json = event.toJSON();
    const restored = DomainEvent.reconstitute(json);
    expect(restored.id).toBe(event.id);
    expect(restored.type).toBe(event.type);
    expect(restored.status).toBe(event.status);
  });

  it('should support custom correlationId', () => {
    const cid = 'my-correlation-id';
    const event = DomainEvent.create({
      type: 'test',
      payload: {},
      source: 'test',
      correlationId: cid,
    });
    expect(event.metadata.correlationId).toBe(cid);
  });
});
