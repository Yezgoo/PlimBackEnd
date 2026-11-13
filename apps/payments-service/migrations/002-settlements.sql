CREATE TABLE IF NOT EXISTS payment_settlements (
  booking_id UUID PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('refund', 'transfer')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  intent_id TEXT NOT NULL,
  destination TEXT,
  source_charge TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  provider_id TEXT,
  completed BOOLEAN NOT NULL DEFAULT FALSE
);
