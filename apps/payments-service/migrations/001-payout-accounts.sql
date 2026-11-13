CREATE TABLE IF NOT EXISTS payout_accounts (
  professional_id UUID PRIMARY KEY,
  stripe_account_id TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
