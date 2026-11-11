import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthenticatedRequest } from './auth.guard.js';

// Auth0 machine-to-machine tokens (client credentials) identify an application, not a person.
// Routes about "me" need a person, so they reject those tokens.
// Runs after the global AuthGuard, so request.user is already a verified token.
@Injectable()
export class HumanCallerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (user?.gty === 'client-credentials') {
      throw new ForbiddenException('This endpoint needs a logged-in user, not an application token');
    }
    return true;
  }
}
