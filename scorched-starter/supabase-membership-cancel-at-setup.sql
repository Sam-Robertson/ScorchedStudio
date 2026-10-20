-- Run this in the Supabase SQL editor (each statement is one line so it pastes cleanly).
--
-- A member who cancels keeps access until the end of the paid period, so
-- Stripe leaves the subscription "active" with cancel_at set. Store that date
-- so the account page and the admin can show "Ends <date>" instead of
-- "Renews <date>" and stop offering the cancel button again.

ALTER TABLE memberships ADD COLUMN IF NOT EXISTS cancel_at TIMESTAMPTZ;

-- Backfill the one pending cancellation that happened before this column existed (Jakob G, canceled 2026-10-16).
UPDATE memberships SET cancel_at = '2026-10-26T06:20:21+00:00', updated_at = now() WHERE stripe_subscription_id = 'sub_1UJoyCLZWuErjYPkmU4Ugvtv' AND cancel_at IS NULL;
