import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

// users-service is internal: only the gateway may call it. The gateway proves it with a
// shared secret in the X-Internal-Token header; anyone else reaching port 3001 gets a 401.
@Injectable()
export class InternalTokenGuard implements CanActivate {
  private readonly expected: Buffer;

  constructor() {
    const token = process.env.INTERNAL_SERVICE_TOKEN;
    // fail at startup rather than run unprotected
    if (!token) throw new Error('INTERNAL_SERVICE_TOKEN is not set');
    this.expected = Buffer.from(token);
  }

  canActivate(context: ExecutionContext): boolean {
    const header = context.switchToHttp().getRequest<Request>().headers['x-internal-token'];
    const given = Buffer.from(typeof header === 'string' ? header : '');
    // timingSafeEqual: comparing byte by byte in constant time, so the secret can't be guessed from response times
    if (given.length !== this.expected.length || !timingSafeEqual(given, this.expected)) {
      throw new UnauthorizedException('Missing or invalid internal token');
    }
    return true;
  }
}
