import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthenticatedRequest } from './auth.guard.js';
import { callInternalService } from '../internal/internal-http.js';

@Injectable()
export class AccountFreezeGuard implements CanActivate {
  async canActivate(context: ExecutionContext) {
    const { method, path, user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!user?.sub || user.gty === 'client-credentials' || ['GET', 'HEAD', 'OPTIONS'].includes(method)) return true;
    if (path.replace(/\/$/, '').toLowerCase() === '/me/push/remove') return true;

    const { frozen } = await callInternalService<{ frozen: boolean }>(
      'users-service', process.env.USERS_SERVICE_URL ?? 'http://localhost:3001',
      `/users/by-auth0/${encodeURIComponent(user.sub)}/privacy/freeze`,
    );
    if (frozen) throw new ForbiddenException('A conta está bloqueada para tratar do pedido de eliminação.');
    return true;
  }
}
