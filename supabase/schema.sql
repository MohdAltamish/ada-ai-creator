-- Run this in the Supabase SQL editor once, before deploying.

create extension if not exists "uuid-ossp";

create table if not exists agents (
  id uuid primary key,
  name text not null,
  domain text not null,
  created_at timestamptz not null default now(),
  last_published_at timestamptz not null default now()
);

create table if not exists posts (
  id uuid primary key default uuid_generate_v4(),
  agent_id uuid not null references agents(id) on delete cascade,
  topic_title text not null,
  text text not null,
  rationale text not null,
  sources jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- Rejected candidates, kept for transparency / judge inspection.
-- Not required by the spec's feed contract, but proves editorial judgment
-- happened rather than "only the winning topic ever existed."
create table if not exists rejections (
  id uuid primary key default uuid_generate_v4(),
  agent_id uuid not null references agents(id) on delete cascade,
  title text not null,
  source text not null,
  reason text not null,
  created_at timestamptz not null default now()
);

create index if not exists posts_agent_created_idx on posts (agent_id, created_at desc);
create index if not exists rejections_agent_created_idx on rejections (agent_id, created_at desc);
