// The contract for events users-service publishes. Consumers rely on this shape,
// so change it only by adding optional fields (or by creating a new event type).
export const USER_REGISTERED_TOPIC = 'user.registered';

export type UserRegisteredEvent = {
  eventId: string;     // unique per event, so consumers can skip duplicates
  type: 'user.registered';
  occurredAt: string;  // ISO date
  data: {
    userId: string;
    auth0Id: string;
    email: string;
    name: string | null;
  };
};
