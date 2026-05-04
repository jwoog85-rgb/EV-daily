-- Run this in Supabase SQL Editor (Project → SQL Editor → New query)

create table if not exists news (
  id bigserial primary key,
  country text not null check (country in ('korea', 'japan', 'us')),
  title text not null,
  summary text,
  category text,
  source text,
  source_url text unique not null,
  pub_date timestamptz,
  original_title text,
  created_at timestamptz default now()
);

create index if not exists news_country_pubdate_idx
  on news (country, pub_date desc);

-- Row Level Security: anyone can read, only service_role can write
alter table news enable row level security;

drop policy if exists "public read" on news;
create policy "public read" on news for select using (true);

-- Optional: clean up news older than 30 days (run weekly)
-- delete from news where pub_date < now() - interval '30 days';
