UPDATE outbox_events
SET payload = jsonb_set(payload, '{data}', (payload->'data') - ARRAY['auth0Id', 'email', 'name', 'reason'])
WHERE topic IN ('user.registered', 'professional.approved', 'professional.rejected')
  AND jsonb_typeof(payload->'data') = 'object';
