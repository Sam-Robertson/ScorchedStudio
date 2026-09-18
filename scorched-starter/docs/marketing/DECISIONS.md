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

## Phase 5 legacy import

- The script requires **both** exports and refuses to run with only the active list. Without the opt-out list, people who left the old service would be imported as subscribed and texted again, which is the worst outcome available.
- Opt-outs are applied first and the active list can never overwrite them, in the file merge and again against existing rows: an opt-out already in our database always wins.
- Dry run is the default. `--apply` is required to write, matching the webhook script, because the only Supabase credentials on this machine are production.
- The CSV reader is hand-written rather than a dependency: one throwaway import, and the quoting rules that matter are short. It handles CRLF and a UTF-8 BOM, both near-universal in spreadsheet exports, and a BOM would otherwise corrupt the first header name and break detection entirely.
- Column detection prefers an exact header match over a partial one, so a column called `phone` beats `phone_carrier_lookup`.
- An unparseable opt-in date returns null and the import falls back to the import time, rather than recording a date that never happened. Spreadsheet serial numbers are rejected by a plausible-year check.
- `NoPhoneColumnError` is declared with an explicit field rather than a constructor parameter property, because the test runner uses node's strip-only TypeScript mode which rejects those.
- The Sendblue bulk contact endpoint takes `phone` with camelCase names, while the single-contact endpoint takes `number` in snake_case. Easy to get wrong; noted at the call site.
- Contacts go up in batches of 100 with a pause between calls, since the contacts API allows 100 requests per 10 seconds per account.

## Phase 6 admin UI

- Lives at `/admin/marketing` behind the existing `requireAdmin` session, added to the admin nav alongside Careers.
- The confirm dialog states the channel and a live recipient count from the same query that decides who actually receives the message, not a cached number.
- When `MARKETING_LIVE` is off, the UI says so explicitly after a send rather than reporting success, so a suppressed run is never mistaken for a real one.
- Campaign content is locked once the status leaves draft or scheduled. Half the list already has the old wording by then, and editing would make the two halves differ.
- Only a draft can be deleted; anything that has started must be cancelled, so its queue and stats survive.
- Pause and cancel need no special handling: the worker's claim filters on `campaigns.status = 'sending'`, so flipping the status stops it on the next run.
- The composer shows the exact final message including the auto-appended STOP notice, and counts characters against that rather than the raw body, since the notice is what pushes a message over 160.
- SMS opt-outs on the campaign page are attributed by time (an opt-out within 48 hours from someone the campaign was sent to). The provider gives no campaign attribution, so this is an estimate and is labelled as one.

## Review pass (four issues found and fixed)

- **A suppressed SMS run used to poison the rate limiter.** With `MARKETING_LIVE` off the provider returns `ok`, and the worker treated that as a send, stamping `last_sms_contact_at` on every recipient. For the next 30 days they would all count as established contacts, so the real campaign afterwards would compute `is_new_contact: false` for the whole list, skip the new-contact cap entirely, and fire at full burst into a genuinely cold list. That is the exact 429 storm the design exists to prevent, and SETUP.md actively tells Sam to do a suppressed run first. `suppressed` is now threaded through `markSent`, so a suppressed send marks nobody as contacted and writes no `sms_messages` row (which also feeds the consecutive-no-reply count). Two tests pin it.
- **Scheduled campaigns never fired.** `scheduled_for` was stored and indexed, but nothing moved a campaign from `scheduled` to sending: the worker only claims rows whose campaign is already `sending`, and email only went out from the admin route. Added `startDueCampaigns`, run at the top of the same 5 minute cron, so an SMS campaign that becomes due is enqueued and picked up in the same run.
- **A suppressed email campaign became permanently unsendable.** The send route marked it `sent` regardless, and only a draft, scheduled or paused campaign can be started. It now leaves the status alone when the run was suppressed.
- **An SMS-only footer signup wrote to the email marketing table.** The `newsletter_subscribers` insert happened before the opt-in flags were read, so someone ticking only the SMS box landed on the email list having explicitly declined email. Now gated on `emailOptIn`.
- **The consent backfill was not safe to re-run in the way that mattered.** SETUP.md says the migration can be re-run, and the `subscribers` insert is `ON CONFLICT DO NOTHING`, but the consent insert would manufacture a fresh `opt_in` row for anyone who had since unsubscribed, in the append-only table whose whole purpose is being the evidence that they opted in. Now restricted to rows still `subscribed`.
- Smaller: the admin subscriber search matched `phone` literally, but the column is E.164, so a typed "801-361" found nothing; it now searches on digits. And `sent` and `failed` had equal rank in `shouldAdvanceStatus`, letting two out-of-order callbacks toggle a row indefinitely; `failed` now outranks `sent`, and `delivered` still outranks both.

