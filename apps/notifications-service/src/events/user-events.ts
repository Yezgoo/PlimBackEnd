// This service's copy of the user.registered contract (users-service owns the original).
// It lists only what we read, so new fields added by users-service don't break us.
export const USER_REGISTERED_TOPIC = 'user.registered';

export type UserRegisteredEvent = {
  eventId: string;
  type: 'user.registered';
  occurredAt: string;
  data: {
    userId: string;
    email: string;
    name: string | null;
  };
};
