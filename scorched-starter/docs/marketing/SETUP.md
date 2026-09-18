# Marketing setup checklist

Everything here needs a human. The code is built and committed, but nothing has
been applied to a database, no webhooks are registered, and `MARKETING_LIVE` is
off, so nothing can currently reach a real person.

Work top to bottom. Do not turn on `MARKETING_LIVE` until step 10 passes.

---

## 1. Apply the database migration

`supabase-marketing-setup.sql` has **not been run**. The only Supabase
credentials in this repo are production, so applying it locally would have meant
writing to production.

- Open the Supabase SQL editor for the project.
- Paste the whole of `supabase-marketing-setup.sql` and run it.
- It is safe to re-run: every statement is `IF NOT EXISTS` or `CREATE OR REPLACE`.

It creates `subscribers`, `consent_events`, `campaigns`, `sms_queue`,
`sms_messages`, `email_events`, `marketing_worker_locks`, and copies the existing
`newsletter_subscribers` rows into `subscribers`. The old table is left alone.

Check afterwards:

```sql
select count(*) from subscribers;          -- should match newsletter_subscribers
select count(*) from consent_events;       -- one per backfilled row
```

## 2. DNS for the marketing sending subdomain

Marketing mail sends from `news.scorchedstudio.com`, deliberately separate from
`scorchedstudio.com`, so a spam complaint on a campaign cannot damage delivery of
booking confirmations and waiver copies.

- In Resend, add the domain `news.scorchedstudio.com`.
- Add the DNS records Resend gives you at the registrar: the DKIM `TXT`, the SPF
  `TXT`, and the `MX` for the return path.
- Add a DMARC record if `scorchedstudio.com` does not already have one:
  `_dmarc.news.scorchedstudio.com  TXT  "v=DMARC1; p=none; rua=mailto:contact@scorchedstudio.com"`
- Wait for Resend to show the domain as verified. This can take up to an hour.

## 3. Resend dashboard

- Create a segment (Resend renamed audiences to segments) for Scorched Studio
  marketing. Copy its id into `RESEND_AUDIENCE_ID`.
- Add a webhook pointing at `https://scorchedstudio.com/api/webhooks/resend`.
- Subscribe it to at least: `email.sent`, `email.delivered`, `email.opened`,
  `email.clicked`, `email.bounced`, `email.complained`, `email.failed`.
  Bounces and complaints stop future sends; the rest feed the campaign stats.
- Copy the webhook signing secret into `RESEND_WEBHOOK_SECRET`. The route
  rejects every delivery without it.

## 4. Telnyx account and number

Already done, confirmed against the API on 17 September 2026:

- Messaging profile **Main**, id `4001a0b1-a53d-4425-abd7-fab71dd60b65`, webhook already pointed at `https://scorchedstudio.com/api/webhooks/telnyx` with API version 2.
- Number **+1 801 515 5172**, a local Utah long code, active and assigned to that profile.
- API key and public key are in the local `.env`.

Still to do:

- [ ] **Upgrade the account level.** `GET /10dlc/brand` and `GET /10dlc/campaign` both return `10038 Feature not permitted at this account level`. The 10DLC registration in step 5 cannot start until that is lifted, either by upgrading at <https://telnyx.com/upgrade> or by asking Telnyx support to enable messaging campaign registration.
- [ ] Confirm the profile's webhook failover URL is blank or also points at the route, so a retry does not land somewhere unhandled.

## 5. Register the 10DLC brand and campaign

US carriers filter unregistered application-to-person traffic. Until the campaign below is approved, messages from this number are **blocked or silently dropped**, so this is the gating step for going live, not a formality. Approval normally takes a few business days.

### Brand

The legal business name and EIN must match the IRS letter **character for character**, including punctuation and any "LLC" or "Inc". A mismatch is the single most common rejection, and a rejected brand costs a re-vetting fee.

| Field | Value |
| --- | --- |
| Legal company name | exactly as on the IRS EIN letter |
| EIN / Tax ID | exactly as on the IRS EIN letter |
| Entity type | Private company (or whatever the EIN letter says) |
| Country | US |
| Address | the registered business address on file with the IRS |
| Vertical | Retail / Consumer products |
| Website | https://scorchedstudio.com |
| Support email | contact@scorchedstudio.com |
| Support phone | +1 801 361 9066 |

### Campaign

Use case: **Marketing / Low Volume Mixed** if offered, otherwise **Marketing**.

Ready to paste:

