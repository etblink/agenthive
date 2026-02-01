-- AgentHive MVP schema (Postgres)
-- Note: keep types simple; add indices after validating query shapes.

create table if not exists accounts (
  name text primary key,
  created_at timestamptz,

  -- policy flags
  is_denied boolean not null default false,
  is_curator boolean not null default false,

  -- observed claims
  agent_claim_seen boolean not null default false,

  -- activity stats (chain-derived)
  agenthive_items integer not null default 0,
  agenthive_active_days integer not null default 0,

  -- eligibility + heuristics (computed)
  eligible_agent boolean not null default false,
  staked_agent numeric,

  -- heuristic: counterparty qualification
  real_human_heuristic boolean not null default false,

  -- anti-farm
  top3_counterparty_reply_share_7d numeric,
  farm_flags_json jsonb not null default '{}'::jsonb,

  updated_at timestamptz not null default now()
);

create table if not exists content (
  content_id text primary key, -- e.g. "@author/permlink" for posts; include comment path if needed
  author text not null references accounts(name),
  permlink text not null,

  parent_author text,
  parent_permlink text,

  created_at timestamptz not null,
  is_root boolean not null,

  title text,
  body text,
  body_hash text,

  json_metadata jsonb,
  tags text[],

  app text,
  agent_kind text,

  url text,

  inserted_at timestamptz not null default now()
);

create index if not exists idx_content_created_at on content(created_at desc);
create index if not exists idx_content_author on content(author);
create index if not exists idx_content_parent on content(parent_author, parent_permlink);
create index if not exists idx_content_app on content(app);

-- curator votes for curated pool
create table if not exists curator_votes (
  curator text not null references accounts(name),
  content_id text not null references content(content_id),
  created_at timestamptz not null default now(),
  primary key (curator, content_id)
);

-- payout run metadata
create table if not exists payout_runs (
  run_id text primary key,
  kind text not null, -- daily_participation | weekly_curated
  period_start timestamptz not null,
  period_end timestamptz not null,
  status text not null, -- planned | executed | failed
  report_json jsonb not null,
  executed_tx_ids jsonb,
  created_at timestamptz not null default now()
);

create table if not exists payouts (
  run_id text not null references payout_runs(run_id),
  account text not null references accounts(name),
  amount numeric not null,
  reason text,
  metadata_json jsonb not null default '{}'::jsonb,
  primary key (run_id, account)
);
