-- Run once in the Supabase SQL editor. Powers Campaign Studio's tracking (A/B variants + held-out control group).
create table if not exists rydra_campaigns (
  id uuid primary key default gen_random_uuid(),
  venue_id text not null,
  name text not null,
  goal text,
  audience jsonb,
  variants jsonb,
  holdout_pct int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists rydra_campaign_members (
  id bigserial primary key,
  campaign_id uuid not null references rydra_campaigns(id) on delete cascade,
  customer_id text not null,
  variant text not null,                 -- 'A' | 'B' | 'C' | 'holdout'
  status text not null default 'planned',-- planned | sent | skipped | holdout
  sent_at timestamptz,
  skip_reason text
);

create index if not exists rydra_campaign_members_campaign_idx on rydra_campaign_members (campaign_id);
alter table rydra_campaigns enable row level security;
alter table rydra_campaign_members enable row level security;
-- No policies on purpose: only the server (service role key) reads and writes these.
