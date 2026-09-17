# Marketing setup checklist

Everything here needs a human. The code is built and committed, but nothing has
been applied to a database, no webhooks are registered, and `MARKETING_LIVE` is
off, so nothing can currently reach a real person.

Work top to bottom. Do not turn on `MARKETING_LIVE` until step 9 passes.

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

## 4. Sendblue account

- Confirm the account is on the **Blue Ocean** plan. The cheaper plans are
  inbound-only and cannot send marketing at all.
- Note the line's number and put it in `SENDBLUE_FROM_NUMBER` in E.164
  (`+18445550123`). It is required on every single send.
- Confirm the real rate limits Sam negotiated and set `SMS_NEW_CONTACTS_PER_DAY`,
  `SMS_NEW_CONTACTS_PER_HOUR`, `SMS_BURST_PER_SECOND` to match. The defaults are
  the documented Blue Ocean numbers, not a contract.
- Invent a long random string for `SENDBLUE_WEBHOOK_SECRET`.

> **Ask Sendblue about the 150 limit.** Their docs say a line stops delivering
> after **150 consecutive outbound messages with no reply**, and that this cannot
> be disabled. The legacy re-introduction campaign is by definition all cold
> contacts, so it will hit this after 150 messages no matter what the daily cap
> is set to. `SMS_MAX_CONSECUTIVE_NO_REPLY` makes the worker stop and log rather
> than send into a limit that silently drops messages, but no config value can
> raise the real ceiling. This needs resolving with Sendblue before the legacy
> campaign, or that campaign cannot complete.

## 5. Environment variables

Set these in Vercel (Production, and Preview if you want previews to run the
worker in log-only mode). `.env.example` has the full annotated list.

| Variable | Notes |
| --- | --- |
| `SENDBLUE_API_KEY_ID` | already in local `.env` |
| `SENDBLUE_API_SECRET_KEY` | already in local `.env` |
| `SENDBLUE_BASE_URL` | optional, defaults to `https://api.sendblue.com` |
| `SENDBLUE_FROM_NUMBER` | **still blank**, from step 4 |
| `SENDBLUE_WEBHOOK_SECRET` | **still blank**, from step 4 |
| `SMS_NEW_CONTACTS_PER_DAY` | default 50 |
| `SMS_NEW_CONTACTS_PER_HOUR` | default 15 |
| `SMS_BURST_PER_SECOND` | default 10 |
| `SMS_QUEUE_CAP` | default 1500 |
| `SMS_MAX_CONSECUTIVE_NO_REPLY` | default 150, see the warning above |
| `SMS_QUIET_HOURS_START` / `_END` | default 20 / 9, America/Denver |
| `RESEND_MARKETING_FROM` | `Scorched Studio <hello@news.scorchedstudio.com>` |
| `RESEND_AUDIENCE_ID` | **still blank**, from step 3. Holds a *segment* id |
| `RESEND_WEBHOOK_SECRET` | **still blank**, from step 3. Beyond the original spec, needed to verify Resend's Svix signature |
| `CRON_SECRET` | already set for the existing crons |
| `NEXT_PUBLIC_SITE_URL` | must be the real origin, used for unsubscribe links and webhook callbacks |
| `MARKETING_LIVE` | **leave `false` until step 9 passes** |

## 6. Register the Sendblue webhooks

Deploy first, so the URL exists. Then, with the env vars above loaded:

```bash
pnpm tsx scripts/register-sendblue-webhooks.ts            # dry run, shows what it would do
pnpm tsx scripts/register-sendblue-webhooks.ts --apply    # actually registers
```

It registers `receive` and `outbound` pointing at
`https://scorchedstudio.com/api/webhooks/sendblue`, and is idempotent, so it is
safe to re-run. It refuses to run against a localhost URL, since Sendblue cannot
reach one.

Verify:

```bash
curl -s https://api.sendblue.com/api/account/webhooks \
  -H "sb-api-key-id: $SENDBLUE_API_KEY_ID" \
  -H "sb-api-secret-key: $SENDBLUE_API_SECRET_KEY"
```

## 7. Cron

`vercel.json` now has `/api/cron/sms-worker` on `*/5 * * * *`.

> **Vercel plan check.** Sub-daily cron schedules need a paid plan. On Hobby,
> crons run at most once a day and this schedule will be rejected or silently
> downgraded at deploy. Confirm the project's plan allows `*/5`. If it does not,
> either upgrade or point an external scheduler at the route with the
> `Authorization: Bearer $CRON_SECRET` header.

