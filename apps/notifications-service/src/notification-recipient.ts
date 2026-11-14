export async function notificationRecipient(userId: string) {
  const base = process.env.USERS_SERVICE_URL ?? 'http://localhost:3001';
  const response = await fetch(`${base}/users/${encodeURIComponent(userId)}/privacy/notification-recipient`, {
    headers: { 'X-Internal-Token': process.env.INTERNAL_SERVICE_TOKEN ?? '' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error('Notification recipient lookup failed');
  const { recipient } = await response.json() as { recipient: { email: string; name: string | null } | null };
  if (recipient !== null && typeof recipient?.email !== 'string') throw new Error('Invalid notification recipient response');
  return recipient;
}
