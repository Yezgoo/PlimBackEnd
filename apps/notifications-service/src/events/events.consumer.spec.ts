import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfessionalNotifier } from '../professionals/professional.notifier.js';
import { WelcomeNotifier } from '../welcome/welcome.notifier.js';
import { EventsConsumer } from './events.consumer.js';

describe('EventsConsumer', () => {
  const welcomeMock = { onUserRegistered: vi.fn() };
  const professionalsMock = { onApproved: vi.fn(), onRejected: vi.fn() };
  let consumer: EventsConsumer;

  const event = (type: string, data: object) => ({ eventId: 'e1', type, occurredAt: '2026-11-12T12:00:00Z', data });

  beforeEach(() => {
    vi.clearAllMocks();
    // creating the class doesn't connect to Kafka; that only happens in onApplicationBootstrap()
    consumer = new EventsConsumer(
      welcomeMock as unknown as WelcomeNotifier,
      professionalsMock as unknown as ProfessionalNotifier,
    );
  });

  it('passes user.registered to WelcomeNotifier', async () => {
    const registered = event('user.registered', { userId: 'uuid-1', email: 'a@b.com', name: 'Ana' });

    await consumer.handle(JSON.stringify(registered));

    expect(welcomeMock.onUserRegistered).toHaveBeenCalledWith(registered);
    expect(professionalsMock.onApproved).not.toHaveBeenCalled();
  });

  it('passes professional.approved and professional.rejected to ProfessionalNotifier', async () => {
    const approved = event('professional.approved', { professionalId: 'p1', email: 'a@b.com', name: 'Ana' });
    const rejected = event('professional.rejected', { professionalId: 'p1', email: 'a@b.com', name: 'Ana', reason: 'Seguro caducado' });

    await consumer.handle(JSON.stringify(approved));
    await consumer.handle(JSON.stringify(rejected));

    expect(professionalsMock.onApproved).toHaveBeenCalledWith(approved);
    expect(professionalsMock.onRejected).toHaveBeenCalledWith(rejected);
    expect(welcomeMock.onUserRegistered).not.toHaveBeenCalled();
  });

  it('ignores an event type it has no handler for', async () => {
    await expect(consumer.handle(JSON.stringify(event('something.else', {})))).resolves.toBeUndefined();
  });

  it('skips a message that is not valid JSON instead of crashing', async () => {
    await expect(consumer.handle('not json')).resolves.toBeUndefined();
    expect(welcomeMock.onUserRegistered).not.toHaveBeenCalled();
  });

  it('keeps going when handling an event fails', async () => {
    welcomeMock.onUserRegistered.mockRejectedValueOnce(new Error('email provider down'));

    await expect(consumer.handle(JSON.stringify(event('user.registered', {})))).resolves.toBeUndefined();
  });
});
