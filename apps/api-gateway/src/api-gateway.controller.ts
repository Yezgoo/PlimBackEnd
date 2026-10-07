import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiGatewayService } from './api-gateway.service.js';
import type { JWTPayload } from 'jose';
import { AuthGuard } from './auth/auth.guard.js';
import { CurrentUser } from './auth/current-user.decorator.js';

@Controller()
export class ApiGatewayController {
  constructor(private readonly apiGatewayService: ApiGatewayService) {}

  @Get()
  getHello(): string {
    return this.apiGatewayService.getHello();
  }


  @Get('whoami')
  @UseGuards(AuthGuard)          // ← this one line protects the endpoint
  whoami(@CurrentUser() user: JWTPayload) {
    return { sub: user.sub, issuer: user.iss, expiresAt: user.exp };
  }
}
