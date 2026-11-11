import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { HumanCallerGuard } from './human-caller.guard.js';

const contextWith = (user: Record<string, unknown>) =>
  ({ switchToHttp: () => ({ getRequest: () => ({ user }) }) }) as unknown as ExecutionContext;

describe('HumanCallerGuard', () => {
  const guard = new HumanCallerGuard();

  it('lets a logged-in person through', () => {
    expect(guard.canActivate(contextWith({ sub: 'auth0|abc' }))).toBe(true);
  });

  it('rejects a machine-to-machine token', () => {
    expect(() => guard.canActivate(contextWith({ sub: 'xyz@clients', gty: 'client-credentials' })))
      .toThrow(ForbiddenException);
  });
});