## Provider swap: Sendblue to Telnyx

- **Why.** Sendblue's Blue Ocean limits (50 new contacts a day, 15 an hour, 150 consecutive outbound without a reply, and a cap on messages to a non-replying contact) are sensible guards for two-way conversational messaging and unworkable for one-way broadcast. A registered 10DLC long code has none of them. Sendblue stays in the tree, wired and tested, because it is genuinely better at two-way iMessage if that is ever wanted.
- Provider is chosen by `SMS_PROVIDER` through `lib/marketing/sms-provider-registry.ts`, defaulting to Telnyx. The `SmsProvider` interface was already the seam, so nothing above it changed shape.
- Telnyx credentials Sam supplied were verified with read-only `GET` calls only. They turned up that the messaging profile and number already exist: profile `Main` (`4001a0b1-...`) with its webhook already pointed at `/api/webhooks/telnyx`, and `+18015155172`, a Utah long code, active and assigned to that profile. All three are now in `.env`.
- **The 10DLC API returns 403 `10038 Feature not permitted at this account level`.** Brand and campaign registration cannot start until the Telnyx account is upgraded. Until the campaign is approved, carriers filter this traffic, so this is the real gate on going live. Flagged at the top of SETUP.md's step 4.

## Telnyx specifics found in the docs

- Send is `POST https://api.telnyx.com/v2/messages` with Bearer auth. Status is reported **per recipient** inside `data.payload.to[0].status`, not at the top level as Sendblue did, and the sender on inbound is `data.payload.from.phone_number`. `mapTelnyxStatus` sits alongside `mapSendblueStatus` rather than one being generalised, because the vocabularies genuinely differ.
- `delivery_unconfirmed` maps to `sent`, not `failed`. The message did leave Telnyx; calling it a failure would under-report delivery and invite a resend to someone who already got it.
- Used plain `fetch` for sending but the `telnyx` SDK is **not** used for webhook verification either: its `webhooks.unwrap()` reads `TELNYX_PUBLIC_KEY` from the environment itself and documents no timestamp tolerance, and rejecting stale timestamps is the half that stops a captured webhook being replayed. Both halves are in `lib/marketing/telnyx-webhook.ts` where they are unit testable with no network and no env.
- Signature is Ed25519 over `{timestamp}|{raw body}`, base64. The public key is base64 of 32 raw bytes, which node will not import directly, so it is wrapped in the fixed RFC 8410 SPKI prefix. Tolerance is 5 minutes, matching what Stripe and Svix use; Telnyx publishes no figure. Skew is checked in **both** directions, since accepting future timestamps would leave one captured webhook replayable indefinitely.
- Telnyx auto-responds to STOP, START and HELP itself and maintains its own opt-out list at the **messaging profile** level, so one STOP blocks every number on the profile. The inbound webhook still arrives, carrying `autoresponse_type`, which is mapped onto the existing `InboundMessage.optedOut` hook. That flag is treated as authoritative because it is what actually blocks delivery.
- Telnyx's keyword list (`stop, stopall, stop all, unsubscribe, cancel, end, quit`) is close to but not identical to ours: we also match `revoke` and `opt out`, they also match `stop all`. Ours stays wider, and theirs wins where it fires, so the two can only disagree in the direction of unsubscribing someone we would have kept.
- Error `40300` "Blocked due to STOP message" is returned when sending to an opted-out number. Handled in the provider as a distinct `optedOut` outcome rather than a failure, so the worker can mark the queue row `skipped` and correct the subscriber to `unsubscribed` with a consent event. Retrying it would be pointless, and succeeding would be a compliance problem.

