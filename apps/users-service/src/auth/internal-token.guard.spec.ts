import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';
import { InternalTokenGuard } from './internal-token.guard.js';

const contextWith = (headers: Record<string, string>) =>
  ({ switchToHttp: () => ({ getRequest: () => ({ headers }) }) }) as unknown as ExecutionContext;

describe('InternalTokenGuard', () => {
  let guard: InternalTokenGuard;

  beforeEach(() => {
    process.env.INTERNAL_SERVICE_TOKEN = 'the-secret';
    guard = new InternalTokenGuard();
  });

  it('lets the gateway through with the right token', () => {
    expect(guard.canActivate(contextWith({ 'x-internal-token': 'the-secret' }))).toBe(true);
  });

  it('rejects a request without the header', () => {
    expect(() => guard.canActivate(contextWith({}))).toThrow(UnauthorizedException);
  });

  it('rejects a wrong token', () => {
    expect(() => guard.canActivate(contextWith({ 'x-internal-token': 'the-secreT' }))).toThrow(UnauthorizedException);
  });

  it('refuses to start without a configured token', () => {
    delete process.env.INTERNAL_SERVICE_TOKEN;
    expect(() => new InternalTokenGuard()).toThrow('INTERNAL_SERVICE_TOKEN is not set');
  });
});
