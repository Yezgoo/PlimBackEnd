import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import type { JWTPayload } from 'jose';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { callInternalService } from '../internal/internal-http.js';

@Controller('admin')
export class AdminBookingsController {
  private readonly baseUrl = process.env.BOOKING_SERVICE_URL ?? 'http://localhost:3003';

  @Get('metrics')
  metrics(@Query('days') days?: string) {
    return this.request(days === undefined ? '/metrics' : `/metrics?days=${encodeURIComponent(days)}`);
  }

  @Get('bookings')
  list(@Query('before') before?: string) {
    const query = before ? `?before=${encodeURIComponent(before)}` : '';
    return this.request(`/bookings${query}`);
  }

  @Get('bookings/:id')
  booking(@Param('id', ParseUUIDPipe) id: string) {
    return this.request(`/bookings/${id}`);
  }

  @Patch('bookings/:id/invoice')
  issueInvoice(@CurrentUser() user: JWTPayload, @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { reference?: unknown; billingName?: unknown; nif?: unknown }) {
    return callInternalService('booking-service', this.baseUrl, `/invoices/${id}/issue`, {
      method: 'PATCH', body: JSON.stringify({ ...body, admin: user.sub }),
    });
  }

  @Get('coupons')
  coupons() {
    return this.request('/coupons');
  }

  @Post('coupons')
  createCoupon(@Body() body: unknown) {
    return this.request('/coupons', { method: 'POST', body: JSON.stringify(body ?? {}) });
  }

  @Patch('coupons/:code')
  updateCoupon(@Param('code') code: string, @Body('active') active: unknown) {
    return this.request(`/coupons/${encodeURIComponent(code)}`, { method: 'PATCH', body: JSON.stringify({ active }) });
  }

  private request(path: string, init?: RequestInit) {
    return callInternalService('booking-service', this.baseUrl, `/backoffice${path}`, init);
  }
}