## Worker: throughput instead of quotas

- The new-contact hourly and daily budgeting and the 150-consecutive stop are gone from the active path, along with the two Supabase queries that fed them. `computeBudget` and its tests remain in `sms-budget.ts` for the Sendblue path; `WorkerSettings` now takes `maxThisRun` plus an optional `blockedReason`, so a provider with a ceiling of its own can still stop the run without that logic living in the core.
- **`SMS_MAX_PER_MINUTE` is a sustained rate, not a per-run figure.** The cron fires every 5 minutes, so one run may send `maxPerMinute * 5`. Treating it as per-run would have delivered a fifth of what the setting appears to promise and made every completion estimate 5x wrong. `maxMessagesPerRun()` does that arithmetic and the admin estimate uses the same function.
- The completion estimate accounts for quiet hours: with the default 20 to 9 window only 11 hours a day are sendable, and ignoring that would overstate throughput by more than double.
- Default is 12 a minute, chosen low on purpose. A newly approved 10DLC campaign gets a low carrier-assigned throughput, and exceeding it means messages are filtered rather than queued. SETUP.md says to raise it once the assigned rate is known.
- `claim_sms_queue_batch` keeps its `p_allow_new_contact` parameter and is now always passed `true`. The migration is left alone rather than edited, since Sam may already have run it.
- Kept: quiet hours, the single-runner lease, atomic row claiming, backoff on 429 and 5xx, the per-send subscription recheck, scheduled campaign firing, and the rule that a suppressed send never stamps `last_sms_contact_at`.

## Segments and cost

- Segment counting moved to `lib/marketing/sms-segments.ts` and `message-rules.ts` now delegates to it, so there is one implementation. The old one assumed 160/153 unconditionally, which is wrong twice over: the nine GSM-7 extended characters (`^ { } [ ] ~ \ | €`) each cost **two** septets, so a 159 character message can be two segments; and one character outside GSM-7 forces the whole message to UCS-2 where the limit collapses to 70/67.
- The order is classify-then-count, not count-then-branch. UCS-2 counts UTF-16 code units, which is why a non-BMP emoji correctly costs two.
- The composer names the offending character rather than just warning, because an author cannot otherwise see why a short message became two segments. The most common real cause is a curly apostrophe pasted from a word processor.
- Cost is per segment per recipient, from `SMS_COST_PER_SEGMENT` (default 0.004). It is a planning figure, not a bill: carrier surcharges vary. MMS gets a note that it bills higher and is not covered by the estimate.

## Import script

- The Sendblue bulk-contact and opt-out calls are replaced by `syncContactsToProvider`, which on Telnyx is a no-op with an explanation: there is no contact list, and the opt-out list populates itself from inbound STOP. The function is kept rather than deleted so reviving Sendblue means filling in one branch instead of rediscovering the step.
- Dry run stays the default and `--apply` is still required.
- The re-intro copy is 128 characters, one GSM-7 segment, straight apostrophes only. A multi-part re-introduction from an unrecognised number is exactly what gets reported as spam.

## Review pass on the swap

