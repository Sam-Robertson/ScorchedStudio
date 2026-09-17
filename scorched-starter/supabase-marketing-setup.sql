-- Run this in the Supabase SQL editor to set up first-party email and SMS
-- marketing. Follows the same "one setup file per feature" pattern as
-- supabase-courses-setup.sql and supabase-customers-setup.sql.
--
-- Two things here differ from the rest of the schema on purpose:
--
-- 1. RLS is enabled on every table with zero policies. No other table in this
--    project enables it. Marketing data is consent evidence and phone numbers,
--    so nothing anon or authenticated should ever read it. The service role
--    bypasses RLS, and every read and write goes through server code using
--    getSupabase(), so "enabled with no policies" is exactly the intent:
--    deny everyone, allow the service role.
--
-- 2. Status and source columns are TEXT + CHECK rather than Postgres enums.
--    Drip sequences and abandoned-booking reminders are planned later and will
--    need new `source` values. Editing a CHECK is far easier than ALTER TYPE.

CREATE EXTENSION IF NOT EXISTS citext;

-- ---------------------------------------------------------------------------
-- subscribers: the single source of truth for both channels.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscribers (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email              CITEXT      UNIQUE,
  -- E.164 only. lib/marketing/phone.ts normalizes before anything is written,
  -- and the CHECK keeps a hand-run SQL insert from smuggling in a local format.
  phone              TEXT        UNIQUE,
  first_name         TEXT,
  last_name          TEXT,
  email_status       TEXT        NOT NULL DEFAULT 'none'
    CHECK (email_status IN ('subscribed', 'unsubscribed', 'bounced', 'complained', 'none')),
  sms_status         TEXT        NOT NULL DEFAULT 'none'
    CHECK (sms_status IN ('subscribed', 'unsubscribed', 'invalid', 'none')),
  -- Random and unguessable: this is the whole authentication for one-click
  -- unsubscribe, which by design has no login.
  unsubscribe_token  TEXT        NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  tags               TEXT[]      NOT NULL DEFAULT '{}',
  -- Drives the "new contact" test for Sendblue rate limiting: someone with no
  -- conversation in either direction in the last 30 days counts as new.
  last_sms_contact_at TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT subscribers_contactable CHECK (email IS NOT NULL OR phone IS NOT NULL),
  CONSTRAINT subscribers_phone_e164 CHECK (phone IS NULL OR phone ~ '^\+[1-9]\d{1,14}$')
);

CREATE INDEX IF NOT EXISTS subscribers_email_status_idx ON subscribers (email_status);
CREATE INDEX IF NOT EXISTS subscribers_sms_status_idx   ON subscribers (sms_status);
CREATE INDEX IF NOT EXISTS subscribers_tags_idx         ON subscribers USING GIN (tags);

-- ---------------------------------------------------------------------------
-- consent_events: append only. This is the record that proves consent if a
-- carrier or regulator ever asks, so nothing updates or deletes rows here.
-- The revoke-on-update/delete rules below enforce that at the database level
-- rather than trusting every future caller to behave.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS consent_events (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id UUID        NOT NULL REFERENCES subscribers (id) ON DELETE CASCADE,
  channel       TEXT        NOT NULL CHECK (channel IN ('email', 'sms')),
  action        TEXT        NOT NULL CHECK (action IN ('opt_in', 'opt_out')),
  source        TEXT        NOT NULL CHECK (source IN (
                  'waiver', 'booking', 'footer_form', 'popup', 'import_legacy_sms',
                  'import_legacy_newsletter', 'inbound_keyword', 'unsubscribe_link', 'admin'
                )),
  -- The exact checkbox wording shown at the time. Copy changes over the years;
  -- the log has to reflect what this person actually saw.
  consent_text  TEXT        NOT NULL,
  ip            TEXT,
  user_agent    TEXT,
  -- For imports this is the original opt-in date, which is usually earlier
  -- than created_at.
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS consent_events_subscriber_idx ON consent_events (subscriber_id, occurred_at DESC);

-- ---------------------------------------------------------------------------
-- campaigns
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS campaigns (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  channel       TEXT        NOT NULL CHECK (channel IN ('email', 'sms')),
  name          TEXT        NOT NULL,
  subject       TEXT,
  body          TEXT        NOT NULL,
  media_url     TEXT,
  -- Tag filter, e.g. {"tags": ["course-interest"], "match": "any"}. jsonb so
  -- richer segment rules can be added without a migration.
  segment       JSONB       NOT NULL DEFAULT '{}'::jsonb,
  status        TEXT        NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'sending', 'paused', 'sent', 'cancelled')),
  scheduled_for TIMESTAMPTZ,
  created_by    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- An email campaign without a subject line is not sendable.
  CONSTRAINT campaigns_email_needs_subject
    CHECK (channel <> 'email' OR subject IS NOT NULL),
  -- media_url is an SMS (MMS) concept only.
  CONSTRAINT campaigns_media_is_sms_only
    CHECK (media_url IS NULL OR channel = 'sms')
);

