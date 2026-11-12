import { Injectable, ServiceUnavailableException } from '@nestjs/common';

export type Candidate = { id: string; userId: string; name: string | null; ratingAvg: number | null; ratingCount: number };

// Asks users-service who could take a job. Service-to-service call, authenticated with the same
// shared secret the gateway uses.
@Injectable()
export class ProfessionalsDirectory {
  private readonly baseUrl = process.env.USERS_SERVICE_URL ?? 'http://localhost:3001';

  async eligibleFor(job: { serviceTypeId: string; municipalityCode: string; start: Date; end: Date }): Promise<Candidate[]> {
    const query = new URLSearchParams({
      serviceTypeId: job.serviceTypeId,
      municipalityCode: job.municipalityCode,
      start: job.start.toISOString(),
      end: job.end.toISOString(),
    });

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/internal/professionals/eligible?${query}`, {
        headers: { 'X-Internal-Token': process.env.INTERNAL_SERVICE_TOKEN ?? '' },
      });
    } catch {
      throw new ServiceUnavailableException('users-service is unavailable');
    }
    if (!response.ok) throw new ServiceUnavailableException(`users-service answered ${response.status}`);
    return (await response.json()) as Candidate[];
  }
}
