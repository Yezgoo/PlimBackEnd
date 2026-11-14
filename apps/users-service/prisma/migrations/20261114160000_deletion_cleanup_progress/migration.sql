ALTER TABLE account_deletion_requests
  ADD COLUMN bookings_cleaned_at TIMESTAMP(3),
  ADD COLUMN reviews_cleaned_at TIMESTAMP(3);
