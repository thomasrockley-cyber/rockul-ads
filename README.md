# Rockul Ads

Private, single-password internal tool for sending permission-based
advertising emails for up to 5 companies. Each of the 5 slots has its own ad
image, subject line, recipient list, and send schedule (manual / daily /
weekly). Every email includes a working unsubscribe link.

Next.js + Supabase (data) + Resend (email) + Vercel (hosting + cron),
matching the stack used for Cash Comp — kept as a fully separate project
and database on purpose.

## One-time setup

1. **Supabase** — create a new project (separate from any other project).
   Run `supabase/migrations/0001_init.sql` in its SQL Editor. Then create a
   **public** storage bucket named `ad-images` (Storage → New bucket →
   check "Public bucket").

2. **Resend** — in the same Resend account as anything else, or a new one,
   add `ads.rockul.com` as a new sending domain and add the DNS records it
   gives you (SPF/DKIM/DMARC) at your DNS provider (Cloudflare, for
   rockul.com). Wait for it to show "Verified" before sending anything real.

3. **Vercel** — new project, pointed at this repo. Add the domain
   `ads.rockul.com` under Settings → Domains, then add the CNAME record it
   gives you at Cloudflare (same place as the Resend DNS records).

4. **Environment variables** (Vercel → Settings → Environment Variables,
   Production) — see `.env.local.example` for the full list:
   - `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — from the new
     Supabase project's Settings → API.
   - `ADMIN_PASSWORD` — whatever password you want to log in with.
   - `SESSION_SECRET`, `CRON_SECRET` — long random strings
     (`openssl rand -hex 32` for each).
   - `RESEND_API_KEY` — from Resend.
   - `EMAIL_FROM_ADDRESS` — e.g. `ads@ads.rockul.com`.
   - `NEXT_PUBLIC_SITE_URL` — `https://ads.rockul.com`.

5. Redeploy after setting the env vars.

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
cp .env.local.example .env.local   # fill in real values
npm run dev
```
