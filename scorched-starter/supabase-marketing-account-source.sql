-- Run this in the Supabase SQL editor after supabase-marketing-setup.sql.
--
-- Adds 'account_settings' to the sources a consent event may come from, for the
-- marketing preferences on the signed-in /account page.
--
-- The source column is a CHECK rather than a Postgres enum precisely so that
-- adding a value is this small. consent_events is append only and its existing
-- rows are untouched: this widens what future rows may say, nothing else.
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
    'import_legacy_sms',
    'import_legacy_newsletter',
    'inbound_keyword',
    'unsubscribe_link',
    'admin'
  )
);