- **The Sendblue path was silently broken by the throughput switch.** `runSmsWorker` computed `maxThisRun` from `SMS_MAX_PER_MINUTE` and hardcoded `blockedReason: null` for whichever provider was selected, so setting `SMS_PROVIDER=sendblue` would have sent at 12 a minute with no new-contact accounting and no consecutive-outbound stop, straight past the limits that motivated leaving it. `pacingFor()` now branches on the provider and Sendblue keeps its quota accounting. Requirement was that Sendblue stay revivable, and it now actually is rather than only appearing to be.
- **The extracted inbound handling was not testable**, which is what requirement 10 asked for. `sms-inbound.ts` reached Supabase and Resend through the `@/` alias, which the test runner cannot resolve, so the STOP, START and delivery-status cases had no coverage. Split into `sms-inbound-core.ts` (rules, injected dependencies, relative imports) and `sms-inbound.ts` (wiring), matching what `sms-worker-core.ts` already did. Seventeen tests cover the four cases named in the task plus the ones around them.
- Removed the `telnyx` npm dependency after deciding not to use its webhook helper. Leaving an unused package installed invites someone to assume it is load-bearing.
- `estimateThroughputCompletion` returned `Infinity` when the cap or the sending window is zero, which `JSON.stringify` turns into `null` on the way to the admin UI and would have rendered as "0 days", reading as "already finished". Returns -1 now, and the UI says "never at this rate".
- The `suppressed-` message handle prefix is decorative; the `suppressed` flag is what the worker reads. Said so in a comment in both providers so nobody starts depending on the string.

## Sendblue removed entirely

Sam confirmed the two-way iMessage option is not wanted, so the provider is gone rather than dormant. Deleted: `lib/marketing/sendblue.ts`, its parse tests, `sms-provider-registry.ts`, `app/api/webhooks/sendblue/`, and `scripts/register-sendblue-webhooks.ts`.

- `SMS_PROVIDER` is gone with it. With one provider the indirection was a setting that could only be set wrong, so `sms-worker.ts` imports `telnyx` directly.
- `SmsProvider` (the interface) **stays**. It is what made this swap a one-file change instead of a rewrite, and that was worth having.
- Dropped from config: `newContactsPerDay`, `newContactsPerHour`, `burstPerSecond`, `queueCap`, `maxConsecutiveNoReply`, `sendblueBaseUrl`, `smsProviderName`. `SmsLimits` is now three fields.
- Dropped from `sms-budget.ts`: `computeBudget` and `estimateCompletion`, the new-contact quota model. Only the throughput half remains. Its tests were rewritten to match rather than deleted.
- Dropped from the worker: `newContactsSent`, `consecutiveOutboundWithoutReply`, `pacingFor`, and `WorkerSettings.blockedReason`. Nothing set a blocked reason any more, so it was config that could only ever be null.
- **Found a live bug while removing it.** The admin test-send route still set `statusCallback` to `/api/webhooks/sendblue`, a route that no longer exists, so every test send's delivery receipts would have posted to a 404 and the queue row would have sat in `sent` forever. Now points at the Telnyx route.
- `safeEqual` in `telnyx-webhook.ts` was only ever called by the Sendblue route's shared-secret check, so it went too.
- **The privacy policy named Sendblue as the SMS processor.** That is a statement about who receives customer phone numbers, so it now says Telnyx. Worth noting as the kind of thing a provider swap quietly invalidates.
- `is_new_contact` on `sms_queue` and `isNewContact()` are kept. Nothing paces against them now, but the column is in a migration that may already be applied, dropping it would be a destructive schema change, and it is still a useful way to tell a cold list from a warm one.

## 10DLC campaign form: what it actually asks for

Checked against the docs because it is easy to assume the campaign form wants a webhook.

