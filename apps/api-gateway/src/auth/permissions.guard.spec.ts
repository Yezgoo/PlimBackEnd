import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { PermissionsGuard } from './permissions.guard.js';

// a fake request to `path` by `user`, on a route decorated with `required` permissions
const contextWith = (path: string, user: Record<string, unknown> | undefined, required: string[] = []) => {
  const reflector = { getAllAndMerge: () => required } as unknown as Reflector;
  const context = {
    switchToHttp: () => ({ getRequest: () => ({ path, user }) }),
    getHandler: () => () => {},
    getClass: () => class {},
  } as unknown as ExecutionContext;
  return { guard: new PermissionsGuard(reflector), context };
};

const check = (path: string, user: Record<string, unknown> | undefined, required: string[] = []) => {
  const { guard, context } = contextWith(path, user, required);
  return () => guard.canActivate(context);
};

describe('PermissionsGuard', () => {
  it('lets ordinary routes through', () => {
    expect(check('/me', { sub: 'auth0|1' })()).toBe(true);
    expect(check('/catalog/services', undefined)()).toBe(true); // public route, nobody logged in
  });

  it('lets an admin into /admin', () => {
    expect(check('/admin/me', { sub: 'auth0|1', permissions: ['admin:access'] })()).toBe(true);
  });

  it('keeps everyone else out of /admin, even without a decorator on the route', () => {
    expect(check('/admin/me', { sub: 'auth0|1' })).toThrow(ForbiddenException);
    expect(check('/admin', { sub: 'auth0|1', permissions: [] })).toThrow(ForbiddenException);
    expect(check('/admin/professionals', { sub: 'auth0|1', permissions: ['something:else'] })).toThrow('admin:access');
  });

  it('keeps /admin closed when nobody is logged in (a route wrongly marked @Public())', () => {
    expect(check('/admin/me', undefined)).toThrow(ForbiddenException);
  });

  it('does not treat look-alike paths as admin', () => {
    expect(check('/administrators', { sub: 'auth0|1' })()).toBe(true);
  });

  it('refuses application tokens, even ones that carry the permission', () => {
    const machine = { sub: 'abc@clients', gty: 'client-credentials', permissions: ['admin:access'] };
    expect(check('/admin/me', machine)).toThrow('logged-in user');
  });

  it('needs every permission a route asks for', () => {
    const user = { sub: 'auth0|1', permissions: ['admin:access'] };
    expect(check('/admin/settings', user, ['settings:write'])).toThrow('settings:write');
    expect(check('/admin/settings', { ...user, permissions: ['admin:access', 'settings:write'] }, ['settings:write'])()).toBe(true);
  });

  it('ignores a permissions claim that is not a list', () => {
    expect(check('/admin/me', { sub: 'auth0|1', permissions: 'admin:access' })).toThrow(ForbiddenException);
  });
});
