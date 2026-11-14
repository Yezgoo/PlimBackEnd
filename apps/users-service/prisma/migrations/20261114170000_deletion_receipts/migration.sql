CREATE TABLE account_deletion_receipts (
  user_id UUID PRIMARY KEY,
  completed_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_by TEXT NOT NULL
);
