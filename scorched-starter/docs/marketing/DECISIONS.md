# Marketing build decisions

One line per decision: what was decided and why. Sam reviews this instead of
answering questions mid-build.

## Provider API drift (spec vs. current docs)

- Sendblue base URL: spec and docs both say `https://api.sendblue.com`; Sam supplied `https://api.sendblue.co`. Probed both: identical auth behaviour, same API, so `.co` is an alias. Defaulted to the documented `.com`, exposed as `SENDBLUE_BASE_URL` so either works.
- Sendblue credentials Sam supplied were verified live with a read-only `GET /api/account/webhooks` (200 OK, no webhooks registered yet). No message was sent.
- Sendblue message statuses are 8, not the 5 the spec lists: `REGISTERED`, `PENDING`, `DECLINED`, `QUEUED`, `ACCEPTED`, `SENT`, `DELIVERED`, `ERROR`. Mapped all 8 onto queue statuses in `lib/marketing/sms-status.ts`.
- Sendblue documents an extra hard limit the spec does not mention: **150 consecutive outbound messages per line without a reply**, which Sendblue says cannot be disabled (carrier compliance). This matters a lot for the legacy re-intro campaign, which is by definition all cold contacts. Added `SMS_MAX_CONSECUTIVE_NO_REPLY` as config and the worker enforces it. Flagged in SETUP.md because no config value can raise it.
- Sendblue's daily new-contact window resets at 3am ET, not on a rolling 24 hours as the spec assumes. The worker counts a trailing 24 hours anyway, which is the stricter of the two and therefore always safe.
- The docs describe the burst limit as rejecting over-rate requests, and do not confirm the spec's "queue cap of 1,500 accepted messages". Kept `SMS_QUEUE_CAP` as config since the spec asked for it, but the worker's real protection is its own pacing, not that number.
- Resend has renamed audiences to **segments**. `POST /contacts` is top level and takes a `segments` array; broadcasts take `segment_id`. Kept the env var name `RESEND_AUDIENCE_ID` because the spec fixed the name, and documented that it now holds a segment id.
- **Not using Resend Broadcasts.** Broadcasts send to a whole segment and cannot filter by tag, but every campaign here is tag-segmented out of Supabase. Used the batch send endpoint (100 messages per request) with our own `List-Unsubscribe` and `List-Unsubscribe-Post` headers instead, which is the fallback the spec anticipated. This also keeps Supabase unambiguously the source of truth.
- Resend webhooks are Svix-signed (`svix-id`, `svix-timestamp`, `svix-signature`), not a bare HMAC header. Verified with the `svix` package against the raw request body.

## Codebase fit