CREATE INDEX IF NOT EXISTS campaigns_status_idx ON campaigns (status, scheduled_for);

-- ---------------------------------------------------------------------------
-- sms_queue: one row per recipient per campaign. The worker drains this a few
-- at a time because Sendblue's Blue Ocean plan caps how many people you may
-- start a conversation with per hour and per day.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sms_queue (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id             UUID        NOT NULL REFERENCES campaigns (id) ON DELETE CASCADE,
  subscriber_id           UUID        NOT NULL REFERENCES subscribers (id) ON DELETE CASCADE,
  to_number               TEXT        NOT NULL,
  body                    TEXT        NOT NULL,
  status                  TEXT        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sending', 'sent', 'delivered', 'failed', 'skipped')),
  -- Computed at enqueue from last_sms_contact_at. Stored rather than derived so
  -- the hourly and daily budget can be counted with a plain aggregate, and so a
  -- reply arriving mid-campaign cannot retroactively change what was budgeted.
  is_new_contact          BOOLEAN     NOT NULL DEFAULT true,
  provider_message_handle TEXT,
  error_code              TEXT,
  error_message           TEXT,
  attempts                INT         NOT NULL DEFAULT 0,
  send_after              TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- The real double-send guarantee. Even if two workers raced past the
  -- conditional claim, this makes a second row for the same person on the same
  -- campaign impossible to insert.
  CONSTRAINT sms_queue_one_per_subscriber UNIQUE (campaign_id, subscriber_id)
);

-- The worker's hot path: pending rows that are due, oldest first.
CREATE INDEX IF NOT EXISTS sms_queue_claimable_idx
  ON sms_queue (status, send_after)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS sms_queue_campaign_idx ON sms_queue (campaign_id, status);
-- Status callbacks arrive keyed only by the provider handle.
CREATE INDEX IF NOT EXISTS sms_queue_handle_idx
  ON sms_queue (provider_message_handle)
  WHERE provider_message_handle IS NOT NULL;
-- Counting new-contact sends in the trailing hour and day.
CREATE INDEX IF NOT EXISTS sms_queue_new_contact_sent_idx
  ON sms_queue (updated_at)
  WHERE is_new_contact AND status IN ('sending', 'sent', 'delivered');

