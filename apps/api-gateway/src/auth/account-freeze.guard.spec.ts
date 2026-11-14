import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { afterEach, expect, it, vi } from 'vitest';
import { AccountFreezeGuard } from './account-freeze.guard.js';

const guard = new AccountFreezeGuard();
const context = (method: string, path: string) => ({
  switchToHttp: () => ({ getRequest: () => ({ method, path, user: { sub: 'auth0|account' } }) }),
}) as unknown as ExecutionContext;

afterEach(() => vi.unstubAllGlobals());

it('rejects new bookings for a frozen account', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ frozen: true }));
  vi.stubGlobal('fetch', fetch);
  await expect(guard.canActivate(context('POST', '/bookings'))).rejects.toBeInstanceOf(ForbiddenException);
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/users/by-auth0/auth0%7Caccount/privacy/freeze'), expect.anything());
});

it('allows a profile registration when the subject has no freeze', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ frozen: false })));
  await expect(guard.canActivate(context('POST', '/me'))).resolves.toBe(true);
});

it('allows reads and push removal without a freeze lookup', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  await expect(guard.canActivate(context('GET', '/me/privacy/export'))).resolves.toBe(true);
  await expect(guard.canActivate(context('POST', '/me/push/remove/'))).resolves.toBe(true);
  expect(fetch).not.toHaveBeenCalled();
});
