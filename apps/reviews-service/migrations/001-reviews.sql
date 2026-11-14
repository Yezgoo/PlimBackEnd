CREATE TABLE IF NOT EXISTS reviews (
  booking_id UUID PRIMARY KEY,
  customer_id UUID NOT NULL,
  professional_id UUID NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT CHECK (char_length(comment) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  projected_at TIMESTAMPTZ,
  projection_attempted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS pending_review_ratings ON reviews
  (projection_attempted_at NULLS FIRST, created_at, booking_id) WHERE projected_at IS NULL;