-- ---------------------------------------------------------------------------
-- sms_messages: every inbound and outbound message the webhooks tell us about.
-- Kept separate from sms_queue because inbound replies have no queue row, and
-- because this is the raw provider log we would reach for when reconciling.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sms_messages (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_message_handle TEXT        UNIQUE,
  direction               TEXT        NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  from_number             TEXT,
  to_number               TEXT,
  content                 TEXT,
  media_url               TEXT,
  -- Sendblue reports which transport actually carried the message.
  service                 TEXT        CHECK (service IS NULL OR service IN ('iMessage', 'SMS', 'RCS')),
  status                  TEXT,
  error_code              TEXT,
  error_message           TEXT,
  raw_payload             JSONB,
  occurred_at             TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sms_messages_from_idx ON sms_messages (from_number, created_at DESC);
CREATE INDEX IF NOT EXISTS sms_messages_direction_idx ON sms_messages (direction, created_at DESC);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION marketing_touch_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS subscribers_touch   ON subscribers;
DROP TRIGGER IF EXISTS campaigns_touch     ON campaigns;
DROP TRIGGER IF EXISTS sms_queue_touch     ON sms_queue;
DROP TRIGGER IF EXISTS sms_messages_touch  ON sms_messages;

CREATE TRIGGER subscribers_touch  BEFORE UPDATE ON subscribers
  FOR EACH ROW EXECUTE FUNCTION marketing_touch_updated_at();
CREATE TRIGGER campaigns_touch    BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION marketing_touch_updated_at();
CREATE TRIGGER sms_queue_touch    BEFORE UPDATE ON sms_queue
  FOR EACH ROW EXECUTE FUNCTION marketing_touch_updated_at();
CREATE TRIGGER sms_messages_touch BEFORE UPDATE ON sms_messages
  FOR EACH ROW EXECUTE FUNCTION marketing_touch_updated_at();

-- ---------------------------------------------------------------------------
-- consent_events is append only, enforced here rather than by convention.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION consent_events_is_append_only() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'consent_events is append only: % is not permitted', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS consent_events_no_update ON consent_events;
DROP TRIGGER IF EXISTS consent_events_no_delete ON consent_events;

CREATE TRIGGER consent_events_no_update BEFORE UPDATE ON consent_events
  FOR EACH ROW EXECUTE FUNCTION consent_events_is_append_only();
-- Note: this deliberately does not fire for the ON DELETE CASCADE from
-- subscribers, because a cascade deletes the parent row first. Deleting a
-- subscriber is an admin action that is not exposed in the UI.
CREATE TRIGGER consent_events_no_delete BEFORE DELETE ON consent_events
  FOR EACH ROW EXECUTE FUNCTION consent_events_is_append_only();

-- ---------------------------------------------------------------------------
-- claim_sms_queue_batch: the worker's atomic claim.
--
-- FOR UPDATE SKIP LOCKED means two overlapping cron runs select disjoint rows,
-- so the same queue row can never be handed to two senders. The status flip to
-- 'sending' happens inside the same statement as the select.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION claim_sms_queue_batch(
  p_limit            INT,
  p_allow_new_contact BOOLEAN,
  p_campaign_id      UUID DEFAULT NULL
) RETURNS SETOF sms_queue
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  UPDATE sms_queue q
     SET status = 'sending',
         attempts = q.attempts + 1
   WHERE q.id IN (
     SELECT c.id
       FROM sms_queue c
       JOIN campaigns ca ON ca.id = c.campaign_id
      WHERE c.status = 'pending'
        AND c.send_after <= now()
        -- A paused or cancelled campaign stops feeding the worker immediately.
        AND ca.status = 'sending'
        AND (p_campaign_id IS NULL OR c.campaign_id = p_campaign_id)
        AND (p_allow_new_contact OR NOT c.is_new_contact)
      ORDER BY c.send_after, c.created_at
      LIMIT p_limit
      FOR UPDATE SKIP LOCKED
   )
  RETURNING q.*;
END;
$$;

-- ---------------------------------------------------------------------------
-- RLS: on for every table, with no policies. Service role only.
-- ---------------------------------------------------------------------------
ALTER TABLE subscribers    ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns      ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_queue      ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_messages   ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Backfill the existing footer list.
--
-- newsletter_subscribers is the table the current footer form writes to. It is
-- left in place and untouched; this only copies its rows forward so the new
-- system starts with the list Sam already has.
--
-- These rows carry no record of what wording anyone agreed to, because the old
-- form had no checkbox and no consent log. consent_text says exactly that
-- rather than inventing wording they never saw, and occurred_at is the old
-- created_at so the original opt-in date survives.
-- ---------------------------------------------------------------------------
INSERT INTO subscribers (email, email_status, tags, created_at)
SELECT n.email, 'subscribed', ARRAY['legacy-newsletter'], n.created_at
  FROM newsletter_subscribers n
 WHERE n.email IS NOT NULL
ON CONFLICT (email) DO NOTHING;

INSERT INTO consent_events (subscriber_id, channel, action, source, consent_text, occurred_at)
SELECT s.id,
       'email',
       'opt_in',
       'import_legacy_newsletter',
       'Backfilled from the newsletter_subscribers table, which the site footer wrote to before the marketing system existed. No checkbox wording was shown or recorded at the time; the signup form was an email field labeled as a newsletter subscription.',
       n.created_at
  FROM newsletter_subscribers n
  JOIN subscribers s ON s.email = n.email
 WHERE NOT EXISTS (
   SELECT 1 FROM consent_events e
    WHERE e.subscriber_id = s.id
      AND e.source = 'import_legacy_newsletter'
 );
