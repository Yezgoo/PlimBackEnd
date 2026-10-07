import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';
import { AuthGuard } from './auth.guard.js';

// builds a fake request context with the headers we want
const contextWith = (headers: Record<string, string>) =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  }) as unknown as ExecutionContext;

describe('AuthGuard', () => {
  let guard: AuthGuard;

  beforeEach(() => {
    process.env.AUTH0_ISSUER_URL = 'https://example.eu.auth0.com/';
    process.env.AUTH0_AUDIENCE = 'https://api.plim.app';
    guard = new AuthGuard();
  });

  it('rejects a request without an Authorization header', async () => {
    await expect(guard.canActivate(contextWith({}))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a non-Bearer Authorization header', async () => {
    await expect(guard.canActivate(contextWith({ authorization: 'Basic abc' })))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a malformed token', async () => {
    await expect(guard.canActivate(contextWith({ authorization: 'Bearer not-a-jwt' })))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });
});