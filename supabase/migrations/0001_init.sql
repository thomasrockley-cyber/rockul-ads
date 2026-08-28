-- Rockul Ads — single-user ad-sending tool
-- Run this in Supabase's SQL Editor on a NEW Supabase project (kept separate
-- from Cash Comp's database on purpose).

create table campaigns (
  id uuid primary key default gen_random_uuid(),
  slot_number int not null unique check (slot_number between 1 and 5),
  company_name text not null default '',
  image_url text,
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

-- No RLS policies needed — this app only ever talks to Supabase via the
-- service-role key from trusted server-side code (single-password-gated),
-- never from the browser directly. RLS stays enabled with no policies as a
-- safety net (default-deny) in case a browser client key ever leaks in.
alter table campaigns enable row level security;
alter table recipients enable row level security;
alter table send_log enable row level security;
