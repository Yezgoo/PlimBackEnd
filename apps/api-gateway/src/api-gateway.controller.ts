import { Controller, Get } from '@nestjs/common';
import { ApiGatewayService } from './api-gateway.service.js';
import type { JWTPayload } from 'jose';
import { CurrentUser } from './auth/current-user.decorator.js';

@Controller()
export class ApiGatewayController {
  constructor(private readonly apiGatewayService: ApiGatewayService) {}

  @Get()
  getHello(): string {
    return this.apiGatewayService.getHello();
  }

  @Get('whoami') // protected by the global AuthGuard
  whoami(@CurrentUser() user: JWTPayload) {
    return { sub: user.sub, issuer: user.iss, expiresAt: user.exp };
  }
}
