// Events about a professional's application carry internal identifiers.
export const PROFESSIONAL_APPROVED_TOPIC = 'professional.approved';
export const PROFESSIONAL_REJECTED_TOPIC = 'professional.rejected';

type ProfessionalEventData = {
  professionalId: string;
  userId: string;
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
  data: ProfessionalEventData;
};
