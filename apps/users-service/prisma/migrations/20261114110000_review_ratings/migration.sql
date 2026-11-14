CREATE TABLE review_ratings (
  booking_id UUID PRIMARY KEY,
  professional_id UUID NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5)
);
CREATE INDEX review_ratings_professional ON review_ratings(professional_id);
