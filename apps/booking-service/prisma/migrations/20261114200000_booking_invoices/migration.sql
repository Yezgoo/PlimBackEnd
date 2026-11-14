CREATE TABLE booking_invoices (
  booking_id UUID PRIMARY KEY REFERENCES bookings(id) ON DELETE CASCADE ON UPDATE CASCADE,
  billing_name TEXT NOT NULL,
  nif TEXT,
  issued_at TIMESTAMP(3),
  reference TEXT,
  issued_by TEXT
);
