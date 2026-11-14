import { afterEach, expect, it, vi } from 'vitest';
import { BookingEmailWorker } from './booking-email.worker.js';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it('reuses the saved envelope and acknowledges delivery only after provider acceptance', async () => {
  vi.stubEnv('RESEND_API_KEY', 'fixture');
  vi.stubEnv('TRANSACTIONAL_EMAIL_FROM', 'bookings@example.test');
  const envelope = { from: 'bookings@example.test', to: ['customer@example.test'], subject: 'Pagamento recebido', text: '€47' };
  const job = { bookingId: 'booking-1', customerId: 'account-1', kind: 'receipt', envelope };
  const recipient = () => Response.json({ recipient: { email: 'customer@example.test', name: null } });
  const fetch = vi.fn()
    .mockResolvedValueOnce(Response.json([job]))
    .mockResolvedValueOnce(recipient())
    .mockResolvedValueOnce(Response.json({ envelope }))
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValueOnce(Response.json([job]))
    .mockResolvedValueOnce(recipient())
    .mockResolvedValueOnce(Response.json({ envelope }))
    .mockResolvedValueOnce(Response.json({ id: 'provider-id' }))
    .mockResolvedValueOnce(Response.json({ received: true }));
  vi.stubGlobal('fetch', fetch);
  const worker = new BookingEmailWorker();
  await worker.sweep();
  expect(fetch).toHaveBeenCalledTimes(4);
  await worker.sweep();
  expect(fetch.mock.calls[7]).toEqual(fetch.mock.calls[3].map((value, index) =>
    index === 1 ? expect.objectContaining({ headers: value.headers, body: JSON.stringify(envelope) }) : value));
  expect(fetch.mock.calls[8][0]).toMatch(/\/booking-1\/receipt\/sent$/);
});

it('never sends a saved envelope when the recipient is no longer eligible', async () => {
  vi.stubEnv('RESEND_API_KEY', 'fixture');
  vi.stubEnv('TRANSACTIONAL_EMAIL_FROM', 'bookings@example.test');
  const fetch = vi.fn()
    .mockResolvedValueOnce(Response.json([{ bookingId: 'booking-1', customerId: 'account-1', kind: 'receipt', envelope: { to: ['old@example.test'] } }]))
    .mockResolvedValueOnce(Response.json({ recipient: null }));
  vi.stubGlobal('fetch', fetch);
  await new BookingEmailWorker().sweep();
  expect(fetch).toHaveBeenCalledTimes(2);
});
