ALTER TABLE account_deletion_requests
  ADD COLUMN processing_at TIMESTAMP(3),
  ADD COLUMN processing_by TEXT;
