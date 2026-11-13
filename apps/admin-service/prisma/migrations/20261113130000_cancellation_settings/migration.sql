-- Cancellation policy, tunable by admins (roadmap step 11e).
INSERT INTO "settings" ("key", "value", "min", "max") VALUES
    ('free_cancel_hours', 24, 0, 168),        -- a customer may cancel for free until this many hours before the start
    ('late_cancel_fee_percent', 30, 0, 100),  -- share of the service price charged for a later cancellation
    ('no_show_grace_minutes', 30, 5, 180)     -- minutes after the start before the customer can report a no-show
ON CONFLICT ("key") DO NOTHING;
