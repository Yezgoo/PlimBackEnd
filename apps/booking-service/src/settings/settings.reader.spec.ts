import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsReader } from './settings.reader.js';

const settingsResponse = (settings: { key: string; value: number }[]) =>
  new Response(JSON.stringify(settings), { status: 200, headers: { 'Content-Type': 'application/json' } });

describe('SettingsReader', () => {
  const fetchMock = vi.fn();
  let reader: SettingsReader;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-16T10:00:00Z'));
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => settingsResponse([{ key: 'max_offers', value: 8 }]));
    delete process.env.MAX_OFFERS;
    process.env.INTERNAL_SERVICE_TOKEN = 'internal-secret';
    reader = new SettingsReader();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('uses the value set by the admins', async () => {
    await expect(reader.number('max_offers', 'MAX_OFFERS', 5)).resolves.toBe(8);
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({ 'X-Internal-Token': 'internal-secret' });
  });

  it('falls back to the default for a setting admin-service does not have', async () => {
    await expect(reader.number('something_new', 'SOMETHING_NEW', 42)).resolves.toBe(42);
  });

  it('asks admin-service at most once a minute', async () => {
    await reader.number('max_offers', 'MAX_OFFERS', 5);
    await reader.number('max_offers', 'MAX_OFFERS', 5);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(61_000);
    await reader.number('max_offers', 'MAX_OFFERS', 5);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps the last known value while admin-service is down', async () => {
    await reader.number('max_offers', 'MAX_OFFERS', 5);
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    vi.advanceTimersByTime(61_000);

    await expect(reader.number('max_offers', 'MAX_OFFERS', 5)).resolves.toBe(8);
  });

  it('uses the default when admin-service was never reachable', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    await expect(reader.number('max_offers', 'MAX_OFFERS', 5)).resolves.toBe(5);
  });

  it('lets an environment variable override everything, without calling admin-service', async () => {
    process.env.MAX_OFFERS = '2';

    await expect(reader.number('max_offers', 'MAX_OFFERS', 5)).resolves.toBe(2);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