## 8. Legacy SMS list import

Needs **two** CSV exports from the old service (the "text BURN to (844) 952-0456"
list): current subscribers, and the opt-out list. The opt-out export is not
optional. Without it, people who left would be imported as subscribed and texted
again.

```bash
pnpm tsx scripts/import-legacy-sms.ts --active active.csv --opt-out optout.csv
# review the counts, then:
pnpm tsx scripts/import-legacy-sms.ts --active active.csv --opt-out optout.csv --apply
```

Dry run is the default. Columns are auto-detected; if it cannot find a phone
column it prints the headers it actually saw, and you can override with
`--phone-col "<header>"` (also `--date-col`, `--status-col`, `--first-name-col`,
`--last-name-col`, `--email-col`).

Everyone imported counts as a new contact, so the re-introduction campaign will
drip at the daily cap. At 50 a day, a list of 2,000 takes 40 days. The admin
campaign page shows this estimate before you send.

## 9. Manual end-to-end check (do this yourself, before any real list)

**This has not been run.** Nothing in this build has sent a real email or text.
Do this with your own phone and email while `MARKETING_LIVE=false`, confirm the
logs look right, then repeat with `MARKETING_LIVE=true`.

1. **Footer opt-in.** Go to the live site, scroll to the footer, tick both boxes,
   enter your email and your mobile, submit.
   - Check `subscribers`: one row, your email and phone in E.164, both statuses
     `subscribed`.
   - Check `consent_events`: two rows, source `footer_form`, each carrying the
     exact checkbox wording and your IP.
2. **Waiver and booking.** Sign a test waiver and start a test booking with the
   boxes ticked. Confirm both write consent rows with source `waiver` and
   `booking`, and that neither flow breaks if the marketing write fails.
3. **Test sends.** In `/admin/marketing`, create one email campaign and one SMS
   campaign. Use TEST SEND to your own address and number.
   - With `MARKETING_LIVE=false`, expect `MARKETING_SUPPRESSED` in the Vercel
     logs and nothing delivered. Confirm that first.
   - Then set `MARKETING_LIVE=true` and repeat. Confirm both arrive.
4. **Check the email.** It must show the Orem postal address and a working
   unsubscribe link. In Gmail, the client's own unsubscribe button should appear
   next to the sender, which proves the `List-Unsubscribe` headers are right.
5. **Reply STOP** to the test text.
   - `subscribers.sms_status` flips to `unsubscribed`.
   - A `consent_events` row appears with source `inbound_keyword`.
   - `sms_messages` has the inbound row.
6. **Reply START.** Status returns to `subscribed`, with another consent row.
7. **Reply with a real question** ("what time do you open?"). It must arrive as
   an email at contact@scorchedstudio.com rather than being treated as an opt-out.
8. **Click the email unsubscribe link.** Confirmation page appears,
   `email_status` becomes `unsubscribed`, and a consent row with source
   `unsubscribe_link` is written. Click it a second time: it should still show the
   confirmation, not an error.
9. **Send a small real campaign** to a segment of two or three people you know
   before touching the legacy list.

Only after all nine pass should the legacy list be messaged.

---

## Things deliberately not done

- The migration is written but **not applied**.
- No webhooks are registered.
- Nothing has been sent to anyone. No email, no text.
- The end-to-end checklist above has not been run, on purpose: it sends real
  messages.
- `MARKETING_LIVE` is `false` everywhere.

## Where things live

| What | Where |
| --- | --- |
| Migration | `supabase-marketing-setup.sql` |
| Consent recording | `lib/marketing/consent.ts` |
| Checkbox wording | `lib/marketing/consent-copy.ts` |
| Rate limits and the live gate | `lib/marketing/config.ts` |
| SMS provider interface | `lib/marketing/sms-provider.ts`, Sendblue in `sendblue.ts` |
| Worker logic | `lib/marketing/sms-worker-core.ts` (pure), `sms-worker.ts` (wired) |
| Cron route | `app/api/cron/sms-worker/route.ts` |
| Webhooks | `app/api/webhooks/sendblue`, `app/api/webhooks/resend` |
| Unsubscribe | `app/unsubscribe/[token]/route.ts` |
| Admin UI | `app/admin/marketing/page.tsx` |
| Decisions made during the build | `docs/marketing/DECISIONS.md` |