**Campaign description**
```
Scorched Studio sends occasional marketing messages to customers who have
explicitly opted in: announcements of new wood burning classes and course
dates, studio events, seasonal offers, and new product releases. Messages are
sent from our Orem, Utah studio to existing and prospective customers who
checked an SMS opt-in box on our website. Frequency is a few messages per
month at most.
```

**Opt-in flow description**
```
Consent is collected on scorchedstudio.com in three places, each an unchecked
checkbox the customer must tick themselves:

1. The digital liability waiver at scorchedstudio.com/waiver, signed in studio
   or before a visit.
2. The booking checkout at scorchedstudio.com/book.
3. The newsletter signup form in the site footer on every page.

The checkbox is never pre-ticked and is never required to complete a booking,
a waiver, or a purchase. The exact wording shown next to the checkbox is:

"Text me about classes, events, and offers from Scorched Studio. Message
frequency varies. Msg and data rates may apply. Reply STOP to opt out, HELP
for help. Consent is not a condition of purchase."

A link to our privacy policy and messaging terms sits next to the checkbox.
Every opt-in is logged with the exact wording shown, the timestamp, the IP
address, and the browser user agent, and that record is retained.
```

**Opt-in message** (confirmation, if asked for one)
```
Scorched Studio: you are subscribed to class updates and offers. Msg frequency
varies. Msg & data rates may apply. Reply HELP for help, STOP to cancel.
```

**Opt-out message**
```
Scorched Studio: you are unsubscribed and will get no further messages. Reply
START to resubscribe.
```

**Help message**
```
Scorched Studio: for help call 801-361-9066 or email
contact@scorchedstudio.com. Msg & data rates may apply. Reply STOP to cancel.
```

**Sample message 1**
```
Scorched Studio here! This is our new number for class updates and offers.
Save it so you don't miss out. Reply STOP to opt out.
```

**Sample message 2**
```
Scorched Studio: our beginner wood burning class on Saturday Oct 11 has 4
spots left. Book at scorchedstudio.com/book. Reply STOP to opt out.
```

**Call-to-action URLs.** TCR requires both of these on the campaign, in the dedicated fields or in the CTA section. They are the only URLs the campaign form asks for:

| Field | Value |
| --- | --- |
| Privacy policy URL | `https://scorchedstudio.com/privacy` |
| Terms and conditions URL | `https://scorchedstudio.com/privacy#sms-terms` |

There is **no messaging webhook field on the campaign form**. Message delivery webhooks are configured on the messaging profile and are already set (step 4). The optional webhook field you may see during registration is for brand and campaign *status* events (approval, rejection, suspension), which is a different thing; leave it blank, or point it at the same route, which acknowledges and ignores event types it does not handle.

Answer yes to: subscriber opt-in, subscriber opt-out, subscriber help.
Answer no to: age-gated content, direct lending, affiliate marketing, embedded links to unknown third parties.

- [ ] Brand submitted and verified
- [ ] Campaign submitted
- [ ] Campaign **approved** (do not send before this)
- [ ] Number +1 801 515 5172 assigned to the approved campaign
- [ ] Note the carrier-assigned throughput and raise `SMS_MAX_PER_MINUTE` to match if it is above 12

## 6. Environment variables

Set these in Vercel (Production, and Preview if you want previews to run the worker in log-only mode). `.env.example` has the full annotated list.

| Variable | Notes |
| --- | --- |
| `TELNYX_API_KEY` | in local `.env` |
| `TELNYX_PUBLIC_KEY` | in local `.env`, base64 of 32 raw bytes |
| `TELNYX_MESSAGING_PROFILE_ID` | `4001a0b1-a53d-4425-abd7-fab71dd60b65` |
| `TELNYX_FROM_NUMBER` | `+18015155172` |
| `SMS_MAX_PER_MINUTE` | default 12, raise after 10DLC approval |
| `SMS_COST_PER_SEGMENT` | default 0.004, planning figure only |
| `SMS_QUIET_HOURS_START` / `_END` | default 20 / 9, America/Denver |
| `RESEND_MARKETING_FROM` | `Scorched Studio <hello@news.scorchedstudio.com>` |
| `RESEND_AUDIENCE_ID` | **still blank**, from step 3. Holds a *segment* id |
| `RESEND_WEBHOOK_SECRET` | **still blank**, from step 3 |
| `CRON_SECRET` | already set for the existing crons |
| `NEXT_PUBLIC_SITE_URL` | must be the real origin, used for unsubscribe links and webhook callbacks |
| `MARKETING_TEST_RECIPIENTS` | your own email and mobile, comma separated. Lets the admin TEST SEND button reach you while everything else stays off |
| `MARKETING_LIVE` | **leave `false` until step 10 passes** |

