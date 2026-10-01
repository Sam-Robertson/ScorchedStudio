-- Run this in the Supabase SQL editor after supabase-marketing-setup.sql and
-- supabase-marketing-account-source.sql.
--
-- Adds 'vip_signup' to the sources a consent event may come from, for the
-- sign-up form on /scorched-vip.
--
-- The source column is a CHECK rather than a Postgres enum precisely so that
-- adding a value is this small. consent_events is append only and its existing
-- rows are untouched: this widens what future rows may say, nothing else.
--
-- This list replaces the one in supabase-marketing-account-source.sql. Do not
-- re-run that file after this one: it would put back the shorter list.
--
-- Safe to re-run.

ALTER TABLE consent_events DROP CONSTRAINT IF EXISTS consent_events_source_check;

ALTER TABLE consent_events ADD CONSTRAINT consent_events_source_check CHECK (
  source IN (
    'waiver',
    'booking',
    'footer_form',
    'popup',
    'account_settings',
    'vip_signup',
    'import_legacy_sms',
    'import_legacy_newsletter',
    'inbound_keyword',
    'unsubscribe_link',
    'admin'
  )
);