- It does **not** ask for a messaging webhook. Inbound and delivery webhooks are configured on the messaging profile, which is already set to `https://scorchedstudio.com/api/webhooks/telnyx`.
- The optional webhook field visible during registration is for brand and campaign **status** events (approval, rejection, suspension), not messages. Our route acknowledges and ignores unknown event types, so pointing it there is safe but pointless.
- It **does** require Privacy Policy and Terms and Conditions URLs in the call-to-action section. Added both to SETUP.md, pointing at `/privacy` and `/privacy#sms-terms`.
- Opt-in language must cover text messages **only**, and may not mention email or phone calls. Our SMS checkbox copy already satisfies this: it is a separate checkbox from the email one, with its own wording.

## Legal pages audit for 10DLC review (September 17, 2026)

**The checkbox wording matches the registration exactly.** Byte-compared `SMS_CONSENT_TEXT` against the text Sam submitted: identical, no action needed. All three opt-in points render the shared `MarketingOptIns` component, so there is one copy of that string and it cannot drift between forms.

### /terms is now a real page

- Created `app/terms/page.tsx`. `TERMS_PATH` used to be `/privacy#sms-terms`, an anchor inside the privacy policy. The registration tells reviewers there is a terms page, and an anchor is not one. Now `/terms#sms`, which updates all three opt-in forms at once.
- The SMS Terms section carries every CTIA clause: program description, the three opt-in points, frequency varies, rates may apply, STOP with what happens next, START, HELP plus the support email, consent not a condition of purchase, and the carrier liability disclaimer.
- General terms are written only from what the code and site copy actually say. The cancellation paragraph describes real behaviour: `app/api/bookings/manage/[id]/route.ts` issues a full Stripe refund on any pre-session cancellation, and bookings lock once the session starts. No late-cancellation, no-show, or partial-refund rule was invented, because none exists anywhere.

### Privacy policy corrections

- **Removed `robots: "noindex"`.** A policy carriers are told to read should be findable.
- SMS section moved from `id="sms-terms"` to `id="sms"` and rewritten. It now lists exactly what the consent log stores (number, timestamp, source form, IP, and the wording shown), which mirrors the `consent_events` columns rather than describing them loosely.
- Added the second sentence reviewers search for verbatim: "Text messaging originator opt-in data and consent will not be shared with any third parties." The page previously had a paraphrase of the first sentence only.
- **Fixed a false claim.** The cookies section said "We do not use advertising or tracking cookies." The site loads the Meta Pixel from `app/layout.tsx` whenever `NEXT_PUBLIC_META_PIXEL_ID` is set, which it is. That is an advertising tracker and it sets cookies. The section now describes it honestly. Checked `lib/fbq.ts` first: the pixel uses no advanced matching, so no email or phone number reaches Meta, which is why the SMS no-sharing statement is still true. Said so explicitly on the page.
- Processor list now names Vercel (hosting) and Meta (advertising measurement) alongside Stripe, Supabase, Resend, and Telnyx, with a line that none may use the data for their own marketing.
- Retention section now says consent records are kept after opt-out, which is what the system actually does and why: it is the evidence of consent, and it stops an import undoing an opt-out.
- Last updated set to today.

### Judgment calls

- **TODOs are source comments, not visible page text.** A "TODO" printed on a live legal page would undermine the page with the reviewer it exists for. They are marked `TODO(sam)` in the JSX and listed in the handoff.
- **Footer legal links went in the bottom bar, not the Information column.** A Privacy Policy link already lived in the bottom bar next to Admin; adding a second one higher up would have looked like an oversight. Terms now sits beside it.
- **Added `app/robots.ts`.** There was no robots.txt at all. It allows everything except `/admin` and `/api/`, so a future blanket disallow cannot quietly take the legal pages with it.
- **Emphasis markup was splitting required phrases.** "Reply <strong>HELP</strong>" reads correctly to a human but leaves no contiguous "Reply HELP" in the HTML, so an automated reviewer scanning the raw response would score it missing. Whole phrases are wrapped now, verified by curling the production build.

### What the tests do and do not prove

