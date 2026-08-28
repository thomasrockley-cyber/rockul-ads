-- Rockul Ads — single-user ad-sending tool
-- Run this against the Neon Postgres database (Vercel Storage → Postgres).
-- Vercel's dashboard has a SQL query console for the database, or use any
-- Postgres client with the connection string from DATABASE_URL.

create extension if not exists pgcrypto; -- for gen_random_uuid()

create table campaigns (
  id uuid primary key default gen_random_uuid(),
  slot_number int not null unique check (slot_number between 1 and 5),
  company_name text not null default '',
  image_url text,
  link_url text, -- optional "visit website" link included in the email
  subject text not null default '',
  from_name text not null default '',
  schedule_frequency text not null default 'none' check (schedule_frequency in ('none', 'daily', 'weekly')),
  schedule_time time not null default '09:00',
  schedule_day_of_week int check (schedule_day_of_week between 0 and 6), -- 0=Sunday, only used when weekly
  active boolean not null default true,
  last_sent_at timestamptz,
  next_send_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Pre-seed the 5 fixed slots.
insert into campaigns (slot_number) values (1), (2), (3), (4), (5);

create table recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  email text not null,
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (campaign_id, email)
);

create index recipients_campaign_id_idx on recipients(campaign_id);

create table send_log (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  sent_at timestamptz not null default now(),
  recipient_count int not null default 0,
  status text not null check (status in ('sent', 'failed', 'partial')),
  error text
);

create index send_log_campaign_id_idx on send_log(campaign_id);

-- A "send attempt" represents one send operation for a campaign (one manual
-- click, or one scheduled trigger). It's resumable across multiple function
-- invocations — each 60-second Vercel Hobby function call processes as many
-- recipients as it can before its deadline, and a still-in-progress attempt
-- picks up exactly where it left off on the next call (manual sends: the
-- browser re-calls automatically; scheduled sends: the next daily cron tick)
-- rather than either failing silently or risking double-sends on retry.
create table send_attempts (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  status text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index send_attempts_campaign_id_idx on send_attempts(campaign_id);

-- A snapshot of exactly who this attempt is sending to, taken once when the
-- attempt starts — so recipients added mid-send don't get folded into an
-- attempt already in progress, and each row's own sent_at/failed tracks
-- progress precisely enough that a resume never re-emails someone already
-- sent to (barring the rare case of a hard kill mid-chunk; see sendCampaign.ts).
create table send_attempt_recipients (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references send_attempts(id) on delete cascade,
  email text not null,
  sent_at timestamptz,
  failed boolean not null default false,
  unique (attempt_id, email)
);

create index send_attempt_recipients_pending_idx
  on send_attempt_recipients(attempt_id) where sent_at is null and failed = false;
