# Rockul Ads

Private, single-password internal tool for sending permission-based
advertising emails for up to 5 companies. Each of the 5 slots has its own ad
image, subject line, recipient list, and send schedule (manual / daily /
weekly). Every email includes a working unsubscribe link.

Next.js + Vercel Postgres (Neon) + Vercel Blob (data/images) + Resend
(email) + Vercel Cron (scheduled sends) — everything on one platform, kept
as its own separate project from Cash Comp or anything else.

## One-time setup

1. **Vercel project** — new project, pointed at this repo.

2. **Vercel Postgres** — in the project, go to Storage → Create Database →
   Postgres (Neon). Connecting it sets `DATABASE_URL` automatically. Then
   run `migrations/0001_init.sql` against it — Vercel's Storage tab has a
   Query console you can paste it into.

3. **Vercel Blob** — Storage → Create → Blob. Connecting it sets
   `BLOB_READ_WRITE_TOKEN` automatically.

4. **Domain** — Settings → Domains → add `ads.rockul.com`, then add the
   CNAME record it gives you at Cloudflare (where rockul.com's DNS lives).

5. **Resend** — add `ads.rockul.com` as a new sending domain (same Resend
   account as anything else, or a new one) and add the DNS records it gives
   you (SPF/DKIM/DMARC) at Cloudflare too. Wait for "Verified" before
   sending anything real.

6. **Remaining environment variables** (Settings → Environment Variables,
   Production) — see `.env.local.example` for the full list:
   - `ADMIN_PASSWORD` — whatever password you want to log in with.
   - `SESSION_SECRET`, `CRON_SECRET` — long random strings
     (`openssl rand -hex 32` for each).
   - `RESEND_API_KEY` — from Resend.
   - `EMAIL_FROM_ADDRESS` — e.g. `ads@ads.rockul.com`.
   - `NEXT_PUBLIC_SITE_URL` — `https://ads.rockul.com`.

7. Redeploy after setting everything.

## How the schedule works

Vercel Cron on the free/Hobby plan can only run once a day, so the cron
config in `vercel.json` checks once daily (08:00 UTC) for any campaign whose
`next_send_at` has passed. The "time" you set per-campaign determines which
day a weekly send lands on and roughly when in the day it goes out, but on
Hobby it won't be exact-to-the-minute — upgrade to Vercel Pro if that
precision matters (Pro allows per-minute cron).

## Local development

```bash
npm install
cp .env.local.example .env.local   # fill in real values (pull DATABASE_URL
                                    # and BLOB_READ_WRITE_TOKEN from Vercel
                                    # once those integrations are connected)
npm run dev
```