`lib/marketing/legal-pages.test.ts` reads both page sources, reduces them to visible prose, and asserts the required phrases. It cannot render the pages: the project's runner is `node --test` with type stripping, which cannot parse JSX. So it catches deletion, rewording, and typos, which is the failure mode worth catching, but not "does this page compile" (the build covers that). It also asserts the terms page quotes `SMS_CONSENT_TEXT` exactly, so editing the checkbox copy fails the suite until the page and the registration are updated to match.

## SMS worker cron is temporarily daily (September 17, 2026, superseded below)

Vercel rejected the production deploy outright: Hobby accounts allow only daily
cron jobs, and `*/5 * * * *` is more than once a day. Set to `0 16 * * *` (10am
Denver in MDT, 9am in MST, both inside the send window) so the deploy could go
through and `/privacy` and `/terms` could go live for the 10DLC registration,
which is the actual blocker.

**This is a placeholder, not a working configuration.** The per-run budget is
`SMS_MAX_PER_MINUTE * CRON_INTERVAL_MINUTES`, which is 60 messages at the
defaults. One run a day therefore caps the whole system at 60 texts per day, and
scheduled campaigns fire up to 24 hours after their scheduled time. The
completion estimate in the admin UI assumes the 5 minute cadence and will be
badly optimistic while this stands.

Nothing is lost today: the migration is not applied, `MARKETING_LIVE` is false,
and the 10DLC campaign is not approved, so the worker has nothing to do either
way. Resolved by moving the schedule to Supabase pg_cron, see below. Vercel Pro
was considered and deliberately not pursued: the cron no longer needs it, and
nothing else in the project does.

## SMS worker moved to Supabase pg_cron (supersedes the daily placeholder)

The daily Vercel cron above was a placeholder to unblock a deploy. It is gone.
`vercel.json` no longer schedules the SMS worker at all, and
`supabase-sms-cron-setup.sql` schedules it from Postgres every 5 minutes.

**Why not just pay for Vercel Pro.** That would work, but it puts a recurring
subscription on the critical path of a feature the project can already run
without one. The project already depends on Supabase for everything else the
worker touches, so pg_cron adds no new vendor, no new failure mode that is not
already fatal, and no new secret to rotate beyond the one the route already
checks. Vercel Pro is still the right call if Sam wants it for other reasons;
this just stops the cron from being the reason.

**Why not an external scheduler** (cron-job.org, GitHub Actions). It works, but
it is a third system holding a production secret, with its own account, its own
uptime, and its own place to look when sends stop. pg_cron lives next to the
data the worker reads.

Decisions inside the migration:

- **The bearer token is a Vault secret, never SQL.** `cron.job.command` is
  readable by anyone with database access, so the token cannot be inlined there.
  `public.invoke_sms_worker()` reads it from `vault.decrypted_secrets` at call
  time, which also means rotating it is an update to one row rather than an edit
  and re-run of this file.
- **The URL is in Vault too**, even though it is not secret. It keeps the
  migration byte-identical across environments: a staging project points
  somewhere else by changing a row, not by editing SQL.
- **Wrapped in a function rather than inlining `net.http_get` in the schedule.**
  The command text stays free of anything sensitive, the call can be tested by
  hand with one select, and the request shape can change without touching the
  schedule.
- **`SECURITY DEFINER` with a pinned `search_path`.** Without the pin, a caller
  could shadow `vault` or `net` with their own schema and capture the token.
  Execute is revoked from `anon` and `authenticated`, since otherwise any
  signed-in user could trigger a send cycle through PostgREST.
- **The function raises if either secret is missing** rather than firing an
  unauthenticated request. A 401 would still be recorded by pg_cron as a
  successful run, because pg_cron only knows whether the SQL executed, so the
  failure has to be made loud at the point it happens.
- **Re-running the file is safe.** It unschedules before scheduling, so it
  cannot leave two jobs running and double the send rate.
