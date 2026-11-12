import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { callInternalService } from '../internal/internal-http.js';

@Injectable()
export class PricingSettingsClient {
  private readonly baseUrl = process.env.ADMIN_SERVICE_URL ?? 'http://localhost:3004';

  async read() {
    const settings = await callInternalService<{ key: string; value: number }[]>('admin-service', this.baseUrl, '/settings');
    const serviceFeeCents = settings.find(({ key }) => key === 'service_fee_cents')?.value;
    const commissionBps = settings.find(({ key }) => key === 'commission_default')?.value;
    if (serviceFeeCents === undefined || commissionBps === undefined) {
      throw new ServiceUnavailableException('Booking pricing settings are unavailable');
    }
    return { serviceFeeCents, commissionBps };
  }
}
