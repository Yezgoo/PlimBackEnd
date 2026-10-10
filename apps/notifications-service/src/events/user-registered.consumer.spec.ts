import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WelcomeNotifier } from '../welcome/welcome.notifier.js';
import { UserRegisteredConsumer } from './user-registered.consumer.js';

describe('UserRegisteredConsumer', () => {
  const welcomeMock = { onUserRegistered: vi.fn() };
  let consumer: UserRegisteredConsumer;

  beforeEach(() => {
    vi.clearAllMocks();
    // creating the class doesn't connect to Kafka; that only happens in onApplicationBootstrap()
    consumer = new UserRegisteredConsumer(welcomeMock as unknown as WelcomeNotifier);
  });

  it('passes a user.registered event to WelcomeNotifier', async () => {
    const event = {
      eventId: 'e1',
      type: 'user.registered',
      occurredAt: '2026-10-10T12:00:00Z',
      data: { userId: 'uuid-1', email: 'a@b.com', name: 'Ana' },
    };

    await consumer.handle(JSON.stringify(event));

    expect(welcomeMock.onUserRegistered).toHaveBeenCalledWith(event);
  });

  it('skips a message that is not valid JSON instead of crashing', async () => {
    await expect(consumer.handle('not json')).resolves.toBeUndefined();
    expect(welcomeMock.onUserRegistered).not.toHaveBeenCalled();
  });

  it('keeps going when handling an event fails', async () => {
    welcomeMock.onUserRegistered.mockRejectedValueOnce(new Error('email provider down'));

    await expect(consumer.handle(JSON.stringify({ eventId: 'e1', data: {} }))).resolves.toBeUndefined();
  });
});