- **Added a `sms_worker_cron_health` view.** pg_cron records whether the SQL ran
  and pg_net separately records what the HTTP call returned; a job can report
  success while every request 401s. The view joins both halves, which is the
  only way to tell a working schedule from one that only looks like one.

`CRON_INTERVAL_MINUTES` in `sms-budget.ts` is 5 and is correct again. It was
quietly wrong for as long as the daily placeholder stood, which is the other
reason not to leave that in place.

## Google Analytics was undisclosed (found while enabling the Meta Pixel)

Turning the pixel on surfaced a second tracker the privacy policy never
mentioned: Google Analytics 4 (`G-6587WEMW4K`), hardcoded in `app/layout.tsx`
and running unconditionally on every page. It is not env gated, so unlike the
pixel it has been live the whole time, including through the original carrier
review copy that claimed the site used no tracking cookies.

Added to both the processor list and the cookies section, described the same way
as the pixel: what it sets, what it records, and that no name, email, or phone is
sent to it. The line stating that mobile numbers never reach an advertising
platform was broadened to name Google as well as Meta, so the SMS no-sharing
promise covers both.

Two things worth Sam knowing rather than me deciding:

- GA is hardcoded rather than read from an env var, so it also runs on preview
  deployments and pollutes analytics with non-production traffic. Gating it on
  an env var the way the pixel is gated would fix that.
- Neither tracker has a consent banner. That is defensible for a Utah business
  with a US-only audience, but it would not satisfy GDPR or the newer state
  privacy laws if the audience ever broadens. Worth a lawyer's view alongside
  the rest of the policy.

## Footer signup reduced to email only (September 18, 2026)

Sam asked for the footer to be just an email input: no checkboxes, no phone
field. Done, and the rest of the system was brought in line rather than left
describing a form that no longer exists.

- **There is no email checkbox either, so submitting the form is the consent.**
  That is valid for email (a form labelled as a newsletter signup is itself the
  opt-in), but the consent log cannot quote a checkbox nobody saw. Added
  `FOOTER_EMAIL_CONSENT_TEXT`, which records the form's actual visible label, so
  the log still reflects what was on screen.
- `/api/newsletter` is email only now. It no longer takes a phone number or
  opt-in flags, and no longer rejects a submission for having nothing ticked.
- **SMS opt-in is now two places, not three.** Both legal pages were updated to
  say so, and the privacy policy states explicitly that the footer form collects
  email addresses only and never asks for a mobile number.

**This contradicts the 10DLC campaign registration, which is still pending.**
The opt-in description submitted to TCR names three places including the footer.
A reviewer comparing that description against the live site will now find a
footer with no SMS checkbox. Sam has to update the campaign's opt-in description
to name the waiver and the booking checkout only. Flagged directly rather than
worked around, because there is no code change that resolves it.

Two tests guard the new shape: one fails if the footer regrows a phone input or
the opt-in component, and one fails if the privacy policy stops saying the footer
is email only.

## The Resend webhook never worked, and a cast hid it

Sending a real test email surfaced it: every genuine Resend webhook was crashing
with an empty 500 and recording nothing, while forged ones were correctly
rejected with a 400. From the outside the endpoint looked healthy, which is the
worst shape for a bug to be in.

Cause: `svix`'s `Webhook.verify()` authenticates but does not parse. It throws on
a bad signature and returns `undefined` on a good one. The route treated the
return value as the event, so `event.type` threw on every valid delivery.

TypeScript caught this at the time. The error was
`Conversion of type 'undefined' to type 'ResendEvent' may be a mistake`, and it
was silenced with `as unknown as ResendEvent` rather than investigated. The cast
was the bug; the type checker was right.

Fixed by `resendEventFrom()`, which uses the verified object when a version of
svix returns one and falls back to parsing the raw body otherwise, so it holds
across versions. Four tests cover it, including the unparseable-body case.

Worth generalising: a cast that exists to silence a warning about `undefined` is
worth treating as a bug report rather than a formality.
