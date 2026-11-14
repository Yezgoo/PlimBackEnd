BEGIN;
CREATE TABLE push_devices (
  token TEXT PRIMARY KEY,
  user_id UUID NOT NULL,
  professional_id UUID
);
CREATE INDEX push_devices_user ON push_devices(user_id);
CREATE INDEX push_devices_professional ON push_devices(professional_id);
CREATE TABLE processed_push_events (
  id BIGSERIAL PRIMARY KEY,
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  token TEXT NOT NULL REFERENCES push_devices(token) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  kind TEXT NOT NULL,
  event_key TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  lease_until TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  UNIQUE (event_key, token)
);
CREATE INDEX pending_push_events ON processed_push_events(id) WHERE processed_at IS NULL;
CREATE FUNCTION enqueue_booking_push() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'booking_offers' THEN
    INSERT INTO processed_push_events (booking_id, token, user_id, kind, event_key, expires_at)
    SELECT NEW.booking_id, token, user_id, 'offer', 'offer:' || NEW.id, NEW.expires_at AT TIME ZONE 'UTC'
    FROM push_devices WHERE professional_id = NEW.professional_id
    ON CONFLICT DO NOTHING;
  ELSIF NEW.to_status IN ('accepted','en_route','in_progress','done','confirmed','cancelled') THEN
    INSERT INTO processed_push_events (booking_id, token, user_id, kind, event_key, expires_at)
    SELECT NEW.booking_id, d.token, d.user_id, NEW.to_status::text, 'status:' || NEW.id, NOW() + INTERVAL '1 day'
    FROM bookings b JOIN push_devices d ON d.user_id = b.customer_id WHERE b.id = NEW.booking_id
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER offer_push AFTER INSERT ON booking_offers FOR EACH ROW WHEN (NEW.status = 'pending') EXECUTE FUNCTION enqueue_booking_push();
CREATE TRIGGER status_push AFTER INSERT ON booking_events FOR EACH ROW EXECUTE FUNCTION enqueue_booking_push();
COMMIT;
