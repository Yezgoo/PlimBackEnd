import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from './public.decorator.js';

export type AuthenticatedRequest = Request & { user?: JWTPayload };

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly issuer = process.env.AUTH0_ISSUER_URL!;
  private readonly audience = process.env.AUTH0_AUDIENCE!;

  // Auth0 publishes its public keys at <issuer>/.well-known/jwks.json.
  // jose downloads them once, caches them, and refreshes when Auth0 rotates keys.
  private readonly jwks = createRemoteJWKSet(new URL('.well-known/jwks.json', this.issuer));

  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Is this route (or its controller) marked @Public()?
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(), // the method, e.g. check()
      context.getClass(),   // the controller, e.g. HealthController
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractToken(request);
    if (!token) throw new UnauthorizedException('Missing bearer token');

    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        issuer: this.issuer,      // must come from OUR tenant
        audience: this.audience,  // must be meant for OUR API
        algorithms: ['RS256'],    // only accept the algorithm we chose
      });                         // (expiry is checked automatically)
      request.user = payload;     // controllers can now see who is calling
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private extractToken(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}