All four Telnyx variables must be set in Vercel before the first webhook arrives, not just the API key. `TELNYX_PUBLIC_KEY` in particular exists only in the local `.env` right now, and without it in the deployed environment **every webhook 401s**, which looks from the outside like "Telnyx is not sending anything" rather than a missing variable. If inbound texts and delivery receipts both go quiet, check this first.

## 7. Webhooks

Nothing to run: the messaging profile's webhook is already set to `https://scorchedstudio.com/api/webhooks/telnyx`, and Telnyx signs every delivery with the account public key, so there is no per-webhook secret to register.

Confirm after deploying:

```bash
curl -s https://api.telnyx.com/v2/messaging_profiles \
  -H "Authorization: Bearer $TELNYX_API_KEY" | grep webhook_url
```

The route rejects anything whose Ed25519 signature does not verify, and anything stamped more than 5 minutes ago, so a missing or wrong `TELNYX_PUBLIC_KEY` shows up as every webhook 401ing.

## 8. Cron (Supabase pg_cron, not Vercel)

The SMS worker is scheduled from Postgres, not from `vercel.json`. Vercel Hobby
allows only daily cron jobs and rejects the whole deploy if any schedule runs
more often, and the worker needs to run every 5 minutes: one run sends at most
`SMS_MAX_PER_MINUTE` times that interval, so a daily schedule would cap the
system at 60 texts a day. pg_cron has no such limit.

`supabase-sms-cron-setup.sql` has **not been run**. Apply it after
`supabase-marketing-setup.sql`.

- [ ] **Create the two Vault secrets first.** The migration reads them by name
      and raises if they are missing, so do this before scheduling. In the SQL
      editor:

      ```sql
      select vault.create_secret(
        'https://www.scorchedstudio.com/api/cron/sms-worker',
        'sms_worker_url',
        'Endpoint pg_cron calls to drain the marketing SMS queue'
      );

      select vault.create_secret(
        '<the same value as CRON_SECRET in Vercel>',
        'sms_worker_cron_secret',
        'Bearer token for /api/cron/sms-worker; must match CRON_SECRET'
      );
      ```

      The token has to match `CRON_SECRET` in Vercel exactly. If it does not,
      every run returns 401 and the job still reports success, because pg_cron
      only knows whether the SQL ran.

- [ ] **Run `supabase-sms-cron-setup.sql`.** It enables `pg_cron` and `pg_net`,
      creates `public.invoke_sms_worker()`, schedules it every 5 minutes, and
      creates a `sms_worker_cron_health` view. Safe to re-run: it unschedules
      the job before rescheduling, so it cannot end up running twice.

      If the `create extension` lines fail on a permissions error, enable the
      two extensions from the dashboard instead (Database, then Extensions,
      search for `pg_cron` and `pg_net`), then re-run the file. Some projects
      do not allow creating them from the SQL editor.

- [ ] **Confirm it works**, without waiting for the next tick:

      ```sql
      select jobname, schedule, active from cron.job where jobname = 'sms-worker';
      select public.invoke_sms_worker();
      -- a few seconds later:
      select status_code, error_msg from net._http_response order by created desc limit 1;
      ```

      A 200 means the route accepted the call. A 401 means the Vault secret and
      `CRON_SECRET` disagree.

- [ ] **Check it again the next day** with
      `select * from public.sms_worker_cron_health limit 20;`. That view joins
      what pg_cron recorded to what the HTTP call actually returned, which is
      the only way to tell a working schedule from one that fires and 401s.

Nothing needs to change in Vercel. The two remaining crons there, the daily
booking report and the Plaid sync, are unaffected.

To stop the schedule: `select cron.unschedule('sms-worker');`

## 9. Legacy SMS list import

Needs **two** CSV exports from the old service (the "text BURN to (844) 952-0456" list): current subscribers, and the opt-out list. The opt-out export is not optional. Without it, people who left would be imported as subscribed and texted again.

```bash
pnpm tsx scripts/import-legacy-sms.ts --active active.csv --opt-out optout.csv
# review the counts, then:
pnpm tsx scripts/import-legacy-sms.ts --active active.csv --opt-out optout.csv --apply
```

Dry run is the default. Columns are auto-detected; if it cannot find a phone column it prints the headers it actually saw, and you can override with `--phone-col "<header>"` (also `--date-col`, `--status-col`, `--first-name-col`, `--last-name-col`, `--email-col`).

The script writes only to Supabase. Telnyx has no contact list to sync: it accepts any number and maintains its own opt-out list from inbound STOP keywords.