- Migration is a root-level `supabase-marketing-setup.sql`, matching every other feature here. There is no migrations directory and no local Supabase, so it is **not applied**. Running it is step one of SETUP.md.
- Nothing was run against the database. The only credentials in `.env` are production, so applying anything locally would have meant touching production.
- RLS is enabled with zero policies on all five new tables. No other table in this project uses RLS at all, so this is a deliberate divergence: these tables hold phone numbers and consent evidence, and "enabled, no policies" denies anon and authenticated while the service role bypasses it.
- Status and source columns are `TEXT` + `CHECK`, not Postgres enums, because the out-of-scope roadmap (drip sequences, abandoned-booking reminders) will need new `source` values and editing a CHECK beats `ALTER TYPE`.
- `consent_events` is made append-only by a trigger that raises on UPDATE and DELETE, rather than by convention alone.
- The footer signup form already existed (`components/FooterShell.tsx` posting to `/api/newsletter` into `newsletter_subscribers`). Repointed that route at `recordConsent` and added the two checkboxes rather than building a second form. `newsletter_subscribers` is left in place untouched; the migration copies its rows into `subscribers`.
- Backfilled newsletter rows get `source = 'import_legacy_newsletter'` (a value added beyond the spec's list) and a `consent_text` that states plainly that no wording was recorded at the time, rather than inventing copy those people never saw. Original `created_at` becomes `occurred_at`.
- All logic lives in `lib/marketing/*.ts` with routes as thin wrappers, because the test runner only globs `lib/*.test.ts` and `lib/**/*.test.ts`; anything under `app/` cannot be tested by the project's own runner.
- New record types were appended to `lib/supabase.ts` alongside the existing ones rather than split into a new types file.
- Used pnpm, since `pnpm-lock.yaml` is newer than `package-lock.json`.
- No em dashes in anything written here, per Sam's standing preference, even though the surrounding code uses them heavily.

## Deliberate limits on what the tests prove

- The no-double-send test injects the claim primitive and proves the budgeting and dedup logic is correct given an atomic claim. It does **not** prove Postgres `FOR UPDATE SKIP LOCKED` semantics, which cannot be exercised without a database. The real guarantee is the `UNIQUE (campaign_id, subscriber_id)` constraint plus the conditional claim in `claim_sms_queue_batch`. A green test here means less than it looks like.

## Phase 2 capture points

- Booking has two payment paths (`reserve` for gift cards, `create-payment-intent` for cards), so consent is recorded in both. It is written when the form is submitted with a box ticked, not after payment clears: that is the moment the person actually agreed, and threading opt-in flags through Stripe metadata to the confirm step would add a failure mode for no benefit. Someone who ticks the box and then abandons checkout is opted in, which is correct, since they asked to be.
- The waiver and both booking routes call `recordConsentSafe`, which logs and swallows. A marketing write must never turn a signed waiver or a paid booking into a 500.
- The footer form requires at least one box ticked. Both start unchecked per spec, and a signup with neither ticked would subscribe nobody, so the form says so instead of silently accepting it.
- The footer only asks for a phone number once the SMS box is ticked, so the common email-only case stays a single field.
- `/api/newsletter` still writes `newsletter_subscribers` as well as calling `recordConsent`. Nothing else has been repointed at `subscribers` yet, so keeping both in step costs one insert and avoids a one-way migration.
- Consent text stored is only the wording for the boxes actually ticked, so the log never claims someone read an SMS disclosure they did not see.
- There is no `/terms` page on this site, so the SMS messaging terms live in the privacy policy under `#sms-terms` and both links beside the checkbox point into it. Privacy sections 5 through 10 were renumbered to 6 through 11 to make room.
- Added Sendblue to the privacy policy's list of service providers, alongside the explicit statement that mobile opt-in data is never shared for marketing, which is the line carriers look for.
- `recordConsent` merges two subscriber rows when a submission matches one by email and a different one by phone. Email and phone are independently unique, so without a merge that submission would fail on a unique violation. The older row survives and consent history moves onto it before the loser is deleted.

## Phase 3 email

- `/unsubscribe/[token]` is a route handler, not a page. App Router pages serve GET only, and RFC 8058 one-click needs GET and POST on the same URL.
- An unknown unsubscribe token renders the same confirmation as a real one. The token is the only credential, so the response must not reveal whether it exists. A second click is also a success, since mail clients retry the one-click POST.
- Bounces and complaints update `email_status` but do **not** write a `consent_events` row. That table records what a person chose; a bounce is the provider reporting a dead address, which is a different kind of fact.
- The template renders once per recipient rather than once per campaign, because the unsubscribe link carries that person's token and must never be shared.
- Marketing email sends from `RESEND_MARKETING_FROM` on the `news.` subdomain, entirely separate from the `bookings@scorchedstudio.com` used by waiver and booking mail, so a spam complaint on a campaign cannot hurt transactional delivery.
- Pure helpers (`chunk`, `unsubscribeHeaders`, segment matching) live in their own modules away from anything importing through the `@/` alias, because the test runner cannot resolve that alias.

## Phase 4 SMS

- **Found and fixed a real concurrency bug while testing.** The atomic row claim stops the same person being texted twice, but it does not stop two overlapping cron runs each reading "0 new contacts sent this hour" before either claims, and then each spending the full hourly allowance. That doubles the real send rate and earns 429s. Added `marketing_worker_locks` plus `acquire_marketing_worker_lock`, a single-runner lease taken by one conditional UPDATE. The lease expires on its own so a crashed run does not wedge the queue. Both failure modes now have a test.
- Quiet hours are checked before the lease is taken, so a night run does not hold a lease it never needed, and nothing is claimed at all, which keeps rows out of `sending` overnight.
- The worker claims established contacts first, then spends new-contact budget. Established contacts cost nothing from the capped pool, so draining them first gets more out per run.
- `isStillSubscribed` fails closed. If the consent status cannot be read, nothing is sent. A marketing text after an opt-out is the single most damaging thing this system could do.
- Consent is re-checked per message, not per batch, because someone can text STOP between the claim and the send.
- Status callbacks use `shouldAdvanceStatus` so an out-of-order callback cannot drag a row backwards. Nothing overwrites `delivered`, and nothing revives a `skipped` row.
- Sendblue echoes the registered secret in `sb-signing-secret` rather than signing a digest of the body, so the webhook does a constant-time equality check rather than the HMAC verification the Square webhook uses.
- The webhook logs and swallows handler errors after persisting, returning 2xx regardless. A 500 makes Sendblue retry the whole payload, and a retry storm is worse than one dropped forward.
- Inbound messages are upserted on `provider_message_handle`, so a Sendblue retry does not create duplicate log rows.
- Keyword matching requires the whole message to be the keyword. "Can I stop by on Saturday?" is a customer question, and treating it as an opt-out would silently drop the conversation. Tested explicitly.
- Used plain `fetch` rather than the `sendblue` npm SDK: the surface needed is three endpoints, and fetch keeps the request shape next to the docs it was written from.
- The `/api/cron/sms-worker` schedule (`*/5 * * * *`) needs a Vercel plan that allows sub-daily crons. Flagged in SETUP.md.

## Merge bug found in review (fixed)

- `mergeSubscribers` as first written could never have succeeded. It did `UPDATE consent_events SET subscriber_id`, which the append-only trigger rejects, and then deleted the losing subscriber, whose `ON DELETE CASCADE` fires the child row's BEFORE DELETE trigger too. My original comment claiming a cascade skips child triggers was simply wrong about Postgres. Every merge would have thrown: silently swallowed on the waiver and booking paths, a 500 on the footer.
- Fixed by moving the whole merge into a `merge_subscribers` plpgsql function. It runs in one transaction, so the moves and the delete either all land or none do, and it sets a transaction-local `marketing.merging` flag that the append-only trigger honours. Even mid-merge only `subscriber_id` may change: channel, action, source, wording and timestamps stay frozen, so the consent record is still tamper-proof.
- The merge also deletes the losing row's queue entries for any campaign the survivor is already queued on, since `UNIQUE (campaign_id, subscriber_id)` forbids both. Dropping the duplicate is correct, it is the same person either way.
- `mergeEmailStatus` and `mergeSmsStatus` in `consent-rules.ts` are now the documented mirror of the SQL's CASE expressions, kept because the tests pin the intended semantics.

## Email stats without Broadcasts

- Choosing batch send over Broadcasts cost the per-campaign stats endpoint. Rather than ship a campaign page with three of five numbers blank, each batch send is tagged `campaign_id`, Resend echoes tags on every webhook, and an `email_events` table records them. Opens and clicks are counted per distinct recipient, since one person opening six times is one open to anyone reading the number.
- Unsubscribes are counted from `consent_events`, not from Resend, because the unsubscribe link is ours.

## Enqueue

- `enqueueSmsCampaign` is the only place a campaign becomes sendable. It applies `withStopNotice` and computes `is_new_contact` once, freezing the body into each queue row so editing a draft mid-drip cannot change what half the list already received.
- Enqueue flips the campaign to `sending`, which is what the worker's claim filters on. Pause and cancel flip it back and the worker stops on its next run with no other coordination.
- Enqueue is idempotent via `ON CONFLICT DO NOTHING` on the unique pair, so a retry after a partial failure adds only what is missing.
