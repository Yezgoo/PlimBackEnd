// Events about a professional's application. Same rule as user-events.ts:
// consumers rely on these shapes, so only ever add optional fields.
export const PROFESSIONAL_APPROVED_TOPIC = 'professional.approved';
export const PROFESSIONAL_REJECTED_TOPIC = 'professional.rejected';

type ProfessionalEventData = {
  professionalId: string;
  userId: string;
  auth0Id: string;
  email: string;
  name: string | null;
};

export type ProfessionalApprovedEvent = {
  eventId: string;
  type: 'professional.approved';
  occurredAt: string;
  data: ProfessionalEventData;
};

export type ProfessionalRejectedEvent = {
  eventId: string;
  type: 'professional.rejected';
  occurredAt: string;
  data: ProfessionalEventData & { reason: string };
};
