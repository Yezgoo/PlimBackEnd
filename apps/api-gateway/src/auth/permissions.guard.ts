import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from './auth.guard.js';
import { ADMIN_ACCESS, PERMISSIONS_KEY } from './permissions.decorator.js';

// Checks the "permissions" claim Auth0 puts in the access token (RBAC on the Plim API).
// Runs after AuthGuard, so the token is already verified: nobody can add permissions to their own token.
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const required = new Set(
      this.reflector.getAllAndMerge<string[]>(PERMISSIONS_KEY, [context.getHandler(), context.getClass()]),
    );
    // Secure by default: anything under /admin needs the admin permission,
    // even if someone forgets the decorator (or marks the route @Public()).
    if (isAdminPath(request.path)) required.add(ADMIN_ACCESS);
    if (!required.size) return true;

    // Machine-to-machine tokens represent an application, not a person: no admin actions for them
    if (request.user?.gty === 'client-credentials') {
      throw new ForbiddenException('This endpoint needs a logged-in user, not an application token');
    }

    const claim = request.user?.permissions;
    const granted = new Set(Array.isArray(claim) ? claim : []);
    const missing = [...required].filter((permission) => !granted.has(permission));
    if (missing.length) throw new ForbiddenException(`Missing permission: ${missing.join(', ')}`);

    return true;
  }
}

function isAdminPath(path: string) {
  return path === '/admin' || path.startsWith('/admin/');
}
