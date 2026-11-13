import { Injectable, Logger } from '@nestjs/common';

const CACHE_MS = 60_000;

// The numbers admins can tune (offer deadline, how many professionals to ask, hours before a finished
// job is confirmed automatically). They live in admin-service; this keeps a copy for a minute so that
// not every booking asks for them, and keeps working with the last known values if admin-service is down.
@Injectable()
export class SettingsReader {
  private readonly logger = new Logger(SettingsReader.name);
  private readonly baseUrl = process.env.ADMIN_SERVICE_URL ?? 'http://localhost:3004';
  private values = new Map<string, number>();
  private fetchedAt = 0;

  // Order of preference: an environment variable (handy for local tests), the admin setting, the default.
  async number(key: string, envName: string, fallback: number): Promise<number> {
    const override = process.env[envName];
    if (override !== undefined && override !== '' && Number.isFinite(Number(override))) return Number(override);

    await this.refreshIfStale();
    return this.values.get(key) ?? fallback;
  }

  private async refreshIfStale() {
    if (Date.now() - this.fetchedAt < CACHE_MS) return;
    this.fetchedAt = Date.now(); // also on failure: don't hammer a service that is down
    try {
      const response = await fetch(`${this.baseUrl}/settings`, {
        headers: { 'X-Internal-Token': process.env.INTERNAL_SERVICE_TOKEN ?? '' },
      });
      if (!response.ok) throw new Error(`admin-service answered ${response.status}`);
      const settings = (await response.json()) as { key: string; value: number }[];
      this.values = new Map(settings.map((setting) => [setting.key, setting.value]));
    } catch (e) {
      this.logger.warn(`Could not read settings, using the last known values or defaults: ${(e as Error).message}`);
    }
  }
}
