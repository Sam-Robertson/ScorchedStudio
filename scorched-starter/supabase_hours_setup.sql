-- Run this in the Supabase SQL Editor to set up admin-configurable booking
-- hours and blocked (holiday/closure) dates.

-- ── business_hours ────────────────────────────────────────────────────────────
-- Exactly one row per weekday (0=Sun .. 6=Sat). Edit rows in place from the
-- admin "Hours" page — never insert/delete rows after seeding.

CREATE TABLE IF NOT EXISTS business_hours (
  weekday     smallint    PRIMARY KEY CHECK (weekday BETWEEN 0 AND 6),
  is_open     boolean     NOT NULL DEFAULT true,
  open_time   time        NOT NULL DEFAULT '17:00',
  close_time  time        NOT NULL DEFAULT '22:00',
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Seed: reproduces the previously-hardcoded schedule exactly, so nothing
-- changes for customers until the admin edits something.
-- Sun closed; Mon-Fri 5:00 PM-10:00 PM; Sat 11:00 AM-10:00 PM.
INSERT INTO business_hours (weekday, is_open, open_time, close_time) VALUES
  (0, false, '17:00', '22:00'),  -- Sunday
  (1, true,  '17:00', '22:00'),  -- Monday
  (2, true,  '17:00', '22:00'),  -- Tuesday
  (3, true,  '17:00', '22:00'),  -- Wednesday
  (4, true,  '17:00', '22:00'),  -- Thursday
  (5, true,  '17:00', '22:00'),  -- Friday
  (6, true,  '11:00', '22:00')   -- Saturday
ON CONFLICT (weekday) DO NOTHING;

-- ── blocked_dates ─────────────────────────────────────────────────────────────
-- Ad-hoc closed dates (holidays, private events). A row's presence closes
-- that date for booking regardless of the weekday's normal hours.

CREATE TABLE IF NOT EXISTS blocked_dates (
  date        date        PRIMARY KEY,
  reason      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
