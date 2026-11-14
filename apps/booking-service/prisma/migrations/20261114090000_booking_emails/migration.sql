BEGIN;
CREATE TABLE booking_emails (
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('receipt', 'assigned', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  attempted_at TIMESTAMPTZ,
  envelope JSONB,
  sent_at TIMESTAMPTZ,
  PRIMARY KEY (booking_id, kind)
);
CREATE INDEX booking_emails_pending ON booking_emails (created_at) WHERE sent_at IS NULL;

CREATE FUNCTION enqueue_booking_email() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'booking_receipts' THEN
    INSERT INTO booking_emails (booking_id, kind) VALUES (NEW.booking_id, 'receipt') ON CONFLICT DO NOTHING;
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'accepted' THEN
      INSERT INTO booking_emails (booking_id, kind) VALUES (NEW.id, 'assigned') ON CONFLICT DO NOTHING;
    ELSIF NEW.status = 'confirmed' THEN
      INSERT INTO booking_emails (booking_id, kind) VALUES (NEW.id, 'completed') ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER receipt_email AFTER INSERT ON booking_receipts FOR EACH ROW EXECUTE FUNCTION enqueue_booking_email();
CREATE TRIGGER booking_status_email AFTER UPDATE OF status ON bookings FOR EACH ROW EXECUTE FUNCTION enqueue_booking_email();
COMMIT;
