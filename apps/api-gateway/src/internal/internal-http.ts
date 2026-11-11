import { HttpException, ServiceUnavailableException } from '@nestjs/common';

// One HTTP call from the gateway to an internal service (users-service, catalog-service, ...).
// Adds the shared secret that proves the call comes from the gateway, passes the service's
// error statuses (400/404/409) straight through, and answers 503 when the service is down.
export async function callInternalService<T>(
  serviceName: string,
  baseUrl: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Token': process.env.INTERNAL_SERVICE_TOKEN ?? '',
      },
    });
  } catch {
    throw new ServiceUnavailableException(`${serviceName} is unavailable`);
  }

  const body = await response.json().catch(() => undefined);
  if (!response.ok) throw new HttpException(body ?? response.statusText, response.status);
  return body as T;
}
