import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { afterEach, expect, it, vi } from 'vitest';
import { AdminPrivacyController } from './admin-privacy.controller.js';

afterEach(() => vi.unstubAllGlobals());

it('requires provider cleanup confirmation before finalization', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  await expect(new AdminPrivacyController().finalize({ sub: 'admin' }, 'account', false))
    .rejects.toBeInstanceOf(UnprocessableEntityException);
  expect(fetch).not.toHaveBeenCalled();
});

it('rechecks booking cleanup and forwards the authenticated administrator before finalization', async () => {
  const completedAt = '2026-11-14T00:00:00Z';
  const fetch = vi.fn()
    .mockResolvedValueOnce(Response.json({ completedAt: null }))
    .mockResolvedValueOnce(Response.json({ professionalId: 'professional', frozenAt: completedAt, bookingsCleanedAt: completedAt, reviewsCleanedAt: completedAt }))
    .mockResolvedValueOnce(Response.json({ customerBookings: 0 }))
    .mockResolvedValueOnce(Response.json({ reviewsScrubbed: 0 }))
    .mockResolvedValueOnce(Response.json({ removed: true }))
    .mockResolvedValueOnce(Response.json({ completedAt }));
  vi.stubGlobal('fetch', fetch);
  await expect(new AdminPrivacyController().finalize({ sub: 'admin' }, 'account', true)).resolves.toEqual({ completedAt });
  expect(fetch.mock.calls.map(([url]) => new URL(url).pathname)).toEqual([
    '/users/privacy/deletions/account/receipt', '/users/privacy/deletions/account/scope',
    '/privacy/account/scrub', '/reviews/privacy/account/scrub', '/payout-accounts/professional/scrub',
    '/users/privacy/deletions/account/finalize',
  ]);
  expect(fetch.mock.calls.at(-1)?.[1].body).toBe(JSON.stringify({ admin: 'admin' }));
});

it('requires explicit confirmation before contacting another service', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  await expect(new AdminPrivacyController().cleanup('account', false)).rejects.toBeInstanceOf(UnprocessableEntityException);
  expect(fetch).not.toHaveBeenCalled();
});

it('does not freeze an account with unsettled payments', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ professionalId: null }))
    .mockResolvedValueOnce(Response.json({ openBookings: 0, unsettledPayments: 1 }));
  vi.stubGlobal('fetch', fetch);
  await expect(new AdminPrivacyController().cleanup('account', true)).rejects.toBeInstanceOf(ConflictException);
  expect(fetch).toHaveBeenCalledTimes(2);
});

it('freezes before scrubbing and refreshes the professional scope', async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce(Response.json({ professionalId: null }))
    .mockResolvedValueOnce(Response.json({ openBookings: 0, unsettledPayments: 0 }))
    .mockResolvedValueOnce(Response.json({ frozenAt: 'now' }))
    .mockResolvedValueOnce(Response.json({ professionalId: 'professional' }))
    .mockResolvedValueOnce(Response.json({ customerBookings: 2 }))
    .mockResolvedValueOnce(Response.json({ recorded: true }))
    .mockResolvedValueOnce(Response.json({ reviewsScrubbed: 1 }))
    .mockResolvedValueOnce(Response.json({ recorded: true }));
  vi.stubGlobal('fetch', fetch);
  await expect(new AdminPrivacyController().cleanup('account', true)).resolves.toEqual({
    cleaned: true,
  });
  expect(fetch.mock.calls.map(([url]) => new URL(url).pathname + new URL(url).search)).toEqual([
    '/users/privacy/deletions/account/scope',
    '/privacy/account/deletion-check',
    '/users/privacy/deletions/account/freeze',
    '/users/privacy/deletions/account/scope',
    '/privacy/account/scrub?professionalId=professional',
    '/users/privacy/deletions/account/checkpoint',
    '/reviews/privacy/account/scrub',
    '/users/privacy/deletions/account/checkpoint',
  ]);
});

it('resumes at reviews when a previous attempt completed booking cleanup', async () => {
  const scope = { professionalId: null, frozenAt: 'now', bookingsCleanedAt: 'now', reviewsCleanedAt: null };
  const fetch = vi.fn()
    .mockResolvedValueOnce(Response.json(scope))
    .mockResolvedValueOnce(Response.json({ openBookings: 0, unsettledPayments: 0 }))
    .mockResolvedValueOnce(Response.json(scope))
    .mockResolvedValueOnce(Response.json({ reviewsScrubbed: 0 }))
    .mockResolvedValueOnce(Response.json({ recorded: true }));
  vi.stubGlobal('fetch', fetch);
  await expect(new AdminPrivacyController().cleanup('account', true)).resolves.toEqual({ cleaned: true });
  expect(fetch.mock.calls.map(([url]) => new URL(url).pathname)).toEqual([
    '/users/privacy/deletions/account/scope',
    '/privacy/account/deletion-check',
    '/users/privacy/deletions/account/scope',
    '/reviews/privacy/account/scrub',
    '/users/privacy/deletions/account/checkpoint',
  ]);
});
