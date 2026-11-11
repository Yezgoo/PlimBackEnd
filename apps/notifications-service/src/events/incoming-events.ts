// This service's copy of the events it listens to (users-service owns the originals).
// Each type lists only what we read, so new fields added by the publisher don't break us.

export const USER_REGISTERED_TOPIC = 'user.registered';
export const PROFESSIONAL_APPROVED_TOPIC = 'professional.approved';
export const PROFESSIONAL_REJECTED_TOPIC = 'professional.rejected';

export const SUBSCRIBED_TOPICS = [USER_REGISTERED_TOPIC, PROFESSIONAL_APPROVED_TOPIC, PROFESSIONAL_REJECTED_TOPIC];

type Envelope<Type extends string, Data> = { eventId: string; type: Type; occurredAt: string; data: Data };
type Person = { email: string; name: string | null };

export type UserRegisteredEvent = Envelope<'user.registered', Person & { userId: string }>;
export type ProfessionalApprovedEvent = Envelope<'professional.approved', Person & { professionalId: string }>;
export type ProfessionalRejectedEvent = Envelope<'professional.rejected', Person & { professionalId: string; reason: string }>;

export type IncomingEvent = UserRegisteredEvent | ProfessionalApprovedEvent | ProfessionalRejectedEvent;
