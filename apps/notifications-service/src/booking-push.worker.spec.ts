import { afterEach, expect, it, vi } from 'vitest';
import { BookingPushWorker } from './booking-push.worker.js';

afterEach(() => vi.unstubAllGlobals());

it('acknowledges successful tickets, removes invalid devices, and leaves temporary failures for retry', async () => {
  const base = { bookingId: 'booking-1', userId: 'customer-1', expiresAt: '2026-11-14T12:00:00Z' };
  const jobs = [
    { ...base, id: '1', token: 'ExpoPushToken[first]', kind: 'offer' },
    { ...base, id: '2', token: 'ExpoPushToken[second]', kind: 'accepted' },
    { ...base, id: '3', token: 'ExpoPushToken[third]', kind: 'done' },
  ];
  const fetch = vi.fn().mockResolvedValueOnce(Response.json(jobs))
    .mockResolvedValueOnce(Response.json({ data: [
      { status: 'ok' }, { status: 'error', details: { error: 'DeviceNotRegistered' } },
      { status: 'error', details: { error: 'MessageRateExceeded' } },
    ] }))
    .mockResolvedValueOnce(Response.json({ received: true }))
    .mockResolvedValueOnce(Response.json({ received: true }));
  vi.stubGlobal('fetch', fetch);
  await new BookingPushWorker().sweep();
  const payload = JSON.parse(fetch.mock.calls[1][1].body);
  expect(payload[0]).toMatchObject({ priority: 'high', data: { view: 'professional' } });
  expect(payload[1].data).toEqual({ id: 'booking-1' });
  expect(JSON.parse(fetch.mock.calls[2][1].body)).toEqual({ token: jobs[1].token, userId: 'customer-1' });
  expect(JSON.parse(fetch.mock.calls[3][1].body)).toEqual({ ids: ['1'] });
});