The first campaign to this segment should be the re-introduction the script prints, which fits in one GSM-7 segment. They last heard from a different number, so it has to identify itself before anything else.

## 10. Manual end-to-end check (do this yourself, before any real list)

**This has not been run.** Nothing in this build has sent a real email or text. Do it with your own phone and email while `MARKETING_LIVE=false`, confirm the logs look right, then repeat with `MARKETING_LIVE=true`.

A suppressed run is safe to repeat: it marks nobody as contacted and does not mark an email campaign as sent, so nothing is consumed by practising.

1. **Footer opt-in.** On the live site, scroll to the footer, tick both boxes, enter your email and your mobile, submit.
   - `subscribers`: one row, phone in E.164 (`+1801...`), both statuses `subscribed`.
   - `consent_events`: two rows, source `footer_form`, each carrying the exact checkbox wording and your IP.
2. **Waiver and booking.** Sign a test waiver and start a test booking with the boxes ticked. Confirm both write consent rows with source `waiver` and `booking`, and that neither flow breaks if the marketing write fails.
3. **Test sends.** In `/admin/marketing`, create one email campaign and one SMS campaign. Use TEST SEND to your own address and number.
   - With `MARKETING_LIVE=false`, expect `MARKETING_SUPPRESSED` in the Vercel logs and nothing delivered. Confirm that first.
   - Then set `MARKETING_LIVE=true` and repeat. Confirm both arrive, and that the text comes from **+1 801 515 5172**.
4. **Check the email.** It must show the Orem postal address and a working unsubscribe link. In Gmail, the client's own unsubscribe button should appear next to the sender, which proves the `List-Unsubscribe` headers are right.
5. **Check the composer's numbers.** Type a message with an emoji in it and confirm the counter switches to UCS-2 and the limit drops to 70. Remove the emoji and confirm it goes back to 160. The estimated cost should change with the segment count.
6. **Reply STOP** to the test text.
   - Telnyx sends its own confirmation and adds you to its opt-out list.
   - `subscribers.sms_status` flips to `unsubscribed`.
   - A `consent_events` row appears with source `inbound_keyword`.
   - `sms_messages` has the inbound row.
7. **Try to send to yourself again** while opted out. The queue row must end as `skipped`, not `failed`, and the subscriber must stay `unsubscribed`. This is the Telnyx 40300 path.
8. **Reply START.** Status returns to `subscribed`, with another consent row, and Telnyx removes you from its opt-out list.
9. **Reply with a real question** ("what time do you open?"). It must arrive as an email at contact@scorchedstudio.com rather than being treated as an opt-out.
10. **Click the email unsubscribe link.** Confirmation page appears, `email_status` becomes `unsubscribed`, and a consent row with source `unsubscribe_link` is written. Click it a second time: it should still show the confirmation, not an error.
11. **Send a small real campaign** to a segment of two or three people you know before touching the legacy list.

Only after all eleven pass, and after the 10DLC campaign is approved, should the legacy list be messaged.

---

## Things deliberately not done

- The migration is written but **not applied**.
- Nothing has been sent to anyone. No email, no text.
- The end-to-end checklist above has not been run, on purpose: it sends real messages.
- `MARKETING_LIVE` is `false` everywhere.
- The Telnyx credentials were used only for read-only `GET` calls to confirm the key works and to read the profile and number.

## Where things live

| What | Where |
| --- | --- |
| Migration | `supabase-marketing-setup.sql` |
| Consent recording | `lib/marketing/consent.ts` |
| Checkbox wording | `lib/marketing/consent-copy.ts` |
| Provider selection | `lib/marketing/sms-provider-registry.ts` |
| Telnyx provider | `lib/marketing/telnyx.ts` |
| Telnyx signature check | `lib/marketing/telnyx-webhook.ts` |
| Shared webhook handling | `lib/marketing/sms-inbound.ts` |
| Segment and cost rules | `lib/marketing/sms-segments.ts` |
| Rate limits and the live gate | `lib/marketing/config.ts` |
| Worker logic | `lib/marketing/sms-worker-core.ts` (pure), `sms-worker.ts` (wired) |
| Cron route | `app/api/cron/sms-worker/route.ts`, scheduled by `supabase-sms-cron-setup.sql` |
| Webhooks | `app/api/webhooks/telnyx`, `app/api/webhooks/resend` |
| Unsubscribe | `app/unsubscribe/[token]/route.ts` |
| Admin UI | `app/admin/marketing/page.tsx` |
| Decisions made during the build | `docs/marketing/DECISIONS.md` |
